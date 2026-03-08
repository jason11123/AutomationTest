import { getProfileByEmail, verifyPassword } from '../../utils/auth'

type LoginBody = {
  email?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody>(event)
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Email dan password wajib diisi.' })
  }

  const profile = await getProfileByEmail(email)
  if (!profile) {
    throw createError({ statusCode: 401, statusMessage: 'Email atau password salah.' })
  }

  if (!profile.password_hash) {
    throw createError({ statusCode: 401, statusMessage: 'Email atau password salah.' })
  }

  const isValid = await verifyPassword(password, profile.password_hash)
  if (!isValid) {
    throw createError({ statusCode: 401, statusMessage: 'Email atau password salah.' })
  }

  return {
    user: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name
    }
  }
})
