import { useCallback, useEffect, useRef, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { formatearImporte } from '../lib/formatearImporte'
import { convertirACentimos, obtenerMaximoAbono } from '../lib/validarAbono'
import { actualizarEstadoObligacion, esObligacionValida, fechaActualLima, formatearFechaObligacion, seleccionarPagosInicio } from '../lib/pagosInicio'
import { DatosObligacionAbono } from './FormularioAbono'
import { ConsultaHistorialObligacion } from './HistorialPagos'
import { ResumenMensualIntegrado } from '../gerente/ResumenMensualIntegrado'
import './PagosInicio.css'

const etiquetasEstado = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', PAGADO: 'Pagado' }
const noBloquear = () => {}
const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function EstadoPago({ obligacion }) {
  return <span className="inicio-estados">
    <span className={`inicio-estado inicio-estado--${obligacion.estado_economico.toLowerCase()}`}>{etiquetasEstado[obligacion.estado_economico]}</span>
    {obligacion.vencida && <span className="inicio-estado inicio-estado--vencida">Vencida</span>}
  </span>
}

function DetalleObligacion({ identificador, puedeRegistrar, alActualizar, alRegistrar, alBloquear, alCerrar }) {
  const { solicitar } = useAutenticacion()
  const [consulta, establecerConsulta] = useState({ cargando: true, obligacion: null, error: '' })
  const [intento, establecerIntento] = useState(0)
  const [bloqueada, establecerBloqueada] = useState(false)
  const [versionHistorial, establecerVersionHistorial] = useState(0)
  const [mostrarRegistro, establecerMostrarRegistro] = useState(false)
  const dialogo = useRef(null)
  const titulo = useRef(null)
  const tituloRegistro = useRef(null)

  useEffect(() => {
    const ventana = dialogo.current
    const desbordamientoAnterior = document.body.style.overflow
    ventana.showModal()
    document.body.style.overflow = 'hidden'
    titulo.current.focus()
    return () => {
      ventana.close()
      document.body.style.overflow = desbordamientoAnterior
    }
  }, [])

  useEffect(() => {
    if (mostrarRegistro) tituloRegistro.current?.focus()
  }, [mostrarRegistro])

  useEffect(() => {
    const controlador = new AbortController()
    solicitar(`/api/obligaciones/${identificador}`, { signal: controlador.signal })
      .then((datos) => {
        if (!esObligacionValida(datos?.obligacion) || datos.obligacion.id !== identificador) throw new Error('El servidor no devolvió un detalle válido de la obligación.')
        if (!controlador.signal.aborted) {
          const obligacion = actualizarEstadoObligacion(datos.obligacion)
          establecerConsulta({ cargando: false, obligacion, error: '' })
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

  function cerrar() {
    if (bloqueada) return
    dialogo.current.close()
    alCerrar()
  }

  const obligacion = consulta.obligacion
  return <dialog ref={dialogo} className="inicio-detalle" aria-labelledby="titulo-detalle-inicio" id="detalle-obligacion-inicio"
    onCancel={(evento) => { evento.preventDefault(); cerrar() }}
    onKeyDown={(evento) => {
      if (evento.key === 'Escape') { evento.preventDefault(); evento.stopPropagation(); cerrar() }
      if (evento.key === 'Tab') {
        const controles = [...evento.currentTarget.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
          .filter((elemento) => elemento.getClientRects().length > 0)
        const primero = controles[0]
        const ultimo = controles.at(-1)
        if (evento.shiftKey && (document.activeElement === primero || document.activeElement === titulo.current)) {
          evento.preventDefault(); (ultimo || titulo.current).focus()
        } else if (!evento.shiftKey && (document.activeElement === ultimo || !primero)) {
          evento.preventDefault(); (primero || titulo.current).focus()
        }
      }
    }}>
    <div className="inicio-detalle-encabezado">
      <h3 ref={titulo} tabIndex={-1} id="titulo-detalle-inicio">Detalle de la obligación #{identificador}</h3>
      <div className="inicio-detalle-acciones">
        {puedeRegistrar && obligacion && convertirACentimos(obligacion.saldo_pendiente) > 0n && !mostrarRegistro &&
          <button type="button" className="inicio-boton-registrar" disabled={bloqueada} onClick={() => establecerMostrarRegistro(true)}>Registrar pago</button>}
        <button type="button" className="secondary-button" disabled={bloqueada} onClick={cerrar}>Cerrar detalles</button>
      </div>
    </div>
    {bloqueada && <p className="notice" role="status">Hay un registro o una confirmación pendiente. Resuélvelo antes de cerrar el detalle.</p>}
    {consulta.cargando && <p role="status">Cargando detalle…</p>}
    {consulta.error && <>
      <p className="error-message" role="alert">{consulta.error}</p>
      <button type="button" onClick={() => { establecerConsulta((actual) => ({ ...actual, cargando: true, error: '' })); establecerIntento((actual) => actual + 1) }}>Reintentar detalle</button>
    </>}
    {obligacion && <>
      {puedeRegistrar && mostrarRegistro && <section className="inicio-registro" aria-labelledby="titulo-pago-directo">
        <h4 ref={tituloRegistro} tabIndex={-1} id="titulo-pago-directo">Registrar pago realizado</h4>
        {convertirACentimos(obligacion.saldo_pendiente) > 0n && <p>Puedes abonar una parte o cancelar el saldo restante. El importe no puede superar {formatearImporte(obtenerMaximoAbono(obligacion.saldo_pendiente))}.</p>}
        <DatosObligacionAbono identificador={identificador} alBloquear={bloquear} alActualizarObligacion={actualizarObligacion}
          alRegistrar={actualizarTrasRegistro} mostrarResumen={false} />
      </section>}
      <dl className="inicio-resumen">
        <div><dt>Concepto</dt><dd>{obligacion.concepto}</dd></div>
        <div><dt>Beneficiario</dt><dd>{obligacion.beneficiario}</dd></div>
        <div><dt>Monto original</dt><dd>{formatearImporte(obligacion.monto_original)}</dd></div>
        <div><dt>Saldo pendiente</dt><dd>{formatearImporte(obligacion.saldo_pendiente)}</dd></div>
        <div><dt>Fecha de vencimiento</dt><dd>{formatearFechaObligacion(obligacion.fecha_limite)}</dd></div>
        <div><dt>Estado del pago</dt><dd><EstadoPago obligacion={obligacion} /></dd></div>
      </dl>
      <h4 className="inicio-titulo-historial">Pagos y comprobantes</h4>
      <ConsultaHistorialObligacion identificador={identificador} actualizacion={versionHistorial} />
      {obligacion.estado_economico === 'PAGADO' && !mostrarRegistro && <p className="notice">Esta obligación ya está pagada. Puedes consultar sus pagos y comprobantes.</p>}
    </>}
  </dialog>
}

export function PagosInicio({ puedeRegistrar = false, mostrarResumen = false, alBloquear = noBloquear, alNuevaDeuda }) {
  const { solicitar } = useAutenticacion()
  const [consulta, establecerConsulta] = useState({ cargando: true, obligaciones: [], error: '' })
  const [intento, establecerIntento] = useState(0)
  const [seleccionado, establecerSeleccionado] = useState(null)
  const [bloqueada, establecerBloqueada] = useState(false)
  const [hoy, establecerHoy] = useState(fechaActualLima)
  const [mesElegido, establecerMesElegido] = useState(null)
  const origenFoco = useRef(null)
  const botonActualizar = useRef(null)

  useEffect(() => {
    const revisarDia = () => establecerHoy(fechaActualLima())
    const temporizador = setInterval(revisarDia, 60000)
    window.addEventListener('focus', revisarDia)
    return () => { clearInterval(temporizador); window.removeEventListener('focus', revisarDia) }
  }, [])

  useEffect(() => {
    const controlador = new AbortController()
    async function cargarListado() {
      if (controlador.signal.aborted) return
      try {
        const datos = await solicitar('/api/obligaciones', { signal: controlador.signal })
        if (!Array.isArray(datos?.obligaciones) || !datos.obligaciones.every(esObligacionValida)) throw new Error('El servidor no devolvió un listado válido de obligaciones.')
        if (!controlador.signal.aborted) establecerConsulta({ cargando: false, obligaciones: datos.obligaciones, error: '' })
      } catch (error) {
        if (!controlador.signal.aborted) establecerConsulta((actual) => ({ ...actual, cargando: false, error: error.message }))
      }
    }
    // Cancela el montaje de comprobación de React antes de enviar la lectura compartida.
    Promise.resolve().then(cargarListado)
    return () => controlador.abort()
  }, [solicitar, intento, hoy])

  const bloquear = useCallback((valor) => { establecerBloqueada(valor); alBloquear(valor) }, [alBloquear])
  useEffect(() => () => alBloquear(false), [alBloquear])

  const actualizarObligacion = useCallback((obligacionActualizada) => {
    establecerConsulta((actual) => ({ ...actual, obligaciones: actual.obligaciones.map((obligacion) =>
      obligacion.id === obligacionActualizada.id ? obligacionActualizada : obligacion) }))
  }, [])
  const actualizarListado = useCallback(() => {
    establecerConsulta((actual) => ({ ...actual, cargando: true, error: '' }))
    establecerIntento((actual) => actual + 1)
  }, [])

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

  function volverAlMesActual() {
    establecerHoy(fechaActualLima())
    establecerMesElegido(null)
  }

  const periodoActual = hoy.slice(0, 7)
  const mes = mesElegido?.periodo === periodoActual ? mesElegido.mes : hoy.slice(5, 7)
  const obligaciones = seleccionarPagosInicio(consulta.obligaciones, hoy, mes)
  const resumenVisible = mostrarResumen && !puedeRegistrar
  const controlesPeriodo = <div className="inicio-periodo-controles">
    <select className="inicio-periodo" aria-label="Mes de los pagos" value={mes} disabled={bloqueada}
      onChange={(evento) => establecerMesElegido({ periodo: periodoActual, mes: evento.target.value })}>
      {meses.map((nombre, indice) => <option key={nombre} value={String(indice + 1).padStart(2, '0')}>{nombre}</option>)}
    </select>
    <button type="button" className="secondary-button" disabled={bloqueada} onClick={volverAlMesActual}>Volver al mes actual</button>
  </div>
  const botonNuevaDeuda = puedeRegistrar && alNuevaDeuda && <button type="button" className="inicio-nueva-deuda"
    aria-label="Agregar nueva deuda" title="Registrar pago pendiente" disabled={bloqueada} onClick={alNuevaDeuda}>
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  </button>
  return <section className="pagos-inicio" aria-labelledby="titulo-pagos-inicio">
    {resumenVisible && <>
      {controlesPeriodo}
      <ResumenMensualIntegrado obligaciones={consulta.obligaciones} mes={mes} hoy={hoy} cargando={consulta.cargando} error={consulta.error} />
    </>}
    <div className="inicio-encabezado">
      <div>{!resumenVisible && controlesPeriodo}<h3 id="titulo-pagos-inicio">Pagos del mes</h3>
        <p>Consulta las obligaciones del mes. En el mes actual también aparecen las deudas vencidas pendientes.</p></div>
      <button ref={botonActualizar} type="button" className="secondary-button" disabled={consulta.cargando || bloqueada} onClick={actualizarListado}>Actualizar listado</button>
    </div>
    {consulta.cargando && <p role="status">{consulta.obligaciones.length ? 'Actualizando pagos del mes…' : 'Cargando pagos del mes…'}</p>}
    {consulta.error && <><p className="error-message" role="alert">{consulta.error}</p>
      <button type="button" disabled={bloqueada} onClick={actualizarListado}>Reintentar consulta</button></>}
    {obligaciones.length === 0 && botonNuevaDeuda && <div className="inicio-tabla-herramientas">{botonNuevaDeuda}</div>}
    {!consulta.cargando && !consulta.error && obligaciones.length === 0 && <p className="empty-state" role="status">No hay obligaciones para el mes seleccionado.</p>}
    {obligaciones.length > 0 && <div className="inicio-tabla-contenedor" role="region" aria-label="Obligaciones del mes" tabIndex={0}>
      <table className="inicio-tabla" role="table">
        <caption><div className="inicio-tabla-cabecera"><span>{obligaciones.length} obligación(es). Pulsa Ver detalles para consultar los datos y abonos del pago.</span>{botonNuevaDeuda}</div></caption>
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
              aria-haspopup="dialog"
              aria-expanded={seleccionado === obligacion.id} aria-controls={seleccionado === obligacion.id ? 'detalle-obligacion-inicio' : undefined}
              onClick={(evento) => { evento.stopPropagation(); seleccionar(obligacion, evento.currentTarget) }}>Ver detalles</button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {seleccionado !== null && <DetalleObligacion key={seleccionado} identificador={seleccionado} puedeRegistrar={puedeRegistrar}
      alActualizar={actualizarObligacion} alRegistrar={actualizarListado} alBloquear={bloquear} alCerrar={cerrarDetalle} />}
  </section>
}
