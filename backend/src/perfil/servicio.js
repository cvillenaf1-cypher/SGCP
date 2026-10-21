import { createHash } from 'node:crypto'
import { definicionesPerfil, normalizarTextoPerfil, valoresInicialesPerfil } from '../../../shared/perfilReferencia.js'

const tablas = Object.freeze({ bancos: 'perfil_bancos', servicios: 'perfil_servicios' })
const entidades = Object.freeze({ bancos: 'BANCO', servicios: 'SERVICIO' })
const claves = (tipo) => Object.keys(definicionesPerfil[tipo])
const seleccionar = (fila, tipo) => Object.fromEntries(claves(tipo).map((clave) => [clave, fila[clave]]))

export class ErrorPerfil extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado }
}

export async function consultarPerfil(conexion) {
  const [[fila]] = await conexion.execute('SELECT id, tipo, nombre, documento, nombre_comercial, version FROM perfil_referencia WHERE id = 1')
  const perfil = { id: fila?.id || null, version: fila?.version || 0, titular: fila ? seleccionar(fila, 'titular') : valoresInicialesPerfil('titular'), bancos: [], servicios: [] }
  if (!fila) return perfil
  for (const tipo of ['bancos', 'servicios']) {
    const [referencias] = await conexion.execute(`SELECT id, ${claves(tipo).join(', ')}, activo, version FROM ${tablas[tipo]} WHERE perfil_id = 1 ORDER BY id`)
    perfil[tipo] = referencias.map((referencia) => ({ ...referencia, activo: Boolean(referencia.activo) }))
  }
  return perfil
}

async function auditar(conexion, usuario, operacion, entidad, id, campos) {
  // Solo nombres de campos, nunca valores anteriores/nuevos, documentos ni cuerpos de petición.
  await conexion.execute('INSERT INTO perfil_auditoria (usuario_id, operacion, entidad, entidad_id, campos) VALUES (?, ?, ?, ?, ?)',
    [usuario, operacion, entidad, id, JSON.stringify(campos)])
}

async function asegurarPerfil(conexion, usuario) {
  const [resultado] = await conexion.execute('INSERT IGNORE INTO perfil_referencia (id, creado_por) VALUES (1, ?)', [usuario])
  const [[perfil]] = await conexion.execute('SELECT id, tipo, nombre, documento, nombre_comercial, version FROM perfil_referencia WHERE id = 1 FOR UPDATE')
  if (resultado.affectedRows === 1) await auditar(conexion, usuario, 'CREACION', 'PERFIL', 1, [])
  return { perfil, nuevo: resultado.affectedRows === 1 }
}

function comprobarVersion(fila, version) {
  if (fila.version !== version) throw new ErrorPerfil(409, 'La referencia cambió en otra sesión. Recarga el perfil y revisa los datos antes de guardar.')
}

export function huellaReferencia(tipo, datos) {
  const valores = claves(tipo).map((clave) => normalizarTextoPerfil(datos[clave]).toLocaleLowerCase('es'))
  return createHash('sha256').update(JSON.stringify(valores)).digest('hex')
}

export async function modificarPerfil(conexiones, { tipo, id, datos, version, desactivar = false }, usuario) {
  const conexion = await conexiones.getConnection()
  try {
    await conexion.beginTransaction()
    const { perfil, nuevo } = await asegurarPerfil(conexion, usuario)
    let creado = nuevo
    if (tipo === 'titular') {
      comprobarVersion(perfil, nuevo && version === 0 ? 1 : version)
      const cambios = claves(tipo).filter((clave) => perfil[clave] !== datos[clave])
      if (cambios.length) {
        await conexion.execute(`UPDATE perfil_referencia SET ${claves(tipo).map((clave) => `${clave} = ?`).join(', ')}, version = version + 1, actualizado_en = UTC_TIMESTAMP(3) WHERE id = 1`, claves(tipo).map((clave) => datos[clave]))
        await auditar(conexion, usuario, 'ACTUALIZACION', 'TITULAR', 1, cambios)
      }
    } else if (tablas[tipo]) {
      const tabla = tablas[tipo]
      if (id !== undefined) {
        const [[anterior]] = await conexion.execute(`SELECT id, ${claves(tipo).join(', ')}, activo, version FROM ${tabla} WHERE perfil_id = 1 AND id = ? FOR UPDATE`, [id])
        if (!anterior) throw new ErrorPerfil(404, 'Referencia no encontrada.')
        comprobarVersion(anterior, version)
        if (!anterior.activo) throw new ErrorPerfil(409, 'La referencia está desactivada. Puedes añadir una nueva referencia.')
        const cambios = desactivar ? ['activo'] : claves(tipo).filter((clave) => anterior[clave] !== datos[clave])
        if (cambios.length) {
          if (desactivar) {
            await conexion.execute(`UPDATE ${tabla} SET activo = FALSE, version = version + 1, actualizado_en = UTC_TIMESTAMP(3) WHERE id = ?`, [id])
          } else {
            await conexion.execute(`UPDATE ${tabla} SET ${claves(tipo).map((clave) => `${clave} = ?`).join(', ')}, huella = ?, version = version + 1, actualizado_en = UTC_TIMESTAMP(3) WHERE id = ?`, [...claves(tipo).map((clave) => datos[clave]), huellaReferencia(tipo, datos), id])
          }
          await auditar(conexion, usuario, desactivar ? 'DESACTIVACION' : 'ACTUALIZACION', entidades[tipo], id, cambios)
        }
      } else {
        const [resultado] = await conexion.execute(`INSERT INTO ${tabla} (${claves(tipo).join(', ')}, huella) VALUES (${[...claves(tipo), 'huella'].map(() => '?').join(', ')})`, [...claves(tipo).map((clave) => datos[clave]), huellaReferencia(tipo, datos)])
        await auditar(conexion, usuario, 'CREACION', entidades[tipo], resultado.insertId, claves(tipo).filter((clave) => datos[clave] !== ''))
        creado = true
      }
    }
    const actualizado = await consultarPerfil(conexion)
    await conexion.commit()
    return { perfil: actualizado, creado }
  } catch (error) {
    await conexion.rollback()
    if (error.code === 'ER_DUP_ENTRY') throw new ErrorPerfil(409, 'Ya existe una referencia activa con exactamente los mismos datos.')
    throw error
  } finally {
    conexion.release()
  }
}
