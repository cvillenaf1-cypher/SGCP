import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import argon2 from 'argon2'
import request from 'supertest'
import { crearAplicacion } from '../src/app.js'
import { crearUsuario, calcularResumenToken } from '../src/auth/service.js'
import { migrar } from '../src/db/migrate.js'
import { crearUsuarioPrueba, abrirBasePruebas, eliminarUsuarioPrueba } from './support/database.js'

let conexiones
let configuracion
let aplicacion
let asistente
let gerente
const usuariosPrueba = []

before(async () => {
  ;({ pool: conexiones, config: configuracion } = await abrirBasePruebas())
  aplicacion = await crearAplicacion({ pool: conexiones, config: { ...configuracion, loginLimit: 100 } })
  asistente = await crearUsuarioPrueba(conexiones)
  usuariosPrueba.push(asistente)
  gerente = await crearUsuarioPrueba(conexiones, 'GERENTE')
  usuariosPrueba.push(gerente)
})

after(async () => {
  if (!conexiones) return
  try { for (const usuario of usuariosPrueba) await eliminarUsuarioPrueba(conexiones, usuario) } finally { await conexiones.end() }
})

async function iniciarSesion(usuario = asistente, destino = aplicacion) {
  return request(destino).post('/api/auth/login').send({ email: usuario.email, password: usuario.password }).expect(200)
}

test('MySQL real: migraciones repetibles conservan usuarios y roles sin duplicar datos', async () => {
  const [[antes]] = await conexiones.query('SELECT COUNT(*) AS total FROM usuarios')
  assert.deepEqual(await migrar(conexiones), [])
  const [[despues]] = await conexiones.query('SELECT COUNT(*) AS total FROM usuarios')
  assert.equal(despues.total, antes.total)
  const [roles] = await conexiones.query('SELECT codigo FROM roles ORDER BY codigo')
  assert.deepEqual(roles.map((fila) => fila.codigo), ['ASISTENTE', 'CONFIGURADOR', 'GERENTE'])
  const [[migracion]] = await conexiones.execute('SELECT COUNT(*) AS total FROM schema_migrations WHERE name = ?', ['001_access.sql'])
  assert.equal(Number(migracion.total), 1)
})

test('login conserva Argon2id y solo guarda el hash del token; /me no expone secretos', async () => {
  const respuesta = await iniciarSesion()
  const { token, user: usuario, expiresAt: vencimiento } = respuesta.body
  assert.match(token, /^[a-f0-9]{64}$/)
  assert.deepEqual(usuario, { id: asistente.id, name: asistente.name, email: asistente.email, role: 'ASISTENTE' })
  assert.ok(Date.parse(vencimiento) > Date.now())
  assert.ok(Date.parse(vencimiento) <= Date.now() + configuracion.sessionMinutes * 60000)
  assert.equal(respuesta.headers['cache-control'], 'no-store')
  const [[almacenado]] = await conexiones.execute('SELECT password_hash FROM usuarios WHERE id = ?', [asistente.id])
  assert.ok(almacenado.password_hash.startsWith('$argon2id$'))
  assert.ok(await argon2.verify(almacenado.password_hash, asistente.password))
  const [[sesion]] = await conexiones.execute('SELECT token_hash FROM sesiones WHERE token_hash = ?', [calcularResumenToken(token)])
  assert.notEqual(sesion.token_hash, token)
  const perfil = await request(aplicacion).get('/api/auth/me').auth(token, { type: 'bearer' }).expect(200)
  assert.deepEqual(perfil.body, { user: usuario })
})

test('ambos roles pueden iniciar sesión y solo acceden a su panel; el rol del cliente no concede acceso', async () => {
  for (const [usuario, permitido, denegado] of [[asistente, 'asistente', 'gerente'], [gerente, 'gerente', 'asistente']]) {
    const { body: cuerpo } = await iniciarSesion(usuario)
    await request(aplicacion).get(`/api/panel/${permitido}`).auth(cuerpo.token, { type: 'bearer' }).expect(200)
    await request(aplicacion).get(`/api/panel/${denegado}`).auth(cuerpo.token, { type: 'bearer' }).set('X-Role', denegado.toUpperCase()).expect(403)
  }
  await request(aplicacion).post('/api/auth/login').send({ email: asistente.email, password: asistente.password, role: 'GERENTE' }).expect(422)
})

test('sin sesión, con token alterado o enviado como query se devuelve 401', async () => {
  for (const ruta of ['/api/auth/me', '/api/panel/asistente', '/api/panel/gerente']) {
    await request(aplicacion).get(ruta).expect(401)
    await request(aplicacion).get(ruta).auth(randomBytes(32).toString('hex'), { type: 'bearer' }).expect(401)
  }
  const { body: cuerpo } = await iniciarSesion()
  await request(aplicacion).get('/api/auth/me').query({ token: cuerpo.token }).expect(401)
})

test('usuario inexistente, contraseña incorrecta e inactivo producen el mismo error', async () => {
  const inactivo = await crearUsuarioPrueba(conexiones)
  usuariosPrueba.push(inactivo)
  await conexiones.execute('UPDATE usuarios SET activo = FALSE WHERE id = ?', [inactivo.id])
  const cuerpos = []
  for (const credenciales of [
    { email: `missing-${randomBytes(8).toString('hex')}@example.test`, password: asistente.password },
    { email: asistente.email, password: randomBytes(24).toString('hex') },
    { email: inactivo.email, password: inactivo.password },
  ]) {
    const respuesta = await request(aplicacion).post('/api/auth/login').send(credenciales).expect(401)
    cuerpos.push(respuesta.body)
  }
  assert.deepEqual(cuerpos[0], cuerpos[1])
  assert.deepEqual(cuerpos[1], cuerpos[2])
})

test('logout revoca en MySQL y el token anterior deja de funcionar', async () => {
  const { body: cuerpo } = await iniciarSesion()
  await request(aplicacion).post('/api/auth/logout').auth(cuerpo.token, { type: 'bearer' }).expect(204)
  await request(aplicacion).get('/api/auth/me').auth(cuerpo.token, { type: 'bearer' }).expect(401)
  const [[sesion]] = await conexiones.execute('SELECT revocado_en FROM sesiones WHERE token_hash = ?', [calcularResumenToken(cuerpo.token)])
  assert.ok(sesion.revocado_en)
})

test('una sesión vencida se rechaza usando el reloj de MySQL', async () => {
  const { body: cuerpo } = await iniciarSesion()
  await conexiones.execute('UPDATE sesiones SET vence_en = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE token_hash = ?', [calcularResumenToken(cuerpo.token)])
  await request(aplicacion).get('/api/auth/me').auth(cuerpo.token, { type: 'bearer' }).expect(401)
})

test('desactivar al usuario invalida el acceso de una sesión existente', async () => {
  const usuario = await crearUsuarioPrueba(conexiones)
  usuariosPrueba.push(usuario)
  const { body: cuerpo } = await iniciarSesion(usuario)
  await conexiones.execute('UPDATE usuarios SET activo = FALSE WHERE id = ?', [usuario.id])
  await request(aplicacion).get('/api/auth/me').auth(cuerpo.token, { type: 'bearer' }).expect(401)
})

test('la autorización vuelve a consultar el rol en MySQL en cada petición', async () => {
  const usuario = await crearUsuarioPrueba(conexiones)
  usuariosPrueba.push(usuario)
  const { body: cuerpo } = await iniciarSesion(usuario)
  await conexiones.execute('UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE codigo = ?) WHERE id = ?', ['GERENTE', usuario.id])
  await request(aplicacion).get('/api/panel/asistente').auth(cuerpo.token, { type: 'bearer' }).expect(403)
  await request(aplicacion).get('/api/panel/gerente').auth(cuerpo.token, { type: 'bearer' }).expect(200)
})

test('sesiones persisten al crear una nueva instancia de Express', async () => {
  const { body: cuerpo } = await iniciarSesion()
  const reiniciada = await crearAplicacion({ pool: conexiones, config: configuracion })
  await request(reiniciada).get('/api/auth/me').auth(cuerpo.token, { type: 'bearer' }).expect(200)
})

test('validación y consultas parametrizadas impiden usar entradas SQL como autenticación', async () => {
  await request(aplicacion).post('/api/auth/login').send({}).expect(422)
  await request(aplicacion).post('/api/auth/login').send({ email: {}, password: [] }).expect(422)
  await request(aplicacion).post('/api/auth/login').send({ email: "x'OR'1'='1@example.test", password: asistente.password }).expect(401)
  await request(aplicacion).post('/api/auth/login').set('Content-Type', 'application/json').send('{').expect(400)
  await request(aplicacion).post('/api/auth/login').send({ email: asistente.email, password: 'x'.repeat(17000) }).expect(413)
})

test('limitación de intentos fallidos devuelve 429 y Retry-After', async () => {
  const limitada = await crearAplicacion({ pool: conexiones, config: { ...configuracion, loginLimit: 2 } })
  for (let i = 0; i < 2; i++) await request(limitada).post('/api/auth/login').send({ email: asistente.email, password: 'incorrecta' }).expect(401)
  const respuesta = await request(limitada).post('/api/auth/login').send({ email: asistente.email, password: asistente.password }).expect(429)
  assert.ok(respuesta.headers['retry-after'])
})

test('el correo es único y la creación local nunca sobrescribe al usuario existente', async () => {
  await assert.rejects(() => crearUsuario(conexiones, { ...asistente, email: asistente.email.toUpperCase() }), { code: 'ER_DUP_ENTRY' })
  await iniciarSesion(asistente)
})

test('health y CORS se conservan; respuestas autenticadas no se cachean', async () => {
  const respuesta = await request(aplicacion).get('/api/health').set('Origin', configuracion.frontendUrl).expect(200)
  assert.equal(respuesta.body.status, 'ok')
  assert.equal(respuesta.headers['access-control-allow-origin'], configuracion.frontendUrl)
  assert.equal(respuesta.headers['x-powered-by'], undefined)
  const externa = await request(aplicacion).options('/api/auth/login').set('Origin', 'https://otro.example').set('Access-Control-Request-Method', 'POST').expect(204)
  assert.notEqual(externa.headers['access-control-allow-origin'], 'https://otro.example')
  await request(aplicacion).get('/api/no-existe').expect(404)
})
