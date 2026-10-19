import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistorialPagos } from '../components/HistorialPagos'
import { ContextoAutenticacion } from '../auth/AuthContext'

const obligacion = { id: 81, concepto: 'Limpieza', monto_original: '300.00', saldo_pendiente: '125.50', estado_economico: 'PARCIAL' }
const pagada = { ...obligacion, id: 82, concepto: 'Alquiler pagado', saldo_pendiente: '0.00', estado_economico: 'PAGADO' }
const pendiente = { ...obligacion, id: 83, concepto: 'Mantenimiento', saldo_pendiente: '300.00', estado_economico: 'PENDIENTE' }
const abonos = [
  { id: 7, monto: '100.00', medio_pago: 'Efectivo', fecha_registro: '2026-10-17T15:00:00.000Z', tiene_comprobante: false, puede_descargar_comprobante: false, url_comprobante: null },
  { id: 8, monto: '49.00', medio_pago: 'Transferencia', fecha_registro: '2026-10-18T16:00:00.000Z', tiene_comprobante: false, puede_descargar_comprobante: false, url_comprobante: null },
  { id: 9, monto: '25.50', medio_pago: 'Yape', fecha_registro: '2026-10-18T16:00:00.000Z', tiene_comprobante: true, puede_descargar_comprobante: true, url_comprobante: '/api/abonos/9/comprobante/archivo' },
]

function datosHistorial(obligacionConsultada = obligacion, cambios = {}) {
  return {
    obligacion_id: obligacionConsultada.id,
    concepto: obligacionConsultada.concepto,
    monto_original: obligacionConsultada.monto_original,
    saldo_pendiente: obligacionConsultada.saldo_pendiente,
    total_abonado: '174.50',
    estado_economico: obligacionConsultada.estado_economico,
    resumen_consistente: true,
    advertencia: null,
    abonos,
    ...cambios,
  }
}

function prepararHistorial(solicitar = vi.fn().mockImplementation((ruta) => Promise.resolve(ruta === '/api/obligaciones'
  ? { obligaciones: [obligacion, pagada, pendiente] }
  : { historial: datosHistorial() }))) {
  const vista = render(<ContextoAutenticacion.Provider value={{ solicitar }}><HistorialPagos /></ContextoAutenticacion.Provider>)
  return { solicitar, ...vista }
}

async function seleccionarObligacion(id = 81) {
  await screen.findByRole('option', { name: 'Limpieza — PARCIAL' })
  fireEvent.change(screen.getByLabelText('Obligación a consultar'), { target: { value: String(id) } })
}

function comprobarSoloLectura(solicitar) {
  expect(solicitar.mock.calls.every(([, opciones]) => !opciones?.method || opciones.method === 'GET')).toBe(true)
  expect(screen.queryByRole('button', { name: /eliminar|editar|guardar/i })).not.toBeInTheDocument()
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: vi.fn().mockReturnValue('blob:comprobante-de-prueba'),
    revokeObjectURL: vi.fn(),
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Consultar historial real de pagos — HU-05', () => {
  it('consulta la API real, muestra el resumen y los pagos en orden descendente sin modificar la respuesta', async () => {
    const historial = datosHistorial()
    const antes = structuredClone(historial)
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] }).mockResolvedValue({ historial })
    prepararHistorial(solicitar)
    expect(screen.getByText('Cargando obligaciones…')).toBeInTheDocument()
    await seleccionarObligacion()
    const lista = await screen.findByRole('list', { name: 'Historial de abonos' })
    expect(screen.getByText('S/ 300.00')).toBeInTheDocument()
    expect(screen.getByText('S/ 174.50')).toBeInTheDocument()
    expect(screen.getByText('S/ 125.50')).toBeInTheDocument()
    const movimientos = within(lista).getAllByRole('listitem')
    expect(movimientos).toHaveLength(3)
    for (const [indice, abono] of [abonos[2], abonos[1], abonos[0]].entries()) {
      expect(within(movimientos[indice]).getByText(`S/ ${abono.monto}`)).toBeInTheDocument()
      expect(within(movimientos[indice]).getByText(abono.medio_pago)).toBeInTheDocument()
      expect(movimientos[indice].querySelector('time')).toHaveAttribute('dateTime', abono.fecha_registro)
      expect(movimientos[indice].querySelector('time')).not.toBeEmptyDOMElement()
    }
    expect(historial).toEqual(antes)
    expect(screen.queryByText(/pendiente de integración|DATOS DE EJEMPLO|Pendiente de consulta del historial/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ejemplo/i })).not.toBeInTheDocument()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones', '/api/obligaciones/81/historial'])
    comprobarSoloLectura(solicitar)
  })

  it('permite consultar una obligación pagada y sus pagos anteriores', async () => {
    const historial = datosHistorial(pagada, { total_abonado: '300.00', abonos: [{ ...abonos[0], monto: '300.00' }] })
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pagada] }).mockResolvedValue({ historial })
    prepararHistorial(solicitar)
    expect(await screen.findByRole('option', { name: 'Alquiler pagado — PAGADO' })).not.toBeDisabled()
    await seleccionarObligacion(82)
    expect(await screen.findByText('S/ 0.00')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Historial de abonos' })).getByText('S/ 300.00')).toBeInTheDocument()
    expect(solicitar.mock.calls.at(-1)[0]).toBe('/api/obligaciones/82/historial')
    comprobarSoloLectura(solicitar)
  })

  it('muestra un historial sin pagos con total cero y saldo original', async () => {
    prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pendiente] })
      .mockResolvedValue({ historial: datosHistorial(pendiente, { total_abonado: '0.00', abonos: [] }) }))
    await seleccionarObligacion(83)
    expect(await screen.findByText('Esta obligación todavía no tiene abonos.')).toBeInTheDocument()
    expect(screen.getByText('S/ 0.00')).toBeInTheDocument()
    expect(screen.getAllByText('S/ 300.00')).toHaveLength(2)
    expect(screen.queryByRole('list', { name: 'Historial de abonos' })).not.toBeInTheDocument()
  })

  it('calcula el saldo a partir del monto y el total sin corregir datos persistidos inconsistentes', async () => {
    const historial = datosHistorial(obligacion, {
      monto_original: '100.00', total_abonado: '10.00', saldo_pendiente: '80.00',
      resumen_consistente: false, advertencia: 'El saldo registrado no coincide con los abonos del historial.',
      abonos: [{ ...abonos[0], monto: '10.00' }],
    })
    const antes = structuredClone(historial)
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] }).mockResolvedValue({ historial })
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    expect(await screen.findByText('S/ 90.00')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('El saldo registrado no coincide con los abonos del historial.')
    expect(historial).toEqual(antes)
    comprobarSoloLectura(solicitar)
  })

  it('actualiza el historial seleccionado e incorpora el nuevo abono conservando los anteriores', async () => {
    const nuevo = { ...abonos[0], id: 10, monto: '25.00', fecha_registro: '2026-10-19T15:00:00.000Z' }
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ historial: datosHistorial() })
      .mockResolvedValue({ historial: datosHistorial(obligacion, { total_abonado: '199.50', saldo_pendiente: '100.50', abonos: [...abonos, nuevo] }) })
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    await screen.findByRole('list', { name: 'Historial de abonos' })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar historial' }))
    expect(await screen.findByText('S/ 199.50')).toBeInTheDocument()
    expect(screen.getByLabelText('Obligación a consultar')).toHaveValue('81')
    const movimientos = within(screen.getByRole('list', { name: 'Historial de abonos' })).getAllByRole('listitem')
    expect(movimientos).toHaveLength(4)
    expect(within(movimientos[0]).getByText('S/ 25.00')).toBeInTheDocument()
    for (const monto of ['25.50', '49.00', '100.00']) expect(within(screen.getByRole('list', { name: 'Historial de abonos' })).getByText(`S/ ${monto}`)).toBeInTheDocument()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones', '/api/obligaciones/81/historial', '/api/obligaciones/81/historial'])
    comprobarSoloLectura(solicitar)
  })

  it('distingue un negocio sin obligaciones de un historial sin abonos', async () => {
    prepararHistorial(vi.fn().mockResolvedValue({ obligaciones: [] }))
    expect(await screen.findByText('Todavía no hay obligaciones registradas para consultar.')).toBeInTheDocument()
    expect(screen.queryByText('Esta obligación todavía no tiene abonos.')).not.toBeInTheDocument()
  })

  it('permite reintentar errores de conexión en el listado', async () => {
    prepararHistorial(vi.fn().mockRejectedValueOnce(new Error('Sin conexión.')).mockResolvedValue({ obligaciones: [obligacion] }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar obligaciones' }))
    expect(await screen.findByRole('option', { name: 'Limpieza — PARCIAL' })).toBeInTheDocument()
  })

  it('permite reintentar un error del historial sin confundirlo con ausencia de pagos', async () => {
    prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockRejectedValueOnce(new Error('No se pudo consultar el historial.')).mockResolvedValue({ historial: datosHistorial() }))
    await seleccionarObligacion()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar el historial.')
    expect(screen.queryByText('Esta obligación todavía no tiene abonos.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar historial' }))
    expect(await screen.findByRole('list', { name: 'Historial de abonos' })).toBeInTheDocument()
  })

  it('cancela la consulta anterior y descarta su respuesta al cambiar de obligación', async () => {
    let resolverAnterior
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pagada] })
      .mockImplementationOnce(() => new Promise((resolver) => { resolverAnterior = resolver }))
      .mockResolvedValue({ historial: datosHistorial(pagada, { total_abonado: '300.00', abonos: [{ ...abonos[0], monto: '300.00' }] }) })
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    const señalAnterior = solicitar.mock.calls[1][1].signal
    fireEvent.change(screen.getByLabelText('Obligación a consultar'), { target: { value: '82' } })
    await screen.findByText('S/ 0.00')
    await act(async () => { resolverAnterior({ historial: datosHistorial() }) })
    expect(señalAnterior.aborted).toBe(true)
    expect(screen.getByLabelText('Obligación a consultar')).toHaveValue('82')
    expect(screen.queryByText('S/ 125.50')).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Historial de abonos' })).getByText('S/ 300.00')).toBeInTheDocument()
  })

  it('consulta el comprobante como imagen autenticada y libera su URL al cerrarlo', async () => {
    const imagen = new Blob(['imagen de prueba'], { type: 'image/png' })
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ historial: datosHistorial() }).mockResolvedValue(imagen)
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
    expect(await screen.findByRole('img', { name: 'Comprobante del abono #9' })).toHaveAttribute('src', 'blob:comprobante-de-prueba')
    expect(solicitar.mock.calls.at(-1)).toEqual(['/api/abonos/9/comprobante/archivo', expect.objectContaining({ respuestaComo: 'blob', signal: expect.any(AbortSignal) })])
    expect(URL.createObjectURL).toHaveBeenCalledWith(imagen)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar comprobante' }))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante-de-prueba')
    comprobarSoloLectura(solicitar)
  })

  it('no ofrece consultar una imagen sin permiso de descarga', async () => {
    prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValue({ historial: datosHistorial(obligacion, { abonos: [{ ...abonos[2], puede_descargar_comprobante: false, url_comprobante: null }] }) }))
    await seleccionarObligacion()
    await screen.findByRole('list', { name: 'Historial de abonos' })
    expect(screen.queryByRole('button', { name: 'Ver comprobante' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('muestra los errores de comprobante y permite reintentarlos', async () => {
    prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ historial: datosHistorial() })
      .mockRejectedValueOnce(new Error('No se pudo recuperar el comprobante.'))
      .mockResolvedValue(new Blob(['imagen de prueba'], { type: 'image/jpeg' })))
    await seleccionarObligacion()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo recuperar el comprobante.')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar comprobante' }))
    expect(await screen.findByRole('img', { name: 'Comprobante del abono #9' })).toBeInTheDocument()
  })

  it('cierra el comprobante y libera la imagen al consultar otra obligación', async () => {
    const solicitar = vi.fn().mockImplementation((ruta) => {
      if (ruta === '/api/obligaciones') return Promise.resolve({ obligaciones: [obligacion, pagada] })
      if (ruta === '/api/abonos/9/comprobante/archivo') return Promise.resolve(new Blob(['imagen'], { type: 'image/png' }))
      return Promise.resolve({ historial: ruta.includes('/82/') ? datosHistorial(pagada, { total_abonado: '300.00', abonos: [] }) : datosHistorial() })
    })
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
    await screen.findByRole('img', { name: 'Comprobante del abono #9' })
    fireEvent.change(screen.getByLabelText('Obligación a consultar'), { target: { value: '82' } })
    await screen.findByText('S/ 0.00')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante-de-prueba')
  })

  it('descarta un comprobante pendiente si el usuario cambia de obligación', async () => {
    let resolverComprobante
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pagada] })
      .mockResolvedValueOnce({ historial: datosHistorial() })
      .mockImplementationOnce(() => new Promise((resolver) => { resolverComprobante = resolver }))
      .mockResolvedValue({ historial: datosHistorial(pagada, { total_abonado: '300.00', abonos: [] }) })
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
    const señalComprobante = solicitar.mock.calls[2][1].signal
    fireEvent.change(screen.getByLabelText('Obligación a consultar'), { target: { value: '82' } })
    await screen.findByText('S/ 0.00')
    await act(async () => { resolverComprobante(new Blob(['imagen'], { type: 'image/png' })) })
    expect(señalComprobante.aborted).toBe(true)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('libera la imagen al salir del módulo', async () => {
    const { unmount } = prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ historial: datosHistorial() }).mockResolvedValue(new Blob(['imagen'], { type: 'image/png' })))
    await seleccionarObligacion()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
    await screen.findByRole('img', { name: 'Comprobante del abono #9' })
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante-de-prueba')
  })

  it('actualiza el catálogo de obligaciones mediante consultas de solo lectura', async () => {
    const { solicitar } = prepararHistorial()
    await screen.findByRole('option', { name: 'Limpieza — PARCIAL' })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar obligaciones' }))
    await waitFor(() => expect(solicitar).toHaveBeenCalledTimes(2))
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones', '/api/obligaciones'])
    comprobarSoloLectura(solicitar)
  })
})
