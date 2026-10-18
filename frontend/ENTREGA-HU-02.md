# SGCP-7 — HU-02 | Consultar pagos pendientes

Rama: `funcionalidad/SGCP-7-interfaz-consulta`.
Creada desde `main` actualizado por avance rápido a `f65b301`, que ya incluye
la HU-01 del frontend y las rutas de consulta de Joel. No se realizó ningún merge.

## Funcionalidad

Navegación dentro del panel ASISTENTE entre registro y consulta. Listado de
obligaciones con concepto, beneficiario, monto original, saldo pendiente, estado
económico, vencimiento y fecha límite. Incluye filtros Todos, Pendiente, Parcial,
Pagado y Vencido, actualización manual y detalle consultado al servidor.

Los estados `estado_economico` y `vencida` se muestran tal como los devuelve la API.
Una obligación puede aparecer Parcial y Vencida a la vez. Los registros pagados
permanecen en Todos y en las consultas correspondientes. No se filtra por creador.
Los importes conservan las cadenas decimales de MySQL y se presentan con S/ y dos
decimales. La fecha de registro del detalle se muestra en America/Lima.

La consulta es de solo lectura, sin edición, eliminación o abonos. Maneja carga,
errores, reintentos, negocio sin registros y filtros sin resultados. Cancela
solicitudes obsoletas para evitar que una respuesta anterior sobrescriba el filtro
o detalle actual. La tabla tiene desplazamiento horizontal dentro de su contenedor
en pantallas pequeñas; el detalle se adapta a una columna.

## Archivos

- `src/components/FuncionesAsistente.jsx`: navegación entre HU-01 y HU-02.
- `src/components/ListadoPagosPendientes.jsx`: listado, filtros, estados y detalle.
- `src/components/ListadoPagosPendientes.css`: presentación y adaptación móvil.
- `src/lib/formatearImporte.js`: presentación de cadenas decimales sin convertir a float.
- `src/pages/DashboardPage.jsx`: integración exclusiva para ASISTENTE.
- `src/test/consultaPagos.test.jsx`: pruebas de consulta.
- `src/test/auth.test.jsx`: acceso por rol y sesión vencida desde la consulta.
- `e2e/consulta-pagos.spec.js`: recorrido con navegador, API y MySQL real.
- `ENTREGA-HU-02.md`: este informe.

## Conexión con Express

Se comprobó la implementación integrada en `origin/main` y se usan exactamente:

- `GET /api/obligaciones`.
- `GET /api/obligaciones?filtro=pendiente|parcial|pagado|vencido`.
- `GET /api/obligaciones/:id`.

Se reutilizan el cliente HTTP y el token de la sesión existente. Los 401 devuelven
al login; los demás fallos se muestran con posibilidad de reintentar. No hay datos
simulados en la funcionalidad. Las respuestas simuladas están aisladas en las
pruebas de componentes. Joel ya entregó los endpoints necesarios; HU-02 no depende
del backend de Haro. Queda validar el entorno compartido al integrar la entrega.

## Verificación realizada

- `npm.cmd test` en frontend: 42 pruebas aprobadas, incluidos login y HU-01.
- `npm.cmd run lint` en frontend: aprobado sin advertencias.
- `npm.cmd run build` en frontend: aprobado.
- `npm.cmd test` en backend: 63 pruebas aprobadas con base MySQL de pruebas.
- Prueba `e2e/consulta-pagos.spec.js`: 1 prueba aprobada con Edge, Express y
  MySQL real. Crea únicamente su obligación de prueba mediante la API y elimina
  esa fila al finalizar. Comprueba listado, importes, pendiente + vencida, detalle,
  filtros y ancho móvil de 390 px.
- Comprobación adicional en la instancia local de desarrollo: login, listado y
  detalle; revisión de capturas de escritorio y móvil fuera de Git.
- Revisión ampliada local: cuatro obligaciones identificadas como `Ejemplo HU-02`
  (pendiente vigente, pendiente vencida, parcial vencida y pagada), creadas por otro
  ASISTENTE local. Los cuatro filtros y el detalle devolvieron los datos esperados.
  Se compararon las filas antes y después para confirmar que consultar no las altera.
  La revocación de sesión devolvió al login; un GERENTE local recibió 403 en listado
  y detalle y no pudo entrar al panel ASISTENTE. Recorrido aprobado en Edge con
  MySQL real. Estos saldos se prepararon como datos de ejemplo directamente en la
  instancia aislada: no representan abonos reales ni una implementación de HU-03.
  Los ejemplos se conservan para revisión manual y no se incluyen en Git.
- `git diff --check`: aprobado.

Chromium no está descargado en este equipo. Para la ejecución E2E se utilizó Edge
ya instalado y una configuración local excluida de Git. Los dos servidores de
pruebas se iniciaron por separado para evitar un bloqueo de cierre del lanzador
en Windows. El recorrido terminó con código 0. No se ejecutó toda la suite E2E.

## Cómo revisar

1. Con la API y MySQL disponibles, ejecutar `npm.cmd run dev` desde `frontend`
   si el servidor de desarrollo no está iniciado.
2. Abrir `http://localhost:5173/#/login` e ingresar con la cuenta ASISTENTE existente.
3. Pulsar **Consultar pagos pendientes**.
4. Probar los filtros y **Ver detalle**. **Actualizar listado** vuelve a consultar
   el servidor. Volver a **Registrar pagos pendientes** permite usar HU-01.
5. Iniciar sesión como GERENTE: no aparecen las funciones del ASISTENTE.

No se modificaron código del backend, migraciones, login, pantallas del GERENTE,
Jira o AWS. No se añadieron dependencias. Configuración MySQL, credenciales,
herramientas locales y capturas siguen excluidas de Git.

Sin commit, push o Pull Request todavía: entrega preparada para revisión.
No se comenzó HU-03.
