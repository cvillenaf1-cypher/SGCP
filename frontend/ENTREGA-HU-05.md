# SGCP-10 — HU-05 | Consultar historial de pagos

## Funcionamiento

La pantalla del ASISTENTE consulta los pagos reales de la obligación seleccionada,
incluidas las pagadas. Se retiraron el ejemplo visual y los avisos de integración
pendiente. El listado conserva la consulta general de obligaciones existente.

La tabla de **Pagos del mes** muestra concepto, número, beneficiario, monto
original, saldo y estado. Sobre el título hay un selector de enero a diciembre.
Inicia en el mes actual y usa automáticamente el año actual de `America/Lima`.
Elegir un mes muestra sus obligaciones por fecha límite, incluidas las pagadas,
sin mezclar meses ni años y sin necesidad de actualizar manualmente.

Al cambiar el mes o el año del calendario, la vista vuelve al mes actual. La fecha
se revisa cada minuto y al recuperar el foco; cambiar solo de día conserva una
selección manual. No hay selector de año ni botón Consultar historial de pagos.

**Ver detalles** abre una ventana modal con el resumen y todos los abonos de la
obligación seleccionada. **Registrar pago** aparece en la cabecera si queda saldo;
al registrar otro abono se actualizan el resumen y el historial. Si un mes no tiene
obligaciones se muestra un mensaje distinto al de una obligación sin abonos.

Lecturas utilizadas con la sesión vigente:

- `GET /api/obligaciones`: obligaciones disponibles para consultar.
- `GET /api/obligaciones/:id/historial`: resumen y abonos registrados.
- `GET /api/abonos/:id/comprobante/archivo`: imagen del comprobante autorizado.

## Criterios de aceptación

Lista completa para copiar a Jira:

1. El sistema debe permitir consultar el historial de pagos realizados de un compromiso económico previamente registrado.
2. Cada pago debe mostrar la fecha de registro, monto abonado y medio de pago utilizado.
3. Los pagos deben mostrarse ordenados desde el más reciente hasta el más antiguo.
4. El sistema debe mostrar el monto original del compromiso económico.
5. El sistema debe calcular y mostrar el total acumulado de los abonos registrados.
6. El saldo pendiente debe calcularse automáticamente considerando el monto original y el total abonado.
7. Los importes deben mostrarse en soles (S/) y con dos decimales.
8. El sistema debe permitir consultar el comprobante de los pagos que tengan una imagen adjunta.
9. Cuando un compromiso no tenga pagos realizados, el sistema debe mostrar un mensaje indicando que todavía no existen abonos registrados.
10. Al registrar un nuevo abono, este debe incorporarse al historial sin eliminar ni modificar los registros anteriores.
11. La consulta del historial no debe modificar los montos ni la información de los pagos registrados.
12. La tabla debe incluir los compromisos con vencimiento en el mes seleccionado del año actual, en cualquier estado.
13. Cada compromiso debe mostrar concepto, identificador, beneficiario, monto original, saldo, vencimiento, estado y un único botón Ver detalles.
14. El selector debe ofrecer únicamente los doce meses, sin selector de año, e iniciar en el mes actual de Lima.
15. Elegir otro mes debe actualizar la tabla inmediatamente y distinguir un mes vacío de una obligación sin abonos.
16. El mes y el año actuales deben actualizarse automáticamente al cambiar el calendario, también al recuperar el foco, sin mezclar registros del año anterior.
17. Ver detalles debe abrir una ventana modal con el resumen y el historial; el menú no debe ofrecer un acceso separado a Consultar historial de pagos.
18. Filtrar y consultar detalles no deben crear, eliminar ni modificar obligaciones, abonos, importes ni comprobantes.

Las fechas se presentan en America/Lima y conservan su fecha UTC en el elemento
time. Si el saldo almacenado difiere de monto original menos abonos, la pantalla
muestra una advertencia y ambos valores, sin reparar registros al consultarlos.

Los comprobantes respetan los permisos existentes del backend. Un adjunto sin
permiso se indica sin solicitar su archivo. No se incluyen tokens en enlaces.
Cerrar la imagen, cambiar de obligación o abandonar la vista cancela las consultas
pendientes y libera las URLs temporales de las imágenes.

## Verificación

Pruebas de componentes: selección del mes actual, filtro por mes del año actual,
meses vacíos, cambio automático de mes y año, selección por fila y teclado y
consulta del historial en una ventana modal. También se comprueban historial,
errores, actualización, importes exactos, obligaciones pagadas, respuestas
obsoletas, comprobantes y sesión vencida.
Pruebas de backend: resumen, orden, céntimos exactos, inconsistencias, solo lectura
y registro de otro abono sin alterar pagos anteriores.

La prueba de navegador usa la aplicación y su cliente HTTP reales con respuestas
API interceptadas de prueba. Comprueba el recorrido desde la tabla y su selector
de meses hasta los detalles, incluidos compromisos pagados de meses anteriores;
no realiza pagos ni cambios en la base de producción.
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

1. Ingresar como ASISTENTE y comprobar que el selector sobre Pagos del mes inicia en el mes actual, sin selector de año ni botón de historial.
2. Elegir otro mes y comprobar que la tabla solo incluye obligaciones con vencimiento en ese mes del año actual, también las pagadas.
3. Elegir un mes vacío y comprobar su mensaje y el acceso + a nuevas deudas.
4. Abrir Ver detalles, también con el teclado, y comprobar resumen, abonos del más reciente al más antiguo y comprobantes autorizados.
5. En un entorno de pruebas, registrar otro abono desde la cabecera del detalle y comprobar que se actualizan saldo, estado e historial sin eliminar pagos anteriores.

La consulta general `GET /api/obligaciones` mantiene su comportamiento: no se
ocultan globalmente los compromisos pagados ni se escriben datos al consultar,
o filtrar por mes.

No se añaden dependencias, migraciones ni cambios de autenticación o infraestructura.
