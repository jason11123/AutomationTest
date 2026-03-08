import bcrypt from 'bcryptjs'
import { getDbPool } from './db'

export type AuthUser = {
  id: string
  email: string
  full_name: string | null
}

export async function hashPassword(password: string) {
  return await bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string) {
  return await bcrypt.compare(password, hash)
}

export async function getProfileByEmail(email: string): Promise<(AuthUser & { password_hash: string | null }) | null> {
  const pool = getDbPool()
  const result = await pool.query(
    `
    SELECT id, email, full_name, password_hash
    FROM public.profiles
    WHERE lower(email) = lower($1) AND is_active = true
    LIMIT 1
    `,
    [email]
  )

  if (result.rowCount === 0) {
    return null
  }

  return result.rows[0]
}

export async function getProfileById(userId: string): Promise<AuthUser | null> {
  const pool = getDbPool()
  const result = await pool.query(
    `
    SELECT id, email, full_name
    FROM public.profiles
    WHERE id = $1 AND is_active = true
    LIMIT 1
    `,
    [userId]
  )

  if (result.rowCount === 0) {
    return null
  }

  return result.rows[0]
}
