# SGCP-11 · HU-06: pagos del mes en el panel principal

La consulta de pagos del GERENTE está integrada en su panel principal (`/#/gerente`).
Se retiraron la tarjeta «Consultar pagos del mes» y su pantalla secundaria redundante.
La antigua dirección ya no tiene una ruta registrada y muestra «Página no encontrada».

El panel conserva la tabla **Pagos del mes**, su selector de mes, los importes,
estados, obligaciones vencidas anteriores y el botón **Ver detalles**.
El módulo **Visualizar resumen mensual de pagos** (HU-07) sigue disponible desde
el panel con sus propios controles de período e indicadores.

`frontend/src/gerente/pagosDelMes.js`, `servicioPagos.js` y los estilos compartidos
de `pagosDelMes.css` siguen siendo utilizados por HU-07 y el marco SAPO.

## Verificación del frontend

Desde `frontend/`:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e -- --config=playwright.inicio.config.js
```

Las pruebas de navegador de esta configuración simulan las respuestas HTTP y no
requieren MySQL. Comprueban el panel de ambos roles, sus detalles e historial,
la ausencia de la tarjeta redundante, la retirada de la ruta antigua y la navegación
al resumen mensual. Las pruebas unitarias conservan la cobertura de las utilidades
y del servicio compartidos con HU-07.
