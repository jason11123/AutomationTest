export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openaiApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OPENAI_API_KEY belum diset di environment variable.'
    })
  }

  const body = await readBody<{ prompt?: string }>(event)
  const prompt = body?.prompt?.trim()

  if (!prompt) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Field "prompt" wajib diisi.'
    })
  }

  const temperature = Number(config.openaiTemperature)
  const maxOutputTokens = Number(config.openaiMaxOutputTokens)

  const response = await $fetch<any>(`${config.openaiBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: {
      model: config.openaiModel,
      temperature: Number.isFinite(temperature) ? temperature : 0.7,
      max_output_tokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : 512,
      input: [
        {
          role: 'system',
          content : `
            Analyze the user’s input and determine one main topic that represents the overall request.
            Generate a simple step-by-step workflow based on that input.
            Return the result strictly in this JSON format:
            {
              "topic": "string",
              "step": ["step 1", "step 2", "step 3"]
            }
            Rules:
            - The topic must summarize the user's request.
            - The step field must be an ordered array of concise workflow steps.
            - Keep steps clear, practical, and actionable.
            - If information is missing, make reasonable assumptions.
            - Do not output anything outside the JSON object.`
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    }
  })

  const text = extractOutputText(response)

  if (!text) {
    throw createError({
      statusCode: 502,
      statusMessage: 'OpenAI tidak mengembalikan output text.'
    })
  }

  const workflow = parseWorkflow(text)

  return {
    topic: workflow.topic,
    step: workflow.step,
    output: text,
    meta: {
      id: response.id,
      model: response.model,
      usage: response.usage
    }
  }
})

function parseWorkflow(rawText: string): { topic: string; step: string[] } {
  const cleaned = rawText.trim()
  const candidate = extractFirstJsonObject(cleaned) || cleaned

  try {
    const parsed = JSON.parse(candidate)
    const topic = String(parsed?.topic || '').trim()
    const step = Array.isArray(parsed?.step)
      ? parsed.step.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : []

    if (topic && step.length > 0) {
      return { topic, step }
    }
  } catch {}

  throw createError({
    statusCode: 502,
    statusMessage: 'Format output workflow tidak valid. Harus JSON dengan topic dan step[].'
  })
}

function extractFirstJsonObject(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    return ''
  }

  return text.slice(start, end + 1)
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
