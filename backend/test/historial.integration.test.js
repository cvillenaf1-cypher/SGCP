import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, after, test } from 'node:test'
import request from 'supertest'
import sharp from 'sharp'
import { crearAplicacion } from '../src/app.js'
import { registrarAbono } from '../src/abonos/servicio.js'
import { consultarHistorial } from '../src/historial/consulta.js'
import { crearAlmacenComprobantes } from '../src/comprobantes/almacen.js'
import { abrirBasePruebas, crearUsuarioPrueba, eliminarUsuarioPrueba } from './support/database.js'

let conexiones, aplicacion
const usuarios = [], tokens = [], obligaciones = []

before(async () => {
  const abierta = await abrirBasePruebas()
  conexiones = abierta.pool
  aplicacion = await crearAplicacion({ pool: conexiones, config: { ...abierta.config, loginLimit: 100 } })
  for (const rol of ['ASISTENTE', 'ASISTENTE', 'GERENTE']) {
    const usuario = await crearUsuarioPrueba(conexiones, rol)
    usuarios.push(usuario)
    const respuesta = await request(aplicacion).post('/api/auth/login').send({ email: usuario.email, password: usuario.password }).expect(200)
    tokens.push(respuesta.body.token)
  }
})

after(async () => {
  if (!conexiones) return
  try {
    for (const id of obligaciones) {
      const [archivos] = await conexiones.execute('SELECT c.identificador_archivo FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [id])
      const almacen = crearAlmacenComprobantes()
      for (const archivo of archivos) await almacen.eliminar(archivo.identificador_archivo)
      await conexiones.execute('DELETE c FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [id])
      await conexiones.execute('DELETE FROM abonos WHERE obligacion_id = ?', [id])
      await conexiones.execute('DELETE FROM obligaciones WHERE id = ?', [id])
    }
    for (const usuario of usuarios) await eliminarUsuarioPrueba(conexiones, usuario)
  } finally { await conexiones.end() }
})

async function crearObligacion(monto = '100.00') {
  const respuesta = await request(aplicacion).post('/api/obligaciones').auth(tokens[0], { type: 'bearer' })
    .send({ concepto: 'Historial de prueba', beneficiario: 'Proveedor', monto, fecha_limite: '2027-01-01' }).expect(201)
  const id = respuesta.body.obligacion.id
  obligaciones.push(id)
  return id
}

async function abonar(id, monto, usuario = usuarios[0], pool = conexiones) {
  return registrarAbono(pool, id, { monto, medio_pago: 'Efectivo', clave_idempotencia: randomUUID() }, usuario.id)
}

async function consultar(id, indiceUsuario = 0) {
  const respuesta = await request(aplicacion).get(`/api/obligaciones/${id}/historial`).auth(tokens[indiceUsuario], { type: 'bearer' }).expect(200)
  assert.equal(respuesta.headers['cache-control'], 'no-store')
  return respuesta.body.historial
}

test('historial: exige autenticación y ASISTENTE antes de validar el identificador', async () => {
  await request(aplicacion).get('/api/obligaciones/1/historial').expect(401)
  await request(aplicacion).get('/api/obligaciones/invalido/historial').auth(tokens[2], { type: 'bearer' }).expect(403)
  for (const id of ['0', '01', '-1', '1e2', '4294967296', 'invalido', '1%20OR%201']) {
    await request(aplicacion).get(`/api/obligaciones/${id}/historial`).auth(tokens[0], { type: 'bearer' }).expect(422)
  }
})

test('historial: inexistente es 404 y cero abonos es un historial vacío real', async () => {
  await request(aplicacion).get('/api/obligaciones/4294967295/historial').auth(tokens[0], { type: 'bearer' }).expect(404)
  const id = await crearObligacion()
  assert.deepEqual(await consultar(id), {
    obligacion_id: id, concepto: 'Historial de prueba',
    monto_original: '100.00', saldo_pendiente: '100.00', total_abonado: '0.00',
    estado_economico: 'PENDIENTE', resumen_consistente: true, advertencia: null, abonos: [],
  })
})

test('historial: un abono parcial y varios abonos completos suman importes exactos', async () => {
  const id = await crearObligacion('0.30')
  const primero = await abonar(id, '0.10')
  let historial = await consultar(id)
  assert.equal(historial.total_abonado, '0.10')
  assert.equal(historial.saldo_pendiente, '0.20')
  assert.equal(historial.estado_economico, 'PARCIAL')
  assert.equal(historial.abonos[0].id, primero.abono.id)
  const segundo = await abonar(id, '0.20')
  historial = await consultar(id)
  assert.equal(historial.total_abonado, '0.30')
  assert.equal(historial.saldo_pendiente, '0.00')
  assert.equal(historial.estado_economico, 'PAGADO')
  assert.equal(historial.resumen_consistente, true)
  assert.deepEqual(new Set(historial.abonos.map((abono) => abono.id)), new Set([primero.abono.id, segundo.abono.id]))
})

test('historial: ordena fecha descendente y desempata por ID; UTC conserva milisegundos', async () => {
  const id = await crearObligacion()
  const primero = await abonar(id, '10.00')
  const segundo = await abonar(id, '20.00')
  const tercero = await abonar(id, '30.00')
  await conexiones.execute('UPDATE abonos SET fecha_registro = ? WHERE id IN (?, ?)', ['2026-10-18 00:30:00.123', primero.abono.id, tercero.abono.id])
  await conexiones.execute('UPDATE abonos SET fecha_registro = ? WHERE id = ?', ['2026-10-17 23:59:59.999', segundo.abono.id])
  const historial = await consultar(id)
  assert.deepEqual(historial.abonos.map((abono) => abono.id), [tercero.abono.id, primero.abono.id, segundo.abono.id])
  assert.equal(historial.abonos[0].fecha_registro, '2026-10-18T00:30:00.123Z')
  const partes = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(historial.abonos[0].fecha_registro))
  assert.equal(partes.find((parte) => parte.type === 'day').value, '17')
  assert.equal(partes.find((parte) => parte.type === 'hour').value, '19')
  assert.equal(historial.total_abonado, '60.00')
})

test('historial: comprobantes no duplican abonos y respetan los permisos de HU-04', async () => {
  const id = await crearObligacion()
  const primero = await abonar(id, '10.00')
  await abonar(id, '20.00', usuarios[1])
  const imagen = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer()
  await request(aplicacion).post(`/api/abonos/${primero.abono.id}/comprobante`).auth(tokens[0], { type: 'bearer' })
    .attach('comprobante', imagen, { filename: 'recibo.png', contentType: 'image/png' }).expect(201)
  const propio = await consultar(id)
  const ajeno = await consultar(id, 1)
  assert.equal(propio.abonos.length, 2)
  assert.equal(propio.total_abonado, '30.00')
  const comprobantePropio = propio.abonos.find((abono) => abono.id === primero.abono.id)
  const comprobanteAjeno = ajeno.abonos.find((abono) => abono.id === primero.abono.id)
  assert.equal(comprobantePropio.tiene_comprobante, true)
  assert.equal(comprobantePropio.puede_descargar_comprobante, true)
  assert.equal(comprobantePropio.url_comprobante, `/api/abonos/${primero.abono.id}/comprobante/archivo`)
  assert.equal(comprobanteAjeno.tiene_comprobante, true)
  assert.equal(comprobanteAjeno.puede_descargar_comprobante, false)
  assert.equal(comprobanteAjeno.url_comprobante, null)
  assert.equal(propio.abonos.find((abono) => abono.id !== primero.abono.id).tiene_comprobante, false)
  await request(aplicacion).get(comprobantePropio.url_comprobante).auth(tokens[0], { type: 'bearer' }).expect(200)
  await request(aplicacion).get(comprobantePropio.url_comprobante).auth(tokens[1], { type: 'bearer' }).expect(403)
  const texto = JSON.stringify(propio)
  for (const privado of ['identificador_archivo', 'huella', 'clave_idempotencia', '.local', 'token']) assert.ok(!texto.includes(privado))
})

test('historial: la consulta no modifica filas y advierte una inconsistencia sin repararla', async () => {
  const id = await crearObligacion()
  await abonar(id, '10.00')
  const [antes] = await conexiones.execute('SELECT * FROM obligaciones WHERE id = ?', [id])
  const [abonosAntes] = await conexiones.execute('SELECT * FROM abonos WHERE obligacion_id = ?', [id])
  await consultar(id)
  const [despues] = await conexiones.execute('SELECT * FROM obligaciones WHERE id = ?', [id])
  const [abonosDespues] = await conexiones.execute('SELECT * FROM abonos WHERE obligacion_id = ?', [id])
  assert.deepEqual(despues, antes)
  assert.deepEqual(abonosDespues, abonosAntes)
  // Alteración exclusivamente de esta fila de prueba para verificar la advertencia.
  await conexiones.execute('UPDATE obligaciones SET saldo_pendiente = ? WHERE id = ?', ['80.00', id])
  const historial = await consultar(id)
  assert.equal(historial.total_abonado, '10.00')
  assert.equal(historial.saldo_pendiente, '80.00')
  assert.equal(historial.resumen_consistente, false)
  assert.match(historial.advertencia, /no coincide/)
  const [[fila]] = await conexiones.execute('SELECT saldo_pendiente FROM obligaciones WHERE id = ?', [id])
  assert.equal(fila.saldo_pendiente, '80.00')
})

test('historial: lectura consistente y sin bloqueo mientras otro usuario guarda un abono', async () => {
  const id = await crearObligacion()
  let avisarConfirmacion, permitirConfirmacion
  const confirmacionAlcanzada = new Promise((resolver) => { avisarConfirmacion = resolver })
  const permisoConfirmacion = new Promise((resolver) => { permitirConfirmacion = resolver })
  const poolPausado = {
    getConnection: async () => {
      const conexion = await conexiones.getConnection()
      return {
        beginTransaction: () => conexion.beginTransaction(),
        execute: (...parametros) => conexion.execute(...parametros),
        commit: async () => { avisarConfirmacion(); await permisoConfirmacion; await conexion.commit() },
        rollback: () => conexion.rollback(), release: () => conexion.release(),
      }
    },
  }
  const escritura = abonar(id, '25.00', usuarios[1], poolPausado)
  try {
    await Promise.race([confirmacionAlcanzada, escritura.then(() => { throw new Error('No se alcanzó la pausa de confirmación.') })])
    const lectura = await request(aplicacion).get(`/api/obligaciones/${id}/historial`)
      .auth(tokens[0], { type: 'bearer' }).timeout({ response: 2000 }).expect(200)
    assert.equal(lectura.body.historial.saldo_pendiente, '100.00')
    assert.equal(lectura.body.historial.total_abonado, '0.00')
    assert.equal(lectura.body.historial.abonos.length, 0)
    assert.equal(lectura.body.historial.resumen_consistente, true)
  } finally { permitirConfirmacion(); await escritura }
  const despues = await consultar(id)
  assert.equal(despues.saldo_pendiente, '75.00')
  assert.equal(despues.total_abonado, '25.00')
  assert.equal(despues.abonos.length, 1)
  assert.equal(despues.resumen_consistente, true)
})

test('historial: reutiliza centavos exactos hasta DECIMAL máximo y solo ejecuta un SELECT parametrizado', async () => {
  let consultas = 0
  const pool = {
    execute: async (sql, parametros) => {
      consultas++
      assert.match(sql, /^SELECT/)
      assert.ok(!/FOR UPDATE|INSERT|DELETE|UPDATE /.test(sql))
      assert.match(sql, /ORDER BY a.fecha_registro DESC, a.id DESC/)
      assert.deepEqual(parametros, [1])
      return [[{
        obligacion_id: 1, concepto: 'Importe máximo', monto_original: '99999999999.99', saldo_pendiente: '0.01',
        abono_id: 1, monto: '99999999999.98', medio_pago: 'Efectivo',
        fecha_registro: '2026-10-18 12:00:00', usuario_registrador_id: 1, comprobante_abono_id: null,
      }]]
    },
  }
  const historial = await consultarHistorial(pool, 1, 1)
  assert.equal(consultas, 1)
  assert.equal(historial.total_abonado, '99999999999.98')
  assert.equal(historial.resumen_consistente, true)
  assert.equal(historial.abonos[0].fecha_registro, '2026-10-18T12:00:00Z')
})
