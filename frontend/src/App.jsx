import { useState } from 'react'
import './App.css'

const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '')

function App() {
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState({ type: 'idle', message: 'Conexión con la API pendiente de comprobar.' })

  async function checkHealth() {
    setChecking(true)
    setStatus({ type: 'idle', message: 'Comprobando conexión…' })

    try {
      const response = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error('La API respondió con un error.')

      const data = await response.json()
      if (data.status !== 'ok') throw new Error('Respuesta de la API inesperada.')

      setStatus({ type: 'success', message: data.message })
    } catch {
      setStatus({ type: 'error', message: 'No se pudo conectar con la API. Inicia el backend y revisa VITE_API_URL.' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="welcome">
      <span className="badge">Proyecto universitario · Configuración inicial</span>
      <h1>Sistema de Gestión y Control de Pagos (SGCP)</h1>
      <p className="description">
        Bienvenido al punto de partida del sistema. Aquí construiremos las
        herramientas para gestionar y consultar los pagos.
      </p>
      <section className="connection" aria-labelledby="connection-title">
        <h2 id="connection-title">Estado del backend</h2>
        <p className={`status ${status.type}`} role="status">{status.message}</p>
        <button type="button" onClick={checkHealth} disabled={checking}>
          {checking ? 'Comprobando…' : 'Comprobar conexión'}
        </button>
      </section>
      <p className="footnote">React + Vite · Express · MySQL (próximamente)</p>
    </main>
  )
}

export default App
