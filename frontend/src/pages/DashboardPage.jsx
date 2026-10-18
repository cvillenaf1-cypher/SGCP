import { useEffect, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { FuncionesAsistente } from '../components/FuncionesAsistente'

export function PaginaPanel({ role: rol }) {
  const { solicitar } = useAutenticacion()
  const [estado, establecerEstado] = useState({ cargando: true, mensaje: '', error: '' })
  const esAsistente = rol === 'ASISTENTE'

  useEffect(() => {
    const controlador = new AbortController()
    solicitar(`/api/panel/${esAsistente ? 'asistente' : 'gerente'}`, { signal: controlador.signal })
      .then((datos) => { if (!controlador.signal.aborted) establecerEstado({ cargando: false, mensaje: datos.message, error: '' }) })
      .catch((error) => { if (!controlador.signal.aborted) establecerEstado({ cargando: false, mensaje: '', error: error.message }) })
    return () => controlador.abort()
  }, [esAsistente, solicitar])

  return (
    <section className="panel" aria-labelledby="dashboard-title">
      <div className="panel-heading">
        <h2 id="dashboard-title">Panel de {esAsistente ? 'asistente' : 'gerente'}</h2>
        {!esAsistente && <span className="badge">Solo lectura</span>}
      </div>
      {estado.cargando && <p role="status">Verificando acceso con el servidor…</p>}
      {estado.error && <p className="error-message" role="alert">{estado.error}</p>}
      {estado.mensaje && <p className="success-message" role="status">{estado.mensaje}</p>}
      {esAsistente ? <FuncionesAsistente /> : <div className="empty-state">
        <h3>Tu espacio de trabajo está preparado</h3>
        <p>{esAsistente
          ? 'En las siguientes entregas podrás registrar obligaciones, consultar saldos y registrar abonos realizados fuera del sistema.'
          : 'En las siguientes entregas podrás consultar obligaciones por mes, resúmenes económicos y alertas globales de vencimiento.'}</p>
      </div>}
    </section>
  )
}
