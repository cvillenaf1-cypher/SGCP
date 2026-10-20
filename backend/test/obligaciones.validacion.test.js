import assert from 'node:assert/strict'
import test from 'node:test'
import { validarObligacion } from '../src/obligaciones/validacion.js'

const entradaValida = {
  concepto: 'Servicio de limpieza',
  beneficiario: 'Proveedor de limpieza',
  monto: '120.50',
  fecha_limite: '2020-01-15',
}

test('obligaciones: los cuatro campos son obligatorios y el cuerpo debe ser un objeto', () => {
  for (const campo of Object.keys(entradaValida)) {
    const entrada = { ...entradaValida }
    delete entrada[campo]
    assert.ok(validarObligacion(entrada).fields[campo], campo)
  }
  for (const cuerpo of [undefined, null, [], true, 15, 'texto']) {
    assert.ok(validarObligacion(cuerpo).fields.form)
  }
  const campos = validarObligacion({}).fields
  assert.deepEqual(Object.keys(campos).sort(), Object.keys(entradaValida).sort())
})

test('obligaciones: concepto y beneficiario se recortan y rechazan vacíos o tipos incorrectos', () => {
  const resultado = validarObligacion({ ...entradaValida, concepto: '  Servicio de limpieza\t', beneficiario: '\n Proveedor de limpieza  ' })
  assert.deepEqual(resultado.fields, {})
  assert.equal(resultado.concepto, entradaValida.concepto)
  assert.equal(resultado.beneficiario, entradaValida.beneficiario)
  for (const campo of ['concepto', 'beneficiario']) {
    for (const valor of ['', ' \t\n ', null, 12, {}, [], true]) {
      assert.ok(validarObligacion({ ...entradaValida, [campo]: valor }).fields[campo], `${campo}: ${JSON.stringify(valor)}`)
    }
  }
})

test('obligaciones: admite 255 caracteres y rechaza 256, incluidos caracteres Unicode', () => {
  for (const campo of ['concepto', 'beneficiario']) {
    for (const caracter of ['a', 'ñ', '😀']) {
      assert.deepEqual(validarObligacion({ ...entradaValida, [campo]: `  ${caracter.repeat(255)}  ` }).fields, {})
      assert.ok(validarObligacion({ ...entradaValida, [campo]: caracter.repeat(256) }).fields[campo])
    }
  }
})

test('obligaciones: normaliza soles con dos decimales sin perder centavos', () => {
  for (const [monto, esperado] of [
    ['1', '1.00'], ['120.5', '120.50'], ['0.01', '0.01'], ['0.1', '0.10'],
    ['000000001.2', '1.20'], ['99999.99', '99999.99'], ['100000', '100000.00'], ['100000.0', '100000.00'], ['100000.00', '100000.00'],
  ]) {
    const resultado = validarObligacion({ ...entradaValida, monto })
    assert.deepEqual(resultado.fields, {}, monto)
    assert.equal(resultado.monto, esperado)
    assert.equal(typeof resultado.monto, 'string')
  }
})

test('obligaciones: rechaza cero, negativos, más de dos decimales e importes mayores de S/ 100,000.00', () => {
  for (const monto of ['0', '00', '0.0', '0.00', '-1', '-0.01', '1.001', '1.000', '0.001', '100000.01', '100001', '00000100000.01', '99999999999.99', '99999999999.999', '100000000000', '100000000000.00']) {
    assert.ok(validarObligacion({ ...entradaValida, monto }).fields.monto, monto)
  }
})

test('obligaciones: exige una cadena decimal, sin exponentes, comas ni símbolos de moneda', () => {
  for (const monto of [undefined, null, 120.5, 1, 0, -1, NaN, Infinity, true, {}, [], '', ' ', ' 1.00 ', '1.00\n', '1.00\r\n', '1.00\u2028', '1e2', '+1', '1,20', '1,000.00', 'S/ 1.00', '.50', '1.', '0x10', "1'; DROP TABLE obligaciones; --"]) {
    assert.ok(validarObligacion({ ...entradaValida, monto }).fields.monto, String(monto))
  }
})

test('obligaciones: admite fechas anteriores a hoy, días bisiestos y límites de MySQL DATE', () => {
  for (const fechaLimite of ['2020-01-15', '2000-02-29', '2024-02-29', '2025-04-30', '1000-01-01', '9999-12-31']) {
    const resultado = validarObligacion({ ...entradaValida, fecha_limite: fechaLimite })
    assert.deepEqual(resultado.fields, {}, fechaLimite)
    assert.equal(resultado.fecha_limite, fechaLimite)
  }
})

test('obligaciones: rechaza fechas imposibles, formato distinto y años fuera del rango de MySQL', () => {
  for (const fechaLimite of [undefined, null, 20260101, {}, [], '', '2025-02-29', '1900-02-29', '2100-02-29', '2024-02-30', '2025-04-31', '2025-00-15', '2025-13-01', '2025-01-00', '2025-01-32', '0000-01-01', '0999-12-31', '10000-01-01', '2025-1-01', '2025-01-1', '01-01-2025', '2025/01/01', ' 2025-01-01 ', '2025-01-01\n', '2025-01-01\r\n', '2025-01-01\u2028', '2025-01-01T00:00:00Z']) {
    assert.ok(validarObligacion({ ...entradaValida, fecha_limite: fechaLimite }).fields.fecha_limite, JSON.stringify(fechaLimite))
  }
})

test('obligaciones: rechaza campos controlados por servidor y cualquier campo adicional', () => {
  for (const campo of ['usuario_creador_id', 'usuario_creador', 'saldo_pendiente', 'estado', 'fecha_registro', 'monto_original', 'id', 'role', 'user', 'moneda', 'adicional']) {
    const resultado = validarObligacion({ ...entradaValida, [campo]: 'valor inyectado' })
    assert.ok(resultado.fields.form, campo)
    assert.equal(Object.hasOwn(resultado, campo), false, campo)
  }
})
