import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { loadEnvironment, readConfig } from '../src/config.js'
import { createPool } from '../src/db/pool.js'
import { createUser } from '../src/auth/service.js'

loadEnvironment()
let pool
let prompt
let hidden = false
try {
  if (!process.stdin.isTTY) throw new Error('Ejecuta este comando en una terminal interactiva.')
  const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback() } })
  prompt = createInterface({ input: process.stdin, output, terminal: true })
  const name = await prompt.question('Nombre: ')
  const email = await prompt.question('Correo: ')
  const role = (await prompt.question('Rol (ASISTENTE o GERENTE): ')).trim().toUpperCase()
  process.stdout.write('Contraseña (12–128 caracteres, entrada oculta): ')
  hidden = true
  const password = await prompt.question('')
  hidden = false
  process.stdout.write('\nConfirmar contraseña (entrada oculta): ')
  hidden = true
  const confirmation = await prompt.question('')
  hidden = false
  process.stdout.write('\n')
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden.')
  pool = createPool(readConfig().database)
  const id = await createUser(pool, { name, email, role, password })
  console.log(`Usuario creado con ID ${id}.`)
} catch (error) {
  console.error(error.code === 'ER_DUP_ENTRY' ? 'Ya existe un usuario con ese correo.' : (error.code || error.message))
  process.exitCode = 1
} finally {
  hidden = false
  prompt?.close()
  if (pool) await pool.end()
}
