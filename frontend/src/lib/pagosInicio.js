import { convertirACentimos } from './validarAbono'

const formatoDia = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function fechaActualLima(ahora = new Date()) {
  const partes = Object.fromEntries(formatoDia.formatToParts(ahora).map(({ type, value }) => [type, value]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

export function actualizarEstadoObligacion(obligacion, hoy = fechaActualLima()) {
  const saldo = convertirACentimos(obligacion.saldo_pendiente)
  const monto = convertirACentimos(obligacion.monto_original)
  return {
    ...obligacion,
    estado_economico: saldo === 0n ? 'PAGADO' : saldo === monto ? 'PENDIENTE' : 'PARCIAL',
    vencida: saldo > 0n && obligacion.fecha_limite < hoy,
  }
}

export function seleccionarPagosInicio(obligaciones, hoy = fechaActualLima(), mes = hoy.slice(5, 7)) {
  const periodo = `${hoy.slice(0, 4)}-${mes}-`
  const grupo = (obligacion) => obligacion.vencida ? 0 : obligacion.estado_economico === 'PAGADO' ? 2 : 1
  return obligaciones
    .filter((obligacion) => obligacion.fecha_limite.startsWith(periodo))
    .map((obligacion) => actualizarEstadoObligacion(obligacion, hoy))
    .sort((primero, segundo) => grupo(primero) - grupo(segundo)
      || primero.fecha_limite.localeCompare(segundo.fecha_limite) || primero.id - segundo.id)
}

export function esObligacionValida(obligacion) {
  const saldo = convertirACentimos(obligacion?.saldo_pendiente)
  const monto = convertirACentimos(obligacion?.monto_original)
  return Number.isSafeInteger(obligacion?.id) && obligacion.id > 0
    && typeof obligacion.concepto === 'string' && typeof obligacion.beneficiario === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(obligacion.fecha_limite)
    && saldo !== null && monto !== null && monto > 0n && saldo <= monto
}

export function formatearFechaObligacion(fecha) {
  return fecha.split('-').reverse().join('/')
}
