export const ROLES = Object.freeze({ ASSISTANT: 'ASISTENTE', MANAGER: 'GERENTE' })

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function validEmail(value) {
  return value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value)
}

export function validateLogin(body) {
  const fields = {}
  const email = normalizeEmail(body?.email)
  if (!validEmail(email)) fields.email = 'Ingresa un correo electrónico válido.'
  if (typeof body?.password !== 'string' || body.password.length < 1 || body.password.length > 128) {
    fields.password = 'Ingresa una contraseña de hasta 128 caracteres.'
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['email', 'password'].includes(key))) {
    fields.form = 'Envía únicamente correo y contraseña.'
  }
  return { email, password: body?.password, fields }
}

export function validateNewUser({ name, email, password, role }) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new Error('El nombre debe tener entre 1 y 100 caracteres.')
  if (!validEmail(normalizeEmail(email))) throw new Error('El correo no es válido.')
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || !password.trim()) throw new Error('La contraseña debe tener entre 12 y 128 caracteres.')
  if (!Object.values(ROLES).includes(role)) throw new Error('El rol debe ser ASISTENTE o GERENTE.')
}
