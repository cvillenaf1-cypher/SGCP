CREATE TABLE IF NOT EXISTS obligaciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  concepto VARCHAR(255) NOT NULL,
  beneficiario VARCHAR(255) NOT NULL,
  monto_original DECIMAL(13,2) NOT NULL,
  saldo_pendiente DECIMAL(13,2) NOT NULL,
  fecha_limite DATE NOT NULL,
  fecha_registro DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  usuario_creador_id INT UNSIGNED NOT NULL,
  CONSTRAINT fk_obligation_creator FOREIGN KEY (usuario_creador_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT chk_obligation_concept CHECK (CHAR_LENGTH(TRIM(concepto)) > 0),
  CONSTRAINT chk_obligation_beneficiary CHECK (CHAR_LENGTH(TRIM(beneficiario)) > 0),
  CONSTRAINT chk_obligation_original_amount CHECK (monto_original > 0),
  CONSTRAINT chk_obligation_pending_balance CHECK (saldo_pendiente >= 0 AND saldo_pendiente <= monto_original),
  INDEX idx_obligation_creator (usuario_creador_id)
) ENGINE=InnoDB;
