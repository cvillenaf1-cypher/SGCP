# Sistema de Gestión y Control de Pagos (SGCP)

Proyecto universitario con frontend React + Vite, estilos CSS, API Node.js + Express
y persistencia MySQL. SGCP registra obligaciones y operaciones realizadas fuera
del sistema; no realiza cobros ni transferencias.

**Entrega actual: SGCP-1, base técnica de acceso por roles.** Incluye login,
sesiones revocables y paneles iniciales de asistente y gerente. Las funcionalidades
financieras SGCP-6 a SGCP-13 se incorporarán mediante sus propias ramas y PR.

## Requisitos

- Git.
- Node.js **24.x** y npm (incluido con Node.js).
- MySQL **8.0.16 o posterior**, con InnoDB. Verificado con MySQL 8.0.44.

Comprueba las herramientas con `git --version`, `node --version` y `npm --version`.

## Estructura

```text
SGCP/
├── frontend/          # React, rutas protegidas y pruebas de interfaz/E2E
├── backend/           # API, autenticación, scripts y pruebas MySQL
├── database/          # Migraciones SQL versionadas
├── docs/              # Arquitectura, criterios y evidencias
├── .gitignore
├── amplify.yml        # Compilación futura en AWS Amplify
└── README.md
```

## Inicio local

Si aún no tienes el repositorio:

```sh
git clone https://github.com/cvillenaf1-cypher/SGCP.git
cd SGCP
```

Ejecuta cada servicio en una terminal diferente. Los comandos siguientes parten
de la raíz `SGCP/`. Se incluyen los archivos de bloqueo para instalaciones reproducibles.

### 0. MySQL

Usa una base local `sgcp` y un usuario con permisos sobre ella. Consulta
[database/README.md](database/README.md) para preparar una instalación nueva.
Si ya tienes las bases y los archivos `.env`, **consérvalos**: no vuelvas a ejecutar
una inicialización del servidor ni sobrescribas sus credenciales.

En el entorno local de trabajo se conservó una instancia aislada en
`127.0.0.1:3307`, con bases `sgcp` y `sgcp_test`. Sus datos y herramientas están
en `.local/`, completamente excluido de Git. Si esa instancia está detenida,
se puede iniciar desde la raíz con `& .\.local\start-mysql.ps1`; no ejecutar de
nuevo `provision-mysql.mjs`. Estos archivos locales no acompañan al repositorio.

### 1. Backend

```sh
cd backend
npm ci
```

Crea `.env` solo si aún no existe. En PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

En macOS/Linux: `test -f .env || cp .env.example .env`.
Configura `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` con tus valores
locales. La API requiere una conexión MySQL válida.

```sh
npm run db:migrate
npm run user:create
npm run user:create
npm run dev
```

Ejecuta `user:create` una vez para `ASISTENTE` y otra para `GERENTE`. Solicita nombre,
correo, rol y una contraseña de 12 a 128 caracteres con entrada oculta y confirmación.
No hay usuarios ni contraseñas predeterminados. Un correo existente produce un error
sin sobrescribir al usuario. Si ya creaste tus cuentas, omite estos dos comandos.

API: **http://localhost:3000**. Para iniciar sin recarga automática: `npm start`.
El archivo `.env` se carga desde `backend/`, independientemente del directorio de ejecución.

### 2. Frontend

En la segunda terminal, desde `SGCP/`:

```sh
cd frontend
npm ci
```

Copia `.env.example` a `.env` con el mismo comando de tu sistema operativo y ejecuta:

```sh
npm run dev
```

Interfaz: **http://localhost:5173/#/login**. Ingresa con una cuenta creada localmente.
El rol determina el panel y el backend verifica cada petición protegida.
Al recargar la página se debe iniciar sesión otra vez: el token permanece solo en
memoria. El puerto es fijo para coincidir con CORS; si está ocupado, libera el puerto.

### Variables de entorno

| Archivo | Variable | Valor de ejemplo / propósito |
| --- | --- | --- |
| `backend/.env` | `NODE_ENV` | `development` |
| `backend/.env` | `PORT` | `3000` |
| `backend/.env` | `FRONTEND_URL` | `http://localhost:5173`, origen permitido por CORS, sin barra final |
| `backend/.env` | `SESSION_TTL_MINUTES` | `60`; duración fija, entre 1 y 1440 minutos |
| `backend/.env` | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión MySQL real, contraseña obligatoria |
| `backend/.env.test` | `DB_*` | Conexión independiente de pruebas, nombre terminado en `_test` |
| `frontend/.env` | `VITE_API_URL` | `http://localhost:3000`, URL base pública del backend |

Los archivos `.env`, `.env.test` y `.local/` se excluyen de Git; solo las plantillas
`.env.example` y `.env.test.example` se incluyen.
No colocar contraseñas en variables `VITE_*`: Vite las incorpora al JavaScript público.
Reinicia los servicios después de modificar variables; para producción, recompila el frontend.

## Comprobaciones

Con el backend iniciado, en PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Respuesta HTTP `200`:

```json
{
  "status": "ok",
  "service": "SGCP API",
  "message": "El servidor funciona correctamente."
}
```

La ruta verifica la disponibilidad de Express. El arranque de la API comprueba la
conexión y el acceso a la tabla `roles`; `/api/health` no es una comprobación continua de MySQL.

### Pruebas del backend

Prepara una base MySQL **independiente** `sgcp_test` con un usuario limitado a esa base
y configura `backend/.env.test` a partir de `.env.test.example`. Las pruebas rechazan
un nombre sin sufijo `_test` o igual al de la base de desarrollo. No ejecutan `DROP`,
`TRUNCATE` ni limpieza global; solo retiran los usuarios y sesiones que crearon.

Desde `backend/`:

```sh
npm run check
npm run lint
npm test
```

Las migraciones de la base de pruebas se aplican automáticamente. Si falta MySQL o
la configuración, la suite falla explícitamente; no sustituye la base por datos en memoria.

### Pruebas del frontend

Desde `frontend/`:

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` verifica componentes con respuestas HTTP simuladas. `test:e2e` ejecuta
el navegador contra la API y MySQL reales usando `.env.test`, con usuarios aleatorios
temporales. Arranca y detiene sus propios servidores en **3001 y 5174**: deben estar libres.
Instala también las dependencias de `backend/` antes de ejecutar E2E.

La compilación se genera en `frontend/dist/` y la vista previa usa normalmente
http://localhost:4173 con `npm run preview`. Para probar la API desde esa vista previa, cambia
`FRONTEND_URL` a `http://localhost:4173` y reinicia el backend. Restáuralo a
`http://localhost:5173` para continuar en desarrollo.

La matriz de criterios y las evidencias están en [docs/SGCP-1-acceso-roles.md](docs/SGCP-1-acceso-roles.md).

## Despliegue futuro en AWS Amplify

Se proporciona `amplify.yml` en la raíz para un repositorio con varias aplicaciones:

1. Cuando se acuerde el despliegue, conectar el repositorio y seleccionar la rama correspondiente.
2. Indicar `frontend` como raíz de la aplicación y verificar que
   `AMPLIFY_MONOREPO_APP_ROOT=frontend` esté configurado en Amplify.
3. Usar el archivo `amplify.yml`: Node.js 24, `npm ci`, `npm run build` y artefactos `dist/`.
4. Configurar `VITE_API_URL` con la URL **HTTPS pública** del backend antes de compilar.
5. Configurar `FRONTEND_URL` en el backend con el origen HTTPS asignado al frontend.

El backend requerirá un despliegue independiente; Amplify aloja el frontend estático.
Se usa `HashRouter` (`/#/login`, `/#/asistente`, `/#/gerente`), por lo que no se necesitan
reescrituras SPA adicionales. `amplify.yml` conserva la raíz `frontend` y salida `dist`.
El acceso completo requiere una API HTTPS con MySQL disponible; el frontend publicado
no puede conectarse al `localhost` de esta máquina. El backend de producción exige
`FRONTEND_URL` HTTPS y debe publicarse mediante HTTPS.

No se han creado servidores, bases de datos ni otros recursos en AWS.

## Trabajo en equipo

Antes de publicar, ejecutar `git fetch origin`, comprobar `git status`, la rama
actual y el historial respecto a su rama remota. Si hay cambios de otros
integrantes, coordinar su integración antes de publicar. No usar `force push`.

El alcance inicial y los siguientes pasos están en [docs/README.md](docs/README.md).
