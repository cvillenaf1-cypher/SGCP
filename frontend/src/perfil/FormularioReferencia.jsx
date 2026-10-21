import { useRef, useState } from 'react'
import { definicionesPerfil, validarPerfil, valoresInicialesPerfil } from '../../../shared/perfilReferencia'

export function FormularioReferencia({ tipo, registro, version, alGuardar, alCancelar, alBloquear }) {
  const definicion = definicionesPerfil[tipo]
  const edicion = tipo === 'titular' || Boolean(registro?.id)
  const [valores, establecerValores] = useState(() => Object.fromEntries(Object.keys(definicion).map((clave) => [clave, registro?.[clave] ?? valoresInicialesPerfil(tipo)[clave]])))
  const [errores, establecerErrores] = useState({})
  const [error, establecerError] = useState('')
  const [enviando, establecerEnviando] = useState(false)
  const bloqueo = useRef(false)
  const formulario = useRef(null)

  async function guardar(evento) {
    evento.preventDefault()
    if (bloqueo.current) return
    const cuerpo = { ...valores, ...(edicion ? { version } : {}) }
    const { datos, fields } = validarPerfil(tipo, cuerpo, { edicion })
    establecerErrores(fields)
    establecerError('')
    if (Object.keys(fields).length) {
      establecerError('Revisa los campos indicados antes de guardar.')
      formulario.current.elements.namedItem(Object.keys(fields)[0])?.focus()
      return
    }
    bloqueo.current = true
    establecerEnviando(true)
    alBloquear?.(true)
    try {
      await alGuardar({ ...datos, ...(edicion ? { version } : {}) })
    } catch (fallo) {
      establecerErrores(fallo.fields || {})
      establecerError(fallo.message || 'No se pudo guardar la referencia.')
    } finally {
      bloqueo.current = false
      establecerEnviando(false)
      alBloquear?.(false)
    }
  }

  return <form className="perfil-formulario" ref={formulario} onSubmit={guardar} noValidate aria-busy={enviando} aria-label={`Formulario de ${tipo}`}>
    <div className="perfil-campos">
      {Object.entries(definicion).map(([clave, campo]) => {
        const id = `perfil-${tipo}-${clave}`
        const propiedades = {
          id, name: clave, value: valores[clave], disabled: enviando, required: campo.obligatorio,
          onChange: (evento) => establecerValores({ ...valores, [clave]: evento.target.value }),
          'aria-invalid': Boolean(errores[clave]), 'aria-describedby': errores[clave] ? `${id}-error` : undefined,
        }
        return <div className="field" key={clave}>
          <label htmlFor={id}>{campo.etiqueta}{campo.obligatorio ? ' *' : ''}</label>
          {campo.opciones
            ? <select {...propiedades}>{campo.opciones.map(([valor, etiqueta]) => <option value={valor} key={valor}>{etiqueta}</option>)}</select>
            : <input {...propiedades} type="text" autoComplete="off" inputMode={campo.documento || clave === 'ultimos_cuatro' ? 'numeric' : undefined} list={clave === 'entidad' ? 'entidades-financieras' : undefined} />}
          {errores[clave] && <p id={`${id}-error`} className="field-error">{errores[clave]}</p>}
        </div>
      })}
    </div>
    {tipo === 'bancos' && <datalist id="entidades-financieras">{['BCP', 'Interbank', 'BBVA', 'Banco de la Nación', 'Scotiabank'].map((entidad) => <option key={entidad} value={entidad} />)}</datalist>}
    {tipo === 'titular' && <p className="description">Todos los datos son opcionales. Si indicas un documento, usa RUC de 11 dígitos para empresa o DNI de 8 para persona natural. Puedes guardar avances.</p>}
    {tipo === 'bancos' && <p className="description">Añade los últimos cuatro dígitos solo si necesitas distinguir la referencia. No ingreses números completos de tarjeta o cuenta, CVV, PIN, claves ni credenciales.</p>}
    {tipo === 'servicios' && <p className="description">El titular del recibo puede ser un tercero, como el propietario de un local alquilado. Describe por separado su relación con el negocio. No ingreses claves ni credenciales.</p>}
    {errores.form && <p className="field-error">{errores.form}</p>}
    {errores.version && <p className="field-error">{errores.version}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="perfil-acciones">
      <button type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar referencia'}</button>
      <button type="button" className="perfil-secundario" disabled={enviando} onClick={alCancelar}>Cancelar</button>
    </div>
  </form>
}
