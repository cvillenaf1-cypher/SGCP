import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const testSession = (role = 'ASISTENTE') => ({ token: 'token-de-prueba-no-real', expiresAt: new Date(Date.now() + 60000).toISOString(), user: { id: 1, name: 'Usuario de prueba', email: 'prueba@example.test', role } })

function renderApp(route = '/login') {
  return render(<MemoryRouter initialEntries={[route]}><AuthProvider><App /><Link to="/gerente">Ir a gerente (prueba)</Link><Link to="/asistente">Ir a asistente (prueba)</Link></AuthProvider></MemoryRouter>)
}

async function fillLogin() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Correo electrónico'), 'prueba@example.test')
  await user.type(screen.getByLabelText('Contraseña'), 'valor-solo-para-mock')
  await user.click(screen.getByRole('button', { name: 'Ingresar' }))
  return user
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); localStorage.clear(); sessionStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('Acceso SGCP', () => {
  it('redirige una ruta protegida sin sesión hacia el login', () => {
    renderApp('/gerente')
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('valida campos obligatorios antes de llamar a la API', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(screen.getByText('Ingresa un correo electrónico válido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('muestra credenciales incorrectas sin entrar al panel', async () => {
    fetch.mockResolvedValue(response({ message: 'Correo o contraseña incorrectos.' }, 401))
    renderApp()
    await fillLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.')
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  for (const [role, title] of [['ASISTENTE', 'Panel de asistente'], ['GERENTE', 'Panel de gerente']]) {
    it(`entra al panel de ${role}, envía Bearer y no persiste secretos en almacenamiento web`, async () => {
      fetch.mockResolvedValueOnce(response(testSession(role))).mockResolvedValue(response({ message: 'Acceso verificado por la API.' }))
      renderApp()
      await fillLogin()
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
      await screen.findByText('Acceso verificado por la API.')
      expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer token-de-prueba-no-real')
      expect(localStorage.length).toBe(0)
      expect(sessionStorage.length).toBe(0)
      if (role === 'GERENTE') expect(screen.getByText('Solo lectura')).toBeInTheDocument()
    })
  }

  it('bloquea navegación al panel de otro rol sin consultar ese endpoint', async () => {
    fetch.mockResolvedValueOnce(response(testSession())).mockResolvedValue(response({ message: 'Acceso habilitado.' }))
    renderApp()
    const user = await fillLogin()
    await screen.findByRole('heading', { name: 'Panel de asistente' })
    await user.click(screen.getByText('Ir a gerente (prueba)'))
    expect(screen.getByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument()
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/api/panel/gerente'))).toBe(false)
  })

  it('un 401 de la API elimina la sesión y muestra aviso en login', async () => {
    fetch.mockResolvedValueOnce(response(testSession())).mockResolvedValue(response({ message: 'Sesión vencida.' }, 401))
    renderApp()
    await fillLogin()
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión venció')
  })

  it('cierra sesión en el servidor y vuelve al login', async () => {
    fetch.mockResolvedValueOnce(response(testSession())).mockResolvedValueOnce(response({ message: 'Acceso habilitado.' })).mockResolvedValue(response(null, 204))
    renderApp()
    const user = await fillLogin()
    await screen.findByRole('heading', { name: 'Panel de asistente' })
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(fetch.mock.calls.at(-1)[0]).toMatch(/\/api\/auth\/logout$/)
    expect(fetch.mock.calls.at(-1)[1].method).toBe('POST')
  })

  it('un fallo de red al cerrar sesión informa el error y permite reintentar', async () => {
    fetch.mockResolvedValueOnce(response(testSession())).mockResolvedValueOnce(response({ message: 'Acceso habilitado.' })).mockRejectedValue(new TypeError('Network error'))
    renderApp()
    const user = await fillLogin()
    await screen.findByText('Acceso habilitado.')
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar la sesión en el servidor')
    expect(screen.getByRole('heading', { name: 'Panel de asistente' })).toBeInTheDocument()
  })

  it('muestra error de conexión y vuelve a habilitar el formulario', async () => {
    fetch.mockRejectedValue(new TypeError('Network error'))
    renderApp()
    await fillLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled())
  })

  it('al montar la aplicación nuevamente no recupera la sesión anterior', async () => {
    fetch.mockResolvedValueOnce(response(testSession())).mockResolvedValue(response({ message: 'Acceso habilitado.' }))
    const first = renderApp()
    await fillLogin()
    await screen.findByRole('heading', { name: 'Panel de asistente' })
    first.unmount()
    renderApp('/asistente')
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })
})
