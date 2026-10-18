import { registrarRutasComprobantes } from './comprobantes/rutas.js'
import { validarRegistroAbono } from './abonos/validacion.js'
import { registrarAbono, ErrorAbono } from './abonos/servicio.js'
import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { autenticar, autorizar } from './auth/middleware.js'
import { crearServicioAutenticacion } from './auth/service.js'
import { ROLES, validarInicioSesion } from './auth/validation.js'
import { registrarObligacion } from './obligaciones/servicio.js'
import { validarObligacion } from './obligaciones/validacion.js'
import { listarObligaciones, obtenerObligacion } from './obligaciones/consulta.js'
import { validarFiltroConsulta, validarIdentificadorObligacion } from './obligaciones/validacion-consulta.js'

export async function crearAplicacion({ pool: conexiones, config: configuracion, almacenComprobantes }) {
  const aplicacion = express()
  const servicio = await crearServicioAutenticacion(conexiones, configuracion.sessionMinutes)
  const requerirSesion = autenticar(conexiones)
  aplicacion.disable('x-powered-by')
  aplicacion.use(helmet())
  aplicacion.use(cors({ origin: configuracion.frontendUrl, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }))
  aplicacion.use('/api', (_solicitud, respuesta, siguiente) => { respuesta.set('Cache-Control', 'no-store'); siguiente() })
  aplicacion.use(express.json({ limit: '16kb' }))

  aplicacion.get('/api/health', (_solicitud, respuesta) => {
    respuesta.json({ status: 'ok', service: 'SGCP API', message: 'El servidor funciona correctamente.' })
  })

  const limitadorInicioSesion = rateLimit({
    windowMs: configuracion.loginWindowMs,
    limit: configuracion.loginLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
  })

  aplicacion.post('/api/auth/login', limitadorInicioSesion, async (solicitud, respuesta) => {
    const { email: correo, password: contrasena, fields: campos } = validarInicioSesion(solicitud.body)
    if (Object.keys(campos).length) return respuesta.status(422).json({ message: 'Revisa los datos del formulario.', fields: campos })
    const sesion = await servicio.iniciarSesion(correo, contrasena)
    if (!sesion) return respuesta.status(401).json({ message: 'Correo o contraseña incorrectos.' })
    respuesta.json(sesion)
  })

  aplicacion.get('/api/auth/me', requerirSesion, (solicitud, respuesta) => respuesta.json({ user: solicitud.auth.user }))
  aplicacion.post('/api/auth/logout', requerirSesion, async (solicitud, respuesta) => {
    await conexiones.execute('UPDATE sesiones SET revocado_en = UTC_TIMESTAMP(3) WHERE id = ?', [solicitud.auth.sessionId])
    respuesta.sendStatus(204)
  })

  aplicacion.post('/api/obligaciones', requerirSesion, autorizar(ROLES.ASISTENTE), async (solicitud, respuesta) => {
    const { fields: campos, ...entrada } = validarObligacion(solicitud.body)
    if (Object.keys(campos).length) return respuesta.status(422).json({ message: 'Revisa los datos del formulario.', fields: campos })
    const obligacion = await registrarObligacion(conexiones, entrada, solicitud.auth.user.id)
    respuesta.status(201).json({ message: 'Obligación registrada correctamente.', obligacion })
  })

  aplicacion.get('/api/obligaciones', requerirSesion, autorizar(ROLES.ASISTENTE), async (solicitud, respuesta) => {
    const { filtro, fields: campos } = validarFiltroConsulta(solicitud.query)
    if (Object.keys(campos).length) return respuesta.status(422).json({ message: 'Revisa los datos de la consulta.', fields: campos })
    const obligaciones = await listarObligaciones(conexiones, filtro)
    respuesta.json({ obligaciones })
  })

  aplicacion.get('/api/obligaciones/:id', requerirSesion, autorizar(ROLES.ASISTENTE), async (solicitud, respuesta) => {
    const { id, fields: campos } = validarIdentificadorObligacion(solicitud.params.id)
    if (Object.keys(campos).length) return respuesta.status(422).json({ message: 'Revisa los datos de la consulta.', fields: campos })
    const obligacion = await obtenerObligacion(conexiones, id)
    if (!obligacion) return respuesta.status(404).json({ message: 'Obligación no encontrada.' })
    respuesta.json({ obligacion })
  })
  aplicacion.post('/api/obligaciones/:id/abonos', requerirSesion, autorizar(ROLES.ASISTENTE), async (solicitud, respuesta) => {
    const identificador = validarIdentificadorObligacion(solicitud.params.id)
    const { fields: camposAbono, ...entrada } = validarRegistroAbono(solicitud.body)
    const campos = { ...identificador.fields, ...camposAbono }
    if (Object.keys(campos).length) return respuesta.status(422).json({ message: 'Revisa los datos del abono.', fields: campos })
    try {
      const { nuevo, abono } = await registrarAbono(conexiones, identificador.id, entrada, solicitud.auth.user.id)
      respuesta.status(nuevo ? 201 : 200).json({ message: 'Abono registrado correctamente.', abono })
    } catch (error) {
      if (error instanceof ErrorAbono) return respuesta.status(error.estado).json({ message: error.message })
      throw error
    }
  })

  registrarRutasComprobantes(aplicacion, conexiones, requerirSesion, almacenComprobantes)

  // Paneles iniciales: permiten comprobar autorización real sin adelantar historias financieras.
  aplicacion.get('/api/panel/asistente', requerirSesion, autorizar(ROLES.ASISTENTE), (_solicitud, respuesta) => {
    respuesta.json({ message: 'Acceso de asistente habilitado. Los módulos de obligaciones se incorporarán en las siguientes entregas.' })
  })
  aplicacion.get('/api/panel/gerente', requerirSesion, autorizar(ROLES.GERENTE), (_solicitud, respuesta) => {
    respuesta.json({ message: 'Acceso de gerente habilitado. Las consultas económicas serán de solo lectura.' })
  })

  aplicacion.use((_solicitud, respuesta) => respuesta.status(404).json({ message: 'Ruta no encontrada.' }))
  aplicacion.use((error, _solicitud, respuesta, _siguiente) => {
    if (error.type === 'entity.parse.failed') return respuesta.status(400).json({ message: 'El cuerpo JSON no es válido.' })
    if (error.type === 'entity.too.large') return respuesta.status(413).json({ message: 'La solicitud supera el tamaño permitido.' })
    // Nunca registrar cuerpos, tokens, contraseñas o parámetros SQL.
    console.error('Error de API:', error.code || error.name || 'Error')
    respuesta.status(500).json({ message: 'No se pudo completar la operación. Intenta nuevamente.' })
  })
  return aplicacion
}
