import { useCallback, useState } from 'react'
import { FormularioPagoPendiente } from './FormularioPagoPendiente'
import { PagosInicio } from './PagosInicio'
import { FormularioAbono } from './FormularioAbono'
import { HistorialPagos } from './HistorialPagos'

export function FuncionesAsistente({ alBloquear }) {
  const [vista, establecerVista] = useState('consulta')
  const [bloqueada, establecerBloqueada] = useState(false)
  const bloquear = useCallback((valor) => { establecerBloqueada(valor); alBloquear?.(valor) }, [alBloquear])
  return <>
    <nav className="consulta-navegacion" aria-label="Funciones del asistente">
      <button type="button" disabled={bloqueada} className="secondary-button" aria-pressed={vista === 'consulta'} onClick={() => establecerVista('consulta')}>Pagos del mes</button>
      <button type="button" disabled={bloqueada} className="secondary-button" aria-pressed={vista === 'registro'} onClick={() => establecerVista('registro')}>Registrar pagos pendientes</button>
      <button type="button" disabled={bloqueada} className="secondary-button" aria-pressed={vista === 'abonos'} onClick={() => establecerVista('abonos')}>Registrar pagos realizados</button>
      <button type="button" disabled={bloqueada} className="secondary-button" aria-pressed={vista === 'historial'} onClick={() => establecerVista('historial')}>Consultar historial de pagos</button>
    </nav>
    {vista === 'registro' ? <FormularioPagoPendiente /> : vista === 'consulta' ? <PagosInicio puedeRegistrar alBloquear={bloquear} /> : vista === 'abonos' ? <FormularioAbono alBloquear={bloquear} /> : <HistorialPagos />}
  </>
}
