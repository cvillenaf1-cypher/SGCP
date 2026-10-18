import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { leerConfiguracion } from '../../src/config.js'
import { crearConexiones } from '../../src/db/pool.js'
import { migrar } from '../../src/db/migrate.js'
import { crearUsuario } from '../../src/auth/service.js'

export function configuracionPruebas() {
  const entorno = {}
  const resultado = dotenv.config({ path: fileURLToPath(new URL('../../.env.test', import.meta.url)), processEnv: entorno, quiet: true })
  // La ruta se resuelve desde test/support hacia backend/.env.test.
  if (resultado.error) throw new Error('Configura backend/.env.test para ejecutar pruebas con MySQL real.')
  const desarrollo = {}
  dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), processEnv: desarrollo, quiet: true })
  const configuracion = leerConfiguracion(entorno)
  if (!/^[a-z0-9_]+_test$/.test(configuracion.database.database) || configuracion.database.database === desarrollo.DB_NAME) {
    throw new Error('Las pruebas requieren una base independiente con sufijo _test.')
  }
  return configuracion
}

export async function abrirBasePruebas() {
  const configuracion = configuracionPruebas()
  const conexiones = crearConexiones(configuracion.database)
  try {
    await migrar(conexiones)
    return { config: configuracion, pool: conexiones }
  } catch (error) {
    await conexiones.end()
    throw error
  }
}

export async function crearUsuarioPrueba(conexiones, rol = 'ASISTENTE') {
  const entrada = {
    name: `Prueba ${rol.toLowerCase()}`,
    email: `test-${randomUUID()}@example.test`,
    password: randomBytes(24).toString('base64url'),
    role: rol,
  }
  const id = await crearUsuario(conexiones, entrada)
  return { ...entrada, id }
}

// Solo elimina usuarios creados por la prueba actual. Nunca limpia tablas completas.
export async function eliminarUsuarioPrueba(conexiones, usuario) {
  await conexiones.execute('DELETE FROM sesiones WHERE usuario_id = ?', [usuario.id])
  await conexiones.execute('DELETE FROM usuarios WHERE id = ? AND email = ?', [usuario.id, usuario.email])
}
