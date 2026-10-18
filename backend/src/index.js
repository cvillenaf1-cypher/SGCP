import { createApp } from './app.js'
import { loadEnvironment, readConfig } from './config.js'
import { createPool } from './db/pool.js'

loadEnvironment()
let pool
try {
  const config = readConfig()
  pool = createPool(config.database)
  await pool.execute('SELECT id FROM roles LIMIT 1')
  const app = await createApp({ pool, config })
  const server = app.listen(config.port, () => console.log(`SGCP API disponible en http://localhost:${config.port}`))
  server.on('error', async (error) => {
    console.error('No se pudo iniciar la API:', error.code)
    await pool.end()
    process.exitCode = 1
  })
  let closing = false
  const close = () => {
    if (closing) return
    closing = true
    const timeout = setTimeout(() => process.exit(1), 10000).unref()
    server.close(async () => {
      await pool.end()
      clearTimeout(timeout)
    })
  }
  process.on('SIGINT', close)
  process.on('SIGTERM', close)
} catch (error) {
  console.error('No se pudo iniciar SGCP. Revisa el entorno, MySQL y las migraciones:', error.code || error.message)
  if (pool) await pool.end()
  process.exitCode = 1
}
