import { calcularResumenToken, usuarioPublico } from './service.js'

export function autenticar(conexiones) {
  return async (solicitud, respuesta, siguiente) => {
    const coincidencia = /^Bearer ([a-f0-9]{64})$/i.exec(solicitud.get('Authorization') || '')
    if (!coincidencia) return respuesta.status(401).json({ message: 'Inicia sesión para continuar.' })
    const [filas] = await conexiones.execute(
      `SELECT s.id AS session_id, u.id, u.nombre, u.email, r.codigo
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id JOIN roles r ON r.id = u.rol_id
       WHERE s.token_hash = ? AND s.revocado_en IS NULL AND s.vence_en > UTC_TIMESTAMP(3) AND u.activo = TRUE`,
      [calcularResumenToken(coincidencia[1])],
    )
    if (!filas.length) return respuesta.status(401).json({ message: 'Tu sesión venció o ya no está disponible. Inicia sesión nuevamente.' })
    solicitud.auth = { sessionId: filas[0].session_id, user: usuarioPublico(filas[0]) }
    siguiente()
  }
}

export function autorizar(...roles) {
  return (solicitud, respuesta, siguiente) => {
    if (!solicitud.auth) return respuesta.status(401).json({ message: 'Inicia sesión para continuar.' })
    if (!roles.includes(solicitud.auth.user.role)) return respuesta.status(403).json({ message: 'No tienes permiso para acceder a este recurso.' })
    siguiente()
  }
}
