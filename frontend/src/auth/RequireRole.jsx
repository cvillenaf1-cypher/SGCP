import { Link, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'
import { homeForRole } from './AuthContext'

export function RequireRole({ role }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) {
    return (
      <section className="panel" aria-labelledby="access-title">
        <h2 id="access-title">Acceso no permitido</h2>
        <p>Tu rol no tiene acceso a esta sección.</p>
        <Link to={homeForRole(user.role)}>Volver a mi panel</Link>
      </section>
    )
  }
  return <Outlet />
}
