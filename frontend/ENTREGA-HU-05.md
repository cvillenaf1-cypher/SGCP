# SGCP-10 — HU-05 | Consultar historial de pagos

## Funcionamiento

La pantalla del ASISTENTE consulta los pagos reales de la obligación seleccionada,
incluidas las pagadas. Se retiraron el ejemplo visual y los avisos de integración
pendiente. El listado conserva la consulta general de obligaciones existente.

Las obligaciones se muestran en una tabla con concepto, número, beneficiario,
monto original, saldo y estado. El buscador superior permite localizar compromisos
por concepto, beneficiario o empresa, número y estado, sin distinguir mayúsculas
ni tildes. Admite varias palabras y se combina con el selector **Filtrar por
estado**, cuyas opciones son **Todos**, **Pagados**, **Pendientes** y **Parciales**.
Ambos filtros se aplican simultáneamente: si una empresa tiene varios compromisos,
buscar su nombre y elegir Pagados muestra solo sus compromisos pagados.

El estado inicial es Todos y la búsqueda está vacía, por lo que aparecen todas
las obligaciones, incluidas las pagadas. Elegir Todos conserva el texto buscado;
Limpiar búsqueda conserva el estado elegido. Los filtros son locales y no realizan
solicitudes adicionales ni cambian la consulta general de obligaciones.

Al pulsar una fila o su botón Ver historial, los pagos se muestran debajo y la
fila queda marcada como seleccionada. Filtrar no cierra el historial consultado:
si la fila queda fuera de los resultados, un aviso identifica la obligación cuyo
historial continúa abierto. La tabla tiene desplazamiento interno y encabezados
fijos para listados largos. Si no hay coincidencias, se muestra un mensaje distinto
al de una obligación sin abonos.

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
12. El sistema debe mostrar una tabla de todos los compromisos económicos registrados, incluidos los pagados, cuando no haya una búsqueda activa y el filtro de estado sea Todos.
13. La tabla debe mostrar el concepto, número identificador, beneficiario o empresa, monto original, saldo pendiente, estado y una opción Ver historial para cada compromiso.
14. El sistema debe permitir buscar compromisos por concepto, beneficiario o empresa y número identificador, sin distinguir mayúsculas, minúsculas ni tildes. Si se ingresan varias palabras, todas deben coincidir con la información del compromiso.
15. El sistema debe incluir un selector Filtrar por estado con las opciones Todos, Pagados, Pendientes y Parciales. Pagados debe mostrar compromisos totalmente pagados; Pendientes, compromisos sin abonos; y Parciales, compromisos con abonos y saldo pendiente.
16. La búsqueda y el filtro de estado deben aplicarse simultáneamente. Por ejemplo, si la empresa Los Álamos tiene varios compromisos en distintos estados, buscar los alamos y seleccionar Pagados debe mostrar únicamente sus compromisos totalmente pagados.
17. Al seleccionar Todos, el sistema debe conservar la búsqueda escrita y mostrar sus coincidencias en cualquier estado.
18. Al pulsar Limpiar búsqueda, el sistema debe borrar únicamente el texto buscado y conservar el estado seleccionado.
19. Al seleccionar una fila o pulsar Ver historial, el sistema debe mostrar debajo de la tabla el resumen y los pagos de ese compromiso, y señalar qué fila está seleccionada. Ver historial también debe poder activarse con el teclado.
20. El sistema debe mostrar cuántos compromisos coinciden con los filtros y un mensaje claro cuando la búsqueda o el estado seleccionado no tengan coincidencias. Este mensaje debe distinguirse del de un compromiso sin abonos.
21. Al cambiar la búsqueda o el filtro de estado, el historial seleccionado debe permanecer abierto. Si su compromiso deja de aparecer en la tabla, el sistema debe mostrar un aviso que identifique el historial que sigue abierto.
22. Buscar, filtrar por estado y seleccionar compromisos deben ser acciones de consulta: no deben crear, eliminar ni modificar compromisos, abonos, importes ni comprobantes.

Las fechas se presentan en America/Lima y conservan su fecha UTC en el elemento
time. Si el saldo almacenado difiere de monto original menos abonos, la pantalla
muestra una advertencia y ambos valores, sin reparar registros al consultarlos.

Los comprobantes respetan los permisos existentes del backend. Un adjunto sin
permiso se indica sin solicitar su archivo. No se incluyen tokens en enlaces.
Cerrar la imagen, cambiar de obligación o abandonar la vista cancela las consultas
pendientes y libera las URLs temporales de las imágenes.

## Verificación

Pruebas de componentes: tabla completa, búsqueda local por concepto, beneficiario
o empresa y número sin diferencias de mayúsculas o tildes, filtro de estados,
combinación de búsqueda y estado, conservación de filtros al elegir Todos o limpiar
la búsqueda, selección por fila y teclado, detalle conservado cuando queda fuera
de los filtros y mensajes sin coincidencias. También se comprueban historial,
errores, actualización, importes exactos, obligaciones pagadas, respuestas
obsoletas, comprobantes y sesión vencida.
Pruebas de backend: resumen, orden, céntimos exactos, inconsistencias, solo lectura
y registro de otro abono sin alterar pagos anteriores.

La prueba de navegador usa la aplicación y su cliente HTTP reales con respuestas
API interceptadas de prueba. Comprueba el recorrido desde la tabla y sus filtros
hasta el detalle, incluidos compromisos de una misma empresa en distintos estados;
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

1. Ingresar como ASISTENTE y abrir Consultar historial de pagos. Comprobar la tabla de todos los compromisos, incluidos los pagados, con el filtro Todos y la búsqueda vacía.
2. Buscar una obligación por concepto, beneficiario o empresa y número. Probar mayúsculas y palabras sin tildes para localizar textos con tildes.
3. Si una empresa tiene varios compromisos, buscar su nombre y alternar Pagados, Pendientes y Parciales. Comprobar que cada resultado coincide tanto con la empresa como con el estado elegido.
4. Elegir Todos y comprobar que la búsqueda no se borra. Elegir un estado y pulsar Limpiar búsqueda para comprobar que ese estado se conserva.
5. Pulsar una fila o Ver historial, también con el teclado. Comprobar que debajo aparecen el monto original, total acumulado, saldo y pagos del más reciente al más antiguo.
6. Cambiar la búsqueda o el estado para ocultar la fila seleccionada. Comprobar que el historial permanece abierto y que el aviso identifica el compromiso seleccionado.
7. Aplicar filtros sin coincidencias y comprobar el mensaje. Consultar un compromiso sin pagos y comprobar que se muestra el mensaje específico de ausencia de abonos.
8. Abrir Ver comprobante en un pago con imagen propia. En un entorno de pruebas, registrar otro abono, volver al historial y comprobar que aparece junto con los pagos anteriores.

La consulta general `GET /api/obligaciones` mantiene su comportamiento: no se
ocultan globalmente los compromisos pagados ni se escriben datos al consultar,
buscar o filtrar el historial.

No se añaden dependencias, migraciones ni cambios de autenticación o infraestructura.
