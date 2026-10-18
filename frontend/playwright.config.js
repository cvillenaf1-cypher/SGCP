import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../backend/scripts/e2e-server.js',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --host localhost --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { VITE_API_URL: 'http://127.0.0.1:3001' },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
})
