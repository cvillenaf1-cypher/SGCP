import { mkdir, open, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIRECTORIO_PRIVADO = fileURLToPath(new URL('../../../.local/comprobantes/', import.meta.url))

export function crearAlmacenComprobantes(directorio = DIRECTORIO_PRIVADO, operaciones = { mkdir, open, unlink }) {
  const raiz = resolve(directorio)
  function resolverArchivo(identificador) {
    if (!/^[a-f0-9-]{36}\.(jpg|png|pdf)$/.test(identificador)) throw new Error('Identificador interno de comprobante inválido.')
    return join(raiz, identificador)
  }
  return {
    async guardar(datos, extension) {
      await operaciones.mkdir(raiz, { recursive: true, mode: 0o700 })
      const identificador = `${randomUUID()}.${extension}`
      const archivo = await operaciones.open(resolverArchivo(identificador), 'wx', 0o600)
      try {
        await archivo.writeFile(datos)
        await archivo.sync()
      } catch (error) {
        await archivo.close()
        await operaciones.unlink(resolverArchivo(identificador)).catch(() => {})
        throw error
      }
      await archivo.close()
      return identificador
    },
    async eliminar(identificador) {
      try { await operaciones.unlink(resolverArchivo(identificador)) } catch (error) { if (error.code !== 'ENOENT') throw error }
    },
    async leer(identificador) {
      // O_NOFOLLOW no es portable en Windows: el directorio es exclusivo del
      // servicio y sus nombres nunca proceden de parámetros HTTP.
      const archivo = await open(resolverArchivo(identificador), 'r')
      try {
        const estado = await archivo.stat()
        if (!estado.isFile() || estado.size > 5 * 1024 * 1024) throw new Error('Archivo privado inválido.')
        return await archivo.readFile()
      } finally { await archivo.close() }
    },
  }
}
