# SGCP-10 — HU-05 | Consultar historial de pagos

## Funcionamiento

La pantalla del ASISTENTE consulta los pagos reales de la obligación seleccionada,
incluidas las pagadas. Se retiraron el ejemplo visual y los avisos de integración
pendiente. El listado conserva la consulta general de obligaciones existente.

Las obligaciones se muestran en una tabla con concepto, número, beneficiario,
monto original, saldo y estado. El buscador superior filtra por concepto,
beneficiario, número o estado, sin distinguir mayúsculas ni tildes. Admite varias
palabras y no realiza solicitudes adicionales. Una búsqueda vacía muestra todas.
Al pulsar una fila o su botón Ver historial, los pagos se muestran debajo y la
fila queda marcada como seleccionada. Filtrar no cierra el historial consultado.
La tabla tiene desplazamiento interno y encabezados fijos para listados largos.

Lecturas utilizadas con la sesión vigente:

- `GET /api/obligaciones`: obligaciones disponibles para consultar.
- `GET /api/obligaciones/:id/historial`: resumen y abonos registrados.
- `GET /api/abonos/:id/comprobante/archivo`: imagen del comprobante autorizado.

## Criterios de aceptación

| Criterio | Comportamiento implementado |
| --- | --- |
| Consultar un compromiso registrado | Tabla buscable de obligaciones reales, incluidas las pagadas; selección de fila y detalle debajo. |
| Fecha, monto y medio de pago | Cada fila muestra los tres datos del abono real. |
| Más recientes primero | Orden descendente por fecha de registro y, en empates, por ID. |
| Monto original | Se incluye en el resumen de la obligación. |
| Total acumulado | El backend suma los abonos de la obligación con céntimos exactos. |
| Saldo automático | Se muestra monto original menos total abonado, sin modificar el saldo almacenado al consultar. |
| Soles y dos decimales | Todos los importes se presentan como S/ y dos decimales, sin cálculos monetarios con Number. |
| Consultar comprobantes | Ver comprobante obtiene una imagen JPG/PNG con Bearer y la muestra en la misma pantalla. |
| Sin abonos | Se indica que la obligación todavía no tiene abonos. |
| Nuevos abonos | Al volver desde el registro o pulsar Actualizar historial se consultan los pagos actuales y se conservan los anteriores. |
| Consulta de solo lectura | El historial solo ejecuta GET; el backend consulta mediante un SELECT sin escrituras ni bloqueos de pago. |

Las fechas se presentan en America/Lima y conservan su fecha UTC en el elemento
time. Si el saldo almacenado difiere de monto original menos abonos, la pantalla
muestra una advertencia y ambos valores, sin reparar registros al consultarlos.

Los comprobantes respetan los permisos existentes del backend. Un adjunto sin
permiso se indica sin solicitar su archivo. No se incluyen tokens en enlaces.
Cerrar la imagen, cambiar de obligación o abandonar la vista cancela las consultas
pendientes y libera las URLs temporales de las imágenes.

## Verificación

Pruebas de componentes: tabla, búsqueda local, selección por teclado, historial, errores, actualización, importes exactos,
obligaciones pagadas, respuestas obsoletas, comprobantes y sesión vencida.
Pruebas de backend: resumen, orden, céntimos exactos, inconsistencias, solo lectura
y registro de otro abono sin alterar pagos anteriores.

La prueba de navegador usa la aplicación y su cliente HTTP reales con respuestas
API interceptadas de prueba; no realiza pagos ni cambios en la base de producción.
Desde frontend, con Chromium de Playwright instalado:

```powershell
npm.cmd test -- --maxWorkers=1
npm.cmd run lint
npm.cmd run build
node node_modules/@playwright/test/cli.js test --config playwright.historial.config.js
```

Para usar Chrome instalado, establecer PLAYWRIGHT_CHANNEL=chrome antes del último
comando. La configuración focalizada no requiere MySQL ni credenciales reales.
La suite de integración MySQL del backend requiere backend/.env.test y una base
independiente terminada en _test; no se sustituye por la base de producción.

## Cómo revisar

Ingresar como ASISTENTE, abrir Consultar historial de pagos y buscar una
obligación por concepto, beneficiario, número o estado. Pulsar su fila o Ver
historial. Comprobar debajo el resumen y la lista; abrir Ver comprobante en un pago con
imagen propia. Registrar otro abono, volver al historial y comprobar el nuevo pago
junto con los anteriores. Para una obligación sin pagos, comprobar el mensaje vacío.

No se añaden dependencias, migraciones ni cambios de autenticación o infraestructura.
