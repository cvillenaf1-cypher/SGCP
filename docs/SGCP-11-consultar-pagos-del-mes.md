# SGCP-11 · HU-06: pagos del mes en el panel principal

La consulta de pagos del GERENTE está integrada en su panel principal (`/#/gerente`).
Se retiraron la tarjeta «Consultar pagos del mes» y su pantalla secundaria redundante.
La antigua dirección ya no tiene una ruta registrada y muestra «Página no encontrada».

El panel conserva la tabla **Pagos del mes**, su selector de mes, los importes,
estados, obligaciones vencidas anteriores y el botón **Ver detalles**.
El **Resumen mensual** (HU-07) está integrado en el panel, entre el selector de mes
y la tabla. Sus tres primeros indicadores siguen ese selector; **Total vencido
acumulado** considera todas las obligaciones con saldo y fecha límite anterior a
hoy en Lima, independientemente del mes seleccionado.

`frontend/src/gerente/resumenMensual.js` calcula los indicadores sobre el mismo
listado autenticado del panel. `pagosDelMes.css` conserva el marco SAPO compartido.
Los detalles de la integración están en [resumen-integrado-gerente.md](resumen-integrado-gerente.md).

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
la ausencia de las tarjetas redundantes, la retirada de las rutas antiguas y los
indicadores integrados. Las pruebas unitarias cubren los cálculos mensuales, el
vencido acumulado y la actualización compartida con el listado.
