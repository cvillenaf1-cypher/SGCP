import { fileURLToPath } from 'node:url'
import { isAbsolute } from 'node:path'
import dotenv from 'dotenv'

export function cargarEntorno() {
  dotenv.config({
    path: fileURLToPath(new URL('../.env', import.meta.url)),
    quiet: true,
  })
}

function entero(valor, predeterminado, minimo, maximo, nombre) {
  const numero = Number(valor ?? predeterminado)
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw new Error(`${nombre} debe ser un entero entre ${minimo} y ${maximo}.`)
  }
  return numero
}

export function leerConfiguracion(entorno = process.env) {
  for (const nombre of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (!entorno[nombre]?.trim()) throw new Error(`Falta configurar ${nombre}.`)
  }
  const urlInterfaz = entorno.FRONTEND_URL || 'http://localhost:5173'
  const url = new URL(urlInterfaz)
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== urlInterfaz) {
    throw new Error('FRONTEND_URL debe ser un origen HTTP(S), sin ruta ni barra final.')
  }
  if (entorno.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('FRONTEND_URL debe usar HTTPS en producción.')
  }
  const rutaCaSsl = entorno.DB_SSL_CA_PATH?.trim() || undefined
  if (entorno.NODE_ENV === 'production' && !rutaCaSsl) {
    throw new Error('DB_SSL_CA_PATH es obligatorio en producción.')
  }
  if (rutaCaSsl && !isAbsolute(rutaCaSsl)) {
    throw new Error('DB_SSL_CA_PATH debe ser una ruta absoluta al certificado CA.')
  }

  return {
    port: entero(entorno.PORT, 3000, 1, 65535, 'PORT'),
    frontendUrl: urlInterfaz,
    sessionMinutes: entero(entorno.SESSION_TTL_MINUTES, 60, 1, 1440, 'SESSION_TTL_MINUTES'),
    loginLimit: 10,
    loginWindowMs: 15 * 60 * 1000,
    database: {
      host: entorno.DB_HOST,
      port: entero(entorno.DB_PORT, 3306, 1, 65535, 'DB_PORT'),
      database: entorno.DB_NAME,
      user: entorno.DB_USER,
      password: entorno.DB_PASSWORD,
      rutaCaSsl,
    },
  }
}
