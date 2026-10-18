const CAMPOS_PERMITIDOS = ['concepto', 'beneficiario', 'monto', 'fecha_limite']

function validarTexto(valor) {
  return typeof valor === 'string' ? valor.trim() : ''
}

function normalizarMonto(valor) {
  // DECIMAL(13,2): hasta once enteros y dos decimales, siempre en soles (S/).
  // Se trabaja con cadenas para no introducir redondeos de punto flotante.
  if (typeof valor !== 'string' || valor !== valor.trim() || !/^\d{1,11}(?:\.\d{1,2})?$/.test(valor) || !/[1-9]/.test(valor)) return null
  const [enteros, decimales = ''] = valor.split('.')
  return `${enteros.replace(/^0+(?=\d)/, '')}.${decimales.padEnd(2, '0')}`
}

function esFechaValida(valor) {
  if (typeof valor !== 'string' || valor.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [anio, mes, dia] = valor.split('-').map(Number)
  if (anio < 1000 || mes < 1 || mes > 12 || dia < 1) return false
  const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)
  const diasPorMes = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return dia <= diasPorMes[mes - 1]
}

export function validarObligacion(cuerpo) {
  const campos = {}
  const concepto = validarTexto(cuerpo?.concepto)
  const beneficiario = validarTexto(cuerpo?.beneficiario)
  const monto = normalizarMonto(cuerpo?.monto)
  const fechaLimite = cuerpo?.fecha_limite

  if (!concepto || [...concepto].length > 255) campos.concepto = 'Ingresa un concepto de entre 1 y 255 caracteres.'
  if (!beneficiario || [...beneficiario].length > 255) campos.beneficiario = 'Ingresa un beneficiario de entre 1 y 255 caracteres.'
  if (monto === null) campos.monto = 'Ingresa el monto en soles (S/) como cadena decimal, mayor que cero, con hasta dos decimales y máximo 99999999999.99.'
  if (!esFechaValida(fechaLimite)) campos.fecha_limite = 'Ingresa una fecha válida en formato YYYY-MM-DD, entre 1000-01-01 y 9999-12-31.'
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || Object.keys(cuerpo).some((clave) => !CAMPOS_PERMITIDOS.includes(clave))) {
    campos.form = 'Envía únicamente concepto, beneficiario, monto y fecha_limite.'
  }

  return { concepto, beneficiario, monto, fecha_limite: fechaLimite, fields: campos }
}
