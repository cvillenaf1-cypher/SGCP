import { createHash, randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { normalizeEmail, validateNewUser } from './validation.js'

export const passwordOptions = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }
export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

export function publicUser(row) {
  return { id: row.id, name: row.nombre, email: row.email, role: row.codigo }
}

export async function createUser(pool, input) {
  validateNewUser(input)
  const passwordHash = await argon2.hash(input.password, passwordOptions)
  const [roles] = await pool.execute('SELECT id FROM roles WHERE codigo = ?', [input.role])
  if (!roles.length) throw new Error('Ejecuta las migraciones antes de crear usuarios.')
  const [result] = await pool.execute(
    'INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES (?, ?, ?, ?)',
    [input.name.trim(), normalizeEmail(input.email), passwordHash, roles[0].id],
  )
  return result.insertId
}

export async function createAuthService(pool, sessionMinutes) {
  // El usuario inexistente también ejecuta Argon2 para reducir diferencias temporales.
  const dummyHash = await argon2.hash(randomBytes(32), passwordOptions)
  return {
    async login(email, password) {
      const [rows] = await pool.execute(
        `SELECT u.id, u.nombre, u.email, u.password_hash, u.activo, r.codigo
         FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.email = ?`, [email],
      )
      const user = rows[0]
      const matches = await argon2.verify(user?.password_hash || dummyHash, password)
      if (!user || !matches || !user.activo) return null

      const token = randomBytes(32).toString('hex')
      const [result] = await pool.execute(
        `INSERT INTO sesiones (usuario_id, token_hash, vence_en)
         SELECT id, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)
         FROM usuarios WHERE id = ? AND activo = TRUE`,
        [hashToken(token), sessionMinutes, user.id],
      )
      if (!result.affectedRows) return null
      const [[session]] = await pool.execute('SELECT vence_en FROM sesiones WHERE id = ?', [result.insertId])
      return { token, expiresAt: `${session.vence_en.replace(' ', 'T')}Z`, user: publicUser(user) }
    },
  }
}
