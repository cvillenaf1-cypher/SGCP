# Documentación del SGCP

## Arquitectura inicial

- `frontend/`: aplicación React creada con Vite, con estilos CSS.
- `backend/`: API Node.js + Express; configuración mediante dotenv.
- `database/`: espacio para futuros scripts MySQL.
- El navegador consulta `GET /api/health` usando `VITE_API_URL`.
- La API configura CORS con el origen indicado en `FRONTEND_URL`.

## Alcance actual

Pantalla de bienvenida y comprobación de disponibilidad de la API. El endpoint
de salud comprueba que Express responde; no verifica una base de datos.

## Próximas etapas

1. Definir historias de usuario, modelo de datos y contratos de la API.
2. Preparar scripts y conexión MySQL local.
3. Implementar funcionalidades de pagos y sus pruebas según las historias acordadas.
4. Conectar el frontend con AWS Amplify siguiendo el README principal.

Esta preparación no crea recursos en AWS.
