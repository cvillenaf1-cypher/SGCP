import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { validateLogin, validateNewUser } from '../src/auth/validation.js'
import { readConfig } from '../src/config.js'

test('login: campos vacíos, tipos incorrectos, correo inválido y rol inyectado son rechazados', () => {
  for (const body of [undefined, [], {}, { email: {}, password: [] }, { email: 'sin-correo', password: 'x' }, { email: 'a@example.test', password: 'x', role: 'GERENTE' }]) {
    assert.ok(Object.keys(validateLogin(body).fields).length > 0)
  }
  const valid = validateLogin({ email: '  Asistente@Example.test ', password: randomBytes(16).toString('hex') })
  assert.equal(valid.email, 'asistente@example.test')
  assert.deepEqual(valid.fields, {})
})

test('alta local: exige contraseña larga y uno de los dos roles', () => {
  const input = { name: 'Prueba', email: 'prueba@example.test', password: randomBytes(24).toString('hex'), role: 'ASISTENTE' }
  assert.doesNotThrow(() => validateNewUser(input))
  assert.throws(() => validateNewUser({ ...input, password: 'corta' }), /12 y 128/)
  assert.throws(() => validateNewUser({ ...input, role: 'ADMIN' }), /ASISTENTE o GERENTE/)
  assert.throws(() => validateNewUser({ ...input, name: ' ' }), /nombre/)
})

test('configuración: falla sin credenciales y rechaza orígenes o puertos inválidos', () => {
  const env = { DB_HOST: 'localhost', DB_NAME: 'config_test', DB_USER: 'test', DB_PASSWORD: randomBytes(16).toString('hex') }
  assert.throws(() => readConfig({}), /DB_HOST/)
  assert.equal(readConfig(env).sessionMinutes, 60)
  assert.throws(() => readConfig({ ...env, PORT: '0' }), /PORT/)
  assert.throws(() => readConfig({ ...env, SESSION_TTL_MINUTES: '0' }), /SESSION_TTL/)
  assert.throws(() => readConfig({ ...env, FRONTEND_URL: 'http://localhost:5173/' }), /origen/)
  assert.throws(() => readConfig({ ...env, NODE_ENV: 'production' }), /HTTPS/)
})
