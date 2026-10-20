import { useCallback, useEffect, useRef, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { convertirACentimos, mediosPago, validarAbono } from '../lib/validarAbono'
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
  const [procesandoComprobante, establecerProcesandoComprobante] = useState(false)
  const [mensajeComprobante, establecerMensajeComprobante] = useState('')
  const [falloComprobante, establecerFalloComprobante] = useState('')
  const cargaEnCurso = useRef(false)
  const formulario = useRef(null)
  const envioEnCurso = useRef(false)
  const operacionPendienteRef = useRef(null)

  useEffect(() => {
    alBloquear(guardando || Boolean(operacionPendiente) || procesandoComprobante || Boolean(registroComprobante?.incierto))
    return () => alBloquear(false)
  }, [alBloquear, guardando, operacionPendiente, procesandoComprobante, registroComprobante])

  useEffect(() => {
    if (!guardando && !operacionPendiente && !procesandoComprobante && !registroComprobante?.incierto) return
    const protegerSalida = (evento) => { evento.preventDefault(); evento.returnValue = '' }
    window.addEventListener('beforeunload', protegerSalida)
    return () => window.removeEventListener('beforeunload', protegerSalida)
  }, [guardando, operacionPendiente, procesandoComprobante, registroComprobante])

  useEffect(() => {
    const controlador = new AbortController()
    solicitar(`/api/obligaciones/${identificador}`, { signal: controlador.signal })
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
    if (envioEnCurso.current || registroComprobante) return
    establecerAviso('')
    establecerMensajeError('')

    if (errorComprobante) {
      formulario.current.elements.namedItem('comprobante')?.focus()
      return
    }

    let operacion = operacionPendienteRef.current
    if (!operacion) {
      const nuevosErrores = validarAbono(valores, consulta.obligacion.saldo_pendiente)
      establecerErrores(nuevosErrores)
      if (Object.keys(nuevosErrores).length) {
        formulario.current.elements.namedItem(Object.keys(nuevosErrores)[0])?.focus()
        return
      }
      const claveIdempotencia = globalThis.crypto?.randomUUID?.()
      if (!claveIdempotencia) {
        establecerMensajeError('No se pudo generar una clave segura para esta operación. Recarga la página e intenta nuevamente.')
        return
      }
      operacion = {
        cuerpo: {
          monto: valores.montoAbono,
          medio_pago: valores.medioPago,
          clave_idempotencia: claveIdempotencia,
        },
      }
      operacionPendienteRef.current = operacion
      establecerOperacionPendiente(operacion)
    }

    envioEnCurso.current = true
    establecerGuardando(true)
    try {
      const resultado = await solicitar(`/api/obligaciones/${identificador}/abonos`, {
        method: 'POST',
        body: operacion.cuerpo,
      })
      const saldoResultante = convertirACentimos(resultado?.abono?.saldo_resultante)
      if (
        !resultado?.abono
        || (comprobante && (!Number.isSafeInteger(resultado.abono.id) || resultado.abono.id < 1))
        || String(resultado.abono.obligacion_id) !== String(identificador)
        || saldoResultante === null
        || saldoResultante < 0n
      ) {
        throw new Error('El servidor no devolvió una confirmación válida del abono.')
      }
      operacionPendienteRef.current = null
      establecerOperacionPendiente(null)
      establecerErrores({})
      establecerAviso(resultado.message || 'Abono registrado correctamente.')
      alActualizarObligacion(actualizarEstadoObligacion({ ...consulta.obligacion, saldo_pendiente: resultado.abono.saldo_resultante }))
      alRegistrar?.()
      establecerValores({ montoAbono: '', medioPago: '' })
      actualizarSaldo()
      if (comprobante) {
        const registro = { abonoId: resultado.abono.id, archivo: comprobante, metadatos: null, incierto: false }
        establecerRegistroComprobante(registro)
        await subirComprobante(registro)
      }
    } catch (error) {
      const campos = error?.fields || {}
      const nuevosErrores = {
        ...(campos.monto ? { montoAbono: campos.monto } : {}),
        ...(campos.medio_pago ? { medioPago: campos.medio_pago } : {}),
        ...(campos.id ? { obligacion: campos.id } : {}),
      }
      establecerErrores(nuevosErrores)
      if (error?.status === 409) {
        operacionPendienteRef.current = null
        establecerOperacionPendiente(null)
        establecerMensajeError(error.message || 'El saldo cambió. Se actualizará antes de registrar otro abono.')
        actualizarSaldo()
      } else if (error?.status === 422) {
        operacionPendienteRef.current = null
        establecerOperacionPendiente(null)
        establecerMensajeError(error.message || 'Revisa los datos del abono.')
      } else {
        establecerMensajeError(`${error?.message || 'No se pudo confirmar el registro.'} Reintenta para consultar la misma operación sin duplicarla.`)
      }
    } finally {
      envioEnCurso.current = false
      establecerGuardando(false)
    }
  }


  async function subirComprobante(registro = registroComprobante) {
    if (cargaEnCurso.current || !registro?.archivo || errorComprobante) return
    cargaEnCurso.current = true
    establecerProcesandoComprobante(true)
    establecerFalloComprobante('')
    establecerMensajeComprobante('')
    try {
      const cuerpo = new FormData()
      cuerpo.append('comprobante', registro.archivo)
      const resultado = await solicitar(`/api/abonos/${registro.abonoId}/comprobante`, { method: 'POST', body: cuerpo })
      if (resultado?.comprobante?.abono_id !== registro.abonoId) throw new Error('No se pudo confirmar la asociación del archivo.')
      establecerRegistroComprobante({ ...registro, metadatos: resultado.comprobante, incierto: false })
      establecerMensajeComprobante('Comprobante asociado correctamente.')
      alRegistrar?.()
    } catch (error) {
      // El abono ya se confirmó: aquí nunca se llama al registro monetario.
      const incierto = !error.status || error.status >= 500
      establecerRegistroComprobante({ ...registro, incierto })
      establecerFalloComprobante(`${error.message || 'No se pudo adjuntar el archivo.'} El abono ya está registrado. Reintenta solo el comprobante.`)
    } finally {
      cargaEnCurso.current = false
      establecerProcesandoComprobante(false)
    }
  }

  async function consultarComprobante() {
    if (cargaEnCurso.current) return
    cargaEnCurso.current = true
    establecerProcesandoComprobante(true)
    establecerFalloComprobante('')
    try {
      const resultado = await solicitar(`/api/abonos/${registroComprobante.abonoId}/comprobante`)
      if (resultado.tiene_comprobante && resultado.comprobante?.abono_id === registroComprobante.abonoId) {
        establecerRegistroComprobante({ ...registroComprobante, metadatos: resultado.comprobante, incierto: false })
        establecerMensajeComprobante('El servidor confirma que el abono tiene comprobante.')
        alRegistrar?.()
      } else {
        establecerRegistroComprobante({ ...registroComprobante, incierto: false })
        establecerMensajeComprobante('El servidor todavía no confirma un comprobante asociado. Puedes reintentar el mismo archivo.')
      }
    } catch (error) {
      establecerFalloComprobante(error.message || 'No se pudo consultar el comprobante.')
    } finally {
      cargaEnCurso.current = false
      establecerProcesandoComprobante(false)
    }
  }

  async function descargarComprobante() {
    if (cargaEnCurso.current) return
    cargaEnCurso.current = true
    establecerProcesandoComprobante(true)
    establecerFalloComprobante('')
    try {
      const archivo = await solicitar(`/api/abonos/${registroComprobante.abonoId}/comprobante/archivo`, { respuestaComo: 'blob' })
      const direccion = URL.createObjectURL(archivo)
      try {
        const enlace = document.createElement('a')
        enlace.href = direccion
        enlace.download = registroComprobante.metadatos.nombre
        document.body.append(enlace)
        enlace.click()
        enlace.remove()
      } finally { URL.revokeObjectURL(direccion) }
    } catch (error) {
      establecerFalloComprobante(error.message || 'No se pudo descargar el comprobante.')
    } finally {
      cargaEnCurso.current = false
      establecerProcesandoComprobante(false)
    }
  }

  const panelComprobante = registroComprobante && <section aria-label="Comprobante del abono registrado">
    <p>Abono #{registroComprobante.abonoId} registrado. La carga del archivo no modifica el saldo.</p>
    {procesandoComprobante && <p role="status">Procesando comprobante…</p>}
    {mensajeComprobante && <p role="status">{mensajeComprobante}</p>}
    {falloComprobante && <p role="alert">{falloComprobante}</p>}
    {!registroComprobante.metadatos && <>
      <SelectorComprobante archivo={registroComprobante.archivo} error={errorComprobante}
        deshabilitado={procesandoComprobante || registroComprobante.incierto}
        alCambiar={(archivo, error) => {
          establecerErrorComprobante(error)
          establecerRegistroComprobante({ ...registroComprobante, archivo })
        }} />
      <button type="button" disabled={procesandoComprobante || !registroComprobante.archivo || Boolean(errorComprobante)}
        onClick={() => subirComprobante()}>Reintentar comprobante</button>
    </>}
    <button type="button" disabled={procesandoComprobante} onClick={consultarComprobante}>Consultar comprobante</button>
    {registroComprobante.metadatos && <>
      <p>Comprobante guardado: {registroComprobante.metadatos.nombre}</p>
      <button type="button" disabled={procesandoComprobante} onClick={descargarComprobante}>Descargar comprobante</button>
      <button type="button" disabled={procesandoComprobante} onClick={() => {
        establecerRegistroComprobante(null)
        establecerComprobante(null)
        establecerErrorComprobante('')
        establecerValores({ montoAbono: '', medioPago: '' })
        establecerAviso('')
      }}>Continuar</button>
    </>}
  </section>

  if (consulta.cargando) return <>
    {panelComprobante}
    {aviso && <p className="notice" role="status">{aviso}</p>}
    {mensajeError && <p className="error-message" role="alert">{mensajeError}</p>}
    <p role="status">Consultando el saldo actual…</p>
  </>
  if (consulta.error) return <>
    {panelComprobante}
    {aviso && <p className="notice" role="status">{aviso}</p>}
    {mensajeError && <p className="error-message" role="alert">{mensajeError}</p>}
    <p className="error-message" role="alert">{consulta.error}</p>
    <button type="button" onClick={actualizarSaldo}>Reintentar saldo</button>
  </>

  const obligacion = consulta.obligacion
  const tieneSaldo = convertirACentimos(obligacion.saldo_pendiente) > 0n
  return <>
    {panelComprobante}
    {mostrarResumen && <dl className="abono-resumen">
      <div><dt>Concepto</dt><dd>{obligacion.concepto}</dd></div>
      <div><dt>Beneficiario</dt><dd>{obligacion.beneficiario}</dd></div>
      <div><dt>Monto original</dt><dd>{formatearImporte(obligacion.monto_original)}</dd></div>
      <div><dt>Saldo disponible</dt><dd>{formatearImporte(obligacion.saldo_pendiente)}</dd></div>
      <div><dt>Estado económico</dt><dd>{obligacion.estado_economico}</dd></div>
      {obligacion.vencida && <div><dt>Vencimiento</dt><dd>Vencida</dd></div>}
    </dl>}
    {aviso && <p className="notice" role="status">{aviso}</p>}
    {mensajeError && <p className="error-message" role="alert">{mensajeError}</p>}
    {!tieneSaldo ? <p className="notice" role="alert">Esta obligación ya está pagada. Selecciona otra obligación con saldo disponible.</p> : !registroComprobante && <form ref={formulario} noValidate onSubmit={comprobarAbono}>
      <div className="abono-campos">
        <div className="field">
          <label htmlFor="monto-abono">Monto del abono (S/)</label>
          <input id="monto-abono" name="montoAbono" type="text" inputMode="decimal" required disabled={guardando || Boolean(operacionPendiente)}
            value={valores.montoAbono} onChange={(evento) => { establecerValores({ ...valores, montoAbono: evento.target.value }); establecerAviso(''); establecerMensajeError('') }}
            aria-invalid={Boolean(errores.montoAbono)} aria-describedby={`ayuda-monto-abono${errores.montoAbono ? ' error-monto-abono' : ''}`} />
          <small id="ayuda-monto-abono" className="description">Mayor que cero, hasta dos decimales. Máximo a abonar: {formatearImporte(obligacion.saldo_pendiente)}.</small>
          {errores.montoAbono && <p className="field-error" id="error-monto-abono">{errores.montoAbono}</p>}
        </div>
        <div className="field">
          <label htmlFor="medio-abono">Medio de pago</label>
          <select id="medio-abono" name="medioPago" required value={valores.medioPago} disabled={guardando || Boolean(operacionPendiente)}
            onChange={(evento) => { establecerValores({ ...valores, medioPago: evento.target.value }); establecerAviso(''); establecerMensajeError('') }}
            aria-invalid={Boolean(errores.medioPago)} aria-describedby={`ayuda-medio-abono${errores.medioPago ? ' error-medio-abono' : ''}`}>
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
