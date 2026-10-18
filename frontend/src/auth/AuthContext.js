import { createContext } from 'react'

export const ContextoAutenticacion = createContext(null)
export const inicioPorRol = (rol) => rol === 'ASISTENTE' ? '/asistente' : '/gerente'
