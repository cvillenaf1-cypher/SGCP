import { useCallback, useEffect, useRef, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { fechaActualLima } from '../lib/pagosInicio'
import { seleccionarAlertasVencidas } from './alertasVencidas'

export function useAlertasVencidas() {
  const { solicitar } = useAutenticacion()
  const [estado, establecerEstado] = useState({ cargando: true, obligaciones: [], error: '', hoy: fechaActualLima() })
  const recargar = useRef(null)
  const actualizar = useCallback(() => recargar.current?.(), [])

  useEffect(() => {
    const controlador = new AbortController()
    let consultando = false

    async function cargarAlertas() {
      if (controlador.signal.aborted) return
      establecerEstado((actual) => ({ ...actual, hoy: fechaActualLima() }))
      if (consultando) return
      consultando = true
      try {
        const datos = await solicitar('/api/obligaciones', { signal: controlador.signal })
        seleccionarAlertasVencidas(datos?.obligaciones)
        if (!controlador.signal.aborted) {
          establecerEstado({ solicitar, cargando: false, obligaciones: datos.obligaciones, error: '', hoy: fechaActualLima() })
        }
      } catch (error) {
        if (!controlador.signal.aborted) {
          establecerEstado((actual) => ({
            solicitar, cargando: false, error: error.message, hoy: fechaActualLima(),
            obligaciones: actual.solicitar === solicitar ? actual.obligaciones : [],
          }))
        }
      } finally {
        consultando = false
      }
    }

    recargar.current = cargarAlertas
    Promise.resolve().then(cargarAlertas)
    const temporizador = setInterval(cargarAlertas, 30000)
    window.addEventListener('focus', cargarAlertas)
    return () => {
      controlador.abort()
      clearInterval(temporizador)
      window.removeEventListener('focus', cargarAlertas)
      recargar.current = null
    }
  }, [solicitar])

  const consulta = estado.solicitar === solicitar ? estado : { cargando: true, obligaciones: [], error: '', hoy: fechaActualLima() }
  const alertas = seleccionarAlertasVencidas(consulta.obligaciones, consulta.hoy)
  return { ...consulta, ...alertas, actualizar }
}
