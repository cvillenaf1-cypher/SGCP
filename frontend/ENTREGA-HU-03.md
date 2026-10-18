# SGCP-8 — HU-03 | Registrar pagos realizados

Rama: `funcionalidad/SGCP-8-interfaz-abonos`, creada desde `main` actualizado por
avance rápido a `d764242`. HU-01 y HU-02 ya están integradas en esa base.

## Estado de la entrega

La interfaz consulta obligaciones reales y permite registrar abonos mediante el
backend HU-03 de Haro. La integración local está preparada para revisión de Quinde;
no se ha publicado en su rama ni en `main`.

La pantalla aparece exclusivamente dentro del panel ASISTENTE, mediante
**Registrar pagos realizados**. Permite consultar obligaciones reales, seleccionar
una con saldo positivo, ver concepto, beneficiario, monto original, saldo actual,
estado y vencimiento, e ingresar monto y medio de pago obligatorio.

Se ofrecen Efectivo, Transferencia bancaria, Tarjeta y Billetera digital. Los
valores coinciden con el backend y se envían sin traducción.

Los montos se comparan con centavos enteros mediante BigInt. Se rechazan campos
vacíos, cero, negativos, más de dos decimales, formato inválido y montos superiores
al saldo. Las obligaciones pagadas están deshabilitadas. Al seleccionar una se
consulta nuevamente su detalle: si ya tiene saldo cero, se bloquea el formulario.
Se descartan respuestas de detalles anteriores al cambiar de selección.

Hay estados de carga, errores, reintentos, negocio vacío y ausencia de obligaciones
con saldo. Saldo, estado y fecha automática del abono no son editables.

El botón **Registrar abono** envía la operación autenticada. Solo muestra la
confirmación que devuelve el servidor, y vuelve a consultar el detalle para
actualizar saldo y estado. Un conflicto `409` muestra el error del servidor y
refresca el saldo antes de permitir otra operación.

La interfaz transforma `montoAbono` y `medioPago` a `monto` y `medio_pago`, y
genera `clave_idempotencia` con `crypto.randomUUID()`. Si la respuesta de red no
permite confirmar el resultado, conserva el cuerpo y la clave originales para
reintentar; bloquea los campos y el doble envío hasta que el servidor confirme la
operación o responda con un error que permita corregirla. No se incorporaron
comprobantes ni historial (HU-04 y HU-05).

## Archivos

- `src/components/FormularioAbono.jsx`: integración de escritura autenticada,
  estado de envío, clave idempotente, tratamiento de errores y refresco del saldo.
- `src/components/FormularioAbono.css`: estilos y adaptación móvil.
- `src/lib/validarAbono.js`: validación de importes y medios.
- `src/components/FuncionesAsistente.jsx`: navegación de HU-03.
- `src/test/abonos.test.jsx`: validación y pruebas de contrato, éxito parcial/total,
  prevención de doble envío, reintento, errores y refresco del saldo.
- `src/test/auth.test.jsx`: navegación autenticada y exclusión del GERENTE.
- `e2e/abonos.spec.js`: registro real parcial y total, y verificación de saldo e
  historial persistidos en MySQL.
- `ENTREGA-HU-03.md`: este informe.

## Contrato y cambios de integración para revisión de Quinde

El endpoint real es `POST /api/obligaciones/:id/abonos`. El JSON requiere
`monto` (cadena decimal), `medio_pago` (una de las cuatro etiquetas existentes)
y `clave_idempotencia` (UUID seguro para la operación). `useAutenticacion().solicitar`
envía el token Bearer y el cliente API serializa el cuerpo como JSON. El backend
responde `201` al registrar y `200` al repetir la misma operación; las claves
reutilizadas con otros datos y los conflictos de saldo responden `409`.

Los cambios locales de Quinde se limitan al componente, sus pruebas unitarias,
la prueba E2E y esta documentación; requieren su revisión antes de publicar.
No se modificó la validación del formulario ni se añadieron dependencias.

## Pruebas ejecutadas

- `npm test`: 72 pruebas aprobadas en 4 archivos; incluye login y regresiones HU-01/HU-02.
- `npm run lint`: aprobado.
- `npm run build`: aprobado.
- Backend: `npm test` aprobó 72 pruebas, incluidas las pruebas reales de idempotencia
  y concurrencia con MySQL; `npm run check` y `npm run lint` aprobados.
- `npm run test:e2e`: 7 pruebas aprobadas con Express, frontend y MySQL reales.
  HU-03 verificó abonos parciales y completos, saldo e historial persistidos.
- Las pruebas reales usaron una instancia MySQL 8.4 aislada en `127.0.0.1:3307`,
  con base `sgcp_test`. Los datos están en `.local/mysql-test` y la configuración
  en `backend/.env.test`; ambos están excluidos de Git y no deben publicarse.
