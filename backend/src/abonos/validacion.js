export const MEDIOS_PAGO = ['Efectivo', 'Transferencia bancaria', 'Tarjeta', 'Billetera digital']

export function aCentavos(monto) {
  const [soles, decimales = ''] = monto.split('.')
  return BigInt(soles) * 100n + BigInt(decimales.padEnd(2, '0'))
}

export function desdeCentavos(centavos) {
  return `${centavos / 100n}.${String(centavos % 100n).padStart(2, '0')}`
}

export function validarRegistroAbono(cuerpo) {
  const campos = {}
  let monto
  if (typeof cuerpo?.monto !== 'string' || !/^\d{1,11}(?:\.\d{1,2})?$/.test(cuerpo.monto) || aCentavos(cuerpo.monto) <= 0n) {
    campos.monto = 'Ingresa el monto en soles (S/) como cadena decimal positiva con hasta dos decimales.'
  } else monto = desdeCentavos(aCentavos(cuerpo.monto))
  if (!MEDIOS_PAGO.includes(cuerpo?.medio_pago)) campos.medio_pago = 'Selecciona un medio de pago válido.'
  if (typeof cuerpo?.clave_idempotencia !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(cuerpo.clave_idempotencia)) {
    campos.clave_idempotencia = 'Envía una clave de operación de 16 a 128 letras, números, guiones o guiones bajos.'
  }
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || Object.keys(cuerpo).some((clave) => !['monto', 'medio_pago', 'clave_idempotencia'].includes(clave))) {
    campos.form = 'Envía únicamente monto, medio_pago y clave_idempotencia.'
  }
  return { monto, medio_pago: cuerpo?.medio_pago, clave_idempotencia: cuerpo?.clave_idempotencia, fields: campos }
}
