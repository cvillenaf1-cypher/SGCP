import { expect, test } from '@playwright/test'
import { leerAbono, adjuntarEvidencia } from './support/comprobante.js'

const tokenPrueba = 'sesion-simulada-solo-historial'
const imagenPrueba = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
const cabecerasCors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type',
}

function crearEscenario() {
  const obligaciones = [
    { id: 7, concepto: 'Proveedor con abonos', beneficiario: 'Proveedor de prueba', monto_original: '3000.00', saldo_pendiente: '1500.00', estado_economico: 'PARCIAL', vencida: false },
    { id: 8, concepto: 'Préstamo cancelado', beneficiario: 'Prestamista de prueba', monto_original: '200.00', saldo_pendiente: '0.00', estado_economico: 'PAGADO', vencida: false },
    { id: 9, concepto: 'Compromiso sin pagos', beneficiario: 'Otro proveedor', monto_original: '500.00', saldo_pendiente: '500.00', estado_economico: 'PENDIENTE', vencida: false },
  ].map((fila) => ({ ...fila, fecha_limite: '2026-10-20' }))
  const abonos = {
    7: [
      { id: 11, monto: '1000.00', medio_pago: 'Transferencia', fecha_registro: '2026-10-12T15:30:00.000Z', tiene_comprobante: true, puede_descargar_comprobante: true, url_comprobante: '/api/abonos/11/comprobante/archivo' },
      { id: 12, monto: '500.00', medio_pago: 'Efectivo', fecha_registro: '2026-10-14T18:45:00.000Z', tiene_comprobante: false, puede_descargar_comprobante: false, url_comprobante: null },
    ],
    8: [{ id: 21, monto: '200.00', medio_pago: 'Yape', fecha_registro: '2026-10-15T14:00:00.000Z', tiene_comprobante: false, puede_descargar_comprobante: false, url_comprobante: null }],
    9: [],
  }
  return { obligaciones, abonos, solicitudes: [], fallarHistorial: false, fallarComprobante: false }
}

async function simularApi(pagina, escenario) {
  await pagina.clock.setFixedTime(new Date('2026-10-20T16:00:00Z'))
  await pagina.route('**/api/**', async (ruta) => {
    const solicitud = ruta.request()
    const camino = new URL(solicitud.url()).pathname
    const metodo = solicitud.method()
    if (metodo === 'OPTIONS') return ruta.fulfill({ status: 204, headers: cabecerasCors })
    escenario.solicitudes.push({ camino, metodo, cabeceras: solicitud.headers() })
    const responder = (datos, status = 200) => ruta.fulfill({ status, headers: cabecerasCors, contentType: 'application/json', body: JSON.stringify(datos) })
    if (camino === '/api/auth/login' && metodo === 'POST') {
      return responder({ token: tokenPrueba, expiresAt: '2026-10-21T16:00:00Z', user: { id: 1, name: 'Asistente de prueba', role: 'ASISTENTE' } })
    }
    expect(solicitud.headers().authorization).toBe(`Bearer ${tokenPrueba}`)
    if (camino === '/api/panel/asistente' && metodo === 'GET') return responder({ message: 'Acceso de prueba habilitado.' })
    if (camino === '/api/obligaciones' && metodo === 'GET') return responder({ obligaciones: escenario.obligaciones })
    const historial = camino.match(/^\/api\/obligaciones\/(\d+)\/historial$/)
    if (historial && metodo === 'GET') {
      if (escenario.fallarHistorial) return responder({ message: 'El historial no está disponible. Intenta nuevamente.' }, 503)
      const obligacion = escenario.obligaciones.find((entrada) => String(entrada.id) === historial[1])
      const movimientos = escenario.abonos[historial[1]]
      const totales = { 7: movimientos.length === 2 ? '1500.00' : '1750.00', 8: '200.00', 9: '0.00' }
      return responder({ historial: {
        obligacion_id: obligacion.id, concepto: obligacion.concepto,
        monto_original: obligacion.monto_original, total_abonado: totales[obligacion.id],
        saldo_pendiente: obligacion.saldo_pendiente, estado_economico: obligacion.estado_economico,
        resumen_consistente: true, advertencia: null, abonos: movimientos,
      } })
    }
    const detalle = camino.match(/^\/api\/obligaciones\/(\d+)$/)
    if (detalle && metodo === 'GET') return responder({ obligacion: escenario.obligaciones.find((entrada) => String(entrada.id) === detalle[1]) })
    if (camino === '/api/obligaciones/7/abonos' && metodo === 'POST') {
      const entrada = leerAbono(solicitud)
      expect(entrada).toMatchObject({ monto: '250.00', medio_pago: 'Efectivo' })
      expect(entrada.clave_idempotencia).toMatch(/^[\da-f-]{36}$/i)
      const abono = { id: 13, obligacion_id: 7, monto: entrada.monto, medio_pago: entrada.medio_pago, fecha_registro: new Date().toISOString(), saldo_resultante: '1250.00' }
      escenario.abonos[7].push({ ...abono, tiene_comprobante: false, puede_descargar_comprobante: false, url_comprobante: null })
      escenario.obligaciones[0].saldo_pendiente = '1250.00'
      return responder({ message: 'Abono registrado correctamente.', abono, comprobante: { abono_id: abono.id, nombre: 'recibo.png', tipo: 'image/png' } }, 201)
    }
    if (camino === '/api/abonos/11/comprobante/archivo' && metodo === 'GET') {
      expect(solicitud.headers().accept).toBe('image/png, image/jpeg, application/pdf')
      if (escenario.fallarComprobante) return responder({ message: 'No se pudo consultar el comprobante.' }, 503)
      return ruta.fulfill({ status: 200, headers: cabecerasCors, contentType: 'image/png', body: imagenPrueba })
    }
    throw new Error(`Solicitud no esperada: ${metodo} ${camino}`)
  })
  await pagina.goto('/#/login')
  await pagina.getByLabel('Correo electrónico').fill('asistente.historial@example.test')
  await pagina.getByLabel('Contraseña', { exact: true }).fill('clave-solo-simulacion')
  await pagina.getByRole('button', { name: /Iniciar sesión/ }).click()
  await expect(pagina.getByRole('heading', { name: 'Panel de asistente' })).toBeVisible()
}

async function abrirHistorial(pagina, id = '7') {
  await seleccionarObligacion(pagina, id)
}

async function seleccionarObligacion(pagina, id) {
  if (await pagina.getByRole('dialog').count()) await pagina.getByRole('button', { name: 'Cerrar detalles', exact: true }).click()
  await pagina.getByRole('table')
    .getByRole('button', { name: new RegExp(`\\(#${id}\\)$`) }).click()
}

function resumen(pagina, etiqueta) {
  return pagina.locator('.historial-resumen > div').filter({ has: pagina.locator('dt', { hasText: etiqueta }) }).locator('dd')
}

test('historial real del cliente HTTP: resumen, orden, pagadas y comprobante autenticado de solo lectura', async ({ page: pagina }) => {
  const escenario = crearEscenario()
  await simularApi(pagina, escenario)
  await abrirHistorial(pagina)
  const movimientos = pagina.getByRole('list', { name: 'Historial de abonos' }).getByRole('listitem')
  await expect(movimientos).toHaveCount(2)
  await expect(movimientos.nth(0)).toContainText('S/ 500.00')
  await expect(movimientos.nth(0)).toContainText('Efectivo')
  await expect(movimientos.nth(0).locator('time')).toHaveAttribute('dateTime', '2026-10-14T18:45:00.000Z')
  await expect(movimientos.nth(1)).toContainText('S/ 1,000.00')
  await expect(movimientos.nth(1)).toContainText('Transferencia')
  await expect(resumen(pagina, 'Monto original')).toHaveText('S/ 3,000.00')
  await expect(resumen(pagina, 'Total acumulado de abonos')).toHaveText('S/ 1,500.00')
  await expect(resumen(pagina, 'Saldo pendiente actual')).toHaveText('S/ 1,500.00')
  await expect(pagina.getByText(/pendiente de integración|DATOS DE EJEMPLO/i)).toHaveCount(0)
  await movimientos.nth(1).getByRole('button', { name: 'Ver comprobante', exact: true }).click()
  const imagen = pagina.getByRole('img', { name: 'Comprobante del abono #11' })
  await expect(imagen).toBeVisible()
  await expect(imagen).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => imagen.evaluate((elemento) => elemento.complete && elemento.naturalWidth > 0)).toBe(true)
  await pagina.getByRole('button', { name: 'Cerrar comprobante' }).click()
  await expect(imagen).toHaveCount(0)
  await seleccionarObligacion(pagina, '8')
  await expect(resumen(pagina, 'Monto original')).toHaveText('S/ 200.00')
  await expect(resumen(pagina, 'Total acumulado de abonos')).toHaveText('S/ 200.00')
  await expect(resumen(pagina, 'Saldo pendiente actual')).toHaveText('S/ 0.00')
  await expect(movimientos).toHaveCount(1)
  expect(escenario.solicitudes.filter(({ metodo, camino }) => metodo !== 'GET' && camino !== '/api/auth/login')).toEqual([])
})

test('un nuevo abono aparece al volver al historial y conserva los pagos anteriores', async ({ page: pagina }) => {
  const escenario = crearEscenario()
  await simularApi(pagina, escenario)
  await abrirHistorial(pagina)
  const lista = pagina.getByRole('list', { name: 'Historial de abonos' })
  await expect(lista.getByRole('listitem')).toHaveCount(2)
  await pagina.getByRole('dialog').getByRole('button', { name: 'Registrar pago', exact: true }).click()
  await pagina.getByLabel('Monto del abono (S/)').fill('250.00')
  await pagina.getByLabel('Medio de pago', { exact: true }).selectOption('Efectivo')
  await adjuntarEvidencia(pagina)
  await pagina.getByRole('button', { name: 'Registrar abono', exact: true }).click()
  await expect(pagina.getByText('Abono registrado correctamente.', { exact: true })).toBeVisible()
  await pagina.getByRole('button', { name: 'Cerrar detalles', exact: true }).click()
  await abrirHistorial(pagina)
  await expect(lista.getByRole('listitem')).toHaveCount(3)
  await expect(lista.getByRole('listitem').nth(0)).toContainText('S/ 250.00')
  await expect(lista.getByRole('listitem').nth(1)).toContainText('S/ 500.00')
  await expect(lista.getByRole('listitem').nth(2)).toContainText('S/ 1,000.00')
  await expect(resumen(pagina, 'Total acumulado de abonos')).toHaveText('S/ 1,750.00')
  await expect(resumen(pagina, 'Saldo pendiente actual')).toHaveText('S/ 1,250.00')
  await pagina.getByRole('button', { name: 'Actualizar historial', exact: true }).click()
  await expect(lista.getByRole('listitem')).toHaveCount(3)
  const escrituras = escenario.solicitudes.filter(({ metodo, camino }) => metodo !== 'GET' && camino !== '/api/auth/login')
  expect(escrituras.map(({ camino, metodo }) => ({ camino, metodo }))).toEqual([{ camino: '/api/obligaciones/7/abonos', metodo: 'POST' }])
})

test('historial vacío y errores recuperables no crean ni modifican pagos', async ({ page: pagina }) => {
  const escenario = crearEscenario()
  escenario.fallarHistorial = true
  escenario.fallarComprobante = true
  await simularApi(pagina, escenario)
  await abrirHistorial(pagina, '9')
  await expect(pagina.getByRole('alert')).toHaveText('El historial no está disponible. Intenta nuevamente.')
  escenario.fallarHistorial = false
  await pagina.getByRole('button', { name: 'Reintentar historial', exact: true }).click()
  await expect(pagina.getByText(/todavía no tiene abonos|todavía no existen abonos/i)).toBeVisible()
  await expect(resumen(pagina, 'Monto original')).toHaveText('S/ 500.00')
  await expect(resumen(pagina, 'Total acumulado de abonos')).toHaveText('S/ 0.00')
  await expect(resumen(pagina, 'Saldo pendiente actual')).toHaveText('S/ 500.00')
  await seleccionarObligacion(pagina, '7')
  await pagina.getByRole('button', { name: 'Ver comprobante', exact: true }).click()
  await expect(pagina.getByRole('alert')).toHaveText('No se pudo consultar el comprobante.')
  escenario.fallarComprobante = false
  await pagina.getByRole('button', { name: 'Reintentar comprobante', exact: true }).click()
  await expect(pagina.getByRole('img', { name: 'Comprobante del abono #11' })).toBeVisible()
  expect(escenario.solicitudes.filter(({ metodo, camino }) => metodo !== 'GET' && camino !== '/api/auth/login')).toEqual([])
})

test('consulta el historial pagado de otro mes desde sus detalles en móvil, sin acceso separado al historial', async ({ page: pagina }) => {
  await pagina.setViewportSize({ width: 390, height: 844 })
  const escenario = crearEscenario()
  escenario.obligaciones[1].fecha_limite = '2026-09-30'
  await simularApi(pagina, escenario)
  await expect(pagina.getByRole('button', { name: 'Consultar historial de pagos', exact: true })).toHaveCount(0)
  const selector = pagina.getByRole('combobox', { name: 'Mes de los pagos' })
  await selector.selectOption('09')
  await seleccionarObligacion(pagina, '8')
  await expect(resumen(pagina, 'Total acumulado de abonos')).toHaveText('S/ 200.00')
  await expect(pagina.getByRole('list', { name: 'Historial de abonos' }).getByRole('listitem')).toHaveCount(1)
  await expect(pagina.getByRole('button', { name: 'Actualizar historial' })).toHaveCount(0)
  await expect(pagina.getByRole('button', { name: 'Registrar pago', exact: true })).toHaveCount(0)
  await pagina.getByRole('button', { name: 'Cerrar detalles', exact: true }).click()
  await expect(selector).toHaveValue('09')
  expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(escenario.solicitudes.filter(({ metodo, camino }) => metodo !== 'GET' && camino !== '/api/auth/login')).toEqual([])
})
