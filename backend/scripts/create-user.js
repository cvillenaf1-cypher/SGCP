import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { cargarEntorno, leerConfiguracion } from '../src/config.js'
import { crearConexiones } from '../src/db/pool.js'
import { crearUsuario } from '../src/auth/service.js'

cargarEntorno()
let conexiones
let consola
let oculto = false
try {
  if (!process.stdin.isTTY) throw new Error('Ejecuta este comando en una terminal interactiva.')
  const salida = new Writable({ write(fragmento, _codificacion, continuar) { if (!oculto) process.stdout.write(fragmento); continuar() } })
  consola = createInterface({ input: process.stdin, output: salida, terminal: true })
  const nombre = await consola.question('Nombre: ')
  const correo = await consola.question('Correo: ')
  const rol = (await consola.question('Rol (ASISTENTE o GERENTE): ')).trim().toUpperCase()
  process.stdout.write('Contraseña (12–128 caracteres, entrada oculta): ')
  oculto = true
  const contrasena = await consola.question('')
  oculto = false
  process.stdout.write('\nConfirmar contraseña (entrada oculta): ')
  oculto = true
  const confirmacion = await consola.question('')
  oculto = false
  process.stdout.write('\n')
  if (contrasena !== confirmacion) throw new Error('Las contraseñas no coinciden.')
  conexiones = crearConexiones(leerConfiguracion().database)
  const id = await crearUsuario(conexiones, { name: nombre, email: correo, role: rol, password: contrasena })
  console.log(`Usuario creado con ID ${id}.`)
} catch (error) {
  console.error(error.code === 'ER_DUP_ENTRY' ? 'Ya existe un usuario con ese correo.' : (error.code || error.message))
  process.exitCode = 1
} finally {
  oculto = false
  consola?.close()
  if (conexiones) await conexiones.end()
}
