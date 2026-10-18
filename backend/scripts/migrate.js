import { cargarEntorno, leerConfiguracion } from '../src/config.js'
import { crearConexiones } from '../src/db/pool.js'
import { migrar } from '../src/db/migrate.js'

cargarEntorno()
let conexiones
try {
  conexiones = crearConexiones(leerConfiguracion().database)
  const aplicadas = await migrar(conexiones)
  console.log(aplicadas.length ? `Migraciones aplicadas: ${aplicadas.join(', ')}` : 'Base de datos actualizada; no hay migraciones pendientes.')
} catch (error) {
  console.error('No se pudieron ejecutar las migraciones:', error.code || error.message)
  process.exitCode = 1
} finally {
  if (conexiones) await conexiones.end()
}
