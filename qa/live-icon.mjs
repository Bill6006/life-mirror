// The owner's icon (Phase C, 2026-10-23) on the live site: the manifest, the page and the service worker name the new
// files; each one served is byte for byte the file committed (made from the owner's image, scripts/icon-source.png); the
// earlier icon's files are gone; and the page loaded fresh shows the new favicon. Nothing of the owner's data is touched:
// a fresh throwaway context, no record entered.
// node live-icon.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { chromium } from './common.mjs'

const want = process.argv[2]
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const ROOT = new URL('..', import.meta.url)
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)
const committed = (path) => sha(readFileSync(new URL(`public/${path}`, ROOT)))
const NEW = ['icons/life-mirror-192.png', 'icons/life-mirror-512.png', 'icons/life-mirror-maskable-512.png', 'icons/life-mirror-touch-180.png', 'icons/life-mirror-favicon.svg']
const OLD = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'favicon.svg']

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(LIVE)
  await page.getByTestId('direction-input').waitFor({ timeout: 20000 })
  const get = async (path) => {
    const r = await ctx.request.get(new URL(path, LIVE).href, { headers: { 'cache-control': 'no-cache' } })
    return { status: r.status(), type: r.headers()['content-type'] ?? '', body: await r.body() }
  }
  // The build first: the commit the page was made from.
  const stamp = await page.evaluate(() => document.querySelector('meta[name="build"]')?.getAttribute('content') ?? null)
  const commit = stamp ?? (await (async () => {
    await page.getByTestId('direction-input').fill('One line, mine')
    await page.getByRole('button', { name: 'Keep it', exact: true }).click()
    await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-about').click()
    return (await page.getByTestId('build-commit').textContent())?.trim()
  })())
  check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
  const manifest = JSON.parse((await get('manifest.webmanifest')).body.toString('utf8'))
  const srcs = manifest.icons.map((i) => `${i.src}${i.purpose ? ` (${i.purpose})` : ''}`)
  check('the manifest names the new icon, its maskable one among them', JSON.stringify(manifest.icons.map((i) => i.src)) === JSON.stringify(NEW.slice(0, 3)) && manifest.icons[2].purpose === 'maskable', srcs.join(', '))
  const links = await page.evaluate(() => ({ icon: document.querySelector('link[rel="icon"]')?.getAttribute('href'), touch: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') }))
  check('the page names the new favicon and touch icon', Boolean(links.icon?.endsWith(NEW[4]) && links.touch?.endsWith(NEW[3])), `${links.icon} · ${links.touch}`)
  for (const path of NEW) {
    const r = await get(path)
    const same = r.status === 200 && sha(r.body) === committed(path)
    check(`${path} is served, byte for byte the committed file`, same, `${r.status} ${r.type} ${sha(r.body)}`)
  }
  for (const path of OLD) {
    const r = await get(path)
    // Pages answers 404; a local preview answers an unknown path with the page itself. Gone means never served as an image.
    check(`${path}, the earlier icon, is gone`, !(r.status === 200 && r.type.startsWith('image/')), `${r.status} ${r.type}`)
  }
  const sw = (await get('sw.js')).body.toString('utf8')
  check('the service worker keeps the new icon and names it on its notifications, never the earlier one', NEW.every((p) => sw.includes(p)) && OLD.every((p) => !sw.includes(`"${p}"`) && !sw.includes(`/${p}`)) && !sw.includes('icon-192.png'))
  // The tab's own icon: the favicon the page shows, its picture drawn, is the new one.
  const svg = (await get(links.icon)).body.toString('utf8')
  const png = /href="(data:image\/png;base64,[^"]+)"/.exec(svg)?.[1] ?? ''
  const drawn = await page.evaluate(async (href) => {
    const img = new Image()
    img.src = href
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0, 64, 64)
    const d = g.getImageData(0, 0, 64, 64).data
    // The sun: orange above the middle; the left page: blue on the left.
    const at = (x, y) => Array.from(d.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 3))
    return { sun: at(32, 17), page: at(20, 40) }
  }, png)
  check('the favicon drawn is the new icon: the orange sun above, the blue page on the left', drawn.sun[0] > 180 && drawn.sun[2] < 120 && drawn.page[2] > 150 && drawn.page[0] < 120, JSON.stringify(drawn))
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
