import { useEffect, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { formatearImporte } from '../lib/formatearImporte'
import './ListadoPagosPendientes.css'

const etiquetasEstado = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', PAGADO: 'Pagado' }
const filtros = [['', 'Todos'], ['pendiente', 'Pendiente'], ['parcial', 'Parcial'], ['pagado', 'Pagado'], ['vencido', 'Vencido']]

function formatearFecha(fecha) {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

function EstadoObligacion({ obligacion }) {
  return <span className="consulta-estados">
    <span className={`consulta-estado consulta-estado-${obligacion.estado_economico.toLowerCase()}`}>{etiquetasEstado[obligacion.estado_economico]}</span>
    {obligacion.vencida && <span className="consulta-vencida">Vencida</span>}
  </span>
}

function DetallePagoPendiente({ identificador }) {
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

  const obligacion = estado.obligacion
  return <section className="consulta-detalle" aria-labelledby="titulo-detalle" aria-busy={estado.cargando}>
    <h4 id="titulo-detalle">Detalle del pago seleccionado</h4>
    {estado.cargando && <p role="status">Cargando detalle…</p>}
    {estado.error && <><p className="error-message" role="alert">{estado.error}</p><button type="button" onClick={() => { establecerEstado({ cargando: true, obligacion: null, error: '' }); establecerIntento(intento + 1) }}>Reintentar detalle</button></>}
    {obligacion && <dl>
      <div><dt>Concepto</dt><dd>{obligacion.concepto}</dd></div>
      <div><dt>Beneficiario</dt><dd>{obligacion.beneficiario}</dd></div>
      <div><dt>Monto original</dt><dd>{formatearImporte(obligacion.monto_original)}</dd></div>
      <div><dt>Saldo pendiente</dt><dd>{formatearImporte(obligacion.saldo_pendiente)}</dd></div>
      <div><dt>Estado económico y vencimiento</dt><dd><EstadoObligacion obligacion={obligacion} /></dd></div>
      <div><dt>Fecha límite</dt><dd>{formatearFecha(obligacion.fecha_limite)}</dd></div>
      <div><dt>Fecha de registro (Lima)</dt><dd>{new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(obligacion.fecha_registro))}</dd></div>
    </dl>}
  </section>
}

export function ListadoPagosPendientes() {
  const { solicitar } = useAutenticacion()
  const [filtro, establecerFiltro] = useState('')
  const [intento, establecerIntento] = useState(0)
  const [seleccionado, establecerSeleccionado] = useState(null)
  const [estado, establecerEstado] = useState({ cargando: true, obligaciones: [], error: '' })

  useEffect(() => {
    const controlador = new AbortController()
    solicitar(`/api/obligaciones${filtro ? `?filtro=${filtro}` : ''}`, { signal: controlador.signal })
      .then((datos) => {
        if (!Array.isArray(datos?.obligaciones)) throw new Error('El servidor no devolvió un listado válido de obligaciones.')
        if (!controlador.signal.aborted) establecerEstado({ cargando: false, obligaciones: datos.obligaciones, error: '' })
      })
      .catch((fallo) => { if (!controlador.signal.aborted) establecerEstado({ cargando: false, obligaciones: [], error: fallo.message }) })
    return () => controlador.abort()
  }, [filtro, intento, solicitar])

  function actualizarListado() {
    establecerEstado({ cargando: true, obligaciones: [], error: '' })
    establecerSeleccionado(null)
    establecerIntento(intento + 1)
  }

  return <section className="consulta-pagos" aria-labelledby="titulo-consulta">
    <h3 id="titulo-consulta">Consultar pagos pendientes</h3>
    <p className="description">Consulta las obligaciones del negocio, incluidas las pagadas. Esta vista es de solo lectura.</p>
    <div className="consulta-controles">
      <div className="field">
        <label htmlFor="filtro-obligaciones">Filtrar pagos</label>
        <select id="filtro-obligaciones" value={filtro} onChange={(evento) => { establecerEstado({ cargando: true, obligaciones: [], error: '' }); establecerFiltro(evento.target.value); establecerSeleccionado(null) }}>
          {filtros.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
        </select>
      </div>
      <button type="button" className="secondary-button" disabled={estado.cargando} onClick={actualizarListado}>Actualizar listado</button>
    </div>
    <p className="description">El vencimiento es adicional al estado económico: una obligación puede estar parcial y vencida.</p>
    <div aria-busy={estado.cargando}>
      {estado.cargando && <p role="status">Cargando pagos pendientes…</p>}
      {estado.error && <><p className="error-message" role="alert">{estado.error}</p><button type="button" onClick={actualizarListado}>Reintentar consulta</button></>}
      {!estado.cargando && !estado.error && (estado.obligaciones.length === 0
        ? <p className="empty-state" role="status">{filtro ? 'No hay pagos que coincidan con el filtro seleccionado.' : 'Todavía no hay pagos registrados en el negocio.'}</p>
        : <div className="consulta-tabla-contenedor" role="region" aria-label="Listado de pagos" tabIndex={0}>
          <table className="consulta-tabla">
            <caption>Obligaciones del negocio — {estado.obligaciones.length} resultado(s)</caption>
            <thead><tr>{['Concepto', 'Beneficiario', 'Monto original', 'Saldo pendiente', 'Estado económico', 'Fecha límite', 'Detalle'].map((titulo) => <th key={titulo} scope="col">{titulo}</th>)}</tr></thead>
            <tbody>{estado.obligaciones.map((obligacion) => <tr key={obligacion.id}>
              <th scope="row">{obligacion.concepto}</th>
              <td>{obligacion.beneficiario}</td>
              <td className="consulta-importe">{formatearImporte(obligacion.monto_original)}</td>
              <td className="consulta-importe">{formatearImporte(obligacion.saldo_pendiente)}</td>
              <td><EstadoObligacion obligacion={obligacion} /></td>
              <td>{formatearFecha(obligacion.fecha_limite)}</td>
              <td><button type="button" className="secondary-button" aria-label={`Ver detalle de ${obligacion.concepto}`} aria-pressed={seleccionado === obligacion.id} onClick={() => establecerSeleccionado(obligacion.id)}>Ver detalle</button></td>
            </tr>)}</tbody>
          </table>
        </div>)}
    </div>
    {seleccionado !== null && <DetallePagoPendiente key={seleccionado} identificador={seleccionado} />}
  </section>
}
