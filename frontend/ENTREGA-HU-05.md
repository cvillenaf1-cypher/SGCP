# SGCP-10 — HU-05 | Consultar historial de pagos

Rama: `funcionalidad/SGCP-10-interfaz-historial`. Creada desde `main`
actualizado por avance rápido a `0109f78`, con HU-04 integrada. No se hizo merge.

## Estado

Vista del historial preparada para integración en el panel ASISTENTE, mediante
**Consultar historial de pagos**. El backend revisado en `origin/main` dispone
de registro de abonos, pero no de su consulta ni consulta de comprobantes.
La historia todavía no está conectada al historial real de MySQL.

La selección de obligaciones, incluidas las pagadas, y sus datos generales sí
usan las rutas existentes de Joel. Se muestra concepto, monto original y saldo
pendiente real. El total acumulado y la lista de abonos se indican pendientes de
consulta: no se infieren del saldo ni se presenta un historial vacío sin conocerlo.

Se añadió **Ver ejemplo visual del historial** como vista separada y temporal,
identificada expresamente como DATOS DE EJEMPLO, sin relación con la obligación
real seleccionada. Muestra el resumen completo, total acumulado, saldo, montos,
medios y fechas automáticas en America/Lima. Los abonos se ordenan del más reciente
al más antiguo sin modificar los datos de origen. Incluye un caso sin abonos y
comprobantes opcionales señalados sin inventar URLs o archivos almacenados.

La pantalla es de solo lectura: no hay edición, eliminación ni escrituras.
Incluye carga, errores, reintentos, actualización, negocio sin obligaciones y
adaptación móvil. Descarta detalles obsoletos al cambiar de selección.

## Archivos

- `src/components/HistorialPagos.jsx`: selección, resumen real, vista de presentación y ejemplo.
- `src/components/HistorialPagos.css`: estilos y disposición móvil.
- `src/datos/ejemplosHistorial.js`: datos exclusivos del ejemplo visual, separados de la API.
- `src/components/FuncionesAsistente.jsx`: navegación dentro del panel existente.
- `src/test/historialPagos.test.jsx`: pruebas del historial y ejemplos.
- `src/test/auth.test.jsx`: acceso exclusivo por rol y sesión vencida desde HU-05.
- `ENTREGA-HU-05.md`: informe.

## Conexión pendiente de Haro

Ya conectadas las lecturas `GET /api/obligaciones` y `GET /api/obligaciones/:id`,
mediante el cliente HTTP y la autenticación existentes. No se añadieron rutas.

Haro debe entregar método y ruta de consulta del historial por obligación, campos
de respuesta para resumen y abonos, formatos de fecha, errores y referencia o ruta
autorizada de cada comprobante. Se adaptará la presentación al contrato real, se
retirará el ejemplo temporal y se comprobarán los totales, orden, estado vacío y
consulta protegida del archivo. No se asume que el modelo de ejemplo sea su JSON.

## Verificación

- `npm.cmd test`: 111 pruebas aprobadas en 7 archivos. Incluyen renderizado, lista de obligaciones pagadas y pendientes,
  resumen real sin historial inventado, ejemplos separados, varios abonos,
  orden descendente, totales, saldo, fechas, ausencia de comprobante, historial de
  ejemplo vacío, errores, reintentos, respuestas obsoletas, solo lectura y roles.
- `npm.cmd run lint` y `npm.cmd run build`: aprobados.
- Recorrido adicional con Edge y API/MySQL locales: consulta real de una obligación,
  total real marcado pendiente, ejemplo con tres abonos en el orden correcto,
  ejemplo sin abonos, retorno a datos reales y ancho móvil de 390 px sin
  desbordamiento. Se verificó que solo se solicitaron rutas GET existentes y no
  se generaron escrituras. Capturas guardadas fuera de Git.
- `git diff --check`: aprobado.

No se han probado un historial real de MySQL, totales reales de abonos ni consulta
de comprobantes almacenados: sus endpoints no existen. No se ejecutaron pruebas
del backend ni toda la suite Playwright en esta entrega.

## Cómo revisar

Con API, MySQL y frontend iniciados, abrir `http://localhost:5173/#/login`, ingresar
como ASISTENTE y pulsar **Consultar historial de pagos**. Seleccionar una obligación
para ver concepto, monto original y saldo reales junto al aviso de consulta pendiente.
Pulsar **Ver ejemplo visual del historial** para revisar el diseño con varios
abonos o sin abonos. **Volver a obligaciones reales** abandona el ejemplo.

No se modificaron backend, migraciones, login, módulo del GERENTE, Jira ni AWS.
Sin dependencias nuevas. Configuración local, credenciales y capturas permanecen
fuera de Git. No se hicieron commit, push ni PR: cambios preparados para revisión.
