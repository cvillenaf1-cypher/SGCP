import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { LIMITE_ARCHIVO } from './validacion.js'

export function crearRecepcionComprobante(campos = 0) {
  const carga = multer({ storage: multer.memoryStorage(), limits: {
    fileSize: LIMITE_ARCHIVO, files: 1, fields: campos, parts: campos + 1,
    fieldSize: 512, fieldNameSize: 32, headerPairs: 20,
  } }).single('comprobante')
  const limitarCargas = rateLimit({
    windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Demasiadas cargas. Espera un minuto antes de reintentar.' },
  })
  let cargasActivas = 0
  const limitarConcurrencia = (_solicitud, respuesta, siguiente) => {
    if (cargasActivas >= 4) return respuesta.status(429).json({ message: 'Hay varias cargas en curso. Reintenta en unos segundos.' })
    cargasActivas++
    let liberado = false
    const liberar = () => { if (!liberado) { cargasActivas--; liberado = true } }
    respuesta.once('finish', liberar)
    respuesta.once('close', liberar)
    siguiente()
  }
  const recibirArchivo = (solicitud, respuesta, siguiente) => {
    carga(solicitud, respuesta, (error) => {
      if (error) {
        const estado = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422
        const mensaje = estado === 413 ? 'El comprobante supera los 5 MB.' : 'Envía un solo comprobante junto con los campos permitidos.'
        return respuesta.status(estado).json({ message: mensaje, fields: { comprobante: mensaje } })
      }
      siguiente()
    })
  }
  return [limitarCargas, limitarConcurrencia, recibirArchivo]
}
