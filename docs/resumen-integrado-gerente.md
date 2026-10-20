# HU-07: resumen mensual integrado en el panel del GERENTE

El panel `/#/gerente` presenta, en orden:

1. **Panel de gerente**.
2. Selector de mes existente y **Volver al mes actual**.
3. **Resumen mensual** con sus cuatro tarjetas SAPO.
4. **Pagos del mes**, sus detalles, historial y comprobantes.

Se retiraron el enlace **Visualizar resumen mensual de pagos** y la pantalla
`/gerente/resumen-mensual`. Una visita a la antigua ruta muestra **Página no
encontrada**. No se añade un selector de año: el panel utiliza el año actual de Lima.

## Cálculos y datos

- **Total comprometido:** montos originales de las obligaciones con fecha límite
  en el mes seleccionado.
- **Total abonado:** monto original menos saldo de esas obligaciones. Incluye los
  abonos registrados en cualquier mes, según los saldos auténticos del backend.
- **Total pendiente:** saldos de las obligaciones del mes seleccionado.
- **Total vencido acumulado:** saldos mayores que cero de todas las obligaciones
  con fecha límite anterior a hoy en `America/Lima`, sin filtro por mes ni año.
  Incluye parcialmente pagadas y excluye pagadas, las que vencen hoy y las futuras.
  La tarjeta muestra el número de obligaciones vencidas con saldo; con deudas
  pendientes usa un acento rojo y texto descriptivo, sin otro aviso ni listado.

Se cuentan identificadores únicos y se suman céntimos con `BigInt`. Las fechas
calendario se comparan como `AAAA-MM-DD`, sin convertirlas a medianoche UTC.
Los importes se presentan en soles con dos decimales.

El resumen recibe el listado completo de `PagosInicio`; no consulta endpoints ni
concatena las filas mensuales con las arrastradas. El filtro de la tabla no limita
el cálculo del vencido acumulado. Las recargas del listado y actualizaciones de
saldos desde los detalles alimentan ambos. El control existente de fecha (cada
minuto y al recuperar el foco) recalcula el día de Lima y conserva el comportamiento
del selector al cambiar de mes o año. **Actualizar listado** permite ver los abonos
registrados por el asistente. Durante carga o error no se muestran ceros ficticios.

El GERENTE sigue en modo solo lectura. El ASISTENTE conserva sus controles de
registro y no recibe los indicadores. Esta integración mantiene HU-07, pero no
declara completada SGCP-13/HU-08 ni implementa o fusiona el PR #21; sus criterios
y adaptación a la interfaz consolidada se revisarán de forma independiente.

## Verificación local

Desde `frontend/`:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e -- --config=playwright.inicio.config.js
```

Las pruebas E2E de esta configuración interceptan HTTP con datos de prueba; no
ejecutan backend, migraciones ni conexiones a MySQL/RDS. Cubren ambos roles,
resumen, selección de mes, recarga tras cambios de saldo, detalles, historial,
comprobantes, retirada de rutas y diseño móvil. Las capturas están en
`frontend/.local/`, excluido de Git.

Para probar con los datos locales existentes, abrir `http://localhost:5173/#/login`
e iniciar sesión como GERENTE. El botón **Actualizar listado** recarga los saldos.

### Resultados de esta integración

- Unitarias: 181 pruebas aprobadas en 9 archivos.
- E2E simuladas en Chromium: 14 aprobadas; incluyen abono parcial y cancelación
  desde una sesión de ASISTENTE y actualización del resumen en otra de GERENTE.
- Compilación de producción: aprobada.
- Lint: finaliza correctamente con la advertencia preexistente `MascotaSapo` sin
  utilizar en `frontend/src/pages/LoginPage.jsx`.
- Diseño verificado en escritorio, tableta (768 px) y móviles (390 y 320 px), sin
  desbordamiento horizontal. Capturas de escritorio y 390 px revisadas visualmente.
