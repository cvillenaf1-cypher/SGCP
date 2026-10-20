import sharp from 'sharp'
import { crearAlmacenComprobantes } from '../../src/comprobantes/almacen.js'

export const imagenComprobante = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer()

export function adjuntarComprobante(peticion, datos) {
  for (const [campo, valor] of Object.entries(datos)) peticion.field(campo, String(valor))
  return peticion.attach('comprobante', imagenComprobante, { filename: 'recibo.png', contentType: 'image/png' })
}

export const almacenMemoria = () => ({
  guardar: async () => '00000000-0000-4000-8000-000000000001.png',
  eliminar: async () => {},
})

export async function eliminarComprobantesDeObligacion(pool, id) {
  const [archivos] = await pool.execute('SELECT c.identificador_archivo FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [id])
  await pool.execute('DELETE c FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [id])
  const almacen = crearAlmacenComprobantes()
  for (const archivo of archivos) await almacen.eliminar(archivo.identificador_archivo)
}
