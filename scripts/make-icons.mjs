// Renders the app icon to PNG at the sizes the manifest and the page need, plus the SVG favicon, all from one image: the
// owner's icon (2026-10-23), kept at scripts/icon-source.png exactly as given. Run once with `npm run icons`; the output in
// public/icons/ is committed, at the paths the manifest, the page and the service worker name. The names are new with this
// icon, so no cache anywhere (a browser's, the service worker's, the favicon's) can keep answering an earlier one.
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'scripts/icon-source.png'

// The image is the whole square: its own dark ground, a gradient, under the artwork. Every icon but the maskable one is
// the whole image, as it was made. A maskable icon keeps the artwork inside a launcher's safe zone (a circle of 40%
// radius): measured, the artwork reaches 0.42 of the size from the centre (the pages' outer corners), so it is drawn at
// 0.9, its farthest point at 0.38. The margin around it continues the image's own ground outward from its edges, so the
// gradient runs on unbroken and no band shows under any mask.
const sizes = [
  ['life-mirror-192', 192, 1],
  ['life-mirror-512', 512, 1],
  ['life-mirror-maskable-512', 512, 0.9],
  ['life-mirror-touch-180', 180, 1],
]
/** The favicon's raster, held inside an SVG. */
const FAVICON = 64

const src = `data:image/png;base64,${readFileSync(SOURCE).toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage()

/** The image drawn at `size`, filling `scale` of it: stepped down by halves, then once smoothly, so fine lines stay clean. */
async function render(size, scale) {
  const bytes = await page.evaluate(
    async ({ src, size, scale }) => {
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
      const fit = document.createElement('canvas')
      fit.width = target
      fit.height = target
      const f = fit.getContext('2d')
      f.imageSmoothingEnabled = true
      f.imageSmoothingQuality = 'high'
      f.drawImage(canvas, 0, 0, w, w, 0, 0, target, target)
      const out = document.createElement('canvas')
      out.width = size
      out.height = size
      const o = out.getContext('2d')
      const at = Math.round((size - target) / 2)
      const end = at + target
      if (at > 0) {
        // The margin: the image's outermost rows and columns carried out to the edge, its corners from its corner pixels.
        o.imageSmoothingEnabled = false
        o.drawImage(fit, 0, 0, target, 1, at, 0, target, at)
        o.drawImage(fit, 0, target - 1, target, 1, at, end, target, size - end)
        o.drawImage(fit, 0, 0, 1, target, 0, at, at, target)
        o.drawImage(fit, target - 1, 0, 1, target, end, at, size - end, target)
        o.drawImage(fit, 0, 0, 1, 1, 0, 0, at, at)
        o.drawImage(fit, target - 1, 0, 1, 1, end, 0, size - end, at)
        o.drawImage(fit, 0, target - 1, 1, 1, 0, end, at, size - end)
        o.drawImage(fit, target - 1, target - 1, 1, 1, end, end, size - end, size - end)
      }
      o.drawImage(fit, at, at)
      const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    { src, size, scale },
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
  'public/icons/life-mirror-favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="${FAVICON}" height="${FAVICON}" viewBox="0 0 ${FAVICON} ${FAVICON}"><image width="${FAVICON}" height="${FAVICON}" href="data:image/png;base64,${fav}"/></svg>\n`,
)
console.log('public/icons/life-mirror-favicon.svg')
await browser.close()
