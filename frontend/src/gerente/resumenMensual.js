import { fechaActualLima } from '../lib/pagosInicio'

function convertirACentavos(monto) {
  if (typeof monto !== 'string' || !/^\d+(\.\d{1,2})?$/.test(monto)) {
    throw new Error('El servidor envió un importe inválido.')
  }
  const [soles, decimales = ''] = monto.split('.')
  return BigInt(soles) * 100n + BigInt(decimales.padEnd(2, '0'))
}

export function calcularResumenMensual(obligaciones, mes, anio, hoy = fechaActualLima()) {
  if (!Array.isArray(obligaciones) || obligaciones.some((obligacion) =>
    !Number.isSafeInteger(obligacion?.id) || obligacion.id <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(obligacion.fecha_limite))) {
    throw new Error('El servidor envió una lista de pagos inválida.')
  }
  const periodo = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-`
  const resumen = { comprometido: 0n, abonado: 0n, pendiente: 0n, vencido: 0n, cantidad: 0, cantidadVencidas: 0 }
  const contabilizadas = new Set()
  for (const obligacion of obligaciones) {
    if (contabilizadas.has(obligacion.id)) continue
    contabilizadas.add(obligacion.id)
    const monto = convertirACentavos(obligacion.monto_original)
    const saldo = convertirACentavos(obligacion.saldo_pendiente)
    if (saldo > monto) throw new Error('El servidor envió un saldo inválido.')
    if (obligacion.fecha_limite.startsWith(periodo)) {
      resumen.comprometido += monto
      // El backend descuenta cada abono del saldo, sin importar cuándo se registró.
      resumen.abonado += monto - saldo
      resumen.pendiente += saldo
      resumen.cantidad += 1
    }
    // El acumulado depende de hoy en Lima, nunca del filtro mensual de la tabla.
    if (obligacion.fecha_limite < hoy && saldo > 0n) {
      resumen.vencido += saldo
      resumen.cantidadVencidas += 1
    }
  }
  return resumen
}

const formatoEntero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 })

export function formatearCentavos(centavos) {
  return `S/ ${formatoEntero.format(centavos / 100n)}.${String(centavos % 100n).padStart(2, '0')}`
}
