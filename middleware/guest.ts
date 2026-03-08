export default defineNuxtRouteMiddleware(async () => {
  if (process.server) {
    return
  }

  const { readAuthSession } = await import('~/utils/auth-session')
  const session = readAuthSession()
  if (session?.user?.id) {
    return navigateTo('/')
  }
})
