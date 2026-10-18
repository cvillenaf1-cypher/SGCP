import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { readConfig } from '../../src/config.js'
import { createPool } from '../../src/db/pool.js'
import { migrate } from '../../src/db/migrate.js'
import { createUser } from '../../src/auth/service.js'

export function testConfig() {
  const env = {}
  const result = dotenv.config({ path: fileURLToPath(new URL('../../.env.test', import.meta.url)), processEnv: env, quiet: true })
  // La ruta se resuelve desde test/support hacia backend/.env.test.
  if (result.error) throw new Error('Configura backend/.env.test para ejecutar pruebas con MySQL real.')
  const development = {}
  dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), processEnv: development, quiet: true })
  const config = readConfig(env)
  if (!/^[a-z0-9_]+_test$/.test(config.database.database) || config.database.database === development.DB_NAME) {
    throw new Error('Las pruebas requieren una base independiente con sufijo _test.')
  }
  return config
}

export async function openTestDatabase() {
  const config = testConfig()
  const pool = createPool(config.database)
  try {
    await migrate(pool)
    return { config, pool }
  } catch (error) {
    await pool.end()
    throw error
  }
}

export async function fixtureUser(pool, role = 'ASISTENTE') {
  const input = {
    name: `Prueba ${role.toLowerCase()}`,
    email: `test-${randomUUID()}@example.test`,
    password: randomBytes(24).toString('base64url'),
    role,
  }
  const id = await createUser(pool, input)
  return { ...input, id }
}

// Solo elimina usuarios creados por la prueba actual. Nunca limpia tablas completas.
export async function removeFixture(pool, user) {
  await pool.execute('DELETE FROM sesiones WHERE usuario_id = ?', [user.id])
  await pool.execute('DELETE FROM usuarios WHERE id = ? AND email = ?', [user.id, user.email])
}
