import { useEffect, useRef, useState } from 'react'
import { validarComprobante } from '../lib/validarComprobante'
import './SelectorComprobante.css'

export function SelectorComprobante({ archivo, error, deshabilitado, alCambiar }) {
  const entrada = useRef(null)
  const [vistaPrevia, establecerVistaPrevia] = useState('')
  const [falloImagen, establecerFalloImagen] = useState(false)
  useEffect(() => {
    if (archivo && vistaPrevia) return () => URL.revokeObjectURL(vistaPrevia)
  }, [vistaPrevia, archivo])
  useEffect(() => {
    if (!archivo && entrada.current) entrada.current.value = ''
  }, [archivo])

  function seleccionarArchivo(evento) {
    const seleccionado = evento.target.files?.[0]
    if (!seleccionado) return
    const mensaje = validarComprobante(seleccionado)
    establecerFalloImagen(false)
    establecerVistaPrevia(mensaje || seleccionado.type === 'application/pdf' ? '' : URL.createObjectURL(seleccionado))
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
    <h4 id="titulo-comprobante">Evidencia del pago</h4>
    <div className="field">
      <label htmlFor="comprobante-abono">Comprobante o factura (obligatorio)</label>
      <input ref={entrada} id="comprobante-abono" name="comprobante" type="file" required accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        disabled={deshabilitado} onChange={seleccionarArchivo} aria-invalid={Boolean(error)} aria-describedby={`ayuda-comprobante${error ? ' error-comprobante' : ''}`} />
      <small id="ayuda-comprobante" className="description">Adjunta evidencia del pago en JPG, PNG o PDF, máximo 5 MB. Es obligatoria para registrar el abono.</small>
      {error && <p className="field-error" id="error-comprobante" role="alert">{error}</p>}
    </div>
    {(archivo || error) && <button type="button" className="secondary-button" disabled={deshabilitado} onClick={quitarArchivo}>{archivo ? 'Quitar comprobante' : 'Descartar archivo rechazado'}</button>}
    {archivo && <>
      <p className="comprobante-nombre">Archivo seleccionado: <strong>{archivo.name}</strong> ({(archivo.size / 1024 / 1024).toFixed(2)} MB)</p>
      {vistaPrevia && !falloImagen && <img className="comprobante-imagen" src={vistaPrevia} alt={`Vista previa local de ${archivo.name}`}
        onError={() => { establecerFalloImagen(true); establecerVistaPrevia(''); entrada.current.value = ''; alCambiar(null, 'No se pudo visualizar el comprobante. Selecciona una imagen JPG o PNG válida.') }} />}
      {archivo.type === 'application/pdf' && <p className="description">Documento PDF seleccionado.</p>}
      <p className="notice">El archivo se guardará junto con el abono. La evidencia es obligatoria para confirmar el registro.</p>
    </>}
  </section>
}
