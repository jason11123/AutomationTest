export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openaiApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OPENAI_API_KEY belum diset di environment variable.'
    })
  }

  const body = await readBody<{ topic?: string; step?: string[] }>(event)
  const topic = String(body?.topic || '').trim()
  const steps = Array.isArray(body?.step)
    ? body.step.map((item) => String(item || '').trim()).filter(Boolean)
    : []

  if (!topic) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Field "topic" wajib diisi.'
    })
  }

  if (steps.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Field "step" wajib berupa array dan tidak boleh kosong.'
    })
  }

  const logs: Array<{
    index: number
    step: string
    input: string
    output: string
  }> = []

  for (let i = 0; i < steps.length; i += 1) {
    const stepText = steps[i]
    const previousOutputs = logs
      .map((item) => `Step ${item.index}: ${item.output}`)
      .join('\n')
      .trim()

    const executionInput = [
      `Topic: ${topic}`,
      `Current Step (${i + 1}/${steps.length}): ${stepText}`,
      previousOutputs ? `Previous Outputs:\n${previousOutputs}` : 'Previous Outputs: (none)',
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

    logs.push({
      index: i + 1,
      step: stepText,
      input: executionInput,
      output
    })
  }

  return {
    topic,
    logs
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
