import { useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAutenticacion } from './auth/useAuth'
import { inicioPorRol } from './auth/AuthContext'
import { RequerirRol } from './auth/RequireRole'
import { PaginaInicioSesion } from './pages/LoginPage'
import { PaginaPanel } from './pages/DashboardPage'
import './App.css'

function Aplicacion() {
  const { usuario, cerrarSesion } = useAutenticacion()
  const [cerrando, establecerCerrando] = useState(false)
  const [error, establecerError] = useState('')

  async function salir() {
    establecerCerrando(true)
    establecerError('')
    try {
      await cerrarSesion()
    } catch (fallo) {
      establecerError(`No se pudo cerrar la sesión en el servidor. ${fallo.message}`)
    } finally {
      establecerCerrando(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">SGCP</span>
        <h1>Sistema de Gestión y Control de Pagos (SGCP)</h1>
        <p className="description">Organización y seguimiento de los compromisos económicos del negocio.</p>
        {usuario && <div className="session-bar">
          <div><strong>{usuario.name}</strong><span className="role-label">{usuario.role === 'ASISTENTE' ? 'Asistente' : 'Gerente'}</span></div>
          <button className="secondary-button" type="button" onClick={salir} disabled={cerrando}>{cerrando ? 'Cerrando…' : 'Cerrar sesión'}</button>
        </div>}
        {usuario && error && <p className="error-message" role="alert">{error}</p>}
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to={usuario ? inicioPorRol(usuario.role) : '/login'} replace />} />
          <Route path="/login" element={<PaginaInicioSesion />} />
          <Route element={<RequerirRol role="ASISTENTE" />}>
            <Route path="/asistente" element={<PaginaPanel role="ASISTENTE" />} />
          </Route>
          <Route element={<RequerirRol role="GERENTE" />}>
            <Route path="/gerente" element={<PaginaPanel role="GERENTE" />} />
          </Route>
          <Route path="*" element={<section className="panel"><h2>Página no encontrada</h2><Link to="/">Volver al inicio</Link></section>} />
        </Routes>
      </main>
      <footer className="app-footer">Moneda: soles (S/). SGCP registra operaciones externas; no realiza transferencias ni cobros.</footer>
    </div>
  )
}

export default Aplicacion
