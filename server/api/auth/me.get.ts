import { getProfileById } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const headerUserId = String(getHeader(event, 'x-user-id') || '').trim()
  const query = getQuery(event)
  const queryUserId = String(query.userId || '').trim()
  const userId = headerUserId || queryUserId

  if (!userId) {
    return { user: null }
  }

  const user = await getProfileById(userId)
  return {
    user
  }
})
