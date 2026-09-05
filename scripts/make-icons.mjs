// Renders the app icon to PNG at the sizes the manifest needs, plus the SVG favicon.
// Run once with `npm run icons`; the output in public/ is committed.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const GROUND = '#14171f'
const HAIR = '#3a3f4d'
const ACCENT = '#ff7d4d'

// A thin ring (the mirror) with one warm mark on it (the reading).
function svg(size, pad) {
  const c = size / 2
  const r = (size / 2) * (1 - pad)
  const stroke = Math.max(2, size * 0.02)
  const mark = size * 0.075
  const angle = -Math.PI / 4
  const mx = c + r * Math.cos(angle)
  const my = c + r * Math.sin(angle)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${GROUND}"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${HAIR}" stroke-width="${stroke}"/>
  <circle cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="${mark}" fill="${ACCENT}"/>
</svg>
`
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/favicon.svg', svg(64, 0.12))

const sizes = [
  ['icon-192', 192, 0.16],
  ['icon-512', 512, 0.16],
  ['maskable-512', 512, 0.3],
  ['apple-touch-icon', 180, 0.16],
]

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
for (const [name, size, pad] of sizes) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${GROUND}">${svg(size, pad)}</body></html>`)
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } })
  writeFileSync(`public/icons/${name}.png`, png)
  console.log(`public/icons/${name}.png`)
}
await browser.close()
