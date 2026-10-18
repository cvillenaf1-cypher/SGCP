import { createHash } from 'node:crypto'
import { aCentavos, desdeCentavos } from './validacion.js'

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

function calcularHuella(obligacionId, entrada) {
  return createHash('sha256')
    .update(JSON.stringify([obligacionId, entrada.monto, entrada.medio_pago]))
    .digest('hex')
}

function verificarReintento(fila, huella) {
  if (fila.huella_solicitud !== huella) {
    throw new ErrorAbono(409, 'La clave de operación ya fue utilizada con otros datos.')
  }
  return { nuevo: false, abono: presentarAbono(fila) }
}

export async function registrarAbono(conexiones, obligacionId, entrada, usuarioId) {
  const conexion = await conexiones.getConnection()
  const huella = calcularHuella(obligacionId, entrada)
  try {
    await conexion.beginTransaction()
    // Lectura rápida sin bloqueo: los reintentos conservan la respuesta histórica.
    const [[anterior]] = await conexion.execute(CONSULTA_ABONO, [usuarioId, entrada.clave_idempotencia])
    if (anterior) {
      const resultado = verificarReintento(anterior, huella)
      await conexion.commit()
      return resultado
    }
    // Todas las escrituras bloquean primero la obligación. La segunda lectura es
    // actual (FOR UPDATE), incluso bajo REPEATABLE READ tras esperar otro abono.
    const [[obligacion]] = await conexion.execute('SELECT id, saldo_pendiente FROM obligaciones WHERE id = ? FOR UPDATE', [obligacionId])
    if (!obligacion) throw new ErrorAbono(404, 'Obligación no encontrada.')
    const [[reintento]] = await conexion.execute(`${CONSULTA_ABONO} FOR UPDATE`, [usuarioId, entrada.clave_idempotencia])
    if (reintento) {
      const resultado = verificarReintento(reintento, huella)
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
    await conexion.commit()
    return resultado
  } catch (error) {
    await conexion.rollback()
    // La misma clave puede competir entre obligaciones distintas: la restricción
    // única decide el ganador y se consulta su registro después del rollback.
    if (error.code === 'ER_DUP_ENTRY') {
      const [[anterior]] = await conexion.execute(CONSULTA_ABONO, [usuarioId, entrada.clave_idempotencia])
      if (anterior) return verificarReintento(anterior, huella)
    }
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
      throw new ErrorAbono(409, 'Otra operación está actualizando el saldo. Reintenta con la misma clave.')
    }
    throw error
  } finally {
    conexion.release()
  }
}
