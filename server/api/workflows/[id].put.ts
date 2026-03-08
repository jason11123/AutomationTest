import { getDbPool } from '../../utils/db'
import { resolveWorkflowUserId } from '../../utils/workflow-auth'

type WorkflowStepInput = {
  step_order?: number
  instruction?: string
  is_enabled?: boolean
}

type WorkflowUpdateBody = {
  userId?: string
  title?: string
  topic?: string
  sourcePrompt?: string | null
  status?: 'draft' | 'active' | 'archived'
  steps?: WorkflowStepInput[]
}

export default defineEventHandler(async (event) => {
  const workflowId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<WorkflowUpdateBody>(event)
  const userId = await resolveWorkflowUserId(event, body?.userId)

  if (!workflowId) {
    throw createError({ statusCode: 400, statusMessage: 'Workflow id tidak valid.' })
  }

  const hasTitle = typeof body?.title === 'string'
  const hasTopic = typeof body?.topic === 'string'
  const hasStatus = typeof body?.status === 'string'
  const hasSourcePrompt = Object.prototype.hasOwnProperty.call(body || {}, 'sourcePrompt')
  const hasSteps = Array.isArray(body?.steps)

  if (!hasTitle && !hasTopic && !hasStatus && !hasSourcePrompt && !hasSteps) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Tidak ada field yang diupdate. Isi salah satu: title/topic/status/sourcePrompt/steps.'
    })
  }

  const pool = getDbPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const existingRes = await client.query(
      `
      SELECT id
      FROM public.workflows
      WHERE id = $1 AND user_id = $2
      LIMIT 1
      `,
      [workflowId, userId]
    )

    if (existingRes.rowCount === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Workflow tidak ditemukan.' })
    }

    if (hasTitle || hasTopic || hasStatus || hasSourcePrompt) {
      const title = hasTitle ? String(body?.title || '').trim() : null
      const topic = hasTopic ? String(body?.topic || '').trim() : null

      if (hasTitle && !title) {
        throw createError({ statusCode: 400, statusMessage: 'Field "title" tidak boleh kosong.' })
      }

      if (hasTopic && !topic) {
        throw createError({ statusCode: 400, statusMessage: 'Field "topic" tidak boleh kosong.' })
      }

      await client.query(
        `
        UPDATE public.workflows
        SET
          title = COALESCE($1, title),
          topic = COALESCE($2, topic),
          status = COALESCE($3, status),
          source_prompt = CASE
            WHEN $4::boolean THEN $5
            ELSE source_prompt
          END,
          version = version + 1,
          updated_at = now()
        WHERE id = $6 AND user_id = $7
        `,
        [
          hasTitle ? title : null,
          hasTopic ? topic : null,
          hasStatus ? body?.status : null,
          hasSourcePrompt,
          hasSourcePrompt ? body?.sourcePrompt ?? null : null,
          workflowId,
          userId
        ]
      )
    }

    if (hasSteps) {
      const normalizedSteps = normalizeSteps(body!.steps || [])
      await client.query('DELETE FROM public.workflow_steps WHERE workflow_id = $1', [workflowId])

      for (const step of normalizedSteps) {
        await client.query(
          `
          INSERT INTO public.workflow_steps (workflow_id, step_order, instruction, is_enabled)
          VALUES ($1, $2, $3, $4)
          `,
          [workflowId, step.step_order, step.instruction, step.is_enabled]
        )
      }
    }

    const workflowRes = await client.query(
      `
      SELECT id, user_id, title, topic, status, source_prompt, version, created_at, updated_at
      FROM public.workflows
      WHERE id = $1
      LIMIT 1
      `,
      [workflowId]
    )

    const stepsRes = await client.query(
      `
      SELECT id, workflow_id, step_order, instruction, is_enabled, created_at, updated_at
      FROM public.workflow_steps
      WHERE workflow_id = $1
      ORDER BY step_order ASC
      `,
      [workflowId]
    )

    await client.query('COMMIT')

    return {
      workflow: workflowRes.rows[0],
      steps: stepsRes.rows
    }
  } catch (error: any) {
    await client.query('ROLLBACK')
    if (error?.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Gagal update workflow.'
    })
  } finally {
    client.release()
  }
})

function normalizeSteps(steps: WorkflowStepInput[]) {
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
