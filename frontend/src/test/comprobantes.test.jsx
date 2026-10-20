import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SelectorComprobante } from '../components/SelectorComprobante'
import { FormularioAbono } from '../components/FormularioAbono'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { tamanoMaximoComprobante, validarComprobante } from '../lib/validarComprobante'

const etiqueta = 'Comprobante o factura (obligatorio)'
beforeEach(() => {
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:comprobante-local')
    static revokeObjectURL = vi.fn()
  })
})
afterEach(() => vi.unstubAllGlobals())

function SelectorPrueba() {
  const [archivo, establecerArchivo] = useState(null)
  const [error, establecerError] = useState('')
  return <SelectorComprobante archivo={archivo} error={error} alCambiar={(nuevo, fallo) => { establecerArchivo(nuevo); establecerError(fallo) }} />
}
function adjuntar(nombre = 'recibo.png', tipo = 'image/png') {
  const archivo = new File(['evidencia'], nombre, { type: tipo })
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { files: [archivo] } })
  return archivo
}

describe('Evidencia obligatoria', () => {
  it('rechaza la ausencia de archivo', () => expect(validarComprobante(null)).toMatch(/obligatoria/))
  for (const [name, type] of [['recibo.jpg', 'image/jpeg'], ['recibo.JPEG', 'image/jpeg'], ['recibo.png', 'image/png'], ['factura.PDF', 'application/pdf']]) {
    it(`admite ${name} hasta 5 MB`, () => expect(validarComprobante({ name, type, size: tamanoMaximoComprobante })).toBe(''))
  }
  it('rechaza tamaño excesivo, archivos vacíos y contenido declarado incompatible', () => {
    expect(validarComprobante({ name: 'a.pdf', type: 'application/pdf', size: tamanoMaximoComprobante + 1 })).toMatch(/5 MB/)
    expect(validarComprobante(new File([], 'a.pdf', { type: 'application/pdf' }))).toMatch(/vacío/)
    expect(validarComprobante(new File(['x'], 'a.png', { type: 'application/pdf' }))).toMatch(/JPG, PNG o PDF/)
    expect(validarComprobante(new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).toMatch(/JPG, PNG o PDF/)
  })
  it('presenta la imagen y libera su vista previa al quitarla', () => {
    render(<SelectorPrueba />)
    expect(screen.getByLabelText(etiqueta)).toBeRequired()
    adjuntar()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:comprobante-local')
    fireEvent.click(screen.getByRole('button', { name: 'Quitar comprobante' }))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante-local')
  })
  it('identifica un PDF sin intentar mostrarlo como imagen', () => {
    render(<SelectorPrueba />)
    adjuntar('factura.pdf', 'application/pdf')
    expect(screen.getByText('Documento PDF seleccionado.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('rechaza una imagen que no se puede visualizar', () => {
    render(<SelectorPrueba />)
    adjuntar()
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo visualizar el comprobante.')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('Registro conjunto de abono y comprobante', () => {
  const obligacion = { id: 81, concepto: 'Servicio', beneficiario: 'Proveedor', monto_original: '100.00', saldo_pendiente: '100.00', estado_economico: 'PENDIENTE' }
  const resultado = { message: 'Abono registrado correctamente.', abono: { id: 18, obligacion_id: 81, saldo_resultante: '90.00' }, comprobante: { abono_id: 18, nombre: 'factura.pdf', tipo: 'application/pdf' } }
  async function preparar(registrar = vi.fn().mockResolvedValue(resultado)) {
    let registrado = false
    const solicitar = vi.fn(async (ruta, opciones = {}) => {
      if (opciones.method === 'POST') { const respuesta = await registrar(opciones.body); registrado = true; return respuesta }
      if (ruta === '/api/obligaciones') return { obligaciones: [obligacion] }
      return { obligacion: registrado ? { ...obligacion, saldo_pendiente: '90.00' } : obligacion }
    })
    render(<ContextoAutenticacion.Provider value={{ solicitar }}><FormularioAbono /></ContextoAutenticacion.Provider>)
    await screen.findByRole('option', { name: /Servicio/ })
    fireEvent.change(screen.getByLabelText('Pago pendiente'), { target: { value: '81' } })
    fireEvent.change(await screen.findByLabelText('Monto del abono (S/)'), { target: { value: '10.00' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    return { solicitar, registrar }
  }
  it('no envía el abono después de quitar la evidencia', async () => {
    const { registrar } = await preparar()
    adjuntar()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar comprobante' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(screen.getByRole('alert')).toHaveTextContent('La evidencia es obligatoria')
    expect(screen.getByLabelText(etiqueta)).toHaveFocus()
    expect(registrar).not.toHaveBeenCalled()
  })
  it('envía monto, medio, clave y PDF en una petición; exige evidencia para el siguiente abono', async () => {
    const { solicitar, registrar } = await preparar()
    const archivo = adjuntar('factura.pdf', 'application/pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    await screen.findByText('Evidencia guardada: factura.pdf')
    const cuerpo = registrar.mock.calls[0][0]
    expect(cuerpo.get('monto')).toBe('10.00')
    expect(cuerpo.get('medio_pago')).toBe('Efectivo')
    expect(cuerpo.get('clave_idempotencia')).toBeTruthy()
    expect(cuerpo.get('comprobante')).toBe(archivo)
    expect(solicitar.mock.calls.filter(([, opciones]) => opciones?.method === 'POST').map(([ruta]) => ruta)).toEqual(['/api/obligaciones/81/abonos'])
    expect(await screen.findByLabelText(etiqueta)).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Monto del abono (S/)'), { target: { value: '10.00' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'Efectivo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    expect(registrar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('La evidencia es obligatoria')
  })
  it('un fallo de conexión conserva el archivo y clave sin anunciar éxito', async () => {
    const registrar = vi.fn().mockRejectedValueOnce(new Error('Respuesta perdida')).mockResolvedValueOnce(resultado)
    await preparar(registrar)
    adjuntar('factura.pdf', 'application/pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    await screen.findByRole('button', { name: 'Reintentar registro' })
    expect(screen.queryByText('Abono registrado correctamente.')).not.toBeInTheDocument()
    expect(screen.getByLabelText(etiqueta)).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro' }))
    await screen.findByText('Evidencia guardada: factura.pdf')
    expect(registrar.mock.calls[0][0]).toBe(registrar.mock.calls[1][0])
  })
  it('un archivo rechazado permite corregir la evidencia sin confirmar un pago', async () => {
    const registrar = vi.fn().mockRejectedValue(Object.assign(new Error('Revisa la evidencia'), { status: 422, fields: { comprobante: 'PDF inválido.' } }))
    await preparar(registrar)
    adjuntar('factura.pdf', 'application/pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar abono' }))
    await screen.findByText('PDF inválido.')
    await waitFor(() => expect(screen.getByLabelText(etiqueta)).toBeEnabled())
    expect(screen.queryByText('Abono registrado correctamente.')).not.toBeInTheDocument()
  })
})
