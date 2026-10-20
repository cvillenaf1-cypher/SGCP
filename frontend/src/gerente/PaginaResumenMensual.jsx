import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAutenticacion } from '../auth/useAuth'
import { IconoGerente } from './IconoGerente'
import { meses, obtenerPeriodoActual } from './pagosDelMes'
import { consultarPagosDelMes } from './servicioPagos'
import { calcularResumenMensual, formatearCentavos } from './resumenMensual'
import './pagosDelMes.css'
import './resumenMensual.css'

const indicadores = [
    ['comprometido', 'Total comprometido', 'Monto original de las obligaciones del período.'],
    ['abonado', 'Total abonado', 'Abonos acumulados, registrados en cualquier mes.'],
    ['pendiente', 'Total pendiente', 'Saldo por pagar de las obligaciones del período.'],
    ['vencido', 'Total vencido', 'Saldo con fecha límite anterior a hoy en Lima.'],
]

export function PaginaResumenMensual({ consultarPagos = consultarPagosDelMes }) {
    const { solicitar } = useAutenticacion()
    const [seleccion, establecerSeleccion] = useState(obtenerPeriodoActual)
    const [estado, establecerEstado] = useState({ tipo: 'cargando' })
    const [aniosConPagos, establecerAniosConPagos] = useState([])
    const { mes, anio } = seleccion
    const anioActual = obtenerPeriodoActual().anio
    const aniosDisponibles = [...new Set([
        anioActual - 2, anioActual - 1, anioActual, anioActual + 1, anioActual + 2,
        ...aniosConPagos,
    ])].filter((valor) => valor >= 1 && valor <= 9999).sort((a, b) => a - b)
    const nombrePeriodo = `${meses[mes - 1].toLowerCase()} de ${anio}`
    const estadoVisible = estado.seleccion === seleccion ? estado : { tipo: 'cargando' }

    useEffect(() => {
        const controlador = new AbortController()
        let temporizador
        let consultando = false

        async function cargarResumen() {
            if (controlador.signal.aborted || consultando) return
            clearTimeout(temporizador)
            consultando = true
            try {
                const pagos = await consultarPagos({ mes, anio, solicitar, senal: controlador.signal })
                const resumen = calcularResumenMensual(pagos, mes, anio)
                if (controlador.signal.aborted) return
                establecerAniosConPagos([...new Set(pagos.map((pago) => Number(pago.fechaLimite.slice(0, 4))))])
                establecerEstado({ seleccion, tipo: 'listo', resumen })
            } catch (error) {
                if (!controlador.signal.aborted) {
                    establecerEstado({ seleccion, tipo: 'error', mensaje: error.message })
                }
            } finally {
                consultando = false
                if (!controlador.signal.aborted) temporizador = setTimeout(cargarResumen, 30000)
            }
        }

        // Permite cancelar el montaje de comprobación de React antes de iniciar la consulta.
        Promise.resolve().then(cargarResumen)
        window.addEventListener('focus', cargarResumen)
        return () => {
            controlador.abort()
            clearTimeout(temporizador)
            window.removeEventListener('focus', cargarResumen)
        }
    }, [seleccion, mes, anio, solicitar, consultarPagos])

    return (
        <section
            className="pagos-del-mes"
            aria-labelledby="titulo-resumen-mensual"
        >
            <Link className="enlace-volver-gerente" to="/gerente">
                <IconoGerente nombre="flecha" />
                Volver al panel de gerente
            </Link>

            <div className="encabezado-consulta">
                <div>
                    <p className="etiqueta-gerente">RESUMEN MENSUAL</p>
                    <h2 id="titulo-resumen-mensual">
                        Visualizar resumen mensual de pagos
                    </h2>
                </div>
            </div>

            <div className="tarjeta-periodo">
                <div className="introduccion-periodo">
                    <span className="simbolo-periodo"><IconoGerente nombre="calendario" /></span>
                    <h3>Período de consulta</h3>
                    <p>Selecciona el mes y año que deseas revisar.</p>
                </div>
                <div className="filtros-pagos" role="group" aria-label="Período de consulta">
                    <div className="campo-periodo">
                        <label htmlFor="mes-resumen">Mes</label>
                        <select id="mes-resumen" value={mes} onChange={(evento) => establecerSeleccion({ ...seleccion, mes: Number(evento.target.value) })}>
                            {meses.map((nombre, indice) => <option key={nombre} value={indice + 1}>{nombre}</option>)}
                        </select>
                    </div>
                    <div className="campo-periodo campo-periodo--anios">
                        <span id="etiqueta-anios-resumen">Año</span>
                        <div className="barra-anios" role="group" aria-labelledby="etiqueta-anios-resumen">
                            {aniosDisponibles.map((opcion) => (
                                <button key={opcion} type="button" className={anio === opcion ? 'boton-anio boton-anio--activo' : 'boton-anio'}
                                    aria-pressed={anio === opcion} onClick={() => establecerSeleccion({ ...seleccion, anio: opcion })}>
                                    {opcion}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="resultados-pagos" aria-busy={estadoVisible.tipo === 'cargando'}>
                <div className="encabezado-resultados">
                    <div>
                        <p className="etiqueta-gerente">INDICADORES ECONÓMICOS</p>
                        <h3>Resumen de {nombrePeriodo}</h3>
                        <p className="descripcion-periodo">Obligaciones cuya fecha límite corresponde al período seleccionado.</p>
                    </div>
                </div>
                {estadoVisible.tipo === 'cargando' && (
                    <div className="mensaje-consulta" role="status">
                        <span className="indicador-carga" aria-hidden="true" />
                        <p>Consultando resumen de {nombrePeriodo}…</p>
                    </div>
                )}
                {estadoVisible.tipo === 'error' && (
                    <div className="mensaje-consulta mensaje-consulta--error" role="alert">
                        <IconoGerente nombre="aviso" />
                        <h3>No se pudo consultar el resumen.</h3>
                        <p>{estadoVisible.mensaje}</p>
                        <p>Se reintentará automáticamente. También puedes volver a seleccionar el período.</p>
                    </div>
                )}
                {estadoVisible.tipo === 'listo' && (
                    <>
                        <div className="indicadores-resumen">
                            {indicadores.map(([clave, titulo, descripcion]) => (
                                <article className="tarjeta-indicador" key={clave} aria-label={titulo}>
                                    <h4>{titulo}</h4>
                                    <p className="importe-resumen">{formatearCentavos(estadoVisible.resumen[clave])}</p>
                                    <p>{descripcion}</p>
                                </article>
                            ))}
                        </div>
                        {estadoVisible.resumen.cantidad === 0 && (
                            <p className="mensaje-resumen-vacio" role="status">
                                No hay obligaciones con vencimiento en este período.
                            </p>
                        )}
                    </>
                )}
            </div>
        </section>
    )
}
