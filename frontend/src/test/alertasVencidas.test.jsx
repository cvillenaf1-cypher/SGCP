import { StrictMode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { Link as Enlace, MemoryRouter } from 'react-router-dom'
import Aplicacion from '../App'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { ProveedorAutenticacion } from '../auth/AuthProvider'
import { PaginaAlertasVencidas } from '../gerente/PaginaAlertasVencidas'
import { PaginaGerente } from '../gerente/PaginaGerente'
import { calcularDiasAtraso, seleccionarAlertasVencidas } from '../gerente/alertasVencidas'

const obligacion = {
  id: 1, concepto: 'Alquiler atrasado', beneficiario: 'Arrendador de prueba',
  monto_original: '100.00', saldo_pendiente: '100.00', fecha_limite: '2026-10-15',
  estado_economico: 'PENDIENTE', vencida: false,
}
const obligaciones = [
  obligacion,
  { ...obligacion, id: 2, concepto: 'Abonada parcialmente', saldo_pendiente: '0.01', fecha_limite: '2026-10-19', estado_economico: 'PARCIAL' },
  { ...obligacion, id: 3, concepto: 'Servicio del día', fecha_limite: '2026-10-20' },
  { ...obligacion, id: 4, concepto: 'Compromiso futuro', fecha_limite: '2026-10-21' },
  { ...obligacion, id: 5, concepto: 'Deuda de septiembre', saldo_pendiente: '35.25', fecha_limite: '2026-09-15' },
  { ...obligacion, id: 6, concepto: 'Ya cancelada', saldo_pendiente: '0.00', fecha_limite: '2026-01-01', estado_economico: 'PAGADO', vencida: true },
  { ...obligacion, id: 7, concepto: 'Pagada hoy', saldo_pendiente: '0.00', fecha_limite: '2026-10-20' },
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T16:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function renderizarAlertas({ solicitar = vi.fn().mockResolvedValue({ obligaciones }), panel = false, estricto = false } = {}) {
  const contenido = <MemoryRouter><ContextoAutenticacion.Provider value={{ solicitar, usuario: { role: 'GERENTE' } }}>
    {panel ? <PaginaGerente /> : <PaginaAlertasVencidas />}
  </ContextoAutenticacion.Provider></MemoryRouter>
  return { ...render(estricto ? <StrictMode>{contenido}</StrictMode> : contenido), solicitar }
}

async function completarConsulta() { await act(async () => {}) }

describe('HU-08: selección global y días civiles de atraso', () => {
  it('incluye vencidas y parciales de todos los meses, separa hoy y excluye futuras y pagadas', () => {
    const originales = structuredClone(obligaciones)
    const { vencidas, vencenHoy } = seleccionarAlertasVencidas(obligaciones)
    expect(vencidas.map(({ id, diasAtraso }) => [id, diasAtraso])).toEqual([[5, 35], [1, 5], [2, 1]])
    expect(vencidas[2].saldo_pendiente).toBe('0.01')
    expect(vencenHoy.map(({ id, diasAtraso }) => [id, diasAtraso])).toEqual([[3, 0]])
    expect(obligaciones).toEqual(originales)
  })

  it.each([
    ['2026-10-15', '2026-10-20', 5], ['2026-10-19', '2026-10-20', 1],
    ['2026-10-20', '2026-10-20', 0], ['2026-10-21', '2026-10-20', 0],
    ['2026-09-30', '2026-10-01', 1], ['2026-12-31', '2027-01-01', 1],
    ['2024-02-28', '2024-03-01', 2], ['2025-02-28', '2025-03-01', 1],
    ['0099-12-31', '0100-01-01', 1],
  ])('calcula %s → %s como %i días sin depender del huso del navegador', (limite, hoy, esperado) => {
    expect(calcularDiasAtraso(limite, hoy)).toBe(esperado)
  })

  it('respeta medianoche de Lima aunque UTC ya esté en otro día, mes y año', () => {
    const filas = [{ ...obligacion, fecha_limite: '2026-12-31' }]
    vi.setSystemTime(new Date('2027-01-01T04:59:59Z'))
    expect(seleccionarAlertasVencidas(filas).vencenHoy).toHaveLength(1)
    expect(seleccionarAlertasVencidas(filas).vencidas).toHaveLength(0)
    vi.setSystemTime(new Date('2027-01-01T05:00:00Z'))
    expect(seleccionarAlertasVencidas(filas).vencidas[0].diasAtraso).toBe(1)
  })

  it('no depende de filtros de HU-06/HU-07 ni de estados vencida desactualizados', () => {
    const filas = [2024, 2025, 2026].map((anio, indice) => ({ ...obligacion, id: indice + 1, fecha_limite: `${anio}-01-01`, vencida: false }))
    expect(seleccionarAlertasVencidas(filas).vencidas.map(({ id }) => id)).toEqual([1, 2, 3])
    expect(seleccionarAlertasVencidas([])).toEqual({ vencidas: [], vencenHoy: [] })
  })

  it.each([
    {}, { obligaciones: [] }, [{ ...obligacion, saldo_pendiente: '-1.00' }],
    [{ ...obligacion, saldo_pendiente: '0.001' }], [{ ...obligacion, saldo_pendiente: '101.00' }],
    [{ ...obligacion, fecha_limite: '2026-02-30' }], [{ ...obligacion, fecha_limite: '2026-13-01' }],
  ])('rechaza datos inválidos sin mostrarlos como ausencia de atrasos: %j', (entrada) => {
    expect(() => seleccionarAlertasVencidas(entrada)).toThrow()
  })
})

describe('HU-08: alertas y panel GERENTE', () => {
  it('muestra carga y cada dato obligatorio, días, saldos exactos y Vence hoy separado', async () => {
    const { solicitar } = renderizarAlertas()
    expect(screen.getByRole('status')).toHaveTextContent('Consultando alertas')
    const lista = await screen.findByRole('list', { name: 'Compromisos vencidos' })
    expect(within(lista).getAllByRole('article')).toHaveLength(3)
    const alquiler = within(lista).getByRole('article', { name: 'Alquiler atrasado' })
    for (const dato of ['Arrendador de prueba', '15/10/2026', 'S/ 100.00', '5 días de atraso', 'Vencido']) {
      expect(within(alquiler).getByText(dato)).toBeInTheDocument()
    }
    expect(within(lista).getByText('S/ 0.01')).toBeInTheDocument()
    expect(within(lista).getByText('S/ 35.25')).toBeInTheDocument()
    expect(within(lista).getByText('1 día de atraso')).toBeInTheDocument()
    const hoy = screen.getByRole('list', { name: 'Compromisos que vencen hoy' })
    expect(hoy).toHaveTextContent('Vence hoy')
    expect(hoy).toHaveTextContent('0 días')
    expect(within(hoy).queryByText('Vencido')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('3 compromisos atrasados')
    for (const concepto of ['Compromiso futuro', 'Ya cancelada', 'Pagada hoy']) expect(screen.queryByText(concepto)).not.toBeInTheDocument()
    expect(screen.queryByText('Solo lectura')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(solicitar).toHaveBeenCalledExactlyOnceWith('/api/obligaciones', { signal: expect.any(AbortSignal) })
  })

  it('distingue el saldo máximo DECIMAL de un importe redondeado con coma flotante', async () => {
    renderizarAlertas({ solicitar: vi.fn().mockResolvedValue({ obligaciones: [{ ...obligacion, monto_original: '99999999999.99', saldo_pendiente: '99999999999.98' }] }) })
    expect(await screen.findByText('S/ 99,999,999,999.98')).toBeInTheDocument()
  })

  it('informa que no hay atrasos aunque existan avisos para hoy', async () => {
    renderizarAlertas({ solicitar: vi.fn().mockResolvedValue({ obligaciones: [obligaciones[2]] }) })
    expect(await screen.findByText('No existen compromisos atrasados.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('0 compromisos atrasados')
    expect(screen.getByText('Vence hoy')).toBeInTheDocument()
  })

  it('diferencia errores y respuestas inválidas de una consulta vacía y permite reintentar', async () => {
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: {} }).mockResolvedValue({ obligaciones: [] })
    renderizarAlertas({ solicitar })
    expect(await screen.findByRole('alert')).toHaveTextContent('listado válido')
    expect(screen.queryByText('No existen compromisos atrasados.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta de alertas' }))
    expect(await screen.findByText('No existen compromisos atrasados.')).toBeInTheDocument()
  })

  it('presenta el aviso compacto y comparte una única consulta con los pagos del panel', async () => {
    const solicitar = vi.fn(async (ruta) => ruta === '/api/obligaciones' ? { obligaciones } : { message: 'Panel habilitado' })
    renderizarAlertas({ solicitar, panel: true })
    const resumen = screen.getByRole('region', { name: 'Alertas de pagos vencidos' })
    expect(await within(resumen).findByText('3 compromisos atrasados con saldo pendiente.')).toBeInTheDocument()
    expect(resumen).toHaveClass('resumen-alertas--vencidas')
    expect(within(resumen).getByText('Vence hoy: 1 compromiso.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver alertas de pagos vencidos' })).toHaveAttribute('href', '/gerente/alertas-vencidas')
    expect(solicitar.mock.calls.filter(([ruta]) => ruta === '/api/obligaciones')).toHaveLength(1)
    expect(screen.getByRole('table')).toHaveTextContent('Deuda de septiembre')
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar listado' }))
    await completarConsulta()
    expect(solicitar.mock.calls.filter(([ruta]) => ruta === '/api/obligaciones')).toHaveLength(2)
    expect(solicitar.mock.calls.every(([, opciones]) => !opciones.method || opciones.method === 'GET')).toBe(true)
  })

  it('actualiza saldo y retira la obligación completamente pagada en la siguiente consulta', async () => {
    vi.useFakeTimers()
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ obligaciones: [{ ...obligacion, saldo_pendiente: '25.10' }] })
      .mockResolvedValue({ obligaciones: [{ ...obligacion, saldo_pendiente: '0.00' }] })
    renderizarAlertas({ solicitar })
    await completarConsulta()
    expect(screen.getByText('S/ 100.00')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByText('S/ 25.10')).toBeInTheDocument()
    expect(screen.getByText('Vencido')).toBeInTheDocument()
    fireEvent.focus(window)
    await completarConsulta()
    expect(screen.getByText('No existen compromisos atrasados.')).toBeInTheDocument()
    expect(screen.queryByText('Alquiler atrasado')).not.toBeInTheDocument()
    expect(solicitar).toHaveBeenCalledTimes(3)
  })

  it('mantiene actualizados el contador compacto y el listado del panel después de abonos', async () => {
    vi.useFakeTimers()
    let filas = [obligacion]
    const solicitar = vi.fn(async (ruta) => ruta === '/api/obligaciones' ? { obligaciones: filas } : { message: 'Panel habilitado' })
    renderizarAlertas({ solicitar, panel: true })
    await completarConsulta()
    const resumen = screen.getByRole('region', { name: 'Alertas de pagos vencidos' })
    expect(resumen).toHaveTextContent('1 compromiso atrasado con saldo pendiente.')
    filas = [{ ...obligacion, saldo_pendiente: '0.00' }]
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(resumen).toHaveTextContent('No existen compromisos atrasados.')
    expect(resumen).not.toHaveClass('resumen-alertas--vencidas')
    expect(screen.getByRole('table')).toHaveTextContent('Pagado')
    expect(solicitar.mock.calls.filter(([ruta]) => ruta === '/api/obligaciones')).toHaveLength(2)
  })

  it('evita solicitudes simultáneas por foco y temporizador, y limpia recursos al desmontar', async () => {
    vi.useFakeTimers()
    let resolver
    const solicitar = vi.fn().mockImplementation(() => new Promise((continuar) => { resolver = continuar }))
    const { unmount: desmontar } = renderizarAlertas({ solicitar, estricto: true })
    await completarConsulta()
    fireEvent.focus(window)
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(solicitar).toHaveBeenCalledTimes(1)
    const senal = solicitar.mock.calls[0][1].signal
    desmontar()
    expect(senal.aborted).toBe(true)
    await act(async () => resolver({ obligaciones }))
    fireEvent.focus(window)
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(solicitar).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('descarta la respuesta de una sesión anterior aunque llegue después de la actual', async () => {
    let resolverAnterior
    const solicitarAnterior = vi.fn(() => new Promise((resolver) => { resolverAnterior = resolver }))
    const solicitarNuevo = vi.fn().mockResolvedValue({ obligaciones: [] })
    const contenido = (solicitar) => <MemoryRouter><ContextoAutenticacion.Provider value={{ solicitar }}><PaginaAlertasVencidas /></ContextoAutenticacion.Provider></MemoryRouter>
    const { rerender: renderizarDeNuevo } = render(contenido(solicitarAnterior))
    await completarConsulta()
    renderizarDeNuevo(contenido(solicitarNuevo))
    await screen.findByText('No existen compromisos atrasados.')
    expect(solicitarAnterior.mock.calls[0][1].signal.aborted).toBe(true)
    await act(async () => resolverAnterior({ obligaciones }))
    expect(screen.queryByText('Alquiler atrasado')).not.toBeInTheDocument()
    expect(screen.getByText('No existen compromisos atrasados.')).toBeInTheDocument()
  })

  it('convierte Vence hoy en vencido y aumenta los días al cambiar el día de Lima', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T04:59:50Z'))
    renderizarAlertas({ solicitar: vi.fn().mockResolvedValue({ obligaciones: [obligaciones[2]] }) })
    await completarConsulta()
    expect(screen.getByText('Vence hoy')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByText('Vencido')).toBeInTheDocument()
    expect(screen.getByText('1 día de atraso')).toBeInTheDocument()
    vi.setSystemTime(new Date('2026-10-22T05:00:00Z'))
    fireEvent.focus(window)
    await completarConsulta()
    expect(screen.getByText('2 días de atraso')).toBeInTheDocument()
  })

  it('sincroniza la fecha del aviso y del listado del panel al cambiar el día de Lima', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T04:59:50Z'))
    const solicitar = vi.fn(async (ruta) => ruta === '/api/obligaciones' ? { obligaciones: [obligaciones[2]] } : { message: 'Panel habilitado' })
    renderizarAlertas({ solicitar, panel: true })
    await completarConsulta()
    expect(screen.queryByText('Vencida · pendiente de cancelar')).not.toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByText('1 compromiso atrasado con saldo pendiente.')).toBeInTheDocument()
    expect(screen.getByText('Vencida · pendiente de cancelar')).toBeInTheDocument()
  })

  it('se recupera automáticamente de un error de red y no confunde el fallo con cero atrasos', async () => {
    vi.useFakeTimers()
    const solicitar = vi.fn().mockRejectedValueOnce(new Error('Error de conexión de prueba.')).mockResolvedValue({ obligaciones })
    renderizarAlertas({ solicitar })
    await completarConsulta()
    expect(screen.getByRole('alert')).toHaveTextContent('Error de conexión de prueba.')
    expect(screen.queryByText('No existen compromisos atrasados.')).not.toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Compromisos vencidos' })).toHaveTextContent('Alquiler atrasado')
  })

  it('no conserva datos de otra sesión si falla la nueva consulta', async () => {
    const solicitarAnterior = vi.fn().mockResolvedValue({ obligaciones })
    const solicitarNuevo = vi.fn().mockRejectedValue(new Error('Nueva sesión sin acceso.'))
    const contenido = (solicitar) => <MemoryRouter><ContextoAutenticacion.Provider value={{ solicitar }}><PaginaGerente /></ContextoAutenticacion.Provider></MemoryRouter>
    const { rerender: renderizarDeNuevo } = render(contenido(solicitarAnterior))
    await screen.findByRole('table')
    renderizarDeNuevo(contenido(solicitarNuevo))
    await completarConsulta()
    expect(screen.queryByText('Alquiler atrasado')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('No existen compromisos atrasados.')).not.toBeInTheDocument()
  })
})

describe('HU-08: rutas y cliente autenticado existentes', () => {
  const ruta = '/gerente/alertas-vencidas'
  const respuesta = (cuerpo, estado = 200) => ({ ok: estado === 200, status: estado, json: async () => cuerpo })

  function renderizarAplicacion() {
    return render(<MemoryRouter initialEntries={[ruta]}><ProveedorAutenticacion><Aplicacion />
      <Enlace to={ruta}>Abrir alertas de prueba</Enlace>
      <Enlace to="/gerente/pagos-del-mes">Consultar otro mes de prueba</Enlace>
      <Enlace to="/gerente/resumen-mensual">Consultar resumen de prueba</Enlace>
    </ProveedorAutenticacion></MemoryRouter>)
  }

  async function iniciarSesion(rol, estadoAlertas = 200) {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('/api/auth/login')) return respuesta({ token: 'token-ficticio-hu08', expiresAt: new Date(Date.now() + 600000).toISOString(), user: { id: 1, name: 'Usuario de prueba', role: rol } })
      if (url.endsWith('/api/obligaciones')) return respuesta({ obligaciones }, estadoAlertas)
      return respuesta({ message: 'Panel habilitado' })
    }))
    renderizarAplicacion()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByLabelText('Correo electrónico'), 'prueba@example.test')
    await usuario.type(screen.getByLabelText('Contraseña'), 'valor-ficticio')
    await usuario.click(screen.getByRole('button', { name: /^Iniciar sesión/ }))
    return usuario
  }

  it('redirige al login sin sesión y no consulta el listado', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderizarAplicacion()
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('impide al ASISTENTE acceder a la ruta y no añade peticiones al listado', async () => {
    const usuario = await iniciarSesion('ASISTENTE')
    await screen.findByRole('heading', { name: 'Panel de asistente' })
    const anteriores = fetch.mock.calls.filter(([url]) => url.endsWith('/api/obligaciones')).length
    await usuario.click(screen.getByRole('link', { name: 'Abrir alertas de prueba' }))
    expect(screen.getByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument()
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/api/obligaciones'))).toHaveLength(anteriores)
  })

  it('entra desde el aviso del panel, usa GET con Bearer y no realiza escrituras', async () => {
    const usuario = await iniciarSesion('GERENTE')
    await screen.findByRole('heading', { name: 'Panel de gerente' })
    await usuario.click(screen.getByRole('link', { name: 'Ver alertas de pagos vencidos' }))
    await screen.findByRole('list', { name: 'Compromisos vencidos' })
    expect(screen.getByRole('heading', { name: 'Alertas de pagos vencidos', level: 2 })).toBeInTheDocument()
    const llamadas = fetch.mock.calls.filter(([url]) => url.endsWith('/api/obligaciones'))
    expect(llamadas).toHaveLength(2)
    for (const [, opciones] of llamadas) expect(opciones).toEqual(expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer token-ficticio-hu08' }) }))
    expect(fetch.mock.calls.slice(1).every(([, opciones]) => opciones.method === 'GET')).toBe(true)
    expect(screen.queryByRole('button', { name: /Registrar|Modificar|Eliminar|Cancelar/ })).not.toBeInTheDocument()
  })

  it('mantiene las alertas globales después de cambiar filtros mensuales y de resumen', async () => {
    const usuario = await iniciarSesion('GERENTE')
    await screen.findByRole('heading', { name: 'Panel de gerente' })
    await usuario.click(screen.getByRole('link', { name: 'Consultar otro mes de prueba' }))
    await usuario.selectOptions(screen.getByLabelText('Mes'), '2')
    await usuario.click(screen.getByRole('button', { name: '2025' }))
    await usuario.click(screen.getByRole('link', { name: 'Consultar resumen de prueba' }))
    await usuario.selectOptions(screen.getByLabelText('Mes'), '12')
    await usuario.click(screen.getByRole('button', { name: '2024' }))
    await usuario.click(screen.getByRole('link', { name: 'Abrir alertas de prueba' }))
    const lista = await screen.findByRole('list', { name: 'Compromisos vencidos' })
    expect(within(lista).getAllByRole('article')).toHaveLength(3)
    expect(lista).toHaveTextContent('Deuda de septiembre')
    expect(screen.queryByLabelText('Mes')).not.toBeInTheDocument()
  })

  it('restaura el login ante un 401 del listado autenticado', async () => {
    await iniciarSesion('GERENTE', 401)
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión venció')
  })

  it('presenta un 403 del servidor como error y conserva la restricción de acceso', async () => {
    const usuario = await iniciarSesion('GERENTE', 403)
    await screen.findByRole('heading', { name: 'Panel de gerente' })
    await usuario.click(screen.getByRole('link', { name: 'Abrir alertas de prueba' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron consultar las alertas.')
    expect(screen.queryByText('No existen compromisos atrasados.')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Compromisos vencidos' })).not.toBeInTheDocument()
  })
})
