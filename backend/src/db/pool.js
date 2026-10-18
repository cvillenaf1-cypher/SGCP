import mysql from 'mysql2/promise'

export function crearConexiones(baseDatos) {
  return mysql.createPool({
    ...baseDatos,
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
