export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openaiApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OPENAI_API_KEY belum diset di environment variable.'
    })
  }

  const body = await readBody<{ topic?: string; step?: string; index?: number; previousOutputs?: string[] }>(
    event
  )
  const topic = String(body?.topic || '').trim()
  const step = String(body?.step || '').trim()
  const index = Number(body?.index)
  const previousOutputs = Array.isArray(body?.previousOutputs)
    ? body.previousOutputs.map((item) => String(item || '').trim()).filter(Boolean)
    : []

  if (!topic) {
    throw createError({ statusCode: 400, statusMessage: 'Field "topic" wajib diisi.' })
  }

  if (!step) {
    throw createError({ statusCode: 400, statusMessage: 'Field "step" wajib diisi.' })
  }

  const safeIndex = Number.isFinite(index) && index > 0 ? index : 1
  const output = await executeStep(config, topic, step, safeIndex, previousOutputs)

  return {
    index: safeIndex,
    step,
    output
  }
})

async function executeStep(
  config: any,
  topic: string,
  stepText: string,
  stepIndex: number,
  previousOutputs: string[]
): Promise<string> {
  const timezone = String(config.appTimezone || 'Asia/Jakarta')
  const timeContext = buildTimeContext(timezone)
  const hasPreviousOutputs = previousOutputs.length > 0
  const previousContext =
    hasPreviousOutputs
      ? `Previous step outputs:\n${previousOutputs.map((item, i) => `${i + 1}. ${item}`).join('\n')}`
      : 'Previous step outputs: (none)'
  const sourcePolicy = hasPreviousOutputs
    ? [
        'Source policy:',
        '- Use ONLY information from Previous step outputs.',
        '- Do not add external facts, assumptions, or new data.',
        '- If required info is missing in previous outputs, state exactly what is missing.'
      ].join('\n')
    : [
        'Source policy:',
        '- No previous outputs are available.',
        '- You may use reasoning and general/public knowledge to complete this step.',
        '- Clearly separate facts vs assumptions when needed.'
      ].join('\n')

  const executionInput = [
    timeContext,
    `Topic: ${topic}`,
    `Current Step (${stepIndex}): ${stepText}`,
    previousContext,
    sourcePolicy,
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
            'Interpret relative dates using the provided general time context.',
            'Follow the source policy strictly.',
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
      statusMessage: `OpenAI tidak mengembalikan output untuk step ke-${stepIndex}.`
    })
  }

  return output
}

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

function buildTimeContext(timezone: string): string {
  const now = new Date()
  const today = toYmd(now, timezone)
  const tomorrow = toYmd(addDays(now, 1), timezone)
  const yesterday = toYmd(addDays(now, -1), timezone)
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(now)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: timezone
  }).format(now)

  return [
    `General time context (timezone: ${timezone}):`,
    `- now: ${today} ${time} (${weekday})`,
    `- today: ${today}`,
    `- tomorrow: ${tomorrow}`,
    `- yesterday: ${yesterday}`,
    '- interpret relative date words (today/tomorrow/yesterday or hari ini/besok/kemarin) using this context.'
  ].join('\n')
}

function toYmd(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone
  }).format(date)
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}
