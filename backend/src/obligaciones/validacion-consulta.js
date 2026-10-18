const FILTROS_PERMITIDOS = ['pendiente', 'parcial', 'pagado', 'vencido']

export function validarFiltroConsulta(consulta = {}) {
  const campos = {}
  const filtro = consulta?.filtro
  if (filtro !== undefined && (typeof filtro !== 'string' || !FILTROS_PERMITIDOS.includes(filtro))) {
    campos.filtro = 'El filtro debe ser pendiente, parcial, pagado o vencido.'
  }
  if (!consulta || typeof consulta !== 'object' || Array.isArray(consulta) || Object.keys(consulta).some((clave) => clave !== 'filtro')) {
    campos.form = 'Envía únicamente el parámetro opcional filtro.'
  }
  return { filtro, fields: campos }
}

export function validarIdentificadorObligacion(valor) {
  const campos = {}
  const id = typeof valor === 'string' && valor.length <= 10 ? Number(valor) : NaN
  if (!Number.isInteger(id) || id < 1 || id > 4294967295 || String(id) !== valor) {
    campos.id = 'Ingresa un identificador entero entre 1 y 4294967295, sin ceros iniciales.'
  }
  return { id, fields: campos }
}
