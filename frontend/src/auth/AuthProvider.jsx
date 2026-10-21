import { useCallback, useEffect, useMemo, useState } from 'react'
import { solicitarApi } from '../lib/api'
import { ContextoAutenticacion } from './AuthContext'

export function ProveedorAutenticacion({ children: contenido }) {
  // Intencionalmente sin localStorage, sessionStorage ni cookies.
  const [estado, establecerEstado] = useState({ sesion: null, aviso: '' })
  const token = estado.sesion?.token

  const limpiarSesion = useCallback((tokenEsperado, aviso = '') => {
    establecerEstado((actual) => actual.sesion?.token === tokenEsperado ? { sesion: null, aviso } : actual)
  }, [])

  const iniciarSesion = useCallback(async (correo, contrasena) => {
    const sesion = await solicitarApi('/api/auth/login', { method: 'POST', body: { email: correo, password: contrasena } })
    if (!sesion.token || !['ASISTENTE', 'GERENTE', 'CONFIGURADOR'].includes(sesion.user?.role) || !(Date.parse(sesion.expiresAt) > Date.now())) {
      throw new Error('No se pudo validar la sesión del servidor.')
    }
    establecerEstado({ sesion, aviso: '' })
  }, [])

  const solicitar = useCallback(async (ruta, opciones = {}) => {
    try {
      return await solicitarApi(ruta, { ...opciones, token })
    } catch (error) {
      if (error.status === 401) limpiarSesion(token, 'Tu sesión venció o ya no está disponible. Inicia sesión nuevamente.')
      throw error
    }
  }, [token, limpiarSesion])

  const cerrarSesion = useCallback(async () => {
    try {
      await solicitar('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      if (error.status !== 401) throw error
    }
    limpiarSesion(token)
  }, [solicitar, token, limpiarSesion])

  useEffect(() => {
    if (!estado.sesion) return undefined
    const vencimiento = Date.parse(estado.sesion.expiresAt)
    const vencerSesion = () => limpiarSesion(token, 'Tu sesión venció. Inicia sesión nuevamente.')
    const comprobarVencimiento = () => { if (Date.now() >= vencimiento) vencerSesion() }
    const temporizador = setTimeout(vencerSesion, Math.max(0, vencimiento - Date.now()))
    window.addEventListener('focus', comprobarVencimiento)
    return () => { clearTimeout(temporizador); window.removeEventListener('focus', comprobarVencimiento) }
  }, [estado.sesion, token, limpiarSesion])

  const valor = useMemo(() => ({ usuario: estado.sesion?.user || null, aviso: estado.aviso, iniciarSesion, cerrarSesion, solicitar }), [estado, iniciarSesion, cerrarSesion, solicitar])
  return <ContextoAutenticacion.Provider value={valor}>{contenido}</ContextoAutenticacion.Provider>
}
