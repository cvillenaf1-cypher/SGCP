import { ErrorComprobante } from './validacion.js'

const CONSULTA = `SELECT abono_id, identificador_archivo, nombre_original, tipo,
  tamano, tamano_original, huella_archivo, fecha_asociacion FROM comprobantes WHERE abono_id = ?`

export async function consultarComprobanteRegistrado(conexion, id) {
  const [[fila]] = await conexion.execute(`${CONSULTA} FOR UPDATE`, [id])
  return fila || null
}

export async function insertarComprobante(conexion, id, identificador, imagen) {
  await conexion.execute(`INSERT INTO comprobantes
    (abono_id, identificador_archivo, nombre_original, tipo, tamano, tamano_original, huella_archivo)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [id, identificador, imagen.nombre, imagen.tipo, imagen.datos.length, imagen.tamanoOriginal, imagen.huella])
  return presentarComprobante(await consultarComprobanteRegistrado(conexion, id))
}

export function presentarComprobante(fila) {
  return {
    abono_id: fila.abono_id, nombre: fila.nombre_original, tipo: fila.tipo,
    tamano: fila.tamano, tamano_original: fila.tamano_original,
    fecha_asociacion: `${fila.fecha_asociacion.replace(' ', 'T')}Z`,
    url_descarga: `/api/abonos/${fila.abono_id}/comprobante/archivo`,
  }
}

export async function autorizarAbono(conexiones, id, usuario, bloquear = false) {
  const [[abono]] = await conexiones.execute(
    `SELECT id, usuario_registrador_id FROM abonos WHERE id = ?${bloquear ? ' FOR UPDATE' : ''}`, [id],
  )
  if (!abono) throw new ErrorComprobante(404, 'Abono no encontrado.')
  if (usuario.role !== 'GERENTE' && abono.usuario_registrador_id !== usuario.id) {
    throw new ErrorComprobante(403, 'No tienes permiso para acceder al comprobante de este abono.')
  }
  return abono
}

export async function obtenerComprobante(conexiones, id, usuario) {
  await autorizarAbono(conexiones, id, usuario)
  const [[fila]] = await conexiones.execute(CONSULTA, [id])
  return fila || null
}

export async function asociarComprobante(conexiones, almacen, id, usuario, imagen) {
  const conexion = await conexiones.getConnection()
  let identificador
  let confirmacionIniciada = false
  try {
    await conexion.beginTransaction()
    await autorizarAbono(conexion, id, usuario, true)
    const [[anterior]] = await conexion.execute(`${CONSULTA} FOR UPDATE`, [id])
    if (anterior) {
      if (anterior.huella_archivo !== imagen.huella) throw new ErrorComprobante(409, 'El abono ya tiene otro comprobante. No se permite reemplazarlo.')
      await conexion.commit()
      return { nuevo: false, comprobante: presentarComprobante(anterior) }
    }
    identificador = await almacen.guardar(imagen.datos, imagen.extension)
    await conexion.execute(`INSERT INTO comprobantes
      (abono_id, identificador_archivo, nombre_original, tipo, tamano, tamano_original, huella_archivo)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, identificador, imagen.nombre, imagen.tipo, imagen.datos.length, imagen.tamanoOriginal, imagen.huella])
    const [[fila]] = await conexion.execute(`${CONSULTA} FOR UPDATE`, [id])
    const resultado = { nuevo: true, comprobante: presentarComprobante(fila) }
    confirmacionIniciada = true
    await conexion.commit()
    return resultado
  } catch (error) {
    try { await conexion.rollback() } catch { console.error('No se pudo revertir la asociación del comprobante.') }
    // Si COMMIT pierde la conexión, su resultado es incierto: conservar el archivo
    // evita borrar un comprobante confirmado. La reconciliación es administrativa.
    if (identificador && !confirmacionIniciada) {
      try { await almacen.eliminar(identificador) } catch { console.error('Quedó un archivo de comprobante pendiente de reconciliación.') }
    }
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_DUP_ENTRY'].includes(error.code)) {
      throw new ErrorComprobante(409, 'Otra carga está asociando el comprobante. Reintenta el mismo archivo.')
    }
    throw error
  } finally { conexion.release() }
}
