import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const LIMITE_ARCHIVO = 5 * 1024 * 1024

export class ErrorComprobante extends Error {
  constructor(estado, mensaje) {
    super(mensaje)
    this.estado = estado
  }
}

export async function validarComprobante(archivo) {
  if (!archivo?.buffer?.length) throw new ErrorComprobante(422, 'Adjunta un comprobante JPG o PNG en el campo comprobante.')
  const contenido = archivo.buffer
  if (contenido.length > LIMITE_ARCHIVO) throw new ErrorComprobante(413, 'El comprobante supera los 5 MB.')
  const esPng = contenido.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const esJpg = contenido[0] === 255 && contenido[1] === 216 && contenido[2] === 255
  const tipo = esPng ? 'image/png' : esJpg ? 'image/jpeg' : null
  if (!tipo || archivo.mimetype !== tipo) throw new ErrorComprobante(422, 'El contenido y el tipo declarado deben corresponder a JPG o PNG.')
  const extension = tipo === 'image/png' ? 'png' : 'jpg'
  const nombre = (archivo.originalname || '').split(/[\\/]/).at(-1)
  if (!(tipo === 'image/png' ? /\.png$/i : /\.jpe?g$/i).test(nombre)) {
    throw new ErrorComprobante(422, 'La extensión debe coincidir con el contenido JPG o PNG.')
  }
  let datos
  try {
    // La decodificación completa rechaza firmas falsas e imágenes truncadas.
    // Se eliminan metadatos y contenido adicional mediante recodificación.
    const imagen = sharp(contenido, { failOn: 'warning', limitInputPixels: 25000000 })
    const metadatos = await imagen.metadata()
    if (metadatos.pages > 1) throw new Error('Imagen animada.')
    datos = await imagen.toFormat(extension === 'jpg' ? 'jpeg' : 'png').toBuffer()
  } catch {
    throw new ErrorComprobante(422, 'El comprobante no es una imagen JPG o PNG válida de hasta 25 millones de píxeles.')
  }
  if (datos.length > LIMITE_ARCHIVO) throw new ErrorComprobante(413, 'La imagen normalizada supera los 5 MB.')
  const base = nombre.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'comprobante'
  return {
    datos, tipo, extension, nombre: `${base}.${extension}`,
    tamanoOriginal: contenido.length,
    huella: createHash('sha256').update(contenido).digest('hex'),
  }
}
