import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test, mock } from 'node:test'
import request from 'supertest'
import { adjuntarComprobante, almacenMemoria } from './support/comprobante.js'
import { crearAplicacion } from '../src/app.js'
import { registrarAbono } from '../src/abonos/servicio.js'
import { validarRegistroAbono, aCentavos, desdeCentavos } from '../src/abonos/validacion.js'
import { presentarObligacion } from '../src/obligaciones/consulta.js'

const entrada = { monto: '0.10', medio_pago: 'Efectivo', clave_idempotencia: 'operacion-prueba-0001' }
const configuracion = { frontendUrl: 'http://localhost:5173', sessionMinutes: 60, loginWindowMs: 60000, loginLimit: 100 }

// Doble de consultas y ciclo transaccional; no simula bloqueos InnoDB.
function prepararPool({ saldo = '0.30', existente = true, anterior, errorInsercion, errorActualizacion, rol = 'ASISTENTE' } = {}) {
  let abono = anterior
  let comprobante
  const conexion = {
    beginTransaction: mock.fn(async () => {}),
    commit: mock.fn(async () => {}),
    rollback: mock.fn(async () => {}),
    release: mock.fn(() => {}),
    execute: mock.fn(async (sql, valores) => {
      if (sql.includes('FROM sesiones')) return [[{ session_id: 1, id: 42, nombre: 'Prueba', email: 'prueba@example.test', codigo: rol }]]
      if (sql.includes('INSERT INTO comprobantes')) { comprobante = { abono_id: valores[0], nombre_original: valores[2], tipo: valores[3], tamano: valores[4], tamano_original: valores[5], huella_archivo: valores[6], fecha_asociacion: '2026-10-20 12:00:00.000' }; return [{ affectedRows: 1 }] }
      if (sql.includes('FROM comprobantes')) return [comprobante ? [comprobante] : []]
      if (sql.includes('FROM abonos')) return [abono?.usuario_registrador_id === valores[0] && abono.clave_idempotencia === valores[1] ? [{ ...abono }] : []]
      if (sql.includes('FROM obligaciones')) return [existente ? [{ id: 1, saldo_pendiente: saldo }] : []]
      if (sql.includes('INSERT INTO abonos')) {
        if (errorInsercion) throw errorInsercion
        abono = { id: 8, obligacion_id: valores[0], monto: valores[1], medio_pago: valores[2], usuario_registrador_id: valores[3], clave_idempotencia: valores[4], saldo_resultante: valores[5], huella_solicitud: valores[6], fecha_registro: '2026-10-18 12:00:00.123' }
        return [{ insertId: 8 }]
      }
      if (sql.includes('UPDATE obligaciones')) {
        if (errorActualizacion) throw errorActualizacion
        saldo = valores[0]
        return [{ affectedRows: 1 }]
      }
      throw new Error('Consulta inesperada en el doble.')
    }),
  }
  return { conexion, pool: { execute: conexion.execute, getConnection: async () => conexion }, saldo: () => saldo }
}

test('abonos: validación rechaza importes inválidos, medio, clave y campos controlados por servidor', () => {
  for (const monto of ['0', '-1', '1.001', 1, '', ' 1', '1e2', '100000000000']) {
    assert.ok(validarRegistroAbono({ ...entrada, monto }).fields.monto)
  }
  for (const medio_pago of [undefined, 'Cheque', 'efectivo']) assert.ok(validarRegistroAbono({ ...entrada, medio_pago }).fields.medio_pago)
  for (const clave_idempotencia of [undefined, '', 'x'.repeat(129)]) assert.ok(validarRegistroAbono({ ...entrada, clave_idempotencia }).fields.clave_idempotencia)
  for (const clave of ['saldo_pendiente', 'estado', 'usuario_registrador_id', 'fecha_registro', 'moneda']) {
    assert.ok(validarRegistroAbono({ ...entrada, [clave]: 'valor' }).fields.form)
  }
  for (const medio_pago of ['Efectivo', 'Transferencia bancaria', 'Tarjeta', 'Billetera digital']) {
    assert.deepEqual(validarRegistroAbono({ ...entrada, medio_pago }).fields, {})
  }
})

test('abonos: cálculo exacto incluso en el límite DECIMAL(13,2)', () => {
  assert.equal(desdeCentavos(aCentavos('0.30') - aCentavos('0.10')), '0.20')
  assert.equal(desdeCentavos(aCentavos('99999999999.99') - aCentavos('0.01')), '99999999999.98')
  assert.equal(validarRegistroAbono({ ...entrada, monto: '99999999999.99' }).monto, '99999999999.99')
  assert.equal(validarRegistroAbono({ ...entrada, monto: '1' }).monto, '1.00')
})

test('abonos: parcial y completo confirman una única transacción y conservan estados HU-02', async () => {
  for (const [monto, esperado, estado] of [['0.10', '0.20', 'PARCIAL'], ['0.30', '0.00', 'PAGADO']]) {
    const doble = prepararPool()
    const resultado = await registrarAbono(doble.pool, 1, { ...entrada, monto }, 42)
    assert.equal(resultado.nuevo, true)
    assert.equal(resultado.abono.saldo_resultante, esperado)
    assert.equal(resultado.abono.fecha_registro, '2026-10-18T12:00:00.123Z')
    assert.equal('huella_solicitud' in resultado.abono, false)
    assert.equal(doble.saldo(), esperado)
    assert.equal(doble.conexion.commit.mock.callCount(), 1)
    assert.equal(doble.conexion.release.mock.callCount(), 1)
    assert.equal(doble.conexion.rollback.mock.callCount(), 0)
    const insercion = doble.conexion.execute.mock.calls.find((llamada) => llamada.arguments[0].includes('INSERT INTO abonos'))
    assert.ok(insercion)
    assert.equal(insercion.arguments[1][6], createHash('sha256').update(JSON.stringify([1, monto, 'Efectivo'])).digest('hex'))
    assert.equal(presentarObligacion({ monto_original: '0.30', saldo_pendiente: esperado, fecha_registro: '2026-10-18 12:00:00', fecha_limite: '2027-01-01' }, '2026-10-18').estado_economico, estado)
    const consultas = doble.conexion.execute.mock.calls.map((llamada) => llamada.arguments[0])
    assert.ok(consultas.findIndex((sql) => sql.includes('FROM obligaciones') && sql.includes('FOR UPDATE')) < consultas.findIndex((sql) => sql.includes('INSERT INTO abonos')))
  }
})

test('abonos: inexistente, pagada y sobrepago revierten sin insertar', async () => {
  for (const [opciones, estado] of [[{ existente: false }, 404], [{ saldo: '0.00' }, 409], [{ saldo: '0.01' }, 409]]) {
    const { pool, conexion } = prepararPool(opciones)
    await assert.rejects(registrarAbono(pool, 1, entrada, 42), { estado })
    assert.equal(conexion.rollback.mock.callCount(), 1)
    assert.equal(conexion.release.mock.callCount(), 1)
    assert.ok(!conexion.execute.mock.calls.some((llamada) => llamada.arguments[0].includes('INSERT INTO abonos')))
  }
})

test('abonos: reintento conserva respuesta histórica y rechaza claves incompatibles', async () => {
  const doble = prepararPool()
  const primero = await registrarAbono(doble.pool, 1, entrada, 42)
  const segundo = await registrarAbono(doble.pool, 1, entrada, 42)
  assert.equal(segundo.nuevo, false)
  assert.deepEqual(segundo.abono, primero.abono)
  assert.equal(doble.saldo(), '0.20')
  await assert.rejects(registrarAbono(doble.pool, 2, entrada, 42), { estado: 409 })
  await assert.rejects(registrarAbono(doble.pool, 1, { ...entrada, monto: '0.20' }, 42), { estado: 409 })
  await assert.rejects(registrarAbono(doble.pool, 1, { ...entrada, medio_pago: 'Tarjeta' }, 42), { estado: 409 })
})

test('abonos: error SQL y conflictos de bloqueo revierten y liberan', async () => {
  for (const codigo of ['ER_PRUEBA', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const opciones = codigo === 'ER_PRUEBA'
      ? { errorActualizacion: Object.assign(new Error('Error simulado'), { code: codigo }) }
      : { errorInsercion: Object.assign(new Error('Error simulado'), { code: codigo }) }
    const doble = prepararPool(opciones)
    await assert.rejects(registrarAbono(doble.pool, 1, entrada, 42), codigo === 'ER_PRUEBA' ? { code: codigo } : { estado: 409 })
    assert.equal(doble.conexion.rollback.mock.callCount(), 1)
    assert.equal(doble.conexion.release.mock.callCount(), 1)
    assert.equal(doble.conexion.commit.mock.callCount(), 0)
    assert.equal(doble.saldo(), '0.30')
  }
})

test('abonos: ruta exige sesión, ASISTENTE, identificador y cuerpo válido', async () => {
  for (const rol of ['ASISTENTE', 'GERENTE']) {
    const doble = prepararPool({ rol })
    const aplicacion = await crearAplicacion({ pool: doble.pool, config: configuracion, almacenComprobantes: almacenMemoria() })
    const enviar = (ruta = '/api/obligaciones/1/abonos') => request(aplicacion).post(ruta).auth('a'.repeat(64), { type: 'bearer' })
    await request(aplicacion).post('/api/obligaciones/1/abonos').send(entrada).expect(401)
    if (rol === 'GERENTE') { await enviar().send(entrada).expect(403); continue }
    await enviar('/api/obligaciones/01/abonos').send(entrada).expect(422)
    for (const cuerpo of [{}, { ...entrada, monto: '0' }, { ...entrada, medio_pago: 'Cheque' }, { ...entrada, saldo_pendiente: '0' }]) await enviar().send(cuerpo).expect(422)
    const primero = await adjuntarComprobante(enviar(), entrada).expect(201)
    const segundo = await adjuntarComprobante(enviar(), { ...entrada, monto: '0.1' }).expect(200)
    assert.deepEqual(segundo.body, primero.body)
    await adjuntarComprobante(enviar(), { ...entrada, monto: '0.20' }).expect(409)
    assert.equal(primero.body.abono.usuario_registrador_id, 42)
  }
})

test('abonos: petición manual sobre una obligación pagada devuelve 409 sin escrituras', async () => {
  const doble = prepararPool({ saldo: '0.00' })
  const aplicacion = await crearAplicacion({ pool: doble.pool, config: configuracion, almacenComprobantes: almacenMemoria() })
  const respuesta = await adjuntarComprobante(request(aplicacion).post('/api/obligaciones/1/abonos')
    .auth('a'.repeat(64), { type: 'bearer' }), entrada).expect(409)

  assert.deepEqual(respuesta.body, { message: 'La obligación está pagada o el abono supera su saldo pendiente.' })
  assert.equal(doble.saldo(), '0.00')
  assert.equal(doble.conexion.commit.mock.callCount(), 0)
  assert.equal(doble.conexion.rollback.mock.callCount(), 1)
  assert.equal(doble.conexion.release.mock.callCount(), 1)
  assert.ok(!doble.conexion.execute.mock.calls.some(({ arguments: [sql] }) => /INSERT INTO abonos|UPDATE obligaciones/.test(sql)))
})

test('abonos: pago total rechaza una nueva clave y conserva el reintento idempotente', async () => {
  const doble = prepararPool({ saldo: '0.10' })
  const aplicacion = await crearAplicacion({ pool: doble.pool, config: configuracion, almacenComprobantes: almacenMemoria() })
  const enviar = (cuerpo) => adjuntarComprobante(request(aplicacion).post('/api/obligaciones/1/abonos')
    .auth('a'.repeat(64), { type: 'bearer' }), cuerpo)

  const primero = await enviar(entrada).expect(201)
  assert.equal(primero.body.abono.saldo_resultante, '0.00')
  const respuesta = await enviar({ ...entrada, clave_idempotencia: 'operacion-prueba-0002' }).expect(409)
  assert.deepEqual(respuesta.body, { message: 'La obligación está pagada o el abono supera su saldo pendiente.' })
  const reintento = await enviar(entrada).expect(200)
  assert.deepEqual(reintento.body, primero.body)
  assert.equal(doble.saldo(), '0.00')
  for (const consulta of ['INSERT INTO abonos', 'UPDATE obligaciones']) {
    assert.equal(doble.conexion.execute.mock.calls.filter(({ arguments: [sql] }) => sql.includes(consulta)).length, 1)
  }
})
