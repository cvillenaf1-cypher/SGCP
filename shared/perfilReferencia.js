// Contrato puro compartido por React y Express. No contiene acceso a datos ni secretos.
export const definicionesPerfil = Object.freeze({
  titular: {
    tipo: { etiqueta: 'Tipo de titular', opciones: [['', 'Sin configurar'], ['EMPRESA', 'Empresa'], ['PERSONA_NATURAL', 'Persona natural']] },
    nombre: { etiqueta: 'Nombre completo o razón social', max: 160 },
    documento: { etiqueta: 'Documento del titular principal', max: 11, documento: true },
    nombre_comercial: { etiqueta: 'Nombre comercial (opcional)', max: 160 },
  },
  bancos: {
    entidad: { etiqueta: 'Entidad financiera', max: 100, obligatorio: true },
    relacion: { etiqueta: 'Relación bancaria', obligatorio: true, opciones: [['PAGOS', 'Banco de pagos'], ['PRESTAMISTA', 'Prestamista'], ['AMBOS', 'Ambos']] },
    titular: { etiqueta: 'Titular de referencia (opcional)', max: 160 },
    documento: { etiqueta: 'DNI o RUC del titular (opcional)', max: 11, documento: true },
    alias: { etiqueta: 'Alias o descripción (opcional)', max: 160 },
    marca_tarjeta: { etiqueta: 'Marca de tarjeta (opcional)', max: 40 },
    ultimos_cuatro: { etiqueta: 'Últimos cuatro dígitos (opcional)', max: 4 },
  },
  servicios: {
    tipo: { etiqueta: 'Tipo de servicio', obligatorio: true, opciones: [['ELECTRICIDAD', 'Electricidad'], ['AGUA', 'Agua'], ['INTERNET', 'Internet'], ['TELEFONIA', 'Telefonía'], ['OTRO', 'Otros']] },
    empresa: { etiqueta: 'Empresa prestadora', max: 100, obligatorio: true },
    titular: { etiqueta: 'Titular que aparece en el recibo (opcional)', max: 160 },
    documento: { etiqueta: 'DNI o RUC del titular (opcional)', max: 11, documento: true },
    codigo_cliente: { etiqueta: 'Código de suministro o cliente (opcional)', max: 60 },
    direccion: { etiqueta: 'Dirección del servicio (opcional)', max: 240 },
    alias: { etiqueta: 'Alias o descripción (opcional)', max: 160 },
    relacion_empresa: { etiqueta: 'Relación con el negocio', opciones: [['POR_DEFINIR', 'Por definir'], ['PROPIO', 'Propio'], ['TERCERO_RELACIONADO', 'Tercero relacionado']] },
    detalle_relacion: { etiqueta: 'Detalle de la relación (opcional)', max: 160 },
  },
})

export const normalizarTextoPerfil = (valor) => valor.normalize('NFKC').trim().replace(/\s+/gu, ' ')

export function valoresInicialesPerfil(tipo) {
  return Object.fromEntries(Object.entries(definicionesPerfil[tipo]).map(([clave, campo]) => [clave, campo.opciones?.[0][0] || '']))
}

export function contieneInformacionSensible(valor, { documento = false, banco = false, ultimosCuatro = false } = {}) {
  // No depende de Luhn: también rechaza números completos que no sean tarjetas válidas.
  // DNI/RUC solo en su campo. Textos bancarios: como máximo cuatro dígitos consecutivos.
  const texto = valor.normalize('NFKC')
  if (/[\p{Cc}\p{Cf}]/u.test(texto)) return true
  if (/\p{N}/u.test(texto.replace(/[0-9]/g, ''))) return true
  if (banco && !documento && !ultimosCuatro && /^\s*\d[\d\s\p{P}]*$/u.test(texto)) return true
  if (/\b(?:cvv\d*|cvc\d*|pin\d*|clave|claves|contrase[nñ]a|password|passcode|credenciales|token|cci|iban|swift)\b/iu.test(texto)) return true
  if (/\b(?:n[uú]mero\s+(?:de\s+)?(?:cuenta|tarjeta)|cuenta\s*(?:nro|n[°º.]|:|=)|usuario\s+bancario)\b/iu.test(texto)) return true
  const secuencias = texto.match(/\d(?:[\s\p{P}\p{Cf}]*\d)*/gu) || []
  return secuencias.some((secuencia) => secuencia.replace(/\D/g, '').length >= (banco && !documento ? 5 : 12))
}

export function validarPerfil(tipo, cuerpo, { edicion = false } = {}) {
  const definicion = definicionesPerfil[tipo]
  const fields = {}
  const datos = valoresInicialesPerfil(tipo)
  const permitido = [...Object.keys(definicion), ...(edicion ? ['version'] : [])]
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || Object.keys(cuerpo).some((clave) => !permitido.includes(clave))) {
    fields.form = 'Envía únicamente los campos de referencia permitidos; no incluyas credenciales ni datos bancarios completos.'
  }
  for (const [clave, campo] of Object.entries(definicion)) {
    const original = cuerpo?.[clave] ?? datos[clave]
    if (typeof original !== 'string') {
      fields[clave] = 'Ingresa texto en este campo.'
      continue
    }
    const valor = normalizarTextoPerfil(original)
    datos[clave] = valor
    if (contieneInformacionSensible(original, { documento: campo.documento, banco: tipo === 'bancos', ultimosCuatro: clave === 'ultimos_cuatro' })) {
      fields[clave] = 'No incluyas números completos de tarjeta o cuenta, claves, CVV, PIN ni credenciales.'
    } else if (campo.obligatorio && !valor) {
      fields[clave] = 'Completa este campo para guardar la referencia.'
    } else if (campo.max && valor.length > campo.max) {
      fields[clave] = `Usa como máximo ${campo.max} caracteres.`
    } else if (campo.opciones && !campo.opciones.some(([opcion]) => opcion === valor)) {
      fields[clave] = 'Selecciona una opción válida.'
    } else if (campo.documento && valor && !/^(?:\d{8}|\d{11})$/.test(valor)) {
      fields[clave] = 'Usa un DNI de 8 dígitos o un RUC de 11 dígitos, sin espacios.'
    }
  }
  if (tipo === 'titular' && datos.documento && !fields.documento) {
    const patron = datos.tipo === 'EMPRESA' ? /^\d{11}$/ : datos.tipo === 'PERSONA_NATURAL' ? /^\d{8}$/ : null
    if (!patron?.test(datos.documento)) fields.documento = 'Selecciona el tipo y usa RUC de 11 dígitos para empresa o DNI de 8 para persona natural.'
  }
  if (tipo === 'bancos' && datos.ultimos_cuatro && !/^\d{4}$/.test(datos.ultimos_cuatro)) {
    fields.ultimos_cuatro = 'Ingresa únicamente los últimos cuatro dígitos, o deja el campo vacío.'
  }
  if (edicion && (!Number.isSafeInteger(cuerpo?.version) || cuerpo.version < 0 || cuerpo.version > 4294967294)) {
    fields.version = 'Recarga el perfil antes de guardar.'
  }
  return { datos, fields, ...(edicion ? { version: cuerpo?.version } : {}) }
}
