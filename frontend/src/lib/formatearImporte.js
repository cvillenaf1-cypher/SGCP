export function formatearImporte(importe) {
  // Conserva la precisión de las cadenas decimales recibidas de MySQL.
  const [soles, centimos = ''] = importe.split('.')
  return `S/ ${soles.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${centimos.padEnd(2, '0')}`
}
