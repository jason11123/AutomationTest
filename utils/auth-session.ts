export const AUTH_STORAGE_KEY = 'agate_session_v1'

export type ClientAuthUser = {
  id: string
  email: string
  full_name: string | null
}

export type ClientAuthSession = {
  user: ClientAuthUser
}

export function readAuthSession(): ClientAuthSession | null {
  if (!process.client) {
    return null
  }

  const raw = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as ClientAuthSession
    if (!parsed?.user?.id || !parsed?.user?.email) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeAuthSession(user: ClientAuthUser) {
  if (!process.client) {
    return
  }

  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      user
    } satisfies ClientAuthSession)
  )
}

export function clearAuthSession() {
  if (!process.client) {
    return
  }

  localStorage.removeItem(AUTH_STORAGE_KEY)
}
