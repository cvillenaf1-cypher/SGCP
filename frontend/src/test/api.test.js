import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { solicitarApi } from '../lib/api'

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

it('cliente API conserva JSON y Authorization para las rutas existentes', async () => {
  fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ abono: { id: 18 } }) })
  await solicitarApi('/api/obligaciones/81/abonos', { token: 'sesion-prueba', method: 'POST', body: { monto: '10.00' } })
  const opciones = fetch.mock.calls[0][1]
  expect(opciones.headers['Content-Type']).toBe('application/json')
  expect(opciones.body).toBe('{"monto":"10.00"}')
  expect(opciones.headers.Authorization).toBe('Bearer sesion-prueba')
})

it('cliente API transmite FormData sin serializar ni fijar Content-Type', async () => {
  fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ comprobante: { abono_id: 18 } }) })
  const cuerpo = new FormData()
  cuerpo.append('comprobante', new File(['png'], 'a.png', { type: 'image/png' }))
  await solicitarApi('/api/abonos/18/comprobante', { token: 'sesion-prueba', method: 'POST', body: cuerpo })
  expect(fetch.mock.calls[0][1].body).toBe(cuerpo)
  expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Content-Type')
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer sesion-prueba')
})

it('cliente API descarga un blob autenticado y conserva errores JSON de permisos', async () => {
  const archivo = new Blob(['png'], { type: 'image/png' })
  fetch.mockResolvedValueOnce({ ok: true, status: 200, blob: async () => archivo })
    .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ message: 'Sin permiso.' }) })
  expect(await solicitarApi('/api/abonos/18/comprobante/archivo', { token: 'sesion-prueba', respuestaComo: 'blob' })).toBe(archivo)
  await expect(solicitarApi('/api/abonos/18/comprobante/archivo', { respuestaComo: 'blob' })).rejects.toMatchObject({ status: 403, message: 'Sin permiso.' })
})
