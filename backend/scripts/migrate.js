import { loadEnvironment, readConfig } from '../src/config.js'
import { createPool } from '../src/db/pool.js'
import { migrate } from '../src/db/migrate.js'

loadEnvironment()
let pool
try {
  pool = createPool(readConfig().database)
  const applied = await migrate(pool)
  console.log(applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'Base de datos actualizada; no hay migraciones pendientes.')
} catch (error) {
  console.error('No se pudieron ejecutar las migraciones:', error.code || error.message)
  process.exitCode = 1
} finally {
  if (pool) await pool.end()
}
