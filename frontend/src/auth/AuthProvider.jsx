import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }) {
  // Intencionalmente sin localStorage, sessionStorage ni cookies.
  const [state, setState] = useState({ session: null, notice: '' })
  const token = state.session?.token

  const clearSession = useCallback((expectedToken, notice = '') => {
    setState((current) => current.session?.token === expectedToken ? { session: null, notice } : current)
  }, [])

  const signIn = useCallback(async (email, password) => {
    const session = await apiRequest('/api/auth/login', { method: 'POST', body: { email, password } })
    if (!session.token || !['ASISTENTE', 'GERENTE'].includes(session.user?.role) || !(Date.parse(session.expiresAt) > Date.now())) {
      throw new Error('No se pudo validar la sesión del servidor.')
    }
    setState({ session, notice: '' })
  }, [])

  const request = useCallback(async (path, options = {}) => {
    try {
      return await apiRequest(path, { ...options, token })
    } catch (error) {
      if (error.status === 401) clearSession(token, 'Tu sesión venció o ya no está disponible. Inicia sesión nuevamente.')
      throw error
    }
  }, [token, clearSession])

  const signOut = useCallback(async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      if (error.status !== 401) throw error
    }
    clearSession(token)
  }, [request, token, clearSession])

  useEffect(() => {
    if (!state.session) return undefined
    const expiresAt = Date.parse(state.session.expiresAt)
    const expire = () => clearSession(token, 'Tu sesión venció. Inicia sesión nuevamente.')
    const checkExpiry = () => { if (Date.now() >= expiresAt) expire() }
    const timer = setTimeout(expire, Math.max(0, expiresAt - Date.now()))
    window.addEventListener('focus', checkExpiry)
    return () => { clearTimeout(timer); window.removeEventListener('focus', checkExpiry) }
  }, [state.session, token, clearSession])

  const value = useMemo(() => ({ user: state.session?.user || null, notice: state.notice, signIn, signOut, request }), [state, signIn, signOut, request])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
