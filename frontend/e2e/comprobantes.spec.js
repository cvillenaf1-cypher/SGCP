import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'
import { abrirBasePruebas } from '../../backend/test/support/database.js'
import { crearAlmacenComprobantes } from '../../backend/src/comprobantes/almacen.js'
import { fechaActualNegocio } from '../../backend/src/obligaciones/consulta.js'

const requerirBackend = createRequire(new URL('../../backend/package.json', import.meta.url))
const sharp = requerirBackend('sharp')
const { PDFDocument } = requerirBackend('pdf-lib')
let usuario, obligacionId, concepto, imagen, pdf

test.beforeEach(async ({ request: solicitudes }) => {
  usuario = JSON.parse(process.env.SGCP_E2E_USERS).find((entrada) => entrada.role === 'ASISTENTE')
  const acceso = await solicitudes.post('http://127.0.0.1:3001/api/auth/login', { data: { email: usuario.email, password: usuario.password } })
  expect(acceso.status()).toBe(200)
  const sesion = await acceso.json()
  concepto = `Integración HU-04 ${randomUUID()}`
  const respuesta = await solicitudes.post('http://127.0.0.1:3001/api/obligaciones', {
    headers: { Authorization: `Bearer ${sesion.token}` },
    data: { concepto, beneficiario: 'Proveedor de prueba', monto: '40.00', fecha_limite: fechaActualNegocio() },
  })
  expect(respuesta.status()).toBe(201)
  obligacionId = (await respuesta.json()).obligacion.id
  imagen = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 20, g: 100, b: 30 } } }).png().toBuffer()
  const documento = await PDFDocument.create()
  documento.addPage().drawText('Factura de prueba')
  pdf = Buffer.from(await documento.save())
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

async function prepararPantalla(pagina, monto, usarPdf = false) {
  await pagina.goto('/#/login')
  await pagina.getByLabel('Correo electrónico').fill(usuario.email)
  await pagina.getByLabel('Contraseña', { exact: true }).fill(usuario.password)
  await pagina.getByRole('button', { name: /^Iniciar sesión/ }).click()
  await pagina.getByRole('button', { name: `Ver detalles de ${concepto} (#${obligacionId})`, exact: true }).click()
  await pagina.getByRole('dialog').getByRole('button', { name: 'Registrar pago', exact: true }).click()
  await pagina.getByLabel('Monto del abono (S/)').fill(monto)
  await pagina.getByLabel('Medio de pago', { exact: true }).selectOption('Efectivo')
  await pagina.getByLabel('Comprobante o factura (obligatorio)').setInputFiles(usarPdf
    ? { name: 'factura.pdf', mimeType: 'application/pdf', buffer: pdf }
    : { name: 'recibo.png', mimeType: 'image/png', buffer: imagen })
  if (usarPdf) await expect(pagina.getByText('Documento PDF seleccionado.')).toBeVisible()
  else await expect(pagina.getByRole('img', { name: 'Vista previa local de recibo.png' })).toBeVisible()
}

async function verificarPersistencia(saldo, cantidadComprobantes, cantidadAbonos = 1) {
  const { pool: conexiones } = await abrirBasePruebas()
  try {
    const [[obligacion]] = await conexiones.execute('SELECT saldo_pendiente FROM obligaciones WHERE id = ?', [obligacionId])
    const [[abonos]] = await conexiones.execute('SELECT COUNT(*) AS cantidad FROM abonos WHERE obligacion_id = ?', [obligacionId])
    const [[comprobantes]] = await conexiones.execute('SELECT COUNT(*) AS cantidad FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [obligacionId])
    expect(obligacion.saldo_pendiente).toBe(saldo)
    expect(Number(abonos.cantidad)).toBe(cantidadAbonos)
    expect(Number(comprobantes.cantidad)).toBe(cantidadComprobantes)
  } finally { await conexiones.end() }
}

test('evidencia: un fallo de envío no registra pago; el reintento guarda ambos y permite descargar', async ({ page: pagina }) => {
  let registros = 0
  await pagina.route('**/api/obligaciones/*/abonos', async (ruta) => {
    registros++
    expect(ruta.request().headers()['content-type']).toContain('multipart/form-data')
    if (registros === 1) return ruta.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Fallo de envío simulado.' }) })
    return ruta.continue()
  })
  await prepararPantalla(pagina, '10.00', true)
  await pagina.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(pagina.getByText(/Fallo de envío simulado/)).toBeVisible()
  await expect(pagina.getByText('Abono registrado correctamente.')).toHaveCount(0)
  await verificarPersistencia('40.00', 0, 0)
  await pagina.getByRole('button', { name: 'Reintentar registro' }).click()
  await expect(pagina.getByText('Evidencia guardada: factura.pdf')).toBeVisible()
  await verificarPersistencia('30.00', 1)
  expect(registros).toBe(2)
  const descargaPendiente = pagina.waitForEvent('download')
  await pagina.getByRole('button', { name: 'Descargar comprobante', exact: true }).click()
  const descarga = await descargaPendiente
  expect(descarga.suggestedFilename()).toBe('factura.pdf')
  expect(await descarga.failure()).toBeNull()
})

test('evidencia: una respuesta perdida al cancelar el saldo se recupera sin duplicar pago ni archivo', async ({ page: pagina }) => {
  let registros = 0
  await pagina.route('**/api/obligaciones/*/abonos', async (ruta) => {
    registros++
    if (registros === 1) {
      const respuesta = await ruta.fetch()
      expect(respuesta.status()).toBe(201)
      return ruta.abort('failed')
    }
    return ruta.continue()
  })
  await prepararPantalla(pagina, '40.00')
  await pagina.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(pagina.getByRole('button', { name: 'Reintentar registro' })).toBeVisible()
  await verificarPersistencia('0.00', 1)
  await pagina.getByRole('button', { name: 'Reintentar registro' }).click()
  await expect(pagina.getByText('Evidencia guardada: recibo.png')).toBeVisible()
  await expect(pagina.getByRole('dialog').locator('.inicio-resumen').getByText('Pagado', { exact: true })).toBeVisible()
  await verificarPersistencia('0.00', 1)
  expect(registros).toBe(2)
})
