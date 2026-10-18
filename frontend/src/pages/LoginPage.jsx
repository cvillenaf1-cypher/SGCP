import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAutenticacion } from '../auth/useAuth'
import { inicioPorRol } from '../auth/AuthContext'

export function PaginaInicioSesion() {
  const { usuario, aviso, iniciarSesion } = useAutenticacion()
  const [correo, establecerCorreo] = useState('')
  const [contrasena, establecerContrasena] = useState('')
  const [campos, establecerCampos] = useState({})
  const [error, establecerError] = useState('')
  const [pendiente, establecerPendiente] = useState(false)

  if (usuario) return <Navigate to={inicioPorRol(usuario.role)} replace />

  async function enviarFormulario(evento) {
    evento.preventDefault()
    if (pendiente) return
    const nuevosCampos = {}
    const correoNormalizado = correo.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoNormalizado) || correoNormalizado.length > 254) nuevosCampos.email = 'Ingresa un correo electrónico válido.'
    if (!contrasena || contrasena.length > 128) nuevosCampos.password = 'Ingresa una contraseña de hasta 128 caracteres.'
    establecerCampos(nuevosCampos)
    establecerError('')
    if (Object.keys(nuevosCampos).length) return
    establecerPendiente(true)
    try {
      await iniciarSesion(correoNormalizado, contrasena)
      establecerContrasena('')
    } catch (fallo) {
      establecerCampos(fallo.fields || {})
      establecerError(fallo.message)
    } finally {
      establecerPendiente(false)
    }
  }

  return (
    <section className="panel login-panel" aria-labelledby="login-title">
      <h2 id="login-title">Iniciar sesión</h2>
      <p className="description">Ingresa con tu cuenta de asistente o gerente.</p>
      {aviso && <p className="notice" role="status">{aviso}</p>}
      <form onSubmit={enviarFormulario} noValidate aria-busy={pendiente}>
        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" autoComplete="username" maxLength={254} required value={correo} onChange={(evento) => establecerCorreo(evento.target.value)} aria-invalid={Boolean(campos.email)} aria-describedby={campos.email ? 'email-error' : undefined} />
          {campos.email && <p className="field-error" id="email-error">{campos.email}</p>}
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="current-password" maxLength={128} required value={contrasena} onChange={(evento) => establecerContrasena(evento.target.value)} aria-invalid={Boolean(campos.password)} aria-describedby={campos.password ? 'password-error' : undefined} />
          {campos.password && <p className="field-error" id="password-error">{campos.password}</p>}
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="login-button" type="submit" disabled={pendiente}>{pendiente ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
      <p className="footnote">Por seguridad, al recargar o cerrar esta página deberás iniciar sesión nuevamente.</p>
    </section>
  )
}
