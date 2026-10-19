CREATE TABLE IF NOT EXISTS comprobantes (
  abono_id INT UNSIGNED PRIMARY KEY,
  identificador_archivo VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  nombre_original VARCHAR(84) NOT NULL,
  tipo VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tamano INT UNSIGNED NOT NULL,
  tamano_original INT UNSIGNED NOT NULL,
  huella_archivo CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  fecha_asociacion DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT fk_comprobante_abono FOREIGN KEY (abono_id) REFERENCES abonos(id) ON DELETE RESTRICT,
  CONSTRAINT chk_comprobante_tipo CHECK (tipo IN ('image/jpeg', 'image/png')),
  CONSTRAINT chk_comprobante_tamano CHECK (tamano > 0 AND tamano <= 5242880),
  CONSTRAINT chk_comprobante_original CHECK (tamano_original > 0 AND tamano_original <= 5242880)
) ENGINE=InnoDB;
