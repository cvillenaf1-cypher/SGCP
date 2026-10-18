import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'

export function DashboardPage({ role }) {
  const { request } = useAuth()
  const [status, setStatus] = useState({ loading: true, message: '', error: '' })
  const assistant = role === 'ASISTENTE'

  useEffect(() => {
    const controller = new AbortController()
    request(`/api/panel/${assistant ? 'asistente' : 'gerente'}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setStatus({ loading: false, message: data.message, error: '' }) })
      .catch((error) => { if (!controller.signal.aborted) setStatus({ loading: false, message: '', error: error.message }) })
    return () => controller.abort()
  }, [assistant, request])

  return (
    <section className="panel" aria-labelledby="dashboard-title">
      <div className="panel-heading">
        <h2 id="dashboard-title">Panel de {assistant ? 'asistente' : 'gerente'}</h2>
        {!assistant && <span className="badge">Solo lectura</span>}
      </div>
      {status.loading && <p role="status">Verificando acceso con el servidor…</p>}
      {status.error && <p className="error-message" role="alert">{status.error}</p>}
      {status.message && <p className="success-message" role="status">{status.message}</p>}
      <div className="empty-state">
        <h3>Tu espacio de trabajo está preparado</h3>
        <p>{assistant
          ? 'En las siguientes entregas podrás registrar obligaciones, consultar saldos y registrar abonos realizados fuera del sistema.'
          : 'En las siguientes entregas podrás consultar obligaciones por mes, resúmenes económicos y alertas globales de vencimiento.'}</p>
      </div>
    </section>
  )
}
