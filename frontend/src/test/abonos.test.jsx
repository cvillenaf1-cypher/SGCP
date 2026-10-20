import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { FormularioAbono } from '../components/FormularioAbono'
import { convertirACentimos, mediosPago, validarAbono } from '../lib/validarAbono'

const obligacion = { id: 81, concepto: 'Servicio', beneficiario: 'Proveedor', monto_original: '300.00', saldo_pendiente: '125.50', estado_economico: 'PARCIAL', vencida: true }
const pendiente = { ...obligacion, id: 83, concepto: 'Préstamo pendiente', saldo_pendiente: '300.00', estado_economico: 'PENDIENTE' }
const pagada = { ...obligacion, id: 82, concepto: 'Alquiler pagado', saldo_pendiente: '0.00', estado_economico: 'PAGADO', vencida: false }
const valores = { montoAbono: '100.50', medioPago: 'Efectivo' }

beforeEach(() => { vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('123e4567-e89b-12d3-a456-426614174000') }); vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:recibo'); static revokeObjectURL = vi.fn() }) })
afterEach(() => vi.unstubAllGlobals())

function prepararFormulario(solicitar = vi.fn().mockImplementation((ruta) => Promise.resolve(ruta === '/api/obligaciones' ? { obligaciones: [pendiente, obligacion, pagada] } : { obligacion }))) {
  render(<ContextoAutenticacion.Provider value={{ solicitar }}><FormularioAbono /></ContextoAutenticacion.Provider>)
  return solicitar
}

async function seleccionarObligacion() {
  await screen.findByRole('option', { name: /Servicio/ })
  fireEvent.change(screen.getByLabelText('Pago pendiente'), { target: { value: '81' } })
  await screen.findByLabelText('Monto del abono (S/)')
  fireEvent.change(screen.getByLabelText('Comprobante o factura (obligatorio)'), { target: { files: [new File(['imagen'], 'recibo.png', { type: 'image/png' })] } })
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
  it('consulta obligaciones reales y excluye las pagadas del selector', async () => {
    const solicitar = prepararFormulario()
    expect(screen.getByText('Cargando obligaciones…')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: /Préstamo pendiente/ })).toBeEnabled()
    expect(screen.getByRole('option', { name: /Servicio/ })).toBeEnabled()
    expect(screen.queryByRole('option', { name: /Alquiler pagado/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(solicitar.mock.calls[0][0]).toBe('/api/obligaciones')
    expect(screen.queryByLabelText('Monto del abono (S/)')).not.toBeInTheDocument()
    await seleccionarObligacion()
    expect(solicitar.mock.calls.at(-1)[0]).toBe('/api/obligaciones/81')
    expect(screen.getByText('S/ 300.00')).toBeInTheDocument()
    expect(screen.getByText('S/ 125.50')).toBeInTheDocument()
    expect(screen.getByText('PARCIAL')).toBeInTheDocument()
    expect(screen.queryByLabelText(/fecha del abono|saldo final/i)).not.toBeInTheDocument()
  })

  for (const saldo of ['0', '0.0', '0.00']) {
    it(`excluye saldo ${saldo} aunque el estado económico sea PENDIENTE`, async () => {
      prepararFormulario(vi.fn().mockResolvedValue({ obligaciones: [{ ...pendiente, saldo_pendiente: saldo }] }))
      await screen.findByLabelText('Pago pendiente')
      expect(screen.getAllByRole('option')).toHaveLength(1)
      expect(screen.queryByRole('option', { name: /Préstamo pendiente/ })).not.toBeInTheDocument()
    })
  }

  it('permite seleccionar un saldo decimal de un céntimo', async () => {
    prepararFormulario(vi.fn().mockResolvedValue({ obligaciones: [{ ...obligacion, saldo_pendiente: '0.01' }] }))
    expect(await screen.findByRole('option', { name: 'Servicio — S/ 0.01' })).toBeEnabled()
  })

  it('muestra errores específicos de monto y medio con foco accesible', async () => {
    prepararFormulario()
    await seleccionarObligacion()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(screen.getByText('Ingresa el monto del abono en soles.')).toBeInTheDocument()
    expect(screen.getByText('Selecciona el medio de pago utilizado.')).toBeInTheDocument()
    expect(screen.getByLabelText('Monto del abono (S/)')).toHaveFocus()
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '125.51' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(screen.getByText('El abono no puede superar el saldo pendiente.')).toBeInTheDocument()
  })

  it('registra un abono parcial con el contrato snake_case y actualiza el saldo', async () => {
    const saldoActualizado = { ...obligacion, saldo_pendiente: '25.00', estado_economico: 'PARCIAL' }
    const solicitar = vi.fn()
      .mockResolvedValueOnce({ obligaciones: [obligacion, pagada] })
      .mockResolvedValueOnce({ obligacion })
      .mockResolvedValueOnce({
        message: 'Abono registrado correctamente.',
        comprobante: { abono_id: 18, nombre: 'recibo.png' }, abono: { id: 18, obligacion_id: 81, saldo_resultante: '25.00' },
      })
      .mockResolvedValueOnce({ obligacion: saldoActualizado })
    prepararFormulario(solicitar)
    await seleccionarObligacion()
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '100.50' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    await waitFor(() => expect(solicitar.mock.calls.some(([ruta, opciones]) => ruta.endsWith('/abonos') && opciones.method === 'POST')).toBe(true))
    await waitFor(() => expect(screen.getByText('Abono registrado correctamente.')).toHaveTextContent('Abono registrado correctamente.'))
    await waitFor(() => expect(screen.getByText('S/ 25.00')).toBeInTheDocument())
    expect(screen.getByText('PARCIAL')).toBeInTheDocument()
    const envio = solicitar.mock.calls.find(([ruta, opciones]) => ruta === '/api/obligaciones/81/abonos' && opciones.method === 'POST')
    expect(Object.fromEntries([...envio[1].body].filter(([campo]) => campo !== 'comprobante'))).toEqual({
      monto: '100.50',
      medio_pago: 'Efectivo',
      clave_idempotencia: expect.any(String),
    })
    expect(envio[1].body.get('clave_idempotencia')).toHaveLength(36)
    expect(solicitar.mock.calls.filter(([ruta]) => ruta === '/api/obligaciones/81')).toHaveLength(2)
  })

  it('registra un abono que completa el saldo y actualiza el estado PAGADO', async () => {
    const saldoInicial = { ...obligacion, saldo_pendiente: '100.50' }
    const saldoFinal = { ...obligacion, saldo_pendiente: '0.00', estado_economico: 'PAGADO' }
    const solicitar = vi.fn()
      .mockResolvedValueOnce({ obligaciones: [saldoInicial] })
      .mockResolvedValueOnce({ obligacion: saldoInicial })
      .mockResolvedValueOnce({ message: 'Abono registrado correctamente.', comprobante: { abono_id: 18, nombre: 'recibo.png' }, abono: { id: 18, obligacion_id: 81, saldo_resultante: '0.00' } })
      .mockResolvedValueOnce({ obligacion: saldoFinal })
    prepararFormulario(solicitar)
    await seleccionarObligacion()
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '100.50' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Tarjeta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await screen.findByText('Esta obligación ya está pagada. Selecciona otra obligación con saldo disponible.')).toBeInTheDocument()
    expect(screen.getByText('Abono registrado correctamente.')).toBeInTheDocument()
    expect(screen.getByText('PAGADO')).toBeInTheDocument()
    expect(screen.getByText('S/ 0.00')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Servicio/ })).not.toBeInTheDocument()
  })

  it('retira la obligación al confirmar el pago total aunque falle la consulta posterior del saldo', async () => {
    prepararFormulario(vi.fn()
      .mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ obligacion })
      .mockResolvedValueOnce({ message: 'Abono registrado correctamente.', comprobante: { abono_id: 18, nombre: 'recibo.png' }, abono: { id: 18, obligacion_id: 81, saldo_resultante: '0.00' } })
      .mockRejectedValueOnce(new Error('Sin conexión al consultar saldo.')))
    await seleccionarObligacion()
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '125.50' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await screen.findByRole('button', { name: 'Reintentar saldo' })).toBeInTheDocument()
    expect(screen.getByText('Abono registrado correctamente.')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Servicio/ })).not.toBeInTheDocument()
  })

  it('bloquea envíos simultáneos y doble clic mientras guarda', async () => {
    let resolverEnvio
    const solicitar = vi.fn()
      .mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ obligacion })
      .mockImplementationOnce(() => new Promise((resolver) => { resolverEnvio = resolver }))
      .mockResolvedValueOnce({ obligacion: { ...obligacion, saldo_pendiente: '25.00', estado_economico: 'PARCIAL' } })
    prepararFormulario(solicitar)
    await seleccionarObligacion()
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '100.50' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrando abono…' }))
    expect(solicitar.mock.calls.filter(([ruta, opciones]) => ruta.endsWith('/abonos') && opciones.method === 'POST')).toHaveLength(1)
    await act(async () => resolverEnvio({ message: 'Abono registrado correctamente.', comprobante: { abono_id: 18, nombre: 'recibo.png' }, abono: { id: 18, obligacion_id: 81, saldo_resultante: '25.00' } }))
    expect(await screen.findByText('Abono registrado correctamente.')).toBeInTheDocument()
  })

  it('reintenta el mismo cuerpo y clave después de un error de red', async () => {
    const falloRed = Object.assign(new Error('No se pudo conectar con el servidor.'), { status: 0 })
    const solicitar = vi.fn()
      .mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ obligacion })
      .mockRejectedValueOnce(falloRed)
      .mockResolvedValueOnce({ message: 'Abono registrado correctamente.', comprobante: { abono_id: 18, nombre: 'recibo.png' }, abono: { id: 18, obligacion_id: 81, saldo_resultante: '25.00' } })
      .mockResolvedValueOnce({ obligacion: { ...obligacion, saldo_pendiente: '25.00', estado_economico: 'PARCIAL' } })
    prepararFormulario(solicitar)
    await seleccionarObligacion()
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '100.50' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await screen.findByRole('button', { name: 'Reintentar registro' })).toBeInTheDocument()
    expect(screen.getByLabelText('Monto del abono (S/)')).toBeDisabled()
    const primerEnvio = solicitar.mock.calls.find(([ruta, opciones]) => ruta.endsWith('/abonos') && opciones.method === 'POST')[1].body
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro' }))
    await waitFor(() => expect(solicitar.mock.calls.filter(([ruta, opciones]) => ruta.endsWith('/abonos') && opciones.method === 'POST')).toHaveLength(2))
    await waitFor(() => expect(screen.getByText('Abono registrado correctamente.')).toHaveTextContent('Abono registrado correctamente.'))
    const envios = solicitar.mock.calls.filter(([ruta, opciones]) => ruta.endsWith('/abonos') && opciones.method === 'POST')
    expect(envios).toHaveLength(2)
    expect(envios[1][1].body).toEqual(primerEnvio)
  })

  it('mapea errores 422 del backend a los controles camelCase', async () => {
    const falloValidacion = Object.assign(new Error('Revisa los datos del abono.'), {
      status: 422,
      fields: { monto: 'Importe inválido.', medio_pago: 'Medio inválido.' },
    })
    const solicitar = vi.fn()
      .mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ obligacion })
      .mockRejectedValueOnce(falloValidacion)
    prepararFormulario(solicitar)
    await seleccionarObligacion()
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '100.50' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await screen.findByText('Importe inválido.')).toBeInTheDocument()
    expect(screen.getByText('Medio inválido.')).toBeInTheDocument()
  })

  it('ante un 409 muestra conflicto y refresca el saldo desde el servidor', async () => {
    const saldoActualizado = { ...obligacion, saldo_pendiente: '20.00', estado_economico: 'PARCIAL' }
    const conflicto = Object.assign(new Error('El abono supera el saldo pendiente.'), { status: 409 })
    const solicitar = vi.fn()
      .mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ obligacion })
      .mockRejectedValueOnce(conflicto)
      .mockResolvedValueOnce({ obligacion: saldoActualizado })
    prepararFormulario(solicitar)
    await seleccionarObligacion()
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '100.50' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El abono supera el saldo pendiente.')
    await waitFor(() => expect(screen.getByText('S/ 20.00')).toBeInTheDocument())
    expect(screen.getByText('PARCIAL')).toBeInTheDocument()
    expect(solicitar.mock.calls.filter(([ruta]) => ruta === '/api/obligaciones/81')).toHaveLength(2)
  })

  it('impide abonar si el detalle indica que ya se pagó desde que se obtuvo el listado', async () => {
    prepararFormulario(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] }).mockResolvedValue({ obligacion: { ...obligacion, saldo_pendiente: '0.00', estado_economico: 'PAGADO' } }))
    await screen.findByRole('option', { name: /Servicio/ })
    fireEvent.change(screen.getByLabelText('Pago pendiente'), { target: { value: '81' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta obligación ya está pagada.')
    expect(screen.queryByRole('button', { name: 'Registrar abono' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Servicio/ })).not.toBeInTheDocument()
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
