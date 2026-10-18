CREATE TABLE IF NOT EXISTS abonos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  obligacion_id INT UNSIGNED NOT NULL,
  monto DECIMAL(13,2) NOT NULL,
  medio_pago VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  fecha_registro DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  usuario_registrador_id INT UNSIGNED NOT NULL,
  clave_idempotencia VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  saldo_resultante DECIMAL(13,2) NOT NULL,
  huella_solicitud CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT uq_abono_operacion UNIQUE (usuario_registrador_id, clave_idempotencia),
  CONSTRAINT fk_abono_obligacion FOREIGN KEY (obligacion_id) REFERENCES obligaciones(id) ON DELETE RESTRICT,
  CONSTRAINT fk_abono_usuario FOREIGN KEY (usuario_registrador_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT chk_abono_monto CHECK (monto > 0),
  CONSTRAINT chk_abono_saldo CHECK (saldo_resultante >= 0),
  CONSTRAINT chk_abono_medio CHECK (medio_pago IN ('Efectivo', 'Transferencia bancaria', 'Tarjeta', 'Billetera digital'))
) ENGINE=InnoDB;
