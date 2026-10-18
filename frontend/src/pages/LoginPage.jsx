import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { homeForRole } from '../auth/AuthContext'

export function LoginPage() {
  const { user, notice, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fields, setFields] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  if (user) return <Navigate to={homeForRole(user.role)} replace />

  async function submit(event) {
    event.preventDefault()
    if (pending) return
    const nextFields = {}
    const normalized = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) nextFields.email = 'Ingresa un correo electrónico válido.'
    if (!password || password.length > 128) nextFields.password = 'Ingresa una contraseña de hasta 128 caracteres.'
    setFields(nextFields)
    setError('')
    if (Object.keys(nextFields).length) return
    setPending(true)
    try {
      await signIn(normalized, password)
      setPassword('')
    } catch (failure) {
      setFields(failure.fields || {})
      setError(failure.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="panel login-panel" aria-labelledby="login-title">
      <h2 id="login-title">Iniciar sesión</h2>
      <p className="description">Ingresa con tu cuenta de asistente o gerente.</p>
      {notice && <p className="notice" role="status">{notice}</p>}
      <form onSubmit={submit} noValidate aria-busy={pending}>
        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" autoComplete="username" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(fields.email)} aria-describedby={fields.email ? 'email-error' : undefined} />
          {fields.email && <p className="field-error" id="email-error">{fields.email}</p>}
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(fields.password)} aria-describedby={fields.password ? 'password-error' : undefined} />
          {fields.password && <p className="field-error" id="password-error">{fields.password}</p>}
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="login-button" type="submit" disabled={pending}>{pending ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
      <p className="footnote">Por seguridad, al recargar o cerrar esta página deberás iniciar sesión nuevamente.</p>
    </section>
  )
}
