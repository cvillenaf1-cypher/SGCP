# SGCP-9 — HU-04 | Comprobante opcional privado

El medio de pago obligatorio ya pertenece a HU-03 y conserva sus cuatro valores.
HU-04 agrega un comprobante opcional por abono, sin modificar importes, historial
monetario ni el contrato JSON de POST /api/obligaciones/:id/abonos. No mueve dinero.

## Migración y almacenamiento

Desde backend, con la configuración MySQL local habitual:
```powershell
npm ci
npm run db:migrate
npm start
```
El migrador existente aplica 004_comprobantes.sql después de 001–003 sin alterarlas.
La tabla comprobantes tiene abono_id como PK y FK restrictiva hacia abonos:
máximo un comprobante por abono. No cambia tablas ni registros históricos de abonos.

Los archivos normalizados se guardan en SGCP/.local/comprobantes, fuera del frontend
y excluidos por la regla .local/ existente. No existe ruta express.static.
El directorio se crea con modo 0700 y archivos 0600 donde el sistema lo soporta.
En Windows deben conservarse ACL exclusivas para la cuenta del servicio; los modos
POSIX no sustituyen esas ACL. No otorgar permisos de ejecución ni servir esta carpeta
desde IIS, Apache, Vite o un servidor de archivos. Para despliegue se necesita disco
persistente y copia de seguridad conjunta de archivos y tabla comprobantes;
el almacenamiento local no se comparte entre réplicas. No se crean recursos AWS.

## Permisos

- Adjuntar: sesión vigente, rol ASISTENTE y ser quien registró ese abono.
- Consultar/descargar: ese ASISTENTE o un GERENTE autenticado.
- Otro ASISTENTE: 403, incluso con un ID válido.
- Sin sesión: 401. No se autorizan rutas físicas ni nombres enviados por clientes.
- Se valida el ID y la propiedad antes de recibir el archivo y nuevamente en la
  transacción. El GERENTE no puede adjuntar ni reemplazar.

## Contrato para Quinde

1. Registrar el abono como actualmente mediante JSON. Conservar resultado.abono.id,
   tanto en respuesta 201 como en reintento 200. No reenviar el abono para adjuntar.
2. Si el usuario selecciona comprobante, enviar una solicitud independiente:

POST /api/abonos/:id/comprobante
Authorization: Bearer <token>
Content-Type: multipart/form-data con boundary generado por el cliente

Único campo: comprobante, un archivo JPG/JPEG o PNG. No enviar campos de texto.
Usar FormData y fetch con el token en Authorization. No fijar manualmente
Content-Type y no pasar FormData por el serializador JSON actual.

```javascript
const formulario = new FormData()
formulario.append('comprobante', archivo)
const respuesta = await fetch(urlApi + '/api/abonos/' + abonoId + '/comprobante', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token },
  body: formulario,
})
```

Respuesta 201 al asociar, o 200 al repetir exactamente los mismos bytes:
```json
{
  "message": "Comprobante asociado correctamente.",
  "comprobante": {
    "abono_id": 18,
    "nombre": "boleta.png",
    "tipo": "image/png",
    "tamano": 1200,
    "tamano_original": 1320,
    "fecha_asociacion": "2026-10-18T22:00:00.000Z",
    "url_descarga": "/api/abonos/18/comprobante/archivo"
  }
}
```

GET /api/abonos/:id/comprobante devuelve 200:
- Sin adjunto: { "tiene_comprobante": false, "comprobante": null }.
- Con adjunto: tiene_comprobante true y el mismo objeto público.
No incluye ruta interna, nombre aleatorio, hash ni credenciales.

GET /api/abonos/:id/comprobante/archivo devuelve el contenido normalizado, con
Content-Disposition attachment, MIME verificado, nosniff y Cache-Control no-store.
Usar fetch autenticado y blob para descargar: un enlace directo no envía el token
Bearer de la sesión en memoria. Nunca poner tokens en la URL.

Un error al adjuntar mantiene válido el abono. Reintentar únicamente la carga
del mismo archivo. Un archivo diferente para el mismo abono devuelve 409:
no existe reemplazo, eliminación ni historial HU-05 en esta entrega.

## Validaciones y errores

- Hasta 5 MiB (5 × 1024 × 1024 bytes); el tamaño normalizado también debe caber.
- Firmas binarias PNG/JPEG, MIME declarado coincidente y extensión .png/.jpg/.jpeg.
- Decodificación completa con Sharp; rechaza imágenes corruptas/truncadas y
  dimensiones superiores a 25 millones de píxeles. No admite múltiples páginas.
- Recodificación al mismo formato para retirar metadatos y contenido añadido.
  El archivo descargado puede diferir de los bytes originales. La idempotencia
  compara SHA-256 de la entrada original, no el nombre ni el MIME del navegador.
- Nombre original reducido a una base ASCII segura; almacenamiento mediante UUID,
  escritura exclusiva wx y validación interna del identificador.
- Multer solo en esta ruta, un archivo, sin otros campos, límite de bytes.
  Se mantienen express.json de 16 KB y el resto de protecciones.
- Límite de 20 cargas por minuto por IP y 4 cargas simultáneas por proceso.

Códigos: 401 sin sesión; 403 sin permiso; 404 abono inexistente o descarga sin
adjunto; 422 cuerpo/archivo/ID inválido; 413 exceso de tamaño; 409 comprobante
distinto o conflicto de bloqueo; 429 saturación; 500 fallo de disco o MySQL.
Los errores conservan mensajes en español y no exponen rutas ni detalles internos.

## Consistencia entre MySQL y disco

No hay temporales en disco al recibir: el contenido permanece en memoria limitada,
se valida y normaliza antes de guardar. La transacción bloquea el abono con
SELECT FOR UPDATE y consulta comprobantes con lectura actual. La PK abono_id
impide duplicados incluso bajo concurrencia.

Se escribe y sincroniza un archivo aleatorio antes de insertar metadatos.
Si falla la escritura parcial se cierra y elimina ese archivo. Si falla la
inserción, se revierte y elimina el archivo propio. No se sobrescriben archivos.

Disco y MySQL no tienen una transacción distribuida:
- Si COMMIT arroja un error, el resultado puede ser incierto. Se conserva el
  archivo para no borrar un comprobante que MySQL sí confirmó. El cliente puede
  reintentar el mismo archivo y consultar su estado.
- Una caída entre escritura y commit o un fallo al limpiar puede dejar un huérfano.
  La API nunca lo sirve sin metadatos. Los fallos de limpieza generan un aviso
  sin rutas ni cuerpos.
- Para reconciliar: detener cargas, respaldar tabla y directorio, comparar los UUID
  en comprobantes.identificador_archivo con el directorio privado y revisar los
  archivos sin referencia. Solo el administrador puede retirar huérfanos después
  de descartar transacciones/cargas activas. No se borra nada automáticamente.
- Si hay metadatos pero falta el archivo, la descarga falla de forma genérica;
  restaurar desde respaldo, no crear un segundo abono.

## Verificación

Pruebas nuevas: backend/test/comprobantes.integration.test.js usa MySQL aislado
configurado por backend/.env.test. Crea sus usuarios, obligaciones, abonos y
directorio aleatorio propios y limpia solamente esos recursos. No recrea bases.

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

Para Cristhian: conservar la instancia aislada 127.0.0.1:3307 y la base sgcp_test;
configurar backend/.env.test a partir del ejemplo sin publicarlo. El helper exige
una base con sufijo _test distinta de desarrollo y aplica las migraciones.
La suite verifica asociación, descarga autorizada, ausencia opcional, formato,
límites, autorización, concurrencia, limpieza y fallo de COMMIT sin cambiar saldos.
No se modifican los componentes de Quinde ni el panel del GERENTE.

Referencias de las dependencias:
- https://expressjs.com/en/resources/middleware/multer/
- https://sharp.pixelplumbing.com/api-constructor/
- https://sharp.pixelplumbing.com/api-output/

Resultados comprobados el 18/10/2026: backend 82/82 (incluidas 10 pruebas HU-04
con MySQL real), frontend 90/90, check y lint backend aprobados, lint y build
frontend aprobados. No quedan pruebas obligatorias pendientes de MySQL.
No se ejecutó E2E de frontend para esta entrega: no hay cambios de interfaz.
