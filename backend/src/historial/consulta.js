import { aCentavos, desdeCentavos } from '../abonos/validacion.js'

// Una sentencia SELECT obtiene una única vista consistente InnoDB, sin bloquear
// pagos ni separar el resumen de sus movimientos. La PK de comprobantes evita
// multiplicar abonos; no se seleccionan rutas, huellas ni claves privadas.
const CONSULTA_HISTORIAL = `SELECT
  o.id AS obligacion_id, o.concepto, o.monto_original, o.saldo_pendiente,
  a.id AS abono_id, a.monto, a.medio_pago, a.fecha_registro,
  a.usuario_registrador_id, c.abono_id AS comprobante_abono_id
  FROM obligaciones o
  LEFT JOIN abonos a ON a.obligacion_id = o.id
  LEFT JOIN comprobantes c ON c.abono_id = a.id
  WHERE o.id = ?
  ORDER BY a.fecha_registro DESC, a.id DESC`

export async function consultarHistorial(conexiones, obligacionId, usuarioId, rol) {
  const [filas] = await conexiones.execute(CONSULTA_HISTORIAL, [obligacionId])
  if (!filas.length) return null
  const obligacion = filas[0]
  let totalCentavos = 0n
  const abonos = filas.filter((fila) => fila.abono_id !== null).map((fila) => {
    totalCentavos += aCentavos(fila.monto)
    const tieneComprobante = fila.comprobante_abono_id !== null
    const puedeDescargar = tieneComprobante && (rol === 'GERENTE' || fila.usuario_registrador_id === usuarioId)
    return {
      id: fila.abono_id,
      monto: fila.monto,
      medio_pago: fila.medio_pago,
      fecha_registro: `${fila.fecha_registro.replace(' ', 'T')}Z`,
      tiene_comprobante: tieneComprobante,
      puede_descargar_comprobante: puedeDescargar,
      url_comprobante: puedeDescargar ? `/api/abonos/${fila.abono_id}/comprobante/archivo` : null,
    }
  })
  const montoOriginal = aCentavos(obligacion.monto_original)
  const saldoPendiente = aCentavos(obligacion.saldo_pendiente)
  const saldoCalculado = montoOriginal - totalCentavos
  const consistente = saldoCalculado === saldoPendiente
  return {
    obligacion_id: obligacion.obligacion_id,
    concepto: obligacion.concepto,
    monto_original: obligacion.monto_original,
    saldo_pendiente: obligacion.saldo_pendiente,
    // Presentar la diferencia no corrige el saldo almacenado al consultar.
    saldo_pendiente_calculado: saldoCalculado < 0n ? `-${desdeCentavos(-saldoCalculado)}` : desdeCentavos(saldoCalculado),
    total_abonado: desdeCentavos(totalCentavos),
    estado_economico: saldoPendiente === 0n ? 'PAGADO' : saldoPendiente === montoOriginal ? 'PENDIENTE' : 'PARCIAL',
    resumen_consistente: consistente,
    advertencia: consistente ? null : 'El saldo de la obligación no coincide con sus abonos registrados. Solicita una revisión; no se ha modificado ningún dato.',
    abonos,
  }
}
