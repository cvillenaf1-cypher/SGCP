import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { abrirBasePruebas } from '../../backend/test/support/database.js'
import { fechaActualNegocio } from '../../backend/src/obligaciones/consulta.js'

const concepto = `Consulta HU-02 ${randomUUID()}`
const fechaLimite = fechaActualNegocio()
let identificador
let usuario

test.beforeAll(async ({ request: solicitudes }) => {
  usuario = JSON.parse(process.env.SGCP_E2E_USERS).find((entrada) => entrada.role === 'ASISTENTE')
  const acceso = await solicitudes.post('http://127.0.0.1:3001/api/auth/login', { data: { email: usuario.email, password: usuario.password } })
  expect(acceso.status()).toBe(200)
  const sesion = await acceso.json()
  const respuesta = await solicitudes.post('http://127.0.0.1:3001/api/obligaciones', {
    headers: { Authorization: `Bearer ${sesion.token}` },
    data: { concepto, beneficiario: 'Proveedor de prueba', monto: '120.50', fecha_limite: fechaLimite },
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

test('ASISTENTE ve automáticamente una deuda del mes, abre detalle y conserva la vista móvil', async ({ page: pagina }) => {
  await pagina.goto('/#/login')
  await pagina.getByLabel('Correo electrónico').fill(usuario.email)
  await pagina.getByLabel('Contraseña', { exact: true }).fill(usuario.password)
  await pagina.getByRole('button', { name: /^Iniciar sesión/ }).click()
  const fila = pagina.getByRole('row').filter({ hasText: concepto })
  await expect(fila).toBeVisible()
  await expect(fila.getByText('Pendiente', { exact: true })).toBeVisible()
  await expect(fila.getByText('S/ 120.50', { exact: true })).toHaveCount(2)
  await fila.getByRole('button', { name: `Ver detalles de ${concepto} (#${identificador})`, exact: true }).click()
  const detalle = pagina.getByRole('dialog', { name: `Detalle de la obligación #${identificador}` })
  await expect(detalle.getByText(concepto, { exact: true }).first()).toBeVisible()
  await expect(detalle.getByText(fechaLimite.split('-').reverse().join('/'), { exact: true })).toBeVisible()
  await expect(pagina.getByLabel('Filtrar pagos')).toHaveCount(0)
  await detalle.getByRole('button', { name: 'Cerrar detalles' }).click()
  await pagina.setViewportSize({ width: 390, height: 844 })
  await expect(fila).toBeVisible()
  expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
