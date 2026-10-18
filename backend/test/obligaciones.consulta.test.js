import assert from 'node:assert/strict'
import test from 'node:test'
import { fechaActualNegocio, presentarObligacion } from '../src/obligaciones/consulta.js'
import { validarFiltroConsulta, validarIdentificadorObligacion } from '../src/obligaciones/validacion-consulta.js'

const filaObligacion = {
  id: 81,
  concepto: 'Servicio de limpieza',
  beneficiario: 'Proveedor de prueba',
  monto_original: '120.50',
  saldo_pendiente: '120.50',
  fecha_limite: '2026-10-18',
  fecha_registro: '2026-10-17 15:00:00.123',
  usuario_creador_id: 42,
}

test('consulta de obligaciones: los estados económicos distinguen igualdad, abonos parciales y saldo cero', () => {
  for (const [saldo, estadoEsperado] of [
    ['120.50', 'PENDIENTE'],
    ['120.49', 'PARCIAL'],
    ['0.01', 'PARCIAL'],
    ['0.00', 'PAGADO'],
  ]) {
    const resultado = presentarObligacion({ ...filaObligacion, saldo_pendiente: saldo }, '2026-10-18')
    assert.equal(resultado.estado_economico, estadoEsperado, saldo)
    assert.equal(resultado.saldo_pendiente, saldo)
    assert.equal(resultado.monto_original, filaObligacion.monto_original)
    assert.equal(typeof resultado.saldo_pendiente, 'string')
    assert.equal(typeof resultado.monto_original, 'string')
  }
})

test('consulta de obligaciones: compara centavos exactos hasta el máximo DECIMAL sin alterar importes', () => {
  for (const [montoOriginal, saldo, estadoEsperado] of [
    ['0.01', '0.01', 'PENDIENTE'],
    ['0.01', '0.00', 'PAGADO'],
    ['0.29', '0.28', 'PARCIAL'],
    ['0.30', '0.10', 'PARCIAL'],
    ['99999999999.99', '99999999999.99', 'PENDIENTE'],
    ['99999999999.99', '99999999999.98', 'PARCIAL'],
    ['99999999999.99', '0.01', 'PARCIAL'],
    ['99999999999.99', '0.00', 'PAGADO'],
  ]) {
    const resultado = presentarObligacion({ ...filaObligacion, monto_original: montoOriginal, saldo_pendiente: saldo }, '2026-10-18')
    assert.equal(resultado.estado_economico, estadoEsperado, `${montoOriginal}: ${saldo}`)
    assert.equal(resultado.monto_original, montoOriginal)
    assert.equal(resultado.saldo_pendiente, saldo)
  }
})

test('consulta de obligaciones: vencida es independiente del estado económico y excluye saldos pagados', () => {
  for (const [saldo, fechaLimite, estadoEsperado, vencidaEsperada] of [
    ['120.50', '2026-10-17', 'PENDIENTE', true],
    ['10.50', '2026-10-17', 'PARCIAL', true],
    ['0.00', '2026-10-17', 'PAGADO', false],
    ['120.50', '2026-10-18', 'PENDIENTE', false],
    ['10.50', '2026-10-18', 'PARCIAL', false],
    ['0.00', '2026-10-18', 'PAGADO', false],
    ['120.50', '2026-10-19', 'PENDIENTE', false],
    ['10.50', '2026-10-19', 'PARCIAL', false],
    ['0.00', '2026-10-19', 'PAGADO', false],
  ]) {
    const resultado = presentarObligacion({ ...filaObligacion, saldo_pendiente: saldo, fecha_limite: fechaLimite }, '2026-10-18')
    assert.equal(resultado.estado_economico, estadoEsperado)
    assert.equal(resultado.vencida, vencidaEsperada, `${saldo}: ${fechaLimite}`)
  }
})

test('consulta de obligaciones: presentar una fila no la modifica y mantiene fechas del pool como cadenas', () => {
  const fila = Object.freeze({ ...filaObligacion })
  assert.deepEqual(presentarObligacion(fila, '2026-10-18'), {
    ...fila,
    fecha_registro: '2026-10-17T15:00:00.123Z',
    estado_economico: 'PENDIENTE',
    vencida: false,
  })
  assert.deepEqual(fila, filaObligacion)
  assert.equal(Object.hasOwn(fila, 'estado_economico'), false)
  assert.equal(Object.hasOwn(fila, 'vencida'), false)
  const resultadoSinFraccion = presentarObligacion({ ...fila, fecha_registro: '2026-10-17 15:00:00' }, '2026-10-18')
  assert.equal(resultadoSinFraccion.fecha_registro, '2026-10-17T15:00:00Z')
  assert.equal(resultadoSinFraccion.fecha_limite, fila.fecha_limite)
})

test('consulta de obligaciones: el día de negocio cambia a las 05:00 UTC en America/Lima', () => {
  for (const [instante, fechaEsperada] of [
    ['2026-10-18T04:59:59.999Z', '2026-10-17'],
    ['2026-10-18T05:00:00.000Z', '2026-10-18'],
    ['2026-01-01T04:59:59.999Z', '2025-12-31'],
    ['2026-01-01T05:00:00.000Z', '2026-01-01'],
    ['2024-03-01T04:59:59.999Z', '2024-02-29'],
    ['2024-03-01T05:00:00.000Z', '2024-03-01'],
    ['2025-03-01T04:59:59.999Z', '2025-02-28'],
  ]) {
    assert.equal(fechaActualNegocio(new Date(instante)), fechaEsperada, instante)
  }
})

test('consulta de obligaciones: el vencimiento respeta el cambio de día local y de año', () => {
  const fila = { ...filaObligacion, fecha_limite: '2025-12-31' }
  assert.equal(presentarObligacion(fila, fechaActualNegocio(new Date('2026-01-01T04:59:59.999Z'))).vencida, false)
  assert.equal(presentarObligacion(fila, fechaActualNegocio(new Date('2026-01-01T05:00:00.000Z'))).vencida, true)
})

test('consulta de obligaciones: el listado admite ausencia de filtro y los cuatro filtros documentados', () => {
  const sinFiltro = validarFiltroConsulta({})
  assert.deepEqual(sinFiltro.fields, {})
  assert.ok(!sinFiltro.filtro)
  assert.deepEqual(validarFiltroConsulta().fields, {})
  assert.deepEqual(validarFiltroConsulta(Object.create(null)).fields, {})
  for (const filtro of ['pendiente', 'parcial', 'pagado', 'vencido']) {
    assert.deepEqual(validarFiltroConsulta({ filtro }), { filtro, fields: {} })
  }
})

test('consulta de obligaciones: rechaza filtros vacíos, repetidos, tipos incorrectos e intentos de SQL', () => {
  for (const filtro of [
    '', ' ', 'PENDIENTE', 'Pendiente', ' pendiente', 'pendiente ', 'pendiente\n',
    'todos', 'pagada', 'vencida', null, 1, true, {}, [],
    ['pendiente'], ['pendiente', 'pagado'], "pendiente' OR 1 = 1 --",
  ]) {
    const resultado = validarFiltroConsulta({ filtro })
    assert.ok(Object.keys(resultado.fields).length > 0, JSON.stringify(filtro))
  }
  for (const consulta of [null, [], 'pendiente', 1, true]) {
    assert.ok(Object.keys(validarFiltroConsulta(consulta).fields).length > 0, JSON.stringify(consulta))
  }
})

test('consulta de obligaciones: no admite parámetros adicionales ni seleccionar el asistente creador', () => {
  for (const campo of ['estado', 'estado_economico', 'vencida', 'usuario_creador_id', 'usuario_creador', 'id', 'limite', 'offset', 'orden', 'role']) {
    for (const consulta of [{ [campo]: '42' }, { filtro: 'pendiente', [campo]: '42' }]) {
      assert.ok(Object.keys(validarFiltroConsulta(consulta).fields).length > 0, campo)
    }
  }
})

test('consulta de obligaciones: admite identificadores canónicos dentro de INT UNSIGNED', () => {
  for (const [valor, id] of [['1', 1], ['81', 81], ['4294967295', 4294967295]]) {
    assert.deepEqual(validarIdentificadorObligacion(valor), { id, fields: {} })
  }
})

test('consulta de obligaciones: rechaza identificadores fuera de rango, ambiguos o maliciosos', () => {
  for (const valor of [
    undefined, null, true, 1, 81, {}, [], ['81'], '', '0', '-1', '+1',
    '01', '00081', '1.0', '1.01', '1e2', '0x51', ' 81', '81 ', '81\n', '81\r\n',
    '4294967296', '9007199254740993', '99999999999999999999999999999999999',
    "81' OR '1' = '1", '81; DROP TABLE obligaciones', '../81', 'NaN', 'Infinity',
  ]) {
    assert.ok(validarIdentificadorObligacion(valor).fields.id, String(valor))
  }
})
