import { calcularResumenMensual, formatearCentavos } from './resumenMensual'
import './resumenMensual.css'

const indicadores = [
  ['comprometido', 'Total comprometido', 'Monto original de las obligaciones del mes seleccionado.'],
  ['abonado', 'Total abonado', 'Abonos acumulados de esas obligaciones, registrados en cualquier mes.'],
  ['pendiente', 'Total pendiente', 'Saldo por pagar de las obligaciones del mes seleccionado.'],
  ['vencido', 'Total vencido acumulado', 'Saldo vencido hasta hoy en Perú, de todos los meses. No incluye las que vencen hoy.'],
]

export function ResumenMensualIntegrado({ obligaciones, mes, hoy, cargando, error }) {
  const resumen = !cargando && !error
    ? calcularResumenMensual(obligaciones, mes, Number(hoy.slice(0, 4)), hoy)
    : null

  return <section className="resumen-mensual" aria-labelledby="titulo-resumen-mensual" aria-busy={cargando}>
    <h3 id="titulo-resumen-mensual">Resumen mensual</h3>
    {cargando && <p role="status">Actualizando resumen con el listado…</p>}
    {error && <p>Resumen no disponible. Reintenta la consulta del listado.</p>}
    <div className="indicadores-resumen">
      {indicadores.map(([clave, titulo, descripcion]) => (
        <article className={`tarjeta-indicador${clave === 'vencido' && resumen?.cantidadVencidas > 0 ? ' tarjeta-indicador--vencido' : ''}`} key={clave} aria-label={titulo}>
          <h4>{titulo}</h4>
          <p className="importe-resumen">{resumen ? formatearCentavos(resumen[clave]) : '—'}</p>
          <p>{descripcion}</p>
          {clave === 'vencido' && resumen && <p className="cantidad-vencidas">
            {resumen.cantidadVencidas === 1
              ? '1 obligación vencida con saldo pendiente'
              : `${resumen.cantidadVencidas} obligaciones vencidas con saldo pendiente`}
          </p>}
        </article>
      ))}
    </div>
  </section>
}
