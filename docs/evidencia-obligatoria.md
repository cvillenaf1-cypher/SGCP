# Evidencia obligatoria para pagos

Desde este cambio, cada nuevo abono requiere un comprobante o factura en JPG,
PNG o PDF de hasta 5 MB. La secretaria registra el pago directamente, sin pedir
autorización. Los registros anteriores se conservan; no se inventan evidencias
ni se bloquea su consulta por no haberlas adjuntado antes.

## Actualización

Instalar dependencias del backend y aplicar las migraciones pendientes antes
de iniciar la nueva versión:

```sh
cd backend
npm ci
npm run db:migrate
```

La migración `005_comprobantes_pdf.sql` amplía el tipo de comprobante a PDF sin
modificar las migraciones anteriores. No crea recursos externos ni cambia las
obligaciones existentes. El directorio privado `.local/comprobantes` necesita
almacenamiento persistente y respaldo junto con la base de datos.

## Contrato vigente

`POST /api/obligaciones/:id/abonos` exige sesión ASISTENTE y un cuerpo
`multipart/form-data` con exactamente los siguientes campos:

| Campo | Contenido |
| --- | --- |
| `monto` | Cadena decimal positiva, máximo dos decimales y hasta el saldo pendiente |
| `medio_pago` | Uno de los cuatro medios existentes |
| `clave_idempotencia` | Clave aleatoria por operación, conservada al reintentar |
| `comprobante` | Un archivo obligatorio JPG, PNG o PDF, máximo 5 MB |

Usar `FormData`; el navegador genera `Content-Type` y su boundary. Conservar el
token únicamente en `Authorization: Bearer`. Un cuerpo JSON sin evidencia
devuelve 422 y no registra el pago.

La respuesta 201 (o 200 en un reintento idéntico) incluye `abono` y `comprobante`
con el mismo `abono.id` y `comprobante.abono_id`. La huella de la operación incluye
los bytes originales del archivo: cambiar la evidencia con la misma clave devuelve
409. El comprobante no puede reemplazarse una vez confirmado.

El abono, el saldo y los metadatos de evidencia se confirman en una transacción.
El archivo se escribe antes del COMMIT. Si falla su escritura o la inserción de
metadatos, se revierten los datos monetarios y se limpia el archivo nuevo. Si se
pierde la respuesta del COMMIT, se conserva el archivo y se consulta mediante el
reintento de la misma operación, evitando duplicados. Los archivos huérfanos por
una caída abrupta requieren reconciliación administrativa antes de eliminarlos.

La API valida contenido real, extensión y MIME. Las imágenes se decodifican y
normalizan; los PDF deben poder abrirse, contener páginas y no tener contraseña.
Se conservan los bytes del PDF para no alterar posibles firmas. Las descargas
son privadas, autenticadas, con `attachment`, `nosniff`, `no-store` y CSP sandbox.
El historial permite consultar imágenes y descargar PDF.

Las rutas `/api/abonos/:id/comprobante` se conservan para consultar y completar
evidencias de registros antiguos. La interfaz usa una sola solicitud para los
pagos nuevos; ya no guarda primero el abono y después intenta adjuntar el archivo.

## Validación

Las pruebas cubren la obligatoriedad en formulario y API, JPG/PNG/PDF válidos,
archivos falsos o excesivos, rollback ante fallo de disco y SQL, concurrencia,
recuperación de confirmaciones perdidas, descarga privada y exigencia de evidencia
en cada abono parcial. Se comprueba además el flujo completo con Chromium y MySQL.

La evidencia permite revisar el sustento del pago; adjuntar un archivo por sí
solo no demuestra que el gasto corresponda a la empresa.
