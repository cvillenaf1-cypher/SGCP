import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Aplicacion from '../App'
import { ContextoAutenticacion } from '../auth/AuthContext'
import { valoresInicialesPerfil } from '../../../shared/perfilReferencia'

const raiz = '/api/perfil-referencia'
const vacio = () => ({ id: null, version: 0, titular: valoresInicialesPerfil('titular'), bancos: [], servicios: [] })
const banco = (id, alias) => ({ ...valoresInicialesPerfil('bancos'), id, version: 1, activo: true, entidad: 'BCP', alias })

function preparar({ perfil = vacio(), rol = 'CONFIGURADOR', responder } = {}) {
  const solicitar = vi.fn(async (ruta, opciones = {}) => {
    if (responder) {
      const resultado = responder(ruta, opciones)
      if (resultado !== undefined) return resultado
    }
    if (ruta === raiz && !opciones.method) return { perfil }
    throw new Error('Respuesta no definida en la prueba.')
  })
  render(<MemoryRouter initialEntries={['/configuracion/perfil']}><ContextoAutenticacion.Provider value={{ usuario: rol ? { name: 'Responsable de prueba', role: rol } : null, solicitar }}><Aplicacion /></ContextoAutenticacion.Provider></MemoryRouter>)
  return { solicitar, usuario: userEvent.setup() }
}

async function abrirFormulario(usuario, nombre) {
  await usuario.click(await screen.findByRole('button', { name: nombre }))
  return screen.getByRole('form')
}

describe('Configuración del perfil', () => {
  it('muestra el perfil vacío sin escribir automáticamente y permite crearlo explícitamente', async () => {
    const { usuario, solicitar } = preparar({ responder: (_ruta, opciones) => opciones.method === 'POST' ? { perfil: { ...vacio(), id: 1, version: 1 }, message: 'Configuración guardada.' } : undefined })
    expect(await screen.findByText('El titular principal todavía no ha sido configurado.')).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay bancos registrados.')).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay servicios registrados.')).toBeInTheDocument()
    expect(solicitar).toHaveBeenCalledTimes(1)
    await usuario.click(screen.getByRole('button', { name: 'Crear perfil vacío' }))
    expect(solicitar).toHaveBeenLastCalledWith(raiz, { method: 'POST', body: {} })
    expect(await screen.findByRole('status')).toHaveTextContent('Configuración guardada.')
    expect(screen.queryByRole('button', { name: 'Crear perfil vacío' })).not.toBeInTheDocument()
  })

  for (const [tipo, documento] of [['PERSONA_NATURAL', '12345678'], ['EMPRESA', '20123456789']]) {
    it(`guarda ${tipo} y muestra la confirmación del servidor`, async () => {
      const { usuario, solicitar } = preparar({ responder: (_ruta, opciones) => opciones.method === 'PUT' ? { perfil: { ...vacio(), id: 1, version: 2, titular: { ...valoresInicialesPerfil('titular'), tipo, documento, nombre: 'Titular de prueba' } }, message: 'Configuración guardada.' } : undefined })
      await abrirFormulario(usuario, 'Editar titular')
      await usuario.selectOptions(screen.getByLabelText('Tipo de titular'), tipo)
      await usuario.type(screen.getByLabelText('Nombre completo o razón social'), 'Titular de prueba')
      await usuario.type(screen.getByLabelText('Documento del titular principal'), documento)
      await usuario.click(screen.getByRole('button', { name: 'Guardar referencia' }))
      expect(solicitar).toHaveBeenLastCalledWith(`${raiz}/titular`, { method: 'PUT', body: { ...valoresInicialesPerfil('titular'), tipo, documento, nombre: 'Titular de prueba', version: 0 } })
      expect(await screen.findByText('Configurado', { exact: true })).toBeInTheDocument()
    })
  }

  it('permite guardar un titular parcial y valida el documento por tipo antes del envío', async () => {
    const { usuario, solicitar } = preparar({ responder: (_ruta, opciones) => opciones.method === 'PUT' ? { perfil: { ...vacio(), id: 1, version: 2, titular: { ...valoresInicialesPerfil('titular'), nombre: 'Borrador' } }, message: 'Configuración guardada.' } : undefined })
    await abrirFormulario(usuario, 'Editar titular')
    await usuario.selectOptions(screen.getByLabelText('Tipo de titular'), 'EMPRESA')
    await usuario.type(screen.getByLabelText('Documento del titular principal'), '12345678')
    await usuario.click(screen.getByRole('button', { name: 'Guardar referencia' }))
    expect(screen.getByLabelText('Documento del titular principal')).toHaveAttribute('aria-invalid', 'true')
    expect(solicitar).toHaveBeenCalledTimes(1)
    await usuario.clear(screen.getByLabelText('Documento del titular principal'))
    await usuario.type(screen.getByLabelText('Nombre completo o razón social'), 'Borrador')
    await usuario.click(screen.getByRole('button', { name: 'Guardar referencia' }))
    expect(await screen.findByText('Configuración parcial')).toBeInTheDocument()
  })

  it('añade un banco sin titular principal y permite editar referencias distintas de la misma entidad', async () => {
    const perfil = { ...vacio(), id: 1, version: 1, bancos: [banco(1, 'Central'), banco(2, 'Sucursal')] }
    const { usuario, solicitar } = preparar({ perfil, responder: (_ruta, opciones) => opciones.method === 'PUT'
      ? { perfil: { ...perfil, bancos: [banco(1, 'Central editada'), banco(2, 'Sucursal')] }, message: 'Configuración guardada.' }
      : opciones.method === 'POST' ? { perfil: { ...perfil, bancos: [...perfil.bancos, { ...banco(3, ''), entidad: 'Interbank' }] }, message: 'Configuración guardada.' } : undefined })
    expect(await screen.findByRole('list', { name: 'Bancos asociados' })).toHaveTextContent('Central')
    await abrirFormulario(usuario, 'Editar Central (#1)')
    await usuario.clear(screen.getByLabelText('Alias o descripción (opcional)'))
    await usuario.type(screen.getByLabelText('Alias o descripción (opcional)'), 'Central editada')
    await usuario.click(screen.getByRole('button', { name: 'Guardar referencia' }))
    expect(solicitar).toHaveBeenLastCalledWith(`${raiz}/bancos/1`, { method: 'PUT', body: { ...valoresInicialesPerfil('bancos'), entidad: 'BCP', alias: 'Central editada', version: 1 } })
    await abrirFormulario(usuario, 'Añadir banco')
    await usuario.type(screen.getByLabelText('Entidad financiera *'), 'Interbank')
    await usuario.click(screen.getByRole('button', { name: 'Guardar referencia' }))
    expect(solicitar).toHaveBeenLastCalledWith(`${raiz}/bancos`, { method: 'POST', body: { ...valoresInicialesPerfil('bancos'), entidad: 'Interbank' } })
    expect(await screen.findByText('3 referencias activas')).toBeInTheDocument()
    expect(screen.getByText('El titular principal todavía no ha sido configurado.')).toBeInTheDocument()
  })

  it('conserva separado el titular del recibo y la relación de un tercero con el negocio', async () => {
    const { usuario, solicitar } = preparar({ responder: (_ruta, opciones) => opciones.method === 'POST' ? { perfil: { ...vacio(), id: 1, version: 1, servicios: [{ ...opciones.body, id: 1, version: 1, activo: true }] }, message: 'Configuración guardada.' } : undefined })
    await abrirFormulario(usuario, 'Añadir servicio')
    await usuario.type(screen.getByLabelText('Empresa prestadora *'), 'Proveedor de energía')
    await usuario.type(screen.getByLabelText('Titular que aparece en el recibo (opcional)'), 'Propietario de prueba')
    await usuario.type(screen.getByLabelText('Código de suministro o cliente (opcional)'), 'SUM-001')
    await usuario.selectOptions(screen.getByLabelText('Relación con el negocio'), 'TERCERO_RELACIONADO')
    await usuario.type(screen.getByLabelText('Detalle de la relación (opcional)'), 'Local alquilado')
    await usuario.click(screen.getByRole('button', { name: 'Guardar referencia' }))
    expect(solicitar.mock.calls.at(-1)[1].body).toMatchObject({ titular: 'Propietario de prueba', relacion_empresa: 'TERCERO_RELACIONADO', detalle_relacion: 'Local alquilado' })
    expect(await screen.findByRole('list', { name: 'Servicios asociados' })).toHaveTextContent('Tercero relacionado')
  })

  it('rechaza tarjetas y credenciales antes de enviar, sin truncar números pegados', async () => {
    const { usuario, solicitar } = preparar()
    await abrirFormulario(usuario, 'Añadir banco')
    await usuario.type(screen.getByLabelText('Entidad financiera *'), 'BCP')
    const ultimos = screen.getByLabelText('Últimos cuatro dígitos (opcional)')
    await usuario.type(ultimos, '4111111111111111')
    expect(ultimos).toHaveValue('4111111111111111')
    await usuario.click(screen.getByRole('button', { name: 'Guardar referencia' }))
    expect(ultimos).toHaveAttribute('aria-invalid', 'true')
    await usuario.clear(ultimos)
    await usuario.type(screen.getByLabelText('Alias o descripción (opcional)'), 'CVV: 123')
    await usuario.click(screen.getByRole('button', { name: 'Guardar referencia' }))
    expect(solicitar).toHaveBeenCalledTimes(1)
  })

  it('un conflicto conserva el borrador y permite cancelar y recargar antes de reintentar', async () => {
    const { usuario, solicitar } = preparar({ responder: (_ruta, opciones) => {
      if (opciones.method === 'POST') throw Object.assign(new Error('Ya existe una referencia activa con exactamente los mismos datos.'), { status: 409 })
    } })
    await abrirFormulario(usuario, 'Añadir banco')
    await usuario.type(screen.getByLabelText('Entidad financiera *'), 'BCP')
    await usuario.click(screen.getByRole('button', { name: 'Guardar referencia' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una referencia')
    expect(screen.getByLabelText('Entidad financiera *')).toHaveValue('BCP')
    expect(screen.getByRole('button', { name: 'Guardar referencia' })).toBeEnabled()
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    await usuario.click(screen.getByRole('button', { name: 'Actualizar perfil' }))
    await waitFor(() => expect(solicitar).toHaveBeenCalledTimes(3))
  })

  it('desactiva sin borrar la referencia y muestra su estado', async () => {
    const perfil = { ...vacio(), id: 1, version: 1, bancos: [banco(1, 'Central')] }
    const { usuario, solicitar } = preparar({ perfil, responder: (_ruta, opciones) => opciones.method === 'POST' ? { perfil: { ...perfil, bancos: [{ ...banco(1, 'Central'), activo: false, version: 2 }] }, message: 'Referencia desactivada.' } : undefined })
    await usuario.click(await screen.findByRole('button', { name: 'Desactivar Central (#1)' }))
    expect(solicitar).toHaveBeenLastCalledWith(`${raiz}/bancos/1/desactivar`, { method: 'POST', body: { version: 1 } })
    expect(await screen.findByText('Desactivada')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Bancos asociados' })).queryByRole('button')).not.toBeInTheDocument()
  })

  for (const rol of ['ASISTENTE', 'GERENTE']) {
    it(`${rol} no accede al formulario ni consulta el perfil`, () => {
      const { solicitar } = preparar({ rol })
      expect(screen.getByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument()
      expect(solicitar).not.toHaveBeenCalled()
    })
  }

  it('sin sesión redirige al login', () => {
    const { solicitar } = preparar({ rol: null })
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(solicitar).not.toHaveBeenCalled()
  })
})
