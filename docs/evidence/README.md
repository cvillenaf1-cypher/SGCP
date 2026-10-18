# Evidencias SGCP-1

Las capturas de esta carpeta se generan con `npm run test:e2e` desde `frontend/`.
Muestran usuarios sintéticos de prueba, sin correos, contraseñas ni tokens visibles:

- `SGCP-1-login.png`: pantalla de acceso.
- `SGCP-1-asistente.png`: panel de asistente autorizado por Express.
- `SGCP-1-gerente.png`: panel de gerente de solo lectura.

Las pruebas E2E usan MySQL real, credenciales aleatorias por ejecución y eliminan
únicamente sus propios usuarios/sesiones al finalizar. Los reportes temporales,
las trazas y los archivos locales no se versionan.
