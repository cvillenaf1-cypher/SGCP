import { hashToken, publicUser } from './service.js'

export function authenticate(pool) {
  return async (req, res, next) => {
    const match = /^Bearer ([a-f0-9]{64})$/i.exec(req.get('Authorization') || '')
    if (!match) return res.status(401).json({ message: 'Inicia sesión para continuar.' })
    const [rows] = await pool.execute(
      `SELECT s.id AS session_id, u.id, u.nombre, u.email, r.codigo
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id JOIN roles r ON r.id = u.rol_id
       WHERE s.token_hash = ? AND s.revocado_en IS NULL AND s.vence_en > UTC_TIMESTAMP(3) AND u.activo = TRUE`,
      [hashToken(match[1])],
    )
    if (!rows.length) return res.status(401).json({ message: 'Tu sesión venció o ya no está disponible. Inicia sesión nuevamente.' })
    req.auth = { sessionId: rows[0].session_id, user: publicUser(rows[0]) }
    next()
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ message: 'Inicia sesión para continuar.' })
    if (!roles.includes(req.auth.user.role)) return res.status(403).json({ message: 'No tienes permiso para acceder a este recurso.' })
    next()
  }
}
