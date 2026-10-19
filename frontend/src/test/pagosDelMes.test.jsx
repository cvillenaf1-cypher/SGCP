import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link as Enlace, MemoryRouter } from 'react-router-dom'
import Aplicacion from '../App'
import { ProveedorAutenticacion } from '../auth/AuthProvider'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { PaginaPagosDelMes } from '../gerente/PaginaPagosDelMes'
import { filtrarPagosPorPeriodo, formatearSoles, obtenerPeriodoActual } from '../gerente/pagosDelMes'
import { consultarPagosDelMes, ErrorIntegracionPendiente } from '../gerente/servicioPagos'
import { pagosDePrueba } from './datos/pagosDelMes'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-18T15:00:00Z'))
})

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function renderizarConsulta(consultarPagos = vi.fn().mockResolvedValue(pagosDePrueba)) {
  const solicitar = vi.fn()
  const vista = render(
    <MemoryRouter>
      <ContextoAutenticacion.Provider value={{ solicitar }}>
        <PaginaPagosDelMes consultarPagos={consultarPagos} />
      </ContextoAutenticacion.Provider>
    </MemoryRouter>,
  )
  return { ...vista, consultarPagos, solicitar, usuario: userEvent.setup() }
}

describe('HU-06: consulta mensual de solo lectura', () => {
  it('selecciona el mes y año actuales y consulta mediante el cliente autenticado', async () => {
    const { consultarPagos, solicitar } = renderizarConsulta()
    expect(screen.getByLabelText('Mes')).toHaveValue('10')
    expect(screen.getByLabelText('Año')).toHaveValue(2026)
    await screen.findByRole('table')
    expect(consultarPagos).toHaveBeenCalledWith({ mes: 10, anio: 2026, solicitar, senal: expect.any(AbortSignal) })
  })

  it('usa el calendario de Lima aunque el mes UTC ya haya cambiado', () => {
    expect(obtenerPeriodoActual(new Date('2027-01-01T02:00:00Z'))).toEqual({ mes: 12, anio: 2026 })
  })

  it('filtra por fecha límite e incluye el primer y último día del mes', async () => {
    renderizarConsulta()
    const tabla = await screen.findByRole('table')
    expect(within(tabla).getByText('Alquiler de prueba')).toBeInTheDocument()
    expect(within(tabla).getByText('Servicio de prueba')).toBeInTheDocument()
    for (const concepto of ['Compra de prueba', 'Renovación de prueba', 'Pago futuro de prueba']) {
      expect(within(tabla).queryByText(concepto)).not.toBeInTheDocument()
    }
  })

  it('muestra las seis columnas, los saldos, estados y fechas sin desplazar el día', async () => {
    renderizarConsulta()
    const tabla = await screen.findByRole('table')
    expect(within(tabla).getAllByRole('columnheader').map((columna) => columna.textContent)).toEqual([
      'Concepto', 'Beneficiario', 'Monto original', 'Saldo pendiente', 'Fecha límite', 'Estado del pago',
    ])
    const fila = within(tabla).getAllByRole('row')[1]
    expect(fila).toHaveTextContent('Local ficticio')
    expect(fila).toHaveTextContent('S/ 1,500.00')
    expect(fila).toHaveTextContent('S/ 1,000.50')
    expect(fila).toHaveTextContent('01/10/2026')
    expect(fila).toHaveTextContent('Parcial')
    expect(tabla).toHaveTextContent('31/10/2026')
    expect(tabla).toHaveTextContent('Pendiente')
  })

  it('permite cambiar de mes y consultar un pago completamente abonado', async () => {
    const { usuario } = renderizarConsulta()
    await screen.findByRole('table')
    await usuario.selectOptions(screen.getByLabelText('Mes'), '9')
    expect(await screen.findByText('Compra de prueba')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('S/ 0.00')
    expect(screen.getByRole('table')).toHaveTextContent('Pagado')
    expect(screen.queryByText('Alquiler de prueba')).not.toBeInTheDocument()
  })

  it('permite consultar otro año conservando el mes seleccionado', async () => {
    const { usuario, consultarPagos } = renderizarConsulta()
    await screen.findByRole('table')
    await usuario.clear(screen.getByLabelText('Año'))
    await usuario.type(screen.getByLabelText('Año'), '2025')
    expect(await screen.findByText('Renovación de prueba')).toBeInTheDocument()
    expect(screen.queryByText('Alquiler de prueba')).not.toBeInTheDocument()
    expect(consultarPagos).toHaveBeenLastCalledWith(expect.objectContaining({ mes: 10, anio: 2025 }))
  })

  it('informa cuando no hay pagos para el período consultado', async () => {
    const { usuario } = renderizarConsulta()
    await screen.findByRole('table')
    await usuario.selectOptions(screen.getByLabelText('Mes'), '2')
    expect(await screen.findByRole('status')).toHaveTextContent('No hay pagos con fecha límite en febrero de 2026.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('no presenta controles para registrar, editar, eliminar ni realizar pagos', async () => {
    renderizarConsulta()
    await screen.findByRole('table')
    expect(screen.getByText('Solo lectura')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(within(screen.getByRole('table')).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('distingue la integración pendiente de una consulta real sin resultados', async () => {
    renderizarConsulta(consultarPagosDelMes)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('aún no está conectada al servidor'))
    expect(screen.queryByText('Sin pagos para este período')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('muestra un error de consulta sin presentarlo como ausencia de pagos', async () => {
    renderizarConsulta(vi.fn().mockRejectedValue(new Error('No se pudo conectar con el servidor.')))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron consultar los pagos.')
    expect(screen.queryByText('Sin pagos para este período')).not.toBeInTheDocument()
  })

  it('no consulta mientras el año está vacío o fuera de rango', async () => {
    const { usuario, consultarPagos } = renderizarConsulta()
    await screen.findByRole('table')
    consultarPagos.mockClear()
    await usuario.clear(screen.getByLabelText('Año'))
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa un año entero entre 1 y 9999.')
    await usuario.type(screen.getByLabelText('Año'), '0')
    expect(consultarPagos).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('cancela consultas anteriores y descarta respuestas que llegan fuera de orden', async () => {
    let resolverAnterior
    const consultarPagos = vi.fn()
      .mockImplementationOnce(() => new Promise((resolver) => { resolverAnterior = resolver }))
      .mockResolvedValue(pagosDePrueba)
    const { usuario } = renderizarConsulta(consultarPagos)
    expect(screen.getByRole('status')).toHaveTextContent('Consultando pagos de octubre de 2026')
    const senalAnterior = consultarPagos.mock.calls[0][0].senal
    await usuario.selectOptions(screen.getByLabelText('Mes'), '9')
    expect(await screen.findByText('Compra de prueba')).toBeInTheDocument()
    expect(senalAnterior.aborted).toBe(true)
    resolverAnterior(pagosDePrueba)
    await waitFor(() => expect(screen.getByRole('table')).toHaveAccessibleName('Pagos con fecha límite en septiembre de 2026'))
    expect(screen.queryByText('Alquiler de prueba')).not.toBeInTheDocument()
  })

  it('cancela la solicitud al abandonar la pantalla', async () => {
    const { unmount: desmontar, consultarPagos } = renderizarConsulta()
    await screen.findByRole('table')
    const senal = consultarPagos.mock.calls[0][0].senal
    desmontar()
    expect(senal.aborted).toBe(true)
  })

  it('formatea soles con dos decimales e incluye fechas de años bisiestos', () => {
    expect(formatearSoles('0.00')).toBe('S/ 0.00')
    expect(formatearSoles('99.9')).toBe('S/ 99.90')
    const pago = { fechaLimite: '2024-02-29' }
    expect(filtrarPagosPorPeriodo([pago], 2, 2024)).toEqual([pago])
    expect(filtrarPagosPorPeriodo([pago], 2, 2025)).toEqual([])
  })

  it('el adaptador pendiente nunca consulta una ruta backend inventada', async () => {
    const solicitar = vi.fn()
    await expect(consultarPagosDelMes({ mes: 10, anio: 2026, solicitar })).rejects.toBeInstanceOf(ErrorIntegracionPendiente)
    expect(solicitar).not.toHaveBeenCalled()
  })
})

describe('Protección de la ruta mensual con la autenticación existente', () => {
  const ruta = '/gerente/pagos-del-mes'
  const respuesta = (cuerpo, estado = 200) => ({ ok: estado === 200, status: estado, json: async () => cuerpo })

  function renderizarAplicacion() {
    return render(<MemoryRouter initialEntries={[ruta]}><ProveedorAutenticacion><Aplicacion /><Enlace to={ruta}>Consulta de prueba</Enlace></ProveedorAutenticacion></MemoryRouter>)
  }

  async function iniciarSesion(rol) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respuesta({
      token: 'token-ficticio-de-prueba', expiresAt: new Date(Date.now() + 60000).toISOString(),
      user: { id: 1, name: 'Usuario ficticio', role: rol },
    })).mockResolvedValue(respuesta({ message: 'Acceso de prueba habilitado.' })))
    renderizarAplicacion()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByLabelText('Correo electrónico'), 'prueba@example.test')
    await usuario.type(screen.getByLabelText('Contraseña'), 'valor-ficticio-de-prueba')
    await usuario.click(screen.getByRole('button', { name: /^Iniciar sesión/ }))
    return usuario
  }

  it('redirige al login sin una sesión', () => {
    renderizarAplicacion()
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Mes')).not.toBeInTheDocument()
  })

  it('el ASISTENTE no puede abrir la consulta mensual', async () => {
    const usuario = await iniciarSesion('ASISTENTE')
    await screen.findByRole('heading', { name: 'Panel de asistente' })
    await usuario.click(screen.getByRole('link', { name: 'Consulta de prueba' }))
    expect(screen.getByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Mes')).not.toBeInTheDocument()
  })

  it('el GERENTE entra desde su panel mediante el login existente', async () => {
    const usuario = await iniciarSesion('GERENTE')
    await screen.findByRole('heading', { name: 'Panel de gerente' })
    await usuario.click(screen.getByRole('link', { name: 'Consultar pagos del mes' }))
    expect(await screen.findByRole('heading', { name: 'Consultar pagos del mes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Mes')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('aún no está conectada al servidor')
  })
})
