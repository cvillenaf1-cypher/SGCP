import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) await check(path)
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', fileURLToPath(path)], { stdio: 'inherit' })
      if (result.status !== 0) process.exitCode = 1
    }
  }
}
for (const directory of ['src/', 'scripts/', 'test/']) await check(new URL(`../${directory}`, import.meta.url))
