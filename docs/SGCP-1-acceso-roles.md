# SGCP-1 · Base técnica de acceso y roles

Rama: `feature/SGCP-1-acceso-roles`.

Esta es la propuesta técnica de acceso aceptada para el MVP bajo la épica SGCP-1.
Los identificadores T1–T10 de esta matriz son referencias de documentación local,
no nuevas historias ni subtareas inventadas de Jira.

## Alcance entregado

Migración MySQL de acceso, creación local de usuarios, login, identificación, logout,
sesiones revocables, autorización backend y rutas frontend protegidas por rol. Se
conservan `/api/health`, la estructura inicial y `amplify.yml`.

## Matriz de verificación

| Ref. | Criterio verificable | Evidencia automatizada / manual |
| --- | --- | --- |
| T1 | Conexión a MySQL real; migración repetible conserva datos | `npm run db:migrate` dos veces; integración «migraciones repetibles» |
| T2 | Roles ASISTENTE y GERENTE; alta sin contraseñas predeterminadas ni sobrescritura | Migración, `npm run user:create`, pruebas de alta, correo único y roles |
| T3 | Contraseña Argon2id; respuestas sin contraseña ni hash | Integración «solo guarda el hash del token; /me no expone secretos» |
| T4 | Login válido; rechazo genérico de cuenta inexistente, inactiva o contraseña errónea | Integración «mismo error», pruebas de validación y formulario |
| T5 | `/me` devuelve identificación y rol del usuario autenticado | Integración de `/me`; prueba de token ausente/alterado |
| T6 | Sesiones caducan, persisten en MySQL y se revocan al salir | Integración de expiración, reinicio de Express y logout; E2E de revocación |
| T7 | Backend devuelve 401/403 y no confía en rol enviado por cliente | Integración de ambos paneles, rol inyectado y cambio de rol en MySQL |
| T8 | Frontend protege rutas, muestra rol y cierra sesión | 11 pruebas de interfaz y 5 recorridos en Chromium |
| T9 | Secretos en entorno local; configuración validada y CORS explícito | Pruebas de configuración/CORS; inspección de `.gitignore` e índice antes del commit |
| T10 | Pruebas, lint, check, build e instrucciones reproducibles | Comandos del README y resultados siguientes |

## API

| Método y ruta | Acceso | Respuesta principal |
| --- | --- | --- |
| `GET /api/health` | Público | `200`, estado de Express |
| `POST /api/auth/login` | Público, limitado por IP | `200`: `token`, `expiresAt`, `user`; `401` credenciales; `422` validación; `429` exceso de intentos |
| `GET /api/auth/me` | Sesión vigente | `200`: `user` con `id`, `name`, `email`, `role` |
| `POST /api/auth/logout` | Sesión vigente | `204`; revoca la sesión actual |
| `GET /api/panel/asistente` | ASISTENTE | `200` mensaje del panel; `403` para GERENTE |
| `GET /api/panel/gerente` | GERENTE | `200` mensaje del panel; `403` para ASISTENTE |

Login recibe exclusivamente `email` y `password`. Las peticiones protegidas llevan
`Authorization: Bearer <token>`. Los paneles son puntos de entrada de acceso, no
implementaciones anticipadas de los módulos económicos. Las próximas rutas deberán
aplicar `autenticar(conexiones)` y `autorizar(...)` según la historia.

## Resultados de esta entrega

Entorno: Windows, Node.js 24.21.0, MySQL 8.0.44, Chromium de Playwright.

- Migración aplicada sobre la base local existente; segunda ejecución sin cambios.
- Backend: **17 pruebas correctas**, con integración MySQL real; lint y check correctos.
- Frontend: **11 pruebas correctas** con Testing Library; lint y build correctos.
- E2E: **5 pruebas correctas** con Chromium, Express y MySQL real.
- Se revisaron las capturas de [evidencia](evidence/README.md).
- Las pruebas no borran bases, no vacían tablas y no modifican usuarios existentes.
- Los servidores E2E se detienen al terminar; la instancia local MySQL se conserva.

## Demostración local

1. Verificar que MySQL está activo y que `backend/.env` conserva su configuración.
2. Desde `backend/`: `npm run db:migrate`. Si no existen cuentas de aplicación,
   ejecutar `npm run user:create` para cada rol con contraseñas elegidas localmente.
3. Iniciar `npm run dev` en backend y frontend, en terminales diferentes.
4. Abrir `http://localhost:5173/#/login`. Intentar enviar campos vacíos.
5. Ingresar como asistente y comprobar su panel. Cambiar el fragmento a `#/gerente`:
   debe aparecer «Acceso no permitido».
6. Cerrar sesión, ingresar como gerente y comprobar «Solo lectura».
7. Recargar: debe pedir login, porque no se persiste el token en el navegador.
8. Para verificar revocación y expiración sin exponer un token en capturas, ejecutar
   las pruebas automatizadas del backend y E2E.

## Límites y siguiente entrega

- Las cuentas de aplicación se crean localmente; las cuentas de las pruebas son
  temporales y se retiran al terminar. No hay credenciales de demostración públicas.
- No se ha desplegado la API ni MySQL. El frontend de Amplify necesitará su URL HTTPS
  cuando se autorice el alojamiento del backend.
- SGCP-6 a SGCP-13 quedan pendientes de sus propias ramas y criterios.
- Tras revisar y fusionar este PR, la siguiente rama será
  `feature/SGCP-6-registro-obligaciones`. No se fusiona ni se inicia automáticamente.
