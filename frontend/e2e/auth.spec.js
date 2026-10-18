import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

async function login(page, role) {
  const user = JSON.parse(process.env.SGCP_E2E_USERS).find((entry) => entry.role === role)
  await page.goto('/#/login')
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  const response = page.waitForResponse((entry) => entry.url().endsWith('/api/auth/login') && entry.status() === 200)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  const session = await (await response).json()
  await expect(page.getByRole('heading', { name: `Panel de ${role === 'ASISTENTE' ? 'asistente' : 'gerente'}` })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Acceso de')
  return session
}

test('ruta privada sin sesión lleva al login y presenta validaciones', async ({ page }) => {
  await page.goto('/#/gerente')
  await expect(page).toHaveURL(/#\/login$/)
  await page.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/SGCP-1-login.png', import.meta.url)), fullPage: true })
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByText('Ingresa un correo electrónico válido.')).toBeVisible()
})

test('asistente entra, no accede a gerente y logout invalida el token en MySQL', async ({ page }) => {
  const session = await login(page, 'ASISTENTE')
  await page.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/SGCP-1-asistente.png', import.meta.url)), fullPage: true })
  await page.evaluate(() => { window.location.hash = '/gerente' })
  await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible()
  await page.getByRole('link', { name: 'Volver a mi panel' }).click()
  await expect(page.getByRole('heading', { name: 'Panel de asistente' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/#\/login$/)
  const response = await page.request.get('http://127.0.0.1:3001/api/auth/me', { headers: { Authorization: `Bearer ${session.token}` } })
  expect(response.status()).toBe(401)
})

test('gerente tiene panel de lectura y autorización real frente al endpoint de asistente', async ({ page }) => {
  const session = await login(page, 'GERENTE')
  await expect(page.getByText('Solo lectura', { exact: true })).toBeVisible()
  await page.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/SGCP-1-gerente.png', import.meta.url)), fullPage: true })
  const response = await page.request.get('http://127.0.0.1:3001/api/panel/asistente', { headers: { Authorization: `Bearer ${session.token}` } })
  expect(response.status()).toBe(403)
  await page.evaluate(() => { window.location.hash = '/asistente' })
  await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
})

test('recargar elimina la sesión de memoria; no hay tokens en cookies ni Web Storage', async ({ page, context }) => {
  await login(page, 'ASISTENTE')
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 })
  expect(await context.cookies()).toEqual([])
  await page.reload()
  await expect(page).toHaveURL(/#\/login$/)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
})

test('una revocación externa se refleja al volver a consultar un recurso protegido', async ({ page }) => {
  const session = await login(page, 'ASISTENTE')
  const response = await page.request.post('http://127.0.0.1:3001/api/auth/logout', { headers: { Authorization: `Bearer ${session.token}` } })
  expect(response.status()).toBe(204)
  await page.evaluate(() => { window.location.hash = '/gerente' })
  await page.getByRole('link', { name: 'Volver a mi panel' }).click()
  await expect(page).toHaveURL(/#\/login$/)
  await expect(page.getByRole('status')).toContainText('Tu sesión venció o ya no está disponible')
})
