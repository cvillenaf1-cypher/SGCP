import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import request from 'supertest'
import { crearAplicacion } from '../src/app.js'
import { abrirBasePruebas, crearUsuarioPrueba, eliminarUsuarioPrueba } from './support/database.js'

let conexiones
let aplicacion
let asistente
let token
const obligaciones = []

before(async () => {
  const abierta = await abrirBasePruebas()
  conexiones = abierta.pool
  aplicacion = await crearAplicacion({ pool: conexiones, config: abierta.config })
  asistente = await crearUsuarioPrueba(conexiones)
  const sesion = await request(aplicacion).post('/api/auth/login')
    .send({ email: asistente.email, password: asistente.password }).expect(200)
  token = sesion.body.token
})

after(async () => {
  if (!conexiones) return
  try {
    for (const obligacionId of obligaciones) {
      await conexiones.execute('DELETE FROM abonos WHERE obligacion_id = ?', [obligacionId])
      await conexiones.execute('DELETE FROM obligaciones WHERE id = ?', [obligacionId])
    }
    if (asistente) await eliminarUsuarioPrueba(conexiones, asistente)
  } finally {
    await conexiones.end()
  }
})

async function crearObligacion(saldo = '10.00') {
  const [resultado] = await conexiones.execute(
    `INSERT INTO obligaciones
      (concepto, beneficiario, monto_original, saldo_pendiente, fecha_limite, usuario_creador_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [`Prueba de abonos ${randomUUID()}`, 'Proveedor de prueba', saldo, saldo, '2027-01-01', asistente.id],
  )
  obligaciones.push(resultado.insertId)
  return resultado.insertId
}

function enviarAbono(obligacionId, clave, monto = '4.00') {
  return request(aplicacion).post(`/api/obligaciones/${obligacionId}/abonos`)
    .auth(token, { type: 'bearer' })
    .send({ monto, medio_pago: 'Transferencia bancaria', clave_idempotencia: clave })
}

function nuevaClave() {
  return `abono_${randomUUID().replaceAll('-', '')}`
}

test('MySQL real: reintentos concurrentes de la misma clave crean un único abono', async () => {
  const obligacionId = await crearObligacion()
  const clave = nuevaClave()
  const respuestas = await Promise.all([
    enviarAbono(obligacionId, clave).then((respuesta) => respuesta),
    enviarAbono(obligacionId, clave).then((respuesta) => respuesta),
  ])

  assert.deepEqual(respuestas.map(({ status }) => status).sort(), [200, 201])
  assert.deepEqual(respuestas[0].body.abono, respuestas[1].body.abono)
  const [[{ cantidad }]] = await conexiones.execute('SELECT COUNT(*) AS cantidad FROM abonos WHERE obligacion_id = ?', [obligacionId])
  const [[{ saldo_pendiente: saldo }]] = await conexiones.execute('SELECT saldo_pendiente FROM obligaciones WHERE id = ?', [obligacionId])
  assert.equal(Number(cantidad), 1)
  assert.equal(saldo, '6.00')
})

test('MySQL real: pagos concurrentes distintos no permiten sobrepagar', async () => {
  const obligacionId = await crearObligacion()
  const respuestas = await Promise.all([
    enviarAbono(obligacionId, nuevaClave(), '7.00').then((respuesta) => respuesta),
    enviarAbono(obligacionId, nuevaClave(), '7.00').then((respuesta) => respuesta),
  ])

  assert.deepEqual(respuestas.map(({ status }) => status).sort(), [201, 409])
  const [[{ cantidad }]] = await conexiones.execute('SELECT COUNT(*) AS cantidad FROM abonos WHERE obligacion_id = ?', [obligacionId])
  const [[{ saldo_pendiente: saldo }]] = await conexiones.execute('SELECT saldo_pendiente FROM obligaciones WHERE id = ?', [obligacionId])
  assert.equal(Number(cantidad), 1)
  assert.equal(saldo, '3.00')
})

test('MySQL real: la clave concurrente no puede registrar pagos para dos obligaciones', async () => {
  const primeraObligacion = await crearObligacion()
  const segundaObligacion = await crearObligacion()
  const clave = nuevaClave()
  const respuestas = await Promise.all([
    enviarAbono(primeraObligacion, clave).then((respuesta) => respuesta),
    enviarAbono(segundaObligacion, clave).then((respuesta) => respuesta),
  ])

  assert.deepEqual(respuestas.map(({ status }) => status).sort(), [201, 409])
  const [[{ cantidad }]] = await conexiones.execute('SELECT COUNT(*) AS cantidad FROM abonos WHERE usuario_registrador_id = ? AND clave_idempotencia = ?', [asistente.id, clave])
  const [[{ cambios }]] = await conexiones.execute(
    'SELECT COUNT(*) AS cambios FROM obligaciones WHERE id IN (?, ?) AND saldo_pendiente <> monto_original',
    [primeraObligacion, segundaObligacion],
  )
  assert.equal(Number(cantidad), 1)
  assert.equal(Number(cambios), 1)
})
