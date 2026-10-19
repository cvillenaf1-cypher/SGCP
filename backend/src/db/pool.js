import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'

function leerCertificadoCa(ruta) {
  let certificado
  try {
    certificado = readFileSync(ruta, 'utf8')
  } catch {
    throw new Error('No se pudo leer el certificado CA indicado en DB_SSL_CA_PATH.')
  }
  if (!certificado.trim()) {
    throw new Error('El certificado CA indicado en DB_SSL_CA_PATH está vacío.')
  }
  return certificado
}

export function crearConexiones(baseDatos) {
  const { rutaCaSsl, ...opciones } = baseDatos
  return mysql.createPool({
    ...opciones,
    ...(rutaCaSsl ? { ssl: { ca: leerCertificadoCa(rutaCaSsl), rejectUnauthorized: true, verifyIdentity: true } } : {}),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 20,
    connectTimeout: 5000,
    timezone: 'Z',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    multipleStatements: false,
    charset: 'utf8mb4',
  })
}
