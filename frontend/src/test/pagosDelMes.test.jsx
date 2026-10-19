import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link as Enlace, MemoryRouter } from 'react-router-dom'
import Aplicacion from '../App'
import { ProveedorAutenticacion } from '../auth/AuthProvider'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { PaginaPagosDelMes } from '../gerente/PaginaPagosDelMes'
import { filtrarPagosPorPeriodo, formatearSoles, obtenerPeriodoActual } from '../gerente/pagosDelMes'
import { consultarPagosDelMes } from '../gerente/servicioPagos'
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
    expect(screen.getByRole('button', { name: '2026' }))
      .toHaveAttribute('aria-pressed', 'true')
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

    await usuario.click(
      screen.getByRole('button', { name: '2025' })
    )

    expect(
      screen.getByRole('button', { name: '2025' })
    ).toHaveAttribute('aria-pressed', 'true')

    expect(
      await screen.findByText('Renovación de prueba')
    ).toBeInTheDocument()

    expect(
      screen.queryByText('Alquiler de prueba')
    ).not.toBeInTheDocument()

    expect(consultarPagos).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mes: 10,
        anio: 2025,
      })
    )
  })

  it('agrega automáticamente el año 2032 cuando existe una obligación con esa fecha límite', async () => {
    const pago2032 = {
      ...pagosDePrueba[0],
      id: 2032,
      concepto: 'Obligación de prueba 2032',
      fechaLimite: '2032-01-20',
    }

    const consultarPagos = vi.fn().mockResolvedValue([
      ...pagosDePrueba,
      pago2032,
    ])

    const { usuario } = renderizarConsulta(consultarPagos)

    // Esperamos a que SAPO detecte el año de la obligación.
    const boton2032 = await screen.findByRole('button', {
      name: '2032',
    })

    expect(boton2032).toBeInTheDocument()

    // Comprobamos que los años estén ordenados de menor a mayor.
    const aniosVisibles = screen
      .getAllByRole('button')
      .filter((boton) => boton.classList.contains('boton-anio'))
      .map((boton) => Number(boton.textContent))

    expect(aniosVisibles).toEqual(
      [...aniosVisibles].sort((a, b) => a - b)
    )

    // Seleccionamos enero y después el año 2032.
    await usuario.selectOptions(screen.getByLabelText('Mes'), '1')
    await usuario.click(boton2032)

    // La obligación debe aparecer en enero de 2032.
    expect(
      await screen.findByText('Obligación de prueba 2032')
    ).toBeInTheDocument()

    expect(boton2032).toHaveAttribute('aria-pressed', 'true')

    expect(consultarPagos).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mes: 1,
        anio: 2032,
      })
    )
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
    expect(
      screen.getAllByRole('button').every(
        (boton) => boton.classList.contains('boton-anio')
      )
    ).toBe(true)

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(1)

    expect(
      within(screen.getByRole('table')).queryByRole('button')
    ).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('distingue una respuesta inválida de una consulta real sin resultados', async () => {
    renderizarConsulta((opciones) => consultarPagosDelMes({ ...opciones, solicitar: vi.fn().mockResolvedValue({}) }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor envió una lista de pagos inválida.')
    expect(screen.queryByText('Sin pagos para este período')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('muestra un error de consulta sin presentarlo como ausencia de pagos', async () => {
    renderizarConsulta(vi.fn().mockRejectedValue(new Error('No se pudo conectar con el servidor.')))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron consultar los pagos.')
    expect(screen.queryByText('Sin pagos para este período')).not.toBeInTheDocument()
  })

  it('muestra los cinco años habituales sin permitir escribir años arbitrarios', async () => {
    renderizarConsulta()

    await screen.findByRole('table')

    for (const anio of [2024, 2025, 2026, 2027, 2028]) {
      expect(
        screen.getByRole('button', { name: String(anio) })
      ).toBeInTheDocument()
    }

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()

    expect(
      screen.queryByRole('button', { name: '22222' })
    ).not.toBeInTheDocument()
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

  it('reutiliza el listado real autenticado, sin excluir pagos completos ni filtrar por registro', async () => {
    const obligaciones = pagosDePrueba.map((pago) => ({
      id: pago.id, concepto: pago.concepto, beneficiario: pago.beneficiario,
      monto_original: pago.montoOriginal, saldo_pendiente: pago.saldoPendiente,
      fecha_limite: pago.fechaLimite, fecha_registro: pago.fechaRegistro,
      estado_economico: pago.estado.toUpperCase(),
    }))
    const solicitar = vi.fn().mockResolvedValue({ obligaciones })
    const senal = new AbortController().signal
    const pagos = await consultarPagosDelMes({ mes: 9, anio: 2026, solicitar, senal })
    expect(solicitar).toHaveBeenCalledExactlyOnceWith('/api/obligaciones', { signal: senal })
    expect(filtrarPagosPorPeriodo(pagos, 9, 2026)).toEqual([expect.objectContaining({ concepto: 'Compra de prueba', saldoPendiente: '0.00', estado: 'Pagado' })])
    expect(filtrarPagosPorPeriodo(pagos, 10, 2026)).toHaveLength(2)
  })

  it('el adaptador conserva los errores de la API y reconoce listas vacías', async () => {
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [] }).mockRejectedValueOnce(new Error('Servicio no disponible.'))
    await expect(consultarPagosDelMes({ solicitar })).resolves.toEqual([])
    await expect(consultarPagosDelMes({ solicitar })).rejects.toThrow('Servicio no disponible.')
  })
})

describe('Protección de la ruta mensual con la autenticación existente', () => {
  const ruta = '/gerente/pagos-del-mes'
  const respuesta = (cuerpo, estado = 200) => ({ ok: estado === 200, status: estado, json: async () => cuerpo })

  function renderizarAplicacion() {
    return render(<MemoryRouter initialEntries={[ruta]}><ProveedorAutenticacion><Aplicacion /><Enlace to={ruta}>Consulta de prueba</Enlace></ProveedorAutenticacion></MemoryRouter>)
  }

  async function iniciarSesion(rol, estadoConsulta = 200) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respuesta({
      token: 'token-ficticio-de-prueba', expiresAt: new Date(Date.now() + 60000).toISOString(),
      user: { id: 1, name: 'Usuario ficticio', role: rol },
    })).mockImplementation((url) => Promise.resolve(url.endsWith('/api/obligaciones')
      ? respuesta(estadoConsulta === 200 ? { obligaciones: [] } : { message: 'Consulta no disponible.' }, estadoConsulta)
      : respuesta({ message: 'Acceso de prueba habilitado.' }))))
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
    expect(await screen.findByRole('status')).toHaveTextContent('Sin pagos para este período')
    const llamada = fetch.mock.calls.find(([url]) => url.endsWith('/api/obligaciones'))
    expect(llamada[1].headers.Authorization).toBe('Bearer token-ficticio-de-prueba')
    expect(llamada[1].method).toBe('GET')
  })

  it('un 401 de la consulta mensual devuelve al gerente al login existente', async () => {
    const usuario = await iniciarSesion('GERENTE', 401)
    await screen.findByRole('heading', { name: 'Panel de gerente' })
    await usuario.click(screen.getByRole('link', { name: 'Consultar pagos del mes' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión venció')
  })

  it('un 403 de la consulta se presenta como error de acceso y no como lista vacía', async () => {
    const usuario = await iniciarSesion('GERENTE', 403)
    await screen.findByRole('heading', { name: 'Panel de gerente' })
    await usuario.click(screen.getByRole('link', { name: 'Consultar pagos del mes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Consulta no disponible.')
    expect(screen.queryByText('Sin pagos para este período')).not.toBeInTheDocument()
  })
})
