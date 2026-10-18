import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { authenticate, authorize } from './auth/middleware.js'
import { createAuthService } from './auth/service.js'
import { ROLES, validateLogin } from './auth/validation.js'

export async function createApp({ pool, config }) {
  const app = express()
  const service = await createAuthService(pool, config.sessionMinutes)
  const requireSession = authenticate(pool)
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: config.frontendUrl, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }))
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  app.use(express.json({ limit: '16kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'SGCP API', message: 'El servidor funciona correctamente.' })
  })

  const loginLimiter = rateLimit({
    windowMs: config.loginWindowMs,
    limit: config.loginLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
  })

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { email, password, fields } = validateLogin(req.body)
    if (Object.keys(fields).length) return res.status(422).json({ message: 'Revisa los datos del formulario.', fields })
    const session = await service.login(email, password)
    if (!session) return res.status(401).json({ message: 'Correo o contraseña incorrectos.' })
    res.json(session)
  })

  app.get('/api/auth/me', requireSession, (req, res) => res.json({ user: req.auth.user }))
  app.post('/api/auth/logout', requireSession, async (req, res) => {
    await pool.execute('UPDATE sesiones SET revocado_en = UTC_TIMESTAMP(3) WHERE id = ?', [req.auth.sessionId])
    res.sendStatus(204)
  })

  // Paneles iniciales: permiten comprobar autorización real sin adelantar historias financieras.
  app.get('/api/panel/asistente', requireSession, authorize(ROLES.ASSISTANT), (_req, res) => {
    res.json({ message: 'Acceso de asistente habilitado. Los módulos de obligaciones se incorporarán en las siguientes entregas.' })
  })
  app.get('/api/panel/gerente', requireSession, authorize(ROLES.MANAGER), (_req, res) => {
    res.json({ message: 'Acceso de gerente habilitado. Las consultas económicas serán de solo lectura.' })
  })

  app.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }))
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'El cuerpo JSON no es válido.' })
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'La solicitud supera el tamaño permitido.' })
    // Nunca registrar cuerpos, tokens, contraseñas o parámetros SQL.
    console.error('Error de API:', error.code || error.name || 'Error')
    res.status(500).json({ message: 'No se pudo completar la operación. Intenta nuevamente.' })
  })
  return app
}
