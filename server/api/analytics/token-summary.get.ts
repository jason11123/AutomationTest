import { getDbPool } from '../../utils/db'
import { resolveWorkflowUserId } from '../../utils/workflow-auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const userId = await resolveWorkflowUserId(event, String(query.userId || ''))
  const dateFrom = normalizeDate(query.dateFrom)
  const dateTo = normalizeDate(query.dateTo)

  const pool = getDbPool()
  const params: any[] = [userId]
  const filters: string[] = ['t.user_id = $1']

  if (dateFrom) {
    params.push(dateFrom)
    filters.push(`t.created_at >= $${params.length}`)
  }

  if (dateTo) {
    params.push(`${dateTo}T23:59:59.999Z`)
    filters.push(`t.created_at <= $${params.length}`)
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''

  const overviewRes = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total_calls,
      COALESCE(SUM(t.input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(t.output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(t.total_tokens), 0)::bigint AS total_tokens,
      COALESCE(SUM(t.cached_tokens), 0)::bigint AS cached_tokens
    FROM public.llm_token_consumptions t
    ${whereClause}
    `,
    params
  )

  const byDayRes = await pool.query(
    `
    SELECT
      (t.created_at AT TIME ZONE 'UTC')::date AS day,
      COUNT(*)::int AS total_calls,
      COALESCE(SUM(t.input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(t.output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(t.total_tokens), 0)::bigint AS total_tokens,
      COALESCE(SUM(t.cached_tokens), 0)::bigint AS cached_tokens
    FROM public.llm_token_consumptions t
    ${whereClause}
    GROUP BY day
    ORDER BY day DESC
    `,
    params
  )

  const byWorkflowRes = await pool.query(
    `
    SELECT
      t.workflow_id,
      COALESCE(w.title, '(no workflow)') AS workflow_title,
      COUNT(*)::int AS total_calls,
      COALESCE(SUM(t.input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(t.output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(t.total_tokens), 0)::bigint AS total_tokens,
      COALESCE(SUM(t.cached_tokens), 0)::bigint AS cached_tokens
    FROM public.llm_token_consumptions t
    LEFT JOIN public.workflows w ON w.id = t.workflow_id
    ${whereClause}
    GROUP BY t.workflow_id, workflow_title
    ORDER BY total_tokens DESC
    `,
    params
  )

  const byDayWorkflowRes = await pool.query(
    `
    SELECT
      (t.created_at AT TIME ZONE 'UTC')::date AS day,
      t.workflow_id,
      COALESCE(w.title, '(no workflow)') AS workflow_title,
      COUNT(*)::int AS total_calls,
      COALESCE(SUM(t.input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(t.output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(t.total_tokens), 0)::bigint AS total_tokens,
      COALESCE(SUM(t.cached_tokens), 0)::bigint AS cached_tokens
    FROM public.llm_token_consumptions t
    LEFT JOIN public.workflows w ON w.id = t.workflow_id
    ${whereClause}
    GROUP BY day, t.workflow_id, workflow_title
    ORDER BY day DESC, total_tokens DESC
    `,
    params
  )

  return {
    filters: {
      dateFrom: dateFrom || null,
      dateTo: dateTo || null
    },
    overview: overviewRes.rows[0],
    byDay: byDayRes.rows,
    byWorkflow: byWorkflowRes.rows,
    byDayWorkflow: byDayWorkflowRes.rows
  }
})

function normalizeDate(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Format tanggal harus YYYY-MM-DD.'
    })
  }

  return text
}
