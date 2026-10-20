import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import request from 'supertest'
import { crearAplicacion } from '../src/app.js'
import { calcularResumenToken } from '../src/auth/service.js'

const token = 'a'.repeat(64)
const configuracion = {
  frontendUrl: 'http://localhost:5173',
  sessionMinutes: 60,
  loginWindowMs: 60000,
  loginLimit: 100,
}
const filaObligacion = {
  id: 81,
  concepto: 'Servicio de limpieza',
  beneficiario: 'Proveedor de prueba',
  monto_original: '120.50',
  saldo_pendiente: '120.50',
  fecha_limite: '1000-01-01',
  fecha_registro: '2026-10-18 15:00:00.123',
  usuario_creador_id: 99,
}

function normalizarConsulta(consulta) {
  return consulta.replace(/\s+/g, ' ').trim()
}

async function prepararAplicacion({ rol = 'ASISTENTE', sesionValida = true, filas = [filaObligacion], errorLectura } = {}) {
  // Respuestas puntuales: el doble no aplica filtros ni simula una base de datos.
  const ejecutar = mock.fn(async (consulta, parametros) => {
    const sql = normalizarConsulta(consulta)
    assert.match(sql, /^SELECT /)
    if (sql.includes('FROM sesiones s JOIN usuarios u')) {
      assert.deepEqual(parametros, [calcularResumenToken(token)])
      return [sesionValida ? [{ session_id: 7, id: 42, nombre: 'Asistente de prueba', email: 'asistente@example.test', codigo: rol }] : []]
    }
    if (sql.includes(' FROM obligaciones')) {
      if (errorLectura) throw errorLectura
      return [filas.map((fila) => ({ ...fila }))]
    }
    throw new Error('La prueba recibió una consulta inesperada.')
  })
  const obtenerConexion = mock.fn(async () => { throw new Error('La consulta no debe abrir una transacción.') })
  const aplicacion = await crearAplicacion({ pool: { execute: ejecutar, getConnection: obtenerConexion }, config: configuracion })
  return { aplicacion, ejecutar, obtenerConexion }
}

function lecturasObligaciones(ejecutar) {
  return ejecutar.mock.calls.filter(({ arguments: argumentos }) => normalizarConsulta(argumentos[0]).includes(' FROM obligaciones'))
}

function comprobarSoloLecturas(ejecutar, obtenerConexion) {
  for (const { arguments: argumentos } of ejecutar.mock.calls) assert.match(normalizarConsulta(argumentos[0]), /^SELECT /)
  assert.equal(obtenerConexion.mock.callCount(), 0)
}

function fechaActualLima() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const valor = (tipo) => partes.find((parte) => parte.type === tipo).value
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

test('consulta de obligaciones: ASISTENTE lista obligaciones ajenas con estado económico y vencimiento independientes', async () => {
  const filas = [
    filaObligacion,
    { ...filaObligacion, id: 80, saldo_pendiente: '20.50', fecha_limite: '9999-12-31' },
    { ...filaObligacion, id: 79, saldo_pendiente: '0.00' },
  ]
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ filas })
  const respuesta = await request(aplicacion).get('/api/obligaciones').auth(token, { type: 'bearer' }).expect(200)
  assert.deepEqual(respuesta.body, {
    obligaciones: filas.map((fila, indice) => ({
      ...fila,
      fecha_registro: '2026-10-18T15:00:00.123Z',
      estado_economico: ['PENDIENTE', 'PARCIAL', 'PAGADO'][indice],
      vencida: indice === 0,
    })),
  })
  assert.equal(respuesta.headers['cache-control'], 'no-store')
  const [lectura] = lecturasObligaciones(ejecutar)
  assert.equal(lecturasObligaciones(ejecutar).length, 1)
  const [consulta, parametros] = lectura.arguments
  const sql = normalizarConsulta(consulta)
  assert.ok(!sql.includes(' WHERE '))
  assert.match(sql, / ORDER BY fecha_registro DESC,\s*id DESC$/)
  assert.deepEqual(parametros, [])
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

test('consulta de obligaciones: el detalle permite consultar el creador 99 con la sesión del asistente 42', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion()
  const respuesta = await request(aplicacion).get('/api/obligaciones/81').auth(token, { type: 'bearer' }).expect(200)
  assert.deepEqual(respuesta.body, {
    obligacion: { ...filaObligacion, fecha_registro: '2026-10-18T15:00:00.123Z', estado_economico: 'PENDIENTE', vencida: true },
  })
  assert.equal(respuesta.headers['cache-control'], 'no-store')
  const [lectura] = lecturasObligaciones(ejecutar)
  assert.equal(lecturasObligaciones(ejecutar).length, 1)
  assert.match(normalizarConsulta(lectura.arguments[0]), / FROM obligaciones WHERE id = \?$/)
  assert.deepEqual(lectura.arguments[1], [81])
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

test('consulta de obligaciones: el listado vacío devuelve 200 y un arreglo vacío', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ filas: [] })
  const respuesta = await request(aplicacion).get('/api/obligaciones').auth(token, { type: 'bearer' }).expect(200)
  assert.deepEqual(respuesta.body, { obligaciones: [] })
  assert.equal(lecturasObligaciones(ejecutar).length, 1)
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

test('consulta de obligaciones: el detalle inexistente devuelve 404', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ filas: [] })
  const respuesta = await request(aplicacion).get('/api/obligaciones/81').auth(token, { type: 'bearer' }).expect(404)
  assert.deepEqual(respuesta.body, { message: 'Obligación no encontrada.' })
  assert.equal(lecturasObligaciones(ejecutar).length, 1)
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

for (const [filtro, predicado, fila, estado, vencida] of [
  ['pendiente', 'saldo_pendiente = monto_original', filaObligacion, 'PENDIENTE', true],
  ['parcial', 'saldo_pendiente > 0 AND saldo_pendiente < monto_original', { ...filaObligacion, saldo_pendiente: '20.50' }, 'PARCIAL', true],
  ['pagado', 'saldo_pendiente = 0', { ...filaObligacion, saldo_pendiente: '0.00' }, 'PAGADO', false],
  ['vencido', 'saldo_pendiente > 0 AND fecha_limite < ?', { ...filaObligacion, saldo_pendiente: '20.50' }, 'PARCIAL', true],
]) {
  test(`consulta de obligaciones: filtro ${filtro} usa un predicado fijo de solo lectura`, async () => {
    const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ filas: [fila] })
    const fechaAntes = fechaActualLima()
    const respuesta = await request(aplicacion).get('/api/obligaciones').query({ filtro }).auth(token, { type: 'bearer' }).expect(200)
    const fechaDespues = fechaActualLima()
    assert.deepEqual(respuesta.body, {
      obligaciones: [{ ...fila, fecha_registro: '2026-10-18T15:00:00.123Z', estado_economico: estado, vencida }],
    })
    const [lectura] = lecturasObligaciones(ejecutar)
    assert.equal(lecturasObligaciones(ejecutar).length, 1)
    const sql = normalizarConsulta(lectura.arguments[0])
    assert.ok(sql.endsWith(` WHERE ${predicado} ORDER BY fecha_registro DESC, id DESC`))
    if (filtro === 'vencido') {
      assert.equal(lectura.arguments[1].length, 1)
      assert.ok([fechaAntes, fechaDespues].includes(lectura.arguments[1][0]))
    } else {
      assert.deepEqual(lectura.arguments[1], [])
    }
    comprobarSoloLecturas(ejecutar, obtenerConexion)
  })
}

test('consulta de obligaciones: filtros desconocidos, repetidos, vacíos o adicionales devuelven 422 antes de leer obligaciones', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion()
  for (const consulta of [
    '?filtro=',
    '?filtro=desconocido',
    '?filtro=PENDIENTE',
    '?filtro=%20pendiente%20',
    '?filtro=pendiente&filtro=parcial',
    '?filtro%5B%5D=pendiente',
    '?estado=pendiente',
    '?filtro=pendiente&usuario_creador_id=42',
    '?filtro=pagado%27%20OR%201%3D1',
  ]) {
    const respuesta = await request(aplicacion).get(`/api/obligaciones${consulta}`).auth(token, { type: 'bearer' }).expect(422)
    assert.equal(respuesta.body.message, 'Revisa los datos de la consulta.')
    assert.ok(Object.keys(respuesta.body.fields).length > 0)
  }
  assert.equal(lecturasObligaciones(ejecutar).length, 0)
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

test('consulta de obligaciones: identificadores inválidos devuelven 422 sin consultar obligaciones', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion()
  for (const id of ['0', '-1', '01', '1.5', 'abc', '1e2', '4294967296', '9007199254740992', '81%20OR%201%3D1']) {
    const respuesta = await request(aplicacion).get(`/api/obligaciones/${id}`).auth(token, { type: 'bearer' }).expect(422)
    assert.equal(respuesta.body.message, 'Revisa los datos de la consulta.')
    assert.equal(typeof respuesta.body.fields.id, 'string')
  }
  assert.equal(lecturasObligaciones(ejecutar).length, 0)
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

test('consulta de obligaciones: ambas rutas devuelven 401 sin token válido incluso con parámetros inválidos', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion()
  for (const ruta of ['/api/obligaciones?filtro=invalido', '/api/obligaciones/no-valido']) {
    await request(aplicacion).get(ruta).expect(401)
    await request(aplicacion).get(ruta).set('Authorization', 'Bearer invalido').expect(401)
  }
  assert.equal(ejecutar.mock.callCount(), 0)
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

test('consulta de obligaciones: ambas rutas devuelven 401 si la sesión no existe o venció', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ sesionValida: false })
  for (const ruta of ['/api/obligaciones', '/api/obligaciones/81']) {
    await request(aplicacion).get(ruta).auth(token, { type: 'bearer' }).expect(401)
  }
  assert.equal(ejecutar.mock.callCount(), 2)
  assert.equal(lecturasObligaciones(ejecutar).length, 0)
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

test('HU-06: GERENTE consulta el listado real incluidos pagos parciales y completos, con solo lecturas', async () => {
  const filas = [filaObligacion, { ...filaObligacion, id: 80, saldo_pendiente: '20.50' }, { ...filaObligacion, id: 79, saldo_pendiente: '0.00' }]
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ rol: 'GERENTE', filas })
  const respuesta = await request(aplicacion).get('/api/obligaciones').auth(token, { type: 'bearer' }).expect(200)
  assert.deepEqual(respuesta.body.obligaciones.map((fila) => fila.estado_economico), ['PENDIENTE', 'PARCIAL', 'PAGADO'])
  assert.equal(respuesta.body.obligaciones[2].saldo_pendiente, '0.00')
  assert.equal(respuesta.headers['cache-control'], 'no-store')
  assert.equal(lecturasObligaciones(ejecutar).length, 1)
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

test('GERENTE valida consultas y conserva el bloqueo de todas las escrituras', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ rol: 'GERENTE' })
  await request(aplicacion).get('/api/obligaciones?filtro=invalido').auth(token, { type: 'bearer' }).expect(422)
  await request(aplicacion).get('/api/obligaciones/no-valido').auth(token, { type: 'bearer' }).set('X-Role', 'ASISTENTE').expect(422)
  await request(aplicacion).post('/api/obligaciones').auth(token, { type: 'bearer' }).send({}).expect(403)
  await request(aplicacion).post('/api/obligaciones/81/abonos').auth(token, { type: 'bearer' }).send({}).expect(403)
  assert.equal(ejecutar.mock.callCount(), 4)
  assert.equal(lecturasObligaciones(ejecutar).length, 0)
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

test('GERENTE consulta el detalle real sin abrir transacciones ni alterar saldos', async () => {
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ rol: 'GERENTE' })
  const respuesta = await request(aplicacion).get('/api/obligaciones/81').auth(token, { type: 'bearer' }).expect(200)
  assert.equal(respuesta.body.obligacion.id, 81)
  assert.equal(respuesta.body.obligacion.saldo_pendiente, '120.50')
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})

test('consulta de obligaciones: los errores SQL de ambas rutas conservan 500 sin exponer detalles', async (contexto) => {
  const error = Object.assign(new Error('SELECT obligaciones: detalle privado del proveedor'), { code: 'ER_LECTURA' })
  const { aplicacion, ejecutar, obtenerConexion } = await prepararAplicacion({ errorLectura: error })
  const registrarError = contexto.mock.method(console, 'error', () => {})
  for (const ruta of ['/api/obligaciones', '/api/obligaciones/81']) {
    const respuesta = await request(aplicacion).get(ruta).auth(token, { type: 'bearer' }).expect(500)
    assert.deepEqual(respuesta.body, { message: 'No se pudo completar la operación. Intenta nuevamente.' })
  }
  assert.equal(lecturasObligaciones(ejecutar).length, 2)
  assert.equal(registrarError.mock.callCount(), 2)
  for (const llamada of registrarError.mock.calls) assert.deepEqual(llamada.arguments, ['Error de API:', 'ER_LECTURA'])
  comprobarSoloLecturas(ejecutar, obtenerConexion)
})
