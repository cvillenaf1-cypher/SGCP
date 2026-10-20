import { filtrarPagosPorPeriodo } from './pagosDelMes'

export function obtenerFechaLima(fecha = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(fecha).map(({ type: tipo, value: valor }) => [tipo, valor]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

function convertirACentavos(monto) {
  if (typeof monto !== 'string' || !/^\d+(\.\d{1,2})?$/.test(monto)) {
    throw new Error('El servidor envió un importe inválido.')
  }
  const [soles, decimales = ''] = monto.split('.')
  return BigInt(soles) * 100n + BigInt(decimales.padEnd(2, '0'))
}

export function calcularResumenMensual(pagos, mes, anio, fecha = new Date()) {
  if (!Array.isArray(pagos) || pagos.some((pago) => !/^\d{4}-\d{2}-\d{2}$/.test(pago?.fechaLimite))) {
    throw new Error('El servidor envió una lista de pagos inválida.')
  }
  const hoy = obtenerFechaLima(fecha)
  const resumen = { comprometido: 0n, abonado: 0n, pendiente: 0n, vencido: 0n, cantidad: 0 }
  for (const pago of filtrarPagosPorPeriodo(pagos, mes, anio)) {
    const monto = convertirACentavos(pago.montoOriginal)
    const saldo = convertirACentavos(pago.saldoPendiente)
    if (saldo > monto) throw new Error('El servidor envió un saldo inválido.')
    resumen.comprometido += monto
    // El backend descuenta cada abono del saldo en la misma transacción, sin importar su mes.
    resumen.abonado += monto - saldo
    resumen.pendiente += saldo
    if (pago.fechaLimite < hoy) resumen.vencido += saldo
    resumen.cantidad += 1
  }
  return resumen
}

const formatoEntero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 })

export function formatearCentavos(centavos) {
  return `S/ ${formatoEntero.format(centavos / 100n)}.${String(centavos % 100n).padStart(2, '0')}`
}
