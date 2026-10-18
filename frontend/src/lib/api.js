const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status = 0, fields = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

export async function apiRequest(path, { token, method = 'GET', body, signal } = {}) {
  const timeout = AbortSignal.timeout(10000)
  let response
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: 'omit',
      cache: 'no-store',
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.')
  }
  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(data?.message || 'No se pudo completar la operación.', response.status, data?.fields)
  if (!data) throw new ApiError('El servidor envió una respuesta inesperada.')
  return data
}
