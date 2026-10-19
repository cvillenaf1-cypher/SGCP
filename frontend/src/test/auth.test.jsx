import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router-dom'
import Aplicacion from '../App'
import { ProveedorAutenticacion } from '../auth/AuthProvider'

const respuesta = (cuerpo, estado = 200) => ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo })
const sesionPrueba = (rol = 'ASISTENTE') => ({ token: 'token-de-prueba-no-real', expiresAt: new Date(Date.now() + 60000).toISOString(), user: { id: 1, name: 'Usuario de prueba', email: 'prueba@example.test', role: rol } })

function renderizarAplicacion(ruta = '/login') {
  return render(<MemoryRouter initialEntries={[ruta]}><ProveedorAutenticacion><Aplicacion /><Link to="/gerente">Ir a gerente (prueba)</Link><Link to="/asistente">Ir a asistente (prueba)</Link></ProveedorAutenticacion></MemoryRouter>)
}

async function completarInicioSesion() {
  const usuario = userEvent.setup()
  await usuario.type(screen.getByLabelText('Correo electrónico'), 'prueba@example.test')
  await usuario.type(screen.getByLabelText('Contraseña'), 'valor-solo-para-mock')
  await usuario.click(screen.getByRole('button', { name: /^Iniciar sesión/ }))
  return usuario
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); localStorage.clear(); sessionStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('Acceso SGCP', () => {
  it('redirige una ruta protegida sin sesión hacia el login', () => {
    renderizarAplicacion('/gerente')
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('valida campos obligatorios antes de llamar a la API', async () => {
    renderizarAplicacion()
    await userEvent.click(screen.getByRole('button', { name: /^Iniciar sesión/ }))
    expect(screen.getByText('Ingresa un correo electrónico válido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('muestra credenciales incorrectas sin entrar al panel', async () => {
    fetch.mockResolvedValue(respuesta({ message: 'Correo o contraseña incorrectos.' }, 401))
    renderizarAplicacion()
    await completarInicioSesion()
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.')
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  for (const [rol, titulo] of [['ASISTENTE', 'Panel de asistente'], ['GERENTE', 'Panel de gerente']]) {
    it(`entra al panel de ${rol}, envía Bearer y no persiste secretos en almacenamiento web`, async () => {
      fetch.mockResolvedValueOnce(respuesta(sesionPrueba(rol))).mockResolvedValue(respuesta({ message: 'Acceso verificado por la API.' }))
      renderizarAplicacion()
      await completarInicioSesion()
      expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument()
      await screen.findByText('Acceso verificado por la API.')
      expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer token-de-prueba-no-real')
      expect(localStorage.length).toBe(0)
      expect(sessionStorage.length).toBe(0)
      if (rol === 'GERENTE') {
        expect(screen.queryByRole('button', { name: 'Consultar historial de pagos' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Registrar pagos realizados' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Consultar pagos pendientes' })).not.toBeInTheDocument()
        expect(screen.getByText('Solo lectura')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Registrar pago pendiente' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByText('Ir a asistente (prueba)'))
        expect(screen.getByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument()
        expect(screen.queryByLabelText('Concepto del pago')).not.toBeInTheDocument()
      } else {
        expect(screen.getByLabelText('Concepto del pago')).toBeInTheDocument()
      }
    })
  }

  it('bloquea navegación al panel de otro rol sin consultar ese endpoint', async () => {
    fetch.mockResolvedValueOnce(respuesta(sesionPrueba())).mockResolvedValue(respuesta({ message: 'Acceso habilitado.' }))
    renderizarAplicacion()
    const usuario = await completarInicioSesion()
    await screen.findByRole('heading', { name: 'Panel de asistente' })
    await usuario.click(screen.getByText('Ir a gerente (prueba)'))
    expect(screen.getByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument()
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/api/panel/gerente'))).toBe(false)
  })

  it('un 401 de la API elimina la sesión y muestra aviso en login', async () => {
    fetch.mockResolvedValueOnce(respuesta(sesionPrueba())).mockResolvedValue(respuesta({ message: 'Sesión vencida.' }, 401))
    renderizarAplicacion()
    await completarInicioSesion()
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión venció')
  })

  it('ASISTENTE navega a consulta con Bearer y un 401 de obligaciones devuelve al login', async () => {
    fetch.mockResolvedValueOnce(respuesta(sesionPrueba()))
      .mockResolvedValueOnce(respuesta({ message: 'Acceso habilitado.' }))
      .mockResolvedValue(respuesta({ message: 'Sesión vencida.' }, 401))
    renderizarAplicacion()
    const usuario = await completarInicioSesion()
    await screen.findByText('Acceso habilitado.')
    await usuario.click(screen.getByRole('button', { name: 'Consultar pagos pendientes' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    const llamada = fetch.mock.calls.find(([url]) => url.endsWith('/api/obligaciones'))
    expect(llamada[1].headers.Authorization).toBe('Bearer token-de-prueba-no-real')
  })

  it('ASISTENTE abre HU-03 con sesión y consulta sus obligaciones con Bearer', async () => {
    fetch.mockResolvedValueOnce(respuesta(sesionPrueba()))
      .mockResolvedValueOnce(respuesta({ message: 'Acceso habilitado.' }))
      .mockResolvedValue(respuesta({ obligaciones: [] }))
    renderizarAplicacion()
    const usuario = await completarInicioSesion()
    await screen.findByText('Acceso habilitado.')
    await usuario.click(screen.getByRole('button', { name: 'Registrar pagos realizados' }))
    expect(await screen.findByRole('heading', { name: 'Registrar pagos realizados' })).toBeInTheDocument()
    await screen.findByText('Todavía no hay obligaciones registradas. Registra primero un pago pendiente.')
    const llamada = fetch.mock.calls.find(([url]) => url.endsWith('/api/obligaciones'))
    expect(llamada[1].headers.Authorization).toBe('Bearer token-de-prueba-no-real')
    expect(fetch.mock.calls.filter(([, opciones]) => opciones.method === 'POST')).toHaveLength(1)
  })

  it('ASISTENTE abre el historial y una sesión vencida al consultar vuelve al login', async () => {
    fetch.mockResolvedValueOnce(respuesta(sesionPrueba()))
      .mockResolvedValueOnce(respuesta({ message: 'Acceso habilitado.' }))
      .mockResolvedValue(respuesta({ message: 'Sesión vencida.' }, 401))
    renderizarAplicacion()
    const usuario = await completarInicioSesion()
    await screen.findByText('Acceso habilitado.')
    await usuario.click(screen.getByRole('button', { name: 'Consultar historial de pagos' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    const llamada = fetch.mock.calls.find(([url]) => url.endsWith('/api/obligaciones'))
    expect(llamada[1].headers.Authorization).toBe('Bearer token-de-prueba-no-real')
  })

  it('consulta el historial real con Bearer y únicamente realiza lecturas después del login', async () => {
    const obligacion = { id: 81, concepto: 'Servicio de limpieza', monto_original: '100.00', saldo_pendiente: '0.00', estado_economico: 'PAGADO' }
    fetch.mockResolvedValueOnce(respuesta(sesionPrueba()))
      .mockResolvedValueOnce(respuesta({ message: 'Acceso habilitado.' }))
      .mockResolvedValueOnce(respuesta({ obligaciones: [obligacion] }))
      .mockResolvedValue(respuesta({ historial: {
        obligacion_id: 81, concepto: obligacion.concepto, monto_original: '100.00', total_abonado: '100.00', saldo_pendiente: '0.00',
        estado_economico: 'PAGADO', resumen_consistente: true, advertencia: null,
        abonos: [{ id: 8, monto: '100.00', medio_pago: 'Efectivo', fecha_registro: '2026-10-18T16:00:00.000Z', tiene_comprobante: false, puede_descargar_comprobante: false, url_comprobante: null }],
      } }))
    renderizarAplicacion()
    const usuario = await completarInicioSesion()
    await screen.findByText('Acceso habilitado.')
    await usuario.click(screen.getByRole('button', { name: 'Consultar historial de pagos' }))
    await screen.findByRole('option', { name: 'Servicio de limpieza — PAGADO' })
    await usuario.selectOptions(screen.getByLabelText('Obligación a consultar'), '81')
    expect(await screen.findByRole('list', { name: 'Historial de abonos' })).toHaveTextContent('Efectivo')
    const llamada = fetch.mock.calls.find(([url]) => url.endsWith('/api/obligaciones/81/historial'))
    expect(llamada[1].headers.Authorization).toBe('Bearer token-de-prueba-no-real')
    expect(fetch.mock.calls.slice(1).every(([, opciones]) => opciones.method === 'GET')).toBe(true)
  })

  it('vuelve al login cuando vence la sesión al consultar los abonos de una obligación', async () => {
    fetch.mockResolvedValueOnce(respuesta(sesionPrueba()))
      .mockResolvedValueOnce(respuesta({ message: 'Acceso habilitado.' }))
      .mockResolvedValueOnce(respuesta({ obligaciones: [{ id: 81, concepto: 'Limpieza', estado_economico: 'PARCIAL' }] }))
      .mockResolvedValue(respuesta({ message: 'Sesión vencida.' }, 401))
    renderizarAplicacion()
    const usuario = await completarInicioSesion()
    await screen.findByText('Acceso habilitado.')
    await usuario.click(screen.getByRole('button', { name: 'Consultar historial de pagos' }))
    await screen.findByRole('option', { name: 'Limpieza — PARCIAL' })
    await usuario.selectOptions(screen.getByLabelText('Obligación a consultar'), '81')
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(fetch.mock.calls.at(-1)[0]).toMatch(/\/api\/obligaciones\/81\/historial$/)
    expect(fetch.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer token-de-prueba-no-real')
  })

  it('cierra sesión en el servidor y vuelve al login', async () => {
    fetch.mockResolvedValueOnce(respuesta(sesionPrueba())).mockResolvedValueOnce(respuesta({ message: 'Acceso habilitado.' })).mockResolvedValue(respuesta(null, 204))
    renderizarAplicacion()
    const usuario = await completarInicioSesion()
    await screen.findByRole('heading', { name: 'Panel de asistente' })
    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(fetch.mock.calls.at(-1)[0]).toMatch(/\/api\/auth\/logout$/)
    expect(fetch.mock.calls.at(-1)[1].method).toBe('POST')
  })

  it('un fallo de red al cerrar sesión informa el error y permite reintentar', async () => {
    fetch.mockResolvedValueOnce(respuesta(sesionPrueba())).mockResolvedValueOnce(respuesta({ message: 'Acceso habilitado.' })).mockRejectedValue(new TypeError('Network error'))
    renderizarAplicacion()
    const usuario = await completarInicioSesion()
    await screen.findByText('Acceso habilitado.')
    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar la sesión en el servidor')
    expect(screen.getByRole('heading', { name: 'Panel de asistente' })).toBeInTheDocument()
  })

  it('muestra error de conexión y vuelve a habilitar el formulario', async () => {
    fetch.mockRejectedValue(new TypeError('Network error'))
    renderizarAplicacion()
    await completarInicioSesion()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor')
    await waitFor(() => expect(screen.getByRole('button', { name: /^Iniciar sesión/ })).toBeEnabled())
  })

  it('al montar la aplicación nuevamente no recupera la sesión anterior', async () => {
    fetch.mockResolvedValueOnce(respuesta(sesionPrueba())).mockResolvedValue(respuesta({ message: 'Acceso habilitado.' }))
    const primera = renderizarAplicacion()
    await completarInicioSesion()
    await screen.findByRole('heading', { name: 'Panel de asistente' })
    primera.unmount()
    renderizarAplicacion('/asistente')
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })
})
