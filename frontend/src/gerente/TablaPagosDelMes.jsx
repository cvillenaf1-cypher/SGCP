import { formatearFechaLimite, formatearSoles } from './pagosDelMes'

export function TablaPagosDelMes({ pagos, periodo }) {
  return (
    <div className="contenedor-tabla-pagos" role="region" aria-label="Detalle de pagos del mes" tabIndex={0}>
      <table className="tabla-pagos">
        <caption>Pagos con fecha límite en {periodo}</caption>
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col">Beneficiario</th>
            <th scope="col">Monto original</th>
            <th scope="col">Saldo pendiente</th>
            <th scope="col">Fecha límite</th>
            <th scope="col">Estado del pago</th>
          </tr>
        </thead>
        <tbody>
          {pagos.map((pago) => (
            <tr key={pago.id}>
              <th scope="row">{pago.concepto}</th>
              <td>{pago.beneficiario}</td>
              <td className="monto-pago">{formatearSoles(pago.montoOriginal)}</td>
              <td className="monto-pago">{formatearSoles(pago.saldoPendiente)}</td>
              <td className="fecha-pago">{formatearFechaLimite(pago.fechaLimite)}</td>
              <td><span className="estado-pago">{pago.estado}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
