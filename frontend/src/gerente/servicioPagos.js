export class ErrorIntegracionPendiente extends Error {
  constructor() {
    super('La consulta de pagos aún no está conectada al servidor. No hay datos disponibles para consultar.')
  }
}

// Sustituir este adaptador cuando el equipo acuerde el endpoint y su respuesta.
// Recibe { mes, anio, solicitar, senal }; devuelve una promesa con la lista de pagos.
// Usar solicitar del contexto de autenticación, conservando Bearer y el manejo de 401.
export async function consultarPagosDelMes() {
  throw new ErrorIntegracionPendiente()
}
