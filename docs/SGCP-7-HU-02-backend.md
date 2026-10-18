# SGCP-7 · HU-02 · Consultar pagos pendientes (backend)

Rama: `funcionalidad/SGCP-7-consultar-pagos-pendientes`.

Implementa listado y detalle de obligaciones para ASISTENTE. Reutiliza sesiones,
autorización, manejo de errores, pool y tabla de obligaciones existentes. El
negocio es único y sus asistentes comparten la información: ninguna consulta
limita los resultados por `usuario_creador_id`.

## Rutas

Ambas requieren `Authorization: Bearer <token>` de la autenticación existente.

| Método y ruta | Respuesta |
| --- | --- |
| `GET /api/obligaciones` | `200`, `{ "obligaciones": [...] }` |
| `GET /api/obligaciones?filtro=parcial` | `200`, listado filtrado |
| `GET /api/obligaciones/:id` | `200`, `{ "obligacion": {...} }` |

El listado sin filtro incluye también registros pagados. Ordena por fecha de
registro descendente y, en caso de empate, identificador descendente. Sin
resultados devuelve `200` con `{ "obligaciones": [] }`.

El identificador debe ser un entero canónico entre `1` y `4294967295`, rango de
la clave INT UNSIGNED. No admite ceros iniciales, exponentes ni decimales.

El detalle de una obligación inexistente responde `404`:

```json
{ "message": "Obligación no encontrada." }
```

## Filtros del listado

No había una convención previa de filtros en el backend. Se usa únicamente el
parámetro opcional `filtro`, en minúscula y con un solo valor:

| Valor | Condición |
| --- | --- |
| `pendiente` | Saldo igual al monto original |
| `parcial` | Saldo mayor que cero y menor que el monto original |
| `pagado` | Saldo igual a cero |
| `vencido` | Fecha límite anterior al día actual en Lima y saldo mayor que cero |

Valores desconocidos, vacíos, repetidos y parámetros adicionales se rechazan con
`422`, siguiendo el contrato `{ message, fields }`. No se agregan otros filtros.

## Datos devueltos

Cada registro contiene los campos de la obligación y los derivados
`estado_economico` y `vencida`. Ejemplo ilustrativo de detalle, calculado para
el día de negocio `2026-10-18`:

```json
{
  "obligacion": {
    "id": 81,
    "concepto": "Servicio de limpieza",
    "beneficiario": "Proveedor de limpieza",
    "monto_original": "120.50",
    "saldo_pendiente": "20.50",
    "fecha_limite": "2020-01-15",
    "fecha_registro": "2026-10-17T15:00:00.123Z",
    "usuario_creador_id": 99,
    "estado_economico": "PARCIAL",
    "vencida": true
  }
}
```

El listado devuelve esos mismos objetos dentro de `obligaciones`.

## Estado económico y vencimiento

Se deriva el estado sin agregar columnas ni actualizar filas:

- `PENDIENTE`: saldo igual al monto original.
- `PARCIAL`: saldo mayor que cero y menor que el monto original.
- `PAGADO`: saldo cero.

Los importes DECIMAL permanecen como cadenas en JSON. Las comparaciones en
JavaScript usan centavos `BigInt`, sin conversiones monetarias de punto flotante.
Los predicados SQL comparan directamente columnas DECIMAL.

`vencida` es independiente: exige `fecha_limite < fechaActualNegocio` y saldo
positivo. Una obligación parcial puede estar vencida; una pagada nunca lo está.
La fecha límite de hoy no está vencida.

La fecha actual del negocio se obtiene mediante `Intl.DateTimeFormat` con zona
explícita `America/Lima`, una vez por consulta. No depende de la zona local del
servidor ni de tablas de zonas horarias de MySQL. La fecha límite se conserva
como fecha calendario. La fecha de registro se serializa en ISO UTC según la
convención de HU-01 y el pool existente (`dateStrings: true`).

## Autorización y SQL

Se reutilizan `requerirSesion` y `autorizar(ROLES.ASISTENTE)`:

- `401`: token ausente, inválido o sesión no vigente.
- `403`: usuario autenticado sin rol ASISTENTE.
- `422`: filtro o identificador inválido, con `message` y `fields`.
- `500`: error inesperado, con el mensaje genérico existente.

Las consultas GET ejecutan únicamente SELECT mediante `conexiones.execute`.
Los filtros eligen predicados constantes de una lista permitida; nunca insertan
texto del cliente en SQL. La fecha del filtro vencido y el identificador del
detalle usan placeholders `?` y parámetros separados. No se crean transacciones,
abonos ni escrituras para consultar o calcular estados.

## Compatibilidad con HU-01

Se ajusta únicamente su prueba que antes exigía la ausencia del listado: se
retira la expectativa GET/404 y se conserva la comprobación POST de abonos/404,
renombrando la prueba para describirla. El POST de registro, sus validaciones y
su servicio no se modifican.

## Pruebas sin MySQL

Desde `backend/`, usando `npm.cmd` en PowerShell si corresponde:

```sh
npm run check
npm run lint
node --test --test-concurrency=1 test/validation.test.js test/obligaciones.*.test.js
```

Verificación local: 49 pruebas aprobadas (25 nuevas de HU-02 y 24 existentes).
Sintaxis, lint y `git diff --check` aprobados, sin MySQL ni dependencias nuevas.

Las pruebas usan `node:test`, Supertest y respuestas puntuales del pool
inyectado, siguiendo HU-01. No crean una base en memoria ni abren conexiones
MySQL. Cubren listados, detalles, filtros, permisos, lecturas compartidas,
parámetros SQL, ausencia de escrituras, centavos exactos y cambios de día en Lima.
No se ejecuta `npm test` completo: incluye hooks de integración con MySQL real.

## Pruebas pendientes

| Comprobación | Estado |
| --- | --- |
| Listado y detalle con datos persistidos y sesiones reales | PENDIENTE — requiere MySQL real |
| Predicados de los cuatro filtros y orden de resultados en MySQL | PENDIENTE — requiere MySQL real |
| DECIMAL, DATE y DATETIME devueltos por consultas reales | PENDIENTE — requiere MySQL real |
| Acceso compartido entre asistentes autenticados distintos | PENDIENTE — requiere MySQL real |
| Verificar que GET conserva los registros de la base sin cambios | PENDIENTE — requiere MySQL real |
| Suite existente de autenticación e integración | PENDIENTE — requiere MySQL real |

No se modifica frontend, esquema, autenticación, funcionalidades del gerente,
AWS, Amplify ni Jira. No se implementan otras historias ni se agregan dependencias.
