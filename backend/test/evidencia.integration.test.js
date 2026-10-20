import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { before, after, test } from 'node:test'
import request from 'supertest'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { crearAplicacion } from '../src/app.js'
import { crearAlmacenComprobantes } from '../src/comprobantes/almacen.js'
import { abrirBasePruebas, crearUsuarioPrueba, eliminarUsuarioPrueba } from './support/database.js'
import { imagenComprobante } from './support/comprobante.js'

let pool, config, usuario, token, app, almacen, directorio, pdf
const obligaciones = []
const raiz = fileURLToPath(new URL('../.local/', import.meta.url))
before(async () => {
  ;({ pool, config } = await abrirBasePruebas())
  await mkdir(raiz, { recursive: true })
  directorio = await mkdtemp(join(raiz, 'evidencia-prueba-'))
  almacen = crearAlmacenComprobantes(directorio)
  app = await crearAplicacion({ pool, config, almacenComprobantes: almacen })
  usuario = await crearUsuarioPrueba(pool)
  token = (await request(app).post('/api/auth/login').send({ email: usuario.email, password: usuario.password }).expect(200)).body.token
  const documento = await PDFDocument.create()
  documento.addPage().drawText('Factura de prueba')
  pdf = Buffer.from(await documento.save())
})
after(async () => {
  if (pool) {
    try {
      for (const id of obligaciones) {
        await pool.execute('DELETE c FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [id])
        await pool.execute('DELETE FROM abonos WHERE obligacion_id = ?', [id])
        await pool.execute('DELETE FROM obligaciones WHERE id = ?', [id])
      }
      if (usuario) await eliminarUsuarioPrueba(pool, usuario)
    } finally { await pool.end() }
  }
  if (directorio?.startsWith(join(raiz, 'evidencia-prueba-'))) await rm(directorio, { recursive: true, force: true })
})
async function deuda() {
  const [resultado] = await pool.execute(`INSERT INTO obligaciones (concepto, beneficiario, monto_original, saldo_pendiente, fecha_limite, usuario_creador_id)
    VALUES (?, 'Proveedor', '100.00', '100.00', '2027-01-01', ?)`, ['Evidencia ' + randomUUID(), usuario.id])
  obligaciones.push(resultado.insertId)
  return resultado.insertId
}
function enviar(id, { destino = app, clave = randomUUID(), datos = imagenComprobante, nombre = 'recibo.png', tipo = 'image/png' } = {}) {
  const peticion = request(destino).post(`/api/obligaciones/${id}/abonos`).auth(token, { type: 'bearer' })
    .field('monto', '10.00').field('medio_pago', 'Efectivo').field('clave_idempotencia', clave)
  return datos === null ? peticion : peticion.attach('comprobante', datos, { filename: nombre, contentType: tipo })
}
async function verificar(id, cantidad, saldo = '100.00') {
  const [[fila]] = await pool.execute('SELECT saldo_pendiente FROM obligaciones WHERE id = ?', [id])
  const [[abonos]] = await pool.execute('SELECT COUNT(*) AS cantidad FROM abonos WHERE obligacion_id = ?', [id])
  const [[evidencias]] = await pool.execute('SELECT COUNT(*) AS cantidad FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [id])
  assert.equal(fila.saldo_pendiente, saldo)
  assert.equal(Number(abonos.cantidad), cantidad)
  assert.equal(Number(evidencias.cantidad), cantidad)
}
function conexionesConFallo(interceptar) {
  return {
    execute: (...args) => pool.execute(...args),
    async getConnection() {
      const conexion = await pool.getConnection()
      return {
        execute: (...args) => interceptar('execute', conexion, args),
        commit: () => interceptar('commit', conexion, []),
        beginTransaction: () => conexion.beginTransaction(), rollback: () => conexion.rollback(), release: () => conexion.release(),
      }
    },
  }
}

test('evidencia: JSON y multipart sin archivo no registran pagos ni alteran saldos', async () => {
  const id = await deuda()
  const sinArchivo = await enviar(id, { datos: null }).expect(422)
  assert.match(sinArchivo.body.fields.comprobante, /obligatorio/)
  await request(app).post(`/api/obligaciones/${id}/abonos`).auth(token, { type: 'bearer' })
    .send({ monto: '10.00', medio_pago: 'Efectivo', clave_idempotencia: randomUUID() }).expect(422)
  await verificar(id, 0)
})
test('evidencia: rechaza PDF falso, PDF sin páginas, MIME incompatible y exceso de tamaño', async () => {
  const id = await deuda()
  const vacio = Buffer.from(await (await PDFDocument.create()).save({ addDefaultPage: false }))
  for (const datos of [Buffer.from('factura falsa'), vacio, Buffer.from('%PDF-1.7\ncontenido inválido\n%%EOF')]) {
    await enviar(id, { datos, nombre: 'factura.pdf', tipo: 'application/pdf' }).expect(422)
  }
  await enviar(id, { datos: pdf, nombre: 'factura.png', tipo: 'image/png' }).expect(422)
  await enviar(id, { datos: Buffer.alloc(5 * 1024 * 1024 + 1), nombre: 'grande.pdf', tipo: 'application/pdf' }).expect(413)
  await verificar(id, 0)
})
test('evidencia: JPG, PNG y PDF se guardan junto al abono y el PDF se descarga intacto y privado', async () => {
  const jpg = await sharp(imagenComprobante).jpeg().toBuffer()
  for (const [datos, nombre, tipo] of [[jpg, 'recibo.jpg', 'image/jpeg'], [imagenComprobante, 'recibo.png', 'image/png'], [pdf, 'factura.pdf', 'application/pdf']]) {
    const id = await deuda()
    const respuesta = await enviar(id, { datos, nombre, tipo }).expect(201)
    assert.equal(respuesta.body.comprobante.abono_id, respuesta.body.abono.id)
    assert.equal(respuesta.body.comprobante.tipo, tipo)
    await verificar(id, 1, '90.00')
    const url = respuesta.body.comprobante.url_descarga
    await request(app).get(url).expect(401)
    const descarga = await request(app).get(url).auth(token, { type: 'bearer' }).expect(200)
    assert.match(descarga.headers['content-disposition'], /^attachment;/)
    assert.equal(descarga.headers['content-type'], tipo)
    if (tipo === 'application/pdf') assert.deepEqual(descarga.body, pdf)
    const historial = await request(app).get(`/api/obligaciones/${id}/historial`).auth(token, { type: 'bearer' }).expect(200)
    assert.equal(historial.body.historial.abonos[0].tiene_comprobante, true)
  }
})
test('evidencia: un fallo de disco revierte el abono y el saldo', async () => {
  const id = await deuda()
  const destino = await crearAplicacion({ pool, config, almacenComprobantes: { ...almacen, guardar: async () => { throw new Error('Disco de prueba no disponible') } } })
  await enviar(id, { destino }).expect(500)
  await verificar(id, 0)
})
test('evidencia: un fallo SQL al guardar metadatos revierte el abono y elimina el archivo', async () => {
  const id = await deuda()
  const antes = await readdir(directorio)
  const conexiones = conexionesConFallo((metodo, conexion, args) => {
    if (metodo === 'execute' && args[0].includes('INSERT INTO comprobantes')) throw new Error('Fallo SQL de prueba')
    return conexion[metodo](...args)
  })
  const destino = await crearAplicacion({ pool: conexiones, config, almacenComprobantes: almacen })
  await enviar(id, { destino }).expect(500)
  await verificar(id, 0)
  assert.deepEqual(await readdir(directorio), antes)
})
test('evidencia: COMMIT con respuesta perdida conserva evidencia y reintenta sin duplicar; otro archivo no reutiliza la clave', async () => {
  const id = await deuda(), clave = randomUUID()
  let fallar = true
  const conexiones = conexionesConFallo(async (metodo, conexion, args) => {
    const resultado = await conexion[metodo](...args)
    if (metodo === 'commit' && fallar) { fallar = false; throw new Error('Confirmación perdida de prueba') }
    return resultado
  })
  const destino = await crearAplicacion({ pool: conexiones, config, almacenComprobantes: almacen })
  await enviar(id, { destino, clave }).expect(500)
  await verificar(id, 1, '90.00')
  const confirmado = await enviar(id, { destino, clave }).expect(200)
  await request(app).get(confirmado.body.comprobante.url_descarga).auth(token, { type: 'bearer' }).expect(200)
  await enviar(id, { destino, clave, datos: pdf, nombre: 'factura.pdf', tipo: 'application/pdf' }).expect(409)
  await verificar(id, 1, '90.00')
})
