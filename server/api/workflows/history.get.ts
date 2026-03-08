import { getDbPool } from '../../utils/db'
import { resolveWorkflowUserId } from '../../utils/workflow-auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const userId = await resolveWorkflowUserId(event, String(query.userId || ''))
  const limit = normalizePositiveInt(query.limit, 20, 1, 100)
  const offset = normalizePositiveInt(query.offset, 0, 0, 10000)

  const pool = getDbPool()
  const result = await pool.query(
    `
    SELECT
      w.id,
      w.user_id,
      w.title,
      w.topic,
      w.status,
      w.source_prompt,
      w.version,
      w.created_at,
      w.updated_at,
      COALESCE(s.step_count, 0) AS step_count,
      COALESCE(e.total_executions, 0) AS total_executions,
      COALESCE(e.success_executions, 0) AS success_executions,
      COALESCE(e.failed_executions, 0) AS failed_executions,
      e.last_execution_at,
      COALESCE(t.total_input_tokens, 0) AS total_input_tokens,
      COALESCE(t.total_output_tokens, 0) AS total_output_tokens,
      COALESCE(t.total_tokens, 0) AS total_tokens,
      COALESCE(t.total_cached_tokens, 0) AS total_cached_tokens
    FROM public.workflows w
    LEFT JOIN (
      SELECT workflow_id, COUNT(*)::int AS step_count
      FROM public.workflow_steps
      GROUP BY workflow_id
    ) s ON s.workflow_id = w.id
    LEFT JOIN (
      SELECT
        workflow_id,
        COUNT(*)::int AS total_executions,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success_executions,
        COUNT(*) FILTER (WHERE status = 'error')::int AS failed_executions,
        MAX(created_at) AS last_execution_at
      FROM public.workflow_step_executions
      GROUP BY workflow_id
    ) e ON e.workflow_id = w.id
    LEFT JOIN (
      SELECT
        workflow_id,
        SUM(input_tokens)::bigint AS total_input_tokens,
        SUM(output_tokens)::bigint AS total_output_tokens,
        SUM(total_tokens)::bigint AS total_tokens,
        SUM(cached_tokens)::bigint AS total_cached_tokens
      FROM public.llm_token_consumptions
      GROUP BY workflow_id
    ) t ON t.workflow_id = w.id
    WHERE w.user_id = $1
    ORDER BY w.updated_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, limit, offset]
  )

  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM public.workflows
    WHERE user_id = $1
    `,
    [userId]
  )

  return {
    pagination: {
      limit,
      offset,
      total: countRes.rows[0]?.total || 0
    },
    workflows: result.rows
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
