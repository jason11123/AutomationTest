import { Pool } from 'pg'

let pool: Pool | null = null

export function getDbPool() {
  if (pool) {
    return pool
  }

  const config = useRuntimeConfig()
  const connectionString = String(config.dbUrl || '').trim()

  if (!connectionString) {
    throw createError({
      statusCode: 500,
      statusMessage: 'DB_URL belum diset di environment variable.'
    })
  }

  const sslMode = String(config.dbSslMode || 'require').toLowerCase()
  const ssl =
    sslMode === 'disable'
      ? undefined
      : {
          rejectUnauthorized: false
        }

  pool = new Pool({
    connectionString,
    ssl,
    max: 10
  })

  return pool
}
