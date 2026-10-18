# Entrega HU-01 — QUINDE

Rama: `funcionalidad/SGCP-6-interfaz-registro`.

## Implementación

Formulario integrado en el panel ASISTENTE existente, en `/#/asistente`, con concepto,
beneficiario, monto original en soles y fecha límite. Reutiliza estilos, navegación,
sesión y cliente HTTP existentes. Incluye etiquetas y ayudas accesibles, errores bajo
los campos, foco en el primer campo inválido, diseño adaptable, carga y confirmación.
El GERENTE conserva su panel y no tiene acceso al formulario.

Valida campos obligatorios, textos vacíos o con espacios, máximo de 255 caracteres,
monto mayor que cero, hasta dos decimales, máximo de 11 enteros y fechas reales entre
1000 y 9999. Permite fechas pasadas. El bloqueo inmediato de envíos y el botón
deshabilitado evitan solicitudes repetidas mientras se procesa un registro.
Saldo, estado y fecha de registro no son campos editables.

## Archivos

- Nuevos: `src/components/FormularioPagoPendiente.jsx` y su CSS.
- Nuevo: `src/lib/validarPagoPendiente.js`.
- Nuevo: `src/test/pagoPendiente.test.jsx`.
- Modificados: `src/pages/DashboardPage.jsx` (integración exclusiva para ASISTENTE)
  y `src/test/auth.test.jsx` (comprobación de visibilidad y acceso por rol).
- Nuevo: este informe.

## Verificación

- `npm.cmd test`: 27 pruebas aprobadas en 2 archivos. Incluyen formulario, campos
  obligatorios, montos cero/negativos/con más decimales, fechas inválidas y pasadas,
  mensajes, contrato HTTP, bloqueo de envíos, éxito confirmado, errores del servidor,
  navegación por rol y regresión del login y cierre de sesión.
- `npm.cmd run lint`: aprobado.
- `npm.cmd run build`: aprobado.
- `git diff --check`: aprobado.
- Las pruebas de interfaz usan respuestas simuladas; no prueban persistencia real.
- Verificación local posterior: 38 pruebas del backend aprobadas con una instancia
  MySQL 8.4 aislada y una base `sgcp_test` independiente.
- Comprobación adicional con Playwright y Edge: login real como ASISTENTE, envío
  desde el formulario, confirmación y consulta directa de MySQL para verificar monto,
  saldo inicial y fecha pasada. Vista móvil de 390 px sin desbordamiento horizontal.
  Se conservan registros de prueba en la base local de desarrollo.

## Ejecución y backend

Desde `frontend`, ejecutar `npm.cmd run dev` y abrir `http://localhost:5173/#/login`.
Iniciar sesión con un usuario ASISTENTE existente para visualizar el formulario.
La API debe estar ejecutándose con su configuración MySQL existente. Consultar el
README principal para arrancarla; no se crearon bases, usuarios ni credenciales.
`VITE_API_URL` permite configurar la URL pública de la API (por defecto,
`http://localhost:3000`).

El endpoint de Joel ya existe: `POST /api/obligaciones`. La interfaz lo usa mediante
la sesión Bearer existente y envía exactamente `concepto`, `beneficiario`, `monto`
(cadena decimal) y `fecha_limite`. Traduce los errores `fields` de esos nombres
a los campos del formulario. Solo confirma el registro cuando la respuesta incluye
`obligacion.id`. No simula escrituras exitosas ni agrega rutas HTTP.

La conexión se verificó con API y MySQL locales, incluyendo el registro y el saldo
inicial. Queda pendiente la integración en el entorno compartido del equipo.
La prevención de duplicados cubre pulsaciones repetidas durante el envío; no ofrece
idempotencia ante reintentos posteriores a una respuesta perdida, que requeriría
soporte del backend.

## Alcance cumplido

HU-01 cuenta con captura de los cuatro campos, validaciones, fechas pasadas,
mensajes y estados de envío, integración en el panel ASISTENTE, restricción por el
mecanismo de roles existente y conexión al contrato implementado. La persistencia
MySQL se verificó localmente; queda pendiente la integración en el entorno del equipo.

No se modificó código del backend, migraciones, login, Jira ni AWS. Para la prueba
local se creó una instancia aislada en `.local/hu01-mysql`, se aplicaron las migraciones
existentes y se creó una cuenta ASISTENTE. Configuración y credenciales están excluidas
de Git. Sin commit, push o merge.
No se inició HU-02.
