import { useEffect, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { formatearImporte } from '../lib/formatearImporte'
import { convertirACentimos } from '../lib/validarAbono'
import './HistorialPagos.css'

const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short',
})

function saldoCalculado(historial) {
  const saldo = convertirACentimos(historial.monto_original) - convertirACentimos(historial.total_abonado)
  const absoluto = saldo < 0n ? -saldo : saldo
  return (saldo < 0n ? '-' : '') + absoluto / 100n + '.' + String(absoluto % 100n).padStart(2, '0')
}

function esHistorialValido(historial, identificador) {
  return historial && String(historial.obligacion_id) === String(identificador)
    && typeof historial.concepto === 'string'
    && convertirACentimos(historial.monto_original) !== null
    && convertirACentimos(historial.total_abonado) !== null
    && convertirACentimos(historial.saldo_pendiente) !== null
    && Array.isArray(historial.abonos)
    && historial.abonos.every((abono) => Number.isSafeInteger(abono.id) && abono.id > 0
      && convertirACentimos(abono.monto) !== null && convertirACentimos(abono.monto) > 0n
      && typeof abono.medio_pago === 'string'
      && typeof abono.fecha_registro === 'string' && Number.isFinite(Date.parse(abono.fecha_registro)))
}

function ResumenHistorial({ historial }) {
  return <dl className="historial-resumen">
    <div><dt>Concepto de la obligación</dt><dd>{historial.concepto}</dd></div>
    <div><dt>Monto original</dt><dd>{formatearImporte(historial.monto_original)}</dd></div>
    <div><dt>Total acumulado de abonos</dt><dd>{formatearImporte(historial.total_abonado)}</dd></div>
    <div><dt>Saldo pendiente actual</dt><dd>{formatearImporte(saldoCalculado(historial))}</dd></div>
  </dl>
}

function ComprobanteDelAbono({ abono }) {
  const { solicitar } = useAutenticacion()
  const [abierto, establecerAbierto] = useState(false)
  const [intento, establecerIntento] = useState(0)
  const [consulta, establecerConsulta] = useState({ cargando: false, direccion: '', error: '' })

  useEffect(() => {
    if (!abierto) return
    const controlador = new AbortController()
    let direccion = ''
    solicitar('/api/abonos/' + abono.id + '/comprobante/archivo', { respuestaComo: 'blob', signal: controlador.signal })
      .then((archivo) => {
        if (controlador.signal.aborted) return
        if (!(archivo instanceof Blob) || !['image/png', 'image/jpeg'].includes(archivo.type) || archivo.size === 0) {
          throw new Error('El servidor no devolvió una imagen válida del comprobante.')
        }
        direccion = URL.createObjectURL(archivo)
        establecerConsulta({ cargando: false, direccion, error: '' })
      })
      .catch((fallo) => {
        if (!controlador.signal.aborted) establecerConsulta({ cargando: false, direccion: '', error: fallo.message })
      })
    return () => {
      controlador.abort()
      if (direccion) URL.revokeObjectURL(direccion)
    }
  }, [abierto, intento, abono.id, solicitar])

  if (!abierto) return <button type="button" className="secondary-button" onClick={() => {
    establecerConsulta({ cargando: true, direccion: '', error: '' })
    establecerAbierto(true)
  }}>Ver comprobante</button>
  return <section className="historial-comprobante" aria-label={'Comprobante del abono #' + abono.id}>
    <button type="button" className="secondary-button" onClick={() => establecerAbierto(false)}>Cerrar comprobante</button>
    {consulta.cargando && <p role="status">Cargando comprobante…</p>}
    {consulta.error && <>
      <p className="error-message" role="alert">{consulta.error}</p>
      <button type="button" onClick={() => {
        establecerConsulta({ cargando: true, direccion: '', error: '' })
        establecerIntento((actual) => actual + 1)
      }}>Reintentar comprobante</button>
    </>}
    {consulta.direccion && <img src={consulta.direccion} alt={'Comprobante del abono #' + abono.id}
      onError={() => establecerConsulta({ cargando: false, direccion: '', error: 'No se pudo visualizar el comprobante.' })} />}
  </section>
}

export function PresentacionHistorial({ historial }) {
  const abonosOrdenados = [...historial.abonos].sort((primero, segundo) =>
    Date.parse(segundo.fecha_registro) - Date.parse(primero.fecha_registro) || segundo.id - primero.id)
  const inconsistente = historial.resumen_consistente === false || saldoCalculado(historial) !== historial.saldo_pendiente
  return <>
    <ResumenHistorial historial={historial} />
    {inconsistente && <p className="notice" role="alert">
      {historial.advertencia || 'El saldo registrado no coincide con los abonos del historial.'}
      {' Saldo registrado: ' + formatearImporte(historial.saldo_pendiente) + '. Se muestra el saldo calculado a partir de los abonos.'}
    </p>}
    {abonosOrdenados.length === 0 ? <p className="empty-state" role="status">Esta obligación todavía no tiene abonos.</p> : <>
      <h4>Pagos realizados</h4>
      <p className="description">Del más reciente al más antiguo. Fechas y horas en America/Lima.</p>
      <ol className="historial-movimientos" aria-label="Historial de abonos">
        {abonosOrdenados.map((abono) => <li key={abono.id}>
          <div className="historial-movimiento-cabecera">
            <strong>{formatearImporte(abono.monto)}</strong>
            <span>Fecha de registro: <time dateTime={abono.fecha_registro}>{formatoFecha.format(new Date(abono.fecha_registro))}</time></span>
          </div>
          <p>Medio de pago: <strong>{abono.medio_pago}</strong></p>
          {!abono.tiene_comprobante ? <p className="description">Sin comprobante.</p>
            : abono.puede_descargar_comprobante ? <ComprobanteDelAbono abono={abono} />
              : <p className="description">Comprobante adjunto. No tienes permiso para consultarlo.</p>}
        </li>)}
      </ol>
    </>}
  </>
}

function ConsultaHistorialObligacion({ identificador }) {
  const { solicitar } = useAutenticacion()
  const [estado, establecerEstado] = useState({ cargando: true, historial: null, error: '' })
  const [intento, establecerIntento] = useState(0)
  useEffect(() => {
    const controlador = new AbortController()
    solicitar('/api/obligaciones/' + identificador + '/historial', { signal: controlador.signal })
      .then((datos) => {
        if (!esHistorialValido(datos?.historial, identificador)) throw new Error('El servidor no devolvió un historial válido de la obligación.')
        if (!controlador.signal.aborted) establecerEstado({ cargando: false, historial: datos.historial, error: '' })
      })
      .catch((fallo) => {
        if (!controlador.signal.aborted) establecerEstado((actual) => ({ ...actual, cargando: false, error: fallo.message }))
      })
    return () => controlador.abort()
  }, [identificador, intento, solicitar])

  function actualizarHistorial() {
    establecerEstado((actual) => ({ ...actual, cargando: true, error: '' }))
    establecerIntento((actual) => actual + 1)
  }

  return <section className="historial-detalle" aria-label="Historial de la obligación" aria-busy={estado.cargando}>
    <button type="button" className="secondary-button" disabled={estado.cargando} onClick={actualizarHistorial}>Actualizar historial</button>
    {estado.cargando && <p role="status">{estado.historial ? 'Actualizando historial…' : 'Cargando historial…'}</p>}
    {estado.error && <>
      <p className="error-message" role="alert">{estado.error}</p>
      <button type="button" onClick={actualizarHistorial}>Reintentar historial</button>
    </>}
    {estado.historial && <PresentacionHistorial historial={estado.historial} />}
  </section>
}

export function HistorialPagos() {
  const { solicitar } = useAutenticacion()
  const [estado, establecerEstado] = useState({ cargando: true, obligaciones: [], error: '' })
  const [seleccionado, establecerSeleccionado] = useState('')
  const [intento, establecerIntento] = useState(0)
  useEffect(() => {
    const controlador = new AbortController()
    solicitar('/api/obligaciones', { signal: controlador.signal })
      .then((datos) => {
        if (!Array.isArray(datos?.obligaciones)) throw new Error('El servidor no devolvió un listado válido de obligaciones.')
        if (!controlador.signal.aborted) establecerEstado({ cargando: false, obligaciones: datos.obligaciones, error: '' })
      })
      .catch((fallo) => {
        if (!controlador.signal.aborted) establecerEstado({ cargando: false, obligaciones: [], error: fallo.message })
      })
    return () => controlador.abort()
  }, [intento, solicitar])

  function actualizarObligaciones() {
    establecerSeleccionado('')
    establecerEstado({ cargando: true, obligaciones: [], error: '' })
    establecerIntento((actual) => actual + 1)
  }

  return <section className="historial-pagos" aria-labelledby="titulo-historial">
    <h3 id="titulo-historial">Consultar historial de pagos</h3>
    <p className="description">Selecciona una obligación para consultar sus pagos realizados, incluidas las obligaciones pagadas.</p>
    {estado.cargando && <p role="status">Cargando obligaciones…</p>}
    {estado.error && <>
      <p className="error-message" role="alert">{estado.error}</p>
      <button type="button" onClick={actualizarObligaciones}>Reintentar obligaciones</button>
    </>}
    {!estado.cargando && !estado.error && <>
      <div className="historial-seleccion">
        <div className="field"><label htmlFor="obligacion-historial">Obligación a consultar</label>
          <select id="obligacion-historial" value={seleccionado} onChange={(evento) => establecerSeleccionado(evento.target.value)}>
            <option value="">Selecciona una obligación</option>
            {estado.obligaciones.map((obligacion) => <option key={obligacion.id} value={obligacion.id}>{obligacion.concepto} — {obligacion.estado_economico}</option>)}
          </select>
        </div>
        <button type="button" className="secondary-button" onClick={actualizarObligaciones}>Actualizar obligaciones</button>
      </div>
      {estado.obligaciones.length === 0 && <p className="empty-state" role="status">Todavía no hay obligaciones registradas para consultar.</p>}
      {seleccionado && <ConsultaHistorialObligacion key={seleccionado} identificador={seleccionado} />}
    </>}
  </section>
}
