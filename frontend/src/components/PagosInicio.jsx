import { useCallback, useEffect, useRef, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { formatearImporte } from '../lib/formatearImporte'
import { convertirACentimos } from '../lib/validarAbono'
import { actualizarEstadoObligacion, esObligacionValida, fechaActualLima, formatearFechaObligacion, seleccionarPagosInicio } from '../lib/pagosInicio'
import { DatosObligacionAbono } from './FormularioAbono'
import { ConsultaHistorialObligacion } from './HistorialPagos'
import './PagosInicio.css'

const etiquetasEstado = { PENDIENTE: 'Pendiente · sin abonos', PARCIAL: 'Parcial · con saldo', PAGADO: 'Pagado' }
const noBloquear = () => {}

function EstadoPago({ obligacion }) {
  return <span className="inicio-estados">
    <span className={`inicio-estado inicio-estado--${obligacion.estado_economico.toLowerCase()}`}>{etiquetasEstado[obligacion.estado_economico]}</span>
    {obligacion.vencida && <span className="inicio-estado inicio-estado--vencida">Vencida · pendiente de cancelar</span>}
  </span>
}

function DetalleObligacion({ identificador, puedeRegistrar, alActualizar, alRegistrar, alBloquear, alCerrar }) {
  const { solicitar } = useAutenticacion()
  const [consulta, establecerConsulta] = useState({ cargando: true, obligacion: null, error: '', permitiaAbonos: false })
  const [intento, establecerIntento] = useState(0)
  const [bloqueada, establecerBloqueada] = useState(false)
  const [versionHistorial, establecerVersionHistorial] = useState(0)
  const titulo = useRef(null)

  useEffect(() => { titulo.current.focus() }, [])

  useEffect(() => {
    const controlador = new AbortController()
    solicitar(`/api/obligaciones/${identificador}`, { signal: controlador.signal })
      .then((datos) => {
        if (!esObligacionValida(datos?.obligacion) || datos.obligacion.id !== identificador) throw new Error('El servidor no devolvió un detalle válido de la obligación.')
        if (!controlador.signal.aborted) {
          const obligacion = actualizarEstadoObligacion(datos.obligacion)
          establecerConsulta({ cargando: false, obligacion, error: '', permitiaAbonos: convertirACentimos(obligacion.saldo_pendiente) > 0n })
          alActualizar(obligacion)
        }
      })
      .catch((error) => { if (!controlador.signal.aborted) establecerConsulta((actual) => ({ ...actual, cargando: false, error: error.message })) })
    return () => controlador.abort()
  }, [identificador, intento, solicitar, alActualizar])

  const actualizarObligacion = useCallback((obligacion) => {
    const actualizada = actualizarEstadoObligacion(obligacion)
    establecerConsulta((actual) => ({ ...actual, obligacion: actualizada }))
    alActualizar(actualizada)
  }, [alActualizar])

  const bloquear = useCallback((valor) => {
    establecerBloqueada(valor)
    alBloquear(valor)
  }, [alBloquear])

  const actualizarTrasRegistro = useCallback(() => {
    establecerVersionHistorial((actual) => actual + 1)
    alRegistrar()
  }, [alRegistrar])

  const obligacion = consulta.obligacion
  return <section className="inicio-detalle" aria-labelledby="titulo-detalle-inicio" id="detalle-obligacion-inicio"
    onKeyDown={(evento) => {
      if (evento.key === 'Escape' && !bloqueada) { evento.stopPropagation(); alCerrar() }
    }}>
    <div className="inicio-detalle-encabezado">
      <h3 ref={titulo} tabIndex={-1} id="titulo-detalle-inicio">Detalle de la obligación #{identificador}</h3>
      <button type="button" className="secondary-button" disabled={bloqueada} onClick={alCerrar}>Cerrar detalles</button>
    </div>
    {bloqueada && <p className="notice" role="status">Hay un registro o una confirmación pendiente. Resuélvelo antes de cerrar el detalle.</p>}
    {consulta.cargando && <p role="status">Cargando detalle…</p>}
    {consulta.error && <>
      <p className="error-message" role="alert">{consulta.error}</p>
      <button type="button" onClick={() => { establecerConsulta((actual) => ({ ...actual, cargando: true, error: '' })); establecerIntento((actual) => actual + 1) }}>Reintentar detalle</button>
    </>}
    {obligacion && <>
      <dl className="inicio-resumen">
        <div><dt>Concepto</dt><dd>{obligacion.concepto}</dd></div>
        <div><dt>Beneficiario</dt><dd>{obligacion.beneficiario}</dd></div>
        <div><dt>Monto original</dt><dd>{formatearImporte(obligacion.monto_original)}</dd></div>
        <div><dt>Saldo pendiente</dt><dd>{formatearImporte(obligacion.saldo_pendiente)}</dd></div>
        <div><dt>Fecha de vencimiento</dt><dd>{formatearFechaObligacion(obligacion.fecha_limite)}</dd></div>
        <div><dt>Estado del pago</dt><dd><EstadoPago obligacion={obligacion} /></dd></div>
      </dl>
      {puedeRegistrar && consulta.permitiaAbonos ? <section className="inicio-registro" aria-labelledby="titulo-pago-directo">
        <h4 id="titulo-pago-directo">Registrar pago realizado</h4>
        <p>Registra el importe que ya pagaste fuera de SGCP. Puedes abonar una parte o cancelar todo el saldo.</p>
        <DatosObligacionAbono identificador={identificador} alBloquear={bloquear} alActualizarObligacion={actualizarObligacion}
          alRegistrar={actualizarTrasRegistro} mostrarResumen={false} />
      </section> : obligacion.estado_economico === 'PAGADO' && <p className="notice">Esta obligación ya está pagada. Puedes consultar sus pagos y comprobantes debajo.</p>}
      <h4 className="inicio-titulo-historial">Pagos y comprobantes</h4>
      <ConsultaHistorialObligacion identificador={identificador} actualizacion={versionHistorial} />
    </>}
  </section>
}

export function PagosInicio({ puedeRegistrar = false, alBloquear = noBloquear, consultaExterna }) {
  const { solicitar } = useAutenticacion()
  const [consultaInterna, establecerConsulta] = useState({ cargando: true, obligaciones: [], error: '' })
  const consulta = consultaExterna ?? consultaInterna
  const usaConsultaExterna = Boolean(consultaExterna)
  const [intento, establecerIntento] = useState(0)
  const [seleccionado, establecerSeleccionado] = useState(null)
  const [bloqueada, establecerBloqueada] = useState(false)
  const [hoy, establecerHoy] = useState(fechaActualLima)
  const origenFoco = useRef(null)
  const botonActualizar = useRef(null)

  useEffect(() => {
    const revisarDia = () => establecerHoy(fechaActualLima())
    const temporizador = setInterval(revisarDia, 60000)
    window.addEventListener('focus', revisarDia)
    return () => { clearInterval(temporizador); window.removeEventListener('focus', revisarDia) }
  }, [])

  useEffect(() => {
    if (usaConsultaExterna) return undefined
    const controlador = new AbortController()
    solicitar('/api/obligaciones', { signal: controlador.signal })
      .then((datos) => {
        if (!Array.isArray(datos?.obligaciones) || !datos.obligaciones.every(esObligacionValida)) throw new Error('El servidor no devolvió un listado válido de obligaciones.')
        if (!controlador.signal.aborted) establecerConsulta({ cargando: false, obligaciones: datos.obligaciones, error: '' })
      })
      .catch((error) => {
        if (!controlador.signal.aborted) establecerConsulta((actual) => ({ ...actual, cargando: false, error: error.message }))
      })
    return () => controlador.abort()
  }, [solicitar, intento, hoy, usaConsultaExterna])

  const bloquear = useCallback((valor) => { establecerBloqueada(valor); alBloquear(valor) }, [alBloquear])
  useEffect(() => () => alBloquear(false), [alBloquear])

  const actualizarObligacion = useCallback((obligacionActualizada) => {
    establecerConsulta((actual) => ({ ...actual, obligaciones: actual.obligaciones.map((obligacion) =>
      obligacion.id === obligacionActualizada.id ? obligacionActualizada : obligacion) }))
  }, [])
  const actualizarListado = useCallback(() => {
    if (consultaExterna) { consultaExterna.actualizar(); return }
    establecerConsulta((actual) => ({ ...actual, cargando: true, error: '' }))
    establecerIntento((actual) => actual + 1)
  }, [consultaExterna])

  function seleccionar(obligacion, elemento) {
    if (bloqueada) return
    if (seleccionado === obligacion.id) { document.getElementById('titulo-detalle-inicio')?.focus(); return }
    origenFoco.current = elemento
    establecerSeleccionado(obligacion.id)
  }

  function cerrarDetalle() {
    if (bloqueada) return
    establecerSeleccionado(null)
    const destino = origenFoco.current?.isConnected ? origenFoco.current : botonActualizar.current
    destino?.focus()
  }

  const fechaConsulta = consultaExterna?.hoy ?? hoy
  const obligaciones = seleccionarPagosInicio(consulta.obligaciones, fechaConsulta)
  const periodo = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', month: 'long', year: 'numeric' })
    .format(new Date(`${fechaConsulta}T12:00:00-05:00`))
  return <section className="pagos-inicio" aria-labelledby="titulo-pagos-inicio">
    <div className="inicio-encabezado">
      <div><p className="inicio-periodo">{periodo}</p><h3 id="titulo-pagos-inicio">Pagos del mes</h3>
        <p>Consulta los compromisos del mes actual y las deudas vencidas pendientes.</p></div>
      <button ref={botonActualizar} type="button" className="secondary-button" disabled={consulta.cargando || bloqueada} onClick={actualizarListado}>Actualizar listado</button>
    </div>
    {consulta.cargando && <p role="status">{consulta.obligaciones.length ? 'Actualizando pagos del mes…' : 'Cargando pagos del mes…'}</p>}
    {consulta.error && <><p className="error-message" role="alert">{consulta.error}</p>
      <button type="button" disabled={bloqueada} onClick={actualizarListado}>Reintentar consulta</button></>}
    {!consulta.cargando && !consulta.error && obligaciones.length === 0 && <p className="empty-state" role="status">No hay obligaciones del mes ni deudas vencidas pendientes.</p>}
    {obligaciones.length > 0 && <div className="inicio-tabla-contenedor" role="region" aria-label="Obligaciones del mes y vencidas" tabIndex={0}>
      <table className="inicio-tabla" role="table">
        <caption>{obligaciones.length} obligación(es). Selecciona una fila o pulsa Ver detalles.</caption>
        <thead role="rowgroup"><tr role="row">{['Concepto', 'Beneficiario', 'Monto original', 'Saldo pendiente', 'Vencimiento', 'Estado del pago', 'Acciones'].map((texto) => <th role="columnheader" key={texto} scope="col">{texto}</th>)}</tr></thead>
        <tbody role="rowgroup">{obligaciones.map((obligacion) => <tr role="row" key={obligacion.id} className={seleccionado === obligacion.id ? 'inicio-fila--seleccionada' : ''}
          onClick={(evento) => seleccionar(obligacion, evento.currentTarget.querySelector('button'))}>
          <th role="rowheader" scope="row">{obligacion.concepto}<small>#{obligacion.id}</small></th>
          <td role="cell" data-etiqueta="Beneficiario">{obligacion.beneficiario}</td>
          <td role="cell" data-etiqueta="Monto original" className="inicio-importe">{formatearImporte(obligacion.monto_original)}</td>
          <td role="cell" data-etiqueta="Saldo pendiente" className="inicio-importe">{formatearImporte(obligacion.saldo_pendiente)}</td>
          <td role="cell" data-etiqueta="Vencimiento">{formatearFechaObligacion(obligacion.fecha_limite)}</td>
          <td role="cell" data-etiqueta="Estado del pago"><EstadoPago obligacion={obligacion} /></td>
          <td role="cell" data-etiqueta="Acciones"><div className="inicio-acciones-fila">
            <button type="button" className="secondary-button" disabled={bloqueada} aria-label={`Ver detalles de ${obligacion.concepto} (#${obligacion.id})`}
              aria-expanded={seleccionado === obligacion.id} aria-controls={seleccionado === obligacion.id ? 'detalle-obligacion-inicio' : undefined}
              onClick={(evento) => { evento.stopPropagation(); seleccionar(obligacion, evento.currentTarget) }}>Ver detalles</button>
            {puedeRegistrar && convertirACentimos(obligacion.saldo_pendiente) > 0n && <button type="button" disabled={bloqueada}
              aria-label={`Registrar pago de ${obligacion.concepto} (#${obligacion.id})`}
              onClick={(evento) => { evento.stopPropagation(); seleccionar(obligacion, evento.currentTarget) }}>Registrar pago</button>}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {seleccionado !== null && <DetalleObligacion key={seleccionado} identificador={seleccionado} puedeRegistrar={puedeRegistrar}
      alActualizar={actualizarObligacion} alRegistrar={actualizarListado} alBloquear={bloquear} alCerrar={cerrarDetalle} />}
  </section>
}
