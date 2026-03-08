import { getDbPool } from '../../utils/db'
import { resolveWorkflowUserId } from '../../utils/workflow-auth'

type WorkflowStepInput = {
  step_order?: number
  instruction?: string
  is_enabled?: boolean
}

type WorkflowCreateBody = {
  userId?: string
  title?: string
  topic?: string
  sourcePrompt?: string
  status?: 'draft' | 'active' | 'archived'
  steps?: WorkflowStepInput[]
  builderUsage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cachedTokens?: number
  }
  llmMeta?: {
    model?: string
    providerResponseId?: string
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<WorkflowCreateBody>(event)
  const userId = await resolveWorkflowUserId(event, body?.userId)
  const title = String(body?.title || '').trim()
  const topic = String(body?.topic || '').trim()
  const sourcePrompt = typeof body?.sourcePrompt === 'string' ? body.sourcePrompt : null
  const status = body?.status || 'active'
  const steps = Array.isArray(body?.steps) ? body.steps : []
  const builderUsage = body?.builderUsage
  const llmMeta = body?.llmMeta

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Field "title" wajib diisi.' })
  }

  if (!topic) {
    throw createError({ statusCode: 400, statusMessage: 'Field "topic" wajib diisi.' })
  }

  const normalizedSteps = normalizeSteps(steps)
  const pool = getDbPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const workflowRes = await client.query(
      `
      INSERT INTO public.workflows (user_id, title, topic, source_prompt, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, title, topic, status, source_prompt, version, created_at, updated_at
      `,
      [userId, title, topic, sourcePrompt, status]
    )

    const workflow = workflowRes.rows[0]
    const insertedSteps: any[] = []

    for (const step of normalizedSteps) {
      const stepRes = await client.query(
        `
        INSERT INTO public.workflow_steps (workflow_id, step_order, instruction, is_enabled)
        VALUES ($1, $2, $3, $4)
        RETURNING id, workflow_id, step_order, instruction, is_enabled, created_at, updated_at
        `,
        [workflow.id, step.step_order, step.instruction, step.is_enabled]
      )
      insertedSteps.push(stepRes.rows[0])
    }

    if (builderUsage) {
      await client.query(
        `
        INSERT INTO public.llm_token_consumptions (
          user_id,
          workflow_id,
          source,
          model,
          provider_response_id,
          input_tokens,
          output_tokens,
          total_tokens,
          cached_tokens,
          metadata
        )
        VALUES ($1, $2, 'workflow_builder', $3, $4, $5, $6, $7, $8, $9::jsonb)
        `,
        [
          userId,
          workflow.id,
          String(llmMeta?.model || ''),
          String(llmMeta?.providerResponseId || ''),
          Number(builderUsage.inputTokens || 0),
          Number(builderUsage.outputTokens || 0),
          Number(builderUsage.totalTokens || 0),
          Number(builderUsage.cachedTokens || 0),
          JSON.stringify({
            status,
            sourcePromptLength: sourcePrompt?.length || 0
          })
        ]
      )
    }

    await client.query('COMMIT')

    return {
      workflow,
      steps: insertedSteps.sort((a, b) => a.step_order - b.step_order)
    }
  } catch (error: any) {
    await client.query('ROLLBACK')
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Gagal membuat workflow.'
    })
  } finally {
    client.release()
  }
})

function normalizeSteps(steps: WorkflowStepInput[]) {
  if (steps.length === 0) {
    return []
  }

  return steps
    .map((step, index) => {
      const instruction = String(step?.instruction || '').trim()
      if (!instruction) {
        return null
      }

      const order = Number(step?.step_order)
      return {
        step_order: Number.isFinite(order) && order > 0 ? order : index + 1,
        instruction,
        is_enabled: step?.is_enabled ?? true
      }
    })
    .filter(Boolean) as Array<{ step_order: number; instruction: string; is_enabled: boolean }>
}
