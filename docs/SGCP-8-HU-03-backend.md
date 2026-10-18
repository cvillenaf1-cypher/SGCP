# SGCP-8 · HU-03 · Registrar pagos realizados (backend)

Registra abonos parciales o el pago total de una obligación. Esta entrega cubre
únicamente el backend: no incluye comprobantes, pantallas, funciones de gerente,
infraestructura AWS ni otras historias.

## Migración

La migración `database/migrations/003_abonos.sql` crea `abonos` con referencias a
`obligaciones` y `usuarios`, monto y saldo resultante `DECIMAL(13,2)`, medio de
pago, fecha UTC, registrador, clave idempotente y huella SHA-256 de la solicitud.
Sus restricciones exigen monto positivo, saldo resultante no negativo y un medio
permitido. La clave es única por usuario; el historial no se elimina al registrar
un nuevo pago.

Con la configuración de la base correspondiente en `backend/.env`, desde
`backend/` ejecutar:

```sh
npm run db:migrate
```

El ejecutor aplica las migraciones pendientes en orden. No edites migraciones ya
aplicadas ni borres tablas para recuperarte de un error.

## Contrato para Quinde

`POST /api/obligaciones/{id}/abonos` requiere una sesión vigente y el rol
`ASISTENTE`. Enviar `Authorization: Bearer <token>` y `Content-Type: application/json`.
El identificador es un entero canónico entre `1` y `4294967295`.

```json
{
  "monto": "25.50",
  "medio_pago": "Transferencia bancaria",
  "clave_idempotencia": "abono_4f4982efbd1e43e8a520"
}
```

- `monto`: cadena decimal positiva en soles, hasta dos decimales y máximo
  `99999999999.99`. Se normaliza y calcula con centavos enteros; nunca usar
  números JSON para importes.
- `medio_pago`: exactamente `Efectivo`, `Transferencia bancaria`, `Tarjeta` o
  `Billetera digital`.
- `clave_idempotencia`: generar una clave aleatoria de al menos 16 caracteres
  (máximo 128; letras, números, `_` o `-`) por operación nueva. Reutilizarla sin
  cambios en todos los reintentos de esa misma operación; no generar otra clave
  por reintentar una solicitud cuyo resultado sea incierto.
- No enviar campos adicionales ni valores de servidor como saldo, registrador o
  fecha.

Respuesta de creación, HTTP `201`:

```json
{
  "message": "Abono registrado correctamente.",
  "abono": {
    "id": 123,
    "obligacion_id": 81,
    "monto": "25.50",
    "medio_pago": "Transferencia bancaria",
    "fecha_registro": "2026-10-18T22:13:00.123Z",
    "usuario_registrador_id": 42,
    "saldo_resultante": "95.00"
  }
}
```

Un reintento exitoso con la misma clave, usuario, obligación, monto y medio
devuelve HTTP `200` con el mismo objeto histórico; no descuenta saldo nuevamente.
La misma clave con otros datos devuelve `409`. Obligación inexistente devuelve
`404`; saldo ya pagado, sobrepago o conflicto de bloqueo concurrente devuelven
`409`. Sesión ausente/inválida devuelve `401`, rol distinto de ASISTENTE `403`,
datos inválidos `422` con `{ "message": "...", "fields": {...} }`. Un error no
esperado devuelve `500` con el mensaje genérico de la API.

El servidor bloquea la fila de la obligación y, en una única transacción InnoDB,
inserta el abono y actualiza el saldo. El importe nunca excede el saldo; un fallo
revierte ambas escrituras. La huella SHA-256 se deriva de la obligación, el
monto normalizado y el medio de pago. Las solicitudes concurrentes se serializan
por obligación; la clave única impide duplicados incluso si dos solicitudes
compiten.

## Verificación

Sin MySQL:

```sh
npm run check
npm run lint
node --test --test-concurrency=1 test/abonos.test.js test/obligaciones.*.test.js test/validation.test.js
```

Para las pruebas de persistencia y concurrencia, Cristhian debe disponer de una
instancia MySQL 8.0.16+ y una base independiente con sufijo `_test` (por ejemplo,
`sgcp_test`). Si usa la instancia local ya preparada, el puerto documentado es
`3307`; debe confirmar el puerto disponible. Copiar `backend/.env.test.example`
a `backend/.env.test` y configurar usuario, contraseña y puerto locales con
privilegios sobre esa base. Desde `backend/`, ejecutar:

```sh
node --test --test-concurrency=1 test/abonos.integration.test.js
```

La preparación de la suite aplica las migraciones pendientes únicamente a la
base configurada en `.env.test`; no ejecutar `npm run db:migrate` para este paso,
ya que ese comando utiliza `backend/.env`. La suite crea y limpia únicamente sus
propias filas de prueba. No apunta a la base de desarrollo o producción. Estas
pruebas cubren reintentos concurrentes,
prevención de sobrepago y una misma clave concurrente aplicada a obligaciones
distintas. No se debe instalar MySQL como parte de esta entrega.
