const FORMATO_FECHA_NEGOCIO = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
})

const CONSULTA_BASE = `SELECT id, concepto, beneficiario, monto_original, saldo_pendiente,
  fecha_limite, fecha_registro, usuario_creador_id FROM obligaciones`

// Solo se incorporan fragmentos constantes; los valores variables usan placeholders.
const CONDICIONES_FILTRO = new Map([
  ['pendiente', 'saldo_pendiente = monto_original'],
  ['parcial', 'saldo_pendiente > 0 AND saldo_pendiente < monto_original'],
  ['pagado', 'saldo_pendiente = 0'],
  ['vencido', 'saldo_pendiente > 0 AND fecha_limite < ?'],
])

export function fechaActualNegocio(ahora = new Date()) {
  const partes = Object.fromEntries(FORMATO_FECHA_NEGOCIO.formatToParts(ahora).map(({ type: tipo, value: valor }) => [tipo, valor]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

function convertirACentavos(monto) {
  const [soles, decimales = ''] = monto.split('.')
  return BigInt(soles) * 100n + BigInt(decimales.padEnd(2, '0'))
}

export function presentarObligacion(fila, fechaNegocio) {
  const saldo = convertirACentavos(fila.saldo_pendiente)
  const monto = convertirACentavos(fila.monto_original)
  const estadoEconomico = saldo === 0n ? 'PAGADO' : saldo === monto ? 'PENDIENTE' : 'PARCIAL'
  return {
    ...fila,
    fecha_registro: `${fila.fecha_registro.replace(' ', 'T')}Z`,
    estado_economico: estadoEconomico,
    vencida: fila.fecha_limite < fechaNegocio && saldo > 0n,
  }
}

export async function listarObligaciones(conexiones, filtro, fechaNegocio = fechaActualNegocio()) {
  const condicion = CONDICIONES_FILTRO.get(filtro)
  const [filas] = await conexiones.execute(
    `${CONSULTA_BASE}${condicion ? ` WHERE ${condicion}` : ''} ORDER BY fecha_registro DESC, id DESC`,
    filtro === 'vencido' ? [fechaNegocio] : [],
  )
  return filas.map((fila) => presentarObligacion(fila, fechaNegocio))
}

export async function obtenerObligacion(conexiones, id, fechaNegocio = fechaActualNegocio()) {
  const [filas] = await conexiones.execute(`${CONSULTA_BASE} WHERE id = ?`, [id])
  return filas.length ? presentarObligacion(filas[0], fechaNegocio) : null
}
