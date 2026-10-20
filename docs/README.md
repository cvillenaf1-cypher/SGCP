# Documentación del SGCP

## Documentos

- [Arquitectura y modelo acordado](arquitectura.md).
- [SGCP-1: acceso, criterios verificables y pruebas](SGCP-1-acceso-roles.md).
- [SGCP-6, HU-01: registro de obligaciones en el backend](SGCP-6-HU-01-backend.md).
- [SGCP-7, HU-02: consulta de obligaciones en el backend](SGCP-7-HU-02-backend.md).
- [SGCP-8, HU-03: registro de pagos realizados en el backend](SGCP-8-HU-03-backend.md).
- [SGCP-9, HU-04: comprobantes privados](SGCP-9-HU-04-comprobantes.md).
- [SGCP-10, HU-05: contrato del historial real](SGCP-10-HU-05-historial.md).
- [Capturas de evidencia](evidence/README.md).
- [Inicio compartido, pagos directos y comprobantes](inicio-pagos-compartido.md).
- [Migraciones y preparación MySQL](../database/README.md).
- [Instalación y comandos](../README.md).

## Alcance actual

Acceso por roles, sesiones en MySQL y paneles iniciales. Esta entrega técnica se
asocia a la épica SGCP-1; no inventa una nueva historia de Jira ni declara completadas
las ocho historias financieras.

## Convenciones de desarrollo

- Las funciones, métodos propios, variables, componentes, comentarios y documentación
  nuevos se escriben en español. Los nombres existentes se traducen solo cuando sea
  seguro, actualizando sus referencias y comprobando el acceso por roles.
- Se conservan la sintaxis de JavaScript, los nombres de bibliotecas y sus métodos,
  las rutas públicas, los contratos HTTP, las variables de entorno y el esquema de datos.
  En los hooks propios se conserva el prefijo `use` requerido por las herramientas de React.
- SGCP-1 ya funciona: los ajustes de nombres deben conservar el comportamiento del
  inicio de sesión y los roles. Se reutilizan las herramientas y la configuración existentes.
- Se trabaja con cambios pequeños, sin crear archivos `AGENTS.md`, sin fusiones
  automáticas y sin modificar AWS.

## Próximas etapas

La siguiente historia oficial de Jira es **HU-01 | Registrar pagos pendientes (SGCP-6)**.
Después continuarán SGCP-7, SGCP-8, SGCP-9, SGCP-10, SGCP-11, SGCP-12 y SGCP-13,
cada una en su propia rama y PR.

Se acordó adelantar el medio de pago obligatorio a SGCP-8 para no crear abonos
históricos sin medio; SGCP-9 incorporará comprobantes y verificará sus criterios completos.
Los asistentes comparten la información del único negocio, conservando quién registra cada operación.

Esta preparación no crea recursos en AWS.

