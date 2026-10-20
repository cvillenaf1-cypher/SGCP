import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { mkdtemp, mkdir, readdir, rm, open, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import request from 'supertest'
import sharp from 'sharp'
import { registrarAbono } from '../src/abonos/servicio.js'
import { crearAplicacion } from '../src/app.js'
import { crearAlmacenComprobantes } from '../src/comprobantes/almacen.js'
import { validarComprobante, LIMITE_ARCHIVO } from '../src/comprobantes/validacion.js'
import { abrirBasePruebas, crearUsuarioPrueba, eliminarUsuarioPrueba } from './support/database.js'

let conexiones, configuracion, aplicacion, almacen, directorio, png, jpg
const usuarios = []
const tokens = []
const obligaciones = []
const abonos = []
const raizPruebas = fileURLToPath(new URL('../../.local/', import.meta.url))

before(async () => {
  const abierta = await abrirBasePruebas()
  conexiones = abierta.pool
  configuracion = { ...abierta.config, loginLimit: 100 }
  await mkdir(raizPruebas, { recursive: true })
  directorio = await mkdtemp(join(raizPruebas, 'comprobantes-prueba-'))
  almacen = crearAlmacenComprobantes(directorio)
  aplicacion = await crearAplicacion({ pool: conexiones, config: configuracion, almacenComprobantes: almacen })
  for (const rol of ['ASISTENTE', 'ASISTENTE', 'GERENTE']) {
    const usuario = await crearUsuarioPrueba(conexiones, rol)
    usuarios.push(usuario)
    const sesion = await request(aplicacion).post('/api/auth/login').send({ email: usuario.email, password: usuario.password }).expect(200)
    tokens.push(sesion.body.token)
  }
  const imagen = { create: { width: 4, height: 4, channels: 3, background: { r: 20, g: 100, b: 30 } } }
  png = await sharp(imagen).png().toBuffer()
  jpg = await sharp(imagen).jpeg().toBuffer()
})

after(async () => {
  if (conexiones) {
    try {
      for (const id of abonos) await conexiones.execute('DELETE FROM comprobantes WHERE abono_id = ?', [id])
      for (const id of obligaciones) {
        await conexiones.execute('DELETE FROM abonos WHERE obligacion_id = ?', [id])
        await conexiones.execute('DELETE FROM obligaciones WHERE id = ?', [id])
      }
      for (const usuario of usuarios) await eliminarUsuarioPrueba(conexiones, usuario)
    } finally { await conexiones.end() }
  }
  // Solo se elimina el directorio aleatorio creado por esta suite.
  if (directorio && directorio.startsWith(join(raizPruebas, 'comprobantes-prueba-'))) {
    await rm(directorio, { recursive: true, force: true })
  }
})

async function nuevoAbono() {
  const obligacion = await request(aplicacion).post('/api/obligaciones').auth(tokens[0], { type: 'bearer' })
    .send({ concepto: 'Prueba HU-04', beneficiario: 'Proveedor', monto: '100.00', fecha_limite: '2027-01-01' }).expect(201)
  const id = obligacion.body.obligacion.id
  obligaciones.push(id)
  // Registro antiguo de prueba, anterior a la evidencia obligatoria.
  const respuesta = await registrarAbono(conexiones, id, { monto: '10.00', medio_pago: 'Efectivo', clave_idempotencia: crypto.randomUUID() }, usuarios[0].id)
  const abono = respuesta.abono.id
  abonos.push(abono)
  return { id: abono, obligacionId: id }
}

function cargar(id, { datos = png, nombre = 'comprobante.png', tipo = 'image/png', token = tokens[0], destino = aplicacion } = {}) {
  return request(destino).post(`/api/abonos/${id}/comprobante`).auth(token, { type: 'bearer' })
    .attach('comprobante', datos, { filename: nombre, contentType: tipo })
}

test('HU-04: conserva registros antiguos sin adjuntos y la consulta informa ausencia', async () => {
  const { id } = await nuevoAbono()
  const respuesta = await request(aplicacion).get(`/api/abonos/${id}/comprobante`).auth(tokens[0], { type: 'bearer' }).expect(200)
  assert.deepEqual(respuesta.body, { tiene_comprobante: false, comprobante: null })
  await request(aplicacion).get(`/api/abonos/${id}/comprobante/archivo`).auth(tokens[0], { type: 'bearer' }).expect(404)
})

test('HU-04: PNG y JPG se asocian al abono exacto, se recuperan privados y no cambian saldo', async () => {
  for (const [datos, nombre, tipo] of [[png, 'boleta.png', 'image/png'], [jpg, 'boleta.jpg', 'image/jpeg']]) {
    const { id, obligacionId } = await nuevoAbono()
    const respuesta = await cargar(id, { datos, nombre, tipo }).expect(201)
    assert.equal(respuesta.body.comprobante.abono_id, id)
    assert.equal(respuesta.body.comprobante.tipo, tipo)
    assert.ok(respuesta.body.comprobante.tamano > 0)
    assert.match(respuesta.body.comprobante.fecha_asociacion, /Z$/)
    assert.ok(!JSON.stringify(respuesta.body).includes('identificador_archivo'))
    assert.ok(!JSON.stringify(respuesta.body).includes(directorio))
    const metadatos = await request(aplicacion).get(`/api/abonos/${id}/comprobante`).auth(tokens[0], { type: 'bearer' }).expect(200)
    assert.equal(metadatos.body.tiene_comprobante, true)
    for (const token of [tokens[0], tokens[2]]) {
      const descarga = await request(aplicacion).get(metadatos.body.comprobante.url_descarga).auth(token, { type: 'bearer' }).expect(200)
      assert.equal(descarga.headers['content-type'], tipo)
      assert.equal(descarga.headers['cache-control'], 'no-store')
      assert.equal(descarga.headers['x-content-type-options'], 'nosniff')
      assert.match(descarga.headers['content-disposition'], /^attachment;/)
      const imagen = await sharp(descarga.body).metadata()
      assert.equal(imagen.width, 4)
    }
    const [[fila]] = await conexiones.execute('SELECT saldo_pendiente FROM obligaciones WHERE id = ?', [obligacionId])
    assert.equal(fila.saldo_pendiente, '90.00')
  }
})

test('HU-04: rechaza archivos grandes, extensión falsa, MIME falso, firma y contenido inválidos sin escribir', async () => {
  const { id } = await nuevoAbono()
  const antes = await readdir(directorio)
  for (const [opciones, estado] of [
    [{ datos: Buffer.alloc(LIMITE_ARCHIVO + 1) }, 413],
    [{ nombre: 'factura.exe' }, 422],
    [{ datos: jpg, nombre: 'factura.png', tipo: 'image/png' }, 422],
    [{ tipo: 'image/jpeg' }, 422],
    [{ datos: Buffer.from('No soy una imagen') }, 422],
    [{ datos: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]) }, 422],
    [{ datos: Buffer.alloc(0) }, 422],
  ]) await cargar(id, opciones).expect(estado)
  await request(aplicacion).post(`/api/abonos/${id}/comprobante`).auth(tokens[0], { type: 'bearer' }).send({}).expect(422)
  await request(aplicacion).post(`/api/abonos/${id}/comprobante`).auth(tokens[0], { type: 'bearer' }).attach('otro', png, 'a.png').expect(422)
  await request(aplicacion).post(`/api/abonos/${id}/comprobante`).auth(tokens[0], { type: 'bearer' })
    .attach('comprobante', png, 'a.png').attach('comprobante', png, 'b.png').expect(422)
  assert.deepEqual(await readdir(directorio), antes)
})

test('HU-04: autorización previa a la carga y descarga; no admite rutas internas', async () => {
  const { id } = await nuevoAbono()
  for (const ruta of [`/api/abonos/${id}/comprobante`, `/api/abonos/${id}/comprobante/archivo`]) {
    await request(aplicacion).get(ruta).expect(401)
    await request(aplicacion).get(ruta).auth(tokens[1], { type: 'bearer' }).expect(403)
  }
  await request(aplicacion).post(`/api/abonos/${id}/comprobante`).expect(401)
  await cargar(id, { token: tokens[1] }).expect(403)
  await cargar(id, { token: tokens[2] }).expect(403)
  await cargar(4294967295).expect(404)
  await request(aplicacion).get('/api/abonos/4294967295/comprobante').auth(tokens[0], { type: 'bearer' }).expect(404)
  await request(aplicacion).get('/api/abonos/..%2F..%2F.env/comprobante/archivo').auth(tokens[0], { type: 'bearer' }).expect(422)
  await request(aplicacion).get('/.local/comprobantes/archivo.png').expect(404)
  await assert.rejects(almacen.leer('../../backend/.env.test'), /Identificador interno/)
})

test('HU-04: reintento idéntico es idempotente y un archivo distinto devuelve 409', async () => {
  const { id } = await nuevoAbono()
  const primero = await cargar(id).expect(201)
  const archivos = await readdir(directorio)
  const segundo = await cargar(id).expect(200)
  assert.deepEqual(segundo.body, primero.body)
  await cargar(id, { datos: jpg, nombre: 'a.jpg', tipo: 'image/jpeg' }).expect(409)
  assert.deepEqual(await readdir(directorio), archivos)
})

test('HU-04: dos cargas concurrentes idénticas crean un solo archivo y registro', async () => {
  const { id } = await nuevoAbono()
  const antes = (await readdir(directorio)).length
  const respuestas = await Promise.all([cargar(id), cargar(id)])
  assert.deepEqual(respuestas.map((respuesta) => respuesta.status).sort(), [200, 201])
  assert.equal((await readdir(directorio)).length, antes + 1)
  const [[fila]] = await conexiones.execute('SELECT COUNT(*) AS cantidad FROM comprobantes WHERE abono_id = ?', [id])
  assert.equal(Number(fila.cantidad), 1)
})

test('HU-04: dos archivos concurrentes distintos no se reemplazan', async () => {
  const { id } = await nuevoAbono()
  const respuestas = await Promise.all([cargar(id), cargar(id, { datos: jpg, nombre: 'b.jpg', tipo: 'image/jpeg' })])
  assert.deepEqual(respuestas.map((respuesta) => respuesta.status).sort(), [201, 409])
})

test('HU-04: error de disco no crea metadatos y error MySQL limpia el archivo', async (contexto) => {
  contexto.mock.method(console, 'error', () => {})
  const { id } = await nuevoAbono()
  const antes = await readdir(directorio)
  const almacenFallido = { ...almacen, guardar: async () => { throw Object.assign(new Error('Fallo privado'), { code: 'EACCES' }) } }
  const aplicacionDisco = await crearAplicacion({ pool: conexiones, config: configuracion, almacenComprobantes: almacenFallido })
  await cargar(id, { destino: aplicacionDisco }).expect(500)
  const poolFallido = {
    execute: (...parametros) => conexiones.execute(...parametros),
    getConnection: async () => {
      const conexion = await conexiones.getConnection()
      return {
        beginTransaction: () => conexion.beginTransaction(), commit: () => conexion.commit(),
        rollback: () => conexion.rollback(), release: () => conexion.release(),
        execute: (sql, parametros) => {
          if (sql.includes('INSERT INTO comprobantes')) throw new Error('Fallo MySQL simulado')
          return conexion.execute(sql, parametros)
        },
      }
    },
  }
  const aplicacionSql = await crearAplicacion({ pool: poolFallido, config: configuracion, almacenComprobantes: almacen })
  await cargar(id, { destino: aplicacionSql }).expect(500)
  const [[fila]] = await conexiones.execute('SELECT COUNT(*) AS cantidad FROM comprobantes WHERE abono_id = ?', [id])
  assert.equal(Number(fila.cantidad), 0)
  assert.deepEqual(await readdir(directorio), antes)
})

test('HU-04: pérdida de respuesta de COMMIT conserva archivo y permite reintentar', async (contexto) => {
  contexto.mock.method(console, 'error', () => {})
  const { id } = await nuevoAbono()
  const poolIncierto = {
    execute: (...parametros) => conexiones.execute(...parametros),
    getConnection: async () => {
      const conexion = await conexiones.getConnection()
      return {
        beginTransaction: () => conexion.beginTransaction(),
        commit: async () => { await conexion.commit(); throw new Error('Respuesta de confirmación perdida') },
        rollback: () => conexion.rollback(), release: () => conexion.release(),
        execute: (...parametros) => conexion.execute(...parametros),
      }
    },
  }
  const destino = await crearAplicacion({ pool: poolIncierto, config: configuracion, almacenComprobantes: almacen })
  await cargar(id, { destino }).expect(500)
  await cargar(id).expect(200)
  await request(aplicacion).get(`/api/abonos/${id}/comprobante/archivo`).auth(tokens[0], { type: 'bearer' }).expect(200)
})

test('HU-04: almacenamiento limpia una escritura interrumpida y no usa nombres del cliente', async () => {
  const imagen = await validarComprobante({ buffer: png, originalname: '../../boleta.png', mimetype: 'image/png' })
  assert.equal(imagen.nombre, 'boleta.png')
  assert.ok(!imagen.nombre.includes('..'))
  const antes = await readdir(directorio)
  const almacenInterrumpido = crearAlmacenComprobantes(directorio, {
    mkdir, unlink,
    open: async (...parametros) => {
      const archivo = await open(...parametros)
      return {
        writeFile: async (datos) => {
          await archivo.writeFile(datos.subarray(0, 8))
          throw Object.assign(new Error('Disco lleno simulado'), { code: 'ENOSPC' })
        },
        close: () => archivo.close(),
      }
    },
  })
  await assert.rejects(almacenInterrumpido.guardar(imagen.datos, imagen.extension), { code: 'ENOSPC' })
  assert.deepEqual(await readdir(directorio), antes)
  const identificador = await almacen.guardar(imagen.datos, imagen.extension)
  assert.match(identificador, /^[a-f0-9-]{36}\.png$/)
  assert.deepEqual(await almacen.leer(identificador), imagen.datos)
  await almacen.eliminar(identificador)
  await almacen.eliminar(identificador)
  await assert.rejects(almacen.leer(identificador), { code: 'ENOENT' })
})
