import { Link } from 'react-router-dom'
import { PaginaPanel } from '../pages/DashboardPage'
import './pagosDelMes.css'

export function PaginaGerente() {
  return (
    <>
      <PaginaPanel role="GERENTE" />
      <nav className="navegacion-gerente" aria-label="Consultas del gerente">
        <Link to="/gerente/pagos-del-mes">Consultar pagos del mes</Link>
      </nav>
    </>
  )
}
