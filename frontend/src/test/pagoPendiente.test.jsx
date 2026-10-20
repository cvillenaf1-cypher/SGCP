import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { FormularioPagoPendiente } from '../components/FormularioPagoPendiente'
import { validarFormulario } from '../lib/validarPagoPendiente'

const valoresValidos = { concepto: 'Alquiler', beneficiario: 'Propietario', montoOriginal: '150.50', fechaLimite: '2020-02-29' }

function prepararFormulario(solicitar = vi.fn()) {
  render(<ContextoAutenticacion.Provider value={{ solicitar }}><FormularioPagoPendiente /></ContextoAutenticacion.Provider>)
  for (const [etiqueta, valor] of [['Concepto del pago', 'Alquiler'], ['Beneficiario', 'Propietario'], ['Monto original (S/)', '150.50'], ['Fecha límite', '2020-02-29']]) {
    fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
  }
  return solicitar
}

describe('Validaciones del pago pendiente', () => {
  it('rechaza todos los campos vacíos y los textos con espacios', () => {
    expect(Object.keys(validarFormulario({ concepto: ' ', beneficiario: ' ', montoOriginal: '', fechaLimite: '' }))).toHaveLength(4)
  })
  for (const montoOriginal of ['0', '-1', '1.234', 'abc', '100000000000', '1,50']) {
    it(`rechaza el monto ${montoOriginal}`, () => {
      expect(validarFormulario({ ...valoresValidos, montoOriginal }).montoOriginal).toBeTruthy()
    })
  }
  for (const fechaLimite of ['2025-02-29', '2024-04-31', 'invalida', '0999-12-31']) {
    it(`rechaza la fecha ${fechaLimite}`, () => {
      expect(validarFormulario({ ...valoresValidos, fechaLimite }).fechaLimite).toBeTruthy()
    })
  }
  it('permite una fecha pasada válida y un monto de dos decimales', () => {
    expect(validarFormulario(valoresValidos)).toEqual({})
  })
  it('acepta exactamente S/ 100,000.00 y rechaza cualquier exceso, incluidos ceros iniciales', () => {
    for (const montoOriginal of ['99999.99', '100000', '100000.0', '100000.00', '00000100000']) {
      expect(validarFormulario({ ...valoresValidos, montoOriginal })).toEqual({})
    }
    for (const montoOriginal of ['100000.01', '100001', '00000100000.01', '99999999999.99']) {
      expect(validarFormulario({ ...valoresValidos, montoOriginal }).montoOriginal).toBe('El monto no puede superar S/ 100,000.00.')
    }
  })
})

describe('Formulario de pago pendiente', () => {
  it('impide enviar un importe mayor al máximo y permite corregirlo a S/ 100,000.00', async () => {
    const solicitar = prepararFormulario(vi.fn().mockResolvedValue({ obligacion: { id: 88 } }))
    fireEvent.change(screen.getByLabelText('Monto original (S/)'), { target: { value: '100000.01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago pendiente' }))
    expect(screen.getByText('El monto no puede superar S/ 100,000.00.')).toBeInTheDocument()
    expect(screen.getByLabelText('Monto original (S/)')).toHaveFocus()
    expect(solicitar).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Monto original (S/)'), { target: { value: '100000.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago pendiente' }))
    await screen.findByText('Pago pendiente registrado correctamente.')
    expect(solicitar).toHaveBeenCalledTimes(1)
    expect(solicitar.mock.calls[0][1].body.monto).toBe('100000.00')
  })
  it('renderiza campos, muestra errores específicos y enfoca el primer error sin enviar', () => {
    const solicitar = prepararFormulario()
    fireEvent.change(screen.getByLabelText('Concepto del pago'), { target: { value: ' ' } })
    fireEvent.change(screen.getByLabelText('Monto original (S/)'), { target: { value: '1.234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago pendiente' }))
    expect(screen.getByText('Ingresa el concepto.')).toBeInTheDocument()
    expect(screen.getByText('El monto admite como máximo dos decimales.')).toBeInTheDocument()
    expect(screen.getByLabelText('Concepto del pago')).toHaveFocus()
    expect(solicitar).not.toHaveBeenCalled()
  })

  it('envía el contrato real, bloquea envíos repetidos y confirma solo la respuesta del servidor', async () => {
    let confirmar
    const solicitar = prepararFormulario(vi.fn(() => new Promise((resolver) => { confirmar = resolver })))
    const boton = screen.getByRole('button', { name: 'Registrar pago pendiente' })
    fireEvent.submit(boton.closest('form'))
    fireEvent.submit(boton.closest('form'))
    expect(solicitar).toHaveBeenCalledTimes(1)
    expect(boton).toBeDisabled()
    expect(solicitar).toHaveBeenCalledWith('/api/obligaciones', { method: 'POST', body: { concepto: 'Alquiler', beneficiario: 'Propietario', monto: '150.50', fecha_limite: '2020-02-29' } })
    confirmar({ obligacion: { id: 1 } })
    expect(await screen.findByRole('status')).toHaveTextContent('Pago pendiente registrado correctamente.')
    expect(screen.getByLabelText('Concepto del pago')).toHaveValue('')
  })

  it('conserva datos y permite reintentar ante errores del servidor', async () => {
    prepararFormulario(vi.fn().mockRejectedValue(Object.assign(new Error('Revisa los datos.'), { fields: { monto: 'Monto rechazado por el servidor.' } })))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago pendiente' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los datos.')
    expect(screen.getByText('Monto rechazado por el servidor.')).toBeInTheDocument()
    expect(screen.getByLabelText('Concepto del pago')).toHaveValue('Alquiler')
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
  })

  it('no muestra éxito sin confirmación de una obligación', async () => {
    prepararFormulario(vi.fn().mockResolvedValue({}))
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no confirmó el registro.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
