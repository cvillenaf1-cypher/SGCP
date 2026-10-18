# SGCP-11 · HU-06: consultar pagos del mes

Interfaz de consulta exclusiva del GERENTE y de solo lectura. No incluye HU-07 ni
HU-08. Conserva el login, la sesión en memoria y las restricciones por rol existentes.

## Comprobar la interfaz

Desde `frontend/`, en PowerShell:

```powershell
npm.cmd run dev
```

Con el backend de autenticación disponible, iniciar sesión normalmente como GERENTE
y seleccionar **Consultar pagos del mes** en su panel. La ruta es
`http://localhost:5173/#/gerente/pagos-del-mes`. Sin sesión se vuelve al login;
con ASISTENTE se muestra acceso no permitido. Recargar conserva el comportamiento
existente: requiere iniciar sesión nuevamente.

La pantalla selecciona inicialmente el mes y año actuales en `America/Lima`.
Permite cambiar mes y año (1 a 9999) y consulta automáticamente. Muestra concepto,
beneficiario, monto original, saldo pendiente, fecha límite y estado del pago.
Los importes usan soles con dos decimales; las fechas se presentan como `dd/mm/aaaa`
sin convertir la fecha calendario a otra zona horaria. La tabla permite desplazamiento
horizontal y foco por teclado en pantallas pequeñas.

Por ahora se muestra **La consulta de pagos aún no está conectada al servidor**.
Ese aviso no representa una consulta sin resultados. No se incluyen datos ficticios
en la aplicación ni se solicita un endpoint financiero provisional.

## Verificación sin MySQL

Las pruebas montan los componentes de forma aislada e inyectan una consulta de
prueba. Los ejemplos están exclusivamente en `frontend/src/test/datos/pagosDelMes.js`;
no se importan en el código de producción. Las pruebas de rutas usan el proveedor
de autenticación existente con respuestas HTTP simuladas dentro de la suite.
No existe una ruta pública de demostración ni una opción para saltar el login.

Desde `frontend/`:

```powershell
npm.cmd test -- src/test/pagosDelMes.test.jsx
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Se cubren valores iniciales, calendario de Lima, cambio de mes y año, filtro por fecha
límite independiente del registro, extremos del mes, año bisiesto, seis columnas,
soles con dos decimales y saldo cero, estados del pago, ausencia de resultados,
errores, conexión pendiente, validación del año, cancelación de consultas, respuestas
fuera de orden, solo lectura y acceso restringido por sesión y rol.

Las pruebas E2E existentes (`npm.cmd run test:e2e`) requieren dependencias del backend,
MySQL y una base independiente de pruebas configurada. No se instalan ni configuran
como parte de HU-06.

### Resultado de la verificación del 18/10/2026

- `npm.cmd test`: 29 pruebas aprobadas, incluidas 18 nuevas de HU-06.
- `npm.cmd run lint`: aprobado sin advertencias.
- `npm.cmd run build`: aprobado.
- `npm.cmd run check` en `backend/`: aprobado (comprobación de sintaxis).
- `node --test test/validation.test.js` en `backend/`: no pudo ejecutar los casos
  porque falta la dependencia `dotenv`.
- `npm.cmd run test:e2e`: no pudo iniciar Express porque falta la dependencia `cors`.
  Después de instalar las dependencias del backend seguirá siendo necesario
  disponer de MySQL y la configuración de pruebas descrita en el README principal.

## Conexión pendiente con Express

El único punto pendiente para obtener datos es
`frontend/src/gerente/servicioPagos.js`, función `consultarPagosDelMes`.
Actualmente rechaza con `ErrorIntegracionPendiente`; nunca devuelve una lista vacía
para fingir que se consultó el servidor.

La pantalla entrega a esa función:

- `mes`: número entre 1 y 12.
- `anio`: año entero entre 1 y 9999.
- `solicitar`: cliente del contexto de autenticación existente, que añade Bearer y
  gestiona respuestas 401. Debe usarse para la petición real.
- `senal`: señal de cancelación; pasar al cliente como `{ signal: senal }`.

Cuando Joel entregue el contrato, implementar ahí la petición de lectura y adaptar
su respuesta a esta lista interna de la interfaz (no es un contrato HTTP ni SQL):

| Campo interno | Representación |
| --- | --- |
| `id` | Identificador estable y único |
| `concepto` | Texto |
| `beneficiario` | Texto |
| `montoOriginal` | Cadena decimal, por ejemplo `1500.00` |
| `saldoPendiente` | Cadena decimal, por ejemplo `1000.50` |
| `fechaLimite` | Fecha calendario `AAAA-MM-DD` |
| `estado` | Texto del estado de pago acordado con el backend |

No se realizan cálculos financieros ni se deduce vencimiento como estado de pago.
El adaptador deberá normalizar los estados según el contrato que acuerde el equipo;
la migración actual no contiene una columna de estado. No se requiere agregarla
para desarrollar esta interfaz.

La consulta deberá devolver todos los pagos del período, incluidos los ya pagados,
y el backend deberá filtrar por **fecha límite** y autorizar al GERENTE. Si el endpoint
es paginado, el adaptador deberá completar la lista o la interfaz deberá incorporar
la paginación antes de considerar terminada la integración. La interfaz también filtra
por fecha límite para que nunca se incluyan filas de otro mes o año.

No se han definido rutas financieras, parámetros HTTP definitivos, tablas nuevas
ni modificaciones al backend, al módulo del ASISTENTE o a AWS.
