export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const timeContext = buildTimeContext(String(config.appTimezone || 'Asia/Jakarta'))

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
          content: `
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
            - Steps must describe only the procedure, do not repeat or mention the topic text.
            - If information is missing, make reasonable assumptions.
            - Do not output anything outside the JSON object.`
        },
        {
          role: 'user',
          content: `${timeContext}\n\nUser request:\n${prompt}`
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
      usage: normalizeUsage(response?.usage)
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
      return { topic, step: sanitizeSteps(topic, step) }
    }
  } catch {}

  throw createError({
    statusCode: 502,
    statusMessage: 'Format output workflow tidak valid. Harus JSON dengan topic dan step[].'
  })
}

function sanitizeSteps(topic: string, steps: string[]): string[] {
  const escapedTopic = escapeRegex(topic)
  const topicRegex = escapedTopic ? new RegExp(escapedTopic, 'ig') : null

  return steps.map((rawStep) => {
    let value = rawStep

    if (topicRegex) {
      value = value.replace(topicRegex, '').trim()
      value = value.replace(/\s{2,}/g, ' ').trim()
      value = value.replace(/^[,.:;\-\s]+/, '').trim()
    }

    value = stripTopicClause(value, topic)
    value = value.replace(/\s{2,}/g, ' ').trim()
    value = value.replace(/\s+([,.:;!?])/g, '$1')
    value = value.replace(/^[,.:;\-\s]+/, '').trim()

    return value || rawStep
  })
}

function stripTopicClause(step: string, topic: string): string {
  let current = step
  const lowerStep = current.toLowerCase()
  const topicTokens = extractTopicTokens(topic)
  if (topicTokens.length === 0) {
    return current
  }

  const anchor = topicTokens.find((token) => lowerStep.includes(token))
  if (!anchor) {
    return current
  }

  const anchorIndex = lowerStep.indexOf(anchor)
  if (anchorIndex === -1) {
    return current
  }

  const leadingMarkers = [
    ' on ',
    ' about ',
    ' regarding ',
    ' related to ',
    ' focused on ',
    ' concerning ',
    ' about the ',
    ' regarding the ',
    ' tentang ',
    ' mengenai ',
    ' terkait '
  ]
  const trailingMarkers = [
    ' from ',
    ' for ',
    ' to ',
    ' with ',
    ' using ',
    ' via ',
    ' through ',
    ' untuk ',
    ' dengan '
  ]

  let start = anchorIndex
  const lowerCurrent = current.toLowerCase()

  for (const marker of leadingMarkers) {
    const idx = lowerCurrent.lastIndexOf(marker, anchorIndex)
    if (idx !== -1 && anchorIndex - idx <= 100) {
      start = idx
      break
    }
  }

  let end = current.length
  for (const marker of trailingMarkers) {
    const idx = lowerCurrent.indexOf(marker, anchorIndex + anchor.length)
    if (idx !== -1 && idx < end) {
      end = idx
    }
  }

  current = `${current.slice(0, start)}${current.slice(end)}`
  return current.trim()
}

function extractTopicTokens(topic: string): string[] {
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'of',
    'in',
    'on',
    'for',
    'to',
    'with',
    'current',
    'state',
    'overview',
    'analysis',
    'topic',
    'dan',
    'atau',
    'di',
    'ke',
    'dari',
    'untuk',
    'dengan',
    'tentang',
    'mengenai'
  ])

  const tokens = topic
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stopwords.has(token))

  return Array.from(new Set(tokens))
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function normalizeUsage(usage: any) {
  const inputTokens = Number(usage?.input_tokens || 0)
  const outputTokens = Number(usage?.output_tokens || 0)
  const totalTokens = Number(usage?.total_tokens || inputTokens + outputTokens)
  const cachedTokens = Number(usage?.input_tokens_details?.cached_tokens || 0)

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens
  }
}
