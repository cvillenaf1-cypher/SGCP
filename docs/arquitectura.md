# Arquitectura SGCP

## Implementado en SGCP-1

- React + Vite + CSS, `HashRouter`, contexto de sesión en memoria y cliente HTTP común.
- Express separado en aplicación (`src/app.js`) y arranque (`src/index.js`).
- Configuración validada mediante dotenv, pool `mysql2/promise`, migraciones versionadas.
- Autenticación mediante token opaco aleatorio de 256 bits. La API devuelve el token
  solo al ingresar; MySQL conserva su SHA-256. Transporte mediante `Authorization: Bearer`.
- Contraseñas Argon2id: 64 MiB de memoria, 3 iteraciones y paralelismo 1, con salt aleatorio.
- Sesión de duración fija configurable (60 minutos por defecto), revocable mediante logout.
- Autorización consulta el rol y la condición activa del usuario en MySQL en cada petición.
- El navegador no guarda el token en cookies, localStorage ni sessionStorage. Recargar
  requiere otro login. Cerrar la pestaña elimina la copia del navegador; la sesión
  del servidor caduca por tiempo. El botón de logout sí la revoca inmediatamente.
- CORS con origen explícito, respuestas API `no-store`, Helmet y limitación de intentos
  fallidos por IP (10 cada 15 minutos). El contador reside en el proceso Express; reiniciar
  el proceso lo reinicia. Un despliegue con varias réplicas requerirá un almacén compartido.
- No hay registro público, gestión de usuarios por interfaz ni recuperación de contraseña
  en esta entrega. El alta se hace mediante CLI local con credenciales del operador.

El token en cabecera y `credentials: omit` evitan depender de cookies entre dominios.
En producción el navegador y la API deben comunicarse por HTTPS. La configuración de
un proxy confiable se decidirá con el despliegue, sin habilitar confianza indiscriminada.

## Modelo actual

```text
roles (id, codigo)
  └── usuarios (id, rol_id, nombre, email UNIQUE, password_hash, activo, creado_en)
        └── sesiones (id, usuario_id, token_hash UNIQUE, creado_en, vence_en, revocado_en)
schema_migrations (name, checksum, applied_at)
```

Las marcas temporales se generan con `UTC_TIMESTAMP(3)`. Las fechas de sesión de la
API se serializan como ISO 8601 UTC. Los errores HTTP no contienen hashes, SQL ni credenciales.

## Modelo financiero acordado para próximas ramas

| Entidad | Datos principales |
| --- | --- |
| Obligación | Concepto, beneficiario, monto original, saldo, fecha límite, creador y fecha de registro |
| Abono | Obligación, importe, medio, registrador, fecha, clave de idempotencia y huella de solicitud |
| Medio de pago | Efectivo, transferencia bancaria, tarjeta o billetera digital |
| Comprobante | Abono único, MIME, tamaño y contenido `MEDIUMBLOB` opcional |

- Montos `DECIMAL(13,2)`, API con cadenas decimales y cálculos exactos en centavos.
- Obligación y sus abonos protegidos mediante transacción, bloqueo de fila e idempotencia.
- Un fallo no debe guardar un abono sin actualizar saldo ni descontar saldo sin abono.
- El comprobante opcional se guardará dentro de la transacción: JPG/PNG, hasta 5 MB,
  validación de contenido en backend y recuperación por endpoint autorizado.
- Estado de pago independiente de vencimiento: un compromiso puede estar parcialmente
  pagado y vencido. Fecha calendario del negocio: `America/Lima`.
- El período mensual usa **fecha límite**. Total abonado incluye todos los abonos de
  esas obligaciones aunque se registraran fuera del período.
- Las alertas son globales, incluyen meses anteriores y no se filtran por el mes del panel.
- Un negocio, información compartida por asistentes, trazabilidad por usuario. El gerente
  tendrá permisos de lectura de módulos financieros y ningún permiso de escritura.

## Integración y despliegue

La rama funcional se publica y se revisa antes de fusionarse en `main`. La conexión
existente de Amplify con `main` se conserva. `amplify.yml` compila solo `frontend/`
y publica `dist/`. El backend y MySQL requieren su propio alojamiento; esta entrega
no crea recursos AWS ni publica la base local.
