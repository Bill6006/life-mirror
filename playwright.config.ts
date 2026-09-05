import { defineConfig } from '@playwright/test'

// The smoke test runs against the built dist/ folder served by `vite preview`,
// bound to the loopback address on a fixed port, one worker, one phone-sized viewport.
const HOST = '127.0.0.1'
const PORT = 4791
const URL = `http://${HOST}:${PORT}/life-mirror/`

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: URL,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --host ${HOST} --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
