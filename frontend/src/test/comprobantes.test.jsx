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
  it('bloquea guardado con archivo y conserva el registro real sin comprobante al quitarlo', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(screen.getByRole('alert')).toHaveTextContent('El comprobante no se puede subir todavía. No se registró el abono.')
    expect(solicitar.mock.calls.filter(([, opciones]) => opciones.method === 'POST')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar comprobante' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    await waitFor(() => expect(solicitar.mock.calls.filter(([, opciones]) => opciones.method === 'POST')).toHaveLength(1))
    expect(solicitar.mock.calls.find(([, opciones]) => opciones.method === 'POST')[1].body).toEqual({ monto: '10.00', medio_pago: 'Efectivo', clave_idempotencia: expect.any(String) })
  })
})
