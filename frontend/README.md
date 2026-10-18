# SGCP · Frontend

Interfaz de acceso en React + Vite y CSS. Consulta el [README principal](../README.md)
para instalar dependencias, configurar el entorno y ejecutar ambos servicios.

- `npm run dev`: desarrollo en http://localhost:5173.
- `npm run lint`: revisión estática con Oxlint.
- `npm test`: pruebas de interfaz con Vitest y Testing Library.
- `npm run test:e2e`: Chromium + Express + MySQL real (requiere backend instalado y `.env.test`).
- `npm run build`: compilación de producción en `dist/`.
- `npm run preview`: vista previa local de la compilación.

`VITE_API_URL` configura la URL pública de la API en tiempo de compilación.
Las variables `VITE_*` son públicas; no deben contener credenciales.

Las rutas usan `HashRouter` para conservar compatibilidad con Amplify sin modificar
sus reglas: `/#/login`, `/#/asistente` y `/#/gerente`.

El token se mantiene exclusivamente en memoria. Las respuestas `401` y el vencimiento
local devuelven al login. Cerrar sesión revoca el token en MySQL; si la petición falla
por conectividad, la interfaz lo informa y permite reintentar.

Las restricciones visuales complementan la autorización del backend; no la sustituyen.
