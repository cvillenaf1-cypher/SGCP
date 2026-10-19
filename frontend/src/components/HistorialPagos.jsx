import { useEffect, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { formatearImporte } from '../lib/formatearImporte'
import { ejemplosHistorial } from '../datos/ejemplosHistorial'
import './HistorialPagos.css'

function ResumenHistorial({ concepto, montoOriginal, totalAbonado, saldoPendiente }) {
  return <dl className="historial-resumen">
    <div><dt>Concepto de la obligación</dt><dd>{concepto}</dd></div>
    <div><dt>Monto original</dt><dd>{formatearImporte(montoOriginal)}</dd></div>
    <div><dt>Total acumulado de abonos</dt><dd>{totalAbonado === undefined ? 'Pendiente de consulta del historial' : formatearImporte(totalAbonado)}</dd></div>
    <div><dt>Saldo pendiente actual</dt><dd>{formatearImporte(saldoPendiente)}</dd></div>
  </dl>
}

export function PresentacionHistorial({ historial }) {
  const abonosOrdenados = [...historial.abonos].sort((primero, segundo) => Date.parse(segundo.fechaHora) - Date.parse(primero.fechaHora) || segundo.identificador - primero.identificador)
  return <>
    <ResumenHistorial {...historial} />
    {abonosOrdenados.length === 0 ? <p className="empty-state" role="status">Esta obligación todavía no tiene abonos.</p> : <>
      <p className="description">Del más reciente al más antiguo. Fechas y horas en America/Lima.</p>
      <ol className="historial-movimientos" aria-label="Historial de abonos">
        {abonosOrdenados.map((abono) => <li key={abono.identificador}>
          <div className="historial-movimiento-cabecera">
            <strong>{formatearImporte(abono.monto)}</strong>
            <time dateTime={abono.fechaHora}>{new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(abono.fechaHora))}</time>
          </div>
          <p>Medio de pago: <strong>{abono.medioPago}</strong></p>
          <p className="description">{abono.tieneComprobante ? 'Comprobante indicado en este ejemplo. Su visualización requiere la ruta autorizada del backend.' : 'Sin comprobante.'}</p>
        </li>)}
      </ol>
    </>}
  </>
}

function ConsultaHistorialObligacion({ identificador }) {
  const { solicitar } = useAutenticacion()
  const [estado, establecerEstado] = useState({ cargando: true, obligacion: null, error: '' })
  const [intento, establecerIntento] = useState(0)
  useEffect(() => {
    const controlador = new AbortController()
    solicitar(`/api/obligaciones/${identificador}`, { signal: controlador.signal })
      .then((datos) => {
        if (!datos?.obligacion) throw new Error('El servidor no devolvió el detalle de la obligación.')
        if (!controlador.signal.aborted) establecerEstado({ cargando: false, obligacion: datos.obligacion, error: '' })
      })
      .catch((fallo) => { if (!controlador.signal.aborted) establecerEstado({ cargando: false, obligacion: null, error: fallo.message }) })
    return () => controlador.abort()
  }, [identificador, intento, solicitar])
  if (estado.cargando) return <p role="status">Cargando datos de la obligación…</p>
  if (estado.error) return <><p className="error-message" role="alert">{estado.error}</p><button type="button" onClick={() => { establecerEstado({ cargando: true, obligacion: null, error: '' }); establecerIntento(intento + 1) }}>Reintentar detalle</button></>
  const obligacion = estado.obligacion
  return <>
    <ResumenHistorial concepto={obligacion.concepto} montoOriginal={obligacion.monto_original} saldoPendiente={obligacion.saldo_pendiente} />
    <p className="notice" role="status">Los datos de la obligación son reales. La consulta del historial de abonos está pendiente de la integración del backend. No se puede confirmar cuántos abonos existen ni su total acumulado.</p>
  </>
}

export function HistorialPagos() {
  const { solicitar } = useAutenticacion()
  const [estado, establecerEstado] = useState({ cargando: true, obligaciones: [], error: '' })
  const [seleccionado, establecerSeleccionado] = useState('')
  const [intento, establecerIntento] = useState(0)
  const [mostrarEjemplo, establecerMostrarEjemplo] = useState(false)
  const [ejemplo, establecerEjemplo] = useState('con-abonos')
  useEffect(() => {
    const controlador = new AbortController()
    solicitar('/api/obligaciones', { signal: controlador.signal })
      .then((datos) => {
        if (!Array.isArray(datos?.obligaciones)) throw new Error('El servidor no devolvió un listado válido de obligaciones.')
        if (!controlador.signal.aborted) establecerEstado({ cargando: false, obligaciones: datos.obligaciones, error: '' })
      })
      .catch((fallo) => { if (!controlador.signal.aborted) establecerEstado({ cargando: false, obligaciones: [], error: fallo.message }) })
    return () => controlador.abort()
  }, [intento, solicitar])

  function actualizarObligaciones() {
    establecerSeleccionado('')
    establecerEstado({ cargando: true, obligaciones: [], error: '' })
    establecerIntento(intento + 1)
  }

  return <section className="historial-pagos" aria-labelledby="titulo-historial">
    <h3 id="titulo-historial">Consultar historial de pagos</h3>
    <p className="description">Consulta de solo lectura de los abonos de una obligación, incluidas las pagadas.</p>
    <p className="notice">Historial pendiente de integración. El backend disponible permite consultar obligaciones, pero todavía no sus abonos ni comprobantes.</p>
    <button type="button" className="secondary-button" aria-pressed={mostrarEjemplo} onClick={() => establecerMostrarEjemplo(!mostrarEjemplo)}>{mostrarEjemplo ? 'Volver a obligaciones reales' : 'Ver ejemplo visual del historial'}</button>
    {mostrarEjemplo ? <section aria-label="Ejemplo visual sin conexión al historial">
      <p className="notice">DATOS DE EJEMPLO: no corresponden a MySQL ni a la obligación seleccionada. No se guarda ningún movimiento.</p>
      <div className="field"><label htmlFor="ejemplo-historial">Ejemplo de historial</label>
        <select id="ejemplo-historial" value={ejemplo} onChange={(evento) => establecerEjemplo(evento.target.value)}>
          <option value="con-abonos">Con varios abonos</option><option value="sin-abonos">Sin abonos</option>
        </select>
      </div>
      <PresentacionHistorial historial={ejemplosHistorial.find((datos) => datos.identificador === ejemplo)} />
    </section> : <>
      {estado.cargando && <p role="status">Cargando obligaciones…</p>}
      {estado.error && <><p className="error-message" role="alert">{estado.error}</p><button type="button" onClick={actualizarObligaciones}>Reintentar obligaciones</button></>}
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
    </>}
  </section>
}
