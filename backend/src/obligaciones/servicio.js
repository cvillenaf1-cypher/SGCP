export async function registrarObligacion(conexiones, entrada, usuarioCreadorId) {
  const conexion = await conexiones.getConnection()
  try {
    await conexion.beginTransaction()
    const [resultado] = await conexion.execute(
      `INSERT INTO obligaciones (concepto, beneficiario, monto_original, saldo_pendiente, fecha_limite, usuario_creador_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [entrada.concepto, entrada.beneficiario, entrada.monto, entrada.monto, entrada.fecha_limite, usuarioCreadorId],
    )
    const [[obligacion]] = await conexion.execute(
      `SELECT id, concepto, beneficiario, monto_original, saldo_pendiente, fecha_limite, fecha_registro, usuario_creador_id
       FROM obligaciones WHERE id = ?`,
      [resultado.insertId],
    )
    const registrada = { ...obligacion, fecha_registro: `${obligacion.fecha_registro.replace(' ', 'T')}Z` }
    await conexion.commit()
    return registrada
  } catch (error) {
    await conexion.rollback()
    throw error
  } finally {
    conexion.release()
  }
}
