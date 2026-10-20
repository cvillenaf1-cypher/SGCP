import { defineConfig } from '@playwright/test'
import configuracionHistorial from './playwright.historial.config.js'

// Navegador con contratos HTTP simulados; no modifica ni requiere una base MySQL.
export default defineConfig(configuracionHistorial, {
  testMatch: ['inicio.spec.js', 'historial.spec.js'],
})
