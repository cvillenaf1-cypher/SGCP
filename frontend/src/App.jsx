import { useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { homeForRole } from './auth/AuthContext'
import { RequireRole } from './auth/RequireRole'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import './App.css'

function App() {
  const { user, signOut } = useAuth()
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')

  async function logout() {
    setClosing(true)
    setError('')
    try {
      await signOut()
    } catch (failure) {
      setError(`No se pudo cerrar la sesión en el servidor. ${failure.message}`)
    } finally {
      setClosing(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">SGCP</span>
        <h1>Sistema de Gestión y Control de Pagos (SGCP)</h1>
        <p className="description">Organización y seguimiento de los compromisos económicos del negocio.</p>
        {user && <div className="session-bar">
          <div><strong>{user.name}</strong><span className="role-label">{user.role === 'ASISTENTE' ? 'Asistente' : 'Gerente'}</span></div>
          <button className="secondary-button" type="button" onClick={logout} disabled={closing}>{closing ? 'Cerrando…' : 'Cerrar sesión'}</button>
        </div>}
        {user && error && <p className="error-message" role="alert">{error}</p>}
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to={user ? homeForRole(user.role) : '/login'} replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireRole role="ASISTENTE" />}>
            <Route path="/asistente" element={<DashboardPage role="ASISTENTE" />} />
          </Route>
          <Route element={<RequireRole role="GERENTE" />}>
            <Route path="/gerente" element={<DashboardPage role="GERENTE" />} />
          </Route>
          <Route path="*" element={<section className="panel"><h2>Página no encontrada</h2><Link to="/">Volver al inicio</Link></section>} />
        </Routes>
      </main>
      <footer className="app-footer">Moneda: soles (S/). SGCP registra operaciones externas; no realiza transferencias ni cobros.</footer>
    </div>
  )
}

export default App
