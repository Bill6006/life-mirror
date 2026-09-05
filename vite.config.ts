/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

const BASE = '/life-mirror/'
const GROUND = '#14171f'

// The pipeline passes the commit, run link and unit-test count in as environment
// variables so the About screen can prove which run tested the deployed build.
// A local build falls back to the checked-out commit and no run.
function localCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

export default defineConfig(({ mode }) => ({
  base: BASE,
  define: {
    __BUILD_COMMIT__: JSON.stringify(process.env.BUILD_COMMIT ?? localCommit()),
    __BUILD_RUN_URL__: JSON.stringify(process.env.BUILD_RUN_URL ?? ''),
    __BUILD_UNIT_TESTS__: JSON.stringify(process.env.BUILD_UNIT_TESTS ?? ''),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    preact(),
    VitePWA({
      disable: mode === 'test',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: BASE,
        name: 'Life Mirror',
        short_name: 'Life Mirror',
        description: 'How you are, read from your own record.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: GROUND,
        theme_color: GROUND,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
