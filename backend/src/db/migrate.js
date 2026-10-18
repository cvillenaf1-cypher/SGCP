import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'

const migrationsDirectory = new URL('../../../database/migrations/', import.meta.url)

export async function migrate(pool) {
  const connection = await pool.getConnection()
  let lockName
  let locked = false
  const applied = []
  try {
    const [[{ name }]] = await connection.query('SELECT DATABASE() AS name')
    lockName = `sgcp:migrate:${createHash('sha256').update(name).digest('hex').slice(0, 32)}`
    const [[{ acquired }]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockName])
    if (Number(acquired) !== 1) throw new Error('No se pudo obtener el bloqueo de migraciones.')
    locked = true
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
    ) ENGINE=InnoDB`)

    const files = (await readdir(migrationsDirectory)).filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort()
    for (const file of files) {
      const sql = await readFile(new URL(file, migrationsDirectory), 'utf8')
      const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')
      const [previous] = await connection.execute('SELECT checksum FROM schema_migrations WHERE name = ?', [file])
      if (previous.length) {
        if (previous[0].checksum !== checksum) throw new Error(`La migración aplicada ${file} fue modificada.`)
        continue
      }
      // Migraciones SQL simples, sin procedimientos. MySQL hace commit implícito del DDL.
      for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((part) => part.trim()).filter(Boolean)) {
        await connection.query(statement)
      }
      await connection.execute('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [file, checksum])
      applied.push(file)
    }
    return applied
  } finally {
    try {
      if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lockName])
    } finally {
      connection.release()
    }
  }
}
