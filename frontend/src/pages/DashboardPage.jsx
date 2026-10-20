import { useEffect, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { FuncionesAsistente } from '../components/FuncionesAsistente'
import { PagosInicio } from '../components/PagosInicio'

export function PaginaPanel({ role: rol, alBloquear }) {
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
    <section className="inicio-compartido" aria-labelledby="dashboard-title">
      <div className="panel-heading">
        <h2 id="dashboard-title">Panel de {esAsistente ? 'asistente' : 'gerente'}</h2>
      </div>
      {estado.cargando && <p role="status">Verificando acceso con el servidor…</p>}
      {estado.error && <p className="error-message" role="alert">{estado.error}</p>}
      {esAsistente ? <FuncionesAsistente alBloquear={alBloquear} /> : <PagosInicio />}
    </section>
  )
}
