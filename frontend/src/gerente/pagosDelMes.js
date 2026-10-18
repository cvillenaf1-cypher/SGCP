export const meses = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function obtenerPeriodoActual(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', month: 'numeric', year: 'numeric',
  }).formatToParts(fecha)
  return {
    mes: Number(partes.find((parte) => parte.type === 'month').value),
    anio: Number(partes.find((parte) => parte.type === 'year').value),
  }
}

export function filtrarPagosPorPeriodo(pagos, mes, anio) {
  const prefijo = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-`
  return pagos.filter((pago) => pago.fechaLimite.startsWith(prefijo))
}

const formatoMonto = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})

export function formatearSoles(monto) {
  return `S/ ${formatoMonto.format(Number(monto))}`
}

export function formatearFechaLimite(fecha) {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}
