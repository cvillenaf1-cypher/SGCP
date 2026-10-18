import { createApp } from '../src/app.js'
import { openTestDatabase } from '../test/support/database.js'

// Usa exclusivamente la base _test y un puerto distinto del servidor de desarrollo.
const { pool, config } = await openTestDatabase()
try {
  const app = await createApp({ pool, config: { ...config, frontendUrl: 'http://localhost:5174' } })
  const server = app.listen(3001, '127.0.0.1', () => console.log('API de pruebas E2E lista en el puerto 3001.'))
  server.on('error', async (error) => {
    console.error('Error del servidor E2E:', error.code)
    await pool.end()
    process.exitCode = 1
  })
  const close = () => server.close(async () => { await pool.end() })
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
} catch (error) {
  await pool.end()
  throw error
}
