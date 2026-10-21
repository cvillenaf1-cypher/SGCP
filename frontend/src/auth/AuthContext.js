import { createContext } from 'react'

export const ContextoAutenticacion = createContext(null)
export const inicioPorRol = (rol) => ({ ASISTENTE: '/asistente', GERENTE: '/gerente', CONFIGURADOR: '/configuracion/perfil' })[rol] || '/login'
