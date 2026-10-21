import { useEffect, useRef, useState } from 'react'
import { useAutenticacion } from '../auth/useAuth'
import { definicionesPerfil } from '../../../shared/perfilReferencia'
import { FormularioReferencia } from './FormularioReferencia'
import './perfilReferencia.css'

const rutaPerfil = '/api/perfil-referencia'
const titulos = { bancos: 'Bancos asociados', servicios: 'Servicios asociados' }

function DatosReferencia({ tipo, datos }) {
  return <dl className="perfil-datos">{Object.entries(definicionesPerfil[tipo]).filter(([clave]) => datos[clave]).map(([clave, campo]) => <div key={clave}>
    <dt>{campo.etiqueta.replace(' (opcional)', '')}</dt>
    <dd>{campo.opciones?.find(([valor]) => valor === datos[clave])?.[1] || datos[clave]}</dd>
  </div>)}</dl>
}

export function ConfiguracionPerfil({ alBloquear }) {
  const { solicitar } = useAutenticacion()
  const [perfil, establecerPerfil] = useState(null)
  const [cargando, establecerCargando] = useState(true)
  const [error, establecerError] = useState('')
  const [mensaje, establecerMensaje] = useState('')
  const [editor, establecerEditor] = useState(null)
  const [ocupado, establecerOcupado] = useState(false)
  const [recarga, establecerRecarga] = useState(0)
  const bloqueo = useRef(false)

  useEffect(() => {
    const controlador = new AbortController()
    solicitar(rutaPerfil, { signal: controlador.signal })
      .then((datos) => { if (!controlador.signal.aborted) establecerPerfil(datos.perfil) })
      .catch((fallo) => { if (!controlador.signal.aborted) establecerError(fallo.message) })
      .finally(() => { if (!controlador.signal.aborted) establecerCargando(false) })
    return () => controlador.abort()
  }, [solicitar, recarga])

  function recargar() {
    establecerError('')
    establecerMensaje('')
    establecerCargando(true)
    establecerRecarga((actual) => actual + 1)
  }

  function bloquear(valor) { establecerOcupado(valor); alBloquear?.(valor) }

  function editar(tipo, registro, version) {
    establecerMensaje('')
    establecerError('')
    establecerEditor({ tipo, registro, version })
  }

  async function guardar(cuerpo) {
    const sufijo = editor.tipo === 'titular' ? '/titular' : `/${editor.tipo}${editor.registro?.id ? `/${editor.registro.id}` : ''}`
    const datos = await solicitar(`${rutaPerfil}${sufijo}`, { method: editor.tipo === 'titular' || editor.registro?.id ? 'PUT' : 'POST', body: cuerpo })
    establecerPerfil(datos.perfil)
    establecerEditor(null)
    establecerMensaje(datos.message)
  }

  async function operacion(sufijo, cuerpo) {
    if (bloqueo.current) return
    bloqueo.current = true
    bloquear(true)
    establecerError('')
    establecerMensaje('')
    try {
      const datos = await solicitar(`${rutaPerfil}${sufijo}`, { method: 'POST', body: cuerpo })
      establecerPerfil(datos.perfil)
      establecerMensaje(datos.message)
    } catch (fallo) {
      establecerError(fallo.message)
    } finally {
      bloqueo.current = false
      bloquear(false)
    }
  }

  const formulario = (tipo) => editor?.tipo === tipo && <FormularioReferencia key={`${tipo}-${editor.registro?.id || 'nuevo'}`} {...editor} alGuardar={guardar} alCancelar={() => establecerEditor(null)} alBloquear={bloquear} />
  const bloqueado = ocupado || Boolean(editor) || cargando
  const titular = perfil?.titular
  const estadoTitular = !titular || !Object.values(titular).some(Boolean) ? 'Sin configurar' : titular.tipo && titular.nombre && titular.documento ? 'Configurado' : 'Configuración parcial'

  return <section className="perfil-pagina" aria-labelledby="perfil-titulo">
    <div className="panel-heading">
      <div><p className="perfil-antetitulo">PERFIL DE REFERENCIA</p><h2 id="perfil-titulo">Configuración del perfil</h2></div>
      <button className="perfil-secundario" onClick={recargar} disabled={bloqueado}>Actualizar perfil</button>
    </div>
    <p className="description">Completa la información a tu ritmo. Puedes comenzar por el titular, un banco o un servicio; el perfil puede permanecer vacío.</p>
    <nav className="perfil-navegacion" aria-label="Secciones del perfil"><a href="#titular" onClick={(evento) => { evento.preventDefault(); document.getElementById('titular')?.scrollIntoView() }}>Titular principal</a><a href="#bancos" onClick={(evento) => { evento.preventDefault(); document.getElementById('bancos')?.scrollIntoView() }}>Bancos asociados</a><a href="#servicios" onClick={(evento) => { evento.preventDefault(); document.getElementById('servicios')?.scrollIntoView() }}>Servicios asociados</a></nav>
    {cargando && <p role="status">Cargando configuración…</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {mensaje && <p className="success-message" role="status">{mensaje}</p>}
    {perfil && <>
      {!perfil.id && <div className="perfil-vacio"><p>El perfil todavía no tiene datos guardados. SAPO puede seguir utilizándose.</p><button onClick={() => operacion('', {})} disabled={bloqueado}>Crear perfil vacío</button></div>}
      <section className="panel perfil-seccion" id="titular" aria-labelledby="titulo-titular">
        <div className="panel-heading"><h3 id="titulo-titular">Titular principal</h3><span className="badge">{estadoTitular}</span></div>
        {estadoTitular === 'Sin configurar' ? <p className="description">El titular principal todavía no ha sido configurado.</p> : <DatosReferencia tipo="titular" datos={titular} />}
        {formulario('titular') || <button onClick={() => editar('titular', titular, perfil.version)} disabled={bloqueado}>Editar titular</button>}
      </section>
      {['bancos', 'servicios'].map((tipo) => <section key={tipo} className="panel perfil-seccion" id={tipo} aria-labelledby={`titulo-${tipo}`}>
        <div className="panel-heading"><h3 id={`titulo-${tipo}`}>{titulos[tipo]}</h3><span className="badge">{perfil[tipo].filter((item) => item.activo).length} referencias activas</span></div>
        <p className="description">{tipo === 'bancos' ? 'Registrar un banco no atribuye automáticamente sus vouchers al negocio.' : 'Un servicio puede estar a nombre de un tercero relacionado; eso no indica fraude.'}</p>
        {!perfil[tipo].length && <p className="empty-state">Todavía no hay {tipo === 'bancos' ? 'bancos' : 'servicios'} registrados.</p>}
        <ul className="perfil-lista" aria-label={titulos[tipo]}>{perfil[tipo].map((registro) => <li key={registro.id}>
          <div className="panel-heading"><h4>{registro.alias || registro.entidad || registro.empresa}</h4>{!registro.activo && <span className="badge">Desactivada</span>}</div>
          <DatosReferencia tipo={tipo} datos={registro} />
          {registro.activo && <div className="perfil-acciones">
            <button className="perfil-secundario" disabled={bloqueado} onClick={() => editar(tipo, registro, registro.version)} aria-label={`Editar ${registro.alias || registro.entidad || registro.empresa} (#${registro.id})`}>Editar</button>
            <button className="perfil-secundario" disabled={bloqueado} onClick={() => operacion(`/${tipo}/${registro.id}/desactivar`, { version: registro.version })} aria-label={`Desactivar ${registro.alias || registro.entidad || registro.empresa} (#${registro.id})`}>Desactivar</button>
          </div>}
        </li>)}</ul>
        {formulario(tipo) || <button disabled={bloqueado} onClick={() => editar(tipo)}>Añadir {tipo === 'bancos' ? 'banco' : 'servicio'}</button>}
      </section>)}
    </>}
  </section>
}
