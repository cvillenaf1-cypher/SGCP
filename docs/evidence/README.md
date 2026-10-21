# Evidencias SGCP-1

Las capturas de esta carpeta se generan con `npm run test:e2e` desde `frontend/`.
Muestran usuarios sintéticos de prueba, sin correos, contraseñas ni tokens visibles:

- `SGCP-1-login.png`: pantalla de acceso.
- `SGCP-1-asistente.png`: panel de asistente autorizado por Express.
- `SGCP-1-gerente.png`: panel de gerente de solo lectura.

Las pruebas E2E usan MySQL real, credenciales aleatorias por ejecución y eliminan
únicamente sus propios usuarios/sesiones al finalizar. Los reportes temporales,
las trazas y los archivos locales no se versionan.

## Perfil de referencia

`npm run test:e2e -- e2e/perfil-referencia.spec.js` genera capturas del módulo con
API y MySQL locales reales, usando exclusivamente datos sintéticos:

- `perfil-referencia-vacio.png`: perfil y titular todavía sin configurar.
- `perfil-referencia-escritorio.png`: titular parcial, dos referencias BCP y dos
  suministros a nombre de un tercero relacionado.
- `perfil-referencia-movil.png`: el mismo perfil en 390 px, sin desbordamiento horizontal.
