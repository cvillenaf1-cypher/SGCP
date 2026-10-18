import { useState } from 'react'
import { FormularioPagoPendiente } from './FormularioPagoPendiente'
import { ListadoPagosPendientes } from './ListadoPagosPendientes'

export function FuncionesAsistente() {
  const [vista, establecerVista] = useState('registro')
  return <>
    <nav className="consulta-navegacion" aria-label="Funciones del asistente">
      <button type="button" className="secondary-button" aria-pressed={vista === 'registro'} onClick={() => establecerVista('registro')}>Registrar pagos pendientes</button>
      <button type="button" className="secondary-button" aria-pressed={vista === 'consulta'} onClick={() => establecerVista('consulta')}>Consultar pagos pendientes</button>
    </nav>
    {vista === 'registro' ? <FormularioPagoPendiente /> : <ListadoPagosPendientes />}
  </>
}
