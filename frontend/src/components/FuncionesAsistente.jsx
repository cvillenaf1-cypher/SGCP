import { useState } from 'react'
import { FormularioPagoPendiente } from './FormularioPagoPendiente'
import { ListadoPagosPendientes } from './ListadoPagosPendientes'
import { FormularioAbono } from './FormularioAbono'

export function FuncionesAsistente() {
  const [vista, establecerVista] = useState('registro')
  return <>
    <nav className="consulta-navegacion" aria-label="Funciones del asistente">
      <button type="button" className="secondary-button" aria-pressed={vista === 'registro'} onClick={() => establecerVista('registro')}>Registrar pagos pendientes</button>
      <button type="button" className="secondary-button" aria-pressed={vista === 'consulta'} onClick={() => establecerVista('consulta')}>Consultar pagos pendientes</button>
      <button type="button" className="secondary-button" aria-pressed={vista === 'abonos'} onClick={() => establecerVista('abonos')}>Registrar pagos realizados</button>
    </nav>
    {vista === 'registro' ? <FormularioPagoPendiente /> : vista === 'consulta' ? <ListadoPagosPendientes /> : <FormularioAbono />}
  </>
}
