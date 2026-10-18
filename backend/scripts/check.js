import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

async function comprobar(directorio) {
  for (const entrada of await readdir(directorio, { withFileTypes: true })) {
    const ruta = new URL(entrada.name + (entrada.isDirectory() ? '/' : ''), directorio)
    if (entrada.isDirectory()) await comprobar(ruta)
    else if (entrada.name.endsWith('.js')) {
      const resultado = spawnSync(process.execPath, ['--check', fileURLToPath(ruta)], { stdio: 'inherit' })
      if (resultado.status !== 0) process.exitCode = 1
    }
  }
}
for (const directorio of ['src/', 'scripts/', 'test/']) await comprobar(new URL(`../${directorio}`, import.meta.url))
