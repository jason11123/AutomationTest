import { getDbPool } from '../../../utils/db'
import { resolveWorkflowUserId } from '../../../utils/workflow-auth'

export default defineEventHandler(async (event) => {
  const workflowId = String(getRouterParam(event, 'id') || '').trim()
  const query = getQuery(event)
  const userId = await resolveWorkflowUserId(event, String(query.userId || ''))
  const limit = normalizePositiveInt(query.limit, 50, 1, 200)
  const offset = normalizePositiveInt(query.offset, 0, 0, 20000)

  if (!workflowId) {
    throw createError({ statusCode: 400, statusMessage: 'Workflow id tidak valid.' })
  }

  const pool = getDbPool()
  const ownershipRes = await pool.query(
    `
    SELECT id, title, topic, status, created_at, updated_at
    FROM public.workflows
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    `,
    [workflowId, userId]
  )

  if (ownershipRes.rowCount === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Workflow tidak ditemukan.' })
  }

  const logsRes = await pool.query(
    `
    SELECT
      e.id,
      e.workflow_id,
      e.workflow_step_id,
      e.step_order,
      e.step_instruction,
      e.input_context,
      e.output_text,
      e.status,
      e.error_message,
      e.created_at,
      s.instruction AS latest_step_instruction,
      COALESCE(t.input_tokens, 0) AS input_tokens,
      COALESCE(t.output_tokens, 0) AS output_tokens,
      COALESCE(t.total_tokens, 0) AS total_tokens,
      COALESCE(t.cached_tokens, 0) AS cached_tokens,
      t.model,
      t.provider_response_id,
      t.source
    FROM public.workflow_step_executions e
    LEFT JOIN public.workflow_steps s
      ON s.id = e.workflow_step_id
    LEFT JOIN public.llm_token_consumptions t
      ON t.workflow_execution_id = e.id
    WHERE e.workflow_id = $1
    ORDER BY e.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [workflowId, limit, offset]
  )

  const statsRes = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_executions,
      COUNT(*) FILTER (WHERE status = 'success')::int AS success_executions,
      COUNT(*) FILTER (WHERE status = 'error')::int AS failed_executions,
      MAX(created_at) AS last_execution_at
    FROM public.workflow_step_executions
    WHERE workflow_id = $1
    `,
    [workflowId]
  )

  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM public.workflow_step_executions
    WHERE workflow_id = $1
    `,
    [workflowId]
  )

  return {
    workflow: ownershipRes.rows[0],
    pagination: {
      limit,
      offset,
      total: countRes.rows[0]?.total || 0
    },
    stats: statsRes.rows[0],
    logs: logsRes.rows
  }
})

function normalizePositiveInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  const int = Math.floor(parsed)
  if (int < min) {
    return min
  }
  if (int > max) {
    return max
  }
  return int
}
