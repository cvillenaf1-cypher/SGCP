import { esObligacionValida, fechaActualLima } from '../lib/pagosInicio'
import { convertirACentimos } from '../lib/validarAbono'

function numeroDiaCivil(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error('El servidor envió una fecha límite inválida.')
  }
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const normalizada = new Date(0)
  normalizada.setUTCFullYear(anio, mes - 1, dia)
  if (anio < 1 || normalizada.getUTCFullYear() !== anio
    || normalizada.getUTCMonth() !== mes - 1 || normalizada.getUTCDate() !== dia) {
    throw new Error('El servidor envió una fecha límite inválida.')
  }
  // Ambas fechas civiles se representan a medianoche UTC, sin zona del navegador ni cambios de horario.
  return normalizada.getTime() / 86400000
}

export function calcularDiasAtraso(fechaLimite, hoy = fechaActualLima()) {
  return Math.max(0, numeroDiaCivil(hoy) - numeroDiaCivil(fechaLimite))
}

export function seleccionarAlertasVencidas(obligaciones, hoy = fechaActualLima()) {
  if (!Array.isArray(obligaciones) || !obligaciones.every(esObligacionValida)) {
    throw new Error('El servidor no devolvió un listado válido de obligaciones.')
  }
  const vencidas = []
  const vencenHoy = []
  for (const obligacion of obligaciones) {
    const diasAtraso = calcularDiasAtraso(obligacion.fecha_limite, hoy)
    if (convertirACentimos(obligacion.saldo_pendiente) === 0n) continue
    if (diasAtraso > 0) vencidas.push({ ...obligacion, diasAtraso })
    else if (obligacion.fecha_limite === hoy) vencenHoy.push({ ...obligacion, diasAtraso: 0 })
  }
  const ordenar = (primera, segunda) => primera.fecha_limite.localeCompare(segunda.fecha_limite) || primera.id - segunda.id
  return { vencidas: vencidas.sort(ordenar), vencenHoy: vencenHoy.sort(ordenar) }
}
