import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link as Enlace, MemoryRouter } from 'react-router-dom'
import Aplicacion from '../App'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { ProveedorAutenticacion } from '../auth/AuthProvider'
import { PaginaResumenMensual } from '../gerente/PaginaResumenMensual'
import { calcularResumenMensual, formatearCentavos, obtenerFechaLima } from '../gerente/resumenMensual'
import { consultarPagosDelMes } from '../gerente/servicioPagos'

const pagos = [
  { montoOriginal: '0.10', saldoPendiente: '0.10', fechaLimite: '2026-10-01' },
  { montoOriginal: '0.20', saldoPendiente: '0.05', fechaLimite: '2026-10-18' },
  { montoOriginal: '100.00', saldoPendiente: '0.00', fechaLimite: '2026-10-05' },
  { montoOriginal: '50.00', saldoPendiente: '25.00', fechaLimite: '2026-10-31' },
  { montoOriginal: '999.00', saldoPendiente: '999.00', fechaLimite: '2026-09-30' },
  { montoOriginal: '800.00', saldoPendiente: '800.00', fechaLimite: '2026-11-01' },
  { montoOriginal: '3.00', saldoPendiente: '1.00', fechaLimite: '2032-10-01' },
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-18T15:00:00Z'))
})

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function renderizarResumen(consultarPagos = vi.fn().mockResolvedValue(pagos), estricto = false) {
  const solicitar = vi.fn()
  const contenido = <MemoryRouter><ContextoAutenticacion.Provider value={{ solicitar }}>
    <PaginaResumenMensual consultarPagos={consultarPagos} />
  </ContextoAutenticacion.Provider></MemoryRouter>
  const vista = render(estricto ? <StrictMode>{contenido}</StrictMode> : contenido)
  return { ...vista, consultarPagos, solicitar, usuario: userEvent.setup() }
}

function comprobarIndicador(titulo, importe) {
  expect(within(screen.getByRole('article', { name: titulo })).getByText(importe)).toBeInTheDocument()
}

async function completarConsulta() {
  await act(async () => { })
}

describe('HU-07: cálculos mensuales exactos', () => {
  it('suma por fecha límite, incluye extremos del mes y distingue vencidos, hoy, futuros y pagados', () => {
    expect(calcularResumenMensual(pagos, 10, 2026)).toEqual({
      comprometido: 15030n, abonado: 12515n, pendiente: 2515n, vencido: 10n, cantidad: 4,
    })
  })

  it('conserva centavos incluso cuando el acumulado supera la precisión de Number', () => {
    const resumen = calcularResumenMensual([
      { montoOriginal: '90071992547409.91', saldoPendiente: '90071992547409.90', fechaLimite: '2026-10-01' },
      { montoOriginal: '0.20', saldoPendiente: '0.10', fechaLimite: '2026-10-02' },
      { montoOriginal: '0.10', saldoPendiente: '0.00', fechaLimite: '2026-10-03' },
    ], 10, 2026)
    expect(resumen.comprometido).toBe(9007199254741021n)
    expect(resumen.abonado).toBe(21n)
    expect(resumen.pendiente).toBe(9007199254741000n)
    expect(formatearCentavos(resumen.comprometido)).toBe('S/ 90,071,992,547,410.21')
    expect(formatearCentavos(0n)).toBe('S/ 0.00')
    expect(formatearCentavos(1n)).toBe('S/ 0.01')
  })

  it('usa el día de Lima antes y después de medianoche, incluso al cambiar año', () => {
    const fecha = new Date('2027-01-01T02:00:00Z')
    expect(obtenerFechaLima(fecha)).toBe('2026-12-31')
    const obligaciones = [
      { montoOriginal: '1.00', saldoPendiente: '1.00', fechaLimite: '2026-12-30' },
      { montoOriginal: '2.00', saldoPendiente: '2.00', fechaLimite: '2026-12-31' },
    ]
    expect(calcularResumenMensual(obligaciones, 12, 2026, fecha).vencido).toBe(100n)
    expect(calcularResumenMensual(obligaciones, 12, 2026, new Date('2027-01-01T05:00:00Z')).vencido).toBe(300n)
  })

  it('contabiliza abonos de septiembre, octubre y noviembre para una obligación de octubre', async () => {
    const abonos = [
      { monto: 1010n, fechaRegistro: '2026-09-30' },
      { monto: 2020n, fechaRegistro: '2026-10-10' },
      { monto: 3030n, fechaRegistro: '2026-11-01' },
    ]
    const saldo = 10000n - abonos.reduce((total, abono) => total + abono.monto, 0n)
    const solicitar = vi.fn().mockResolvedValue({
      obligaciones: [{
        monto_original: '100.00', saldo_pendiente: `${saldo / 100n}.${saldo % 100n}`,
        fecha_limite: '2026-10-15', fecha_registro: '2026-08-01', estado_economico: 'PARCIAL',
      }]
    })
    const obligaciones = await consultarPagosDelMes({ solicitar })
    expect(calcularResumenMensual(obligaciones, 10, 2026).abonado).toBe(6060n)
    expect(solicitar).toHaveBeenCalledExactlyOnceWith('/api/obligaciones', { signal: undefined })
  })

  it('devuelve ceros en meses vacíos y acepta febrero bisiesto', () => {
    expect(calcularResumenMensual(pagos, 2, 2026)).toEqual({
      comprometido: 0n, abonado: 0n, pendiente: 0n, vencido: 0n, cantidad: 0,
    })
    expect(calcularResumenMensual([{ ...pagos[0], fechaLimite: '2024-02-29' }], 2, 2024).cantidad).toBe(1)
  })

  it('rechaza importes o saldos inválidos sin redondearlos ni presentarlos como ceros', () => {
    for (const montoOriginal of ['0.001', '-1', '1e2', '', null, 0.1]) {
      expect(() => calcularResumenMensual([{ ...pagos[0], montoOriginal }], 10, 2026)).toThrow('importe inválido')
    }
    expect(() => calcularResumenMensual([{ ...pagos[0], saldoPendiente: '0.11' }], 10, 2026)).toThrow('saldo inválido')
    expect(() => calcularResumenMensual({}, 10, 2026)).toThrow('lista de pagos inválida')
  })
})

describe('HU-07: pantalla y actualización automática', () => {
  it('selecciona el período actual, usa la autenticación y presenta cuatro tarjetas en soles', async () => {
    const { consultarPagos, solicitar } = renderizarResumen()
    expect(screen.getByRole('status')).toHaveTextContent('Consultando resumen de octubre de 2026')
    expect(screen.getByLabelText('Mes')).toHaveValue('10')
    expect(screen.getByRole('button', { name: '2026' })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByRole('article', { name: 'Total comprometido' })
    comprobarIndicador('Total comprometido', 'S/ 150.30')
    comprobarIndicador('Total abonado', 'S/ 125.15')
    comprobarIndicador('Total pendiente', 'S/ 25.15')
    comprobarIndicador('Total vencido', 'S/ 0.10')
    expect(consultarPagos).toHaveBeenCalledExactlyOnceWith({ mes: 10, anio: 2026, solicitar, senal: expect.any(AbortSignal) })
    expect(screen.queryByText('Solo lectura')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button').every((boton) => boton.classList.contains('boton-anio'))).toBe(true)
  })

  it('selecciona diciembre del año anterior cuando en UTC ya es enero', async () => {
    vi.setSystemTime(new Date('2027-01-01T02:00:00Z'))
    const { consultarPagos } = renderizarResumen()
    await screen.findByText('No hay obligaciones con vencimiento en este período.')
    expect(screen.getByLabelText('Mes')).toHaveValue('12')
    expect(consultarPagos).toHaveBeenCalledWith(expect.objectContaining({ mes: 12, anio: 2026 }))
  })

  it('permite cambiar de mes y año, incluyendo años descubiertos en los datos', async () => {
    const { usuario } = renderizarResumen()
    await usuario.click(await screen.findByRole('button', { name: '2032' }))
    await screen.findByText('S/ 3.00')
    comprobarIndicador('Total abonado', 'S/ 2.00')
    await usuario.selectOptions(screen.getByLabelText('Mes'), '2')
    expect(await screen.findByRole('status')).toHaveTextContent('No hay obligaciones con vencimiento en este período.')
    expect(screen.getAllByText('S/ 0.00')).toHaveLength(4)
  })

  it('muestra errores iniciales y recupera la consulta al volver al foco', async () => {
    const consultarPagos = vi.fn().mockRejectedValueOnce(new Error('Sin conexión.')).mockResolvedValue(pagos)
    renderizarResumen(consultarPagos)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
    expect(screen.queryByText('No hay obligaciones con vencimiento en este período.')).not.toBeInTheDocument()
    fireEvent.focus(window)
    await screen.findByText('S/ 150.30')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('descarta resultados obsoletos y cancela la consulta al cambiar de período', async () => {
    let resolverAnterior
    const consultarPagos = vi.fn().mockImplementationOnce(() => new Promise((resolver) => { resolverAnterior = resolver })).mockResolvedValue(pagos)
    const { usuario } = renderizarResumen(consultarPagos)
    await completarConsulta()
    const senal = consultarPagos.mock.calls[0][0].senal
    await usuario.selectOptions(screen.getByLabelText('Mes'), '9')
    await within(await screen.findByRole('article', { name: 'Total comprometido' })).findByText('S/ 999.00')
    expect(senal.aborted).toBe(true)
    await act(async () => resolverAnterior(pagos))
    expect(screen.queryByText('S/ 150.30')).not.toBeInTheDocument()
    comprobarIndicador('Total comprometido', 'S/ 999.00')
  })

  it('refresca cada 30 segundos y al foco, evita duplicados y libera recursos', async () => {
    vi.useFakeTimers()
    let resolverActualizacion
    const consultarPagos = vi.fn().mockResolvedValueOnce(pagos)
      .mockImplementationOnce(() => new Promise((resolver) => { resolverActualizacion = resolver }))
      .mockResolvedValue(pagos)
    const { unmount: desmontar } = renderizarResumen(consultarPagos)
    await completarConsulta()
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(consultarPagos).toHaveBeenCalledTimes(2)
    fireEvent.focus(window)
    fireEvent.focus(window)
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(consultarPagos).toHaveBeenCalledTimes(2)
    await act(async () => resolverActualizacion(pagos.map((pago, indice) => indice === 3 ? { ...pago, saldoPendiente: '15.00' } : pago)))
    comprobarIndicador('Total abonado', 'S/ 135.15')
    comprobarIndicador('Total pendiente', 'S/ 15.15')
    fireEvent.focus(window)
    await completarConsulta()
    expect(consultarPagos).toHaveBeenCalledTimes(3)
    const senal = consultarPagos.mock.calls[2][0].senal
    desmontar()
    expect(senal.aborted).toBe(true)
    fireEvent.focus(window)
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(consultarPagos).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('no duplica la carga inicial en el modo estricto de React', async () => {
    const { consultarPagos } = renderizarResumen(undefined, true)
    await screen.findByText('S/ 150.30')
    expect(consultarPagos).toHaveBeenCalledTimes(1)
  })

  it('cancela una solicitud pendiente al desmontar y no programa nuevas consultas', async () => {
    vi.useFakeTimers()
    let resolver
    const consultarPagos = vi.fn().mockImplementation(() => new Promise((continuar) => { resolver = continuar }))
    const { unmount: desmontar } = renderizarResumen(consultarPagos)
    await completarConsulta()
    const senal = consultarPagos.mock.calls[0][0].senal
    desmontar()
    await act(async () => resolver(pagos))
    expect(senal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('recalcula los vencidos al pasar la medianoche de Lima', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T04:59:50Z'))
    renderizarResumen()
    await completarConsulta()
    comprobarIndicador('Total vencido', 'S/ 0.10')
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    comprobarIndicador('Total vencido', 'S/ 0.15')
  })
})

describe('HU-07: restricciones de acceso con el login existente', () => {
  const ruta = '/gerente/resumen-mensual'
  const respuesta = (cuerpo, estado = 200) => ({ ok: estado === 200, status: estado, json: async () => cuerpo })

  function renderizarAplicacion() {
    render(<MemoryRouter initialEntries={[ruta]}><ProveedorAutenticacion><Aplicacion />
      <Enlace to={ruta}>Resumen de prueba</Enlace>
    </ProveedorAutenticacion></MemoryRouter>)
  }

  async function iniciarSesion(rol, estadoConsulta = 200) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respuesta({
      token: 'token-ficticio-hu07', expiresAt: new Date(Date.now() + 60000).toISOString(),
      user: { id: 1, name: 'Usuario de prueba', role: rol },
    })).mockImplementation((url) => Promise.resolve(url.endsWith('/api/obligaciones')
      ? respuesta(estadoConsulta === 200 ? { obligaciones: [] } : { message: 'Acceso denegado.' }, estadoConsulta)
      : respuesta({ message: 'Panel de prueba.' }))))
    renderizarAplicacion()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByLabelText('Correo electrónico'), 'prueba@example.test')
    await usuario.type(screen.getByLabelText('Contraseña'), 'valor-ficticio')
    await usuario.click(screen.getByRole('button', { name: /^Iniciar sesión/ }))
    return usuario
  }

  it('redirige al login sin sesión y no consulta obligaciones', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderizarAplicacion()
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('impide al ASISTENTE abrir HU-07 sin consultar el listado del resumen', async () => {
    const usuario = await iniciarSesion('ASISTENTE')
    await screen.findByRole('heading', { name: 'Panel de asistente' })
    const consultasAntes = fetch.mock.calls.filter(([url]) => url.endsWith('/api/obligaciones')).length
    await usuario.click(screen.getByRole('link', { name: 'Resumen de prueba' }))
    expect(screen.getByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument()
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/api/obligaciones'))).toHaveLength(consultasAntes)
    expect(screen.queryByLabelText('Mes')).not.toBeInTheDocument()
  })

  it('permite al GERENTE entrar desde su panel y usa GET con su token', async () => {
    const usuario = await iniciarSesion('GERENTE')
    await screen.findByRole('heading', { name: 'Panel de gerente' })
    await usuario.click(screen.getByRole('link', { name: /Visualizar resumen mensual/ }))
    await screen.findByText('No hay obligaciones con vencimiento en este período.')
    expect(screen.getAllByText('S/ 0.00')).toHaveLength(4)
    const llamadas = fetch.mock.calls.filter(([url]) =>
      url.endsWith('/api/obligaciones')
    )

    expect(llamadas.length).toBeGreaterThanOrEqual(1)

    for (const [, opciones] of llamadas) {
      expect(opciones).toEqual(
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-ficticio-hu07',
          }),
        })
      )
    }
  })

  it('vuelve al login cuando el servidor responde 401', async () => {
    const usuario = await iniciarSesion('GERENTE', 401)
    await screen.findByRole('heading', { name: 'Panel de gerente' })
    await usuario.click(screen.getByRole('link', { name: 'Resumen de prueba' }))
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión venció')
  })

  it('muestra 403 como error y no como resumen vacío', async () => {
    const usuario = await iniciarSesion('GERENTE', 403)
    await screen.findByRole('heading', { name: 'Panel de gerente' })
    await usuario.click(screen.getByRole('link', { name: 'Resumen de prueba' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Acceso denegado.')
    expect(screen.queryByText('S/ 0.00')).not.toBeInTheDocument()
  })
})
