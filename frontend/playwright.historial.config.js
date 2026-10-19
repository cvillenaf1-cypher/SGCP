import { defineConfig, devices } from '@playwright/test'

// Comprueba la aplicación y su cliente HTTP en navegador sin acceder a MySQL:
// las respuestas API de este conjunto se interceptan con datos de prueba.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'historial.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    },
  }],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host localhost --port 5175 --strictPort',
    url: 'http://localhost:5175',
    env: { VITE_API_URL: 'http://localhost:5175' },
    reuseExistingServer: false,
    timeout: 30000,
  },
})
