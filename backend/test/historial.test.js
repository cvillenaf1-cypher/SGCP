import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { consultarHistorial } from '../src/historial/consulta.js'

const obligacion = {
  obligacion_id: 81, concepto: 'Compra a proveedor',
  monto_original: '100.00', saldo_pendiente: '30.00',
}
const movimientos = [
  { abono_id: 12, monto: '50.00', medio_pago: 'Transferencia bancaria', fecha_registro: '2026-10-18 12:00:00.123', usuario_registrador_id: 42, comprobante_abono_id: 12 },
  { abono_id: 11, monto: '20.00', medio_pago: 'Efectivo', fecha_registro: '2026-10-17 12:00:00.999', usuario_registrador_id: 43, comprobante_abono_id: 11 },
]

function poolLectura(filas) {
  const execute = mock.fn(async (sql, parametros) => {
    assert.match(sql, /^SELECT\s/)
    assert.doesNotMatch(sql, /FOR UPDATE|INSERT|DELETE|UPDATE\s/)
    assert.match(sql, /WHERE o\.id = \?\s+ORDER BY a\.fecha_registro DESC, a\.id DESC$/)
    assert.deepEqual(parametros, [81])
    return [filas]
  })
  return { execute }
}

test('historial: inexistente no inventa una obligación ni movimientos', async () => {
  const pool = poolLectura([])
  assert.equal(await consultarHistorial(pool, 81, 42), null)
  assert.equal(pool.execute.mock.callCount(), 1)
})

test('historial: GERENTE puede consultar comprobantes de otros registradores sin modificar datos', async () => {
  const filas = movimientos.map((abono) => ({ ...obligacion, ...abono }))
  const copia = structuredClone(filas)
  const pool = poolLectura(filas)
  const historial = await consultarHistorial(pool, 81, 99, 'GERENTE')
  assert.ok(historial.abonos.every((abono) => abono.puede_descargar_comprobante))
  assert.deepEqual(historial.abonos.map((abono) => abono.url_comprobante), ['/api/abonos/12/comprobante/archivo', '/api/abonos/11/comprobante/archivo'])
  assert.deepEqual(filas, copia)
  assert.equal(pool.execute.mock.callCount(), 1)
})

test('historial: sin abonos devuelve resumen original y lista vacía real', async () => {
  const fila = { ...obligacion, saldo_pendiente: '100.00', abono_id: null }
  const pool = poolLectura([fila])
  assert.deepEqual(await consultarHistorial(pool, 81, 42), {
    obligacion_id: 81, concepto: 'Compra a proveedor',
    monto_original: '100.00', saldo_pendiente: '100.00', saldo_pendiente_calculado: '100.00',
    total_abonado: '0.00', estado_economico: 'PENDIENTE',
    resumen_consistente: true, advertencia: null, abonos: [],
  })
  assert.equal(pool.execute.mock.callCount(), 1)
})

test('historial: cada movimiento conserva fecha UTC, importe, medio y permisos del comprobante', async () => {
  const filas = movimientos.map((movimiento) => ({ ...obligacion, ...movimiento }))
  const antes = structuredClone(filas)
  const pool = poolLectura(filas)
  const historial = await consultarHistorial(pool, 81, 42)
  assert.equal(historial.monto_original, '100.00')
  assert.equal(historial.total_abonado, '70.00')
  assert.equal(historial.saldo_pendiente_calculado, '30.00')
  assert.equal(historial.estado_economico, 'PARCIAL')
  assert.equal(historial.resumen_consistente, true)
  assert.deepEqual(historial.abonos, [
    { id: 12, monto: '50.00', medio_pago: 'Transferencia bancaria', fecha_registro: '2026-10-18T12:00:00.123Z', tiene_comprobante: true, puede_descargar_comprobante: true, url_comprobante: '/api/abonos/12/comprobante/archivo' },
    { id: 11, monto: '20.00', medio_pago: 'Efectivo', fecha_registro: '2026-10-17T12:00:00.999Z', tiene_comprobante: true, puede_descargar_comprobante: false, url_comprobante: null },
  ])
  assert.deepEqual(filas, antes)
  assert.equal(pool.execute.mock.callCount(), 1)
  for (const campo of ['usuario_registrador_id', 'comprobante_abono_id', 'identificador_archivo', 'clave_idempotencia', 'huella_solicitud']) {
    assert.ok(!JSON.stringify(historial).includes(campo))
  }
})

test('historial: conserva obligaciones pagadas y comprobantes ausentes sin cambiar registros', async () => {
  const filas = [{ ...obligacion, monto_original: '50.00', saldo_pendiente: '0.00', ...movimientos[0], comprobante_abono_id: null }]
  const antes = structuredClone(filas)
  const pool = poolLectura(filas)
  const historial = await consultarHistorial(pool, 81, 42)
  assert.equal(historial.estado_economico, 'PAGADO')
  assert.equal(historial.total_abonado, '50.00')
  assert.equal(historial.saldo_pendiente_calculado, '0.00')
  assert.equal(historial.resumen_consistente, true)
  assert.equal(historial.abonos.length, 1)
  assert.equal(historial.abonos[0].tiene_comprobante, false)
  assert.equal(historial.abonos[0].puede_descargar_comprobante, false)
  assert.equal(historial.abonos[0].url_comprobante, null)
  assert.deepEqual(await consultarHistorial(pool, 81, 42), historial)
  assert.deepEqual(filas, antes)
})

test('historial: suma céntimos exactos y resta al original sin convertir decimales a Number', async () => {
  for (const [original, montos, saldo, total] of [
    ['0.30', ['0.10', '0.20'], '0.00', '0.30'],
    ['99999999999.99', ['99999999999.97', '0.01'], '0.01', '99999999999.98'],
  ]) {
    const pool = poolLectura(montos.map((monto, indice) => ({
      ...obligacion, ...movimientos[indice], monto_original: original, saldo_pendiente: saldo, monto,
    })))
    const historial = await consultarHistorial(pool, 81, 42)
    assert.equal(historial.total_abonado, total)
    assert.equal(historial.saldo_pendiente_calculado, saldo)
    assert.equal(historial.resumen_consistente, true)
  }
})

test('historial: calcula el saldo y advierte discrepancias sin reparar datos almacenados', async () => {
  for (const [original, saldoCalculado] of [['100.00', '30.00'], ['69.50', '-0.50'], ['68.50', '-1.50']]) {
    const filas = movimientos.map((movimiento) => ({
      ...obligacion, ...movimiento, monto_original: original, saldo_pendiente: '20.00',
    }))
    const antes = structuredClone(filas)
    const pool = poolLectura(filas)
    const historial = await consultarHistorial(pool, 81, 42)
    assert.equal(historial.total_abonado, '70.00')
    assert.equal(historial.saldo_pendiente, '20.00')
    assert.equal(historial.saldo_pendiente_calculado, saldoCalculado)
    assert.equal(historial.resumen_consistente, false)
    assert.match(historial.advertencia, /no coincide/)
    assert.match(historial.advertencia, /no se ha modificado ningún dato/)
    assert.deepEqual(filas, antes)
    assert.equal(pool.execute.mock.callCount(), 1)
  }
})
