import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import request from 'supertest'
import { crearAplicacion } from '../src/app.js'
import { calcularResumenToken } from '../src/auth/service.js'
import { crearConexiones } from '../src/db/pool.js'

const token = 'a'.repeat(64)
const configuracion = {
  frontendUrl: 'http://localhost:5173',
  sessionMinutes: 60,
  loginWindowMs: 60000,
  loginLimit: 100,
}
const entrada = {
  concepto: '  Servicio de limpieza  ',
  beneficiario: '  Proveedor de prueba  ',
  monto: '120.5',
  fecha_limite: '2020-01-01',
}
const filaObligacion = {
  id: 81,
  concepto: 'Servicio de limpieza',
  beneficiario: 'Proveedor de prueba',
  monto_original: '120.50',
  saldo_pendiente: '120.50',
  fecha_limite: '2020-01-01',
  fecha_registro: '2026-10-18 15:00:00.000',
  usuario_creador_id: 42,
}

function normalizarConsulta(consulta) {
  return consulta.replace(/\s+/g, ' ').trim()
}

async function prepararAplicacion({ rol = 'ASISTENTE', sesionValida = true, errorInsercion, errorLectura, fechaRegistro = filaObligacion.fecha_registro } = {}) {
  // Respuestas puntuales del pool inyectado; no sustituye la autenticación ni crea una base de datos.
  const ejecutar = mock.fn(async (consulta, parametros) => {
    const sql = normalizarConsulta(consulta)
    if (sql.includes('FROM sesiones s JOIN usuarios u')) {
      assert.deepEqual(parametros, [calcularResumenToken(token)])
      return [sesionValida ? [{ session_id: 7, id: 42, nombre: 'Asistente de prueba', email: 'asistente@example.test', codigo: rol }] : []]
    }
    if (sql.startsWith('INSERT INTO obligaciones ')) {
      if (errorInsercion) throw errorInsercion
      return [{ insertId: filaObligacion.id, affectedRows: 1 }]
    }
    if (sql.startsWith('SELECT ') && sql.includes(' FROM obligaciones WHERE id = ?')) {
      assert.deepEqual(parametros, [filaObligacion.id])
      if (errorLectura) throw errorLectura
      return [[{ ...filaObligacion, fecha_registro: fechaRegistro }]]
    }
    throw new Error('La prueba recibió una consulta inesperada.')
  })
  const conexion = {
    execute: ejecutar,
    beginTransaction: mock.fn(async () => {}),
    commit: mock.fn(async () => {}),
    rollback: mock.fn(async () => {}),
    release: mock.fn(() => {}),
  }
  const obtenerConexion = mock.fn(async () => conexion)
  const aplicacion = await crearAplicacion({ pool: { execute: ejecutar, getConnection: obtenerConexion }, config: configuracion })
  return { aplicacion, ejecutar, conexion, obtenerConexion }
}

function inserciones(ejecutar) {
  return ejecutar.mock.calls.filter(({ arguments: argumentos }) => normalizarConsulta(argumentos[0]).startsWith('INSERT INTO obligaciones '))
}

test('obligaciones: el pool real configura DATETIME como cadena sin typeCast personalizado', async () => {
  // El pool es perezoso: inspeccionar su configuración no abre conexiones MySQL.
  const conexiones = crearConexiones({})
  try {
    const configuracionPool = conexiones.pool.config.connectionConfig
    assert.equal(configuracionPool.dateStrings, true)
    assert.equal(configuracionPool.timezone, 'Z')
    assert.equal(configuracionPool.typeCast, true)
    assert.equal(conexiones.pool._allConnections.length, 0)
  } finally {
    await conexiones.end()
  }
})

test('obligaciones: fecha_registro como cadena conserva milisegundos y se expresa en UTC', async () => {
  // execute puede omitir la fracción cuando los microsegundos del DATETIME son cero.
  for (const [fechaRegistro, esperada] of [
    ['2026-10-18 15:00:00.123', '2026-10-18T15:00:00.123Z'],
    ['2026-10-18 15:00:00', '2026-10-18T15:00:00Z'],
  ]) {
    const { aplicacion } = await prepararAplicacion({ fechaRegistro })
    const respuesta = await request(aplicacion).post('/api/obligaciones')
      .auth(token, { type: 'bearer' }).send(entrada).expect(201)
    assert.equal(typeof respuesta.body.obligacion.fecha_registro, 'string')
    assert.equal(respuesta.body.obligacion.fecha_registro, esperada)
    assert.equal(respuesta.body.obligacion.fecha_limite, entrada.fecha_limite)
  }
})

test('registro: sin token o con formato incorrecto devuelve 401 sin consultar MySQL', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion()
  await request(aplicacion).post('/api/obligaciones').send(entrada).expect(401)
  for (const autorizacion of ['Bearer invalido', 'Basic credenciales', 'Bearer ' + 'z'.repeat(64)]) {
    await request(aplicacion).post('/api/obligaciones').set('Authorization', autorizacion).send(entrada).expect(401)
  }
  assert.equal(ejecutar.mock.callCount(), 0)
  assert.equal(obtenerConexion.mock.callCount(), 0)
})

test('registro: una sesión inexistente o no vigente devuelve 401 sin insertar', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ sesionValida: false })
  await request(aplicacion).post('/api/obligaciones').auth(token, { type: 'bearer' }).send(entrada).expect(401)
  assert.equal(ejecutar.mock.callCount(), 1)
  assert.equal(inserciones(ejecutar).length, 0)
  assert.equal(obtenerConexion.mock.callCount(), 0)
})

test('registro: GERENTE recibe 403 aunque intente enviar rol ASISTENTE', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ rol: 'GERENTE' })
  await request(aplicacion).post('/api/obligaciones').auth(token, { type: 'bearer' }).send(entrada).expect(403)
  await request(aplicacion).post('/api/obligaciones')
    .auth(token, { type: 'bearer' })
    .set('X-Role', 'ASISTENTE')
    .send({ ...entrada, role: 'ASISTENTE' })
    .expect(403)
  assert.equal(ejecutar.mock.callCount(), 2)
  assert.equal(inserciones(ejecutar).length, 0)
  assert.equal(obtenerConexion.mock.callCount(), 0)
})

test('registro: ASISTENTE obtiene 201 con monto exacto, saldo inicial y fecha automática', async () => {
  const { aplicacion, ejecutar, conexion, obtenerConexion } = await prepararAplicacion()
  const respuesta = await request(aplicacion).post('/api/obligaciones')
    .auth(token, { type: 'bearer' })
    .send(entrada)
    .expect(201)
  assert.deepEqual(respuesta.body, {
    message: 'Obligación registrada correctamente.',
    obligacion: { ...filaObligacion, fecha_registro: '2026-10-18T15:00:00.000Z' },
  })
  assert.equal(respuesta.headers['cache-control'], 'no-store')
  const [insercion] = inserciones(ejecutar)
  assert.ok(insercion)
  const [consulta, parametros] = insercion.arguments
  assert.equal(normalizarConsulta(consulta), 'INSERT INTO obligaciones (concepto, beneficiario, monto_original, saldo_pendiente, fecha_limite, usuario_creador_id) VALUES (?, ?, ?, ?, ?, ?)')
  assert.deepEqual(parametros, ['Servicio de limpieza', 'Proveedor de prueba', '120.50', '120.50', '2020-01-01', 42])
  assert.equal(ejecutar.mock.callCount(), 3)
  assert.equal(obtenerConexion.mock.callCount(), 1)
  assert.equal(conexion.beginTransaction.mock.callCount(), 1)
  assert.equal(conexion.commit.mock.callCount(), 1)
  assert.equal(conexion.rollback.mock.callCount(), 0)
  assert.equal(conexion.release.mock.callCount(), 1)
})

test('registro: datos inválidos devuelven 422 y no se insertan', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion()
  for (const cuerpo of [
    {},
    { ...entrada, concepto: ' \t\n ' },
    { ...entrada, beneficiario: 'x'.repeat(256) },
    { ...entrada, monto: '0' },
    { ...entrada, monto: '120.501' },
    { ...entrada, monto: '100000.01' },
    { ...entrada, monto: '99999999999.99' },
    { ...entrada, monto: 120.5 },
    { ...entrada, fecha_limite: '2025-02-29' },
  ]) {
    const respuesta = await request(aplicacion).post('/api/obligaciones')
      .auth(token, { type: 'bearer' }).send(cuerpo).expect(422)
    assert.equal(typeof respuesta.body.message, 'string')
    assert.ok(Object.keys(respuesta.body.fields).length > 0)
  }
  assert.equal(inserciones(ejecutar).length, 0)
  assert.equal(obtenerConexion.mock.callCount(), 0)
})

test('registro: el cliente no puede asignar creador, saldo, estado ni fecha de registro', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion()
  for (const campos of [
    { usuario_creador_id: 999 },
    { usuario_creador: 999 },
    { saldo_pendiente: '0.00' },
    { estado: 'PAGADO' },
    { fecha_registro: '2000-01-01T00:00:00.000Z' },
    { role: 'ASISTENTE' },
  ]) {
    const respuesta = await request(aplicacion).post('/api/obligaciones')
      .auth(token, { type: 'bearer' }).send({ ...entrada, ...campos }).expect(422)
    assert.ok(Object.keys(respuesta.body.fields).length > 0)
  }
  assert.equal(inserciones(ejecutar).length, 0)
  assert.equal(obtenerConexion.mock.callCount(), 0)
})

test('registro: JSON inválido conserva el contrato 400 de la API', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion()
  const respuesta = await request(aplicacion).post('/api/obligaciones')
    .auth(token, { type: 'bearer' }).set('Content-Type', 'application/json').send('{').expect(400)
  assert.deepEqual(respuesta.body, { message: 'El cuerpo JSON no es válido.' })
  assert.equal(ejecutar.mock.callCount(), 0)
  assert.equal(obtenerConexion.mock.callCount(), 0)
})

test('registro: un error SQL devuelve 500 sin exponer consulta ni detalles', async (contexto) => {
  const error = Object.assign(new Error('INSERT INTO obligaciones: detalle privado del proveedor'), { code: 'ER_PRUEBA' })
  const { aplicacion, ejecutar, conexion, obtenerConexion } = await prepararAplicacion({ errorInsercion: error })
  const registrarError = contexto.mock.method(console, 'error', () => {})
  const respuesta = await request(aplicacion).post('/api/obligaciones')
    .auth(token, { type: 'bearer' }).send(entrada).expect(500)
  assert.deepEqual(respuesta.body, { message: 'No se pudo completar la operación. Intenta nuevamente.' })
  assert.equal(inserciones(ejecutar).length, 1)
  assert.equal(ejecutar.mock.callCount(), 2)
  assert.equal(obtenerConexion.mock.callCount(), 1)
  assert.equal(conexion.beginTransaction.mock.callCount(), 1)
  assert.equal(conexion.commit.mock.callCount(), 0)
  assert.equal(conexion.rollback.mock.callCount(), 1)
  assert.equal(conexion.release.mock.callCount(), 1)
  assert.deepEqual(registrarError.mock.calls[0].arguments, ['Error de API:', 'ER_PRUEBA'])
})

test('registro: un error al recuperar la obligación revierte y libera la conexión', async (contexto) => {
  const error = Object.assign(new Error('SELECT obligaciones: detalle privado del proveedor'), { code: 'ER_LECTURA' })
  const { aplicacion, ejecutar, conexion, obtenerConexion } = await prepararAplicacion({ errorLectura: error })
  const registrarError = contexto.mock.method(console, 'error', () => {})
  const respuesta = await request(aplicacion).post('/api/obligaciones')
    .auth(token, { type: 'bearer' }).send(entrada).expect(500)
  assert.deepEqual(respuesta.body, { message: 'No se pudo completar la operación. Intenta nuevamente.' })
  assert.equal(inserciones(ejecutar).length, 1)
  assert.equal(ejecutar.mock.callCount(), 3)
  assert.equal(obtenerConexion.mock.callCount(), 1)
  assert.equal(conexion.beginTransaction.mock.callCount(), 1)
  assert.equal(conexion.commit.mock.callCount(), 0)
  assert.equal(conexion.rollback.mock.callCount(), 1)
  assert.equal(conexion.release.mock.callCount(), 1)
  assert.deepEqual(registrarError.mock.calls[0].arguments, ['Error de API:', 'ER_LECTURA'])
})
