# SGCP-8 — HU-03 | Registrar pagos realizados

Rama: `funcionalidad/SGCP-8-interfaz-abonos`, creada desde `main` actualizado por
avance rápido a `d764242`. HU-01 y HU-02 ya están integradas en esa base.

## Estado de la entrega

Interfaz y validaciones preparadas. El registro real de abonos sigue PENDIENTE:
no existe un módulo de abonos de Haro en el `origin/main` revisado. No se inventó
una ruta, un formato JSON ni una respuesta de guardado.

La pantalla aparece exclusivamente dentro del panel ASISTENTE, mediante
**Registrar pagos realizados**. Permite consultar obligaciones reales, seleccionar
una con saldo positivo, ver concepto, beneficiario, monto original, saldo actual,
estado y vencimiento, e ingresar monto y medio de pago obligatorio.

Se ofrecen Efectivo, Transferencia bancaria, Tarjeta y Billetera digital. Estas
etiquetas son valores de interfaz; su traducción al contrato de escritura queda
pendiente de los nombres y valores que entregue Haro.

Los montos se comparan con centavos enteros mediante BigInt. Se rechazan campos
vacíos, cero, negativos, más de dos decimales, formato inválido y montos superiores
al saldo. Las obligaciones pagadas están deshabilitadas. Al seleccionar una se
consulta nuevamente su detalle: si ya tiene saldo cero, se bloquea el formulario.
Se descartan respuestas de detalles anteriores al cambiar de selección.

Hay estados de carga, errores, reintentos, negocio vacío y ausencia de obligaciones
con saldo. Saldo, estado y fecha automática del abono no son editables.

El botón **Validar abono** comprueba los datos y muestra expresamente que no se
guardó ningún movimiento. No hay confirmación falsa ni modificación del saldo.
No se incorporaron comprobantes ni historial (HU-04 y HU-05).

## Archivos

- `src/components/FormularioAbono.jsx`: selección, consulta de saldo y formulario.
- `src/components/FormularioAbono.css`: estilos y adaptación móvil.
- `src/lib/validarAbono.js`: validación de importes y medios.
- `src/components/FuncionesAsistente.jsx`: navegación de HU-03.
- `src/test/abonos.test.jsx`: validación y pruebas del formulario.
- `src/test/auth.test.jsx`: navegación autenticada y exclusión del GERENTE.
- `e2e/abonos.spec.js`: consultas reales y validación sin escritura.
- `ENTREGA-HU-03.md`: este informe.

## Conexión y pendientes

Ya conectadas las lecturas de Joel: `GET /api/obligaciones` y
`GET /api/obligaciones/:id`, mediante la sesión y cliente HTTP existentes.
No hay datos simulados en el componente: los saldos proceden de la API.
Las respuestas simuladas se limitan a las pruebas de componentes. Los ejemplos
que puedan verse en la instancia local son filas de prueba, excluidas de Git.

Haro debe entregar el endpoint de registro de abonos: método, ruta, campos,
valores aceptados para medio de pago, respuesta correcta, errores por campo y
mecanismo de idempotencia/concurrencia. Entonces se conectará el guardado, su estado
de carga, bloqueo de envíos repetidos mientras se procesa, confirmación real y
actualización del saldo y estado a partir del servidor. Esos criterios aún no
están cumplidos ni se declaran probados. Por ahora ninguna pulsación del botón
genera una escritura, incluso si se pulsa repetidamente.

## Pruebas ejecutadas

- `npm.cmd test` en frontend: 67 pruebas aprobadas en 4 archivos; incluye las
  regresiones de login, HU-01 y HU-02.
- `npm.cmd run lint`: aprobado sin advertencias.
- `npm.cmd run build`: aprobado.
- Playwright con Edge, Express y MySQL real: 2 pruebas aprobadas
  (`abonos.spec.js` y `consulta-pagos.spec.js`). La de HU-03 verifica consulta,
  medio obligatorio, abono superior al saldo, validación correcta, pulsaciones
  repetidas sin POST, saldo sin cambios en MySQL y ancho móvil de 390 px.
- Recorrido adicional en la instancia local: selección de una obligación parcial,
  pagadas bloqueadas, error por exceso y validación del monto sin guardar.
  Capturas guardadas fuera de Git; revisión visual en escritorio y móvil.
- `git diff --check`: aprobado.

Para E2E se usó la configuración local de Edge ya instalada y los servidores
independientes descritos en la entrega HU-02. No se instaló ninguna herramienta.
No se ejecutaron pruebas de persistencia de abonos, porque el endpoint no existe.

## Revisión manual

Con API, MySQL y frontend iniciados, abrir `http://localhost:5173/#/login`, ingresar
como ASISTENTE y pulsar **Registrar pagos realizados**. Seleccionar una obligación
con saldo y probar un monto vacío, cero, negativo, con tres decimales y superior al
saldo. Elegir un medio y un monto válido para ver el aviso de guardado pendiente.

No se modificaron backend, migraciones, login, módulo del GERENTE, Jira ni AWS.
No se añadieron dependencias ni se publicaron configuraciones o credenciales.
Sin commit, push o PR todavía; listo para revisar la interfaz y coordinar el
contrato pendiente de Haro. No se comenzó HU-04.
