import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SelectorComprobante } from '../components/SelectorComprobante'
import { FormularioAbono } from '../components/FormularioAbono'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { tamanoMaximoComprobante, validarComprobante } from '../lib/validarComprobante'

beforeEach(() => {
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn().mockReturnValue('blob:comprobante-local')
    static revokeObjectURL = vi.fn()
  })
})
afterEach(() => vi.unstubAllGlobals())

function SelectorPrueba() {
  const [archivo, establecerArchivo] = useState(null)
  const [error, establecerError] = useState('')
  return <SelectorComprobante archivo={archivo} error={error} alCambiar={(nuevo, fallo) => { establecerArchivo(nuevo); establecerError(fallo) }} />
}

describe('Validación del comprobante opcional', () => {
  it('permite no adjuntar archivo', () => expect(validarComprobante(null)).toBe(''))
  for (const [nombre, tipo] of [['recibo.jpg', 'image/jpeg'], ['recibo.JPEG', 'image/jpeg'], ['recibo.png', 'image/png']]) {
    it(`admite ${nombre} hasta el límite de 5 MB`, () => {
      expect(validarComprobante({ name: nombre, type: tipo, size: tamanoMaximoComprobante })).toBe('')
    })
  }
  it('rechaza más de 5 MB', () => {
    expect(validarComprobante({ name: 'recibo.png', type: 'image/png', size: tamanoMaximoComprobante + 1 })).toBe('El comprobante no debe superar los 5 MB.')
  })
  it('rechaza formatos distintos, MIME incorrecto y archivos vacíos', () => {
    expect(validarComprobante(new File(['datos'], 'recibo.pdf', { type: 'application/pdf' }))).toMatch(/JPG o PNG/)
    expect(validarComprobante(new File(['datos'], 'recibo.png', { type: 'image/svg+xml' }))).toMatch(/JPG o PNG/)
    expect(validarComprobante(new File([], 'recibo.png', { type: 'image/png' }))).toMatch(/vacío/)
  })
})

describe('Selector de comprobante — HU-04', () => {
  it('muestra archivo y vista previa local; quitar libera la URL', () => {
    render(<SelectorPrueba />)
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['imagen'], 'recibo.png', { type: 'image/png' })] } })
    expect(screen.getByText('recibo.png')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:comprobante-local')
    expect(screen.getByText(/Vista previa local: el archivo aún no se ha subido/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar comprobante' }))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante-local')
  })
  it('muestra el error bajo el campo y permite descartarlo', () => {
    render(<SelectorPrueba />)
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['datos'], 'recibo.pdf', { type: 'application/pdf' })] } })
    expect(screen.getByRole('alert')).toHaveTextContent('El comprobante debe ser una imagen JPG o PNG.')
    expect(screen.getByLabelText('Comprobante (opcional)')).toHaveAttribute('aria-invalid', 'true')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar archivo rechazado' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('rechaza una imagen que no se puede visualizar', () => {
    render(<SelectorPrueba />)
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['datos'], 'recibo.png', { type: 'image/png' })] } })
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo visualizar el comprobante.')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
  it('libera la URL al desmontar la vista', () => {
    const vista = render(<SelectorPrueba />)
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['imagen'], 'recibo.jpg', { type: 'image/jpeg' })] } })
    vista.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante-local')
  })
})

describe('Integración con registro de abonos', () => {
  it('conserva el registro real sin comprobante al quitar el archivo seleccionado', async () => {
    const obligacion = { id: 81, concepto: 'Servicio', beneficiario: 'Proveedor', monto_original: '100.00', saldo_pendiente: '100.00', estado_economico: 'PENDIENTE' }
    const solicitar = vi.fn().mockImplementation((ruta, opciones) => {
      if (opciones.method === 'POST') return Promise.resolve({ abono: { obligacion_id: 81, saldo_resultante: '90.00' } })
      return Promise.resolve(ruta === '/api/obligaciones' ? { obligaciones: [obligacion] } : { obligacion })
    })
    render(<ContextoAutenticacion.Provider value={{ solicitar }}><FormularioAbono /></ContextoAutenticacion.Provider>)
    await screen.findByRole('option', { name: /Servicio/ })
    fireEvent.change(screen.getByLabelText('Pago pendiente'), { target: { value: '81' } })
    await screen.findByLabelText('Monto del abono (S/)')
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '10.00' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['imagen'], 'recibo.png', { type: 'image/png' })] } })
    expect(solicitar.mock.calls.filter(([, opciones]) => opciones.method === 'POST')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar comprobante' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    await waitFor(() => expect(solicitar.mock.calls.filter(([, opciones]) => opciones.method === 'POST')).toHaveLength(1))
    expect(solicitar.mock.calls.find(([, opciones]) => opciones.method === 'POST')[1].body).toEqual({ monto: '10.00', medio_pago: 'Efectivo', clave_idempotencia: expect.any(String) })
  })
})

describe('Conexión real de contratos HU-03 y HU-04', () => {
  const obligacion = { id: 81, concepto: 'Servicio', beneficiario: 'Proveedor', monto_original: '100.00', saldo_pendiente: '100.00', estado_economico: 'PENDIENTE' }
  const metadatos = { abono_id: 18, nombre: 'recibo.png', tipo: 'image/png', tamano: 20 }
  async function preparar({ cargar, saldo = '90.00' } = {}) {
    let registrado = false
    const solicitar = vi.fn(async (ruta, opciones = {}) => {
      if (ruta === '/api/obligaciones') return { obligaciones: [obligacion] }
      if (ruta === '/api/obligaciones/81/abonos') { registrado = true; return { message: 'Abono registrado correctamente.', abono: { id: 18, obligacion_id: 81, saldo_resultante: saldo } } }
      if (ruta === '/api/abonos/18/comprobante' && opciones.method === 'POST') {
        if (cargar) return cargar(opciones.body)
        return { comprobante: metadatos }
      }
      if (ruta === '/api/abonos/18/comprobante') return { tiene_comprobante: true, comprobante: metadatos }
      return { obligacion: registrado ? { ...obligacion, saldo_pendiente: saldo, estado_economico: saldo === '0.00' ? 'PAGADO' : 'PARCIAL' } : obligacion }
    })
    render(<ContextoAutenticacion.Provider value={{ solicitar }}><FormularioAbono /></ContextoAutenticacion.Provider>)
    await screen.findByRole('option', { name: /Servicio/ })
    fireEvent.change(screen.getByLabelText('Pago pendiente'), { target: { value: '81' } })
    await screen.findByLabelText('Monto del abono (S/)')
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '10.00' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    const archivo = new File(['imagen'], 'recibo.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [archivo] } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    return { solicitar, archivo }
  }

  it('usa el ID del abono y multipart, confirma solo el archivo guardado', async () => {
    const { solicitar, archivo } = await preparar()
    await screen.findByText('Comprobante asociado correctamente.')
    const llamadas = solicitar.mock.calls.filter(([, opciones]) => opciones?.method === 'POST')
    expect(llamadas.map(([ruta]) => ruta)).toEqual(['/api/obligaciones/81/abonos', '/api/abonos/18/comprobante'])
    expect(llamadas[0][1].body).not.toHaveProperty('comprobante')
    expect(llamadas[1][1].body).toBeInstanceOf(FormData)
    expect(llamadas[1][1].body.get('comprobante')).toBe(archivo)
    expect(screen.getByText('Comprobante guardado: recibo.png')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar abono' })).not.toBeInTheDocument()
  })

  it('al fallar la carga reintenta solo el archivo y conserva los mismos bytes', async () => {
    const carga = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Error de red'), { status: 0 }))
      .mockResolvedValueOnce({ comprobante: metadatos })
    const { solicitar, archivo } = await preparar({ cargar: carga })
    expect(await screen.findByRole('alert')).toHaveTextContent('El abono ya está registrado')
    expect(screen.queryByText('Comprobante asociado correctamente.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Comprobante (opcional)')).toBeDisabled()
    expect(screen.getByLabelText('Pago pendiente')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Actualizar obligaciones' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar comprobante' }))
    await screen.findByText('Comprobante asociado correctamente.')
    expect(solicitar.mock.calls.filter(([ruta]) => ruta === '/api/obligaciones/81/abonos')).toHaveLength(1)
    expect(carga).toHaveBeenCalledTimes(2)
    expect(carga.mock.calls.every(([cuerpo]) => cuerpo.get('comprobante') === archivo)).toBe(true)
  })

  it('permite consultar la confirmación perdida sin repetir el abono ni la carga', async () => {
    const { solicitar } = await preparar({ cargar: () => Promise.reject(new Error('Respuesta perdida')) })
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Consultar comprobante' }))
    await screen.findByText('El servidor confirma que el abono tiene comprobante.')
    expect(screen.getByRole('button', { name: 'Descargar comprobante' })).toBeEnabled()
    expect(solicitar.mock.calls.filter(([ruta, opciones]) => ruta.endsWith('/abonos') && opciones?.method === 'POST')).toHaveLength(1)
    expect(solicitar.mock.calls.filter(([, opciones]) => opciones?.body instanceof FormData)).toHaveLength(1)
  })

  for (const estado of [422, 403]) {
    it(`muestra error ${estado} de carga sin deshacer ni duplicar el abono`, async () => {
      const { solicitar } = await preparar({ cargar: () => Promise.reject(Object.assign(new Error('Archivo rechazado o sin permiso'), { status: estado })) })
      expect(await screen.findByRole('alert')).toHaveTextContent('Archivo rechazado o sin permiso')
      expect(screen.queryByText('Comprobante asociado correctamente.')).not.toBeInTheDocument()
      expect(solicitar.mock.calls.filter(([ruta]) => ruta.endsWith('/abonos'))).toHaveLength(1)
    })
  }

  it('con saldo cero sigue disponible el reintento y la consulta del comprobante', async () => {
    await preparar({ saldo: '0.00', cargar: () => Promise.reject(new Error('Respuesta perdida')) })
    await screen.findByText(/Respuesta perdida.*El abono ya está registrado/)
    expect(await screen.findByText('Esta obligación ya está pagada. Selecciona otra obligación con saldo disponible.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar comprobante' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Consultar comprobante' }))
    await screen.findByText('El servidor confirma que el abono tiene comprobante.')
  })
})
