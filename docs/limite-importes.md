# Límite de importes: S/ 100,000.00

El monto máximo permitido para registrar una deuda o un abono es **S/ 100,000.00**,
incluido ese valor. Se aplica en los formularios y en las validaciones del backend.
Los abonos deben respetar además el saldo pendiente de la obligación.

## Criterios de aceptación

1. Se aceptan montos mayores que cero y de hasta S/ 100,000.00, con máximo dos decimales.
2. Se rechaza S/ 100,000.01 y cualquier importe superior, incluso con ceros iniciales.
3. El formulario muestra el máximo y evita enviar registros que lo superen.
4. La API rechaza una petición manual superior al máximo con error 422 en `fields.monto`, sin insertar ni cambiar saldos.
5. En un abono se muestra y admite el menor valor entre S/ 100,000.00 y el saldo pendiente.
6. Se mantienen la evidencia obligatoria, la validación de sobrepagos y la protección contra duplicados.
7. Se conservan los registros históricos, incluso si exceden el nuevo máximo, y sus cálculos exactos. Una deuda histórica mayor puede recibir abonos de hasta S/ 100,000.00 cada uno.
8. El límite corresponde a cada registro; los totales del resumen y del historial pueden superar S/ 100,000.00 al sumar varias operaciones.

Se conserva el esquema `DECIMAL(13,2)` y no se modifican migraciones ya aplicadas.
Este cambio no necesita ejecutar una migración ni altera importes anteriores.
