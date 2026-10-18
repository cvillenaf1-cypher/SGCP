# SGCP-9 — HU-04 | Registrar medio de pago y comprobante

Rama: `funcionalidad/SGCP-9-interfaz-comprobantes`, creada desde `main`
actualizado por avance rápido a `d20b40b`. HU-03 ya incluye el registro real de
abonos y la conexión de React incorporados por Haro. No se hicieron merges.

## Implementación

La selección de comprobante se integra en **Registrar pagos realizados**, junto
al medio obligatorio existente (Efectivo, Transferencia bancaria, Tarjeta o
Billetera digital). No se crea un formulario separado de abonos.

El comprobante es opcional. Se valida extensión JPG/JPEG/PNG, MIME JPEG/PNG,
archivo no vacío y tamaño máximo de 5 × 1024 × 1024 bytes. Se muestra nombre,
tamaño y vista previa local; se puede quitar o reemplazar. Los errores aparecen
debajo del campo, asociados mediante atributos de accesibilidad. Una imagen que
no puede visualizarse se rechaza. Las URL temporales se liberan al reemplazar,
quitar, rechazar o desmontar la vista. El selector se bloquea mientras se guarda
un abono o queda pendiente un reintento de la misma operación.

## Contrato y limitación actual

Se revisaron las rutas y validaciones reales de `origin/main`. Existe
`POST /api/obligaciones/:id/abonos`, que recibe exclusivamente `monto`,
`medio_pago` y `clave_idempotencia`. No admite archivo y todavía no existe una
ruta para cargar ni consultar comprobantes.

Por ello:

- Sin archivo, se conserva el registro real de abonos de HU-03 sin alterar su contrato.
- Con archivo, se informa que es una vista previa local y se bloquea el guardado.
  Nunca se omite silenciosamente un comprobante ni se simula su carga exitosa.
- Tras quitar el archivo, se permite guardar el abono sin comprobante.
- Con archivo rechazado se exige descartarlo o seleccionar uno válido antes de guardar.

Pendiente de Haro: método y ruta de carga, formato de petición, identificador de
abono, respuesta y errores, relación entre guardado y carga, y ruta autorizada
para consultar la imagen después de guardarla. No se inventaron URLs ni campos.
La persistencia y visualización del comprobante guardado siguen pendientes; la
vista previa actual no representa un archivo almacenado en MySQL o en el servidor.

## Archivos

- `src/components/SelectorComprobante.jsx`: selección, vista previa y eliminación local.
- `src/components/SelectorComprobante.css`: estilos adaptables.
- `src/lib/validarComprobante.js`: validación del archivo opcional.
- `src/components/FormularioAbono.jsx`: integración y bloqueo cuando existe adjunto pendiente.
- `src/test/comprobantes.test.jsx`: pruebas de HU-04 y regresión del guardado sin adjunto.
- `ENTREGA-HU-04.md`: informe.

## Pruebas ejecutadas

- `npm.cmd test` en frontend: 101 pruebas aprobadas en 6 archivos. Incluyen JPG,
  JPEG y PNG válidos, límite de 5 MB, exceso, PDF, MIME incorrecto, archivo vacío,
  selección opcional, vista previa, eliminación y liberación de URL, imagen inválida,
  bloqueo con adjunto y guardado con el contrato original al quitarlo.
- `npm.cmd run lint`: aprobado sin advertencias.
- `npm.cmd run build`: aprobado.
- `git diff --check`: aprobado.
- Recorrido adicional con Edge, API y MySQL locales: rechazo de PDF y exceso de
  tamaño, PNG real visible, bloqueo con adjunto y saldo sin cambios, vista móvil
  de 390 px sin desbordamiento, retiro del adjunto y registro real de S/ 10.00,
  con saldo actualizado de S/ 100.00 a S/ 90.00. Se conserva el ejemplo local
  identificado como `Ejemplo HU-04`; archivo y capturas están fuera de Git.
- Se aplicó únicamente la migración existente de Haro `003_abonos.sql` a la
  instancia MySQL local para probar el registro. No se modificó su SQL.

No se ejecutaron pruebas de subida o consulta de comprobantes guardados, porque
sus endpoints no existen. No se ejecutó toda la suite E2E ni pruebas del backend
en esta entrega. Las comprobaciones de componentes usan respuestas aisladas;
la funcionalidad obtiene obligaciones y saldos de las rutas reales existentes.

## Cómo revisar

Abrir `http://localhost:5173/#/login`, ingresar con la cuenta ASISTENTE y pulsar
**Registrar pagos realizados**. Seleccionar una obligación con saldo. Elegir monto
y medio, y adjuntar un JPG o PNG de hasta 5 MB para ver la vista previa. Probar un
PDF o un archivo mayor para comprobar errores. Quitar el archivo para registrar
un abono sin comprobante. Un registro confirmado modifica realmente el saldo.

No se modificaron backend, migraciones, login, módulo del GERENTE, Jira ni AWS.
Sin dependencias nuevas. Base, archivos de ejemplo, imágenes y credenciales
locales están excluidos de Git. Sin commit, push ni PR todavía: cambios listos
para revisión. No se comenzó HU-05.
