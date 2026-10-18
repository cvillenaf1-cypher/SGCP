import { crearAplicacion } from './app.js'
import { cargarEntorno, leerConfiguracion } from './config.js'
import { crearConexiones } from './db/pool.js'

cargarEntorno()
let conexiones
try {
  const configuracion = leerConfiguracion()
  conexiones = crearConexiones(configuracion.database)
  await conexiones.execute('SELECT id FROM roles LIMIT 1')
  const aplicacion = await crearAplicacion({ pool: conexiones, config: configuracion })
  const servidor = aplicacion.listen(configuracion.port, () => console.log(`SGCP API disponible en http://localhost:${configuracion.port}`))
  servidor.on('error', async (error) => {
    console.error('No se pudo iniciar la API:', error.code)
    await conexiones.end()
    process.exitCode = 1
  })
  let cerrando = false
  const cerrar = () => {
    if (cerrando) return
    cerrando = true
    const tiempoLimite = setTimeout(() => process.exit(1), 10000).unref()
    servidor.close(async () => {
      await conexiones.end()
      clearTimeout(tiempoLimite)
    })
  }
  process.on('SIGINT', cerrar)
  process.on('SIGTERM', cerrar)
} catch (error) {
  console.error('No se pudo iniciar SGCP. Revisa el entorno, MySQL y las migraciones:', error.code || error.message)
  if (conexiones) await conexiones.end()
  process.exitCode = 1
}
