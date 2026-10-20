import { Link } from 'react-router-dom'
import { PaginaPanel } from '../pages/DashboardPage'
import { IconoGerente } from './IconoGerente'
import './pagosDelMes.css'

export function PaginaGerente() {
  return (
    <>
      <PaginaPanel role="GERENTE" />

      <nav className="navegacion-gerente" aria-label="Consultas del gerente">
        <Link to="/gerente/resumen-mensual">
          <IconoGerente nombre="documento" />
          <span>Visualizar resumen mensual de pagos</span>
          <span aria-hidden="true">→</span>
        </Link>
        <p>
          Revisa los totales comprometido, abonado,
          pendiente y vencido del mes seleccionado.
        </p>
      </nav>
    </>
  )
}
