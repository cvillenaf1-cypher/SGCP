import { Link, Navigate, Outlet } from 'react-router-dom'
import { useAutenticacion } from './useAuth'
import { inicioPorRol } from './AuthContext'

export function RequerirRol({ role: rol }) {
  const { usuario } = useAutenticacion()
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.role !== rol) {
    return (
      <section className="panel" aria-labelledby="access-title">
        <h2 id="access-title">Acceso no permitido</h2>
        <p>Tu rol no tiene acceso a esta sección.</p>
        <Link to={inicioPorRol(usuario.role)}>Volver a mi panel</Link>
      </section>
    )
  }
  return <Outlet />
}
