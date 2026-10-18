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
  try {
    await conexiones.execute('DELETE FROM abonos WHERE obligacion_id = ?', [identificador])
    await conexiones.execute('DELETE FROM obligaciones WHERE id = ? AND usuario_creador_id = ?', [identificador, usuario.id])
  }
  finally { await conexiones.end() }
})

test('HU-03 registra abonos parciales y completos y actualiza el saldo real', async ({ page: pagina }) => {
  await pagina.goto('/#/login')
  await pagina.getByLabel('Correo electrónico').fill(usuario.email)
  await pagina.getByLabel('Contraseña', { exact: true }).fill(usuario.password)
  await pagina.getByRole('button', { name: 'Ingresar' }).click()
  await pagina.getByRole('button', { name: 'Registrar pagos realizados', exact: true }).click()
  await expect(pagina.getByRole('option', { name: `${concepto} — S/ 120.50`, exact: true })).toBeAttached()
  await pagina.getByLabel('Pago pendiente', { exact: true }).selectOption(String(identificador))
  await expect(pagina.getByLabel('Monto del abono (S/)')).toBeVisible()
  const escrituras = []
  pagina.on('request', (solicitud) => {
    if (solicitud.method() === 'POST') escrituras.push({ url: solicitud.url(), body: solicitud.postDataJSON() })
  })
  await pagina.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(pagina.getByText('Ingresa el monto del abono en soles.', { exact: true })).toBeVisible()
  await expect(pagina.getByText('Selecciona el medio de pago utilizado.', { exact: true })).toBeVisible()
  await pagina.getByLabel('Monto del abono (S/)').fill('120.51')
  await pagina.getByLabel('Medio de pago', { exact: true }).selectOption('Efectivo')
  await pagina.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(pagina.getByText('El abono no puede superar el saldo pendiente.', { exact: true })).toBeVisible()
  await pagina.getByLabel('Monto del abono (S/)').fill('25.50')
  await pagina.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(pagina.getByText('Abono registrado correctamente.')).toBeVisible()
  await expect(pagina.getByText('S/ 95.00')).toBeVisible()
  await pagina.getByLabel('Monto del abono (S/)').fill('95.00')
  await pagina.getByLabel('Medio de pago', { exact: true }).selectOption('Transferencia bancaria')
  await pagina.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(pagina.getByText('Abono registrado correctamente.')).toBeVisible()
  await expect(pagina.getByText('PAGADO')).toBeVisible()
  await expect(pagina.getByText('S/ 0.00')).toBeVisible()
  expect(escrituras).toHaveLength(2)
  expect(escrituras[0].url).toContain(`/api/obligaciones/${identificador}/abonos`)
  expect(escrituras[0].body).toMatchObject({
    monto: '25.50',
    medio_pago: 'Efectivo',
    clave_idempotencia: expect.any(String),
  })
  expect(escrituras[0].body.clave_idempotencia).not.toBe(escrituras[1].body.clave_idempotencia)
  const { pool: conexiones } = await abrirBasePruebas()
  try {
    const [[fila]] = await conexiones.execute('SELECT saldo_pendiente FROM obligaciones WHERE id = ?', [identificador])
    expect(fila.saldo_pendiente).toBe('0.00')
    const [[abonos]] = await conexiones.execute('SELECT COUNT(*) AS cantidad, SUM(monto) AS total FROM abonos WHERE obligacion_id = ?', [identificador])
    expect(Number(abonos.cantidad)).toBe(2)
    expect(abonos.total).toBe('120.50')
  } finally { await conexiones.end() }
  await pagina.setViewportSize({ width: 390, height: 844 })
  expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
