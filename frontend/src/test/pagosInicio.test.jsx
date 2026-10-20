import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { PagosInicio } from '../components/PagosInicio'
import { fechaActualLima, seleccionarPagosInicio } from '../lib/pagosInicio'

const obligacion = { id: 1, concepto: 'Servicio de internet', beneficiario: 'Proveedor empresarial', monto_original: '100.00', saldo_pendiente: '100.00', fecha_limite: '2026-10-25', fecha_registro: '2026-09-01T15:00:00Z', estado_economico: 'PENDIENTE', vencida: false }
const datos = [
  obligacion,
  { ...obligacion, id: 2, concepto: 'Abono del mes', saldo_pendiente: '30.00', fecha_limite: '2026-10-26', estado_economico: 'PARCIAL' },
  { ...obligacion, id: 3, concepto: 'Pagada del mes', saldo_pendiente: '0.00', fecha_limite: '2026-10-01', estado_economico: 'PAGADO' },
  { ...obligacion, id: 4, concepto: 'Deuda antigua', saldo_pendiente: '20.00', fecha_limite: '2026-09-15', estado_economico: 'PARCIAL', vencida: true },
  { ...obligacion, id: 5, concepto: 'Pagada antigua', saldo_pendiente: '0.00', fecha_limite: '2026-09-15', estado_economico: 'PAGADO' },
  { ...obligacion, id: 6, concepto: 'Deuda futura', fecha_limite: '2026-11-01' },
  { ...obligacion, id: 7, concepto: 'Vencida del mes', fecha_limite: '2026-10-02', vencida: true },
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T16:00:00Z'))
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '123e4567-e89b-12d3-a456-426614174000') })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:recibo'), revokeObjectURL: vi.fn() }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function preparar({ obligaciones = datos, puedeRegistrar = true, registrar, cargar, consultarDetalle, fallarTrasRegistro = false } = {}) {
  const filas = structuredClone(obligaciones)
  const abonos = []
  const solicitar = vi.fn(async (ruta, opciones = {}) => {
    if (fallarTrasRegistro && abonos.length && (ruta === '/api/obligaciones' || /^\/api\/obligaciones\/\d+$/.test(ruta))) throw new Error('Consulta temporalmente no disponible')
    if (ruta === '/api/obligaciones') return { obligaciones: structuredClone(filas) }
    const identificador = Number(ruta.split('/')[3])
    const fila = filas.find((entrada) => entrada.id === identificador)
    if (ruta.endsWith('/historial')) {
      const total = (Number(fila.monto_original) - Number(fila.saldo_pendiente)).toFixed(2)
      return {
        historial: {
          obligacion_id: fila.id, concepto: fila.concepto, monto_original: fila.monto_original, saldo_pendiente: fila.saldo_pendiente,
          total_abonado: total, resumen_consistente: true, abonos: abonos.filter((abono) => abono.obligacion_id === fila.id)
        }
      }
    }
    if (ruta.endsWith('/abonos') && opciones.method === 'POST') {
      const resultado = registrar ? await registrar(opciones.body) : { abono: { id: 50, obligacion_id: fila.id, saldo_resultante: (Number(fila.saldo_pendiente) - Number(opciones.body.monto)).toFixed(2) } }
      fila.saldo_pendiente = resultado.abono.saldo_resultante
      abonos.push({ ...resultado.abono, monto: opciones.body.monto, medio_pago: opciones.body.medio_pago, fecha_registro: '2026-10-20T16:00:00Z', tiene_comprobante: false })
      return resultado
    }
    if (ruta === '/api/abonos/50/comprobante') {
      if (opciones.method === 'POST' && cargar) await cargar(opciones.body)
      abonos[0].tiene_comprobante = true
      abonos[0].puede_descargar_comprobante = true
      return { tiene_comprobante: true, comprobante: { abono_id: 50, nombre: 'recibo.png' } }
    }
    if (ruta === '/api/abonos/50/comprobante/archivo') return new Blob(['imagen'], { type: 'image/png' })
    if (consultarDetalle) return consultarDetalle(fila)
    return { obligacion: structuredClone(fila) }
  })
  const alBloquear = vi.fn()
  render(<ContextoAutenticacion.Provider value={{ solicitar }}><PagosInicio puedeRegistrar={puedeRegistrar} alBloquear={alBloquear} /></ContextoAutenticacion.Provider>)
  return { solicitar, filas, abonos, alBloquear }
}

async function abrir(id = 1) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Ver detalles.*\\(#${id}\\)$`) }))
  const panel = screen.getByRole('region', { name: `Detalle de la obligación #${id}` })
  await within(panel).findByText('Beneficiario')
  return panel
}

async function completar(monto = '25.00') {
  fireEvent.change(await screen.findByLabelText('Monto del abono (S/)'), { target: { value: monto } })
  fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
}

describe('Período y prioridad del inicio', () => {
  it('incluye el mes completo y vencidas antiguas con saldo, excluye futuras y antiguas pagadas y no modifica los datos', () => {
    const originales = structuredClone(datos)
    expect(seleccionarPagosInicio(datos, '2026-10-20').map((fila) => fila.id)).toEqual([4, 7, 1, 2, 3])
    expect(datos).toEqual(originales)
  })

  it('respeta el cambio de mes y año en Lima y los extremos del mes', () => {
    expect(fechaActualLima(new Date('2027-01-01T04:59:59Z'))).toBe('2026-12-31')
    expect(fechaActualLima(new Date('2027-01-01T05:00:00Z'))).toBe('2027-01-01')
    const filas = ['2026-12-01', '2026-12-31', '2027-01-01'].map((fecha_limite, indice) => ({ ...obligacion, id: indice + 1, fecha_limite }))
    expect(seleccionarPagosInicio(filas, '2026-12-31').map((fila) => fila.id)).toEqual([1, 2])
  })

  it('ordena empates por identificador y conserva la precisión de los céntimos máximos', () => {
    const filas = [9, 2].map((id) => ({ ...obligacion, id, monto_original: '99999999999.99', saldo_pendiente: '99999999999.98' }))
    expect(seleccionarPagosInicio(filas, '2026-10-20').map((fila) => [fila.id, fila.estado_economico])).toEqual([[2, 'PARCIAL'], [9, 'PARCIAL']])
  })
})

describe('Consulta inicial compartida y detalles', () => {
  it('carga automáticamente el mes y las deudas antiguas sin filtros ni selector de mes', async () => {
    const { solicitar } = preparar()
    const tabla = await screen.findByRole('table')
    expect(solicitar.mock.calls[0][0]).toBe('/api/obligaciones')
    expect(within(tabla).getAllByRole('row')).toHaveLength(6)
    for (const nombre of ['Servicio de internet', 'Abono del mes', 'Pagada del mes', 'Deuda antigua', 'Vencida del mes']) expect(within(tabla).getByText(nombre)).toBeInTheDocument()
    expect(screen.queryByText('Deuda futura')).not.toBeInTheDocument()
    expect(screen.queryByText('Pagada antigua')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('abre por fila y botón, muestra datos y permite cerrar con Escape devolviendo el foco', async () => {
    preparar()
    const boton = await screen.findByRole('button', { name: /Ver detalles.*\(#4\)/ })
    fireEvent.click(boton.closest('tr'))
    const panel = await screen.findByRole('region', { name: 'Detalle de la obligación #4' })
    await within(panel).findByText('15/09/2026')
    expect(within(panel).getByText('Proveedor empresarial')).toBeInTheDocument()
    expect(within(panel).getByText('Parcial · con saldo')).toBeInTheDocument()
    expect(within(panel).getByText('Vencida · pendiente de cancelar')).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: 'Detalle de la obligación #4' })).toHaveFocus()
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Detalle de la obligación #4' })).not.toBeInTheDocument()
    expect(boton).toHaveFocus()
    await abrir(4)
  })

  it('no ofrece otro abono a una obligación pagada', async () => {
    preparar()
    const panel = await abrir(3)
    expect(within(panel).getByText(/Esta obligación ya está pagada/)).toBeInTheDocument()
    expect(within(panel).queryByLabelText('Monto del abono (S/)')).not.toBeInTheDocument()
  })

  it('GERENTE ve los mismos compromisos y detalles sin controles de escritura', async () => {
    const { solicitar } = preparar({ puedeRegistrar: false })
    await abrir()
    expect(screen.queryByRole('button', { name: /Registrar pago/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Monto del abono (S/)')).not.toBeInTheDocument()
    expect(solicitar.mock.calls.every(([, opciones]) => !opciones?.method || opciones.method === 'GET')).toBe(true)
  })

  it('cambia de mes al recuperar el foco de la ventana sin recargar la página', async () => {
    preparar()
    await screen.findByRole('table')
    vi.setSystemTime(new Date('2026-11-01T05:00:00Z'))
    fireEvent(window, new Event('focus'))
    expect(await screen.findByText('Deuda futura')).toBeInTheDocument()
    expect(screen.queryByText('Pagada del mes')).not.toBeInTheDocument()
  })

  it('distingue un listado vacío y un detalle no disponible con reintento', async () => {
    const consultarDetalle = vi.fn().mockRejectedValueOnce(new Error('Detalle no disponible')).mockResolvedValue({ obligacion })
    preparar({ obligaciones: [obligacion], consultarDetalle })
    fireEvent.click(await screen.findByRole('button', { name: /Ver detalles/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Detalle no disponible')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar detalle' }))
    expect(await screen.findByLabelText('Monto del abono (S/)')).toBeInTheDocument()
  })
})

describe('Registro directo y comprobantes', () => {
  it('el botón de pago abre el formulario sin seleccionar de nuevo la deuda y actualiza saldo e historial', async () => {
    const { solicitar } = preparar({ obligaciones: [obligacion] })
    fireEvent.click(await screen.findByRole('button', { name: /Registrar pago de/ }))
    await completar()
    expect(screen.queryByLabelText('Pago pendiente')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    await waitFor(() => {
      expect(
        screen.getByText('Abono registrado correctamente.')
      ).toBeInTheDocument()
    })
    const fila = within(screen.getByRole('table')).getByRole('row', { name: /Servicio de internet/ })
    await waitFor(() => expect(fila).toHaveTextContent('S/ 75.00'))
    expect(fila).toHaveTextContent('Parcial · con saldo')
    expect(await screen.findByRole('list', { name: 'Historial de abonos' })).toHaveTextContent('S/ 25.00')
    expect(solicitar.mock.calls.find(([ruta]) => ruta.endsWith('/abonos'))[1].body).toEqual({ monto: '25.00', medio_pago: 'Efectivo', clave_idempotencia: expect.any(String) })
  })

  it('mantiene una obligación del mes visible después de cancelarla y bloquea nuevos abonos', async () => {
    preparar({ obligaciones: [obligacion] })
    await abrir()
    await completar('100.00')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await screen.findByText(/Esta obligación ya está pagada/)).toBeInTheDocument()
    const fila = within(screen.getByRole('table')).getByRole('row', { name: /Servicio de internet/ })
    expect(fila).toHaveTextContent('Pagado')
    expect(fila).toHaveTextContent('S/ 0.00')
    expect(screen.queryByLabelText('Monto del abono (S/)')).not.toBeInTheDocument()
  })

  it('retira la deuda antigua cancelada conservando su detalle, confirmación e historial', async () => {
    preparar({ obligaciones: [datos[3]] })
    const panel = await abrir(4)
    await completar('20.00')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    await waitFor(() => {
      expect(
        within(panel).getByText('Abono registrado correctamente.')
      ).toBeInTheDocument()
    })
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument())
    expect(within(panel).getByRole('list', { name: 'Historial de abonos' })).toHaveTextContent('S/ 20.00')
    fireEvent.click(within(panel).getByRole('button', { name: 'Cerrar detalles' }))
    expect(screen.getByRole('button', { name: 'Actualizar listado' })).toHaveFocus()
  })

  it('conserva el saldo confirmado y el éxito si fallan la recarga del listado y la reconsulta del saldo', async () => {
    const { solicitar } = preparar({ obligaciones: [obligacion], fallarTrasRegistro: true })
    const panel = await abrir()
    await completar('100.00')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await within(panel).findByText('Abono registrado correctamente.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Consulta temporalmente no disponible')).toHaveLength(2))
    expect(within(screen.getByRole('table')).getByRole('row', { name: /Servicio de internet/ })).toHaveTextContent('Pagado')
    expect(panel.querySelector('.inicio-resumen')).toHaveTextContent('S/ 0.00')
    expect(solicitar.mock.calls.filter(([ruta]) => ruta.endsWith('/abonos'))).toHaveLength(1)
  })

  it('impide el doble envío y cerrar mientras se confirma el registro', async () => {
    let resolver
    const { solicitar, alBloquear } = preparar({ obligaciones: [obligacion], registrar: () => new Promise((aceptar) => { resolver = aceptar }) })
    const panel = await abrir()
    await completar()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrando abono…' }))
    expect(within(panel).getByRole('button', { name: 'Cerrar detalles' })).toBeDisabled()
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(panel).toBeInTheDocument()
    expect(alBloquear).toHaveBeenLastCalledWith(true)
    expect(solicitar.mock.calls.filter(([ruta]) => ruta.endsWith('/abonos'))).toHaveLength(1)
    await act(async () => resolver({ abono: { id: 50, obligacion_id: 1, saldo_resultante: '75.00' } }))
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Cerrar detalles' })).toBeEnabled())
  })

  it('conserva la clave y los datos del reintento después de perder la confirmación', async () => {
    const registrar = vi.fn().mockRejectedValueOnce(new Error('Respuesta perdida')).mockResolvedValue({ abono: { id: 50, obligacion_id: 1, saldo_resultante: '75.00' } })
    const { solicitar } = preparar({ obligaciones: [obligacion], registrar })
    const panel = await abrir()
    await completar()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar registro' }))
    await screen.findByText('Abono registrado correctamente.')
    const envios = solicitar.mock.calls.filter(([ruta]) => ruta.endsWith('/abonos'))
    expect(envios).toHaveLength(2)
    expect(envios[0][1].body).toEqual(envios[1][1].body)
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Cerrar detalles' })).toBeEnabled())
  })

  it('conserva la confirmación del abono si falla el archivo y reintenta solo el comprobante', async () => {
    const cargar = vi.fn().mockRejectedValueOnce(new Error('No se recibió respuesta del archivo')).mockResolvedValue(undefined)
    const { solicitar } = preparar({ obligaciones: [obligacion], cargar })
    const panel = await abrir()
    await completar('100.00')
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['imagen'], 'recibo.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(await screen.findByText(/El abono ya está registrado. Reintenta solo el comprobante/)).toBeInTheDocument()
    expect(screen.getByText('Abono registrado correctamente.')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Cerrar detalles' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar comprobante' }))
    await screen.findByText('Comprobante asociado correctamente.')
    expect(solicitar.mock.calls.filter(([ruta]) => ruta.endsWith('/abonos'))).toHaveLength(1)
    expect(cargar).toHaveBeenCalledTimes(2)
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante', exact: true }))
    expect(await screen.findByRole('img', { name: 'Comprobante del abono #50' })).toHaveAttribute('src', 'blob:recibo')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalles' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recibo')
  })
})
