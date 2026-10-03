/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

const BASE = '/life-mirror/'
// The install's own colours are the default theme's ground (Nocturne); the page sets the chosen theme's at run time.
const GROUND = '#0d111d'

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
      // The worker is source (src/sw.ts) so it can act on a tapped reminder and, later, a push.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // The theme fonts are precached with everything else, so no theme ever waits on the network.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        rollupFormat: 'iife',
      },
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
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/src/**/*.test.ts'],
  },
}))
