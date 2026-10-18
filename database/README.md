# Base de datos · MySQL

Esta carpeta guardará los futuros scripts SQL del SGCP. La configuración inicial
no necesita una instancia de MySQL ni establece conexiones con una base de datos.

Convención sugerida para los próximos scripts:

- `001_schema.sql`: tablas y relaciones.
- `002_seed.sql`: datos de ejemplo sin información personal real.

Cuando se implemente la persistencia, se documentarán aquí la versión de MySQL,
el orden de ejecución y los requisitos del usuario de base de datos. Las variables
`DB_*` de `backend/.env.example` están reservadas para esa etapa.
