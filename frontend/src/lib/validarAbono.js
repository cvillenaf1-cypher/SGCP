export const mediosPago = ['Efectivo', 'Transferencia bancaria', 'Tarjeta', 'Billetera digital']
export const MONTO_MAXIMO = '100000.00'
export const MONTO_MAXIMO_CENTIMOS = convertirACentimos(MONTO_MAXIMO)

export function convertirACentimos(importe) {
  if (typeof importe !== 'string' || !/^\d{1,11}(?:\.\d{1,2})?$/.test(importe)) return null
  const [soles, centimos = ''] = importe.split('.')
  return BigInt(soles) * 100n + BigInt(centimos.padEnd(2, '0'))
}

export function validarAbono({ montoAbono, medioPago }, saldoPendiente) {
  const errores = {}
  const monto = convertirACentimos(montoAbono)
  const saldo = convertirACentimos(saldoPendiente)
  if (!montoAbono.trim()) errores.montoAbono = 'Ingresa el monto del abono en soles.'
  else if (/^-/.test(montoAbono) || monto === 0n) errores.montoAbono = 'El monto del abono debe ser mayor que cero.'
  else if (/^\d+\.\d{3,}$/.test(montoAbono)) errores.montoAbono = 'El abono admite como máximo dos decimales.'
  else if (monto === null) errores.montoAbono = 'Ingresa un monto válido con punto decimal y hasta dos decimales.'
  else if (monto > MONTO_MAXIMO_CENTIMOS) errores.montoAbono = 'El monto no puede superar S/ 100,000.00.'
  else if (saldo !== null && monto > saldo) errores.montoAbono = 'El abono no puede superar el saldo pendiente.'
  if (saldo === null || saldo <= 0n) errores.obligacion = 'Esta obligación no tiene saldo disponible para registrar abonos.'
  if (!mediosPago.includes(medioPago)) errores.medioPago = 'Selecciona el medio de pago utilizado.'
  return errores
}

export function obtenerMaximoAbono(saldoPendiente) {
  const saldo = convertirACentimos(saldoPendiente)
  return saldo !== null && saldo > MONTO_MAXIMO_CENTIMOS ? MONTO_MAXIMO : saldoPendiente
}
