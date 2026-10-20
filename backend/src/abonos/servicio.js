import { createHash } from 'node:crypto'
import { aCentavos, desdeCentavos } from './validacion.js'
import { consultarComprobanteRegistrado, insertarComprobante, presentarComprobante } from '../comprobantes/servicio.js'

export class ErrorAbono extends Error {
  constructor(estado, mensaje) {
    super(mensaje)
    this.estado = estado
  }
}

function presentarAbono(fila) {
  return {
    id: fila.id,
    obligacion_id: fila.obligacion_id,
    monto: fila.monto,
    medio_pago: fila.medio_pago,
    fecha_registro: `${fila.fecha_registro.replace(' ', 'T')}Z`,
    usuario_registrador_id: fila.usuario_registrador_id,
    saldo_resultante: fila.saldo_resultante,
  }
}

const CONSULTA_ABONO = `SELECT id, obligacion_id, monto, medio_pago, fecha_registro,
  usuario_registrador_id, saldo_resultante, huella_solicitud FROM abonos
  WHERE usuario_registrador_id = ? AND clave_idempotencia = ?`

function calcularHuella(obligacionId, entrada, comprobante) {
  const datos = [obligacionId, entrada.monto, entrada.medio_pago]
  if (comprobante) datos.push(comprobante.huella)
  return createHash('sha256')
    .update(JSON.stringify(datos))
    .digest('hex')
}

function verificarReintento(fila, huella) {
  if (fila.huella_solicitud !== huella) {
    throw new ErrorAbono(409, 'La clave de operación ya fue utilizada con otros datos.')
  }
  return { nuevo: false, abono: presentarAbono(fila) }
}

// La ruta pública utiliza exclusivamente registrarAbonoConComprobante. La operación
// monetaria también se conserva para preparar escenarios históricos de pruebas.
export async function registrarAbono(conexiones, obligacionId, entrada, usuarioId, evidencia) {
  const conexion = await conexiones.getConnection()
  const huella = calcularHuella(obligacionId, entrada, evidencia?.comprobante)
  let identificadorArchivo
  let confirmacionIniciada = false
  const recuperarReintento = async (fila) => {
    const resultado = verificarReintento(fila, huella)
    if (evidencia) {
      const comprobante = await consultarComprobanteRegistrado(conexion, fila.id)
      if (!comprobante || comprobante.huella_archivo !== evidencia.comprobante.huella) throw new ErrorAbono(409, 'No se pudo verificar la evidencia de la operación anterior.')
      resultado.comprobante = presentarComprobante(comprobante)
    }
    return resultado
  }
  try {
    await conexion.beginTransaction()
    // Lectura rápida sin bloqueo: los reintentos conservan la respuesta histórica.
    const [[anterior]] = await conexion.execute(CONSULTA_ABONO, [usuarioId, entrada.clave_idempotencia])
    if (anterior) {
      const resultado = await recuperarReintento(anterior)
      await conexion.commit()
      return resultado
    }
    // Todas las escrituras bloquean primero la obligación. La segunda lectura es
    // actual (FOR UPDATE), incluso bajo REPEATABLE READ tras esperar otro abono.
    const [[obligacion]] = await conexion.execute('SELECT id, saldo_pendiente FROM obligaciones WHERE id = ? FOR UPDATE', [obligacionId])
    if (!obligacion) throw new ErrorAbono(404, 'Obligación no encontrada.')
    const [[reintento]] = await conexion.execute(`${CONSULTA_ABONO} FOR UPDATE`, [usuarioId, entrada.clave_idempotencia])
    if (reintento) {
      const resultado = await recuperarReintento(reintento)
      await conexion.commit()
      return resultado
    }
    const saldo = aCentavos(obligacion.saldo_pendiente)
    const monto = aCentavos(entrada.monto)
    if (saldo === 0n || monto > saldo) throw new ErrorAbono(409, 'La obligación está pagada o el abono supera su saldo pendiente.')
    const saldoRestante = desdeCentavos(saldo - monto)
    await conexion.execute(`INSERT INTO abonos
      (obligacion_id, monto, medio_pago, usuario_registrador_id, clave_idempotencia, saldo_resultante, huella_solicitud)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [obligacionId, entrada.monto, entrada.medio_pago, usuarioId, entrada.clave_idempotencia, saldoRestante, huella])
    await conexion.execute('UPDATE obligaciones SET saldo_pendiente = ? WHERE id = ?', [saldoRestante, obligacionId])
    const [[registrado]] = await conexion.execute(`${CONSULTA_ABONO} FOR UPDATE`, [usuarioId, entrada.clave_idempotencia])
    const resultado = { nuevo: true, abono: presentarAbono(registrado) }
    if (evidencia) {
      identificadorArchivo = await evidencia.almacen.guardar(evidencia.comprobante.datos, evidencia.comprobante.extension)
      resultado.comprobante = await insertarComprobante(conexion, registrado.id, identificadorArchivo, evidencia.comprobante)
    }
    confirmacionIniciada = true
    await conexion.commit()
    return resultado
  } catch (error) {
    try { await conexion.rollback() } catch { console.error('No se pudo revertir el registro del abono.') }
    // Un COMMIT con respuesta perdida puede haberse confirmado: conservar el
    // archivo permite reintentar con la misma clave sin perder la evidencia.
    if (identificadorArchivo && !confirmacionIniciada) {
      try { await evidencia.almacen.eliminar(identificadorArchivo) } catch { console.error('Comprobante pendiente de reconciliación.') }
    }
    // La misma clave puede competir entre obligaciones distintas: la restricción
    // única decide el ganador y se consulta su registro después del rollback.
    if (error.code === 'ER_DUP_ENTRY') {
      const [[anterior]] = await conexion.execute(CONSULTA_ABONO, [usuarioId, entrada.clave_idempotencia])
      if (anterior) return await recuperarReintento(anterior)
    }
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
      throw new ErrorAbono(409, 'Otra operación está actualizando el saldo. Reintenta con la misma clave.')
    }
    throw error
  } finally {
    conexion.release()
  }
}

export async function registrarAbonoConComprobante(conexiones, obligacionId, entrada, usuarioId, comprobante, almacen) {
  if (!comprobante?.datos?.length || !almacen) throw new ErrorAbono(422, 'La evidencia del pago es obligatoria.')
  return registrarAbono(conexiones, obligacionId, entrada, usuarioId, { comprobante, almacen })
}
