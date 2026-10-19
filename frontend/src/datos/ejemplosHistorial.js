// Datos exclusivos de la vista de ejemplo; no son un contrato HTTP ni registros reales.
export const ejemplosHistorial = [
  {
    identificador: 'con-abonos', concepto: 'Ejemplo: servicio de mantenimiento', montoOriginal: '300.00', totalAbonado: '175.50', saldoPendiente: '124.50',
    abonos: [
      { identificador: 1, monto: '100.00', medioPago: 'Transferencia bancaria', fechaHora: '2026-10-15T15:30:00.000Z', tieneComprobante: true },
      { identificador: 3, monto: '25.50', medioPago: 'Billetera digital', fechaHora: '2026-10-18T16:00:00.000Z', tieneComprobante: false },
      { identificador: 2, monto: '50.00', medioPago: 'Efectivo', fechaHora: '2026-10-17T19:45:00.000Z', tieneComprobante: false },
    ],
  },
  { identificador: 'sin-abonos', concepto: 'Ejemplo: alquiler sin abonos', montoOriginal: '800.00', totalAbonado: '0.00', saldoPendiente: '800.00', abonos: [] },
]
