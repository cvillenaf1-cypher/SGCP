const nombresEstado = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', PAGADO: 'Pagado' }

export async function consultarPagosDelMes({ solicitar, senal }) {
  // El listado existente incluye obligaciones pagadas; el período se filtra por fecha límite.
  const datos = await solicitar('/api/obligaciones', { signal: senal })
  if (!Array.isArray(datos?.obligaciones)) throw new Error('El servidor envió una lista de pagos inválida.')
  return datos.obligaciones.map((obligacion) => {
    if (typeof obligacion.fecha_limite !== 'string' || !nombresEstado[obligacion.estado_economico]) {
      throw new Error('El servidor envió un pago inválido.')
    }
    return {
      id: obligacion.id, concepto: obligacion.concepto, beneficiario: obligacion.beneficiario,
      montoOriginal: obligacion.monto_original, saldoPendiente: obligacion.saldo_pendiente,
      fechaLimite: obligacion.fecha_limite, estado: nombresEstado[obligacion.estado_economico],
    }
  })
}
