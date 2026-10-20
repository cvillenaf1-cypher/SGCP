import { Link } from 'react-router-dom'
import { IconoGerente } from './IconoGerente'
import './alertasVencidas.css'

export function ResumenAlertasVencidas({ consulta }) {
  const { cargando, error, vencidas, vencenHoy } = consulta
  return <section className={`resumen-alertas ${!error && vencidas.length ? 'resumen-alertas--vencidas' : ''}`} aria-labelledby="titulo-aviso-alertas">
    <IconoGerente nombre="aviso" />
    <div>
      <h3 id="titulo-aviso-alertas">Alertas de pagos vencidos</h3>
      {cargando ? <p>Comprobando compromisos atrasados…</p> : error
        ? <p>No se pudieron comprobar las alertas. Revisa el error del listado e intenta actualizarlo.</p>
        : <div aria-live="polite">
          <p>{vencidas.length ? `${vencidas.length} ${vencidas.length === 1 ? 'compromiso atrasado' : 'compromisos atrasados'} con saldo pendiente.` : 'No existen compromisos atrasados.'}</p>
          {vencenHoy.length > 0 && <p>Vence hoy: {vencenHoy.length} {vencenHoy.length === 1 ? 'compromiso' : 'compromisos'}.</p>}
        </div>}
    </div>
    <Link to="/gerente/alertas-vencidas">Ver alertas de pagos vencidos <span aria-hidden="true">→</span></Link>
  </section>
}
