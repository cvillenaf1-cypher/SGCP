import { formatearFechaLimite, formatearSoles } from './pagosDelMes'

export function TablaPagosDelMes({ pagos, periodo }) {
  return (
    <div className="contenedor-tabla-pagos" role="region" aria-label="Detalle de pagos del mes" tabIndex={0}>
      <table
        className="tabla-pagos"
        aria-label={`Pagos con fecha límite en ${periodo}`}
      >
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
              <th scope="row" data-etiqueta="Concepto">{pago.concepto}</th>
              <td data-etiqueta="Beneficiario">{pago.beneficiario}</td>
              <td className="monto-pago" data-etiqueta="Monto original">{formatearSoles(pago.montoOriginal)}</td>
              <td className="monto-pago saldo-pago" data-etiqueta="Saldo pendiente">{formatearSoles(pago.saldoPendiente)}</td>
              <td className="fecha-pago" data-etiqueta="Fecha límite">{formatearFechaLimite(pago.fechaLimite)}</td>
              <td data-etiqueta="Estado del pago"><span className="estado-pago" data-estado={pago.estado}>{pago.estado}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
