export const tamanoMaximoComprobante = 5 * 1024 * 1024

export function validarComprobante(archivo) {
  if (!archivo) return ''
  if (!archivo.size) return 'El comprobante está vacío. Selecciona una imagen JPG o PNG.'
  const extensionValida = /\.(jpe?g|png)$/i.test(archivo.name)
  const tipoValido = ['image/jpeg', 'image/png'].includes(archivo.type)
  if (!extensionValida || !tipoValido) return 'El comprobante debe ser una imagen JPG o PNG.'
  if (archivo.size > tamanoMaximoComprobante) return 'El comprobante no debe superar los 5 MB.'
  return ''
}
