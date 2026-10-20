import { useCallback, useState } from 'react'
import { FormularioPagoPendiente } from './FormularioPagoPendiente'
import { PagosInicio } from './PagosInicio'

export function FuncionesAsistente({ alBloquear }) {
  const [vista, establecerVista] = useState('consulta')
  const [bloqueada, establecerBloqueada] = useState(false)
  const bloquear = useCallback((valor) => { establecerBloqueada(valor); alBloquear?.(valor) }, [alBloquear])
  return <>
    <nav className="consulta-navegacion" aria-label="Funciones del asistente">
      <button type="button" disabled={bloqueada} className="secondary-button" aria-pressed={vista === 'consulta'} onClick={() => establecerVista('consulta')}>Pagos del mes</button>
    </nav>
    {vista === 'registro' ? <>
      <button type="button" className="secondary-button" onClick={() => establecerVista('consulta')}>Volver a pagos del mes</button>
      <FormularioPagoPendiente />
    </> : <PagosInicio puedeRegistrar alBloquear={bloquear} alNuevaDeuda={() => establecerVista('registro')} />}
  </>
}
