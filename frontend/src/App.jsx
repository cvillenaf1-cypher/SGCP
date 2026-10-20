import { useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAutenticacion } from './auth/useAuth'
import { inicioPorRol } from './auth/AuthContext'
import { RequerirRol } from './auth/RequireRole'
import { PaginaInicioSesion } from './pages/LoginPage'
import { PaginaPanel } from './pages/DashboardPage'
import { PaginaGerente } from './gerente/PaginaGerente'
import { PaginaPagosDelMes } from './gerente/PaginaPagosDelMes'
import { PaginaResumenMensual } from './gerente/PaginaResumenMensual'
import { PaginaAlertasVencidas } from './gerente/PaginaAlertasVencidas'
import './App.css'

function Aplicacion() {
  const { usuario, cerrarSesion } = useAutenticacion()

  const ubicacion = useLocation()
  const esPaginaInicioSesion = ubicacion.pathname === '/login'
  const esModuloTrabajo = Boolean(usuario) && /^\/(gerente|asistente)(\/|$)/.test(ubicacion.pathname)

  const [cerrando, establecerCerrando] = useState(false)
  const [error, establecerError] = useState('')
  const [operacionBloqueada, establecerOperacionBloqueada] = useState(false)

  async function salir() {
    if (operacionBloqueada) return
    establecerCerrando(true)
    establecerError('')

    try {
      await cerrarSesion()
    } catch (fallo) {
      establecerError(
        `No se pudo cerrar la sesión en el servidor. ${fallo.message}`
      )
    } finally {
      establecerCerrando(false)
    }
  }

  return (
    <div
      className={`app-shell ${
        esPaginaInicioSesion ? 'app-shell--login' : esModuloTrabajo ? 'app-shell--gerente' : ''
      }`}
    >

      {/* Encabezado: visible solamente fuera del login */}
      {!esPaginaInicioSesion && (
        <header className="app-header">
          <span className="brand">{esModuloTrabajo ? <>S<span>A</span>PO</> : 'SGCP'}</span>

          <h1>
            {esModuloTrabajo ? 'Sistema de Administración de Pagos y Obligaciones' : 'Sistema de Gestión y Control de Pagos (SGCP)'}
          </h1>

          <p className="description">
            {esModuloTrabajo ? 'Tus pagos y obligaciones bajo control' : 'Organización y seguimiento de los compromisos económicos del negocio.'}
          </p>

          {usuario && (
            <div className="session-bar">
              <div>
                <strong>{usuario.name}</strong>

                <span className="role-label">
                  {usuario.role === 'ASISTENTE'
                    ? 'Asistente'
                    : 'Gerente'}
                </span>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={salir}
                disabled={cerrando || operacionBloqueada}
              >
                {cerrando ? 'Cerrando…' : 'Cerrar sesión'}
              </button>
            </div>
          )}

          {usuario && error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </header>
      )}

      {/* Rutas principales del sistema */}
      <main>
        <Routes>

          {/* Redirección inicial según autenticación */}
          <Route
            path="/"
            element={
              <Navigate
                to={
                  usuario
                    ? inicioPorRol(usuario.role)
                    : '/login'
                }
                replace
              />
            }
          />

          {/* Inicio de sesión SAPO */}
          <Route
            path="/login"
            element={<PaginaInicioSesion />}
          />

          {/* Rutas exclusivas del asistente */}
          <Route element={<RequerirRol role="ASISTENTE" />}>
            <Route
              path="/asistente"
              element={<PaginaPanel role="ASISTENTE" alBloquear={establecerOperacionBloqueada} />}
            />
          </Route>

          {/* Rutas exclusivas del gerente */}
          <Route element={<RequerirRol role="GERENTE" />}>
            <Route
              path="/gerente"
              element={<PaginaGerente />}
            />

            <Route
              path="/gerente/pagos-del-mes"
              element={<PaginaPagosDelMes />}
            />
            <Route
              path="/gerente/resumen-mensual"
              element={<PaginaResumenMensual />}
            />
            <Route
              path="/gerente/alertas-vencidas"
              element={<PaginaAlertasVencidas />}
            />
          </Route>

          {/* Página no encontrada */}
          <Route
            path="*"
            element={
              <section className="panel">
                <h2>Página no encontrada</h2>
                <Link to="/">Volver al inicio</Link>
              </section>
            }
          />

        </Routes>
      </main>

      {/* Pie de página: oculto durante el login */}
      {!esPaginaInicioSesion && (
        <footer className="app-footer">
          Moneda: soles (S/). {esModuloTrabajo ? 'SAPO' : 'SGCP'} registra operaciones
          externas; no realiza transferencias ni cobros.
        </footer>
      )}

    </div>
  )
}

export default Aplicacion
