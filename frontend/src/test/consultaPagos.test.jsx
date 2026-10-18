import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { ListadoPagosPendientes } from '../components/ListadoPagosPendientes'
import { formatearImporte } from '../lib/formatearImporte'

const obligacion = { id: 81, concepto: 'Servicio de limpieza', beneficiario: 'Proveedor', monto_original: '120.50', saldo_pendiente: '20.50', fecha_limite: '2026-10-10', fecha_registro: '2026-10-18T15:00:00.000Z', usuario_creador_id: 42, estado_economico: 'PARCIAL', vencida: true }
const pagada = { ...obligacion, id: 82, concepto: 'Alquiler pagado', saldo_pendiente: '0.00', estado_economico: 'PAGADO', vencida: false }

function prepararConsulta(solicitar = vi.fn().mockResolvedValue({ obligaciones: [obligacion, pagada] })) {
  render(<ContextoAutenticacion.Provider value={{ solicitar }}><ListadoPagosPendientes /></ContextoAutenticacion.Provider>)
  return solicitar
}

describe('Consultar pagos pendientes — HU-02', () => {
  it('muestra carga y consulta todos los pagos sin filtrar por creador', async () => {
    const solicitar = prepararConsulta()
    expect(screen.getByRole('status')).toHaveTextContent('Cargando pagos pendientes…')
    const tabla = await screen.findByRole('table')
    expect(solicitar).toHaveBeenCalledWith('/api/obligaciones', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    const fila = within(tabla).getByRole('row', { name: /Servicio de limpieza/ })
    expect(within(fila).getByText('S/ 120.50')).toBeInTheDocument()
    expect(within(fila).getByText('S/ 20.50')).toBeInTheDocument()
    expect(within(fila).getByText('Parcial')).toBeInTheDocument()
    expect(within(fila).getByText('Vencida')).toBeInTheDocument()
    expect(within(fila).getByText('10/10/2026')).toBeInTheDocument()
    expect(within(tabla).getByText('Alquiler pagado')).toBeInTheDocument()
    expect(within(tabla).getByText('Pagado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar|eliminar/i })).not.toBeInTheDocument()
  })

  it('distingue un negocio sin registros de un filtro sin resultados', async () => {
    const solicitar = prepararConsulta(vi.fn().mockResolvedValue({ obligaciones: [] }))
    expect(await screen.findByText('Todavía no hay pagos registrados en el negocio.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filtrar pagos'), { target: { value: 'pagado' } })
    expect(await screen.findByText('No hay pagos que coincidan con el filtro seleccionado.')).toBeInTheDocument()
    expect(solicitar.mock.calls.at(-1)[0]).toBe('/api/obligaciones?filtro=pagado')
  })

  for (const filtro of ['pendiente', 'parcial', 'pagado', 'vencido']) {
    it(`usa el filtro real ${filtro} sin recalcular estados`, async () => {
      const solicitar = prepararConsulta()
      await screen.findByRole('table')
      fireEvent.change(screen.getByLabelText('Filtrar pagos'), { target: { value: filtro } })
      await screen.findByRole('table')
      expect(solicitar.mock.calls.at(-1)[0]).toBe(`/api/obligaciones?filtro=${filtro}`)
      fireEvent.change(screen.getByLabelText('Filtrar pagos'), { target: { value: '' } })
      await screen.findByRole('table')
      expect(solicitar.mock.calls.at(-1)[0]).toBe('/api/obligaciones')
    })
  }

  it('consulta el detalle real y muestra sus datos y fecha en Lima', async () => {
    const solicitar = prepararConsulta(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] }).mockResolvedValue({ obligacion }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle de Servicio de limpieza' }))
    const detalle = await screen.findByRole('region', { name: 'Detalle del pago seleccionado' })
    await waitFor(() => expect(within(detalle).getByText('S/ 20.50')).toBeInTheDocument())
    expect(solicitar.mock.calls.at(-1)[0]).toBe('/api/obligaciones/81')
    expect(within(detalle).getByText('Fecha de registro (Lima)')).toBeInTheDocument()
    expect(within(detalle).getByText('Parcial')).toBeInTheDocument()
    expect(within(detalle).getByText('Vencida')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filtrar pagos'), { target: { value: 'pagado' } })
    expect(screen.queryByRole('region', { name: 'Detalle del pago seleccionado' })).not.toBeInTheDocument()
  })

  it('muestra un 404 del detalle sin ocultar el listado y permite reintentar', async () => {
    const solicitar = prepararConsulta(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] }).mockRejectedValueOnce(new Error('Obligación no encontrada.')).mockResolvedValue({ obligacion }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle de Servicio de limpieza' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Obligación no encontrada.')
    expect(screen.getByRole('table')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar detalle' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(solicitar).toHaveBeenCalledTimes(3)
  })

  it('muestra fallos de conexión o autorización y recupera el listado al reintentar', async () => {
    const solicitar = prepararConsulta(vi.fn().mockRejectedValueOnce(new Error('No se pudo conectar con el servidor.')).mockResolvedValue({ obligaciones: [obligacion] }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(solicitar).toHaveBeenCalledTimes(2)
  })

  it('descarta respuestas anteriores cuando se cambia de filtro rápidamente', async () => {
    let resolverAnterior
    const solicitar = prepararConsulta(vi.fn().mockImplementationOnce(() => new Promise((resolver) => { resolverAnterior = resolver })).mockResolvedValue({ obligaciones: [pagada] }))
    fireEvent.change(screen.getByLabelText('Filtrar pagos'), { target: { value: 'pagado' } })
    await screen.findByText('Alquiler pagado')
    expect(solicitar.mock.calls[0][1].signal.aborted).toBe(true)
    await act(async () => { resolverAnterior({ obligaciones: [obligacion] }) })
    expect(screen.queryByText('Servicio de limpieza')).not.toBeInTheDocument()
    expect(screen.getByText('Alquiler pagado')).toBeInTheDocument()
  })

  it('descarta el detalle anterior al seleccionar otra obligación', async () => {
    let resolverAnterior
    prepararConsulta(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pagada] })
      .mockImplementationOnce(() => new Promise((resolver) => { resolverAnterior = resolver }))
      .mockResolvedValue({ obligacion: pagada }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle de Servicio de limpieza' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Alquiler pagado' }))
    const detalle = screen.getByRole('region', { name: 'Detalle del pago seleccionado' })
    await within(detalle).findByText('Alquiler pagado')
    await act(async () => { resolverAnterior({ obligacion }) })
    expect(within(detalle).queryByText('Servicio de limpieza')).not.toBeInTheDocument()
  })

  it('permite actualizar para consultar el saldo vigente', async () => {
    const solicitar = prepararConsulta()
    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar listado' }))
    await screen.findByRole('table')
    expect(solicitar).toHaveBeenCalledTimes(2)
  })

  it('muestra un error si el servidor no devuelve un listado válido', async () => {
    prepararConsulta(vi.fn().mockResolvedValue({}))
    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no devolvió un listado válido')
  })

  it('formatea importes exactos en soles con dos decimales', () => {
    expect(formatearImporte('99999999999.99')).toBe('S/ 99,999,999,999.99')
    expect(formatearImporte('0.00')).toBe('S/ 0.00')
    expect(formatearImporte('120.5')).toBe('S/ 120.50')
  })
})
