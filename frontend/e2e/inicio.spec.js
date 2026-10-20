import { expect, test } from '@playwright/test'

const imagen = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')

async function preparar(pagina, { rol = 'ASISTENTE', fallarArchivo = false, sinObligaciones = false } = {}) {
  await pagina.clock.setFixedTime(new Date('2026-10-20T16:00:00Z'))
  const base = { beneficiario: 'Proveedor de prueba', monto_original: '100.00', saldo_pendiente: '100.00', fecha_limite: '2026-10-25', fecha_registro: '2026-09-01T15:00:00Z', estado_economico: 'PENDIENTE' }
  const obligaciones = sinObligaciones ? [] : [
    { ...base, id: 1, concepto: 'Servicio empresarial del mes' },
    { ...base, id: 2, concepto: 'Abono parcial del mes', saldo_pendiente: '30.00', estado_economico: 'PARCIAL', fecha_limite: '2026-10-01' },
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
    if (camino === '/api/obligaciones') {
      if (metodo === 'POST') {
        expect(rol).toBe('ASISTENTE')
        const entrada = solicitud.postDataJSON()
        const obligacion = { ...base, id: Math.max(0, ...obligaciones.map((fila) => fila.id)) + 1,
          concepto: entrada.concepto, beneficiario: entrada.beneficiario, monto_original: entrada.monto,
          saldo_pendiente: entrada.monto, fecha_limite: entrada.fecha_limite }
        obligaciones.push(obligacion)
        return responder({ obligacion }, 201)
      }
      return responder({ obligaciones })
    }
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
  if (sinObligaciones) await expect(pagina.getByRole('button', { name: 'Agregar nueva deuda' })).toBeVisible()
  else await expect(pagina.getByRole('table')).toBeVisible()
  return { solicitudes, obligaciones }
}

test('inicio automático del asistente, detalles por teclado y presentación móvil sin desbordamiento', async ({ page: pagina }) => {
  await preparar(pagina)
  const tabla = pagina.getByRole('table')
  await expect(pagina.getByRole('button', { name: 'Registrar pagos realizados', exact: true })).toHaveCount(0)
  await expect(pagina.getByRole('button', { name: 'Consultar historial de pagos', exact: true })).toHaveCount(0)
  await expect(tabla.getByRole('row')).toHaveCount(5)
  await expect(tabla).toContainText('Deuda vencida de septiembre')
  await expect(tabla).toContainText('Obligación pagada del mes')
  await expect(pagina.getByText('Pagada antigua excluida')).toHaveCount(0)
  await expect(pagina.getByText('Obligación futura excluida')).toHaveCount(0)
  await expect(pagina.getByRole('combobox', { name: 'Mes de los pagos' })).toHaveValue('10')
  await expect(tabla.getByRole('button')).toHaveCount(5)
  await expect(tabla.getByText('Pendiente', { exact: true }).first()).toBeVisible()
  await expect(tabla.getByText('Parcial', { exact: true })).toBeVisible()
  await expect(tabla.getByText('Vencida', { exact: true })).toHaveCount(2)
  await expect(tabla.getByText(/con saldo|sin abonos|pendiente de cancelar/)).toHaveCount(0)
  await expect(tabla.getByRole('button', { name: /Registrar pago/ })).toHaveCount(0)
  await pagina.screenshot({ path: '.local/inicio-asistente-desktop.png', fullPage: true })
  const boton = tabla.getByRole('button', { name: /Ver detalles.*\(#1\)/ })
  await boton.focus()
  await pagina.keyboard.press('Enter')
  const detalle = pagina.getByRole('dialog', { name: 'Detalle de la obligación #1' })
  await expect(detalle.getByRole('heading', { name: 'Detalle de la obligación #1' })).toBeFocused()
  expect(await detalle.evaluate((elemento) => elemento.matches(':modal'))).toBe(true)
  await expect(detalle.getByLabel('Monto del abono (S/)')).toHaveCount(0)
  await expect(detalle.getByRole('button', { name: 'Registrar pago', exact: true })).toBeVisible()
  await expect(detalle.getByRole('button', { name: 'Registrar pago', exact: true })).toBeInViewport()
  await pagina.screenshot({ path: '.local/inicio-detalle-desktop.png' })
  for (let indice = 0; indice < 6; indice++) {
    await pagina.keyboard.press('Tab')
    expect(await detalle.evaluate((elemento) => elemento.contains(document.activeElement))).toBe(true)
  }
  await pagina.keyboard.press('Escape')
  await expect(detalle).toHaveCount(0)
  await expect(boton).toBeFocused()
  await pagina.setViewportSize({ width: 390, height: 844 })
  expect((await tabla.locator('caption').boundingBox()).width).toBeGreaterThan(300)
  await tabla.getByRole('button', { name: /Ver detalles.*\(#1\)/ }).click()
  await expect(detalle.getByRole('button', { name: 'Registrar pago', exact: true })).toBeInViewport()
  await pagina.screenshot({ path: '.local/inicio-detalle-mobile.png' })
  await detalle.getByRole('button', { name: 'Registrar pago', exact: true }).click()
  await expect(detalle.getByLabel('Medio de pago', { exact: true })).toBeVisible()
  await detalle.getByLabel('Medio de pago', { exact: true }).scrollIntoViewIfNeeded()
  await expect(detalle.getByRole('button', { name: 'Cerrar detalles' })).toBeInViewport()
  expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await detalle.evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth)).toBe(true)
  await pagina.screenshot({ path: '.local/inicio-asistente-mobile.png' })
})

test('el gerente inicia con la misma lista y consulta comprobantes sin controles de escritura', async ({ page: pagina }) => {
  const { solicitudes } = await preparar(pagina, { rol: 'GERENTE' })
  await expect(pagina.getByRole('button', { name: /Registrar pago/ })).toHaveCount(0)
  await expect(pagina.getByRole('button', { name: 'Agregar nueva deuda' })).toHaveCount(0)
  await pagina.getByRole('button', { name: /Ver detalles.*\(#3\)/ }).click()
  const detalle = pagina.getByRole('dialog', { name: 'Detalle de la obligación #3' })
  await detalle.getByRole('button', { name: 'Ver comprobante', exact: true }).click()
  await expect(detalle.getByRole('img', { name: 'Comprobante del abono #90' })).toBeVisible()
  await expect(detalle.getByLabel('Monto del abono (S/)')).toHaveCount(0)
  expect(solicitudes.filter((entrada) => entrada.metodo === 'POST').map((entrada) => entrada.camino)).toEqual(['/api/auth/login'])
  await pagina.screenshot({ path: '.local/inicio-gerente-desktop.png', fullPage: true })
})

test('pago parcial y completo actualizan el mismo panel y conservan la obligación del mes', async ({ page: pagina }) => {
  const { solicitudes } = await preparar(pagina)
  await pagina.getByRole('button', { name: /Ver detalles.*\(#1\)/ }).click()
  const detalle = pagina.getByRole('dialog', { name: 'Detalle de la obligación #1' })
  await detalle.getByRole('button', { name: 'Registrar pago', exact: true }).click()
  await detalle.getByLabel('Monto del abono (S/)').fill('25.00')
  await detalle.getByLabel('Medio de pago', { exact: true }).selectOption('Efectivo')
  await detalle.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(detalle.getByText('Abono registrado correctamente.')).toBeVisible()
  await expect(pagina.locator('table tbody tr').filter({ hasText: 'Servicio empresarial del mes' })).toContainText('S/ 75.00')
  await expect(detalle.getByRole('list', { name: 'Historial de abonos' })).toContainText('S/ 25.00')
  await detalle.getByLabel('Monto del abono (S/)').fill('75.01')
  await detalle.getByLabel('Medio de pago', { exact: true }).selectOption('Transferencia bancaria')
  await detalle.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(detalle.getByText('El abono no puede superar el saldo pendiente.')).toBeVisible()
  expect(solicitudes.filter((entrada) => entrada.camino.endsWith('/abonos'))).toHaveLength(1)
  await detalle.getByLabel('Monto del abono (S/)').fill('75.00')
  await detalle.getByLabel('Medio de pago', { exact: true }).selectOption('Transferencia bancaria')
  await detalle.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(detalle.getByText(/Esta obligación ya está pagada/)).toBeVisible()
  await expect(pagina.locator('table tbody tr').filter({ hasText: 'Servicio empresarial del mes' })).toContainText('Pagado')
  await expect(detalle.getByRole('button', { name: 'Registrar pago', exact: true })).toHaveCount(0)
  await expect(detalle.getByLabel('Monto del abono (S/)')).toHaveCount(0)
  await expect(detalle.getByRole('list', { name: 'Historial de abonos' }).getByRole('listitem')).toHaveCount(2)
  const envios = solicitudes.filter((entrada) => entrada.camino.endsWith('/abonos'))
  expect(envios).toHaveLength(2)
  expect(envios[0].cuerpo.clave_idempotencia).not.toBe(envios[1].cuerpo.clave_idempotencia)
})

test('cancelar una deuda antigua mantiene la confirmación y permite reintentar solo el comprobante', async ({ page: pagina }) => {
  const { solicitudes } = await preparar(pagina, { fallarArchivo: true })
  await pagina.getByRole('combobox', { name: 'Mes de los pagos' }).selectOption('09')
  await pagina.getByRole('button', { name: /Ver detalles.*\(#4\)/ }).click()
  const detalle = pagina.getByRole('dialog', { name: 'Detalle de la obligación #4' })
  await detalle.getByRole('button', { name: 'Registrar pago', exact: true }).click()
  await detalle.getByLabel('Monto del abono (S/)').fill('100.00')
  await detalle.getByLabel('Medio de pago', { exact: true }).selectOption('Efectivo')
  await detalle.getByLabel('Comprobante (opcional)').setInputFiles({ name: 'recibo.png', mimeType: 'image/png', buffer: imagen })
  await detalle.getByRole('button', { name: 'Registrar abono' }).click()
  await expect(detalle.getByText('Abono registrado correctamente.')).toBeVisible()
  await expect(detalle.getByText(/El abono ya está registrado. Reintenta solo el comprobante/)).toBeVisible()
  await expect(pagina.locator('table tbody tr').filter({ hasText: 'Deuda vencida de septiembre' })).toContainText('Pagado')
  await expect(detalle.getByRole('button', { name: 'Cerrar detalles' })).toBeDisabled()
  await pagina.keyboard.press('Escape')
  await expect(detalle).toBeVisible()
  await detalle.getByRole('button', { name: 'Reintentar comprobante' }).click()
  await expect(detalle.getByText('Comprobante asociado correctamente.')).toBeVisible()
  await detalle.getByRole('button', { name: 'Ver comprobante', exact: true }).click()
  await expect(detalle.getByRole('img', { name: 'Comprobante del abono #51' })).toBeVisible()
  expect(solicitudes.filter((entrada) => entrada.camino.endsWith('/abonos'))).toHaveLength(1)
  await detalle.getByRole('button', { name: 'Cerrar detalles' }).click()
  await expect(pagina.getByRole('button', { name: /Ver detalles.*\(#4\)/ })).toBeFocused()
  await pagina.getByRole('combobox', { name: 'Mes de los pagos' }).selectOption('10')
  await expect(pagina.getByRole('table')).not.toContainText('Deuda vencida de septiembre')
  await pagina.getByRole('combobox', { name: 'Mes de los pagos' }).selectOption('09')
  await expect(pagina.getByRole('table').getByRole('row').filter({ hasText: 'Deuda vencida de septiembre' })).toContainText('Pagado')
})

test('el selector de meses actualiza la tabla sin año ni recarga y permite consultar meses vacíos', async ({ page: pagina }) => {
  const { solicitudes } = await preparar(pagina)
  const mes = pagina.getByRole('combobox', { name: 'Mes de los pagos' })
  await expect(mes.getByRole('option')).toHaveText(['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'])
  const lecturas = solicitudes.filter((entrada) => entrada.camino === '/api/obligaciones').length
  await mes.selectOption('09')
  await expect(pagina.getByRole('table')).toContainText('Deuda vencida de septiembre')
  await expect(pagina.getByRole('table')).toContainText('Pagada antigua excluida')
  await expect(pagina.getByRole('table')).not.toContainText('Servicio empresarial del mes')
  await mes.selectOption('11')
  await expect(pagina.getByRole('table')).toContainText('Obligación futura excluida')
  await expect(pagina.getByRole('table')).not.toContainText('Deuda vencida de septiembre')
  await mes.selectOption('01')
  await expect(pagina.getByText('No hay obligaciones para el mes seleccionado.')).toBeVisible()
  await expect(pagina.getByRole('button', { name: 'Agregar nueva deuda' })).toBeVisible()
  await mes.selectOption('10')
  await expect(pagina.getByRole('table')).toContainText('Obligación pagada del mes')
  await expect(pagina.getByRole('table')).toContainText('Deuda vencida de septiembre')
  expect(solicitudes.filter((entrada) => entrada.camino === '/api/obligaciones')).toHaveLength(lecturas)
})

for (const sinObligaciones of [false, true]) {
  test(`el + permite registrar una deuda y volver al listado ${sinObligaciones ? 'vacío en móvil' : 'existente'}`, async ({ page: pagina }) => {
    if (sinObligaciones) await pagina.setViewportSize({ width: 390, height: 844 })
    const { solicitudes } = await preparar(pagina, { sinObligaciones })
    await expect(pagina.getByRole('navigation', { name: 'Funciones del asistente' })
      .getByRole('button', { name: 'Registrar pagos pendientes', exact: true })).toHaveCount(0)
    await pagina.getByRole('button', { name: 'Agregar nueva deuda' }).click()
    await pagina.getByLabel('Concepto del pago').fill('Nueva deuda del mes')
    await pagina.getByLabel('Beneficiario', { exact: true }).fill('Proveedor nuevo')
    await pagina.getByLabel('Monto original (S/)', { exact: true }).fill('150.50')
    await pagina.getByLabel('Fecha límite', { exact: true }).fill('2026-10-30')
    await pagina.getByRole('button', { name: 'Registrar pago pendiente', exact: true }).click()
    await expect(pagina.getByText('Pago pendiente registrado correctamente.')).toBeVisible()
    await pagina.getByRole('button', { name: 'Volver a pagos del mes' }).click()
    const fila = pagina.getByRole('table').getByRole('row').filter({ hasText: 'Nueva deuda del mes' })
    await expect(fila).toBeVisible()
    await expect(fila.getByText('Pendiente', { exact: true })).toBeVisible()
    await expect(fila.getByText('S/ 150.50', { exact: true })).toHaveCount(2)
    expect(solicitudes.filter((entrada) => entrada.camino === '/api/obligaciones' && entrada.metodo === 'POST')).toEqual([
      { camino: '/api/obligaciones', metodo: 'POST', cuerpo: { concepto: 'Nueva deuda del mes', beneficiario: 'Proveedor nuevo', monto: '150.50', fecha_limite: '2026-10-30' } },
    ])
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
