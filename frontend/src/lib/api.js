const urlApi = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')

export class ErrorApi extends Error {
  constructor(mensaje, estado = 0, campos = {}) {
    super(mensaje)
    this.name = 'ApiError'
    this.status = estado
    this.fields = campos
  }
}

export async function solicitarApi(ruta, { token, method: metodo = 'GET', body: cuerpo, signal: senal } = {}) {
  const tiempoLimite = AbortSignal.timeout(10000)
  let respuesta
  try {
    respuesta = await fetch(`${urlApi}${ruta}`, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: senal ? AbortSignal.any([senal, tiempoLimite]) : tiempoLimite,
      credentials: 'omit',
      cache: 'no-store',
    })
  } catch (error) {
    if (senal?.aborted) throw error
    throw new ErrorApi('No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.')
  }
  if (respuesta.status === 204) return null
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw new ErrorApi(datos?.message || 'No se pudo completar la operación.', respuesta.status, datos?.fields)
  if (!datos) throw new ErrorApi('El servidor envió una respuesta inesperada.')
  return datos
}
