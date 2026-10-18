import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'

const directorioMigraciones = new URL('../../../database/migrations/', import.meta.url)

export async function migrar(conexiones) {
  const conexion = await conexiones.getConnection()
  let nombreBloqueo
  let bloqueado = false
  const aplicadas = []
  try {
    const [[{ name: nombre }]] = await conexion.query('SELECT DATABASE() AS name')
    nombreBloqueo = `sgcp:migrate:${createHash('sha256').update(nombre).digest('hex').slice(0, 32)}`
    const [[{ acquired: adquirido }]] = await conexion.execute('SELECT GET_LOCK(?, 10) AS acquired', [nombreBloqueo])
    if (Number(adquirido) !== 1) throw new Error('No se pudo obtener el bloqueo de migraciones.')
    bloqueado = true
    await conexion.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
    ) ENGINE=InnoDB`)

    const archivos = (await readdir(directorioMigraciones)).filter((archivo) => /^\d{3}_[a-z0-9_]+\.sql$/.test(archivo)).sort()
    for (const archivo of archivos) {
      const sql = await readFile(new URL(archivo, directorioMigraciones), 'utf8')
      const sumaVerificacion = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')
      const [anteriores] = await conexion.execute('SELECT checksum FROM schema_migrations WHERE name = ?', [archivo])
      if (anteriores.length) {
        if (anteriores[0].checksum !== sumaVerificacion) throw new Error(`La migración aplicada ${archivo} fue modificada.`)
        continue
      }
      // Migraciones SQL simples, sin procedimientos. MySQL hace commit implícito del DDL.
      for (const sentencia of sql.split(/;\s*(?:\r?\n|$)/).map((parte) => parte.trim()).filter(Boolean)) {
        await conexion.query(sentencia)
      }
      await conexion.execute('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [archivo, sumaVerificacion])
      aplicadas.push(archivo)
    }
    return aplicadas
  } finally {
    try {
      if (bloqueado) await conexion.execute('SELECT RELEASE_LOCK(?)', [nombreBloqueo])
    } finally {
      conexion.release()
    }
  }
}
