import { getDbPool } from '../utils/db'
import { resolveWorkflowUserId } from '../utils/workflow-auth'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openaiApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OPENAI_API_KEY belum diset di environment variable.'
    })
  }

  const body = await readBody<{
    userId?: string
    workflowId?: string
    workflowStepId?: string
    topic?: string
    step?: string
    index?: number
    previousOutputs?: string[]
  }>(event)
  const workflowId = String(body?.workflowId || '').trim() || null
  const workflowStepId = String(body?.workflowStepId || '').trim() || null
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

  const userId = await resolveWorkflowUserId(event, body?.userId)

  if (workflowId) {
    const pool = getDbPool()
    const ownershipRes = await pool.query(
      `
      SELECT id
      FROM public.workflows
      WHERE id = $1 AND user_id = $2
      LIMIT 1
      `,
      [workflowId, userId]
    )

    if (ownershipRes.rowCount === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Workflow tidak ditemukan.' })
    }
  }

  const safeIndex = Number.isFinite(index) && index > 0 ? index : 1

  try {
    const result = await executeStep(config, topic, step, safeIndex, previousOutputs)

    await persistExecutionLog({
      userId,
      workflowId,
      workflowStepId,
      stepIndex: safeIndex,
      stepInstruction: step,
      previousOutputs,
      output: result.output,
      usage: result.usage,
      llmMeta: result.llmMeta
    })

    return {
      index: safeIndex,
      step,
      output: result.output,
      usage: result.usage
    }
  } catch (error: any) {
    await persistExecutionError({
      workflowId,
      workflowStepId,
      stepIndex: safeIndex,
      stepInstruction: step,
      previousOutputs,
      errorMessage: error?.statusMessage || error?.message || 'Eksekusi step gagal.'
    })
    throw error
  }
})

async function executeStep(
  config: any,
  topic: string,
  stepText: string,
  stepIndex: number,
  previousOutputs: string[]
): Promise<{
  output: string
  usage: ReturnType<typeof normalizeUsage>
  llmMeta: { model: string; providerResponseId: string }
}> {
  const timezone = String(config.appTimezone || 'Asia/Jakarta')
  const timeContext = buildTimeContext(timezone)
  const hasPreviousOutputs = previousOutputs.length > 0
  const previousContext = hasPreviousOutputs
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

  return {
    output,
    usage: normalizeUsage(response?.usage),
    llmMeta: {
      model: String(response?.model || ''),
      providerResponseId: String(response?.id || '')
    }
  }
}

async function persistExecutionLog(params: {
  userId: string
  workflowId: string | null
  workflowStepId: string | null
  stepIndex: number
  stepInstruction: string
  previousOutputs: string[]
  output: string
  usage: ReturnType<typeof normalizeUsage>
  llmMeta: { model: string; providerResponseId: string }
}) {
  if (!params.workflowId) {
    return
  }

  const pool = getDbPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const executionRes = await client.query(
      `
      INSERT INTO public.workflow_step_executions (
        workflow_id,
        workflow_step_id,
        step_order,
        step_instruction,
        input_context,
        output_text,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'success')
      RETURNING id
      `,
      [
        params.workflowId,
        params.workflowStepId,
        params.stepIndex,
        params.stepInstruction,
        params.previousOutputs.join('\n'),
        params.output
      ]
    )

    await client.query(
      `
      INSERT INTO public.llm_token_consumptions (
        user_id,
        workflow_id,
        workflow_step_id,
        workflow_execution_id,
        source,
        model,
        provider_response_id,
        input_tokens,
        output_tokens,
        total_tokens,
        cached_tokens,
        metadata
      )
      VALUES ($1, $2, $3, $4, 'workflow_execute_step', $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
        params.userId,
        params.workflowId,
        params.workflowStepId,
        executionRes.rows[0].id,
        params.llmMeta.model,
        params.llmMeta.providerResponseId,
        params.usage.inputTokens,
        params.usage.outputTokens,
        params.usage.totalTokens,
        params.usage.cachedTokens,
        JSON.stringify({
          stepOrder: params.stepIndex,
          previousOutputsCount: params.previousOutputs.length
        })
      ]
    )

    await client.query('COMMIT')
  } catch {
    await client.query('ROLLBACK')
  } finally {
    client.release()
  }
}

async function persistExecutionError(params: {
  workflowId: string | null
  workflowStepId: string | null
  stepIndex: number
  stepInstruction: string
  previousOutputs: string[]
  errorMessage: string
}) {
  if (!params.workflowId) {
    return
  }

  const pool = getDbPool()
  try {
    await pool.query(
      `
      INSERT INTO public.workflow_step_executions (
        workflow_id,
        workflow_step_id,
        step_order,
        step_instruction,
        input_context,
        status,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, 'error', $6)
      `,
      [
        params.workflowId,
        params.workflowStepId,
        params.stepIndex,
        params.stepInstruction,
        params.previousOutputs.join('\n'),
        params.errorMessage
      ]
    )
  } catch {
    // Ignore logging failures to keep API response stable.
  }
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
