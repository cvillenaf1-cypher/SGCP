import { useCallback, useEffect, useRef, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { convertirACentimos, mediosPago, validarAbono } from '../lib/validarAbono'
import { validarComprobante } from '../lib/validarComprobante'
import { formatearImporte } from '../lib/formatearImporte'
import { SelectorComprobante } from './SelectorComprobante'
import { actualizarEstadoObligacion } from '../lib/pagosInicio'
import './FormularioAbono.css'

export function DatosObligacionAbono({ identificador, alBloquear, alActualizarObligacion, alRegistrar, mostrarResumen = true }) {
  const { solicitar } = useAutenticacion()
  const [consulta, establecerConsulta] = useState({ cargando: true, obligacion: null, error: '' })
  const [intento, establecerIntento] = useState(0)
  const [valores, establecerValores] = useState({ montoAbono: '', medioPago: '' })
  const [errores, establecerErrores] = useState({})
  const [aviso, establecerAviso] = useState('')
  const [mensajeError, establecerMensajeError] = useState('')
  const [guardando, establecerGuardando] = useState(false)
  const [operacionPendiente, establecerOperacionPendiente] = useState(null)
  const [comprobante, establecerComprobante] = useState(null)
  const [errorComprobante, establecerErrorComprobante] = useState('')
  const [registroComprobante, establecerRegistroComprobante] = useState(null)
  const [descargando, establecerDescargando] = useState(false)
  const formulario = useRef(null)
  const envioEnCurso = useRef(false)
  const operacionPendienteRef = useRef(null)
  const bloqueada = guardando || Boolean(operacionPendiente) || descargando

  useEffect(() => {
    alBloquear(bloqueada)
    return () => alBloquear(false)
  }, [alBloquear, bloqueada])

  useEffect(() => {
    if (!bloqueada) return
    const protegerSalida = (evento) => { evento.preventDefault(); evento.returnValue = '' }
    window.addEventListener('beforeunload', protegerSalida)
    return () => window.removeEventListener('beforeunload', protegerSalida)
  }, [bloqueada])

  useEffect(() => {
    const controlador = new AbortController()
    solicitar('/api/obligaciones/' + identificador, { signal: controlador.signal })
      .then((datos) => {
        if (!datos?.obligacion || convertirACentimos(datos.obligacion.saldo_pendiente) === null || convertirACentimos(datos.obligacion.monto_original) === null) throw new Error('El servidor no devolvió datos válidos de la obligación.')
        if (!controlador.signal.aborted) {
          establecerConsulta({ cargando: false, obligacion: datos.obligacion, error: '' })
          alActualizarObligacion(datos.obligacion)
        }
      })
      .catch((fallo) => { if (!controlador.signal.aborted) establecerConsulta({ cargando: false, obligacion: null, error: fallo.message }) })
    return () => controlador.abort()
  }, [identificador, intento, solicitar, alActualizarObligacion])

  function actualizarSaldo() {
    establecerConsulta({ cargando: true, obligacion: null, error: '' })
    establecerIntento((actual) => actual + 1)
  }

  async function comprobarAbono(evento) {
    evento.preventDefault()
    if (envioEnCurso.current) return
    establecerAviso('')
    establecerMensajeError('')
    let operacion = operacionPendienteRef.current
    if (!operacion) {
      const nuevosErrores = validarAbono(valores, consulta.obligacion.saldo_pendiente)
      const falloArchivo = validarComprobante(comprobante)
      establecerErrores(nuevosErrores)
      establecerErrorComprobante(falloArchivo)
      if (Object.keys(nuevosErrores).length || falloArchivo) {
        formulario.current.elements.namedItem(Object.keys(nuevosErrores)[0] || 'comprobante')?.focus()
        return
      }
      const clave = globalThis.crypto?.randomUUID?.()
      if (!clave) { establecerMensajeError('No se pudo generar una clave segura para esta operación.'); return }
      const cuerpo = new FormData()
      cuerpo.append('monto', valores.montoAbono)
      cuerpo.append('medio_pago', valores.medioPago)
      cuerpo.append('clave_idempotencia', clave)
      cuerpo.append('comprobante', comprobante)
      operacion = { cuerpo }
      operacionPendienteRef.current = operacion
      establecerOperacionPendiente(operacion)
    }
    envioEnCurso.current = true
    establecerGuardando(true)
    try {
      const resultado = await solicitar('/api/obligaciones/' + identificador + '/abonos', { method: 'POST', body: operacion.cuerpo })
      const saldo = convertirACentimos(resultado?.abono?.saldo_resultante)
      if (!Number.isSafeInteger(resultado?.abono?.id) || resultado.abono.id < 1
        || String(resultado.abono.obligacion_id) !== String(identificador) || saldo === null || saldo < 0n
        || resultado.comprobante?.abono_id !== resultado.abono.id || !resultado.comprobante.nombre) {
        throw new Error('El servidor no confirmó el abono con su evidencia. Reintenta la misma operación.')
      }
      operacionPendienteRef.current = null
      establecerOperacionPendiente(null)
      establecerErrores({})
      establecerAviso(resultado.message || 'Abono registrado correctamente.')
      establecerRegistroComprobante(resultado.comprobante)
      establecerComprobante(null)
      establecerErrorComprobante('')
      establecerValores({ montoAbono: '', medioPago: '' })
      alActualizarObligacion(actualizarEstadoObligacion({ ...consulta.obligacion, saldo_pendiente: resultado.abono.saldo_resultante }))
      alRegistrar?.()
      actualizarSaldo()
    } catch (error) {
      const campos = error?.fields || {}
      establecerErrores({ ...(campos.monto ? { montoAbono: campos.monto } : {}), ...(campos.medio_pago ? { medioPago: campos.medio_pago } : {}) })
      if (campos.comprobante) establecerErrorComprobante(campos.comprobante)
      if ([400, 409, 413, 415, 422].includes(error.status)) {
        operacionPendienteRef.current = null
        establecerOperacionPendiente(null)
        establecerMensajeError(error.message || 'Revisa los datos y la evidencia del pago.')
        if (error.status === 409) actualizarSaldo()
      } else {
        establecerMensajeError((error.message || 'No se pudo confirmar el registro.') + ' Reintenta con la misma evidencia y clave, sin duplicar el abono.')
      }
    } finally {
      envioEnCurso.current = false
      establecerGuardando(false)
    }
  }

  async function descargarComprobante() {
    if (descargando) return
    establecerDescargando(true)
    establecerMensajeError('')
    try {
      const archivo = await solicitar('/api/abonos/' + registroComprobante.abono_id + '/comprobante/archivo', { respuestaComo: 'blob' })
      const direccion = URL.createObjectURL(archivo)
      try {
        const enlace = document.createElement('a')
        enlace.href = direccion
        enlace.download = registroComprobante.nombre
        document.body.append(enlace)
        enlace.click()
        enlace.remove()
      } finally { URL.revokeObjectURL(direccion) }
    } catch (error) { establecerMensajeError(error.message || 'No se pudo descargar el comprobante.') }
    finally { establecerDescargando(false) }
  }

  const confirmacion = <>
    {aviso && <p className="notice" role="status">{aviso}</p>}
    {mensajeError && <p className="error-message" role="alert">{mensajeError}</p>}
    {registroComprobante && <section aria-label="Comprobante del abono registrado">
      <p>Evidencia guardada: {registroComprobante.nombre}</p>
      <button type="button" className="secondary-button" disabled={descargando} onClick={descargarComprobante}>Descargar comprobante</button>
    </section>}
  </>
  if (consulta.cargando) return <>{confirmacion}<p role="status">Consultando el saldo actual…</p></>
  if (consulta.error) return <>{confirmacion}<p className="error-message" role="alert">{consulta.error}</p><button type="button" onClick={actualizarSaldo}>Reintentar saldo</button></>
  const obligacion = consulta.obligacion
  const tieneSaldo = convertirACentimos(obligacion.saldo_pendiente) > 0n
  return <>
    {mostrarResumen && <dl className="abono-resumen">
      <div><dt>Concepto</dt><dd>{obligacion.concepto}</dd></div>
      <div><dt>Beneficiario</dt><dd>{obligacion.beneficiario}</dd></div>
      <div><dt>Monto original</dt><dd>{formatearImporte(obligacion.monto_original)}</dd></div>
      <div><dt>Saldo disponible</dt><dd>{formatearImporte(obligacion.saldo_pendiente)}</dd></div>
      <div><dt>Estado económico</dt><dd>{obligacion.estado_economico}</dd></div>
      {obligacion.vencida && <div><dt>Vencimiento</dt><dd>Vencida</dd></div>}
    </dl>}
    {confirmacion}
    {!tieneSaldo ? <p className="notice" role="alert">Esta obligación ya está pagada. Selecciona otra obligación con saldo disponible.</p> : <form ref={formulario} noValidate onSubmit={comprobarAbono}>
      <div className="abono-campos">
        <div className="field">
          <label htmlFor="monto-abono">Monto del abono (S/)</label>
          <input id="monto-abono" name="montoAbono" type="text" inputMode="decimal" required disabled={guardando || Boolean(operacionPendiente)} value={valores.montoAbono}
            onChange={(evento) => { establecerValores({ ...valores, montoAbono: evento.target.value }); establecerAviso(''); establecerMensajeError('') }}
            aria-invalid={Boolean(errores.montoAbono)} aria-describedby={'ayuda-monto-abono' + (errores.montoAbono ? ' error-monto-abono' : '')} />
          <small id="ayuda-monto-abono" className="description">Mayor que cero, hasta dos decimales. Máximo a abonar: {formatearImporte(obligacion.saldo_pendiente)}.</small>
          {errores.montoAbono && <p className="field-error" id="error-monto-abono">{errores.montoAbono}</p>}
        </div>
        <div className="field">
          <label htmlFor="medio-abono">Medio de pago</label>
          <select id="medio-abono" name="medioPago" required value={valores.medioPago} disabled={guardando || Boolean(operacionPendiente)}
            onChange={(evento) => { establecerValores({ ...valores, medioPago: evento.target.value }); establecerAviso(''); establecerMensajeError('') }}
            aria-invalid={Boolean(errores.medioPago)} aria-describedby={'ayuda-medio-abono' + (errores.medioPago ? ' error-medio-abono' : '')}>
            <option value="">Selecciona un medio de pago</option>
            {mediosPago.map((medio) => <option key={medio} value={medio}>{medio}</option>)}
          </select>
          <small id="ayuda-medio-abono" className="description">Indica cómo se realizó el abono fuera de SGCP.</small>
          {errores.medioPago && <p className="field-error" id="error-medio-abono">{errores.medioPago}</p>}
        </div>
      </div>
      <SelectorComprobante archivo={comprobante} error={errorComprobante} deshabilitado={guardando || Boolean(operacionPendiente)}
        alCambiar={(archivo, error) => { establecerComprobante(archivo); establecerErrorComprobante(error); establecerAviso(''); establecerMensajeError('') }} />
      {errores.obligacion && <p className="error-message" role="alert">{errores.obligacion}</p>}
      <button type="submit" disabled={guardando}>{guardando ? 'Registrando abono…' : operacionPendiente ? 'Reintentar registro' : 'Registrar abono'}</button>
    </form>}
  </>
}

export function FormularioAbono({ alBloquear } = {}) {
  const { solicitar } = useAutenticacion()
  const [consulta, establecerConsulta] = useState({ cargando: true, obligaciones: [], error: '' })
  const [seleccionado, establecerSeleccionado] = useState('')
  const [operacionBloqueada, establecerOperacionBloqueada] = useState(false)
  const [intento, establecerIntento] = useState(0)
  const bloquear = useCallback((valor) => { establecerOperacionBloqueada(valor); alBloquear?.(valor) }, [alBloquear])
  const actualizarObligacion = useCallback((obligacionActualizada) => {
    establecerConsulta((actual) => ({
      ...actual,
      obligaciones: actual.obligaciones.map((obligacion) => obligacion.id === obligacionActualizada.id ? obligacionActualizada : obligacion),
    }))
  }, [])
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
    {consulta.cargando && <p role="status">Cargando obligaciones…</p>}
    {consulta.error && <><p className="error-message" role="alert">{consulta.error}</p><button type="button" disabled={operacionBloqueada} onClick={actualizarObligaciones}>Reintentar obligaciones</button></>}
    {!consulta.cargando && !consulta.error && <>
      <div className="abono-seleccion">
        <div className="field">
          <label htmlFor="obligacion-abono">Pago pendiente</label>
          <select id="obligacion-abono" required disabled={operacionBloqueada} value={seleccionado} onChange={(evento) => establecerSeleccionado(evento.target.value)} aria-describedby="ayuda-obligacion-abono">
            <option value="">Selecciona una obligación</option>
            {disponibles.map((obligacion) => <option key={obligacion.id} value={obligacion.id}>
              {obligacion.concepto} — {formatearImporte(obligacion.saldo_pendiente)}
            </option>)}
          </select>
          <small id="ayuda-obligacion-abono" className="description">Selecciona una obligación con saldo mayor que cero.</small>
        </div>
        <button type="button" className="secondary-button" disabled={operacionBloqueada} onClick={actualizarObligaciones}>Actualizar obligaciones</button>
      </div>
      {disponibles.length === 0 && <p className="empty-state" role="status">{consulta.obligaciones.length ? 'Todas las obligaciones están pagadas. No hay saldos disponibles para abonar.' : 'Todavía no hay obligaciones registradas. Registra primero un pago pendiente.'}</p>}
      {seleccionado && <DatosObligacionAbono key={seleccionado} identificador={seleccionado} alBloquear={bloquear} alActualizarObligacion={actualizarObligacion} />}
    </>}
  </section>
}
