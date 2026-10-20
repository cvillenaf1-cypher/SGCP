import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistorialPagos } from '../components/HistorialPagos'
import { ContextoAutenticacion } from '../auth/AuthContext'

const obligacion = { id: 81, concepto: 'Limpieza', beneficiario: 'Servicios Pérez', monto_original: '300.00', saldo_pendiente: '125.50', estado_economico: 'PARCIAL', fecha_limite: '2026-10-01' }
const pagada = { ...obligacion, id: 82, concepto: 'Alquiler pagado', beneficiario: 'María Núñez', saldo_pendiente: '0.00', estado_economico: 'PAGADO', fecha_limite: '2026-09-30' }
const pendiente = { ...obligacion, id: 83, concepto: 'Mantenimiento', beneficiario: 'Taller López', saldo_pendiente: '300.00', estado_economico: 'PENDIENTE', fecha_limite: '2027-10-31' }
const obligacionesMismaEmpresa = [obligacion, pagada, pendiente].map((registro) => ({ ...registro, beneficiario: 'Empresa Álvarez' }))
const abonos = [
  { id: 7, monto: '100.00', medio_pago: 'Efectivo', fecha_registro: '2026-10-17T15:00:00.000Z', tiene_comprobante: false, puede_descargar_comprobante: false, url_comprobante: null },
  { id: 8, monto: '49.00', medio_pago: 'Transferencia', fecha_registro: '2026-10-18T16:00:00.000Z', tiene_comprobante: false, puede_descargar_comprobante: false, url_comprobante: null },
  { id: 9, monto: '25.50', medio_pago: 'Yape', fecha_registro: '2026-10-18T16:00:00.000Z', tiene_comprobante: true, puede_descargar_comprobante: true, url_comprobante: '/api/abonos/9/comprobante/archivo' },
]

function datosHistorial(obligacionConsultada = obligacion, cambios = {}) {
  return {
    obligacion_id: obligacionConsultada.id,
    concepto: obligacionConsultada.concepto,
    monto_original: obligacionConsultada.monto_original,
    saldo_pendiente: obligacionConsultada.saldo_pendiente,
    total_abonado: '174.50',
    estado_economico: obligacionConsultada.estado_economico,
    resumen_consistente: true,
    advertencia: null,
    abonos,
    ...cambios,
  }
}

function prepararHistorial(solicitar = vi.fn().mockImplementation((ruta) => Promise.resolve(ruta === '/api/obligaciones'
  ? { obligaciones: [obligacion, pagada, pendiente] }
  : { historial: datosHistorial() }))) {
  const vista = render(<ContextoAutenticacion.Provider value={{ solicitar }}><HistorialPagos /></ContextoAutenticacion.Provider>)
  return { solicitar, ...vista }
}

async function seleccionarObligacion(id = 81) {
  const seleccionada = [obligacion, pagada, pendiente].find((registro) => registro.id === id)
  fireEvent.click(await screen.findByRole('button', { name: `Ver historial de ${seleccionada.concepto} (#${id})` }))
}

function detalleHistorial() {
  return within(screen.getByRole('region', { name: 'Historial de la obligación' }))
}

function botonesDeObligaciones() {
  return within(screen.getByRole('table', { name: 'Obligaciones para consultar historial' }))
    .queryAllByRole('button', { name: /^Ver historial de / })
}

function comprobarSoloLectura(solicitar) {
  expect(solicitar.mock.calls.every(([, opciones]) => !opciones?.method || opciones.method === 'GET')).toBe(true)
  expect(screen.queryByRole('button', { name: /eliminar|editar|guardar/i })).not.toBeInTheDocument()
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: vi.fn().mockReturnValue('blob:comprobante-de-prueba'),
    revokeObjectURL: vi.fn(),
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Consultar historial real de pagos — HU-05', () => {
  it('muestra todas las obligaciones en una tabla, incluidas las pagadas, sin elegir ni consultar una automáticamente', async () => {
    const registros = [obligacion, pagada, pendiente]
    const antes = structuredClone(registros)
    const solicitar = vi.fn().mockResolvedValue({ obligaciones: registros })
    prepararHistorial(solicitar)
    const tabla = await screen.findByRole('table', { name: 'Obligaciones para consultar historial' })
    expect(within(tabla).getAllByRole('columnheader').map((celda) => celda.textContent))
      .toEqual(['Concepto', 'Beneficiario', 'Monto original', 'Saldo pendiente', 'Estado', 'Acción'])
    expect(botonesDeObligaciones()).toHaveLength(3)
    for (const registro of registros) {
      const boton = within(tabla).getByRole('button', { name: `Ver historial de ${registro.concepto} (#${registro.id})` })
      const fila = within(boton.closest('tr'))
      expect(fila.getByText(registro.concepto)).toBeInTheDocument()
      expect(fila.getByText(registro.beneficiario)).toBeInTheDocument()
      expect(fila.getByText(`#${registro.id}`)).toBeInTheDocument()
      expect(boton).toHaveAttribute('aria-pressed', 'false')
    }
    expect(within(tabla).getByText('S/ 125.50')).toBeInTheDocument()
    expect(within(tabla).getByText('S/ 0.00')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Obligación a consultar' })).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar obligaciones' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Filtrar por estado' })).not.toBeInTheDocument()
    const filtroMes = screen.getByRole('combobox', { name: 'Filtrar por mes' })
    expect(filtroMes).toHaveValue('')
    expect(within(filtroMes).getAllByRole('option').map((opcion) => [opcion.value, opcion.textContent]))
      .toEqual([['', 'Todos los meses'], ['2027-10', 'octubre de 2027'], ['2026-10', 'octubre de 2026'], ['2026-09', expect.stringMatching(/^se(?:p)?tiembre de 2026$/)]])
    expect(screen.queryByRole('region', { name: 'Historial de la obligación' })).not.toBeInTheDocument()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones'])
    expect(registros).toEqual(antes)
    comprobarSoloLectura(solicitar)
  })

  it.each([
    ['limPIEZA', 'Ver historial de Limpieza (#81)'],
    ['SERVICIOS perez', 'Ver historial de Limpieza (#81)'],
    ['  MARIA    nunez  ', 'Ver historial de Alquiler pagado (#82)'],
    ['limpieza #81', 'Ver historial de Limpieza (#81)'],
    ['82', 'Ver historial de Alquiler pagado (#82)'],
    ['mantenimiento taller', 'Ver historial de Mantenimiento (#83)'],
  ])('filtra localmente por concepto, beneficiario o ID con la búsqueda «%s»', async (busqueda, nombre) => {
    const { solicitar } = prepararHistorial()
    const campo = await screen.findByRole('searchbox', { name: 'Buscar obligaciones' })
    fireEvent.change(campo, { target: { value: busqueda } })
    expect(botonesDeObligaciones().map((boton) => boton.getAttribute('aria-label'))).toEqual([nombre])
    expect(screen.queryByRole('region', { name: 'Historial de la obligación' })).not.toBeInTheDocument()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones'])
    comprobarSoloLectura(solicitar)
  })

  it.each([
    ['2026-09', 'Ver historial de Alquiler pagado (#82)'],
    ['2027-10', 'Ver historial de Mantenimiento (#83)'],
    ['2026-10', 'Ver historial de Limpieza (#81)'],
  ])('combina la búsqueda de una empresa con el mes %s sin confundir años ni hacer nuevas consultas', async (mes, nombre) => {
    const antes = structuredClone(obligacionesMismaEmpresa)
    const solicitar = vi.fn().mockResolvedValue({ obligaciones: obligacionesMismaEmpresa })
    prepararHistorial(solicitar)
    const campo = await screen.findByRole('searchbox', { name: 'Buscar obligaciones' })
    fireEvent.change(campo, { target: { value: '  EMPRESA   alvarez ' } })
    expect(botonesDeObligaciones()).toHaveLength(3)
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por mes' }), { target: { value: mes } })
    expect(botonesDeObligaciones().map((boton) => boton.getAttribute('aria-label'))).toEqual([nombre])
    expect(campo).toHaveValue('  EMPRESA   alvarez ')
    expect(screen.getByText('1 de 3 obligaciones')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Historial de la obligación' })).not.toBeInTheDocument()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones'])
    expect(obligacionesMismaEmpresa).toEqual(antes)
    comprobarSoloLectura(solicitar)
  })

  it('incluye todos los estados del mes de vencimiento, sin mezclar sus límites con los meses vecinos', async () => {
    const filas = [
      { ...obligacion, fecha_limite: '2026-10-01' },
      { ...pagada, fecha_limite: '2026-10-31' },
      { ...pendiente, fecha_limite: '2026-10-15' },
      { ...obligacion, id: 84, fecha_limite: '2026-09-30' },
      { ...obligacion, id: 85, fecha_limite: '2026-11-01' },
    ]
    prepararHistorial(vi.fn().mockResolvedValue({ obligaciones: filas }))
    const filtro = await screen.findByRole('combobox', { name: 'Filtrar por mes' })
    fireEvent.change(filtro, { target: { value: '2026-10' } })
    expect(botonesDeObligaciones().map((boton) => boton.getAttribute('aria-label'))).toEqual([
      'Ver historial de Limpieza (#81)', 'Ver historial de Alquiler pagado (#82)', 'Ver historial de Mantenimiento (#83)',
    ])
    expect(screen.getByText('3 de 5 obligaciones')).toBeInTheDocument()
  })

  it('conserva el mes seleccionado si al actualizar ya no quedan obligaciones de ese período', async () => {
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pagada] }).mockResolvedValue({ obligaciones: [pagada] })
    prepararHistorial(solicitar)
    const filtro = await screen.findByRole('combobox', { name: 'Filtrar por mes' })
    fireEvent.change(filtro, { target: { value: '2026-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar obligaciones' }))
    const actualizado = await screen.findByRole('combobox', { name: 'Filtrar por mes' })
    expect(actualizado).toHaveValue('2026-10')
    expect(screen.getByText('No hay obligaciones que coincidan con la búsqueda y el mes seleccionado.')).toBeInTheDocument()
    fireEvent.change(actualizado, { target: { value: '' } })
    expect(botonesDeObligaciones()).toHaveLength(1)
  })

  it('Todos los meses elimina únicamente el filtro de mes y conserva la búsqueda de la empresa', async () => {
    const otraEmpresa = { ...pagada, id: 84, concepto: 'Pago de otra empresa', beneficiario: 'Empresa Torres' }
    const solicitar = vi.fn().mockResolvedValue({ obligaciones: [...obligacionesMismaEmpresa, otraEmpresa] })
    prepararHistorial(solicitar)
    const campo = await screen.findByRole('searchbox', { name: 'Buscar obligaciones' })
    fireEvent.change(campo, { target: { value: 'alvarez' } })
    const filtro = screen.getByRole('combobox', { name: 'Filtrar por mes' })
    fireEvent.change(filtro, { target: { value: '2026-09' } })
    expect(botonesDeObligaciones()).toHaveLength(1)
    fireEvent.change(filtro, { target: { value: '' } })
    expect(campo).toHaveValue('alvarez')
    expect(botonesDeObligaciones()).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Ver historial de Pago de otra empresa (#84)' })).not.toBeInTheDocument()
    expect(solicitar).toHaveBeenCalledTimes(1)
  })

  it('Limpiar búsqueda conserva el mes seleccionado y muestra los demás compromisos de ese mes', async () => {
    const otraEmpresa = { ...pagada, id: 84, concepto: 'Pago de otra empresa', beneficiario: 'Empresa Torres' }
    const solicitar = vi.fn().mockResolvedValue({ obligaciones: [...obligacionesMismaEmpresa, otraEmpresa] })
    prepararHistorial(solicitar)
    const campo = await screen.findByRole('searchbox', { name: 'Buscar obligaciones' })
    const filtro = screen.getByRole('combobox', { name: 'Filtrar por mes' })
    fireEvent.change(filtro, { target: { value: '2026-09' } })
    fireEvent.change(campo, { target: { value: 'alvarez' } })
    expect(botonesDeObligaciones()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(campo).toHaveValue('')
    expect(filtro).toHaveValue('2026-09')
    expect(botonesDeObligaciones().map((boton) => boton.getAttribute('aria-label')))
      .toEqual(['Ver historial de Alquiler pagado (#82)', 'Ver historial de Pago de otra empresa (#84)'])
    expect(solicitar).toHaveBeenCalledTimes(1)
  })

  it('distingue una combinación de búsqueda y mes sin coincidencias del catálogo vacío', async () => {
    const { solicitar } = prepararHistorial()
    const campo = await screen.findByRole('searchbox', { name: 'Buscar obligaciones' })
    const filtro = screen.getByRole('combobox', { name: 'Filtrar por mes' })
    fireEvent.change(campo, { target: { value: 'Limpieza' } })
    fireEvent.change(filtro, { target: { value: '2026-09' } })
    expect(screen.getByText('No hay obligaciones que coincidan con la búsqueda y el mes seleccionado.')).toBeInTheDocument()
    expect(screen.queryByText('Todavía no hay obligaciones registradas para consultar.')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /^Ver historial de / })).toHaveLength(0)
    fireEvent.change(filtro, { target: { value: '' } })
    expect(botonesDeObligaciones().map((boton) => boton.getAttribute('aria-label'))).toEqual(['Ver historial de Limpieza (#81)'])
    expect(screen.queryByText('No hay obligaciones que coincidan con la búsqueda y el mes seleccionado.')).not.toBeInTheDocument()
    fireEvent.change(campo, { target: { value: 'inexistente' } })
    expect(screen.getByText('No hay obligaciones que coincidan con la búsqueda.')).toBeInTheDocument()
    expect(solicitar).toHaveBeenCalledTimes(1)
  })

  it('exige que coincidan todas las palabras, distingue no encontrar resultados y permite volver a mostrar todas', async () => {
    const { solicitar } = prepararHistorial()
    const campo = await screen.findByRole('searchbox', { name: 'Buscar obligaciones' })
    fireEvent.change(campo, { target: { value: 'Limpieza Núñez' } })
    expect(screen.getByText('No hay obligaciones que coincidan con la búsqueda.')).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /^Ver historial de / })).toHaveLength(0)
    expect(screen.queryByText('Todavía no hay obligaciones registradas para consultar.')).not.toBeInTheDocument()
    fireEvent.change(campo, { target: { value: '' } })
    expect(botonesDeObligaciones()).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Ver historial de Alquiler pagado (#82)' })).not.toBeDisabled()
    expect(screen.queryByText('No hay obligaciones que coincidan con la búsqueda.')).not.toBeInTheDocument()
    expect(solicitar).toHaveBeenCalledTimes(1)
  })

  it('permite seleccionar una fila y muestra su historial debajo de la tabla', async () => {
    const { solicitar } = prepararHistorial()
    const tabla = await screen.findByRole('table', { name: 'Obligaciones para consultar historial' })
    fireEvent.click(within(tabla).getByText(obligacion.beneficiario))
    const lista = await screen.findByRole('list', { name: 'Historial de abonos' })
    expect(screen.getByRole('button', { name: 'Ver historial de Limpieza (#81)' })).toHaveAttribute('aria-pressed', 'true')
    expect(tabla.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones', '/api/obligaciones/81/historial'])
  })

  it.each(['{Enter}', ' '])('permite seleccionar una obligación por teclado con %s', async (tecla) => {
    const usuario = userEvent.setup()
    const { solicitar } = prepararHistorial()
    const boton = await screen.findByRole('button', { name: 'Ver historial de Limpieza (#81)' })
    boton.focus()
    expect(boton).toHaveFocus()
    await usuario.keyboard(tecla)
    expect(await screen.findByRole('list', { name: 'Historial de abonos' })).toBeInTheDocument()
    expect(boton).toHaveAttribute('aria-pressed', 'true')
    expect(solicitar).toHaveBeenCalledTimes(2)
  })

  it('conserva el historial seleccionado aunque la búsqueda oculte su fila, sin volver a consultarlo', async () => {
    const { solicitar } = prepararHistorial()
    await seleccionarObligacion()
    const lista = await screen.findByRole('list', { name: 'Historial de abonos' })
    const detalle = screen.getByRole('region', { name: 'Historial de la obligación' })
    const campo = screen.getByRole('searchbox', { name: 'Buscar obligaciones' })
    fireEvent.change(campo, { target: { value: 'Alquiler' } })
    expect(screen.queryByRole('button', { name: 'Ver historial de Limpieza (#81)' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Historial de la obligación' })).toBe(detalle)
    expect(screen.getByRole('list', { name: 'Historial de abonos' })).toBe(lista)
    fireEvent.change(campo, { target: { value: 'inexistente' } })
    expect(screen.getByText('No hay obligaciones que coincidan con la búsqueda.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Historial de abonos' })).toBe(lista)
    fireEvent.change(campo, { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Ver historial de Limpieza (#81)' })).toHaveAttribute('aria-pressed', 'true')
    expect(solicitar).toHaveBeenCalledTimes(2)
    comprobarSoloLectura(solicitar)
  })

  it('conserva el detalle seleccionado cuando el mes lo oculta y avisa de los filtros sin volver a consultar', async () => {
    const { solicitar } = prepararHistorial()
    await seleccionarObligacion()
    const lista = await screen.findByRole('list', { name: 'Historial de abonos' })
    const detalle = screen.getByRole('region', { name: 'Historial de la obligación' })
    const filtro = screen.getByRole('combobox', { name: 'Filtrar por mes' })
    fireEvent.change(filtro, { target: { value: '2026-09' } })
    expect(screen.queryByRole('button', { name: 'Ver historial de Limpieza (#81)' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Historial de la obligación' })).toBe(detalle)
    expect(screen.getByRole('list', { name: 'Historial de abonos' })).toBe(lista)
    expect(screen.getByText(/Esta obligación no coincide con los filtros actuales\./)).toBeInTheDocument()
    fireEvent.change(filtro, { target: { value: '2026-10' } })
    expect(screen.getByRole('button', { name: 'Ver historial de Limpieza (#81)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Esta obligación no coincide con los filtros actuales\./)).not.toBeInTheDocument()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones', '/api/obligaciones/81/historial'])
    comprobarSoloLectura(solicitar)
  })

  it('consulta la API real, muestra el resumen y los pagos en orden descendente sin modificar la respuesta', async () => {
    const historial = datosHistorial()
    const antes = structuredClone(historial)
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] }).mockResolvedValue({ historial })
    prepararHistorial(solicitar)
    expect(screen.getByText('Cargando obligaciones…')).toBeInTheDocument()
    await seleccionarObligacion()
    const lista = await screen.findByRole('list', { name: 'Historial de abonos' })
    expect(detalleHistorial().getByText('S/ 300.00')).toBeInTheDocument()
    expect(detalleHistorial().getByText('S/ 174.50')).toBeInTheDocument()
    expect(detalleHistorial().getByText('S/ 125.50')).toBeInTheDocument()
    const movimientos = within(lista).getAllByRole('listitem')
    expect(movimientos).toHaveLength(3)
    for (const [indice, abono] of [abonos[2], abonos[1], abonos[0]].entries()) {
      expect(within(movimientos[indice]).getByText(`S/ ${abono.monto}`)).toBeInTheDocument()
      expect(within(movimientos[indice]).getByText(abono.medio_pago)).toBeInTheDocument()
      expect(movimientos[indice].querySelector('time')).toHaveAttribute('dateTime', abono.fecha_registro)
      expect(movimientos[indice].querySelector('time')).not.toBeEmptyDOMElement()
    }
    expect(historial).toEqual(antes)
    expect(screen.queryByText(/pendiente de integración|DATOS DE EJEMPLO|Pendiente de consulta del historial/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ejemplo/i })).not.toBeInTheDocument()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones', '/api/obligaciones/81/historial'])
    comprobarSoloLectura(solicitar)
  })

  it('permite consultar una obligación pagada y sus pagos anteriores', async () => {
    const historial = datosHistorial(pagada, { total_abonado: '300.00', abonos: [{ ...abonos[0], monto: '300.00' }] })
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pagada] }).mockResolvedValue({ historial })
    prepararHistorial(solicitar)
    expect(await screen.findByRole('button', { name: 'Ver historial de Alquiler pagado (#82)' })).not.toBeDisabled()
    await seleccionarObligacion(82)
    expect(await detalleHistorial().findByText('S/ 0.00')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Historial de abonos' })).getByText('S/ 300.00')).toBeInTheDocument()
    expect(solicitar.mock.calls.at(-1)[0]).toBe('/api/obligaciones/82/historial')
    comprobarSoloLectura(solicitar)
  })

  it('muestra un historial sin pagos con total cero y saldo original', async () => {
    prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pendiente] })
      .mockResolvedValue({ historial: datosHistorial(pendiente, { total_abonado: '0.00', abonos: [] }) }))
    await seleccionarObligacion(83)
    expect(await screen.findByText('Esta obligación todavía no tiene abonos.')).toBeInTheDocument()
    expect(detalleHistorial().getByText('S/ 0.00')).toBeInTheDocument()
    expect(detalleHistorial().getAllByText('S/ 300.00')).toHaveLength(2)
    expect(screen.queryByRole('list', { name: 'Historial de abonos' })).not.toBeInTheDocument()
  })

  it('calcula el saldo a partir del monto y el total sin corregir datos persistidos inconsistentes', async () => {
    const historial = datosHistorial(obligacion, {
      monto_original: '100.00', total_abonado: '10.00', saldo_pendiente: '80.00',
      resumen_consistente: false, advertencia: 'El saldo registrado no coincide con los abonos del historial.',
      abonos: [{ ...abonos[0], monto: '10.00' }],
    })
    const antes = structuredClone(historial)
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] }).mockResolvedValue({ historial })
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    expect(await screen.findByText('S/ 90.00')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('El saldo registrado no coincide con los abonos del historial.')
    expect(historial).toEqual(antes)
    comprobarSoloLectura(solicitar)
  })

  it('actualiza el historial seleccionado e incorpora el nuevo abono conservando los anteriores', async () => {
    const nuevo = { ...abonos[0], id: 10, monto: '25.00', fecha_registro: '2026-10-19T15:00:00.000Z' }
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ historial: datosHistorial() })
      .mockResolvedValue({ historial: datosHistorial(obligacion, { total_abonado: '199.50', saldo_pendiente: '100.50', abonos: [...abonos, nuevo] }) })
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    await screen.findByRole('list', { name: 'Historial de abonos' })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar historial' }))
    expect(await screen.findByText('S/ 199.50')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver historial de Limpieza (#81)' })).toHaveAttribute('aria-pressed', 'true')
    const movimientos = within(screen.getByRole('list', { name: 'Historial de abonos' })).getAllByRole('listitem')
    expect(movimientos).toHaveLength(4)
    expect(within(movimientos[0]).getByText('S/ 25.00')).toBeInTheDocument()
    for (const monto of ['25.50', '49.00', '100.00']) expect(within(screen.getByRole('list', { name: 'Historial de abonos' })).getByText(`S/ ${monto}`)).toBeInTheDocument()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones', '/api/obligaciones/81/historial', '/api/obligaciones/81/historial'])
    comprobarSoloLectura(solicitar)
  })

  it('distingue un negocio sin obligaciones de un historial sin abonos', async () => {
    prepararHistorial(vi.fn().mockResolvedValue({ obligaciones: [] }))
    expect(await screen.findByText('Todavía no hay obligaciones registradas para consultar.')).toBeInTheDocument()
    expect(screen.queryByText('Esta obligación todavía no tiene abonos.')).not.toBeInTheDocument()
  })

  it('permite reintentar errores de conexión en el listado', async () => {
    prepararHistorial(vi.fn().mockRejectedValueOnce(new Error('Sin conexión.')).mockResolvedValue({ obligaciones: [obligacion] }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar obligaciones' }))
    expect(await screen.findByRole('button', { name: 'Ver historial de Limpieza (#81)' })).toBeInTheDocument()
  })

  it('permite reintentar un error del historial sin confundirlo con ausencia de pagos', async () => {
    prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockRejectedValueOnce(new Error('No se pudo consultar el historial.')).mockResolvedValue({ historial: datosHistorial() }))
    await seleccionarObligacion()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar el historial.')
    expect(screen.queryByText('Esta obligación todavía no tiene abonos.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar historial' }))
    expect(await screen.findByRole('list', { name: 'Historial de abonos' })).toBeInTheDocument()
  })

  it('cancela la consulta anterior y descarta su respuesta al cambiar de obligación', async () => {
    let resolverAnterior
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pagada] })
      .mockImplementationOnce(() => new Promise((resolver) => { resolverAnterior = resolver }))
      .mockResolvedValue({ historial: datosHistorial(pagada, { total_abonado: '300.00', abonos: [{ ...abonos[0], monto: '300.00' }] }) })
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    const señalAnterior = solicitar.mock.calls[1][1].signal
    await seleccionarObligacion(82)
    await detalleHistorial().findByText('S/ 0.00')
    await act(async () => { resolverAnterior({ historial: datosHistorial() }) })
    expect(señalAnterior.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Ver historial de Alquiler pagado (#82)' })).toHaveAttribute('aria-pressed', 'true')
    expect(detalleHistorial().queryByText('S/ 125.50')).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Historial de abonos' })).getByText('S/ 300.00')).toBeInTheDocument()
  })

  it('consulta el comprobante como imagen autenticada y libera su URL al cerrarlo', async () => {
    const imagen = new Blob(['imagen de prueba'], { type: 'image/png' })
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ historial: datosHistorial() }).mockResolvedValue(imagen)
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
    expect(await screen.findByRole('img', { name: 'Comprobante del abono #9' })).toHaveAttribute('src', 'blob:comprobante-de-prueba')
    expect(solicitar.mock.calls.at(-1)).toEqual(['/api/abonos/9/comprobante/archivo', expect.objectContaining({ respuestaComo: 'blob', signal: expect.any(AbortSignal) })])
    expect(URL.createObjectURL).toHaveBeenCalledWith(imagen)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar comprobante' }))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante-de-prueba')
    comprobarSoloLectura(solicitar)
  })

  it('no ofrece consultar una imagen sin permiso de descarga', async () => {
    prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValue({ historial: datosHistorial(obligacion, { abonos: [{ ...abonos[2], puede_descargar_comprobante: false, url_comprobante: null }] }) }))
    await seleccionarObligacion()
    await screen.findByRole('list', { name: 'Historial de abonos' })
    expect(screen.queryByRole('button', { name: 'Ver comprobante' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('muestra los errores de comprobante y permite reintentarlos', async () => {
    prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ historial: datosHistorial() })
      .mockRejectedValueOnce(new Error('No se pudo recuperar el comprobante.'))
      .mockResolvedValue(new Blob(['imagen de prueba'], { type: 'image/jpeg' })))
    await seleccionarObligacion()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo recuperar el comprobante.')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar comprobante' }))
    expect(await screen.findByRole('img', { name: 'Comprobante del abono #9' })).toBeInTheDocument()
  })

  it('cierra el comprobante y libera la imagen al consultar otra obligación', async () => {
    const solicitar = vi.fn().mockImplementation((ruta) => {
      if (ruta === '/api/obligaciones') return Promise.resolve({ obligaciones: [obligacion, pagada] })
      if (ruta === '/api/abonos/9/comprobante/archivo') return Promise.resolve(new Blob(['imagen'], { type: 'image/png' }))
      return Promise.resolve({ historial: ruta.includes('/82/') ? datosHistorial(pagada, { total_abonado: '300.00', abonos: [] }) : datosHistorial() })
    })
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
    await screen.findByRole('img', { name: 'Comprobante del abono #9' })
    await seleccionarObligacion(82)
    await detalleHistorial().findByText('S/ 0.00')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante-de-prueba')
  })

  it('descarta un comprobante pendiente si el usuario cambia de obligación', async () => {
    let resolverComprobante
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion, pagada] })
      .mockResolvedValueOnce({ historial: datosHistorial() })
      .mockImplementationOnce(() => new Promise((resolver) => { resolverComprobante = resolver }))
      .mockResolvedValue({ historial: datosHistorial(pagada, { total_abonado: '300.00', abonos: [] }) })
    prepararHistorial(solicitar)
    await seleccionarObligacion()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
    const señalComprobante = solicitar.mock.calls[2][1].signal
    await seleccionarObligacion(82)
    await detalleHistorial().findByText('S/ 0.00')
    await act(async () => { resolverComprobante(new Blob(['imagen'], { type: 'image/png' })) })
    expect(señalComprobante.aborted).toBe(true)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('libera la imagen al salir del módulo', async () => {
    const { unmount } = prepararHistorial(vi.fn().mockResolvedValueOnce({ obligaciones: [obligacion] })
      .mockResolvedValueOnce({ historial: datosHistorial() }).mockResolvedValue(new Blob(['imagen'], { type: 'image/png' })))
    await seleccionarObligacion()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))
    await screen.findByRole('img', { name: 'Comprobante del abono #9' })
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprobante-de-prueba')
  })

  it('actualiza el catálogo de obligaciones mediante consultas de solo lectura', async () => {
    const { solicitar } = prepararHistorial()
    await screen.findByRole('button', { name: 'Ver historial de Limpieza (#81)' })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar obligaciones' }))
    await waitFor(() => expect(solicitar).toHaveBeenCalledTimes(2))
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones', '/api/obligaciones'])
    comprobarSoloLectura(solicitar)
  })

  it('conserva la búsqueda y el mes al actualizar obligaciones y limpia la selección anterior', async () => {
    const { solicitar } = prepararHistorial()
    const campo = await screen.findByRole('searchbox', { name: 'Buscar obligaciones' })
    fireEvent.change(campo, { target: { value: 'perez' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por mes' }), { target: { value: '2026-10' } })
    await seleccionarObligacion()
    await screen.findByRole('list', { name: 'Historial de abonos' })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar obligaciones' }))
    const campoActualizado = await screen.findByRole('searchbox', { name: 'Buscar obligaciones' })
    expect(campoActualizado).toHaveValue('perez')
    expect(screen.getByRole('combobox', { name: 'Filtrar por mes' })).toHaveValue('2026-10')
    expect(botonesDeObligaciones()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Ver historial de Limpieza (#81)' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('region', { name: 'Historial de la obligación' })).not.toBeInTheDocument()
    expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual(['/api/obligaciones', '/api/obligaciones/81/historial', '/api/obligaciones'])
    comprobarSoloLectura(solicitar)
  })
})
