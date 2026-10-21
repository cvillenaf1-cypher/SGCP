import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { validarInicioSesion, validarNuevoUsuario } from '../src/auth/validation.js'
import { leerConfiguracion } from '../src/config.js'

test('login: campos vacíos, tipos incorrectos, correo inválido y rol inyectado son rechazados', () => {
  for (const cuerpo of [undefined, [], {}, { email: {}, password: [] }, { email: 'sin-correo', password: 'x' }, { email: 'a@example.test', password: 'x', role: 'GERENTE' }]) {
    assert.ok(Object.keys(validarInicioSesion(cuerpo).fields).length > 0)
  }
  const valido = validarInicioSesion({ email: '  Asistente@Example.test ', password: randomBytes(16).toString('hex') })
  assert.equal(valido.email, 'asistente@example.test')
  assert.deepEqual(valido.fields, {})
})

test('alta local: exige contraseña larga y un rol explícito, incluido CONFIGURADOR', () => {
  const entrada = { name: 'Prueba', email: 'prueba@example.test', password: randomBytes(24).toString('hex'), role: 'ASISTENTE' }
  assert.doesNotThrow(() => validarNuevoUsuario(entrada))
  assert.doesNotThrow(() => validarNuevoUsuario({ ...entrada, role: 'CONFIGURADOR' }))
  assert.throws(() => validarNuevoUsuario({ ...entrada, password: 'corta' }), /12 y 128/)
  assert.throws(() => validarNuevoUsuario({ ...entrada, role: 'ADMIN' }), /ASISTENTE, GERENTE o CONFIGURADOR/)
  assert.throws(() => validarNuevoUsuario({ ...entrada, name: ' ' }), /nombre/)
})

test('configuración: falla sin credenciales y rechaza orígenes o puertos inválidos', () => {
  const entorno = { DB_HOST: 'localhost', DB_NAME: 'config_test', DB_USER: 'test', DB_PASSWORD: randomBytes(16).toString('hex') }
  assert.throws(() => leerConfiguracion({}), /DB_HOST/)
  assert.equal(leerConfiguracion(entorno).sessionMinutes, 60)
  assert.throws(() => leerConfiguracion({ ...entorno, PORT: '0' }), /PORT/)
  assert.throws(() => leerConfiguracion({ ...entorno, SESSION_TTL_MINUTES: '0' }), /SESSION_TTL/)
  assert.throws(() => leerConfiguracion({ ...entorno, FRONTEND_URL: 'http://localhost:5173/' }), /origen/)
  assert.throws(() => leerConfiguracion({ ...entorno, NODE_ENV: 'production' }), /HTTPS/)
})
