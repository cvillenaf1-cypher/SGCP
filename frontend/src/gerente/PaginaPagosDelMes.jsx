
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAutenticacion } from '../auth/useAuth'
import { TablaPagosDelMes } from './TablaPagosDelMes'
import { IconoGerente } from './IconoGerente'
import { filtrarPagosPorPeriodo, meses, obtenerPeriodoActual } from './pagosDelMes'
import { consultarPagosDelMes } from './servicioPagos'
import './pagosDelMes.css'

export function PaginaPagosDelMes({ consultarPagos = consultarPagosDelMes }) {
  const { solicitar } = useAutenticacion()

  const [seleccion, establecerSeleccion] = useState(obtenerPeriodoActual)

  const [estado, establecerEstado] = useState({
    seleccion: null,
    tipo: 'cargando',
    pagos: [],
  })

  const [aniosConPagos, establecerAniosConPagos] = useState([])

  const { mes, anio } = seleccion
  const anioActual = obtenerPeriodoActual().anio

  const aniosDisponibles = [
    ...new Set([
      anioActual - 2,
      anioActual - 1,
      anioActual,
      anioActual + 1,
      anioActual + 2,
      ...aniosConPagos,
    ]),
  ]
    .filter((valor) => Number.isInteger(valor) && valor >= 1 && valor <= 9999)
    .sort((a, b) => a - b)

  const anioValido = /^\d{1,4}$/.test(String(anio)) && Number(anio) >= 1
  const nombrePeriodo = `${meses[mes - 1].toLowerCase()} de ${anio}`
  const estadoVisible = estado.seleccion === seleccion
    ? estado
    : { tipo: 'cargando' }

  useEffect(() => {
    if (!anioValido) return undefined

    const controlador = new AbortController()

    async function cargarPagos() {
      try {
        const pagos = await consultarPagos({
          mes,
          anio: Number(anio),
          solicitar,
          senal: controlador.signal,
        })

        if (!Array.isArray(pagos)) {
          throw new Error('El servidor envió una lista de pagos inválida.')
        }

        const pagosDelMes = filtrarPagosPorPeriodo(
          pagos,
          mes,
          Number(anio)
        )

        if (!controlador.signal.aborted) {
          const aniosRegistrados = pagos
            .filter(
              (pago) =>
                typeof pago.fechaLimite === 'string' &&
                /^\d{4}-\d{2}-\d{2}/.test(pago.fechaLimite)
            )
            .map((pago) => Number(pago.fechaLimite.slice(0, 4)))

          establecerAniosConPagos([...new Set(aniosRegistrados)])

          establecerEstado({
            seleccion,
            tipo: 'listo',
            pagos: pagosDelMes,
          })
        }
      } catch (error) {
        if (!controlador.signal.aborted) {
          establecerEstado({
            seleccion,
            pagos: [],
            tipo: 'error',
            mensaje: error.message,
          })
        }
      }
    }

    cargarPagos()

    return () => controlador.abort()
  }, [mes, anio, anioValido, seleccion, solicitar, consultarPagos])

  return (
    <section
      className="pagos-del-mes"
      aria-labelledby="titulo-pagos-mes"
    >
      <Link className="enlace-volver-gerente" to="/gerente">
        <IconoGerente nombre="flecha" />
        Volver al panel de gerente
      </Link>

      <div className="encabezado-consulta">
        <div>
          <p className="etiqueta-gerente">CONSULTA MENSUAL</p>
          <h2 id="titulo-pagos-mes">Consultar pagos del mes</h2>
        </div>
      </div>

      <div className="tarjeta-periodo">
        <div className="introduccion-periodo">
          <span className="simbolo-periodo">
            <IconoGerente nombre="calendario" />
          </span>

          <h3>Período de consulta</h3>

          <p>
            Selecciona el mes y año que deseas revisar.
          </p>
        </div>

        <div
          className="filtros-pagos"
          role="group"
          aria-label="Período de consulta"
        >
          <div className="campo-periodo">
            <label htmlFor="mes-pagos">Mes</label>

            <select
              id="mes-pagos"
              value={mes}
              onChange={(evento) =>
                establecerSeleccion({
                  ...seleccion,
                  mes: Number(evento.target.value),
                })
              }
            >
              {meses.map((nombre, indice) => (
                <option key={nombre} value={indice + 1}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="campo-periodo campo-periodo--anios">
            <span id="etiqueta-anios">Año</span>

            <div
              className="barra-anios"
              role="group"
              aria-labelledby="etiqueta-anios"
            >
              {aniosDisponibles.map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  className={
                    Number(anio) === opcion
                      ? 'boton-anio boton-anio--activo'
                      : 'boton-anio'
                  }
                  aria-pressed={Number(anio) === opcion}
                  onClick={() =>
                    establecerSeleccion({
                      ...seleccion,
                      anio: opcion,
                    })
                  }
                >
                  {opcion}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {anioValido && (
        <div
          className="resultados-pagos"
          aria-busy={estadoVisible.tipo === 'cargando'}
        >
          <div className="encabezado-resultados">
            <div>
              <p className="etiqueta-gerente">
                DETALLE DEL PERÍODO
              </p>

              <h3>
                Pagos con vencimiento en {nombrePeriodo}
              </h3>

              <p className="descripcion-periodo">
                Consulta todos los compromisos con fecha límite en el mes seleccionado.
              </p>
            </div>

            {estadoVisible.tipo === 'listo' && (
              <span className="cantidad-pagos">
                {estadoVisible.pagos.length}{' '}
                {estadoVisible.pagos.length === 1 ? 'pago' : 'pagos'}
              </span>
            )}
          </div>

          {estadoVisible.tipo === 'cargando' && (
            <div className="mensaje-consulta" role="status">
              <span
                className="indicador-carga"
                aria-hidden="true"
              />
              <h3>Consultando pagos de {nombrePeriodo}…</h3>
              <p>Estamos obteniendo la información del período.</p>
            </div>
          )}

          {estadoVisible.tipo === 'error' && (
            <div
              className="mensaje-consulta mensaje-consulta--error"
              role="alert"
            >
              <IconoGerente nombre="aviso" />
              <h3>No se pudieron consultar los pagos.</h3>
              <p>{estadoVisible.mensaje}</p>
              <p>
                Revisa tu conexión y vuelve a seleccionar el período para consultar.
              </p>
            </div>
          )}

          {estadoVisible.tipo === 'listo' && (
            estadoVisible.pagos.length > 0 ? (
              <TablaPagosDelMes
                pagos={estadoVisible.pagos}
                periodo={nombrePeriodo}
              />
            ) : (
              <div className="mensaje-consulta" role="status">
                <IconoGerente nombre="documento" />
                <h3>Sin pagos para este período</h3>
                <p>
                  No hay pagos con fecha límite en {nombrePeriodo}.
                </p>
                <p>Puedes seleccionar otro mes o año.</p>
              </div>
            )
          )}
        </div>
      )}
    </section>
  )
}
