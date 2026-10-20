ALTER TABLE comprobantes
  DROP CHECK chk_comprobante_tipo,
  MODIFY tipo VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ADD CONSTRAINT chk_comprobante_tipo CHECK (tipo IN ('image/jpeg', 'image/png', 'application/pdf'));
