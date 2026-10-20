import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'
import { abrirBasePruebas } from '../../backend/test/support/database.js'
import { crearAlmacenComprobantes } from '../../backend/src/comprobantes/almacen.js'

const requerirBackend = createRequire(new URL('../../backend/package.json', import.meta.url))
const sharp = requerirBackend('sharp')
let usuario, obligacionId, concepto, imagen

test.beforeEach(async ({ request: solicitudes }) => {
  usuario = JSON.parse(process.env.SGCP_E2E_USERS).find((entrada) => entrada.role === 'ASISTENTE')
  const acceso = await solicitudes.post('http://127.0.0.1:3001/api/auth/login', { data: { email: usuario.email, password: usuario.password } })
  expect(acceso.status()).toBe(200)
  const sesion = await acceso.json()
  concepto = `Integración HU-04 ${randomUUID()}`
  const respuesta = await solicitudes.post('http://127.0.0.1:3001/api/obligaciones', {
    headers: { Authorization: `Bearer ${sesion.token}` },
    data: { concepto, beneficiario: 'Proveedor de prueba', monto: '40.00', fecha_limite: '2027-01-01' },
  })
  expect(respuesta.status()).toBe(201)
  obligacionId = (await respuesta.json()).obligacion.id
  imagen = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 20, g: 100, b: 30 } } }).png().toBuffer()
})

test.afterEach(async () => {
  if (!obligacionId) return
  const { pool: conexiones } = await abrirBasePruebas()
  try {
    const [archivos] = await conexiones.execute('SELECT c.identificador_archivo FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [obligacionId])
    const almacen = crearAlmacenComprobantes()
    for (const archivo of archivos) await almacen.eliminar(archivo.identificador_archivo)
    await conexiones.execute('DELETE c FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [obligacionId])
    await conexiones.execute('DELETE FROM abonos WHERE obligacion_id = ?', [obligacionId])
    await conexiones.execute('DELETE FROM obligaciones WHERE id = ? AND usuario_creador_id = ?', [obligacionId, usuario.id])
  } finally { await conexiones.end(); obligacionId = null }
})

async function prepararPantalla(pagina, monto) {
  await pagina.goto('/#/login')
  await pagina.getByLabel('Correo electrónico').fill(usuario.email)
  await pagina.getByLabel('Contraseña', { exact: true }).fill(usuario.password)
  await pagina.getByRole('button', { name: /^Iniciar sesión/ }).click()
  await pagina.getByRole('button', { name: 'Registrar pagos realizados', exact: true }).click()
  await pagina.getByLabel('Pago pendiente', { exact: true }).selectOption(String(obligacionId))
  await pagina.getByLabel('Monto del abono (S/)').fill(monto)
  await pagina.getByLabel('Medio de pago', { exact: true }).selectOption('Efectivo')
  await pagina.getByLabel('Comprobante (opcional)').setInputFiles({ name: 'recibo.png', mimeType: 'image/png', buffer: imagen })
  await expect(pagina.getByRole('img', { name: 'Vista previa local de recibo.png' })).toBeVisible()
}

async function verificarPersistencia(saldo, cantidadComprobantes) {
  const { pool: conexiones } = await abrirBasePruebas()
  try {
    const [[obligacion]] = await conexiones.execute('SELECT saldo_pendiente FROM obligaciones WHERE id = ?', [obligacionId])
    const [[abonos]] = await conexiones.execute('SELECT COUNT(*) AS cantidad FROM abonos WHERE obligacion_id = ?', [obligacionId])
    const [[comprobantes]] = await conexiones.execute('SELECT COUNT(*) AS cantidad FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [obligacionId])
    expect(obligacion.saldo_pendiente).toBe(saldo)
    expect(Number(abonos.cantidad)).toBe(1)
    expect(Number(comprobantes.cantidad)).toBe(cantidadComprobantes)
  } finally { await conexiones.end() }
}

test('HU-04: falla la carga, reintenta solo el archivo y permite descargarlo', async ({ page: pagina }) => {
  let registros = 0, cargas = 0, abonoId
  pagina.on('request', (solicitud) => {
    if (solicitud.method() === 'POST' && solicitud.url().endsWith(`/obligaciones/${obligacionId}/abonos`)) registros++
  })
  await pagina.route('**/api/abonos/*/comprobante', async (ruta) => {
    if (ruta.request().method() !== 'POST') return ruta.continue()
    cargas++
    abonoId = Number(ruta.request().url().split('/').at(-2))
    expect(ruta.request().headers()['content-type']).toContain('multipart/form-data')
    if (cargas === 1) return ruta.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Fallo de carga simulado.' }) })
    return ruta.continue()
  })
  await prepararPantalla(pagina, '10.00')
  await pagina.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(pagina.getByText(/Fallo de carga simulado.*El abono ya está registrado/)).toBeVisible()
  await verificarPersistencia('30.00', 0)
  await pagina.getByRole('button', { name: 'Reintentar comprobante' }).click()
  await expect(pagina.getByText('Comprobante asociado correctamente.')).toBeVisible()
  expect(registros).toBe(1)
  expect(cargas).toBe(2)
  const { pool: conexiones } = await abrirBasePruebas()
  try {
    const [[abono]] = await conexiones.execute('SELECT id FROM abonos WHERE obligacion_id = ?', [obligacionId])
    expect(abonoId).toBe(abono.id)
  } finally { await conexiones.end() }
  await verificarPersistencia('30.00', 1)
  await pagina.getByRole('button', { name: 'Consultar comprobante' }).click()
  await expect(pagina.getByText('El servidor confirma que el abono tiene comprobante.')).toBeVisible()
  const descargaPendiente = pagina.waitForEvent('download')
  await pagina.getByRole('button', { name: 'Descargar comprobante' }).click()
  const descarga = await descargaPendiente
  expect(descarga.suggestedFilename()).toBe('recibo.png')
  expect(await descarga.failure()).toBeNull()
})

test('HU-04: respuesta de carga perdida y saldo cero no duplican abono ni comprobante', async ({ page: pagina }) => {
  let cargas = 0, registros = 0
  pagina.on('request', (solicitud) => {
    if (solicitud.method() === 'POST' && solicitud.url().endsWith(`/obligaciones/${obligacionId}/abonos`)) registros++
  })
  await pagina.route('**/api/abonos/*/comprobante', async (ruta) => {
    if (ruta.request().method() !== 'POST') return ruta.continue()
    cargas++
    if (cargas === 1) {
      const respuesta = await ruta.fetch()
      expect(respuesta.status()).toBe(201)
      return ruta.abort('failed')
    }
    return ruta.continue()
  })
  await prepararPantalla(pagina, '40.00')
  await pagina.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(pagina.getByText(/El abono ya está registrado.*Reintenta solo el comprobante/)).toBeVisible()
  await expect(pagina.getByText('PAGADO', { exact: true })).toBeVisible()
  await verificarPersistencia('0.00', 1)
  await pagina.getByRole('button', { name: 'Reintentar comprobante' }).click()
  await expect(pagina.getByText('Comprobante asociado correctamente.')).toBeVisible()
  await verificarPersistencia('0.00', 1)
  expect(registros).toBe(1)
  expect(cargas).toBe(2)
})
