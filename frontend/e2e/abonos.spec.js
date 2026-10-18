import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { abrirBasePruebas } from '../../backend/test/support/database.js'

const concepto = `Abono HU-03 ${randomUUID()}`
let usuario
let identificador

test.beforeAll(async ({ request: solicitudes }) => {
  usuario = JSON.parse(process.env.SGCP_E2E_USERS).find((entrada) => entrada.role === 'ASISTENTE')
  const acceso = await solicitudes.post('http://127.0.0.1:3001/api/auth/login', { data: { email: usuario.email, password: usuario.password } })
  expect(acceso.status()).toBe(200)
  const sesion = await acceso.json()
  const respuesta = await solicitudes.post('http://127.0.0.1:3001/api/obligaciones', {
    headers: { Authorization: `Bearer ${sesion.token}` },
    data: { concepto, beneficiario: 'Proveedor de prueba', monto: '120.50', fecha_limite: '2026-10-30' },
  })
  expect(respuesta.status()).toBe(201)
  identificador = (await respuesta.json()).obligacion.id
})

test.afterAll(async () => {
  if (!identificador) return
  const { pool: conexiones } = await abrirBasePruebas()
  try { await conexiones.execute('DELETE FROM obligaciones WHERE id = ? AND usuario_creador_id = ?', [identificador, usuario.id]) }
  finally { await conexiones.end() }
})

test('HU-03 consulta saldos reales y valida sin guardar mientras falta el backend de abonos', async ({ page: pagina }) => {
  await pagina.goto('/#/login')
  await pagina.getByLabel('Correo electrónico').fill(usuario.email)
  await pagina.getByLabel('Contraseña', { exact: true }).fill(usuario.password)
  await pagina.getByRole('button', { name: 'Ingresar' }).click()
  await pagina.getByRole('button', { name: 'Registrar pagos realizados', exact: true }).click()
  await expect(pagina.getByRole('option', { name: `${concepto} — S/ 120.50`, exact: true })).toBeAttached()
  await pagina.getByLabel('Pago pendiente', { exact: true }).selectOption(String(identificador))
  await expect(pagina.getByLabel('Monto del abono (S/)')).toBeVisible()
  const escrituras = []
  pagina.on('request', (solicitud) => { if (solicitud.method() === 'POST') escrituras.push(solicitud.url()) })
  await pagina.getByRole('button', { name: 'Validar abono' }).click()
  await expect(pagina.getByText('Ingresa el monto del abono en soles.', { exact: true })).toBeVisible()
  await expect(pagina.getByText('Selecciona el medio de pago utilizado.', { exact: true })).toBeVisible()
  await pagina.getByLabel('Monto del abono (S/)').fill('120.51')
  await pagina.getByLabel('Medio de pago', { exact: true }).selectOption('Efectivo')
  await pagina.getByRole('button', { name: 'Validar abono' }).click()
  await expect(pagina.getByText('El abono no puede superar el saldo pendiente.', { exact: true })).toBeVisible()
  await pagina.getByLabel('Monto del abono (S/)').fill('120.50')
  for (let pulsacion = 0; pulsacion < 3; pulsacion++) await pagina.getByRole('button', { name: 'Validar abono' }).click()
  await expect(pagina.getByRole('status').filter({ hasText: 'Los datos del abono son válidos.' })).toContainText('no se guardó ningún movimiento ni se modificó el saldo')
  expect(escrituras).toEqual([])
  const { pool: conexiones } = await abrirBasePruebas()
  try {
    const [[fila]] = await conexiones.execute('SELECT saldo_pendiente FROM obligaciones WHERE id = ?', [identificador])
    expect(fila.saldo_pendiente).toBe('120.50')
  } finally { await conexiones.end() }
  await pagina.setViewportSize({ width: 390, height: 844 })
  await expect(pagina.getByLabel('Monto del abono (S/)')).toBeVisible()
  expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
