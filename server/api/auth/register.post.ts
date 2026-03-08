import { randomUUID } from 'node:crypto'
import { getProfileByEmail, hashPassword } from '../../utils/auth'
import { getDbPool } from '../../utils/db'

type RegisterBody = {
  email?: string
  password?: string
  fullName?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RegisterBody>(event)
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  const fullName = String(body?.fullName || '').trim() || null

  if (!email || !email.includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'Email tidak valid.' })
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Password minimal 8 karakter.' })
  }

  const existing = await getProfileByEmail(email)
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Email sudah terdaftar.' })
  }

  const passwordHash = await hashPassword(password)
  const userId = randomUUID()
  const pool = getDbPool()
  try {
    await pool.query(
      `
      INSERT INTO public.profiles (id, email, password_hash, full_name)
      VALUES ($1, $2, $3, $4)
      `,
      [userId, email, passwordHash, fullName]
    )
  } catch (error: any) {
    if (error?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Email sudah terdaftar.' })
    }
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Gagal membuat user.'
    })
  }

  return {
    user: {
      id: userId,
      email,
      full_name: fullName
    }
  }
})
