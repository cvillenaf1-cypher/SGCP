import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { abrirBasePruebas } from '../../backend/test/support/database.js'

const concepto = `Consulta HU-02 ${randomUUID()}`
let identificador
let usuario

test.beforeAll(async ({ request: solicitudes }) => {
  usuario = JSON.parse(process.env.SGCP_E2E_USERS).find((entrada) => entrada.role === 'ASISTENTE')
  const acceso = await solicitudes.post('http://127.0.0.1:3001/api/auth/login', { data: { email: usuario.email, password: usuario.password } })
  expect(acceso.status()).toBe(200)
  const sesion = await acceso.json()
  const respuesta = await solicitudes.post('http://127.0.0.1:3001/api/obligaciones', {
    headers: { Authorization: `Bearer ${sesion.token}` },
    data: { concepto, beneficiario: 'Proveedor de prueba', monto: '120.50', fecha_limite: '2020-01-15' },
  })
  expect(respuesta.status()).toBe(201)
  identificador = (await respuesta.json()).obligacion.id
})

test.afterAll(async () => {
  if (!identificador) return
  const { pool: conexiones } = await abrirBasePruebas()
  try {
    await conexiones.execute('DELETE FROM obligaciones WHERE id = ? AND usuario_creador_id = ?', [identificador, usuario.id])
  } finally { await conexiones.end() }
})

test('ASISTENTE consulta obligaciones reales, filtra, abre detalle y conserva la vista móvil', async ({ page: pagina }) => {
  await pagina.goto('/#/login')
  await pagina.getByLabel('Correo electrónico').fill(usuario.email)
  await pagina.getByLabel('Contraseña', { exact: true }).fill(usuario.password)
  await pagina.getByRole('button', { name: 'Ingresar' }).click()
  await pagina.getByRole('button', { name: 'Consultar pagos pendientes', exact: true }).click()
  const fila = pagina.getByRole('row').filter({ has: pagina.getByRole('rowheader', { name: concepto, exact: true }) })
  await expect(fila).toBeVisible()
  await expect(fila.getByText('Pendiente', { exact: true })).toBeVisible()
  await expect(fila.getByText('Vencida', { exact: true })).toBeVisible()
  await expect(fila.getByText('S/ 120.50', { exact: true })).toHaveCount(2)
  await fila.getByRole('button', { name: `Ver detalle de ${concepto}`, exact: true }).click()
  const detalle = pagina.getByRole('region', { name: 'Detalle del pago seleccionado' })
  await expect(detalle.getByText(concepto, { exact: true })).toBeVisible()
  await expect(detalle.getByText('15/01/2020', { exact: true })).toBeVisible()
  for (const filtro of ['pendiente', 'vencido']) {
    await pagina.getByLabel('Filtrar pagos').selectOption(filtro)
    await expect(fila).toBeVisible()
  }
  for (const filtro of ['parcial', 'pagado']) {
    await pagina.getByLabel('Filtrar pagos').selectOption(filtro)
    await expect(pagina.getByText('Cargando pagos pendientes…')).toBeHidden()
    await expect(fila).toHaveCount(0)
  }
  await pagina.getByLabel('Filtrar pagos').selectOption('')
  await expect(fila).toBeVisible()
  await pagina.setViewportSize({ width: 390, height: 844 })
  await expect(pagina.getByLabel('Filtrar pagos')).toBeVisible()
  expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
