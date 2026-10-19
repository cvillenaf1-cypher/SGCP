# SGCP-10 — HU-05 | Consulta real del historial de pagos

Backend de solo lectura para la interfaz original de Quinde, integrada en main
mediante PR #12. No modifica HistorialPagos.jsx, sus pruebas ni los ejemplos.
No añade dependencias ni migraciones: usa obligaciones, abonos y comprobantes
de las migraciones 002–004 existentes.

## Ruta y permisos

GET /api/obligaciones/:id/historial
Authorization: Bearer <token>

Requiere sesión vigente y rol ASISTENTE. Permite consultar cualquier obligación
del único negocio, incluidas las pagadas, siguiendo los permisos de HU-02.
El ID debe ser un entero canónico entre 1 y 4294967295.
La respuesta tiene Cache-Control: no-store.

## Contrato JSON exacto

Ejemplo ilustrativo de una obligación con un abono parcial:
```json
{
  "historial": {
    "obligacion_id": 81,
    "concepto": "Servicio de limpieza",
    "monto_original": "100.00",
    "saldo_pendiente": "90.00",
    "total_abonado": "10.00",
    "estado_economico": "PARCIAL",
    "resumen_consistente": true,
    "advertencia": null,
    "abonos": [
      {
        "id": 18,
        "monto": "10.00",
        "medio_pago": "Efectivo",
        "fecha_registro": "2026-10-18T00:30:00.123Z",
        "tiene_comprobante": true,
        "puede_descargar_comprobante": true,
        "url_comprobante": "/api/abonos/18/comprobante/archivo"
      }
    ]
  }
}
```

- historial: objeto; obligacion_id e id: enteros.
- concepto, medio_pago y estado_economico: cadenas.
- monto_original, saldo_pendiente, total_abonado y monto: cadenas decimales en
  soles con dos decimales. No convertir a Number para cálculos monetarios.
- estado_economico conserva PENDIENTE/PARCIAL/PAGADO según el saldo real.
- fecha_registro: cadena ISO UTC terminada en Z; puede contener milisegundos.
  El ejemplo corresponde al 17 de octubre de 2026, 19:30:00.123 en America/Lima.
- tiene_comprobante: booleano que indica la presencia de metadatos asociados.
- puede_descargar_comprobante: booleano, true solo si existe comprobante y el
  ASISTENTE actual registró ese abono. No concede permisos nuevos.
- url_comprobante: cadena con la ruta autenticada existente o null cuando
  no existe comprobante o el solicitante no tiene permiso de descarga.
- resumen_consistente: booleano; advertencia: cadena o null.
- abonos: arreglo completo en fecha_registro DESC, id DESC, sin duplicados.

Sin abonos: abonos es [], total_abonado es "0.00", se conserva el monto y saldo
almacenados y se verifica igualmente la consistencia. No se utiliza el historial
de ejemplo ni se deduce el total restando el saldo.

Si monto_original menos la suma real de abonos difiere de saldo_pendiente, la
respuesta sigue siendo 200 con resumen_consistente false y una advertencia
explícita. Muestra los valores reales; no corrige ni oculta la diferencia.

## Consulta de comprobantes

Para un abono con url_comprobante no nula, utilizar solicitar(url_comprobante,
{ respuestaComo: 'blob' }) del cliente existente y descargar su resultado.
No usar enlaces con tokens en query ni rutas físicas. La descarga vuelve a
validar sesión, rol y propiedad en HU-04. Puede devolver 401/403 si cambian
los permisos o vence la sesión después de obtener el historial.

tiene_comprobante true con puede_descargar_comprobante false permite indicar
que existe un archivo sin ofrecer una descarga no autorizada. GERENTE conserva
su consulta HU-04, pero no accede a este endpoint exclusivo del ASISTENTE.
No se exponen UUID internos, rutas, nombres privados, claves idempotentes o hashes.

## Adaptación a la presentación original de Quinde

Documento de integración; no se aplica este cambio al frontend en esta entrega.

```javascript
const { historial } = await solicitar('/api/obligaciones/' + identificador + '/historial')
const presentacion = {
  concepto: historial.concepto,
  montoOriginal: historial.monto_original,
  totalAbonado: historial.total_abonado,
  saldoPendiente: historial.saldo_pendiente,
  abonos: historial.abonos.map((abono) => ({
    identificador: abono.id,
    monto: abono.monto,
    medioPago: abono.medio_pago,
    fechaHora: abono.fecha_registro,
    tieneComprobante: abono.tiene_comprobante,
    puedeDescargarComprobante: abono.puede_descargar_comprobante,
    urlComprobante: abono.url_comprobante,
  })),
}
```

PresentacionHistorial ya recibe estos campos camelCase y formatea America/Lima.
Al conectarla, Quinde debe reemplazar la consulta de detalle pendiente por esta
ruta, mostrar advertencia si existe, distinguir comprobante de permiso, añadir
la descarga autenticada y retirar el texto de ejemplo para datos reales.
La API ya entrega el orden; el ordenamiento existente de la presentación es
compatible. No cambiar ejemplos de demostración por datos supuestamente reales.
La conexión visual permanece pendiente de revisión de Quinde.

## Consistencia y rendimiento

Una sola sentencia SELECT parametrizada hace LEFT JOIN desde obligaciones hacia
abonos y comprobantes. Una obligación sin abonos conserva una fila con abono null.
comprobantes.abono_id es PK: el JOIN no multiplica abonos. No hay N+1 ni consultas
individuales de archivos. No se lee contenido de disco.

Con InnoDB y el aislamiento habitual READ COMMITTED/REPEATABLE READ, esa sentencia
lee las tres tablas en una misma vista consistente, sin FOR UPDATE. Así un pago
concurrente aparece completo o no aparece; el resumen no se lee por separado.
No se modifican opciones globales de aislamiento ni se bloquean pagos.
Referencia: [lecturas consistentes de MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html).

El total suma los montos reales con aCentavos/desdeCentavos de HU-03 (BigInt).
El servicio selecciona campos explícitos y no escribe en ninguna tabla.
Para el MVP devuelve todos los abonos de una obligación, sin paginación.

## Errores

- 401: sin sesión válida.
- 403: rol no autorizado (incluido GERENTE).
- 404: obligación inexistente; una obligación sin abonos devuelve 200.
- 422: ID inválido, con message y fields.id en español.
- 500: fallo de consulta, con el mensaje genérico existente, sin detalles SQL.

## Ejecución y pruebas

Desde backend, conservar la configuración privada habitual y ejecutar npm ci
y npm start. No se necesita migración nueva. En una instalación nueva aplicar
las migraciones existentes con npm run db:migrate.

La suite utiliza backend/.env.test y la instancia aislada existente
127.0.0.1:3307 / sgcp_test. Nunca apuntarla a la base de desarrollo.
```powershell
cd backend
npm test
npm run check
npm run lint
cd ../frontend
npm test
npm run lint
npm run build
```

historial.integration.test.js crea solo sus usuarios/obligaciones/abonos y un
comprobante de prueba, y limpia exclusivamente esos recursos. La fila alterada
para probar inconsistencia pertenece únicamente a esa suite. La prueba concurrente
pausa un abono real antes del commit y consulta antes/después para verificar
integridad sin bloqueos. No usa Docker ni recrea bases.

La interfaz permanece sin conectar al endpoint real en esta entrega por
instrucción de Haro; no se declara aprobado un recorrido visual de HU-05 real.

Resultados comprobados el 18/10/2026: npm test backend 90/90 (8 pruebas nuevas
HU-05), check y lint backend aprobados; npm test frontend 120/120, lint y build
frontend aprobados. No quedan pruebas backend obligatorias pendientes de MySQL.
El recorrido E2E de la pantalla HU-05 conectada al historial sigue pendiente de la
integración de Quinde; no se modificó esa pantalla ni se ejecutó ese recorrido.
