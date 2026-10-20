export const tamanoMaximoComprobante = 5 * 1024 * 1024

export function validarComprobante(archivo) {
  if (!archivo) return 'Adjunta un comprobante o factura del pago. La evidencia es obligatoria.'
  if (!archivo.size) return 'El comprobante está vacío. Selecciona un archivo JPG, PNG o PDF.'
  const extensiones = { 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i, 'application/pdf': /\.pdf$/i }
  if (!extensiones[archivo.type]?.test(archivo.name)) return 'El comprobante debe ser un archivo JPG, PNG o PDF.'
  if (archivo.size > tamanoMaximoComprobante) return 'El comprobante no debe superar los 5 MB.'
  return ''
}
