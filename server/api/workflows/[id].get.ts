import { getDbPool } from '../../utils/db'
import { resolveWorkflowUserId } from '../../utils/workflow-auth'

export default defineEventHandler(async (event) => {
  const workflowId = String(getRouterParam(event, 'id') || '').trim()
  const query = getQuery(event)
  const userId = await resolveWorkflowUserId(event, String(query.userId || ''))

  if (!workflowId) {
    throw createError({ statusCode: 400, statusMessage: 'Workflow id tidak valid.' })
  }

  const pool = getDbPool()

  const workflowRes = await pool.query(
    `
    SELECT id, user_id, title, topic, status, source_prompt, version, created_at, updated_at
    FROM public.workflows
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    `,
    [workflowId, userId]
  )

  if (workflowRes.rowCount === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Workflow tidak ditemukan.' })
  }

  const stepsRes = await pool.query(
    `
    SELECT id, workflow_id, step_order, instruction, is_enabled, created_at, updated_at
    FROM public.workflow_steps
    WHERE workflow_id = $1
    ORDER BY step_order ASC
    `,
    [workflowId]
  )

  return {
    workflow: workflowRes.rows[0],
    steps: stepsRes.rows
  }
})
