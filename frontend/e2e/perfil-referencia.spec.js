import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { abrirBasePruebas, crearUsuarioPrueba, eliminarUsuarioPrueba } from '../../backend/test/support/database.js'

let pool
let usuario

test.beforeAll(async () => {
  ;({ pool } = await abrirBasePruebas())
  const [[existente]] = await pool.execute('SELECT id FROM perfil_referencia WHERE id = 1')
  expect(existente, 'No se sobrescribe un perfil existente en sgcp_test').toBeUndefined()
  usuario = await crearUsuarioPrueba(pool, 'CONFIGURADOR')
})

test.afterAll(async () => {
  if (!pool) return
  try {
    if (usuario) {
      const [[propio]] = await pool.execute('SELECT id FROM perfil_referencia WHERE id = 1 AND creado_por = ?', [usuario.id])
      if (propio) {
        for (const tabla of ['perfil_auditoria', 'perfil_bancos', 'perfil_servicios']) await pool.execute(`DELETE FROM ${tabla} WHERE perfil_id = ?`, [propio.id])
        await pool.execute('DELETE FROM perfil_referencia WHERE id = ? AND creado_por = ?', [propio.id, usuario.id])
      }
      await eliminarUsuarioPrueba(pool, usuario)
    }
  } finally { await pool.end() }
})

async function ingresar(pagina) {
  await pagina.goto('/#/login')
  await pagina.getByLabel('Correo electrónico').fill(usuario.email)
  await pagina.getByLabel('Contraseña', { exact: true }).fill(usuario.password)
  await pagina.getByRole('button', { name: /^Iniciar sesión/ }).click()
  await expect(pagina.getByRole('heading', { name: 'Configuración del perfil' })).toBeVisible()
  await expect(pagina.getByText('Cargando configuración…')).toHaveCount(0)
}

test('perfil progresivo real: referencias, tercero, edición, privacidad y persistencia en escritorio y móvil', async ({ page: pagina }) => {
  test.setTimeout(60000)
  await ingresar(pagina)
  await expect(pagina.getByText('El titular principal todavía no ha sido configurado.')).toBeVisible()
  await pagina.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/perfil-referencia-vacio.png', import.meta.url)), fullPage: true })

  // El primer banco crea el perfil de forma transaccional, sin exigir titular.
  for (const alias of ['Local central', 'Sucursal']) {
    await pagina.getByRole('button', { name: 'Añadir banco' }).click()
    await pagina.getByLabel('Entidad financiera *').fill('BCP')
    await pagina.getByLabel('Alias o descripción (opcional)').fill(alias)
    await pagina.getByRole('button', { name: 'Guardar referencia' }).click()
    await expect(pagina.getByRole('form')).toHaveCount(0)
  }
  await expect(pagina.getByRole('list', { name: 'Bancos asociados' }).getByRole('listitem')).toHaveCount(2)
  await expect(pagina.getByText('El titular principal todavía no ha sido configurado.')).toBeVisible()
  await pagina.getByRole('button', { name: 'Añadir banco' }).click()
  await pagina.getByLabel('Entidad financiera *').fill('BCP')
  await pagina.getByLabel('Alias o descripción (opcional)').fill('Local central')
  await pagina.getByRole('button', { name: 'Guardar referencia' }).click()
  await expect(pagina.getByRole('alert')).toContainText('Ya existe una referencia activa')
  await pagina.getByRole('button', { name: 'Cancelar', exact: true }).click()

  for (const codigo of ['SUM-001', 'SUM-002']) {
    await pagina.getByRole('button', { name: 'Añadir servicio' }).click()
    await pagina.getByLabel('Empresa prestadora *').fill('Proveedor de energía de prueba')
    await pagina.getByLabel('Titular que aparece en el recibo (opcional)').fill('Propietario de prueba')
    await pagina.getByLabel('Código de suministro o cliente (opcional)').fill(codigo)
    await pagina.getByLabel('Dirección del servicio (opcional)').fill('Local de demostración')
    await pagina.getByLabel('Relación con el negocio').selectOption('TERCERO_RELACIONADO')
    await pagina.getByLabel('Detalle de la relación (opcional)').fill('Propietario del local alquilado')
    await pagina.getByRole('button', { name: 'Guardar referencia' }).click()
    await expect(pagina.getByRole('form')).toHaveCount(0)
  }
  await expect(pagina.getByRole('list', { name: 'Servicios asociados' }).getByRole('listitem')).toHaveCount(2)

  await pagina.getByRole('button', { name: 'Editar titular' }).click()
  await pagina.getByLabel('Tipo de titular').selectOption('EMPRESA')
  await pagina.getByLabel('Nombre completo o razón social').fill('Empresa de prueba')
  await pagina.getByRole('button', { name: 'Guardar referencia' }).click()
  await expect(pagina.getByText('Configuración parcial')).toBeVisible()
  await pagina.getByRole('button', { name: /^Editar Local central/ }).click()
  await pagina.getByLabel('Alias o descripción (opcional)').fill('Local central actualizado')
  await pagina.getByRole('button', { name: 'Guardar referencia' }).click()
  await expect(pagina.getByRole('heading', { name: 'Local central actualizado' })).toBeVisible()

  let escrituras = 0
  pagina.on('request', (solicitud) => { if (solicitud.url().includes('/api/perfil-referencia') && solicitud.method() === 'POST') escrituras++ })
  await pagina.getByRole('button', { name: 'Añadir banco' }).click()
  await pagina.getByLabel('Entidad financiera *').fill('Interbank')
  await pagina.getByLabel('Alias o descripción (opcional)').fill('4111 1111 1111 1111')
  await pagina.getByRole('button', { name: 'Guardar referencia' }).click()
  await expect(pagina.getByLabel('Alias o descripción (opcional)')).toHaveAttribute('aria-invalid', 'true')
  expect(escrituras).toBe(0)
  await pagina.getByRole('button', { name: 'Cancelar', exact: true }).click()

  await pagina.getByRole('button', { name: 'Cerrar sesión' }).click()
  await ingresar(pagina)
  await expect(pagina.getByRole('heading', { name: 'Local central actualizado' })).toBeVisible()
  await expect(pagina.getByRole('list', { name: 'Servicios asociados' }).getByRole('listitem')).toHaveCount(2)
  await pagina.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/perfil-referencia-escritorio.png', import.meta.url)), fullPage: true })
  await pagina.setViewportSize({ width: 390, height: 844 })
  expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await pagina.screenshot({ path: fileURLToPath(new URL('../../docs/evidence/perfil-referencia-movil.png', import.meta.url)), fullPage: true })
  await pagina.getByRole('button', { name: /^Desactivar Sucursal/ }).click()
  await expect(pagina.getByText('Desactivada', { exact: true })).toBeVisible()
  await pagina.getByRole('button', { name: 'Cerrar sesión' }).click()
})
