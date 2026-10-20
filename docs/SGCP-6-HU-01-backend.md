# SGCP-6 · HU-01 · Registrar pagos pendientes (backend)

Rama: `funcionalidad/SGCP-6-registrar-pagos-pendientes`.

Implementa únicamente el registro de obligaciones mediante la migración integrada
`database/migrations/002_obligaciones.sql`. No incorpora interfaz, listado, abonos
ni funcionalidades del gerente.

## Ruta y contrato

`POST /api/obligaciones`, con `Content-Type: application/json` y
`Authorization: Bearer <token>` de la autenticación existente. Solo ASISTENTE.

Entrada:

```json
{
  "concepto": "Servicio de limpieza",
  "beneficiario": "Proveedor de limpieza",
  "monto": "120.50",
  "fecha_limite": "2020-01-15"
}
```

Ejemplo de respuesta HTTP `201` (identificador, creador y fecha ilustrativos):

```json
{
  "message": "Obligación registrada correctamente.",
  "obligacion": {
    "id": 81,
    "concepto": "Servicio de limpieza",
    "beneficiario": "Proveedor de limpieza",
    "monto_original": "120.50",
    "saldo_pendiente": "120.50",
    "fecha_limite": "2020-01-15",
    "fecha_registro": "2026-10-18T15:00:00.000Z",
    "usuario_creador_id": 42
  }
}
```

## Validación y persistencia

- Los cuatro campos son obligatorios. Concepto y beneficiario deben ser cadenas;
  se aplica TRIM y se exige entre 1 y 255 caracteres Unicode.
- `monto` es una cadena decimal en soles (S/), mayor que cero, con hasta dos
  decimales y máximo `100000.00`. Se conserva `DECIMAL(13,2)` para los datos históricos. No admite números
  JSON, exponentes, comas, espacios ni símbolos de moneda. Se normaliza a dos
  decimales mediante cadenas, sin cálculos monetarios de punto flotante.
- `fecha_limite` exige una fecha calendario real en formato exacto `YYYY-MM-DD`,
  entre `1000-01-01` y `9999-12-31`, rango de MySQL DATE. Admite fechas anteriores
  a hoy. Se guarda sin conversión de zona horaria.
- Si el asistente selecciona una fecha límite válida anterior al día actual en
  `America/Lima`, el formulario muestra junto al campo: **La fecha seleccionada
  ya pasó. Esta deuda se registrará como vencida.** El aviso es informativo y
  permite guardar conservando el vencimiento original. Desaparece al seleccionar
  hoy, una fecha futura o limpiar el campo. Las fechas inexistentes siguen
  rechazándose; la fecha de registro continúa asignándose automáticamente.
- Se rechaza todo campo adicional, incluidos creador, saldo, estado y fecha de
  registro. El creador procede exclusivamente de `solicitud.auth.user.id`.
- Se reutiliza el pool MySQL existente con `getConnection` y consultas `execute`
  con `?`. El INSERT utiliza el mismo monto para `monto_original` y
  `saldo_pendiente`. El INSERT y la lectura de la fila comparten una transacción:
  si falla la lectura, se solicita rollback y se libera la conexión.
- El INSERT omite `fecha_registro`: MySQL genera su valor UTC mediante el DEFAULT
  existente. Se consulta la fila insertada para devolver sus valores persistidos;
  la fecha de registro se presenta en ISO 8601 UTC.
- El pool existente tiene `dateStrings: true`, `timezone: 'Z'` y ningún
  `typeCast` personalizado (valor efectivo `true`). mysql2 devuelve DATETIME como
  cadena, no como `Date`. La conversión a ISO sigue la de `expiresAt` en
  autenticación: sustituye el espacio por `T` y añade `Z`. UTC está garantizado
  para este dato por `DEFAULT (UTC_TIMESTAMP(3))`, no por una conversión de zona
  horaria de la cadena. Se conservan los milisegundos cuando están presentes.
- Se conserva la migración sin cambios. La estructura integrada no contiene una
  columna `estado` y esta entrega no la agrega.

## Respuestas de error

| Código | Situación |
| --- | --- |
| `401` | Token ausente, mal formado o sesión no válida según el middleware existente |
| `403` | Usuario autenticado sin rol ASISTENTE |
| `422` | Datos inválidos o campos adicionales; contrato existente `{ message, fields }` |
| `400` | JSON mal formado, mediante el manejador existente |
| `413` | Cuerpo que supera el límite existente de 16 KB |
| `500` | Error interno; mensaje genérico existente sin detalles SQL |

Ejemplo de validación HTTP `422`:

```json
{
  "message": "Revisa los datos del formulario.",
  "fields": {
    "concepto": "Ingresa un concepto de entre 1 y 255 caracteres."
  }
}
```

## Verificación sin MySQL

Desde `backend/` (en PowerShell puede usarse `npm.cmd`):

```sh
npm run check
npm run lint
node --test --test-concurrency=1 test/validation.test.js test/obligaciones.validacion.test.js test/obligaciones.ruta.test.js
```

Resultado local con Node.js 24.22.0 y npm 11.19.1: sintaxis y lint aprobados;
24 pruebas aprobadas (21 nuevas y 3 existentes), sin MySQL ni dependencias nuevas.

Las pruebas de validación ejercitan entradas y límites reales. Las de ruta usan
Supertest y respuestas puntuales de `pool.execute` mediante `node:test`, aprovechando
la inyección ya existente en `crearAplicacion`. Ejecutan los middleware originales
de autenticación y autorización. No abren conexiones ni crean una base en memoria.

Estas pruebas comprueban validaciones, parámetros SQL, normalización, respuestas
HTTP, origen del creador, omisión de fecha de registro en el INSERT y llamadas de
confirmación/reversión y liberación de conexión. No demuestran
persistencia real, ejecución de restricciones ni generación de fechas por MySQL.

## Pruebas que requieren MySQL

No ejecutadas en esta computadora, que no tiene MySQL instalado:

| Comprobación | Estado |
| --- | --- |
| Aplicar/verificar `002_obligaciones.sql` con el migrador existente | PENDIENTE — requiere MySQL real |
| POST con sesión real ASISTENTE y lectura de la fila persistida | PENDIENTE — requiere MySQL real |
| Persistencia exacta de centavos, monto máximo y saldo inicial igual al monto original | PENDIENTE — requiere MySQL real |
| DEFAULT UTC de fecha de registro y persistencia de fecha límite pasada | PENDIENTE — requiere MySQL real |
| Confirmación y rollback reales de la transacción de registro | PENDIENTE — requiere MySQL real |
| Restricciones CHECK, VARCHAR, DECIMAL, DATE y FK del creador | PENDIENTE — requiere MySQL real |
| Rechazo de sesiones vencidas/revocadas, usuarios inactivos y cambios de rol con datos reales | PENDIENTE — requiere MySQL real |
| Suite completa existente `npm test`, que incluye `auth.integration.test.js` | PENDIENTE — requiere MySQL real |

No se ejecuta la suite completa sin MySQL ni se declara aprobada su integración.
