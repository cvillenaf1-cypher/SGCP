import { autorizar } from './middleware.js'
import { ROLES } from './validation.js'

// Los roles financieros nunca heredan este permiso de configuración.
export const PERMISOS = Object.freeze({ CONFIGURAR_PERFIL: 'CONFIGURAR_PERFIL' })
const rolesPorPermiso = Object.freeze({ [PERMISOS.CONFIGURAR_PERFIL]: [ROLES.CONFIGURADOR] })

export function requerirPermiso(permiso) {
  return autorizar(...(rolesPorPermiso[permiso] || []))
}
