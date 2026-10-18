# Sistema de Gestión y Control de Pagos (SGCP)

Proyecto universitario con frontend React + Vite, estilos CSS y una API Node.js +
Express. MySQL será la base de datos en una próxima etapa.

## Requisitos

- Git.
- Node.js **24.x** y npm (incluido con Node.js).
- MySQL no es necesario para esta versión inicial.

Comprueba las herramientas con `git --version`, `node --version` y `npm --version`.

## Estructura

```text
SGCP/
├── frontend/          # React + Vite + CSS
├── backend/           # API Express
├── database/          # Futuros scripts MySQL
├── docs/              # Documentación del proyecto
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

### 1. Backend

```sh
cd backend
npm ci
```

Copia `.env.example` a `.env`. En PowerShell:

```powershell
Copy-Item .env.example .env
```

En macOS/Linux: `cp .env.example .env`. Si ya tienes `.env`, conserva tus valores.
Los valores predeterminados permiten arrancar sin credenciales de base de datos.

```sh
npm run dev
```

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

Interfaz: **http://localhost:5173**. Muestra el título del proyecto y un botón
**Comprobar conexión** que consulta la API. El puerto es fijo para que coincida
con el origen CORS; si está ocupado, libera el puerto antes de arrancar.

### Variables de entorno

| Archivo | Variable | Valor de ejemplo / propósito |
| --- | --- | --- |
| `backend/.env` | `NODE_ENV` | `development` |
| `backend/.env` | `PORT` | `3000` |
| `backend/.env` | `FRONTEND_URL` | `http://localhost:5173`, origen permitido por CORS, sin barra final |
| `backend/.env` | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Reservadas para MySQL; aún no se utilizan |
| `frontend/.env` | `VITE_API_URL` | `http://localhost:3000`, URL base pública del backend |

Los archivos `.env` se excluyen de Git; las plantillas `.env.example` sí se incluyen.
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

La ruta verifica la disponibilidad de la API, sin conexión MySQL.

Desde `frontend/`:

```sh
npm run lint
npm run build
npm run preview
```

La compilación se genera en `frontend/dist/` y la vista previa usa normalmente
http://localhost:4173. Para probar la API desde esa vista previa, cambia
`FRONTEND_URL` a `http://localhost:4173` y reinicia el backend. Restáuralo a
`http://localhost:5173` para continuar en desarrollo.

Desde `backend/`, `npm run check` comprueba la sintaxis del servidor.

## Despliegue futuro en AWS Amplify

Se proporciona `amplify.yml` en la raíz para un repositorio con varias aplicaciones:

1. Cuando se acuerde el despliegue, conectar el repositorio y seleccionar la rama correspondiente.
2. Indicar `frontend` como raíz de la aplicación y verificar que
   `AMPLIFY_MONOREPO_APP_ROOT=frontend` esté configurado en Amplify.
3. Usar el archivo `amplify.yml`: Node.js 24, `npm ci`, `npm run build` y artefactos `dist/`.
4. Configurar `VITE_API_URL` con la URL **HTTPS pública** del backend antes de compilar.
5. Configurar `FRONTEND_URL` en el backend con el origen HTTPS asignado al frontend.

El backend requerirá un despliegue independiente; Amplify alojará el frontend
estático. Si se añaden rutas del lado del cliente, configurar la reescritura SPA
hacia `/index.html`. Esta versión todavía no usa un enrutador.

No se han creado servidores, bases de datos ni otros recursos en AWS.

## Trabajo en equipo

Antes de publicar, ejecutar `git fetch origin`, comprobar `git status`, la rama
actual y el historial respecto a su rama remota. Si hay cambios de otros
integrantes, coordinar su integración antes de publicar. No usar `force push`.

El alcance inicial y los siguientes pasos están en [docs/README.md](docs/README.md).
