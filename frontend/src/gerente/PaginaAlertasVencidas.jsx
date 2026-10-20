import { Link } from 'react-router-dom'
import { formatearImporte } from '../lib/formatearImporte'
import { formatearFechaObligacion } from '../lib/pagosInicio'
import { IconoGerente } from './IconoGerente'
import { useAlertasVencidas } from './useAlertasVencidas'
import './pagosDelMes.css'
import './alertasVencidas.css'

function ListaAlertas({ obligaciones, delDia = false }) {
  return <ul className="lista-alertas" aria-label={delDia ? 'Compromisos que vencen hoy' : 'Compromisos vencidos'}>
    {obligaciones.map((obligacion) => <li key={obligacion.id}>
      <article className={`tarjeta-alerta ${delDia ? 'tarjeta-alerta--hoy' : ''}`} aria-label={obligacion.concepto}>
        <div className="cabecera-alerta">
          <h4>{obligacion.concepto}</h4>
          <span className="estado-alerta">{delDia ? 'Vence hoy' : 'Vencido'}</span>
        </div>
        <dl>
          <div><dt>Beneficiario</dt><dd>{obligacion.beneficiario}</dd></div>
          <div><dt>Fecha límite</dt><dd><time dateTime={obligacion.fecha_limite}>{formatearFechaObligacion(obligacion.fecha_limite)}</time></dd></div>
          <div><dt>Saldo pendiente</dt><dd className="saldo-alerta">{formatearImporte(obligacion.saldo_pendiente)}</dd></div>
          <div><dt>Días de atraso</dt><dd>{obligacion.diasAtraso} {obligacion.diasAtraso === 1 ? 'día' : 'días'}{!delDia && ' de atraso'}</dd></div>
        </dl>
      </article>
    </li>)}
  </ul>
}

export function PaginaAlertasVencidas() {
  const { cargando, error, vencidas, vencenHoy, actualizar } = useAlertasVencidas()
  return <section className="pagos-del-mes alertas-vencidas" aria-labelledby="titulo-alertas-vencidas" aria-busy={cargando}>
    <Link className="enlace-volver-gerente" to="/gerente"><IconoGerente nombre="flecha" />Volver al panel de gerente</Link>
    <div className="encabezado-consulta">
      <div>
        <p className="etiqueta-gerente">COMPROMISOS QUE REQUIEREN ATENCIÓN</p>
        <h2 id="titulo-alertas-vencidas">Alertas de pagos vencidos</h2>
      </div>
    </div>
    {cargando && <p className="mensaje-consulta" role="status">Consultando alertas de pagos vencidos…</p>}
    {error && <div className="mensaje-consulta mensaje-consulta--error" role="alert">
      <h3>No se pudieron consultar las alertas.</h3><p>{error}</p>
      <button type="button" className="boton-anio" onClick={actualizar}>Reintentar consulta de alertas</button>
    </div>}
    {!cargando && !error && <>
      <section aria-labelledby="titulo-compromisos-atrasados">
        <div className="encabezado-alertas">
          <h3 id="titulo-compromisos-atrasados">Compromisos atrasados</h3>
          <p className="contador-alertas" role="status">{vencidas.length} {vencidas.length === 1 ? 'compromiso atrasado' : 'compromisos atrasados'}</p>
        </div>
        {vencidas.length ? <ListaAlertas obligaciones={vencidas} /> : <p className="mensaje-alertas-vacio">No existen compromisos atrasados.</p>}
      </section>
      {vencenHoy.length > 0 && <section className="avisos-del-dia" aria-labelledby="titulo-avisos-dia">
        <h3 id="titulo-avisos-dia">Avisos del día</h3>
        <p>Estos compromisos vencen hoy y todavía no están atrasados.</p>
        <ListaAlertas obligaciones={vencenHoy} delDia />
      </section>}
    </>}
  </section>
}
