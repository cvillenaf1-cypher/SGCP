import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router-dom'
import Aplicacion from '../App'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { ProveedorAutenticacion } from '../auth/AuthProvider'
import { PaginaGerente } from '../gerente/PaginaGerente'
import { calcularResumenMensual, formatearCentavos } from '../gerente/resumenMensual'
import { fechaActualLima } from '../lib/pagosInicio'

const pagos = [
  { monto_original: '0.10', saldo_pendiente: '0.10', fecha_limite: '2026-10-01' },
  { monto_original: '0.20', saldo_pendiente: '0.05', fecha_limite: '2026-10-18' },
  { monto_original: '100.00', saldo_pendiente: '0.00', fecha_limite: '2026-10-05' },
  { monto_original: '50.00', saldo_pendiente: '25.00', fecha_limite: '2026-10-31' },
  { monto_original: '999.00', saldo_pendiente: '999.00', fecha_limite: '2026-09-30' },
  { monto_original: '800.00', saldo_pendiente: '800.00', fecha_limite: '2026-11-01' },
  { monto_original: '3.00', saldo_pendiente: '1.00', fecha_limite: '2032-10-01' },
].map((pago, indice) => ({ ...pago, id: indice + 1, concepto: `Obligación ${indice + 1}`, beneficiario: 'Proveedor de prueba' }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-18T15:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function comprobarIndicador(titulo, importe) {
  expect(within(screen.getByRole('article', { name: titulo })).getByText(importe)).toBeInTheDocument()
}

function renderizarPanel(consultar = vi.fn().mockResolvedValue({ obligaciones: pagos }), estricto = false) {
  const solicitar = vi.fn((ruta, opciones) => ruta === '/api/panel/gerente'
    ? Promise.resolve({ message: 'Acceso habilitado.' }) : consultar(ruta, opciones))
  const contenido = <MemoryRouter><ContextoAutenticacion.Provider value={{ solicitar }}>
    <PaginaGerente />
  </ContextoAutenticacion.Provider></MemoryRouter>
  const vista = render(estricto ? <StrictMode>{contenido}</StrictMode> : contenido)
  return { ...vista, solicitar, consultar }
}

describe('HU-07: cálculo mensual y vencido acumulado exactos', () => {
  it('suma el mes por fecha límite, pero acumula vencidos anteriores y excluye hoy, futuros y pagados', () => {
    expect(calcularResumenMensual(pagos, 10, 2026)).toEqual({
      comprometido: 15030n, abonado: 12515n, pendiente: 2515n, vencido: 99910n, cantidad: 4, cantidadVencidas: 2,
    })
    expect(calcularResumenMensual(pagos, 9, 2026)).toEqual({
      comprometido: 99900n, abonado: 0n, pendiente: 99900n, vencido: 99910n, cantidad: 1, cantidadVencidas: 2,
    })
    expect(calcularResumenMensual(pagos, 11, 2026).vencido).toBe(99910n)
  })

  it('octubre pagado por S/ 3,100 conserva la deuda pendiente de septiembre por S/ 100', () => {
    const obligaciones = [
      { ...pagos[0], monto_original: '3100.00', saldo_pendiente: '0.00' },
      { ...pagos[4], monto_original: '100.00', saldo_pendiente: '100.00' },
    ]
    expect(calcularResumenMensual(obligaciones, 10, 2026)).toEqual({
      comprometido: 310000n, abonado: 310000n, pendiente: 0n, vencido: 10000n, cantidad: 1, cantidadVencidas: 1,
    })
  })

  it('incluye años anteriores y deudas parciales una sola vez por ID sin modificar el listado', () => {
    const parcial = { ...pagos[4], monto_original: '100.00', saldo_pendiente: '40.00', fecha_limite: '2025-12-31' }
    const obligaciones = [parcial, { ...parcial }, { ...pagos[2], fecha_limite: '2025-12-31' }]
    const original = structuredClone(obligaciones)
    const resumen = calcularResumenMensual(obligaciones, 12, 2025)
    expect(resumen).toEqual({ comprometido: 20000n, abonado: 16000n, pendiente: 4000n, vencido: 4000n, cantidad: 2, cantidadVencidas: 1 })
    expect(obligaciones).toEqual(original)
  })

  it('un abono parcial reduce el vencido y al cancelarlo deja de contar la obligación', () => {
    const antes = calcularResumenMensual([pagos[4]], 10, 2026)
    const parcial = calcularResumenMensual([{ ...pagos[4], saldo_pendiente: '749.00' }], 10, 2026)
    const pagada = calcularResumenMensual([{ ...pagos[4], saldo_pendiente: '0.00' }], 10, 2026)
    expect(antes.vencido - parcial.vencido).toBe(25000n)
    expect(parcial.cantidadVencidas).toBe(1)
    expect(pagada.vencido).toBe(0n)
    expect(pagada.cantidadVencidas).toBe(0)
  })

  it('conserva centavos incluso cuando el acumulado supera la precisión de Number', () => {
    const resumen = calcularResumenMensual([
      { ...pagos[0], monto_original: '90071992547409.91', saldo_pendiente: '90071992547409.90' },
      { ...pagos[1], monto_original: '0.20', saldo_pendiente: '0.10' },
      { ...pagos[2], monto_original: '0.10', saldo_pendiente: '0.00' },
    ], 10, 2026)
    expect(resumen.comprometido).toBe(9007199254741021n)
    expect(resumen.abonado).toBe(21n)
    expect(resumen.pendiente).toBe(9007199254741000n)
    expect(formatearCentavos(resumen.comprometido)).toBe('S/ 90,071,992,547,410.21')
    expect(formatearCentavos(0n)).toBe('S/ 0.00')
    expect(formatearCentavos(1n)).toBe('S/ 0.01')
  })

  it('usa el día de Lima antes y después de medianoche, incluso al cambiar año', () => {
    const obligaciones = [
      { ...pagos[0], monto_original: '1.00', saldo_pendiente: '1.00', fecha_limite: '2026-12-30' },
      { ...pagos[1], monto_original: '2.00', saldo_pendiente: '2.00', fecha_limite: '2026-12-31' },
    ]
    const antes = fechaActualLima(new Date('2027-01-01T04:59:59Z'))
    const despues = fechaActualLima(new Date('2027-01-01T05:00:00Z'))
    expect(antes).toBe('2026-12-31')
    expect(despues).toBe('2027-01-01')
    expect(calcularResumenMensual(obligaciones, 12, 2026, antes).vencido).toBe(100n)
    expect(calcularResumenMensual(obligaciones, 1, 2027, despues).vencido).toBe(300n)
  })

  it('incluye abonos de cualquier mes usando el saldo real, sin filtrar por fecha de registro', () => {
    const obligacion = { ...pagos[0], monto_original: '100.00', saldo_pendiente: '39.40', fecha_registro: '2026-08-01' }
    expect(calcularResumenMensual([obligacion], 10, 2026).abonado).toBe(6060n)
  })

  it('un mes vacío conserva los vencidos, un listado vacío da ceros y acepta febrero bisiesto', () => {
    expect(calcularResumenMensual(pagos, 2, 2026)).toEqual({
      comprometido: 0n, abonado: 0n, pendiente: 0n, vencido: 99910n, cantidad: 0, cantidadVencidas: 2,
    })
    expect(calcularResumenMensual([], 2, 2026)).toEqual({
      comprometido: 0n, abonado: 0n, pendiente: 0n, vencido: 0n, cantidad: 0, cantidadVencidas: 0,
    })
    expect(calcularResumenMensual([{ ...pagos[0], fecha_limite: '2024-02-29' }], 2, 2024).cantidad).toBe(1)
  })

  it('rechaza importes, saldos o listas inválidos sin presentarlos como ceros', () => {
    for (const monto_original of ['0.001', '-1', '1e2', '', null, 0.1]) {
      expect(() => calcularResumenMensual([{ ...pagos[0], monto_original }], 10, 2026)).toThrow('importe inválido')
    }
    expect(() => calcularResumenMensual([{ ...pagos[0], saldo_pendiente: '0.11' }], 10, 2026)).toThrow('saldo inválido')
    expect(() => calcularResumenMensual({}, 10, 2026)).toThrow('lista de pagos inválida')
    expect(() => calcularResumenMensual([{ ...pagos[0], id: undefined }], 10, 2026)).toThrow('lista de pagos inválida')
  })
})

describe('HU-07: resumen integrado y actualización compartida', () => {
  it('muestra título, selector, resumen y tabla en ese orden con una sola consulta de obligaciones', async () => {
    const { consultar } = renderizarPanel()
    await screen.findByRole('table')
    expect(screen.getAllByRole('heading').map((titulo) => titulo.textContent)).toEqual([
      'Panel de gerente', 'Resumen mensual', 'Total comprometido', 'Total abonado', 'Total pendiente', 'Total vencido acumulado', 'Pagos del mes',
    ])
    const selector = screen.getByRole('combobox', { name: 'Mes de los pagos' })
    const resumen = screen.getByRole('region', { name: 'Resumen mensual' })
    expect(selector.compareDocumentPosition(resumen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(resumen.compareDocumentPosition(screen.getByRole('table')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    comprobarIndicador('Total comprometido', 'S/ 150.30')
    comprobarIndicador('Total abonado', 'S/ 125.15')
    comprobarIndicador('Total pendiente', 'S/ 25.15')
    comprobarIndicador('Total vencido acumulado', 'S/ 999.10')
    expect(screen.getByText('2 obligaciones vencidas con saldo pendiente')).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(selector).toHaveValue('10')
    expect(screen.queryByRole('button', { name: /^20\d{2}$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Visualizar resumen mensual de pagos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Registrar pago/ })).not.toBeInTheDocument()
    expect(consultar).toHaveBeenCalledExactlyOnceWith('/api/obligaciones', { signal: expect.any(AbortSignal) })
  })

  it('cambia los tres indicadores mensuales y la tabla sin recargar ni filtrar el vencido acumulado', async () => {
    const { consultar } = renderizarPanel()
    await screen.findByRole('table')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '09' } })
    comprobarIndicador('Total comprometido', 'S/ 999.00')
    comprobarIndicador('Total abonado', 'S/ 0.00')
    comprobarIndicador('Total pendiente', 'S/ 999.00')
    comprobarIndicador('Total vencido acumulado', 'S/ 999.10')
    expect(screen.getByRole('table')).toHaveTextContent('Obligación 5')
    expect(screen.getByRole('table')).not.toHaveTextContent('Obligación 1')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '02' } })
    comprobarIndicador('Total comprometido', 'S/ 0.00')
    comprobarIndicador('Total vencido acumulado', 'S/ 999.10')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al mes actual' }))
    comprobarIndicador('Total comprometido', 'S/ 150.30')
    expect(screen.getByRole('table')).toHaveTextContent('Obligación 5')
    expect(consultar).toHaveBeenCalledTimes(1)
  })

  it('actualizar listado refleja un abono parcial y luego la cancelación sin otra petición para el resumen', async () => {
    const consultar = vi.fn().mockResolvedValueOnce({ obligaciones: pagos })
      .mockResolvedValueOnce({ obligaciones: pagos.map((pago) => pago.id === 5 ? { ...pago, saldo_pendiente: '749.00' } : pago) })
      .mockResolvedValueOnce({ obligaciones: pagos.map((pago) => ({ ...pago, saldo_pendiente: '0.00' })) })
    renderizarPanel(consultar)
    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar listado' }))
    await waitFor(() => comprobarIndicador('Total vencido acumulado', 'S/ 749.10'))
    comprobarIndicador('Total pendiente', 'S/ 25.15')
    expect(screen.getByRole('table')).toHaveTextContent('S/ 749.00')
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar listado' }))
    await waitFor(() => comprobarIndicador('Total vencido acumulado', 'S/ 0.00'))
    comprobarIndicador('Total pendiente', 'S/ 0.00')
    expect(screen.getByText('0 obligaciones vencidas con saldo pendiente')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Total vencido acumulado' })).not.toHaveClass('tarjeta-indicador--vencido')
    expect(consultar).toHaveBeenCalledTimes(3)
  })

  it('reutiliza el saldo actualizado desde Ver detalles en ambos indicadores sin recargar el listado', async () => {
    const actualizada = { ...pagos[0], saldo_pendiente: '0.04' }
    const consultar = vi.fn(async (ruta) => ruta === '/api/obligaciones' ? { obligaciones: pagos }
      : ruta.endsWith('/historial') ? { historial: { obligacion_id: 1, concepto: pagos[0].concepto, monto_original: '0.10', saldo_pendiente: '0.04', total_abonado: '0.06', abonos: [], resumen_consistente: true } }
        : { obligacion: actualizada })
    renderizarPanel(consultar)
    fireEvent.click(await screen.findByRole('button', { name: /Ver detalles.*\(#1\)/ }))
    await waitFor(() => comprobarIndicador('Total vencido acumulado', 'S/ 999.04'))
    comprobarIndicador('Total abonado', 'S/ 125.21')
    comprobarIndicador('Total pendiente', 'S/ 25.09')
    expect(consultar.mock.calls.filter(([ruta]) => ruta === '/api/obligaciones')).toHaveLength(1)
  })

  it('muestra carga y error sin inventar importes, y recupera el resumen al reintentar', async () => {
    const consultar = vi.fn().mockRejectedValueOnce(new Error('Sin conexión.')).mockResolvedValue({ obligaciones: [] })
    renderizarPanel(consultar)
    expect(screen.getByRole('region', { name: 'Resumen mensual' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('S/ 0.00')).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
    expect(screen.queryByText('S/ 0.00')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }))
    await waitFor(() => expect(screen.getAllByText('S/ 0.00')).toHaveLength(4))
    expect(screen.getByText('0 obligaciones vencidas con saldo pendiente')).toBeInTheDocument()
  })

  it('no calcula un resumen a partir de una respuesta inválida del servidor', async () => {
    renderizarPanel(vi.fn().mockResolvedValue({ obligaciones: [{ ...pagos[0], saldo_pendiente: '0.11' }] }))
    expect(await screen.findByRole('alert')).toHaveTextContent('listado válido')
    expect(screen.queryByText('S/ 0.00')).not.toBeInTheDocument()
  })

  it('actualiza el vencido al pasar medianoche en Lima usando el temporizador compartido', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-10-19T04:59:50Z'))
    const { consultar } = renderizarPanel()
    await screen.findByRole('table')
    comprobarIndicador('Total vencido acumulado', 'S/ 999.10')
    await act(async () => { vi.advanceTimersByTime(60000) })
    comprobarIndicador('Total vencido acumulado', 'S/ 999.15')
    expect(screen.getByText('3 obligaciones vencidas con saldo pendiente')).toBeInTheDocument()
    expect(consultar).toHaveBeenCalledTimes(2)
  })

  it('cambia al nuevo año de Lima y conserva el vencido aunque el mes no tenga obligaciones', async () => {
    vi.setSystemTime(new Date('2027-01-01T04:59:59Z'))
    renderizarPanel()
    await screen.findByRole('table')
    comprobarIndicador('Total comprometido', 'S/ 0.00')
    expect(screen.getByRole('table')).toHaveTextContent('Obligación 5')
    expect(screen.getByRole('combobox')).toHaveValue('12')
    comprobarIndicador('Total vencido acumulado', 'S/ 1,824.15')
    vi.setSystemTime(new Date('2027-01-01T05:00:00Z'))
    fireEvent.focus(window)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('01'))
    comprobarIndicador('Total comprometido', 'S/ 0.00')
    comprobarIndicador('Total vencido acumulado', 'S/ 1,824.15')
  })

  it('cancela la consulta compartida pendiente al desmontar', async () => {
    let resolver
    const consultar = vi.fn(() => new Promise((continuar) => { resolver = continuar }))
    const { unmount: desmontar } = renderizarPanel(consultar)
    await act(async () => {})
    const senal = consultar.mock.calls[0][1].signal
    desmontar()
    await act(async () => resolver({ obligaciones: pagos }))
    expect(senal.aborted).toBe(true)
    expect(consultar).toHaveBeenCalledTimes(1)
  })

  it('comparte una sola lectura incluso con el montaje estricto de React', async () => {
    const { consultar } = renderizarPanel(undefined, true)
    await screen.findByRole('table')
    comprobarIndicador('Total vencido acumulado', 'S/ 999.10')
    expect(consultar).toHaveBeenCalledTimes(1)
  })

  it('descarta respuestas antiguas cuando cambia el día durante una consulta', async () => {
    let resolverAnterior
    const consultar = vi.fn().mockImplementationOnce(() => new Promise((resolver) => { resolverAnterior = resolver }))
      .mockResolvedValue({ obligaciones: pagos.map((pago) => ({ ...pago, saldo_pendiente: '0.00' })) })
    renderizarPanel(consultar)
    await act(async () => {})
    const senal = consultar.mock.calls[0][1].signal
    vi.setSystemTime(new Date('2026-10-19T15:00:00Z'))
    fireEvent.focus(window)
    await screen.findByRole('table')
    comprobarIndicador('Total vencido acumulado', 'S/ 0.00')
    expect(senal.aborted).toBe(true)
    await act(async () => resolverAnterior({ obligaciones: pagos }))
    comprobarIndicador('Total vencido acumulado', 'S/ 0.00')
    expect(screen.getByRole('table')).not.toHaveTextContent('Obligación 5')
  })
})

describe('HU-07: autorización y retirada de la ruta secundaria', () => {
  const respuesta = (cuerpo, estado = 200) => ({ ok: estado === 200, status: estado, json: async () => cuerpo })
  function renderizarAplicacion(ruta = '/gerente') {
    render(<MemoryRouter initialEntries={[ruta]}><ProveedorAutenticacion><Aplicacion />
      <Link to="/gerente">Panel de prueba</Link>
      <Link to="/gerente/resumen-mensual">Ruta antigua de prueba</Link>
    </ProveedorAutenticacion></MemoryRouter>)
  }
  async function iniciarSesion(rol, estadoConsulta = 200) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respuesta({
      token: 'token-ficticio-hu07', expiresAt: new Date(Date.now() + 60000).toISOString(),
      user: { id: 1, name: 'Usuario de prueba', role: rol },
    })).mockImplementation((url) => Promise.resolve(url.endsWith('/api/obligaciones')
      ? respuesta(estadoConsulta === 200 ? { obligaciones: pagos } : { message: 'Acceso denegado.' }, estadoConsulta)
      : respuesta({ message: 'Panel de prueba.' }))))
    renderizarAplicacion()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByLabelText('Correo electrónico'), 'prueba@example.test')
    await usuario.type(screen.getByLabelText('Contraseña'), 'valor-ficticio')
    await usuario.click(screen.getByRole('button', { name: /^Iniciar sesión/ }))
    return usuario
  }

  it('redirige el panel al login sin sesión y no consulta obligaciones', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderizarAplicacion()
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('el ASISTENTE conserva su listado y controles, sin indicadores ni acceso al panel del GERENTE', async () => {
    const usuario = await iniciarSesion('ASISTENTE')
    await screen.findByRole('table')
    expect(screen.queryByRole('region', { name: 'Resumen mensual' })).not.toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar nueva deuda' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('link', { name: 'Panel de prueba' }))
    expect(screen.getByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('el GERENTE obtiene tabla y cuatro indicadores con una sola lectura autenticada', async () => {
    await iniciarSesion('GERENTE')
    await screen.findByRole('table')
    expect(screen.getAllByRole('article')).toHaveLength(4)
    const llamadas = fetch.mock.calls.filter(([url]) => url.endsWith('/api/obligaciones'))
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0][1]).toEqual(expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer token-ficticio-hu07' }) }))
    expect(fetch.mock.calls.slice(1).every(([, opciones]) => opciones.method === 'GET')).toBe(true)
  })

  it('la antigua ruta muestra Página no encontrada sin consultar otro resumen', async () => {
    const usuario = await iniciarSesion('GERENTE')
    await screen.findByRole('table')
    const consultas = fetch.mock.calls.length
    await usuario.click(screen.getByRole('link', { name: 'Ruta antigua de prueba' }))
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(consultas)
  })

  it('vuelve al login cuando el servidor responde 401', async () => {
    await iniciarSesion('GERENTE', 401)
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión venció')
  })

  it('muestra 403 como error y no como resumen vacío', async () => {
    await iniciarSesion('GERENTE', 403)
    expect(await screen.findByRole('alert')).toHaveTextContent('Acceso denegado.')
    expect(screen.queryByText('S/ 0.00')).not.toBeInTheDocument()
  })
})
