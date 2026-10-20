import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

async function iniciarSesion(pagina, rol) {
  const usuario = JSON.parse(process.env.SGCP_E2E_USERS).find((entrada) => entrada.role === rol)
  await pagina.goto('/#/login')
  await pagina.getByLabel('Correo electrónico').fill(usuario.email)
  await pagina.getByLabel('Contraseña').fill(usuario.password)
  const respuesta = pagina.waitForResponse((entrada) => entrada.url().endsWith('/api/auth/login') && entrada.status() === 200)
  await pagina.getByRole('button', { name: /^Iniciar sesión/ }).click()
  const sesion = await (await respuesta).json()
  await expect(pagina.getByRole('heading', { name: `Panel de ${rol === 'ASISTENTE' ? 'asistente' : 'gerente'}` })).toBeVisible()
  await expect(pagina.getByRole('heading', { name: 'Pagos del mes', exact: true })).toBeVisible()
  return sesion
}

test('ruta privada sin sesión lleva al login y presenta validaciones', async ({ page: pagina }) => {
  await pagina.goto('/#/gerente')
  await expect(pagina).toHaveURL(/#\/login$/)
  await pagina.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/SGCP-1-login.png', import.meta.url)), fullPage: true })
  await pagina.getByRole('button', { name: /^Iniciar sesión/ }).click()
  await expect(pagina.getByText('Ingresa un correo electrónico válido.')).toBeVisible()
})

test('asistente entra, no accede a gerente y logout invalida el token en MySQL', async ({ page: pagina }) => {
  const sesion = await iniciarSesion(pagina, 'ASISTENTE')
  await pagina.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/SGCP-1-asistente.png', import.meta.url)), fullPage: true })
  await pagina.evaluate(() => { window.location.hash = '/gerente' })
  await expect(pagina.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible()
  await pagina.getByRole('link', { name: 'Volver a mi panel' }).click()
  await expect(pagina.getByRole('heading', { name: 'Panel de asistente' })).toBeVisible()
  await pagina.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(pagina).toHaveURL(/#\/login$/)
  const respuesta = await pagina.request.get('http://127.0.0.1:3001/api/auth/me', { headers: { Authorization: `Bearer ${sesion.token}` } })
  expect(respuesta.status()).toBe(401)
})

test('gerente tiene panel de lectura y autorización real frente al endpoint de asistente', async ({ page: pagina }) => {
  const sesion = await iniciarSesion(pagina, 'GERENTE')
  await expect(pagina.getByText('Solo lectura', { exact: true })).toBeVisible()
  await pagina.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/SGCP-1-gerente.png', import.meta.url)), fullPage: true })
  const respuesta = await pagina.request.get('http://127.0.0.1:3001/api/panel/asistente', { headers: { Authorization: `Bearer ${sesion.token}` } })
  expect(respuesta.status()).toBe(403)
  await pagina.evaluate(() => { window.location.hash = '/asistente' })
  await expect(pagina.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible()
  await pagina.getByRole('button', { name: 'Cerrar sesión' }).click()
})

test('recargar elimina la sesión de memoria; no hay tokens en cookies ni Web Storage', async ({ page: pagina, context: contexto }) => {
  await iniciarSesion(pagina, 'ASISTENTE')
  expect(await pagina.evaluate(() => ({ local: localStorage.length, sesion: sessionStorage.length }))).toEqual({ local: 0, sesion: 0 })
  expect(await contexto.cookies()).toEqual([])
  await pagina.reload()
  await expect(pagina).toHaveURL(/#\/login$/)
  await expect(pagina.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
})

test('una revocación externa se refleja al volver a consultar un recurso protegido', async ({ page: pagina }) => {
  const sesion = await iniciarSesion(pagina, 'ASISTENTE')
  const respuesta = await pagina.request.post('http://127.0.0.1:3001/api/auth/logout', { headers: { Authorization: `Bearer ${sesion.token}` } })
  expect(respuesta.status()).toBe(204)
  await pagina.evaluate(() => { window.location.hash = '/gerente' })
  await pagina.getByRole('link', { name: 'Volver a mi panel' }).click()
  await expect(pagina).toHaveURL(/#\/login$/)
  await expect(pagina.getByRole('status')).toContainText('Tu sesión venció o ya no está disponible')
})
