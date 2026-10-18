export const ROLES = Object.freeze({ ASISTENTE: 'ASISTENTE', GERENTE: 'GERENTE' })

export function normalizarCorreo(valor) {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : ''
}

export function esCorreoValido(valor) {
  return valor.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(valor)
}

export function validarInicioSesion(cuerpo) {
  const campos = {}
  const correo = normalizarCorreo(cuerpo?.email)
  if (!esCorreoValido(correo)) campos.email = 'Ingresa un correo electrónico válido.'
  if (typeof cuerpo?.password !== 'string' || cuerpo.password.length < 1 || cuerpo.password.length > 128) {
    campos.password = 'Ingresa una contraseña de hasta 128 caracteres.'
  }
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || Object.keys(cuerpo).some((clave) => !['email', 'password'].includes(clave))) {
    campos.form = 'Envía únicamente correo y contraseña.'
  }
  return { email: correo, password: cuerpo?.password, fields: campos }
}

export function validarNuevoUsuario({ name: nombre, email: correo, password: contrasena, role: rol }) {
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100) throw new Error('El nombre debe tener entre 1 y 100 caracteres.')
  if (!esCorreoValido(normalizarCorreo(correo))) throw new Error('El correo no es válido.')
  if (typeof contrasena !== 'string' || contrasena.length < 12 || contrasena.length > 128 || !contrasena.trim()) throw new Error('La contraseña debe tener entre 12 y 128 caracteres.')
  if (!Object.values(ROLES).includes(rol)) throw new Error('El rol debe ser ASISTENTE o GERENTE.')
}
