import { crearUsuarioPrueba, abrirBasePruebas, eliminarUsuarioPrueba } from '../../backend/test/support/database.js'

export default async function prepararPruebas() {
  const { pool: conexiones } = await abrirBasePruebas()
  const usuarios = []
  try {
    usuarios.push(await crearUsuarioPrueba(conexiones, 'ASISTENTE'))
    usuarios.push(await crearUsuarioPrueba(conexiones, 'GERENTE'))
    // Credenciales aleatorias solo en memoria del proceso, nunca en archivos ni capturas.
    process.env.SGCP_E2E_USERS = JSON.stringify(usuarios)
    return async () => {
      try { for (const usuario of usuarios) await eliminarUsuarioPrueba(conexiones, usuario) } finally { await conexiones.end() }
    }
  } catch (error) {
    try { for (const usuario of usuarios) await eliminarUsuarioPrueba(conexiones, usuario) } finally { await conexiones.end() }
    throw error
  }
}
