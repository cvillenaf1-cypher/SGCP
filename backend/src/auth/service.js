import { createHash, randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { normalizarCorreo, validarNuevoUsuario } from './validation.js'

export const opcionesContrasena = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }
export const calcularResumenToken = (token) => createHash('sha256').update(token).digest('hex')

export function usuarioPublico(fila) {
  return { id: fila.id, name: fila.nombre, email: fila.email, role: fila.codigo }
}

export async function crearUsuario(conexiones, entrada) {
  validarNuevoUsuario(entrada)
  const resumenContrasena = await argon2.hash(entrada.password, opcionesContrasena)
  const [roles] = await conexiones.execute('SELECT id FROM roles WHERE codigo = ?', [entrada.role])
  if (!roles.length) throw new Error('Ejecuta las migraciones antes de crear usuarios.')
  const [resultado] = await conexiones.execute(
    'INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES (?, ?, ?, ?)',
    [entrada.name.trim(), normalizarCorreo(entrada.email), resumenContrasena, roles[0].id],
  )
  return resultado.insertId
}

export async function crearServicioAutenticacion(conexiones, minutosSesion) {
  // El usuario inexistente también ejecuta Argon2 para reducir diferencias temporales.
  const resumenSimulado = await argon2.hash(randomBytes(32), opcionesContrasena)
  return {
    async iniciarSesion(correo, contrasena) {
      const [filas] = await conexiones.execute(
        `SELECT u.id, u.nombre, u.email, u.password_hash, u.activo, r.codigo
         FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.email = ?`, [correo],
      )
      const usuario = filas[0]
      const coincide = await argon2.verify(usuario?.password_hash || resumenSimulado, contrasena)
      if (!usuario || !coincide || !usuario.activo) return null

      const token = randomBytes(32).toString('hex')
      const [resultado] = await conexiones.execute(
        `INSERT INTO sesiones (usuario_id, token_hash, vence_en)
         SELECT id, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)
         FROM usuarios WHERE id = ? AND activo = TRUE`,
        [calcularResumenToken(token), minutosSesion, usuario.id],
      )
      if (!resultado.affectedRows) return null
      const [[sesion]] = await conexiones.execute('SELECT vence_en FROM sesiones WHERE id = ?', [resultado.insertId])
      return { token, expiresAt: `${sesion.vence_en.replace(' ', 'T')}Z`, user: usuarioPublico(usuario) }
    },
  }
}
