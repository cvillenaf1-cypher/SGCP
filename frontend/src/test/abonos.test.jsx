import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { FormularioAbono } from '../components/FormularioAbono'
import { convertirACentimos, mediosPago, validarAbono } from '../lib/validarAbono'

const obligacion = { id: 81, concepto: 'Servicio', beneficiario: 'Proveedor', monto_original: '300.00', saldo_pendiente: '125.50', estado_economico: 'PARCIAL', vencida: true }
const pagada = { ...obligacion, id: 82, concepto: 'Alquiler pagado', saldo_pendiente: '0.00', estado_economico: 'PAGADO', vencida: false }
const valores = { montoAbono: '100.50', medioPago: 'Efectivo' }

function prepararFormulario(solicitar = vi.fn().mockImplementation((ruta) => Promise.resolve(ruta === '/api/obligaciones' ? { obligaciones: [obligacion, pagada] } : { obligacion }))) {
  render(<ContextoAutenticacion.Provider value={{ solicitar }}><FormularioAbono /></ContextoAutenticacion.Provider>)
  return solicitar
}

async function seleccionarObligacion() {
  await screen.findByRole('option', { name: /Servicio/ })
  fireEvent.change(screen.getByLabelText('Pago pendiente'), { target: { value: '81' } })
  await screen.findByLabelText('Monto del abono (S/)')
}

describe('Validación de abonos — HU-03', () => {
  it('requiere monto y medio de pago', () => {
    const errores = validarAbono({ montoAbono: '', medioPago: '' }, '125.50')
    expect(errores.montoAbono).toBe('Ingresa el monto del abono en soles.')
    expect(errores.medioPago).toBe('Selecciona el medio de pago utilizado.')
  })
  for (const montoAbono of ['0', '0.00', '-5', '1.234', 'abc', '1,50', '1e2', '100000000000']) {
    it(`rechaza el monto ${montoAbono}`, () => {
      expect(validarAbono({ ...valores, montoAbono }, '125.50').montoAbono).toBeTruthy()
    })
  }
  it('rechaza el abono superior al saldo y permite completarlo exactamente', () => {
    expect(validarAbono({ ...valores, montoAbono: '125.51' }, '125.50').montoAbono).toBe('El abono no puede superar el saldo pendiente.')
    expect(validarAbono({ ...valores, montoAbono: '125.50' }, '125.50')).toEqual({})
  })
  it('compara centavos exactos hasta el máximo de MySQL', () => {
    expect(convertirACentimos('99999999999.99')).toBe(9999999999999n)
    expect(validarAbono({ ...valores, montoAbono: '99999999999.99' }, '99999999999.98').montoAbono).toBeTruthy()
  })
  it('rechaza una obligación sin saldo y un medio no permitido', () => {
    expect(validarAbono(valores, '0.00').obligacion).toBeTruthy()
    expect(validarAbono({ ...valores, medioPago: 'Otro' }, '125.50').medioPago).toBeTruthy()
  })
  for (const medioPago of mediosPago) {
    it(`acepta el medio obligatorio ${medioPago}`, () => {
      expect(validarAbono({ ...valores, medioPago }, '125.50')).toEqual({})
    })
  }
})

describe('Formulario de registro de pagos realizados', () => {
  it('consulta obligaciones reales y deshabilita las pagadas', async () => {
    const solicitar = prepararFormulario()
    expect(screen.getByText('Cargando obligaciones…')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: /Alquiler pagado/ })).toBeDisabled()
    expect(screen.queryByLabelText('Monto del abono (S/)')).not.toBeInTheDocument()
    await seleccionarObligacion()
    expect(solicitar.mock.calls.at(-1)[0]).toBe('/api/obligaciones/81')
    expect(screen.getByText('S/ 300.00')).toBeInTheDocument()
    expect(screen.getByText('S/ 125.50')).toBeInTheDocument()
    expect(screen.getByText('PARCIAL')).toBeInTheDocument()
    expect(screen.queryByLabelText(/fecha del abono|saldo final/i)).not.toBeInTheDocument()
  })

  it('muestra errores específicos de monto y medio con foco accesible', async () => {
    prepararFormulario()
    await seleccionarObligacion()
    fireEvent.click(screen.getByRole('button', { name: 'Validar abono' }))
    expect(screen.getByText('Ingresa el monto del abono en soles.')).toBeInTheDocument()
    expect(screen.getByText('Selecciona el medio de pago utilizado.')).toBeInTheDocument()
    expect(screen.getByLabelText('Monto del abono (S/)')).toHaveFocus()
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '125.51' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar abono' }))
    expect(screen.getByText('El abono no puede superar el saldo pendiente.')).toBeInTheDocument()
  })

  it('no envía escrituras ni simula éxito al validar o pulsar varias veces', async () => {
    const solicitar = prepararFormulario()
    await seleccionarObligacion()
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '100.50' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    for (let pulsacion = 0; pulsacion < 3; pulsacion++) fireEvent.click(screen.getByRole('button', { name: 'Validar abono' }))
    expect(screen.getByRole('status')).toHaveTextContent('no se guardó ningún movimiento ni se modificó el saldo')
    expect(solicitar).toHaveBeenCalledTimes(2)
    expect(solicitar.mock.calls.every(([, opciones]) => !opciones.method)).toBe(true)
    expect(screen.getByLabelText('Monto del abono (S/)')).toHaveValue('100.50')
    expect(screen.getByText('S/ 125.50')).toBeInTheDocument()
    expect(screen.queryByText(/registrado correctamente/i)).not.toBeInTheDocument()
  })

  it('impide abonar si el detalle indica que ya se pagó desde que se obtuvo el listado', async () => {
    prepararFormulario(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] }).mockResolvedValue({ obligacion: { ...obligacion, saldo_pendiente: '0.00', estado_economico: 'PAGADO' } }))
    await screen.findByRole('option', { name: /Servicio/ })
    fireEvent.change(screen.getByLabelText('Pago pendiente'), { target: { value: '81' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta obligación ya está pagada.')
    expect(screen.queryByRole('button', { name: 'Validar abono' })).not.toBeInTheDocument()
  })

  it('distingue un negocio vacío de uno con todas sus obligaciones pagadas', async () => {
    prepararFormulario(vi.fn().mockResolvedValueOnce({ obligaciones: [] }).mockResolvedValue({ obligaciones: [pagada] }))
    expect(await screen.findByText('Todavía no hay obligaciones registradas. Registra primero un pago pendiente.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar obligaciones' }))
    expect(await screen.findByText('Todas las obligaciones están pagadas. No hay saldos disponibles para abonar.')).toBeInTheDocument()
  })

  it('permite reintentar un fallo al consultar obligaciones', async () => {
    prepararFormulario(vi.fn().mockRejectedValueOnce(new Error('Sin conexión.')).mockResolvedValue({ obligaciones: [obligacion] }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar obligaciones' }))
    expect(await screen.findByRole('option', { name: /Servicio/ })).toBeInTheDocument()
  })

  it('permite reintentar un detalle inexistente o sin autorización', async () => {
    prepararFormulario(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] }).mockRejectedValueOnce(new Error('Obligación no encontrada.')).mockResolvedValue({ obligacion }))
    await screen.findByRole('option', { name: /Servicio/ })
    fireEvent.change(screen.getByLabelText('Pago pendiente'), { target: { value: '81' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Obligación no encontrada.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar saldo' }))
    expect(await screen.findByLabelText('Monto del abono (S/)')).toBeInTheDocument()
  })

  it('descarta el detalle anterior al seleccionar otra obligación', async () => {
    let resolverAnterior
    prepararFormulario(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, { ...obligacion, id: 83, concepto: 'Agua' }] })
      .mockImplementationOnce(() => new Promise((resolver) => { resolverAnterior = resolver }))
      .mockResolvedValue({ obligacion: { ...obligacion, id: 83, concepto: 'Agua', saldo_pendiente: '10.00' } }))
    await screen.findByRole('option', { name: /Servicio/ })
    fireEvent.change(screen.getByLabelText('Pago pendiente'), { target: { value: '81' } })
    fireEvent.change(screen.getByLabelText('Pago pendiente'), { target: { value: '83' } })
    await screen.findByLabelText('Monto del abono (S/)')
    await act(async () => { resolverAnterior({ obligacion }) })
    await waitFor(() => expect(screen.getByText('S/ 10.00')).toBeInTheDocument())
    expect(screen.queryByText('S/ 125.50')).not.toBeInTheDocument()
  })
})
