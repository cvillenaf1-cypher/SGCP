// Solo extrae los campos textuales de solicitudes multipart de estas pruebas.
export function leerAbono(solicitud) {
  const cuerpo = solicitud.postDataBuffer().toString('utf8')
  return Object.fromEntries(['monto', 'medio_pago', 'clave_idempotencia'].map((campo) => {
    const valor = cuerpo.match(new RegExp('name="' + campo + '"\\r\\n\\r\\n([^\\r]*)'))?.[1]
    if (valor === undefined) throw new Error('Falta campo multipart: ' + campo)
    return [campo, valor]
  }))
}

export const evidenciaPrueba = {
  name: 'recibo.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwYMEAoAU7oL9W/sIDEAAAAASUVORK5CYII=', 'base64'),
}

export async function adjuntarEvidencia(pagina) {
  await pagina.getByLabel('Comprobante o factura (obligatorio)').setInputFiles(evidenciaPrueba)
}
