import { fixtureUser, openTestDatabase, removeFixture } from '../../backend/test/support/database.js'

export default async function setup() {
  const { pool } = await openTestDatabase()
  const users = []
  try {
    users.push(await fixtureUser(pool, 'ASISTENTE'))
    users.push(await fixtureUser(pool, 'GERENTE'))
    // Credenciales aleatorias solo en memoria del proceso, nunca en archivos ni capturas.
    process.env.SGCP_E2E_USERS = JSON.stringify(users)
    return async () => {
      try { for (const user of users) await removeFixture(pool, user) } finally { await pool.end() }
    }
  } catch (error) {
    try { for (const user of users) await removeFixture(pool, user) } finally { await pool.end() }
    throw error
  }
}
