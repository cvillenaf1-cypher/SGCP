# Base de datos · MySQL

## Requisitos y migración actual

MySQL 8.0.16+ con InnoDB y `utf8mb4`. Se verificó la entrega con MySQL 8.0.44.

- `migrations/001_access.sql`: roles, usuarios y sesiones.
- `schema_migrations`: creada por el ejecutor, registra archivo, checksum y fecha UTC.

Desde `backend/`, `npm run db:migrate` aplica únicamente las migraciones pendientes.
La ejecución usa un bloqueo MySQL por base de datos para evitar dos migradores
simultáneos. Los checksums normalizan CRLF/LF y detectan modificaciones de una
migración ya aplicada. Las nuevas modificaciones de esquema deben ir en otro archivo.

MySQL confirma el DDL implícitamente: no se promete rollback transaccional del esquema.
La migración inicial usa creación condicional y no sobrescribe usuarios. Tras un fallo,
revisar el error y ejecutar de nuevo; no borrar tablas para recuperar una migración.

## Instalación nueva (solo si aún no tienes bases locales)

Con una cuenta administradora local, crea `sgcp` y `sgcp_test` usando MySQL Workbench
o el cliente de MySQL. Ejemplo SQL; sustituye los marcadores de contraseña únicamente
en tu entorno local y no versiones el archivo resultante:

```sql
CREATE DATABASE IF NOT EXISTS sgcp CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS sgcp_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'sgcp_user'@'localhost' IDENTIFIED BY '<CONTRASEÑA_LOCAL_ELEGIDA>';
CREATE USER 'sgcp_test_user'@'localhost' IDENTIFIED BY '<OTRA_CONTRASEÑA_LOCAL>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON sgcp.* TO 'sgcp_user'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON sgcp_test.* TO 'sgcp_test_user'@'localhost';
```

Si esos usuarios ya existen, utiliza sus credenciales y permisos; no los reemplaces.
Configura `backend/.env` para `sgcp` y `backend/.env.test` para `sgcp_test`.
En despliegue se recomienda separar el usuario de migraciones del usuario de ejecución;
la API necesita permisos de lectura/escritura, no privilegios globales ni administración.

## Usuarios de la aplicación

`npm run user:create` crea una cuenta de aplicación mediante consultas parametrizadas,
hash Argon2id y confirmación de contraseña con entrada oculta. Los roles se insertan
en la migración; no hay semillas con contraseñas públicas. `usuarios` pertenece a SGCP
y es independiente de los usuarios con los que el proceso conecta a MySQL.

## Conservación y pruebas

La instancia local ya preparada usa el puerto 3307 y conserva sus datos en `.local/`.
No reinicializar ese directorio. Los archivos de datos, certificados y credenciales
no deben entrar al repositorio.

Las pruebas usan la base `_test`, generan identidades aleatorias y eliminan solo sus
propias filas al terminar. No borran bases ni vacían tablas. Si se interrumpe abruptamente
una prueba pueden quedar usuarios sintéticos; una ejecución posterior no elimina datos
ajenos para ocultar esa situación.

Las tablas de obligaciones, abonos y comprobantes se crearán en sus entregas. El diseño
acordado se documenta en [docs/arquitectura.md](../docs/arquitectura.md).
