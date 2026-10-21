ALTER TABLE roles
  DROP CHECK chk_role_code,
  ADD CONSTRAINT chk_role_code CHECK (codigo IN ('ASISTENTE', 'GERENTE', 'CONFIGURADOR'));

INSERT IGNORE INTO roles (id, codigo) VALUES (3, 'CONFIGURADOR');

CREATE TABLE IF NOT EXISTS perfil_referencia (
  id TINYINT UNSIGNED PRIMARY KEY,
  tipo VARCHAR(16) NOT NULL DEFAULT '',
  nombre VARCHAR(160) NOT NULL DEFAULT '',
  documento VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  nombre_comercial VARCHAR(160) NOT NULL DEFAULT '',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  creado_por INT UNSIGNED NOT NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT chk_perfil_unico CHECK (id = 1),
  CONSTRAINT chk_perfil_tipo CHECK (tipo IN ('', 'EMPRESA', 'PERSONA_NATURAL')),
  CONSTRAINT chk_perfil_documento CHECK (documento = '' OR
    (tipo = 'EMPRESA' AND REGEXP_LIKE(documento, '^[0-9]{11}$')) OR
    (tipo = 'PERSONA_NATURAL' AND REGEXP_LIKE(documento, '^[0-9]{8}$'))),
  CONSTRAINT fk_perfil_creador FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS perfil_bancos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  perfil_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  entidad VARCHAR(100) NOT NULL,
  relacion VARCHAR(16) NOT NULL,
  titular VARCHAR(160) NOT NULL DEFAULT '',
  documento VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  alias VARCHAR(160) NOT NULL DEFAULT '',
  marca_tarjeta VARCHAR(40) NOT NULL DEFAULT '',
  ultimos_cuatro VARCHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  huella CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  huella_activa CHAR(64) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (IF(activo = TRUE, huella, NULL)) STORED,
  creado_en DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT fk_perfil_banco FOREIGN KEY (perfil_id) REFERENCES perfil_referencia(id) ON DELETE RESTRICT,
  CONSTRAINT uq_perfil_banco UNIQUE (perfil_id, huella_activa),
  CONSTRAINT chk_perfil_banco_entidad CHECK (CHAR_LENGTH(TRIM(entidad)) > 0),
  CONSTRAINT chk_perfil_banco_relacion CHECK (relacion IN ('PAGOS', 'PRESTAMISTA', 'AMBOS')),
  CONSTRAINT chk_perfil_banco_documento CHECK (documento = '' OR REGEXP_LIKE(documento, '^([0-9]{8}|[0-9]{11})$')),
  CONSTRAINT chk_perfil_banco_cuatro CHECK (ultimos_cuatro = '' OR REGEXP_LIKE(ultimos_cuatro, '^[0-9]{4}$')),
  CONSTRAINT chk_perfil_banco_activo CHECK (activo IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS perfil_servicios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  perfil_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  tipo VARCHAR(16) NOT NULL,
  empresa VARCHAR(100) NOT NULL,
  titular VARCHAR(160) NOT NULL DEFAULT '',
  documento VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  codigo_cliente VARCHAR(60) NOT NULL DEFAULT '',
  direccion VARCHAR(240) NOT NULL DEFAULT '',
  alias VARCHAR(160) NOT NULL DEFAULT '',
  relacion_empresa VARCHAR(24) NOT NULL DEFAULT 'POR_DEFINIR',
  detalle_relacion VARCHAR(160) NOT NULL DEFAULT '',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  huella CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  huella_activa CHAR(64) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (IF(activo = TRUE, huella, NULL)) STORED,
  creado_en DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  actualizado_en DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT fk_perfil_servicio FOREIGN KEY (perfil_id) REFERENCES perfil_referencia(id) ON DELETE RESTRICT,
  CONSTRAINT uq_perfil_servicio UNIQUE (perfil_id, huella_activa),
  CONSTRAINT chk_perfil_servicio_empresa CHECK (CHAR_LENGTH(TRIM(empresa)) > 0),
  CONSTRAINT chk_perfil_servicio_tipo CHECK (tipo IN ('ELECTRICIDAD', 'AGUA', 'INTERNET', 'TELEFONIA', 'OTRO')),
  CONSTRAINT chk_perfil_servicio_documento CHECK (documento = '' OR REGEXP_LIKE(documento, '^([0-9]{8}|[0-9]{11})$')),
  CONSTRAINT chk_perfil_servicio_relacion CHECK (relacion_empresa IN ('POR_DEFINIR', 'PROPIO', 'TERCERO_RELACIONADO')),
  CONSTRAINT chk_perfil_servicio_activo CHECK (activo IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS perfil_auditoria (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  perfil_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  usuario_id INT UNSIGNED NOT NULL,
  fecha DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  operacion VARCHAR(16) NOT NULL,
  entidad VARCHAR(16) NOT NULL,
  entidad_id INT UNSIGNED NOT NULL,
  campos JSON NOT NULL,
  CONSTRAINT fk_perfil_auditoria FOREIGN KEY (perfil_id) REFERENCES perfil_referencia(id) ON DELETE RESTRICT,
  CONSTRAINT fk_perfil_auditor FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT chk_perfil_operacion CHECK (operacion IN ('CREACION', 'ACTUALIZACION', 'DESACTIVACION')),
  CONSTRAINT chk_perfil_entidad CHECK (entidad IN ('PERFIL', 'TITULAR', 'BANCO', 'SERVICIO')),
  INDEX idx_perfil_auditoria_fecha (perfil_id, fecha),
  INDEX idx_perfil_auditoria_entidad (entidad, entidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
