import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAutenticacion } from '../auth/useAuth'
import { TablaPagosDelMes } from './TablaPagosDelMes'
import { filtrarPagosPorPeriodo, meses, obtenerPeriodoActual } from './pagosDelMes'
import { consultarPagosDelMes, ErrorIntegracionPendiente } from './servicioPagos'
import './pagosDelMes.css'

export function PaginaPagosDelMes({ consultarPagos = consultarPagosDelMes }) {
  const { solicitar } = useAutenticacion()
  const [seleccion, establecerSeleccion] = useState(obtenerPeriodoActual)
  const [estado, establecerEstado] = useState({ seleccion: null, tipo: 'cargando', pagos: [] })
  const { mes, anio } = seleccion
  const anioValido = /^\d{1,4}$/.test(String(anio)) && Number(anio) >= 1
  const nombrePeriodo = `${meses[mes - 1].toLowerCase()} de ${anio}`
  const estadoVisible = estado.seleccion === seleccion ? estado : { tipo: 'cargando' }

  useEffect(() => {
    if (!anioValido) return undefined
    const controlador = new AbortController()

    async function cargarPagos() {
      try {
        const pagos = await consultarPagos({ mes, anio: Number(anio), solicitar, senal: controlador.signal })
        if (!Array.isArray(pagos)) throw new Error('El servidor envió una lista de pagos inválida.')
        const pagosDelMes = filtrarPagosPorPeriodo(pagos, mes, Number(anio))
        if (!controlador.signal.aborted) establecerEstado({ seleccion, tipo: 'listo', pagos: pagosDelMes })
      } catch (error) {
        if (!controlador.signal.aborted) {
          establecerEstado({
            seleccion, pagos: [],
            tipo: error instanceof ErrorIntegracionPendiente ? 'sin-conexion' : 'error',
            mensaje: error.message,
          })
        }
      }
    }

    cargarPagos()
    return () => controlador.abort()
  }, [mes, anio, anioValido, seleccion, solicitar, consultarPagos])

  return (
    <section className="panel pagos-del-mes" aria-labelledby="titulo-pagos-mes">
      <Link to="/gerente">Volver al panel de gerente</Link>
      <div className="panel-heading">
        <h2 id="titulo-pagos-mes">Consultar pagos del mes</h2>
        <span className="badge">Solo lectura</span>
      </div>
      <p className="description" id="ayuda-periodo">Selecciona un período para consultar sus pagos según la fecha límite.</p>
      <div className="filtros-pagos" role="group" aria-label="Período de consulta" aria-describedby="ayuda-periodo">
        <div className="field">
          <label htmlFor="mes-pagos">Mes</label>
          <select id="mes-pagos" value={mes} onChange={(evento) => establecerSeleccion({ ...seleccion, mes: Number(evento.target.value) })}>
            {meses.map((nombre, indice) => <option key={nombre} value={indice + 1}>{nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="anio-pagos">Año</label>
          <input id="anio-pagos" type="number" min="1" max="9999" step="1" value={anio} onChange={(evento) => establecerSeleccion({ ...seleccion, anio: evento.target.value })} aria-invalid={!anioValido} aria-describedby={!anioValido ? 'error-anio-pagos' : undefined} />
        </div>
      </div>
      {!anioValido && <p className="field-error" id="error-anio-pagos" role="alert">Ingresa un año entero entre 1 y 9999.</p>}
      {anioValido && <div aria-busy={estadoVisible.tipo === 'cargando'}>
        {estadoVisible.tipo === 'cargando' && <p role="status">Consultando pagos de {nombrePeriodo}…</p>}
        {estadoVisible.tipo === 'sin-conexion' && <p className="notice" role="status">{estadoVisible.mensaje}</p>}
        {estadoVisible.tipo === 'error' && <p className="error-message" role="alert">No se pudieron consultar los pagos. {estadoVisible.mensaje}</p>}
        {estadoVisible.tipo === 'listo' && (estadoVisible.pagos.length > 0
          ? <TablaPagosDelMes pagos={estadoVisible.pagos} periodo={nombrePeriodo} />
          : <div className="empty-state" role="status"><h3>Sin pagos para este período</h3><p>No hay pagos con fecha límite en {nombrePeriodo}.</p></div>)}
      </div>}
    </section>
  )
}
