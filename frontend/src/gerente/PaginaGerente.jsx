import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAutenticacion } from '../auth/useAuth'
import { IconoGerente } from './IconoGerente'
import './pagosDelMes.css'

export function PaginaGerente() {
  const { solicitar } = useAutenticacion()
  const [estado, establecerEstado] = useState({ cargando: true, mensaje: '', error: '' })

  useEffect(() => {
    const controlador = new AbortController()
    solicitar('/api/panel/gerente', { signal: controlador.signal })
      .then((datos) => { if (!controlador.signal.aborted) establecerEstado({ cargando: false, mensaje: datos.message, error: '' }) })
      .catch((error) => { if (!controlador.signal.aborted) establecerEstado({ cargando: false, mensaje: '', error: error.message }) })
    return () => controlador.abort()
  }, [solicitar])

  return (
    <section className="inicio-gerente" aria-labelledby="titulo-panel-gerente">
      <div className="encabezado-consulta"><div><p className="etiqueta-gerente">TU ESPACIO DE CONSULTA</p><h2 id="titulo-panel-gerente">Panel de gerente</h2><p>Revisa los compromisos de tu negocio, mes a mes.</p></div></div>
      {estado.cargando && <p role="status">Verificando acceso con el servidor…</p>}
      {estado.error && <p className="error-message" role="alert">{estado.error}</p>}
      {estado.mensaje && <p className="acceso-gerente" role="status">{estado.mensaje}</p>}
      <nav className="navegacion-gerente" aria-label="Consultas del gerente">
        <Link to="/gerente/pagos-del-mes">
          <IconoGerente nombre="calendario" />
          <span>Consultar pagos del mes</span>
          <span aria-hidden="true">→</span>
        </Link>
        <p>
          Conceptos, beneficiarios, montos y saldos según su fecha límite.
        </p>

        <Link to="/gerente/resumen-mensual">
          <IconoGerente nombre="documento" />
          <span>Visualizar resumen mensual de pagos</span>
          <span aria-hidden="true">→</span>
        </Link>
        <p>
          Revisa los totales comprometido, abonado,
          pendiente y vencido del mes seleccionado.
        </p>
      </nav>
    </section>
  )
}
