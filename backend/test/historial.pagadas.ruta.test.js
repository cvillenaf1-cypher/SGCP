import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import request from 'supertest'
import { crearAplicacion } from '../src/app.js'

test('historial: conserva los pagos de una obligacion pagada tras rechazar otro abono', async () => {
  const token = 'a'.repeat(64)
  const claveNueva = 'operacion-nueva-obligacion-pagada'
  const obligacion = {
    obligacion_id: 81, concepto: 'Prestamo cancelado',
    monto_original: '100.00', saldo_pendiente: '0.00',
  }
  const movimientos = [
    { abono_id: 12, monto: '60.00', medio_pago: 'Transferencia bancaria', fecha_registro: '2026-10-18 12:00:00.123' },
    { abono_id: 11, monto: '40.00', medio_pago: 'Efectivo', fecha_registro: '2026-10-17 12:00:00.123' },
  ]
  const ejecutar = mock.fn(async (consulta, parametros) => {
    const sql = consulta.replace(/\s+/g, ' ').trim()
    // La regresion debe conservar tanto la obligacion como sus pagos anteriores.
    assert.match(sql, /^SELECT /)
    if (sql.includes('FROM sesiones s JOIN usuarios u')) {
      return [[{ session_id: 7, id: 42, nombre: 'Asistente', email: 'asistente@example.test', codigo: 'ASISTENTE' }]]
    }
    if (sql.includes('FROM obligaciones o LEFT JOIN abonos')) {
      assert.deepEqual(parametros, [81])
      assert.match(sql, /WHERE o\.id = \? ORDER BY a\.fecha_registro DESC, a\.id DESC$/)
      return [movimientos.map((movimiento) => ({
        ...obligacion, ...movimiento, usuario_registrador_id: 42, comprobante_abono_id: null,
      }))]
    }
    if (sql.includes('FROM abonos WHERE usuario_registrador_id')) {
      assert.deepEqual(parametros, [42, claveNueva])
      return [[]]
    }
    if (sql === 'SELECT id, saldo_pendiente FROM obligaciones WHERE id = ? FOR UPDATE') {
      assert.deepEqual(parametros, [81])
      return [[{ id: 81, saldo_pendiente: '0.00' }]]
    }
    throw new Error('Consulta inesperada en la regresion del historial pagado.')
  })
  const conexion = {
    execute: ejecutar,
    beginTransaction: mock.fn(async () => {}),
    commit: mock.fn(async () => {}),
    rollback: mock.fn(async () => {}),
    release: mock.fn(() => {}),
  }
  const aplicacion = await crearAplicacion({
    pool: { execute: ejecutar, getConnection: async () => conexion },
    config: { frontendUrl: 'http://localhost:5173', sessionMinutes: 60, loginWindowMs: 60000, loginLimit: 100 },
  })
  const consultar = () => request(aplicacion).get('/api/obligaciones/81/historial').auth(token, { type: 'bearer' }).expect(200)
  const antes = await consultar()
  assert.equal(antes.body.historial.estado_economico, 'PAGADO')
  assert.equal(antes.body.historial.saldo_pendiente, '0.00')
  assert.equal(antes.body.historial.total_abonado, '100.00')
  assert.equal(antes.body.historial.resumen_consistente, true)
  assert.deepEqual(antes.body.historial.abonos.map(({ id, monto }) => ({ id, monto })), [
    { id: 12, monto: '60.00' }, { id: 11, monto: '40.00' },
  ])

  const rechazo = await request(aplicacion).post('/api/obligaciones/81/abonos').auth(token, { type: 'bearer' })
    .send({ monto: '1.00', medio_pago: 'Efectivo', clave_idempotencia: claveNueva }).expect(409)
  assert.match(rechazo.body.message, /pagada/i)
  assert.equal(conexion.rollback.mock.callCount(), 1)
  assert.equal(conexion.commit.mock.callCount(), 0)
  assert.equal(conexion.release.mock.callCount(), 1)

  const despues = await consultar()
  assert.deepEqual(despues.body.historial, antes.body.historial)
})
