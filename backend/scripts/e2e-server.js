import { crearAplicacion } from '../src/app.js'
import { abrirBasePruebas } from '../test/support/database.js'

// Usa exclusivamente la base _test y un puerto distinto del servidor de desarrollo.
const { pool: conexiones, config: configuracion } = await abrirBasePruebas()
try {
  const aplicacion = await crearAplicacion({ pool: conexiones, config: { ...configuracion, frontendUrl: 'http://localhost:5174' } })
  const servidor = aplicacion.listen(3001, '127.0.0.1', () => console.log('API de pruebas E2E lista en el puerto 3001.'))
  servidor.on('error', async (error) => {
    console.error('Error del servidor E2E:', error.code)
    await conexiones.end()
    process.exitCode = 1
  })
  const cerrar = () => servidor.close(async () => { await conexiones.end() })
  process.once('SIGINT', cerrar)
  process.once('SIGTERM', cerrar)
} catch (error) {
  await conexiones.end()
  throw error
}
