import { useEffect, useRef, useState } from 'react'
import { validarComprobante } from '../lib/validarComprobante'
import './SelectorComprobante.css'

export function SelectorComprobante({ archivo, error, deshabilitado, alCambiar }) {
  const entrada = useRef(null)
  const [vistaPrevia, establecerVistaPrevia] = useState('')
  const [falloImagen, establecerFalloImagen] = useState(false)
  useEffect(() => {
    return () => { if (vistaPrevia) URL.revokeObjectURL(vistaPrevia) }
  }, [vistaPrevia])

  function seleccionarArchivo(evento) {
    const seleccionado = evento.target.files?.[0]
    if (!seleccionado) return
    const mensaje = validarComprobante(seleccionado)
    establecerFalloImagen(false)
    establecerVistaPrevia(mensaje ? '' : URL.createObjectURL(seleccionado))
    alCambiar(mensaje ? null : seleccionado, mensaje)
    if (mensaje) evento.target.value = ''
  }

  function quitarArchivo() {
    entrada.current.value = ''
    establecerFalloImagen(false)
    establecerVistaPrevia('')
    alCambiar(null, '')
  }

  return <section className="comprobante" aria-labelledby="titulo-comprobante">
    <h4 id="titulo-comprobante">Registrar medio de pago y comprobante</h4>
    <div className="field">
      <label htmlFor="comprobante-abono">Comprobante (opcional)</label>
      <input ref={entrada} id="comprobante-abono" name="comprobante" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png"
        disabled={deshabilitado} onChange={seleccionarArchivo} aria-invalid={Boolean(error)} aria-describedby={`ayuda-comprobante${error ? ' error-comprobante' : ''}`} />
      <small id="ayuda-comprobante" className="description">Únicamente JPG o PNG, máximo 5 MB. Puedes registrar el abono sin comprobante.</small>
      {error && <p className="field-error" id="error-comprobante" role="alert">{error}</p>}
    </div>
    {(archivo || error) && <button type="button" className="secondary-button" disabled={deshabilitado} onClick={quitarArchivo}>{archivo ? 'Quitar comprobante' : 'Descartar archivo rechazado'}</button>}
    {archivo && <>
      <p className="comprobante-nombre">Archivo seleccionado: <strong>{archivo.name}</strong> ({(archivo.size / 1024 / 1024).toFixed(2)} MB)</p>
      {vistaPrevia && !falloImagen && <img className="comprobante-imagen" src={vistaPrevia} alt={`Vista previa local de ${archivo.name}`}
        onError={() => { establecerFalloImagen(true); establecerVistaPrevia(''); entrada.current.value = ''; alCambiar(null, 'No se pudo visualizar el comprobante. Selecciona una imagen JPG o PNG válida.') }} />}
      <p className="notice">Vista previa local: el archivo aún no se ha subido. La carga y consulta de comprobantes están pendientes del backend. Para registrar el abono sin comprobante, quita el archivo.</p>
    </>}
  </section>
}
