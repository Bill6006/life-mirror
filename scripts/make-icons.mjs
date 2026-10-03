// Renders the app icon to PNG at the sizes the manifest needs, plus the SVG favicon.
// Run once with `npm run icons`; the output in public/ is committed.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const GROUND = '#14171f'
const GROUND_LIFT = '#1f2431'
const HAIR = '#5d6374'
const ACCENT = '#ff7d4d'

/** The reflection under the horizon: each bar's height on the grid, its width and how much of the sun it still holds. */
const BARS = [
  [64, 31, 0.8],
  [70, 22, 0.55],
  [76, 14, 0.34],
  [82, 6.5, 0.18],
]

// The sun over a horizon, and its reflection breaking up on the water below (the owner's pick, 2026-10-03):
// the mirror and the day in one mark, in the app's own colours. Drawn on a 100-unit grid; `scale` keeps it
// inside a launcher's mask.
function svg(size, scale) {
  const t = 50 * (1 - scale)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="ground" cx="50%" cy="36%" r="75%">
      <stop offset="0%" stop-color="${GROUND_LIFT}"/>
      <stop offset="100%" stop-color="${GROUND}"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#ground)"/>
  <g transform="translate(${t} ${t}) scale(${scale})">
    <circle cx="50" cy="38" r="25" fill="url(#glow)"/>
    <circle cx="50" cy="38" r="14.5" fill="${ACCENT}"/>
    <line x1="16" y1="58" x2="84" y2="58" stroke="${HAIR}" stroke-width="2.6" stroke-linecap="round"/>
${BARS.map(([y, w, o]) => `    <rect x="${50 - w / 2}" y="${y - 1.7}" width="${w}" height="3.4" rx="1.7" fill="${ACCENT}" fill-opacity="${o}"/>`).join('\n')}
  </g>
</svg>
`
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/favicon.svg', svg(64, 1))

// A maskable icon keeps its mark inside the launcher's safe zone (the middle 80%); the others fill the square.
const sizes = [
  ['icon-192', 192, 1],
  ['icon-512', 512, 1],
  ['maskable-512', 512, 0.9],
  ['apple-touch-icon', 180, 1],
]

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
for (const [name, size, scale] of sizes) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${GROUND}">${svg(size, scale)}</body></html>`)
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } })
  writeFileSync(`public/icons/${name}.png`, png)
  console.log(`public/icons/${name}.png`)
}
await browser.close()
