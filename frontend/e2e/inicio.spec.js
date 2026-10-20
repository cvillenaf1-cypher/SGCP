import { expect, test } from '@playwright/test'

const imagen = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')

async function preparar(pagina, { rol = 'ASISTENTE', fallarArchivo = false } = {}) {
  await pagina.clock.setFixedTime(new Date('2026-10-20T16:00:00Z'))
  const base = { beneficiario: 'Proveedor de prueba', monto_original: '100.00', saldo_pendiente: '100.00', fecha_limite: '2026-10-25', fecha_registro: '2026-09-01T15:00:00Z', estado_economico: 'PENDIENTE' }
  const obligaciones = [
    { ...base, id: 1, concepto: 'Servicio empresarial del mes' },
    { ...base, id: 2, concepto: 'Abono parcial del mes', saldo_pendiente: '30.00', estado_economico: 'PARCIAL' },
    { ...base, id: 3, concepto: 'Obligación pagada del mes', saldo_pendiente: '0.00', estado_economico: 'PAGADO' },
    { ...base, id: 4, concepto: 'Deuda vencida de septiembre', fecha_limite: '2026-09-15' },
    { ...base, id: 5, concepto: 'Pagada antigua excluida', fecha_limite: '2026-09-01', saldo_pendiente: '0.00', estado_economico: 'PAGADO' },
    { ...base, id: 6, concepto: 'Obligación futura excluida', fecha_limite: '2026-11-01' },
  ]
  const abonos = [{ id: 90, obligacion_id: 3, monto: '100.00', medio_pago: 'Transferencia bancaria', fecha_registro: '2026-10-18T16:00:00Z', tiene_comprobante: true, puede_descargar_comprobante: true }]
  const solicitudes = []
  let cargas = 0
  await pagina.route('**/api/**', async (ruta) => {
    const solicitud = ruta.request()
    const camino = new URL(solicitud.url()).pathname
    const metodo = solicitud.method()
    solicitudes.push({ camino, metodo, cuerpo: metodo === 'POST' && !camino.includes('/comprobante') ? solicitud.postDataJSON() : null })
    const responder = (datos, status = 200) => ruta.fulfill({ status, contentType: 'application/json', body: JSON.stringify(datos) })
    if (camino === '/api/auth/login') return responder({ token: 'sesion-simulada-inicio', expiresAt: '2026-10-21T16:00:00Z', user: { id: 1, name: `Usuario de prueba ${rol}`, role: rol } })
    expect(solicitud.headers().authorization).toBe('Bearer sesion-simulada-inicio')
    if (camino.startsWith('/api/panel/')) return responder({ message: 'Acceso de prueba habilitado.' })
    if (camino === '/api/obligaciones') return responder({ obligaciones })
    const archivo = camino.match(/^\/api\/abonos\/(\d+)\/comprobante\/archivo$/)
    if (archivo) return ruta.fulfill({ contentType: 'image/png', body: imagen })
    const comprobante = camino.match(/^\/api\/abonos\/(\d+)\/comprobante$/)
    if (comprobante) {
      if (metodo === 'POST') {
        cargas++
        if (fallarArchivo && cargas === 1) return responder({ message: 'Carga de comprobante no disponible.' }, 503)
        const abono = abonos.find((entrada) => entrada.id === Number(comprobante[1]))
        abono.tiene_comprobante = true
        abono.puede_descargar_comprobante = true
      }
      return responder({ tiene_comprobante: true, comprobante: { abono_id: Number(comprobante[1]), nombre: 'recibo.png' } })
    }
    const identificador = Number(camino.split('/')[3])
    const obligacion = obligaciones.find((entrada) => entrada.id === identificador)
    if (camino.endsWith('/historial')) return responder({ historial: {
      obligacion_id: identificador, concepto: obligacion.concepto, monto_original: obligacion.monto_original,
      saldo_pendiente: obligacion.saldo_pendiente, total_abonado: (100 - Number(obligacion.saldo_pendiente)).toFixed(2),
      abonos: abonos.filter((abono) => abono.obligacion_id === identificador), resumen_consistente: true,
    } })
    if (camino.endsWith('/abonos')) {
      expect(rol).toBe('ASISTENTE')
      const entrada = solicitud.postDataJSON()
      obligacion.saldo_pendiente = (Number(obligacion.saldo_pendiente) - Number(entrada.monto)).toFixed(2)
      obligacion.estado_economico = obligacion.saldo_pendiente === '0.00' ? 'PAGADO' : 'PARCIAL'
      const abono = { id: 50 + abonos.length, obligacion_id: identificador, monto: entrada.monto, medio_pago: entrada.medio_pago, saldo_resultante: obligacion.saldo_pendiente,
        fecha_registro: '2026-10-20T16:00:00Z', tiene_comprobante: false, puede_descargar_comprobante: false }
      abonos.push(abono)
      return responder({ message: 'Abono registrado correctamente.', abono }, 201)
    }
    return responder({ obligacion })
  })
  await pagina.goto('/#/login')
  await pagina.getByLabel('Correo electrónico').fill('usuario@example.test')
  await pagina.getByLabel('Contraseña', { exact: true }).fill('clave-de-simulacion')
  await pagina.getByRole('button', { name: /^Iniciar sesión/ }).click()
  await expect(pagina.getByRole('table')).toBeVisible()
  return { solicitudes, obligaciones }
}

test('inicio automático del asistente, detalles por teclado y presentación móvil sin desbordamiento', async ({ page: pagina }) => {
  await preparar(pagina)
  const tabla = pagina.getByRole('table')
  await expect(tabla.getByRole('row')).toHaveCount(5)
  await expect(tabla).toContainText('Deuda vencida de septiembre')
  await expect(tabla).toContainText('Obligación pagada del mes')
  await expect(pagina.getByText('Pagada antigua excluida')).toHaveCount(0)
  await expect(pagina.getByText('Obligación futura excluida')).toHaveCount(0)
  await expect(pagina.getByRole('combobox')).toHaveCount(0)
  await pagina.screenshot({ path: '.local/inicio-asistente-desktop.png', fullPage: true })
  const boton = tabla.getByRole('button', { name: /Ver detalles.*\(#1\)/ })
  await boton.focus()
  await pagina.keyboard.press('Enter')
  const detalle = pagina.getByRole('region', { name: 'Detalle de la obligación #1' })
  await expect(detalle.getByRole('heading', { name: 'Detalle de la obligación #1' })).toBeFocused()
  await expect(detalle.getByLabel('Monto del abono (S/)')).toBeVisible()
  await pagina.keyboard.press('Escape')
  await expect(detalle).toHaveCount(0)
  await expect(boton).toBeFocused()
  await pagina.setViewportSize({ width: 390, height: 844 })
  expect((await tabla.locator('caption').boundingBox()).width).toBeGreaterThan(300)
  await tabla.getByRole('button', { name: /Registrar pago de.*\(#1\)/ }).click()
  await expect(detalle.getByLabel('Medio de pago', { exact: true })).toBeVisible()
  expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await pagina.screenshot({ path: '.local/inicio-asistente-mobile.png', fullPage: true })
})

test('el gerente inicia con la misma lista y consulta comprobantes sin controles de escritura', async ({ page: pagina }) => {
  const { solicitudes } = await preparar(pagina, { rol: 'GERENTE' })
  await expect(pagina.getByRole('button', { name: /Registrar pago/ })).toHaveCount(0)
  await pagina.getByRole('button', { name: /Ver detalles.*\(#3\)/ }).click()
  const detalle = pagina.getByRole('region', { name: 'Detalle de la obligación #3' })
  await detalle.getByRole('button', { name: 'Ver comprobante', exact: true }).click()
  await expect(detalle.getByRole('img', { name: 'Comprobante del abono #90' })).toBeVisible()
  await expect(detalle.getByLabel('Monto del abono (S/)')).toHaveCount(0)
  expect(solicitudes.filter((entrada) => entrada.metodo === 'POST').map((entrada) => entrada.camino)).toEqual(['/api/auth/login'])
  await pagina.screenshot({ path: '.local/inicio-gerente-desktop.png', fullPage: true })
})

test('pago parcial y completo actualizan el mismo panel y conservan la obligación del mes', async ({ page: pagina }) => {
  const { solicitudes } = await preparar(pagina)
  await pagina.getByRole('button', { name: /Registrar pago de.*\(#1\)/ }).click()
  const detalle = pagina.getByRole('region', { name: 'Detalle de la obligación #1' })
  await detalle.getByLabel('Monto del abono (S/)').fill('25.00')
  await detalle.getByLabel('Medio de pago', { exact: true }).selectOption('Efectivo')
  await detalle.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(detalle.getByText('Abono registrado correctamente.')).toBeVisible()
  await expect(pagina.getByRole('table').getByRole('row').filter({ hasText: 'Servicio empresarial del mes' })).toContainText('S/ 75.00')
  await detalle.getByLabel('Monto del abono (S/)').fill('75.00')
  await detalle.getByLabel('Medio de pago', { exact: true }).selectOption('Transferencia bancaria')
  await detalle.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(detalle.getByText(/Esta obligación ya está pagada/)).toBeVisible()
  await expect(pagina.getByRole('table').getByRole('row').filter({ hasText: 'Servicio empresarial del mes' })).toContainText('Pagado')
  await expect(detalle.getByRole('list', { name: 'Historial de abonos' }).getByRole('listitem')).toHaveCount(2)
  const envios = solicitudes.filter((entrada) => entrada.camino.endsWith('/abonos'))
  expect(envios).toHaveLength(2)
  expect(envios[0].cuerpo.clave_idempotencia).not.toBe(envios[1].cuerpo.clave_idempotencia)
})

test('cancelar una deuda antigua mantiene la confirmación y permite reintentar solo el comprobante', async ({ page: pagina }) => {
  const { solicitudes } = await preparar(pagina, { fallarArchivo: true })
  await pagina.getByRole('button', { name: /Registrar pago de.*\(#4\)/ }).click()
  const detalle = pagina.getByRole('region', { name: 'Detalle de la obligación #4' })
  await detalle.getByLabel('Monto del abono (S/)').fill('100.00')
  await detalle.getByLabel('Medio de pago', { exact: true }).selectOption('Efectivo')
  await detalle.getByLabel('Comprobante (opcional)').setInputFiles({ name: 'recibo.png', mimeType: 'image/png', buffer: imagen })
  await detalle.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(detalle.getByText('Abono registrado correctamente.')).toBeVisible()
  await expect(detalle.getByText(/El abono ya está registrado. Reintenta solo el comprobante/)).toBeVisible()
  await expect(pagina.getByRole('table').getByRole('row').filter({ hasText: 'Deuda vencida de septiembre' })).toHaveCount(0)
  await expect(detalle.getByRole('button', { name: 'Cerrar detalles' })).toBeDisabled()
  await detalle.getByRole('button', { name: 'Reintentar comprobante' }).click()
  await expect(detalle.getByText('Comprobante asociado correctamente.')).toBeVisible()
  await detalle.getByRole('button', { name: 'Ver comprobante', exact: true }).click()
  await expect(detalle.getByRole('img', { name: 'Comprobante del abono #51' })).toBeVisible()
  expect(solicitudes.filter((entrada) => entrada.camino.endsWith('/abonos'))).toHaveLength(1)
  await detalle.getByRole('button', { name: 'Cerrar detalles' }).click()
  await expect(pagina.getByRole('button', { name: 'Actualizar listado' })).toBeFocused()
})
