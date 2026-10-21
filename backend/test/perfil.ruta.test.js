import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import request from 'supertest'
import { crearAplicacion } from '../src/app.js'

test('perfil: un fallo de auditoría revierte la escritura y no revela datos en API ni logs', async (t) => {
  const ejecutar = mock.fn(async (sql) => {
    if (sql.startsWith('INSERT IGNORE INTO perfil_referencia')) return [{ affectedRows: 0 }]
    if (sql.includes('FROM perfil_referencia') && sql.includes('FOR UPDATE')) return [[{ id: 1, version: 1, tipo: '', nombre: '', documento: '', nombre_comercial: '' }]]
    if (sql.startsWith('UPDATE perfil_referencia')) return [{ affectedRows: 1 }]
    if (sql.startsWith('INSERT INTO perfil_auditoria')) throw Object.assign(new Error('detalle privado de SQL'), { code: 'ER_AUDITORIA' })
    throw new Error('Consulta no esperada')
  })
  const conexion = { execute: ejecutar, beginTransaction: mock.fn(async () => {}), commit: mock.fn(async () => {}), rollback: mock.fn(async () => {}), release: mock.fn() }
  const pool = { execute: async () => [[{ id: 1, session_id: 1, nombre: 'Prueba', email: 'prueba@example.test', codigo: 'CONFIGURADOR' }]], getConnection: async () => conexion }
  const app = await crearAplicacion({ pool, config: { sessionMinutes: 60, frontendUrl: 'http://localhost:5173', loginWindowMs: 60000, loginLimit: 100 } })
  const log = t.mock.method(console, 'error', () => {})
  const respuesta = await request(app).put('/api/perfil-referencia/titular').auth('a'.repeat(64), { type: 'bearer' })
    .send({ nombre: 'Titular privado', version: 1 }).expect(500)
  assert.deepEqual(respuesta.body, { message: 'No se pudo completar la operación. Intenta nuevamente.' })
  assert.equal(conexion.commit.mock.callCount(), 0)
  assert.equal(conexion.rollback.mock.callCount(), 1)
  assert.equal(conexion.release.mock.callCount(), 1)
  assert.deepEqual(log.mock.calls[0].arguments, ['Error de API:', 'ER_AUDITORIA'])
})
