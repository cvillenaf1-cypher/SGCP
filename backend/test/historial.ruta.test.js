import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import request from 'supertest'
import { crearAplicacion } from '../src/app.js'

const token = 'a'.repeat(64)
const configuracion = { frontendUrl: 'http://localhost:5173', sessionMinutes: 60, loginWindowMs: 60000, loginLimit: 100 }

async function prepararEscenario({ rol = 'ASISTENTE', existente = true, vacio = false } = {}) {
  let saldo = vacio ? '100.00' : '30.00'
  const abonos = vacio ? [] : [
    { id: 11, monto: '20.00', medio_pago: 'Efectivo', fecha_registro: '2026-10-17 12:00:00.123', usuario_registrador_id: 42 },
    { id: 12, monto: '50.00', medio_pago: 'Transferencia bancaria', fecha_registro: '2026-10-18 12:00:00.123', usuario_registrador_id: 42 },
  ]
  const ejecutar = mock.fn(async (consulta, valores) => {
    const sql = consulta.replace(/\s+/g, ' ').trim()
    if (sql.includes('FROM sesiones s JOIN usuarios u')) {
      return [[{ session_id: 7, id: 42, nombre: 'Asistente', email: 'asistente@example.test', codigo: rol }]]
    }
    if (sql.includes('FROM obligaciones o LEFT JOIN abonos')) {
      assert.deepEqual(valores, [81])
      assert.match(sql, /^SELECT /)
      assert.match(sql, /WHERE o\.id = \? ORDER BY a\.fecha_registro DESC, a\.id DESC$/)
      if (!existente) return [[]]
      const obligacion = { obligacion_id: 81, concepto: 'Proveedor', monto_original: '100.00', saldo_pendiente: saldo }
      if (!abonos.length) return [[{ ...obligacion, abono_id: null }]]
      return [[...abonos].sort((a, b) => b.fecha_registro.localeCompare(a.fecha_registro) || b.id - a.id).map((abono) => ({
        ...obligacion, ...abono, abono_id: abono.id, comprobante_abono_id: null,
      }))]
    }
    if (sql.includes('FROM abonos WHERE usuario_registrador_id')) {
      return [abonos.filter((abono) => abono.usuario_registrador_id === valores[0] && abono.clave_idempotencia === valores[1])]
    }
    if (sql === 'SELECT id, saldo_pendiente FROM obligaciones WHERE id = ? FOR UPDATE') {
      return [[{ id: 81, saldo_pendiente: saldo }]]
    }
    if (sql.startsWith('INSERT INTO abonos ')) {
      assert.deepEqual(valores.slice(0, 4), [81, '30.00', 'Billetera digital', 42])
      const id = 13
      abonos.push({
        id, obligacion_id: valores[0], monto: valores[1], medio_pago: valores[2], usuario_registrador_id: valores[3],
        clave_idempotencia: valores[4], saldo_resultante: valores[5], huella_solicitud: valores[6], fecha_registro: '2026-10-19 12:00:00.123',
      })
      return [{ insertId: id }]
    }
    if (sql === 'UPDATE obligaciones SET saldo_pendiente = ? WHERE id = ?') {
      saldo = valores[0]
      return [{ affectedRows: 1 }]
    }
    throw new Error('Consulta inesperada en la prueba del historial.')
  })
  const conexion = {
    execute: ejecutar, beginTransaction: mock.fn(async () => {}), commit: mock.fn(async () => {}),
    rollback: mock.fn(async () => {}), release: mock.fn(() => {}),
  }
  const aplicacion = await crearAplicacion({
    pool: { execute: ejecutar, getConnection: async () => conexion }, config: configuracion,
  })
  const consultar = () => request(aplicacion).get('/api/obligaciones/81/historial').auth(token, { type: 'bearer' })
  return { aplicacion, consultar, ejecutar, conexion, abonos }
}

test('historial ruta: conserva autenticación, rol, validación y obligación inexistente', async () => {
  const asistente = await prepararEscenario({ existente: false })
  await request(asistente.aplicacion).get('/api/obligaciones/81/historial').expect(401)
  for (const id of ['0', '01', '-1', 'invalido', '4294967296']) {
    await request(asistente.aplicacion).get(`/api/obligaciones/${id}/historial`).auth(token, { type: 'bearer' }).expect(422)
  }
  const inexistente = await asistente.consultar().expect(404)
  assert.equal(inexistente.body.message, 'Obligación no encontrada.')
  const gerente = await prepararEscenario({ rol: 'GERENTE' })
  await gerente.consultar().expect(200)
  await request(gerente.aplicacion).post('/api/obligaciones/81/abonos').auth(token, { type: 'bearer' }).send({ monto: '30.00' }).expect(403)
  assert.ok(gerente.ejecutar.mock.calls.every(({ arguments: [sql] }) => /^SELECT\s/.test(sql.trimStart())))
})

test('historial ruta: sin pagos entrega una lista vacía y resumen real sin escrituras', async () => {
  const escenario = await prepararEscenario({ vacio: true })
  const respuesta = await escenario.consultar().expect(200)
  assert.equal(respuesta.headers['cache-control'], 'no-store')
  assert.deepEqual(respuesta.body.historial, {
    obligacion_id: 81, concepto: 'Proveedor', monto_original: '100.00', saldo_pendiente: '100.00',
    saldo_pendiente_calculado: '100.00', total_abonado: '0.00', estado_economico: 'PENDIENTE',
    resumen_consistente: true, advertencia: null, abonos: [],
  })
  assert.ok(escenario.ejecutar.mock.calls.every(({ arguments: [sql] }) => /^SELECT\s/.test(sql.trimStart())))
  assert.equal(escenario.conexion.beginTransaction.mock.callCount(), 0)
})

test('historial ruta: un abono nuevo aparece primero y conserva todos los pagos anteriores al completar el compromiso', async () => {
  const escenario = await prepararEscenario()
  const antes = (await escenario.consultar().expect(200)).body.historial
  const registrosAntes = structuredClone(escenario.abonos)
  assert.deepEqual(antes.abonos.map((abono) => abono.id), [12, 11])
  assert.equal(antes.total_abonado, '70.00')
  assert.equal(antes.saldo_pendiente_calculado, '30.00')

  const registro = await request(escenario.aplicacion).post('/api/obligaciones/81/abonos').auth(token, { type: 'bearer' })
    .send({ monto: '30.00', medio_pago: 'Billetera digital', clave_idempotencia: 'nuevo-abono-historial-0001' }).expect(201)
  assert.equal(registro.body.abono.id, 13)
  assert.equal(escenario.conexion.commit.mock.callCount(), 1)
  assert.equal(escenario.conexion.rollback.mock.callCount(), 0)
  assert.deepEqual(escenario.abonos.slice(0, 2), registrosAntes)

  const consultasAntes = escenario.ejecutar.mock.callCount()
  const despues = (await escenario.consultar().expect(200)).body.historial
  assert.deepEqual(despues.abonos.map((abono) => abono.id), [13, 12, 11])
  assert.deepEqual(despues.abonos.slice(1), antes.abonos)
  assert.equal(despues.abonos[0].fecha_registro, '2026-10-19T12:00:00.123Z')
  assert.equal(despues.abonos[0].monto, '30.00')
  assert.equal(despues.abonos[0].medio_pago, 'Billetera digital')
  assert.equal(despues.monto_original, '100.00')
  assert.equal(despues.total_abonado, '100.00')
  assert.equal(despues.saldo_pendiente_calculado, '0.00')
  assert.equal(despues.estado_economico, 'PAGADO')
  assert.equal(despues.resumen_consistente, true)
  assert.deepEqual((await escenario.consultar().expect(200)).body.historial, despues)
  assert.ok(escenario.ejecutar.mock.calls.slice(consultasAntes).every(({ arguments: [sql] }) => /^SELECT\s/.test(sql.trimStart())))
  assert.deepEqual(escenario.abonos.slice(0, 2), registrosAntes)
})
