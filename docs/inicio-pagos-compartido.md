# Inicio compartido: pagos del mes y registro directo

El gerente y el asistente ven automáticamente los compromisos del mes actual y
las deudas vencidas de meses anteriores que todavía tienen saldo pendiente.
Sobre el título **Pagos del mes**, un selector permite elegir entre enero y
diciembre, sin selector de año. Se usa el año actual del calendario de
`America/Lima` y la fecha de vencimiento de cada obligación.

## Comportamiento

- Incluye todas las obligaciones del mes seleccionado, incluso las pagadas.
- En el mes actual incluye además las vencidas con saldo de períodos anteriores,
  incluso de años anteriores. Conservan su fecha de vencimiento original.
- Una deuda vencida de septiembre aparece en septiembre y en el mes actual de
  octubre. Un abono parcial mantiene ambas apariciones; al cancelarla deja de
  arrastrarse a octubre y se conserva como pagada en septiembre.
- Los meses seleccionados que no sean el actual muestran solo sus obligaciones.
- Elegir un mes actualiza la tabla inmediatamente, sin pulsar Actualizar listado.
- **Volver al mes actual**, junto al selector, restablece el período actual de Lima
  con un clic y muestra sus obligaciones y las vencidas pendientes.
- Ordena vencidas, pendientes/parciales del mes y pagadas; desempata por fecha e ID.
- Muestra concepto, beneficiario, importe original, saldo, vencimiento y estado.
- Conserva el estado económico y muestra el vencimiento como condición adicional.
- Las etiquetas muestran solo Pendiente, Parcial, Pagado o Vencida, sin explicaciones añadidas.
- Revisa la fecha cada minuto y al recuperar el foco. Al cambiar el mes o el año
  del calendario vuelve automáticamente al mes actual; un cambio de día conserva
  el mes elegido manualmente.

Cada fila tiene un único botón **Ver detalles**, que abre una ventana modal con
los datos de la obligación, su saldo y el historial de abonos y comprobantes.
La ventana recibe el foco, impide interactuar con el fondo y permite cerrar con
su botón o Escape; devuelve el foco
al botón de origen o a **Actualizar listado** si la fila ya no está visible.

## Pagos y comprobantes

El asistente registra nuevas deudas desde el icono **+** en la esquina superior
derecha de la tabla. También está disponible cuando todavía no hay obligaciones.
Abre el formulario existente de pago pendiente; **Pagos del mes**, en el menú, recarga
el listado para mostrar los registros del período. Este acceso reemplaza el botón
de registro de pagos pendientes del menú. El gerente no dispone de este control.

En la cabecera del detalle, junto al título y al cierre, el asistente puede pulsar
**Registrar pago** si queda saldo pendiente. El formulario se abre en la parte
superior de la ventana, antes del resumen y el historial, con los campos existentes:
monto, medio de pago y comprobante opcional. No vuelve a seleccionar
la obligación. El menú conserva únicamente **Pagos del mes**. Los pagos anteriores
y sus comprobantes se consultan dentro de **Ver detalles**, sin accesos separados
para consultar el historial o registrar pagos realizados.
Se conserva el endpoint monetario, la validación de céntimos,
la transacción del backend y la clave de idempotencia durante un reintento.
El formulario indica el saldo máximo a abonar y rechaza un importe superior,
incluido un exceso de un céntimo. El backend vuelve a verificar el saldo bajo
bloqueo de fila para impedir excesos cuando hay registros simultáneos.
Una obligación ya pagada permite consultar su historial, sin ofrecer otro pago.

Después del abono se actualizan el saldo, el estado, el listado y el historial.
El panel permanece abierto al cancelar una deuda. La fila sigue visible como
pagada en su mes original; si estaba arrastrada al mes actual, sale de ese listado
sin perder la confirmación ni el historial del detalle abierto.
El registro monetario y el archivo mantienen confirmaciones independientes:
un error de comprobante no deshace ni repite el abono.

Mientras hay un envío o una confirmación incierta se bloquean el cierre del panel,
el cambio de módulo y el cierre de sesión; la recarga avisa mediante `beforeunload`.
Al quedar confirmado el resultado se puede cerrar el panel.

El historial del detalle reutiliza la consulta y visualización autenticada de
comprobantes. Un asistente sigue viendo archivos de sus propios abonos; el gerente
puede consultar los comprobantes conforme al permiso de lectura ya existente.

## Permisos y alcance

Se habilitan para GERENTE únicamente las lecturas de detalle e historial existentes.
El listado general mantiene sus filtros y resultados completos. Los POST de
obligaciones, abonos y comprobantes siguen siendo exclusivos del ASISTENTE.

El gerente consulta HU-07 directamente en el panel: selector de mes, **Resumen
mensual** con cuatro tarjetas y tabla **Pagos del mes**, en ese orden. Los tres
primeros indicadores usan el mes del año actual; el vencido acumulado usa todas
las obligaciones pendientes anteriores a hoy en Lima. Comparten datos y recargas
con el listado, sin otra consulta ni selector. El asistente consulta el historial
desde los detalles y no visualiza estos indicadores exclusivos del gerente.
Ver [resumen integrado](resumen-integrado-gerente.md).

No se añaden aprobaciones empresariales ni verificaciones bancarias. Un comprobante
es evidencia adjunta al registro, no una confirmación bancaria de autenticidad.
No hay migraciones nuevas, dependencias nuevas ni cambios de infraestructura.

## Comprobación local

En `frontend/`:

```powershell
npm.cmd run lint
npm.cmd test -- --maxWorkers=2
npm.cmd run build
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npx.cmd playwright test --config=playwright.inicio.config.js
```

La configuración `playwright.inicio.config.js` prueba inicio e historial en un
navegador con respuestas HTTP simuladas, sin acceder a MySQL. Incluye capturas
de escritorio y móvil en `frontend/.local/`, excluidas de Git.

En `backend/`, ejecutar `npm.cmd run check`, `npm.cmd run lint` y `npm.cmd test`.
Las integraciones con MySQL y la configuración E2E habitual requieren
`backend/.env.test` y una base independiente con sufijo `_test`.

## Resultados del 20/10/2026

- Frontend: 174 pruebas aprobadas; build aprobado.
- Lint del frontend: finaliza correctamente con la advertencia preexistente de
  `MascotaSapo` sin utilizar en `LoginPage.jsx`.
- Backend: comprobación de sintaxis y lint aprobados; 78 pruebas unitarias y de
  rutas sin MySQL aprobadas, incluidos los permisos de lectura del gerente.
- Navegador Edge: 10 pruebas de inicio e historial aprobadas con API simulada;
  cubren teclado, móvil, ambos roles, abonos y reintentos de comprobante.
- `npm.cmd test` completo del backend se ejecutó, pero las suites que requieren
  MySQL fallan al preparar su entorno: `Configura backend/.env.test para ejecutar
  pruebas con MySQL real.` Su validación y el E2E con base real quedan pendientes.
- Se revisaron visualmente las capturas de escritorio y móvil. Los datos mostrados
  en ellas son exclusivamente ejemplos de las pruebas.
