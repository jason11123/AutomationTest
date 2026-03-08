import type { H3Event } from 'h3'

export async function resolveWorkflowUserId(event: H3Event, fallbackUserId?: string | null) {
  const explicitUserId = String(fallbackUserId || '').trim()
  if (explicitUserId) {
    return explicitUserId
  }

  const headerUserId = String(getHeader(event, 'x-user-id') || '').trim()
  if (headerUserId) {
    return headerUserId
  }

  const query = getQuery(event)
  const queryUserId = String(query.userId || '').trim()
  if (queryUserId) {
    return queryUserId
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Unauthorized. Login dulu.'
  })
}
