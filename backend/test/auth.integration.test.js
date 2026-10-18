import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import argon2 from 'argon2'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createUser, hashToken } from '../src/auth/service.js'
import { migrate } from '../src/db/migrate.js'
import { fixtureUser, openTestDatabase, removeFixture } from './support/database.js'

let pool
let config
let app
let assistant
let manager
const fixtures = []

before(async () => {
  ;({ pool, config } = await openTestDatabase())
  app = await createApp({ pool, config: { ...config, loginLimit: 100 } })
  assistant = await fixtureUser(pool)
  fixtures.push(assistant)
  manager = await fixtureUser(pool, 'GERENTE')
  fixtures.push(manager)
})

after(async () => {
  if (!pool) return
  try { for (const fixture of fixtures) await removeFixture(pool, fixture) } finally { await pool.end() }
})

async function login(user = assistant, target = app) {
  return request(target).post('/api/auth/login').send({ email: user.email, password: user.password }).expect(200)
}

test('MySQL real: migraciones repetibles conservan usuarios y roles sin duplicar datos', async () => {
  const [[before]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios')
  assert.deepEqual(await migrate(pool), [])
  const [[after]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios')
  assert.equal(after.total, before.total)
  const [roles] = await pool.query('SELECT codigo FROM roles ORDER BY codigo')
  assert.deepEqual(roles.map((row) => row.codigo), ['ASISTENTE', 'GERENTE'])
  const [[migration]] = await pool.execute('SELECT COUNT(*) AS total FROM schema_migrations WHERE name = ?', ['001_access.sql'])
  assert.equal(Number(migration.total), 1)
})

test('login conserva Argon2id y solo guarda el hash del token; /me no expone secretos', async () => {
  const response = await login()
  const { token, user, expiresAt } = response.body
  assert.match(token, /^[a-f0-9]{64}$/)
  assert.deepEqual(user, { id: assistant.id, name: assistant.name, email: assistant.email, role: 'ASISTENTE' })
  assert.ok(Date.parse(expiresAt) > Date.now())
  assert.ok(Date.parse(expiresAt) <= Date.now() + config.sessionMinutes * 60000)
  assert.equal(response.headers['cache-control'], 'no-store')
  const [[stored]] = await pool.execute('SELECT password_hash FROM usuarios WHERE id = ?', [assistant.id])
  assert.ok(stored.password_hash.startsWith('$argon2id$'))
  assert.ok(await argon2.verify(stored.password_hash, assistant.password))
  const [[session]] = await pool.execute('SELECT token_hash FROM sesiones WHERE token_hash = ?', [hashToken(token)])
  assert.notEqual(session.token_hash, token)
  const me = await request(app).get('/api/auth/me').auth(token, { type: 'bearer' }).expect(200)
  assert.deepEqual(me.body, { user })
})

test('ambos roles pueden iniciar sesión y solo acceden a su panel; el rol del cliente no concede acceso', async () => {
  for (const [user, allowed, denied] of [[assistant, 'asistente', 'gerente'], [manager, 'gerente', 'asistente']]) {
    const { body } = await login(user)
    await request(app).get(`/api/panel/${allowed}`).auth(body.token, { type: 'bearer' }).expect(200)
    await request(app).get(`/api/panel/${denied}`).auth(body.token, { type: 'bearer' }).set('X-Role', denied.toUpperCase()).expect(403)
  }
  await request(app).post('/api/auth/login').send({ email: assistant.email, password: assistant.password, role: 'GERENTE' }).expect(422)
})

test('sin sesión, con token alterado o enviado como query se devuelve 401', async () => {
  for (const path of ['/api/auth/me', '/api/panel/asistente', '/api/panel/gerente']) {
    await request(app).get(path).expect(401)
    await request(app).get(path).auth(randomBytes(32).toString('hex'), { type: 'bearer' }).expect(401)
  }
  const { body } = await login()
  await request(app).get('/api/auth/me').query({ token: body.token }).expect(401)
})

test('usuario inexistente, contraseña incorrecta e inactivo producen el mismo error', async () => {
  const inactive = await fixtureUser(pool)
  fixtures.push(inactive)
  await pool.execute('UPDATE usuarios SET activo = FALSE WHERE id = ?', [inactive.id])
  const bodies = []
  for (const credentials of [
    { email: `missing-${randomBytes(8).toString('hex')}@example.test`, password: assistant.password },
    { email: assistant.email, password: randomBytes(24).toString('hex') },
    { email: inactive.email, password: inactive.password },
  ]) {
    const response = await request(app).post('/api/auth/login').send(credentials).expect(401)
    bodies.push(response.body)
  }
  assert.deepEqual(bodies[0], bodies[1])
  assert.deepEqual(bodies[1], bodies[2])
})

test('logout revoca en MySQL y el token anterior deja de funcionar', async () => {
  const { body } = await login()
  await request(app).post('/api/auth/logout').auth(body.token, { type: 'bearer' }).expect(204)
  await request(app).get('/api/auth/me').auth(body.token, { type: 'bearer' }).expect(401)
  const [[session]] = await pool.execute('SELECT revocado_en FROM sesiones WHERE token_hash = ?', [hashToken(body.token)])
  assert.ok(session.revocado_en)
})

test('una sesión vencida se rechaza usando el reloj de MySQL', async () => {
  const { body } = await login()
  await pool.execute('UPDATE sesiones SET vence_en = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE token_hash = ?', [hashToken(body.token)])
  await request(app).get('/api/auth/me').auth(body.token, { type: 'bearer' }).expect(401)
})

test('desactivar al usuario invalida el acceso de una sesión existente', async () => {
  const user = await fixtureUser(pool)
  fixtures.push(user)
  const { body } = await login(user)
  await pool.execute('UPDATE usuarios SET activo = FALSE WHERE id = ?', [user.id])
  await request(app).get('/api/auth/me').auth(body.token, { type: 'bearer' }).expect(401)
})

test('la autorización vuelve a consultar el rol en MySQL en cada petición', async () => {
  const user = await fixtureUser(pool)
  fixtures.push(user)
  const { body } = await login(user)
  await pool.execute('UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE codigo = ?) WHERE id = ?', ['GERENTE', user.id])
  await request(app).get('/api/panel/asistente').auth(body.token, { type: 'bearer' }).expect(403)
  await request(app).get('/api/panel/gerente').auth(body.token, { type: 'bearer' }).expect(200)
})

test('sesiones persisten al crear una nueva instancia de Express', async () => {
  const { body } = await login()
  const restarted = await createApp({ pool, config })
  await request(restarted).get('/api/auth/me').auth(body.token, { type: 'bearer' }).expect(200)
})

test('validación y consultas parametrizadas impiden usar entradas SQL como autenticación', async () => {
  await request(app).post('/api/auth/login').send({}).expect(422)
  await request(app).post('/api/auth/login').send({ email: {}, password: [] }).expect(422)
  await request(app).post('/api/auth/login').send({ email: "x'OR'1'='1@example.test", password: assistant.password }).expect(401)
  await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{').expect(400)
  await request(app).post('/api/auth/login').send({ email: assistant.email, password: 'x'.repeat(17000) }).expect(413)
})

test('limitación de intentos fallidos devuelve 429 y Retry-After', async () => {
  const limited = await createApp({ pool, config: { ...config, loginLimit: 2 } })
  for (let i = 0; i < 2; i++) await request(limited).post('/api/auth/login').send({ email: assistant.email, password: 'incorrecta' }).expect(401)
  const response = await request(limited).post('/api/auth/login').send({ email: assistant.email, password: assistant.password }).expect(429)
  assert.ok(response.headers['retry-after'])
})

test('el correo es único y la creación local nunca sobrescribe al usuario existente', async () => {
  await assert.rejects(() => createUser(pool, { ...assistant, email: assistant.email.toUpperCase() }), { code: 'ER_DUP_ENTRY' })
  await login(assistant)
})

test('health y CORS se conservan; respuestas autenticadas no se cachean', async () => {
  const response = await request(app).get('/api/health').set('Origin', config.frontendUrl).expect(200)
  assert.equal(response.body.status, 'ok')
  assert.equal(response.headers['access-control-allow-origin'], config.frontendUrl)
  assert.equal(response.headers['x-powered-by'], undefined)
  const foreign = await request(app).options('/api/auth/login').set('Origin', 'https://otro.example').set('Access-Control-Request-Method', 'POST').expect(204)
  assert.notEqual(foreign.headers['access-control-allow-origin'], 'https://otro.example')
  await request(app).get('/api/no-existe').expect(404)
})
