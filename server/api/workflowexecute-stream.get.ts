export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openaiApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OPENAI_API_KEY belum diset di environment variable.'
    })
  }

  const query = getQuery(event)
  const topic = String(query.topic || '').trim()
  const rawSteps = String(query.steps || '').trim()

  let steps: string[] = []

  try {
    const parsed = JSON.parse(rawSteps)
    steps = Array.isArray(parsed)
      ? parsed.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : []
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query "steps" harus berupa JSON array string.'
    })
  }

  if (!topic) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query "topic" wajib diisi.'
    })
  }

  if (steps.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Query "steps" tidak boleh kosong.'
    })
  }

  const res = event.node.res
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  let closed = false
  event.node.req.on('close', () => {
    closed = true
  })

  const sendEvent = (name: string, payload: unknown) => {
    if (closed || res.writableEnded) {
      return
    }

    res.write(`event: ${name}\n`)
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  sendEvent('stage', { message: 'Menjalankan workflow step-by-step...' })

  const logs: Array<{ index: number; step: string; output: string }> = []

  try {
    for (let i = 0; i < steps.length; i += 1) {
      if (closed || res.writableEnded) {
        break
      }

      const stepText = steps[i]
      sendEvent('stage', { message: `Menjalankan step ${i + 1}/${steps.length}...` })

      const executionInput = [
        `Topic: ${topic}`,
        `Current Step (${i + 1}/${steps.length}): ${stepText}`,
        'Instruction: Execute only the current step and produce concrete output.'
      ].join('\n\n')

      const response = await callOpenAI(config, [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'You are executing a workflow step by step.',
                'Always keep the topic context in your answer.',
                'Return plain text only for the current step result.'
              ].join('\n')
            }
          ]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: executionInput }]
        }
      ])

      const output = extractOutputText(response)

      if (!output) {
        throw createError({
          statusCode: 502,
          statusMessage: `OpenAI tidak mengembalikan output untuk step ke-${i + 1}.`
        })
      }

      const log = {
        index: i + 1,
        step: stepText,
        output
      }

      logs.push(log)
      sendEvent('step', log)
    }

    sendEvent('done', {
      message: 'Selesai.',
      topic,
      totalSteps: logs.length
    })
  } catch (error: any) {
    sendEvent('execution_error', {
      message: error?.statusMessage || error?.message || 'Terjadi error saat eksekusi workflow.'
    })
  } finally {
    if (!res.writableEnded) {
      res.end()
    }
  }
})

async function callOpenAI(config: any, input: any[]) {
  const temperature = Number(config.openaiTemperature)
  const maxOutputTokens = Number(config.openaiMaxOutputTokens)

  return await $fetch<any>(`${config.openaiBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: {
      model: config.openaiModel,
      temperature: Number.isFinite(temperature) ? temperature : 0.7,
      max_output_tokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : 512,
      input
    }
  })
}

function extractOutputText(response: any): string {
  if (typeof response?.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text.trim()
  }

  const chunks: string[] = []

  for (const item of response?.output || []) {
    if (!Array.isArray(item?.content)) {
      continue
    }

    for (const content of item.content) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') {
        chunks.push(content.text)
      }
    }
  }

  return chunks.join('\n').trim()
}
