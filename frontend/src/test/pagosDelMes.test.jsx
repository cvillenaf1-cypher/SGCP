import { describe, expect, it, vi } from 'vitest'
import { filtrarPagosPorPeriodo, obtenerPeriodoActual } from '../gerente/pagosDelMes'
import { consultarPagosDelMes } from '../gerente/servicioPagos'
import { pagosDePrueba } from './datos/pagosDelMes'

describe('Utilidades y servicio compartidos con el resumen mensual', () => {
  it('usa el calendario de Lima aunque el mes UTC ya haya cambiado', () => {
    expect(obtenerPeriodoActual(new Date('2027-01-01T02:00:00Z'))).toEqual({ mes: 12, anio: 2026 })
  })

  it('filtra por fecha límite e incluye fechas de años bisiestos', () => {
    const pago = { fechaLimite: '2024-02-29' }
    expect(filtrarPagosPorPeriodo([pago], 2, 2024)).toEqual([pago])
    expect(filtrarPagosPorPeriodo([pago], 2, 2025)).toEqual([])
  })

  it('reutiliza el listado real autenticado, sin excluir pagos completos ni filtrar por registro', async () => {
    const obligaciones = pagosDePrueba.map((pago) => ({
      id: pago.id, concepto: pago.concepto, beneficiario: pago.beneficiario,
      monto_original: pago.montoOriginal, saldo_pendiente: pago.saldoPendiente,
      fecha_limite: pago.fechaLimite, fecha_registro: pago.fechaRegistro,
      estado_economico: pago.estado.toUpperCase(),
    }))
    const solicitar = vi.fn().mockResolvedValue({ obligaciones })
    const senal = new AbortController().signal
    const pagos = await consultarPagosDelMes({ solicitar, senal })
    expect(solicitar).toHaveBeenCalledExactlyOnceWith('/api/obligaciones', { signal: senal })
    expect(filtrarPagosPorPeriodo(pagos, 9, 2026)).toEqual([expect.objectContaining({ concepto: 'Compra de prueba', saldoPendiente: '0.00', estado: 'Pagado' })])
    expect(filtrarPagosPorPeriodo(pagos, 10, 2026)).toHaveLength(2)
  })

  it('distingue una respuesta inválida de una consulta sin resultados', async () => {
    const solicitar = vi.fn().mockResolvedValue({})
    await expect(consultarPagosDelMes({ solicitar })).rejects.toThrow('El servidor envió una lista de pagos inválida.')
  })

  it('el adaptador conserva los errores de la API y reconoce listas vacías', async () => {
    const solicitar = vi.fn().mockResolvedValueOnce({ obligaciones: [] }).mockRejectedValueOnce(new Error('Servicio no disponible.'))
    await expect(consultarPagosDelMes({ solicitar })).resolves.toEqual([])
    await expect(consultarPagosDelMes({ solicitar })).rejects.toThrow('Servicio no disponible.')
  })
})
