import { useRef, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { validarFormulario } from '../lib/validarPagoPendiente'
import { fechaActualLima } from '../lib/pagosInicio'
import './FormularioPagoPendiente.css'

const valoresIniciales = { concepto: '', beneficiario: '', montoOriginal: '', fechaLimite: '' }
const campos = [
  { nombre: 'concepto', etiqueta: 'Concepto del pago', ayuda: 'Describe el compromiso económico.', tipo: 'text' },
  { nombre: 'beneficiario', etiqueta: 'Beneficiario', ayuda: 'Persona o empresa a quien se debe pagar.', tipo: 'text' },
  { nombre: 'montoOriginal', etiqueta: 'Monto original (S/)', ayuda: 'Mayor que cero y máximo S/ 100,000.00. Usa punto y hasta dos decimales: 150.50.', tipo: 'text' },
  { nombre: 'fechaLimite', etiqueta: 'Fecha límite', ayuda: 'Puedes registrar obligaciones con una fecha límite pasada.', tipo: 'date' },
]

export function FormularioPagoPendiente() {
  const { solicitar } = useAutenticacion()
  const [valores, establecerValores] = useState(valoresIniciales)
  const [errores, establecerErrores] = useState({})
  const [enviando, establecerEnviando] = useState(false)
  const [mensaje, establecerMensaje] = useState('')
  const [error, establecerError] = useState('')
  const bloqueo = useRef(false)
  const formulario = useRef(null)
  const fechaLimitePasada = Boolean(valores.fechaLimite && !validarFormulario(valores).fechaLimite && valores.fechaLimite < fechaActualLima())

  async function registrarPagoPendiente(evento) {
    evento.preventDefault()
    if (bloqueo.current) return
    establecerMensaje('')
    establecerError('')
    const nuevosErrores = validarFormulario(valores)
    establecerErrores(nuevosErrores)
    if (Object.keys(nuevosErrores).length) {
      formulario.current.elements.namedItem(Object.keys(nuevosErrores)[0])?.focus()
      return
    }
    bloqueo.current = true
    establecerEnviando(true)
    try {
      const respuesta = await solicitar('/api/obligaciones', {
        method: 'POST',
        body: { concepto: valores.concepto.trim(), beneficiario: valores.beneficiario.trim(), monto: valores.montoOriginal, fecha_limite: valores.fechaLimite },
      })
      if (!respuesta?.obligacion?.id) throw new Error('El servidor no confirmó el registro. Verifica antes de volver a enviarlo.')
      establecerMensaje('Pago pendiente registrado correctamente.')
      establecerValores(valoresIniciales)
    } catch (fallo) {
      const camposServidor = fallo.fields || {}
      establecerErrores({ concepto: camposServidor.concepto, beneficiario: camposServidor.beneficiario, montoOriginal: camposServidor.monto, fechaLimite: camposServidor.fecha_limite })
      establecerError(fallo.message || 'No se pudo registrar el pago pendiente.')
    } finally {
      bloqueo.current = false
      establecerEnviando(false)
    }
  }

  return <section className="registro-pago" aria-labelledby="titulo-registro-pago">
    <h3 id="titulo-registro-pago">Registrar pago pendiente</h3>
    <p className="description">Registra una obligación del negocio. Todos los campos son obligatorios.</p>
    <form ref={formulario} onSubmit={registrarPagoPendiente} noValidate aria-busy={enviando}>
      <div className="registro-pago-campos">
        {campos.map(({ nombre, etiqueta, ayuda, tipo }) => <div className="field" key={nombre}>
          <label htmlFor={`pago-${nombre}`}>{etiqueta}</label>
          <input id={`pago-${nombre}`} name={nombre} type={tipo} required
            inputMode={nombre === 'montoOriginal' ? 'decimal' : undefined}
            min={tipo === 'date' ? '1000-01-01' : undefined} max={tipo === 'date' ? '9999-12-31' : undefined}
            value={valores[nombre]} disabled={enviando}
            onChange={(evento) => { establecerValores({ ...valores, [nombre]: evento.target.value }); establecerMensaje('') }}
            aria-invalid={Boolean(errores[nombre])} aria-describedby={`ayuda-${nombre}${errores[nombre] ? ` error-${nombre}` : ''}${nombre === 'fechaLimite' && fechaLimitePasada ? ' aviso-fecha-pasada' : ''}`} />
          <small className="description" id={`ayuda-${nombre}`}>{ayuda}</small>
          {nombre === 'fechaLimite' && <div aria-live="polite">
            {fechaLimitePasada && <p className="notice" role="note" id="aviso-fecha-pasada">La fecha seleccionada ya pasó. Esta deuda se registrará como vencida.</p>}
          </div>}
          {errores[nombre] && <p className="field-error" id={`error-${nombre}`}>{errores[nombre]}</p>}
        </div>)}
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      {mensaje && <p className="success-message" role="status">{mensaje}</p>}
      <button type="submit" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar pago pendiente'}</button>
      <p className="description">El sistema calcula el saldo pendiente y asigna el estado y la fecha de registro.</p>
    </form>
  </section>
}
