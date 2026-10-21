import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import request from 'supertest'
import { crearAplicacion } from '../src/app.js'
import { crearConexiones } from '../src/db/pool.js'
import { migrar } from '../src/db/migrate.js'
import { configuracionPruebas, crearUsuarioPrueba, eliminarUsuarioPrueba } from './support/database.js'
import { adjuntarComprobante, almacenMemoria } from './support/comprobante.js'
import { definicionesPerfil } from '../../shared/perfilReferencia.js'

const raiz = '/api/perfil-referencia'
const rutas = [['get', ''], ['post', ''], ['put', '/titular'], ['post', '/bancos'], ['put', '/bancos/1'], ['post', '/bancos/1/desactivar'], ['post', '/servicios'], ['put', '/servicios/1'], ['post', '/servicios/1/desactivar']]
const cuerpoReferencia = (tipo, fila) => Object.fromEntries(Object.keys(definicionesPerfil[tipo]).map((clave) => [clave, fila[clave]]))

async function resumenTablas(conexiones, tablas) {
  const resultado = {}
  for (const tabla of tablas) {
    const [filas] = await conexiones.query(`SELECT * FROM ${tabla} ORDER BY ${tabla === 'comprobantes' ? 'abono_id' : 'id'}`)
    resultado[tabla] = createHash('sha256').update(JSON.stringify(filas)).digest('hex')
  }
  return resultado
}

test('perfil: integración MySQL local, permisos, persistencia, auditoría y conservación', async (t) => {
  const config = configuracionPruebas()
  // Defensa adicional: esta suite nunca debe ejecutarse contra un servidor remoto.
  assert.equal(config.database.host, '127.0.0.1')
  assert.equal(Number(config.database.port), 3307)
  assert.equal(config.database.database, 'sgcp_test')
  const pool = crearConexiones(config.database)
  const usuarios = []
  let propietario
  let obligacionId
  let perfil
  try {
    const [existentes] = await pool.execute('SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')
    const tablasHistoricas = ['usuarios', 'sesiones', 'obligaciones', 'abonos', 'comprobantes'].filter((nombre) => existentes.some((tabla) => tabla.nombre === nombre))
    const antesMigracion = await resumenTablas(pool, tablasHistoricas)
    const aplicadas = await migrar(pool)
    t.diagnostic(`Migraciones locales aplicadas: ${aplicadas.join(', ') || 'ninguna pendiente'}`)
    await t.test('migración compatible e idempotente conserva datos históricos y roles existentes', async () => {
      assert.deepEqual(await resumenTablas(pool, tablasHistoricas), antesMigracion)
      assert.deepEqual(await migrar(pool), [])
      const [roles] = await pool.execute('SELECT id, codigo FROM roles ORDER BY id')
      assert.deepEqual(roles, [{ id: 1, codigo: 'ASISTENTE' }, { id: 2, codigo: 'GERENTE' }, { id: 3, codigo: 'CONFIGURADOR' }])
    })
    const [[existente]] = await pool.execute('SELECT id FROM perfil_referencia WHERE id = 1')
    assert.ok(!existente, 'La suite requiere un perfil vacío en sgcp_test; no se sobrescriben perfiles existentes.')
    const app = await crearAplicacion({ pool, config: { ...config, loginLimit: 100 }, almacenComprobantes: almacenMemoria() })
    const tokens = {}
    for (const rol of ['ASISTENTE', 'GERENTE', 'CONFIGURADOR']) {
      const usuario = await crearUsuarioPrueba(pool, rol)
      usuarios.push(usuario)
      if (rol === 'CONFIGURADOR') propietario = usuario
      const sesion = await request(app).post('/api/auth/login').send({ email: usuario.email, password: usuario.password }).expect(200)
      tokens[rol] = sesion.body.token
    }
    const enviar = (metodo, sufijo, cuerpo, rol = 'CONFIGURADOR') => request(app)[metodo](`${raiz}${sufijo}`).auth(tokens[rol], { type: 'bearer' }).send(cuerpo)
    const guardar = async (metodo, sufijo, cuerpo, estado = 200) => {
      const respuesta = await enviar(metodo, sufijo, cuerpo).expect(estado)
      perfil = respuesta.body.perfil
      assert.equal(respuesta.headers['cache-control'], 'no-store')
      return perfil
    }

    await t.test('todos los endpoints exigen sesión y permiso; GERENTE y ASISTENTE no configuran', async () => {
      for (const [metodo, sufijo] of rutas) {
        await request(app)[metodo](`${raiz}${sufijo}`).send({}).expect(401)
        await request(app)[metodo](`${raiz}${sufijo}`).auth('f'.repeat(64), { type: 'bearer' }).send({}).expect(401)
        for (const rol of ['GERENTE', 'ASISTENTE']) {
          await enviar(metodo, sufijo, { role: 'CONFIGURADOR', permiso: 'CONFIGURAR_PERFIL' }, rol).set('X-Role', 'CONFIGURADOR').expect(403)
        }
      }
      for (const rol of ['GERENTE', 'CONFIGURADOR']) {
        await request(app).post('/api/obligaciones').auth(tokens[rol], { type: 'bearer' }).send({}).expect(403)
        await request(app).post('/api/obligaciones/1/abonos').auth(tokens[rol], { type: 'bearer' }).send({}).expect(403)
      }
    })

    await t.test('perfil ausente se consulta vacío; creación vacía es persistente e idempotente', async () => {
      await guardar('get', '')
      assert.equal(perfil.id, null)
      await guardar('post', '', {}, 201)
      assert.equal(perfil.id, 1)
      assert.equal(perfil.titular.nombre, '')
      const anterior = perfil
      await guardar('post', '', {})
      assert.deepEqual(perfil, anterior)
      const reiniciada = await crearAplicacion({ pool, config })
      const leido = await request(reiniciada).get(raiz).auth(tokens.CONFIGURADOR, { type: 'bearer' }).expect(200)
      assert.deepEqual(leido.body.perfil, perfil)
    })

    const obligacion = await request(app).post('/api/obligaciones').auth(tokens.ASISTENTE, { type: 'bearer' })
      .send({ concepto: 'Histórico sintético de perfil', beneficiario: 'Proveedor de prueba', monto: '10.00', fecha_limite: '2027-01-01' }).expect(201)
    obligacionId = obligacion.body.obligacion.id
    await adjuntarComprobante(request(app).post(`/api/obligaciones/${obligacionId}/abonos`).auth(tokens.ASISTENTE, { type: 'bearer' }),
      { monto: '2.00', medio_pago: 'Efectivo', clave_idempotencia: `perfil_${propietario.id}_historico` }).expect(201)
    const historicos = await resumenTablas(pool, ['obligaciones', 'abonos', 'comprobantes'])

    await t.test('múltiples bancos y referencias del mismo banco sin titular; duplicados exactos reciben 409', async () => {
      for (const entrada of [{ entidad: 'BCP', alias: 'Local central' }, { entidad: 'BCP', alias: 'Sucursal' }, { entidad: 'Interbank', relacion: 'PRESTAMISTA' }]) {
        await guardar('post', '/bancos', entrada, 201)
      }
      assert.equal(perfil.bancos.length, 3)
      assert.equal(perfil.titular.nombre, '')
      await enviar('post', '/bancos', { entidad: ' bcp ', alias: 'Local  central' }).expect(409)
      const concurrentes = await Promise.all([enviar('post', '/bancos', { entidad: 'BBVA' }), enviar('post', '/bancos', { entidad: 'BBVA' })])
      assert.deepEqual(concurrentes.map((r) => r.status).sort(), [201, 409])
      await guardar('get', '')
      assert.equal(perfil.bancos.length, 4)
    })

    await t.test('varios suministros y un tercero relacionado sin titular principal ni calificación de fraude', async () => {
      for (const codigo of ['SUM-001', 'SUM-002']) await guardar('post', '/servicios', {
        tipo: 'ELECTRICIDAD', empresa: 'Proveedor de energía de prueba', codigo_cliente: codigo,
        titular: 'Propietario de prueba', documento: '12345678', direccion: 'Local de prueba',
        relacion_empresa: 'TERCERO_RELACIONADO', detalle_relacion: 'Propietario del local alquilado',
      }, 201)
      assert.equal(perfil.servicios.length, 2)
      assert.equal(perfil.titular.nombre, '')
      assert.equal(perfil.servicios[0].relacion_empresa, 'TERCERO_RELACIONADO')
      assert.equal(perfil.servicios[0].fraude, undefined)
      await enviar('post', '/servicios', cuerpoReferencia('servicios', perfil.servicios[0])).expect(409)
    })

    await t.test('titular parcial, persona natural, empresa y edición posterior', async () => {
      await guardar('put', '/titular', { nombre: 'Borrador de prueba', version: perfil.version })
      assert.equal(perfil.titular.documento, '')
      await guardar('put', '/titular', { tipo: 'PERSONA_NATURAL', nombre: 'Persona de prueba', documento: '12345678', version: perfil.version })
      assert.equal(perfil.titular.tipo, 'PERSONA_NATURAL')
      const versionAnterior = perfil.version
      await guardar('put', '/titular', { tipo: 'EMPRESA', nombre: 'Empresa de prueba', documento: '20123456789', version: perfil.version })
      assert.equal(perfil.titular.tipo, 'EMPRESA')
      await enviar('put', '/titular', { nombre: 'Edición obsoleta', version: versionAnterior }).expect(409)
      const banco = perfil.bancos[0]
      await enviar('put', `/bancos/${banco.id}`, { ...cuerpoReferencia('bancos', perfil.bancos[1]), version: banco.version }).expect(409)
      await guardar('put', `/bancos/${banco.id}`, { ...cuerpoReferencia('bancos', banco), alias: 'Local editado', version: banco.version })
      assert.equal(perfil.bancos[0].alias, 'Local editado')
      const servicio = perfil.servicios[0]
      await guardar('put', `/servicios/${servicio.id}`, { ...cuerpoReferencia('servicios', servicio), direccion: 'Nueva dirección', version: servicio.version })
      assert.equal(perfil.servicios[0].direccion, 'Nueva dirección')
      await enviar('put', '/bancos/4294967295', { entidad: 'BCP', version: 1 }).expect(404)
      await enviar('put', '/bancos/no-valido', { entidad: 'BCP', version: 1 }).expect(422)
    })

    await t.test('desactivación conserva filas, libera duplicado activo y rechaza ediciones obsoletas', async () => {
      for (const tipo of ['bancos', 'servicios']) {
        const fila = perfil[tipo][0]
        await guardar('post', `/${tipo}/${fila.id}/desactivar`, { version: fila.version })
        assert.equal(perfil[tipo][0].activo, false)
        await enviar('put', `/${tipo}/${fila.id}`, { ...cuerpoReferencia(tipo, fila), version: fila.version }).expect(409)
        await guardar('post', `/${tipo}`, cuerpoReferencia(tipo, fila), 201)
        assert.ok(perfil[tipo].at(-1).activo)
      }
    })

    await t.test('datos sensibles se rechazan antes de persistir y no aparecen en logs ni respuestas', async (contexto) => {
      const log = contexto.mock.method(console, 'error', () => {})
      const antes = await resumenTablas(pool, ['perfil_referencia', 'perfil_bancos', 'perfil_servicios', 'perfil_auditoria'])
      for (const dato of ['4111111111111111', '4111 1111 1111 1111', 'CVV: 123', 'PIN: 1234', 'Clave SOL: secreta', 'password=privada', 'CCI 00212345678901234567']) {
        for (const [sufijo, cuerpo] of [['/bancos', { entidad: 'BCP', alias: dato }], ['/servicios', { empresa: 'Proveedor', direccion: dato }]]) {
          const r = await enviar('post', sufijo, cuerpo).expect(422)
          assert.ok(!JSON.stringify(r.body).includes(dato))
        }
      }
      await enviar('post', '/bancos', { entidad: 'BCP', cvv: '123' }).expect(422)
      await enviar('put', '/titular', { nombre: '4111111111111111', version: perfil.version }).expect(422)
      assert.equal(log.mock.callCount(), 0)
      assert.deepEqual(await resumenTablas(pool, ['perfil_referencia', 'perfil_bancos', 'perfil_servicios', 'perfil_auditoria']), antes)
    })

    await t.test('auditoría registra responsable, fecha, operación, entidad y campos sin valores personales', async () => {
      const [eventos] = await pool.execute('SELECT * FROM perfil_auditoria WHERE usuario_id = ? ORDER BY id', [propietario.id])
      assert.ok(eventos.length > 10)
      assert.equal(eventos.filter((evento) => evento.entidad === 'PERFIL').length, 1)
      assert.ok(eventos.some((evento) => evento.operacion === 'DESACTIVACION'))
      for (const evento of eventos) {
        assert.ok(evento.fecha)
        assert.equal(evento.usuario_id, propietario.id)
        const campos = typeof evento.campos === 'string' ? JSON.parse(evento.campos) : evento.campos
        assert.ok(Array.isArray(campos))
        assert.ok(!JSON.stringify(evento).includes('12345678'))
        assert.ok(!JSON.stringify(evento).includes('Propietario de prueba'))
      }
    })

    await t.test('cambios del perfil conservan exactamente obligaciones, importes, abonos y comprobantes', async () => {
      assert.deepEqual(await resumenTablas(pool, ['obligaciones', 'abonos', 'comprobantes']), historicos)
    })

    await t.test('permisos se vuelven a consultar: cambio de rol revoca configuración en una sesión existente', async () => {
      await pool.execute('UPDATE usuarios SET rol_id = 2 WHERE id = ?', [propietario.id])
      await enviar('get', '').expect(403)
      await enviar('post', '/bancos', { entidad: 'BCP' }).expect(403)
      await request(app).post('/api/obligaciones').auth(tokens.CONFIGURADOR, { type: 'bearer' }).send({}).expect(403)
    })
  } finally {
    try {
      if (propietario) {
        const [[propio]] = await pool.execute('SELECT id FROM perfil_referencia WHERE id = 1 AND creado_por = ?', [propietario.id])
        if (propio) {
          for (const tabla of ['perfil_auditoria', 'perfil_bancos', 'perfil_servicios']) await pool.execute(`DELETE FROM ${tabla} WHERE perfil_id = ?`, [propio.id])
          await pool.execute('DELETE FROM perfil_referencia WHERE id = ? AND creado_por = ?', [propio.id, propietario.id])
        }
      }
      if (obligacionId) {
        await pool.execute('DELETE c FROM comprobantes c JOIN abonos a ON a.id = c.abono_id WHERE a.obligacion_id = ?', [obligacionId])
        await pool.execute('DELETE FROM abonos WHERE obligacion_id = ?', [obligacionId])
        await pool.execute('DELETE FROM obligaciones WHERE id = ?', [obligacionId])
      }
      for (const usuario of usuarios) await eliminarUsuarioPrueba(pool, usuario)
    } finally { await pool.end() }
  }
})
