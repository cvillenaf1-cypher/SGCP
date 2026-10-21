# Perfil de referencia progresivo

Base de implementación: `a0c07eb181903a3a6565d63c5b94587aa28f4ed5` de `origin/main`.
Rama: `feature/perfil-referencia`.

## Funcionalidad

La ruta React `/#/configuracion/perfil` presenta **Configuración del perfil**.
El responsable puede guardar un perfil vacío, completar parcialmente el titular,
añadir bancos o suministros antes del titular y editar los datos más adelante.
No se exige ningún dato de referencia para seguir usando los módulos financieros.
Un único perfil corresponde al negocio compartido ya existente en SGCP.

- Titular: empresa (RUC de 11 dígitos) o persona natural (DNI de 8 dígitos), nombre
  y nombre comercial. Cada dato puede quedar vacío. Un documento informado exige
  tipo compatible; no se genera ni consulta un documento automáticamente.
- Bancos: entidad y relación, titular/documento opcionales, alias, marca y últimos
  cuatro dígitos opcionales. Se admiten entidades libres y varias referencias por banco.
- Servicios: tipo y prestadora, titular/documento del recibo, suministro, dirección,
  alias, relación con el negocio y explicación de esa relación. Se admiten varios
  suministros de la misma prestadora y titulares que sean terceros relacionados.
- Se muestran los estados «Sin configurar», «Configuración parcial» y «Configurado».
  Este último solo indica presencia de los datos del titular; no verifica identidad.
- La desactivación de bancos/servicios conserva la fila y su auditoría. Una referencia
  desactivada no se edita; se puede añadir una nueva. No hay borrado físico en la API.

Registrar BCP no atribuye vouchers al negocio. Un recibo a nombre de un tercero no
se califica como fraude. Este módulo no modifica obligaciones, importes, abonos ni
comprobantes; tampoco ejecuta pagos, transferencias, OCR, SUNAT ni comparaciones.

## Arquitectura y permisos

Se reutilizan Express, `mysql2`, sesiones Bearer opacas/Argon2id, el middleware de
roles y el cliente HTTP de React. `shared/perfilReferencia.js` contiene el contrato
puro y las validaciones compartidas; no añade dependencias. Mantener el directorio
`shared/` junto a `backend/` y `frontend/` al empaquetar el proyecto.

| Rol | Perfil | Finanzas |
| --- | --- | --- |
| CONFIGURADOR | Consultar, crear, editar y desactivar referencias | Sin acceso |
| ASISTENTE | Sin acceso a los endpoints ni pantalla de configuración | Permisos actuales |
| GERENTE | Sin acceso a los endpoints ni pantalla de configuración | Solo lectura, sin escritura ni aprobación de pagos |

El permiso `CONFIGURAR_PERFIL` se asigna exclusivamente a CONFIGURADOR en
`backend/src/auth/permisos.js`. Se exige en **todos** los endpoints del módulo,
incluida la consulta, después de autenticar. El rol se lee desde MySQL en cada
petición: cambiarlo o desactivar al usuario invalida su acceso aunque conserve token.
El cliente no puede concederse permisos mediante cuerpo, parámetros o cabeceras.

El alta sigue siendo administrativa mediante `npm run user:create`, con contraseña
introducida de forma oculta por el operador. Crear una cuenta nueva CONFIGURADOR
para el profesor/responsable: la migración no crea cuentas ni cambia roles de
usuarios existentes. No se necesita convertir una cuenta GERENTE en administradora.

## Migración y compatibilidad

Archivo: `database/migrations/006_perfil_referencia.sql`, aplicado por el migrador
existente con checksum y bloqueo MySQL. Requiere MySQL 8.0.16+.

1. Amplía `chk_role_code` para admitir CONFIGURADOR, manteniendo ASISTENTE y GERENTE.
2. Añade CONFIGURADOR con ID 3 al catálogo de roles; no actualiza usuarios/sesiones.
3. Crea `perfil_referencia` (fila única ID 1), `perfil_bancos`, `perfil_servicios` y
   `perfil_auditoria`. Las referencias no dependen de un titular completo.
4. Añade claves foráneas `RESTRICT`, validaciones de formato/enum y marcas UTC.
5. Las huellas SHA-256 de **todos** los campos de una referencia, normalizados con
   NFKC, espacios y minúsculas, tienen índice único solo para referencias activas.
   Cambiar alias, suministro o relación permite referencias legítimas distintas.
   La restricción se aplica también a actualizaciones y peticiones concurrentes.

No hay DDL ni DML sobre tablas financieras. Los documentos anteriores, sus saldos,
cuentas y sesiones siguen siendo compatibles. No se alteran migraciones anteriores.
El perfil se crea explícitamente o junto a la primera escritura; un GET no lo crea.

**Plan de ejecución aprobado para esta entrega:** únicamente `sgcp_test` en
`127.0.0.1:3307`, configurada en `backend/.env.test`. El usuario autorizó expresamente
la migración y las pruebas locales. Estaban pendientes 003, 004, 005 y 006; se aplicaron
con el migrador existente. Se verificaron huellas de las tablas históricas existentes
antes/después y la repetición sin migraciones pendientes.

La base de desarrollo y las bases remotas no se migraron. Para cualquier otra base,
presentar el destino y las migraciones pendientes y obtener autorización independiente.
No ejecutar `npm run db:migrate` sin comprobar primero la configuración efectiva.
MySQL confirma el DDL implícitamente; ante una aplicación parcial, revisar con el
operador y reanudar mediante el migrador, sin borrar tablas ni modificar checksums.
No existe una migración de reversión destructiva: conservar datos si se retira la UI.

## API

Todas las rutas usan el prefijo `/api/perfil-referencia` y requieren CONFIGURADOR.

| Método y sufijo | Operación |
| --- | --- |
| `GET /` | Leer perfil; si no existe: `id: null`, `version: 0` y datos vacíos |
| `POST /` con `{}` | Crear perfil vacío; 201 nuevo, 200 si ya existe |
| `PUT /titular` | Reemplazar datos del titular, admite avances o vaciar datos |
| `POST /bancos`, `POST /servicios` | Añadir referencia; 201 |
| `PUT /bancos/:id`, `PUT /servicios/:id` | Reemplazar datos de una referencia |
| `POST /bancos/:id/desactivar`, `POST /servicios/:id/desactivar` | Desactivación lógica |

Los nombres de los campos están en `shared/perfilReferencia.js`. `PUT` reemplaza
los campos de la entidad, no funciona como PATCH; React envía todos sus campos.
`version` es obligatoria para titular, edición y desactivación. La versión inicial
de un perfil inexistente es 0 y la de una referencia creada es 1. Las versiones
de bancos/servicios son independientes de la versión del titular.

Cada escritura devuelve `{ perfil, message }` con los datos confirmados. Una
transacción protege la escritura y su auditoría; ante fallo de auditoría se revierte
el cambio. El bloqueo de fila y la versión evitan sobrescribir ediciones obsoletas.
Los campos SQL proceden de listas fijas; todos los valores se parametrizan.

- 401: sesión ausente, vencida o revocada.
- 403: rol sin permiso.
- 404: referencia inexistente.
- 409: duplicado exacto, referencia desactivada o versión desactualizada.
- 422: campos desconocidos, formatos inválidos o datos sensibles.
- 500: error genérico; nunca devuelve SQL, parámetros ni cuerpos de entrada.

Ante 409, el formulario conserva el borrador. Cancelar, **Actualizar perfil**,
revisar la referencia y volver a editar. La pantalla bloquea envíos repetidos y
el cierre de sesión mientras guarda. La sesión permanece únicamente en memoria.

## Privacidad y auditoría

Se rechazan campos desconocidos, caracteres de control/invisibles, secuencias de
12 o más dígitos aun separadas por espacios/puntuación, y etiquetas de secretos
como CVV, CVC, PIN, contraseña, Clave SOL, CCI o credenciales. Los textos bancarios
rechazan secuencias de más de cuatro dígitos y textos puramente numéricos: un
DNI/RUC debe ir exclusivamente en su campo; cuatro dígitos de referencia, en el suyo.
Los números no se truncan ni se convierten en una referencia parcial al pegarlos.
Los errores no repiten la entrada y el manejador existente solo registra el código
o clase del fallo, nunca el cuerpo o parámetros SQL.

La auditoría registra usuario, hora UTC, operación, entidad, ID y **nombres de campos
que cambiaron**, no valores antes/después ni documentos. Está en la misma transacción.
No se incorpora un endpoint de modificación o borrado de auditoría.

Decisiones para revisión:

- La detección textual es conservadora: un código de suministro con 12 o más dígitos
  se rechaza para no admitir accidentalmente una tarjeta. Puede dejarse vacío mientras
  se define una regla específica para ese proveedor en otra entrega.
- Un texto libre sin etiquetas no permite distinguir semánticamente cualquier
  contraseña de una descripción. Estas validaciones reducen entradas accidentales;
  no se presentan como un detector universal de secretos.
- El perfil es único por negocio, coherente con el modelo actual; no incorpora multitenencia.
- «Configurado» no implica identidad, titularidad o validez fiscal comprobada.
- Auditoría mínima sin valores: identifica qué campos cambiaron, pero no reconstruye
  valores personales anteriores. Las referencias desactivadas sí conservan sus datos.
- El despliegue futuro debe incluir `shared/` y aplicar la migración autorizada antes
  de habilitar cuentas CONFIGURADOR. En este PR no se despliega ningún servicio.

## Probar localmente

Con Node 24, MySQL local y los archivos de entorno existentes conservados:

1. Instalar dependencias con `npm ci` en `backend/` y `frontend/`.
2. Verificar que `backend/.env.test` apunta a **127.0.0.1:3307 / sgcp_test**, con
   credenciales locales. Obtener autorización antes de cualquier migración.
3. Desde `backend/`, ejecutar `npm run check`, `npm run lint` y `npm test`.
4. Desde `frontend/`, ejecutar `npm run lint`, `npm test`, `npm run build` y
   `npm run test:e2e`. Para el módulo solamente:
   `npm run test:e2e -- e2e/perfil-referencia.spec.js`.
5. Las pruebas E2E levantan API/React en 3001/5174, usan cuentas aleatorias,
   guardan datos sintéticos y eliminan únicamente sus propias filas al terminar.
   La suite de perfil se detiene si ya hay un perfil en `sgcp_test`; no lo reemplaza.
   No ejecutar estas suites simultáneamente sobre la misma base.

Para una prueba manual en otra base local: autorizar primero la migración pendiente,
verificar que `backend/.env` corresponde a esa base local, ejecutar `npm run db:migrate`
y `npm run user:create` eligiendo CONFIGURADOR. Arrancar `npm run dev` en backend y
frontend e ingresar en `http://localhost:5173/#/login`. Se redirige a la configuración.
No hay contraseña de demostración; el operador elige sus credenciales fuera del código.

Recorrido: crear vacío o añadir banco directamente; añadir otro banco con alias
distinto, registrar dos suministros y seleccionar «Tercero relacionado»; guardar un
titular parcial, editar referencias, cerrar sesión y volver a ingresar. Comprobar
que duplicados y números completos se rechazan. GERENTE/ASISTENTE reciben 403 al
intentar los endpoints, incluso mediante solicitudes manuales.

## Evidencias y matriz

Las capturas contienen únicamente datos sintéticos:

- [Perfil vacío](evidence/perfil-referencia-vacio.png)
- [Escritorio](evidence/perfil-referencia-escritorio.png)
- [Móvil](evidence/perfil-referencia-movil.png)

| Caso requerido | Cobertura |
| --- | --- |
| Perfil vacío, persona natural, empresa | Validación, integración MySQL e interfaz |
| Múltiples bancos, dos referencias del mismo banco | Integración, interfaz y E2E |
| Duplicados exactos, incluidos concurrentes y al editar | Restricción MySQL + integración; mensaje en UI/E2E |
| Varios suministros y titular tercero | Integración, interfaz y E2E |
| Edición posterior y persistencia | Integración y nuevo login E2E |
| ASISTENTE/GERENTE sin configuración | Todos los endpoints en integración + rutas React |
| GERENTE sin escritura financiera | Integración y E2E de acceso |
| Históricos intactos | Huellas de tablas antes/después de migración y de ediciones del perfil |
| Rechazo de tarjeta/secretos | Validación de todos los campos, API, UI y navegador |
| Auditoría y rollback | Integración MySQL + fallo inyectado de auditoría |
| Edición obsoleta y desactivación | Integración y desactivación UI/E2E |

## Resultados ejecutados

Entorno: Node 24.21.0, MySQL local `sgcp_test` en `127.0.0.1:3307`, Chromium.

| Comprobación | Resultado |
| --- | --- |
| Backend `npm run check` | Correcto, incluido el contrato compartido |
| Backend `npm run lint` | Correcto |
| Backend `npm test` | 140 pruebas correctas, 0 fallidas/omitidas |
| Frontend `npm run lint` | Sin errores; advertencia preexistente `MascotaSapo` sin uso |
| Frontend `npm test` | 200 pruebas correctas en 10 archivos |
| Frontend `npm run build` | Correcto |
| Frontend `npm run test:e2e` | 25 pruebas correctas, incluida la nueva prueba con API/MySQL reales |
| Oxlint sobre `shared/` | Correcto |
| `git diff --check` | Correcto |

Durante la ejecución se actualizaron expectativas del catálogo de roles y dos
comprobaciones antiguas de E2E: selector exacto del campo de contraseña y verificación
real del bloqueo de escritura de GERENTE, en lugar de depender de un texto retirado.
No quedaron pruebas pendientes ni fallidas en la ejecución final. No se ejecutaron
pruebas, migraciones ni despliegues contra producción.
