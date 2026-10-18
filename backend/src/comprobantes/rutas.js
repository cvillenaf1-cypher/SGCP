import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { ROLES } from '../auth/validation.js'
import { autorizar } from '../auth/middleware.js'
import { validarIdentificadorObligacion } from '../obligaciones/validacion-consulta.js'
import { validarComprobante, ErrorComprobante, LIMITE_ARCHIVO } from './validacion.js'
import { crearAlmacenComprobantes } from './almacen.js'
import { autorizarAbono, asociarComprobante, obtenerComprobante, presentarComprobante } from './servicio.js'

export function registrarRutasComprobantes(aplicacion, conexiones, requerirSesion, almacen = crearAlmacenComprobantes()) {
  const carga = multer({ storage: multer.memoryStorage(), limits: {
    fileSize: LIMITE_ARCHIVO, files: 1, fields: 0, parts: 1, fieldNameSize: 32, headerPairs: 20,
  } }).single('comprobante')
  const limitarCargas = rateLimit({
    windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Demasiadas cargas. Espera un minuto antes de reintentar.' },
  })
  // Acota también la memoria de las cargas y decodificaciones simultáneas.
  let cargasActivas = 0
  function limitarConcurrencia(_solicitud, respuesta, siguiente) {
    if (cargasActivas >= 4) return respuesta.status(429).json({ message: 'Hay varias cargas en curso. Reintenta en unos segundos.' })
    cargasActivas++
    let liberado = false
    const liberar = () => { if (!liberado) { cargasActivas--; liberado = true } }
    respuesta.once('finish', liberar)
    respuesta.once('close', liberar)
    siguiente()
  }
  const proteger = (operacion) => async (solicitud, respuesta, siguiente) => {
    try { await operacion(solicitud, respuesta, siguiente) } catch (error) {
      if (error instanceof ErrorComprobante) return respuesta.status(error.estado).json({ message: error.message })
      siguiente(error)
    }
  }
  const validarId = (solicitud, respuesta, siguiente) => {
    const { id, fields: campos } = validarIdentificadorObligacion(solicitud.params.id)
    if (Object.keys(campos).length) return respuesta.status(422).json({ message: 'Identificador de abono inválido.', fields: campos })
    solicitud.abonoId = id
    siguiente()
  }
  const verificarPropietario = proteger(async (solicitud, _respuesta, siguiente) => {
    await autorizarAbono(conexiones, solicitud.abonoId, solicitud.auth.user)
    siguiente()
  })
  const recibirArchivo = (solicitud, respuesta, siguiente) => {
    carga(solicitud, respuesta, (error) => {
      if (error) {
        const estado = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422
        return respuesta.status(estado).json({ message: estado === 413 ? 'El comprobante supera los 5 MB.' : 'Envía un solo archivo en el campo comprobante, sin otros campos.' })
      }
      siguiente()
    })
  }
  aplicacion.post('/api/abonos/:id/comprobante',
    requerirSesion, autorizar(ROLES.ASISTENTE), validarId, verificarPropietario,
    limitarCargas, limitarConcurrencia, recibirArchivo,
    proteger(async (solicitud, respuesta) => {
      const imagen = await validarComprobante(solicitud.file)
      const { nuevo, comprobante } = await asociarComprobante(conexiones, almacen, solicitud.abonoId, solicitud.auth.user, imagen)
      respuesta.status(nuevo ? 201 : 200).json({ message: 'Comprobante asociado correctamente.', comprobante })
    }),
  )
  aplicacion.get('/api/abonos/:id/comprobante',
    requerirSesion, autorizar(ROLES.ASISTENTE, ROLES.GERENTE), validarId,
    proteger(async (solicitud, respuesta) => {
      const fila = await obtenerComprobante(conexiones, solicitud.abonoId, solicitud.auth.user)
      respuesta.json({ tiene_comprobante: Boolean(fila), comprobante: fila ? presentarComprobante(fila) : null })
    }),
  )
  aplicacion.get('/api/abonos/:id/comprobante/archivo',
    requerirSesion, autorizar(ROLES.ASISTENTE, ROLES.GERENTE), validarId,
    proteger(async (solicitud, respuesta) => {
      const fila = await obtenerComprobante(conexiones, solicitud.abonoId, solicitud.auth.user)
      if (!fila) throw new ErrorComprobante(404, 'El abono no tiene comprobante.')
      const datos = await almacen.leer(fila.identificador_archivo)
      respuesta.set({
        'Content-Type': fila.tipo,
        'Content-Disposition': `attachment; filename="comprobante-${fila.abono_id}.${fila.tipo === 'image/png' ? 'png' : 'jpg'}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      }).send(datos)
    }),
  )
}
