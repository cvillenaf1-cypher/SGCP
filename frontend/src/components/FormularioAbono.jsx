import { useEffect, useRef, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { convertirACentimos, mediosPago, validarAbono } from '../lib/validarAbono'
import { formatearImporte } from '../lib/formatearImporte'
import './FormularioAbono.css'

function DatosObligacionAbono({ identificador }) {
  const { solicitar } = useAutenticacion()
  const [consulta, establecerConsulta] = useState({ cargando: true, obligacion: null, error: '' })
  const [intento, establecerIntento] = useState(0)
  const [valores, establecerValores] = useState({ montoAbono: '', medioPago: '' })
  const [errores, establecerErrores] = useState({})
  const [aviso, establecerAviso] = useState('')
  const formulario = useRef(null)

  useEffect(() => {
    const controlador = new AbortController()
    solicitar(`/api/obligaciones/${identificador}`, { signal: controlador.signal })
      .then((datos) => {
        if (!datos?.obligacion || convertirACentimos(datos.obligacion.saldo_pendiente) === null || convertirACentimos(datos.obligacion.monto_original) === null) throw new Error('El servidor no devolvió datos válidos de la obligación.')
        if (!controlador.signal.aborted) establecerConsulta({ cargando: false, obligacion: datos.obligacion, error: '' })
      })
      .catch((fallo) => { if (!controlador.signal.aborted) establecerConsulta({ cargando: false, obligacion: null, error: fallo.message }) })
    return () => controlador.abort()
  }, [identificador, intento, solicitar])

  function comprobarAbono(evento) {
    evento.preventDefault()
    establecerAviso('')
    const nuevosErrores = validarAbono(valores, consulta.obligacion.saldo_pendiente)
    establecerErrores(nuevosErrores)
    if (Object.keys(nuevosErrores).length) {
      formulario.current.elements.namedItem(Object.keys(nuevosErrores)[0])?.focus()
      return
    }
    // El guardado se conectará únicamente cuando Haro publique su contrato real.
    establecerAviso('Los datos del abono son válidos. El registro está pendiente de la integración del backend de abonos; no se guardó ningún movimiento ni se modificó el saldo.')
  }

  if (consulta.cargando) return <p role="status">Consultando el saldo actual…</p>
  if (consulta.error) return <>
    <p className="error-message" role="alert">{consulta.error}</p>
    <button type="button" onClick={() => { establecerConsulta({ cargando: true, obligacion: null, error: '' }); establecerIntento(intento + 1) }}>Reintentar saldo</button>
  </>

  const obligacion = consulta.obligacion
  const tieneSaldo = convertirACentimos(obligacion.saldo_pendiente) > 0n
  return <>
    <dl className="abono-resumen">
      <div><dt>Concepto</dt><dd>{obligacion.concepto}</dd></div>
      <div><dt>Beneficiario</dt><dd>{obligacion.beneficiario}</dd></div>
      <div><dt>Monto original</dt><dd>{formatearImporte(obligacion.monto_original)}</dd></div>
      <div><dt>Saldo disponible</dt><dd>{formatearImporte(obligacion.saldo_pendiente)}</dd></div>
      <div><dt>Estado económico</dt><dd>{obligacion.estado_economico}</dd></div>
      {obligacion.vencida && <div><dt>Vencimiento</dt><dd>Vencida</dd></div>}
    </dl>
    {!tieneSaldo ? <p className="notice" role="alert">Esta obligación ya está pagada. Selecciona otra obligación con saldo disponible.</p> : <form ref={formulario} noValidate onSubmit={comprobarAbono}>
      <div className="abono-campos">
        <div className="field">
          <label htmlFor="monto-abono">Monto del abono (S/)</label>
          <input id="monto-abono" name="montoAbono" type="text" inputMode="decimal" required
            value={valores.montoAbono} onChange={(evento) => { establecerValores({ ...valores, montoAbono: evento.target.value }); establecerAviso('') }}
            aria-invalid={Boolean(errores.montoAbono)} aria-describedby={`ayuda-monto-abono${errores.montoAbono ? ' error-monto-abono' : ''}`} />
          <small id="ayuda-monto-abono" className="description">Mayor que cero, hasta dos decimales y sin superar el saldo disponible.</small>
          {errores.montoAbono && <p className="field-error" id="error-monto-abono">{errores.montoAbono}</p>}
        </div>
        <div className="field">
          <label htmlFor="medio-abono">Medio de pago</label>
          <select id="medio-abono" name="medioPago" required value={valores.medioPago}
            onChange={(evento) => { establecerValores({ ...valores, medioPago: evento.target.value }); establecerAviso('') }}
            aria-invalid={Boolean(errores.medioPago)} aria-describedby={`ayuda-medio-abono${errores.medioPago ? ' error-medio-abono' : ''}`}>
            <option value="">Selecciona un medio de pago</option>
            {mediosPago.map((medio) => <option key={medio} value={medio}>{medio}</option>)}
          </select>
          <small id="ayuda-medio-abono" className="description">Indica cómo se realizó el abono fuera de SGCP.</small>
          {errores.medioPago && <p className="field-error" id="error-medio-abono">{errores.medioPago}</p>}
        </div>
      </div>
      {errores.obligacion && <p className="error-message" role="alert">{errores.obligacion}</p>}
      {aviso && <p className="notice" role="status">{aviso}</p>}
      <button type="submit">Validar abono</button>
      <p className="description">Por ahora solo puedes validar los datos. El guardado y la actualización del saldo se habilitarán al integrar el backend.</p>
    </form>}
  </>
}

export function FormularioAbono() {
  const { solicitar } = useAutenticacion()
  const [consulta, establecerConsulta] = useState({ cargando: true, obligaciones: [], error: '' })
  const [seleccionado, establecerSeleccionado] = useState('')
  const [intento, establecerIntento] = useState(0)
  useEffect(() => {
    const controlador = new AbortController()
    solicitar('/api/obligaciones', { signal: controlador.signal })
      .then((datos) => {
        if (!Array.isArray(datos?.obligaciones)) throw new Error('El servidor no devolvió un listado válido de obligaciones.')
        if (!controlador.signal.aborted) establecerConsulta({ cargando: false, obligaciones: datos.obligaciones, error: '' })
      })
      .catch((fallo) => { if (!controlador.signal.aborted) establecerConsulta({ cargando: false, obligaciones: [], error: fallo.message }) })
    return () => controlador.abort()
  }, [intento, solicitar])

  function actualizarObligaciones() {
    establecerSeleccionado('')
    establecerConsulta({ cargando: true, obligaciones: [], error: '' })
    establecerIntento(intento + 1)
  }

  const disponibles = consulta.obligaciones.filter((obligacion) => convertirACentimos(obligacion.saldo_pendiente) > 0n)
  return <section className="registro-abono" aria-labelledby="titulo-registro-abono">
    <h3 id="titulo-registro-abono">Registrar pagos realizados</h3>
    <p className="description">Prepara el registro de un abono realizado fuera del sistema. SGCP no realiza transferencias ni cobros.</p>
    <p className="notice">Guardado pendiente de integración: las obligaciones y sus saldos se consultan en el servidor; los abonos aún no se pueden guardar.</p>
    {consulta.cargando && <p role="status">Cargando obligaciones…</p>}
    {consulta.error && <><p className="error-message" role="alert">{consulta.error}</p><button type="button" onClick={actualizarObligaciones}>Reintentar obligaciones</button></>}
    {!consulta.cargando && !consulta.error && <>
      <div className="abono-seleccion">
        <div className="field">
          <label htmlFor="obligacion-abono">Pago pendiente</label>
          <select id="obligacion-abono" required value={seleccionado} onChange={(evento) => establecerSeleccionado(evento.target.value)} aria-describedby="ayuda-obligacion-abono">
            <option value="">Selecciona una obligación</option>
            {consulta.obligaciones.map((obligacion) => <option key={obligacion.id} value={obligacion.id} disabled={!(convertirACentimos(obligacion.saldo_pendiente) > 0n)}>
              {obligacion.concepto} — {formatearImporte(obligacion.saldo_pendiente)}{convertirACentimos(obligacion.saldo_pendiente) === 0n ? ' — Pagada' : ''}
            </option>)}
          </select>
          <small id="ayuda-obligacion-abono" className="description">Selecciona una obligación con saldo mayor que cero. Las pagadas no se pueden seleccionar.</small>
        </div>
        <button type="button" className="secondary-button" onClick={actualizarObligaciones}>Actualizar obligaciones</button>
      </div>
      {disponibles.length === 0 && <p className="empty-state" role="status">{consulta.obligaciones.length ? 'Todas las obligaciones están pagadas. No hay saldos disponibles para abonar.' : 'Todavía no hay obligaciones registradas. Registra primero un pago pendiente.'}</p>}
      {seleccionado && <DatosObligacionAbono key={seleccionado} identificador={seleccionado} />}
    </>}
  </section>
}
