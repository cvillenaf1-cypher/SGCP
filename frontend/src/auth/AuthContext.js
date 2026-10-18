import { createContext } from 'react'

export const AuthContext = createContext(null)
export const homeForRole = (role) => role === 'ASISTENTE' ? '/asistente' : '/gerente'
