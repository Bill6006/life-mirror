// Renders the app icon to PNG at the sizes the manifest needs, plus the SVG favicon, all from one image:
// the owner's approved icon (2026-10-16), kept at scripts/icon-source.png. Run once with `npm run icons`;
// the output in public/ is committed, at the paths the manifest, the page and the service worker already use.
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'scripts/icon-source.png'
/** The image's own ground, measured from its corners (15, 14, 13): a maskable icon's margin is filled with it. */
const GROUND = 'rgb(15, 14, 13)'

// A maskable icon keeps the whole image, its glowing frame included, inside a launcher's safe zone (a circle of
// 40% radius): the frame's rounded corners reach about 0.56 of the half-size, so it is drawn at 0.72. The
// others fill the square, as the image was made to.
const sizes = [
  ['icon-192', 192, 1],
  ['icon-512', 512, 1],
  ['maskable-512', 512, 0.72],
  ['apple-touch-icon', 180, 1],
]
/** The favicon's raster, held inside favicon.svg so its path stays the one the page names. */
const FAVICON = 64

const src = `data:image/png;base64,${readFileSync(SOURCE).toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage()

/** The image drawn at `size`, filling `scale` of it on the ground: stepped down by halves, then once smoothly, so fine lines stay clean. */
async function render(size, scale) {
  const bytes = await page.evaluate(
    async ({ src, size, scale, ground }) => {
      const img = new Image()
      img.src = src
      await img.decode()
      let w = img.naturalWidth
      let canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = w
      canvas.getContext('2d').drawImage(img, 0, 0)
      const target = Math.round(size * scale)
      while (w / 2 >= target) {
        const half = document.createElement('canvas')
        half.width = Math.round(w / 2)
        half.height = half.width
        const h = half.getContext('2d')
        h.imageSmoothingEnabled = true
        h.imageSmoothingQuality = 'high'
        h.drawImage(canvas, 0, 0, w, w, 0, 0, half.width, half.width)
        canvas = half
        w = half.width
      }
      const out = document.createElement('canvas')
      out.width = size
      out.height = size
      const o = out.getContext('2d')
      o.fillStyle = ground
      o.fillRect(0, 0, size, size)
      o.imageSmoothingEnabled = true
      o.imageSmoothingQuality = 'high'
      const at = Math.round((size - target) / 2)
      o.drawImage(canvas, 0, 0, w, w, at, at, target, target)
      const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    { src, size, scale, ground: GROUND },
  )
  return Buffer.from(bytes)
}

mkdirSync('public/icons', { recursive: true })
for (const [name, size, scale] of sizes) {
  writeFileSync(`public/icons/${name}.png`, await render(size, scale))
  console.log(`public/icons/${name}.png`)
}
const fav = (await render(FAVICON, 1)).toString('base64')
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="${FAVICON}" height="${FAVICON}" viewBox="0 0 ${FAVICON} ${FAVICON}"><image width="${FAVICON}" height="${FAVICON}" href="data:image/png;base64,${fav}"/></svg>\n`,
)
console.log('public/favicon.svg')
await browser.close()
