import { convertirACentimos, MONTO_MAXIMO_CENTIMOS } from './validarAbono'

export function validarFormulario({ concepto, beneficiario, montoOriginal, fechaLimite }) {
  const errores = {}
  for (const [campo, valor, etiqueta] of [['concepto', concepto, 'concepto'], ['beneficiario', beneficiario, 'beneficiario']]) {
    if (!valor.trim()) errores[campo] = `Ingresa el ${etiqueta}.`
    else if ([...valor.trim()].length > 255) errores[campo] = 'Usa como máximo 255 caracteres.'
  }
  if (!montoOriginal.trim()) errores.montoOriginal = 'Ingresa el monto original en soles.'
  else if (Number(montoOriginal) <= 0) errores.montoOriginal = 'El monto debe ser mayor que cero.'
  else if (/^\d+\.\d{3,}$/.test(montoOriginal)) errores.montoOriginal = 'El monto admite como máximo dos decimales.'
  else if (!/^\d{1,11}(?:\.\d{1,2})?$/.test(montoOriginal)) errores.montoOriginal = 'Ingresa un monto válido, con punto decimal y hasta dos decimales.'
  else if (convertirACentimos(montoOriginal) > MONTO_MAXIMO_CENTIMOS) errores.montoOriginal = 'El monto no puede superar S/ 100,000.00.'

  const [anio, mes, dia] = fechaLimite.split('-').map(Number)
  const fecha = new Date(`${fechaLimite}T00:00:00Z`)
  if (!fechaLimite) errores.fechaLimite = 'Ingresa la fecha límite.'
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaLimite) || anio < 1000 || fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() + 1 !== mes || fecha.getUTCDate() !== dia) {
    errores.fechaLimite = 'Ingresa una fecha válida entre los años 1000 y 9999.'
  }
  return errores
}
