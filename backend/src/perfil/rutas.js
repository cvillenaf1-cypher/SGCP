import { Router } from 'express'
import { PERMISOS, requerirPermiso } from '../auth/permisos.js'
import { validarPerfil } from '../../../shared/perfilReferencia.js'
import { consultarPerfil, modificarPerfil, ErrorPerfil } from './servicio.js'

const esObjeto = (cuerpo) => cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo)
const versionValida = (version) => Number.isSafeInteger(version) && version >= 1 && version <= 4294967294

export function registrarRutasPerfil(aplicacion, conexiones, requerirSesion) {
  const rutas = Router()
  rutas.use(requerirSesion, requerirPermiso(PERMISOS.CONFIGURAR_PERFIL))
  rutas.get('/', async (_solicitud, respuesta) => respuesta.json({ perfil: await consultarPerfil(conexiones) }))

  const guardar = (tipo, { edicion = false, desactivar = false } = {}) => async (solicitud, respuesta) => {
    let entrada = { datos: {}, fields: {} }
    if (tipo && !desactivar) entrada = validarPerfil(tipo, solicitud.body, { edicion })
    else if (!esObjeto(solicitud.body) || Object.keys(solicitud.body).some((clave) => !(desactivar ? ['version'] : []).includes(clave))) {
      entrada.fields.form = 'Envía únicamente los campos permitidos.'
    }
    if (desactivar) {
      entrada.version = solicitud.body?.version
      if (!versionValida(entrada.version)) entrada.fields.version = 'Recarga el perfil antes de guardar.'
    }
    let id
    if (solicitud.params.id !== undefined) {
      id = Number(solicitud.params.id)
      if (!/^[1-9]\d*$/.test(solicitud.params.id) || !Number.isSafeInteger(id) || id > 4294967295) entrada.fields.id = 'Identificador no válido.'
    }
    if (Object.keys(entrada.fields).length) return respuesta.status(422).json({ message: 'Revisa los datos del formulario.', fields: entrada.fields })
    try {
      const { perfil, creado } = await modificarPerfil(conexiones, { tipo, id, datos: entrada.datos, version: entrada.version, desactivar }, solicitud.auth.user.id)
      respuesta.status(!edicion && creado ? 201 : 200).json({ perfil, message: desactivar ? 'Referencia desactivada.' : 'Configuración guardada.' })
    } catch (error) {
      if (error instanceof ErrorPerfil) return respuesta.status(error.estado).json({ message: error.message })
      throw error
    }
  }
  rutas.post('/', guardar())
  rutas.put('/titular', guardar('titular', { edicion: true }))
  for (const tipo of ['bancos', 'servicios']) {
    rutas.post(`/${tipo}`, guardar(tipo))
    rutas.put(`/${tipo}/:id`, guardar(tipo, { edicion: true }))
    rutas.post(`/${tipo}/:id/desactivar`, guardar(tipo, { edicion: true, desactivar: true }))
  }
  aplicacion.use('/api/perfil-referencia', rutas)
}
