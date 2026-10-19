import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { rootCertificates } from 'node:tls'
import { test } from 'node:test'
import { leerConfiguracion } from '../src/config.js'
import { crearConexiones } from '../src/db/pool.js'

function entornoPrueba(adicional = {}) {
  return {
    DB_HOST: 'localhost',
    DB_NAME: 'configuracion_test',
    DB_USER: 'prueba',
    DB_PASSWORD: randomBytes(16).toString('hex'),
    FRONTEND_URL: 'https://interfaz.example.test',
    ...adicional,
  }
}

function prepararCertificado(contexto, contenido = rootCertificates[0]) {
  const directorio = mkdtempSync(join(tmpdir(), 'sgcp-tls-'))
  contexto.after(() => rmSync(directorio, { recursive: true, force: true }))
  const ruta = join(directorio, 'ca-prueba.pem')
  // CA pública incluida en Node.js; no utiliza el certificado de EC2.
  writeFileSync(ruta, contenido)
  return ruta
}

test('configuración TLS: producción exige una ruta CA no vacía', () => {
  for (const valor of [undefined, '', '   ']) {
    assert.throws(
      () => leerConfiguracion(entornoPrueba({ NODE_ENV: 'production', DB_SSL_CA_PATH: valor })),
      /DB_SSL_CA_PATH es obligatorio en producción/,
    )
  }
})

test('configuración TLS: rechaza rutas relativas en cualquier entorno', () => {
  for (const ambiente of ['development', 'test', 'production']) {
    for (const ruta of ['ca.pem', './certificados/ca.pem', '../ca.pem']) {
      assert.throws(
        () => leerConfiguracion(entornoPrueba({ NODE_ENV: ambiente, DB_SSL_CA_PATH: ruta })),
        /DB_SSL_CA_PATH debe ser una ruta absoluta/,
      )
    }
  }
})

test('configuración TLS: conserva la exigencia de HTTPS en producción', () => {
  assert.throws(
    () => leerConfiguracion(entornoPrueba({
      NODE_ENV: 'production',
      FRONTEND_URL: 'http://interfaz.example.test',
      DB_SSL_CA_PATH: join(tmpdir(), 'ca.pem'),
    })),
    /FRONTEND_URL debe usar HTTPS/,
  )
})

test('pool TLS: carga la CA y exige verificar el servidor en desarrollo y producción', async (contexto) => {
  const ruta = prepararCertificado(contexto)
  for (const ambiente of ['development', 'production']) {
    const configuracion = leerConfiguracion(entornoPrueba({ NODE_ENV: ambiente, DB_SSL_CA_PATH: ruta }))
    assert.equal(configuracion.database.rutaCaSsl, ruta)
    const conexiones = crearConexiones(configuracion.database)
    try {
      // Inspeccionar el pool perezoso no establece conexiones ni ejecuta SQL.
      const opciones = conexiones.pool.config.connectionConfig
      assert.equal(opciones.ssl.ca, rootCertificates[0])
      assert.equal(opciones.ssl.rejectUnauthorized, true)
      assert.equal(opciones.ssl.verifyIdentity, true)
      assert.equal(Object.hasOwn(opciones, 'rutaCaSsl'), false)
      assert.equal(conexiones.pool._allConnections.length, 0)
    } finally {
      await conexiones.end()
    }
  }
})

test('pool local: sin CA mantiene la conexión sin TLS obligatorio fuera de producción', async () => {
  for (const ambiente of [undefined, 'development', 'test']) {
    for (const valor of [undefined, '', '   ']) {
      const configuracion = leerConfiguracion(entornoPrueba({ NODE_ENV: ambiente, DB_SSL_CA_PATH: valor }))
      const conexiones = crearConexiones(configuracion.database)
      try {
        assert.equal(conexiones.pool.config.connectionConfig.ssl, false)
        assert.equal(conexiones.pool._allConnections.length, 0)
      } finally {
        await conexiones.end()
      }
    }
  }
})

test('pool TLS: una CA inexistente falla sin degradar a una conexión sin TLS', (contexto) => {
  const ruta = join(dirname(prepararCertificado(contexto)), 'inexistente.pem')
  const configuracion = leerConfiguracion(entornoPrueba({ DB_SSL_CA_PATH: ruta }))
  assert.throws(() => crearConexiones(configuracion.database), /No se pudo leer el certificado CA indicado en DB_SSL_CA_PATH/)
})

test('pool TLS: rechaza un directorio como archivo CA', (contexto) => {
  const ruta = prepararCertificado(contexto)
  const configuracion = leerConfiguracion(entornoPrueba({ DB_SSL_CA_PATH: dirname(ruta) }))
  assert.throws(() => crearConexiones(configuracion.database), /No se pudo leer el certificado CA indicado en DB_SSL_CA_PATH/)
})

test('pool TLS: rechaza una CA vacía sin degradar a una conexión sin TLS', (contexto) => {
  const ruta = prepararCertificado(contexto, '  \n')
  const configuracion = leerConfiguracion(entornoPrueba({ NODE_ENV: 'production', DB_SSL_CA_PATH: ruta }))
  assert.throws(() => crearConexiones(configuracion.database), /El certificado CA indicado en DB_SSL_CA_PATH está vacío/)
})
