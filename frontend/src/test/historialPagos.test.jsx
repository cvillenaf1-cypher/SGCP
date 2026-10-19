import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HistorialPagos, PresentacionHistorial } from '../components/HistorialPagos'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { ejemplosHistorial } from '../datos/ejemplosHistorial'

const obligacion = { id: 81, concepto: 'Limpieza', monto_original: '300.00', saldo_pendiente: '125.50', estado_economico: 'PARCIAL' }
const pagada = { ...obligacion, id: 82, concepto: 'Alquiler pagado', saldo_pendiente: '0.00', estado_economico: 'PAGADO' }

function prepararHistorial(solicitar = vi.fn().mockImplementation((ruta) => Promise.resolve(ruta === '/api/obligaciones' ? { obligaciones: [obligacion, pagada] } : { obligacion }))) {
  render(<ContextoAutenticacion.Provider value={{ solicitar }}><HistorialPagos /></ContextoAutenticacion.Provider>)
  return solicitar
}

describe('Consultar historial de pagos — HU-05', () => {
  it('consulta obligaciones reales, incluidas las pagadas, sin inventar rutas de historial', async () => {
    const solicitar = prepararHistorial()
    expect(screen.getByText('Cargando obligaciones…')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Alquiler pagado — PAGADO' })).not.toBeDisabled()
    fireEvent.change(screen.getByLabelText('Obligación a consultar'), { target: { value: '81' } })
    expect(await screen.findByText('S/ 125.50')).toBeInTheDocument()
    expect(screen.getByText('Limpieza')).toBeInTheDocument()
    expect(screen.getByText('Pendiente de consulta del historial')).toBeInTheDocument()
    expect(screen.getByText(/No se puede confirmar cuántos abonos existen/)).toBeInTheDocument()
    expect(screen.queryByText('Esta obligación todavía no tiene abonos.')).not.toBeInTheDocument()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones', '/api/obligaciones/81'])
    expect(solicitar.mock.calls.every(([, opciones]) => !opciones.method)).toBe(true)
  })

  it('muestra el ejemplo solo cuando se solicita y lo distingue de MySQL', async () => {
    prepararHistorial()
    await screen.findByRole('option', { name: 'Limpieza — PARCIAL' })
    expect(screen.queryByLabelText('Historial de abonos')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver ejemplo visual del historial' }))
    expect(screen.getByText(/DATOS DE EJEMPLO: no corresponden a MySQL/)).toBeInTheDocument()
    expect(screen.getByText('S/ 175.50')).toBeInTheDocument()
    expect(screen.getByText('S/ 124.50')).toBeInTheDocument()
    const movimientos = within(screen.getByRole('list', { name: 'Historial de abonos' })).getAllByRole('listitem')
    expect(movimientos).toHaveLength(3)
    expect(within(movimientos[0]).getByText('S/ 25.50')).toBeInTheDocument()
    expect(within(movimientos[1]).getByText('S/ 50.00')).toBeInTheDocument()
    expect(within(movimientos[2]).getByText('S/ 100.00')).toBeInTheDocument()
    expect(movimientos[0].querySelector('time')).toHaveAttribute('dateTime', '2026-10-18T16:00:00.000Z')
    expect(screen.getByText(/Su visualización requiere la ruta autorizada/)).toBeInTheDocument()
    expect(screen.getAllByText('Sin comprobante.')).toHaveLength(2)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /eliminar|editar|guardar/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a obligaciones reales' }))
    expect(screen.getByLabelText('Obligación a consultar')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Historial de abonos' })).not.toBeInTheDocument()
  })

  it('muestra un historial de ejemplo sin abonos con total cero y saldo intacto', () => {
    prepararHistorial()
    fireEvent.click(screen.getByRole('button', { name: 'Ver ejemplo visual del historial' }))
    fireEvent.change(screen.getByLabelText('Ejemplo de historial'), { target: { value: 'sin-abonos' } })
    expect(screen.getByText('Esta obligación todavía no tiene abonos.')).toBeInTheDocument()
    expect(screen.getByText('S/ 0.00')).toBeInTheDocument()
    expect(screen.getAllByText('S/ 800.00')).toHaveLength(2)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('ordena sin modificar los datos de origen', () => {
    const ordenOriginal = ejemplosHistorial[0].abonos.map((abono) => abono.identificador)
    render(<PresentacionHistorial historial={ejemplosHistorial[0]} />)
    expect(ejemplosHistorial[0].abonos.map((abono) => abono.identificador)).toEqual(ordenOriginal)
  })

  it('distingue un negocio sin obligaciones de un historial vacío', async () => {
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

  it('permite reintentar un detalle inexistente', async () => {
    prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] }).mockRejectedValueOnce(new Error('Obligación no encontrada.')).mockResolvedValue({ obligacion }))
    await screen.findByRole('option', { name: 'Limpieza — PARCIAL' })
    fireEvent.change(screen.getByLabelText('Obligación a consultar'), { target: { value: '81' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Obligación no encontrada.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar detalle' }))
    expect(await screen.findByText('S/ 125.50')).toBeInTheDocument()
  })

  it('descarta detalles anteriores al seleccionar otra obligación', async () => {
    let resolverAnterior
    prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pagada] })
      .mockImplementationOnce(() => new Promise((resolver) => { resolverAnterior = resolver }))
      .mockResolvedValue({ obligacion: pagada }))
    await screen.findByRole('option', { name: 'Limpieza — PARCIAL' })
    fireEvent.change(screen.getByLabelText('Obligación a consultar'), { target: { value: '81' } })
    fireEvent.change(screen.getByLabelText('Obligación a consultar'), { target: { value: '82' } })
    await screen.findByText('S/ 0.00')
    await act(async () => { resolverAnterior({ obligacion }) })
    expect(screen.queryByText('S/ 125.50')).not.toBeInTheDocument()
  })

  it('actualiza las obligaciones sin escribir datos', async () => {
    const solicitar = prepararHistorial()
    await screen.findByRole('option', { name: 'Limpieza — PARCIAL' })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar obligaciones' }))
    await screen.findByRole('option', { name: 'Limpieza — PARCIAL' })
    expect(solicitar).toHaveBeenCalledTimes(2)
  })
})
