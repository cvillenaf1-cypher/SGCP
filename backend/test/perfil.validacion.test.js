import assert from 'node:assert/strict'
import { test } from 'node:test'
import { definicionesPerfil, validarPerfil } from '../../shared/perfilReferencia.js'
import { huellaReferencia } from '../src/perfil/servicio.js'

test('perfil: titular vacío, parcial, persona natural y empresa son válidos', () => {
  for (const entrada of [{}, { nombre: 'Nombre de referencia' }, { tipo: 'PERSONA_NATURAL', nombre: 'Persona de prueba', documento: '12345678' }, { tipo: 'EMPRESA', nombre: 'Empresa de prueba', documento: '20123456789' }]) {
    assert.deepEqual(validarPerfil('titular', entrada).fields, {})
  }
  for (const entrada of [{ tipo: 'EMPRESA', documento: '12345678' }, { tipo: 'PERSONA_NATURAL', documento: '20123456789' }, { documento: '12345678' }, { tipo: 'OTRO' }, { documento: 12345678 }, { nombre: 'x'.repeat(161) }]) {
    assert.ok(Object.keys(validarPerfil('titular', entrada).fields).length)
  }
})

test('perfil: valida tipos, campos desconocidos, documentos, versión y mínimos de cada referencia', () => {
  for (const tipo of Object.keys(definicionesPerfil)) {
    for (const entrada of [null, [], { credencial: 'valor' }]) assert.ok(validarPerfil(tipo, entrada).fields.form)
    for (const version of [undefined, -1, '1', 1.5, 4294967295]) assert.ok(validarPerfil(tipo, { version }, { edicion: true }).fields.version)
    assert.ok(validarPerfil(tipo, { documento: '1234' }).fields.documento)
  }
  assert.ok(validarPerfil('bancos', {}).fields.entidad)
  assert.ok(validarPerfil('servicios', {}).fields.empresa)
  assert.ok(validarPerfil('bancos', { entidad: 'BCP', relacion: 'OTRO' }).fields.relacion)
  assert.ok(validarPerfil('servicios', { empresa: 'Proveedor', relacion_empresa: 'FRAUDE' }).fields.relacion_empresa)
  assert.deepEqual(validarPerfil('bancos', { entidad: 'BCP', documento: '12345678', ultimos_cuatro: '0001' }).fields, {})
  assert.deepEqual(validarPerfil('servicios', { empresa: 'Proveedor', codigo_cliente: 'SUM-12345678901', relacion_empresa: 'TERCERO_RELACIONADO', titular: 'Propietario de local' }).fields, {})
})

test('perfil: rechaza información sensible en todos los campos de texto, sin reflejar valores', () => {
  const secretos = ['4111111111111111', '4111 1111 1111 1111', '4111-1111-1111-1111', '4111.1111.1111.1111', '４１１１１１１１１１１１１１１１', 'CVV: 123', 'PIN 1234', 'Clave SOL: privada', 'contraseña bancaria: privada', 'password=privada', 'CCI 00212345678901234567', '4111\u200b1111\u200b1111\u200b1111']
  for (const [tipo, definicion] of Object.entries(definicionesPerfil)) {
    for (const [clave, campo] of Object.entries(definicion)) {
      if (campo.opciones) continue
      for (const secreto of secretos) {
        const { fields } = validarPerfil(tipo, { [clave]: secreto })
        assert.ok(fields[clave], `${tipo}.${clave} debe rechazar el dato sensible`)
        assert.ok(!JSON.stringify(fields).includes(secreto))
      }
    }
  }
  assert.ok(validarPerfil('bancos', { entidad: 'BCP', alias: 'Cuenta 12345678901' }).fields.alias)
  assert.ok(validarPerfil('bancos', { entidad: 'BCP', alias: '123' }).fields.alias)
  assert.ok(validarPerfil('bancos', { entidad: 'BCP', alias: '١٢٣٤٥٦٧٨٩٠١٢٣٤٥٦' }).fields.alias)
})

test('perfil: huellas normalizadas impiden duplicados sin bloquear referencias distintas del mismo banco', () => {
  const base = validarPerfil('bancos', { entidad: 'BCP', alias: 'Local central' }).datos
  assert.equal(huellaReferencia('bancos', base), huellaReferencia('bancos', { ...base, entidad: ' bcp ', alias: 'Local  central' }))
  assert.notEqual(huellaReferencia('bancos', base), huellaReferencia('bancos', { ...base, alias: 'Sucursal' }))
  assert.notEqual(huellaReferencia('bancos', base), huellaReferencia('bancos', { ...base, relacion: 'PRESTAMISTA' }))
})
