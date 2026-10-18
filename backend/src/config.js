import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

export function loadEnvironment() {
  dotenv.config({
    path: fileURLToPath(new URL('../.env', import.meta.url)),
    quiet: true,
  })
}

function integer(value, fallback, min, max, name) {
  const number = Number(value ?? fallback)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`)
  }
  return number
}

export function readConfig(env = process.env) {
  for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (!env[name]?.trim()) throw new Error(`Falta configurar ${name}.`)
  }
  const frontendUrl = env.FRONTEND_URL || 'http://localhost:5173'
  const url = new URL(frontendUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== frontendUrl) {
    throw new Error('FRONTEND_URL debe ser un origen HTTP(S), sin ruta ni barra final.')
  }
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('FRONTEND_URL debe usar HTTPS en producción.')
  }

  return {
    port: integer(env.PORT, 3000, 1, 65535, 'PORT'),
    frontendUrl,
    sessionMinutes: integer(env.SESSION_TTL_MINUTES, 60, 1, 1440, 'SESSION_TTL_MINUTES'),
    loginLimit: 10,
    loginWindowMs: 15 * 60 * 1000,
    database: {
      host: env.DB_HOST,
      port: integer(env.DB_PORT, 3306, 1, 65535, 'DB_PORT'),
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    },
  }
}
