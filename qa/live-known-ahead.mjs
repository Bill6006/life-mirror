// Stage C of the week ahead switched on (2026-11-23, at the owner's word), on the live site, in fresh throwaway contexts
// with stand-in records only: nothing touches the owner's data, and no request leaves the browser but to the site itself.
// The build stamp; then, on each of the stand-in records of src/knownAheadTesting.ts (built here), seeded straight into
// the phone's stores at a day's start: the writer at the open writes the day by the way the record calls for, and the
// Weekly View draws seven bars, marks the lowest, and names the way under Details in its approved sentence, word for
// word; on a record with nothing there, the four's pick writes the day and the card names the four's way, as before.
// node live-known-ahead.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
// SHOTS=<folder> also saves each way's card at a phone's size, Details open, to set beside the phone.
import { buildSync } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from './common.mjs'

const want = process.argv[2]
if (!want) throw new Error('usage: node live-known-ahead.mjs <expected short commit>')
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const SHOTS = process.env.SHOTS ?? null
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()

// The stand-in records, built from the app's own testing module, as the browser tests build them.
const out = fileURLToPath(new URL('../node_modules/.cache/known-ahead/live-seed.mjs', import.meta.url))
buildSync({ entryPoints: [fileURLToPath(new URL('../src/knownAheadTesting.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' })
const seed = await import(pathToFileURL(out).href)

// The records' last day is the day before this one, and its morning is still to come.
const TODAY = '2026-11-23'
const WHEN = new Date(2026, 10, 23, 6, 0)
const FOUR = ['sameBlock', 'weekdayBlock', 'lastValue', 'blend']
const WAYS = [
  ['levelWeekday', seed.standIn({ steps: (_d, w) => seed.TWO_READINGS[w] }), 'Expected from your usual level at this time of day and how this weekday usually differs. This way is used only after clear weekday differences have held for four weeks.'],
  ['levelReadings', seed.standIn({ steps: (_d, w, _b, id) => (id === 'mood' ? 1.5 * seed.TWO_READINGS[w] : id === 'energy' ? -0.6 * seed.TWO_READINGS[w] : 0), wobble: seed.twoReadingsWobble }), 'Expected from your usual level at this time of day and how this weekday usually differs in some of your readings. This way is used only after clear weekday differences have held for four weeks.'],
  ['levelWeather', seed.standIn({ steps: seed.bySunshine(), weather: true }), 'Expected from your usual level at this time of day and the weather forecast for the day. This way is used only after a clear tie between the weather and your days has held for four weeks.'],
  ['levelWeekdayWeather', seed.standIn({ steps: (d, w, b, id, turn) => seed.TWO_READINGS[w] + seed.bySunshine()(d, w, b, id, turn), weather: true }), 'Expected from your usual level at this time of day, how this weekday usually differs and the weather forecast for the day. Each part is used only after it has held clearly for four weeks.'],
]

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const text = (loc) => loc.textContent({ timeout: 5000 }).then((t) => (t ?? '').trim(), () => null)

async function fresh(when) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.addInitScript(() => localStorage.setItem('lm.inStep', '1'))
  if (when) await page.clock.setFixedTime(when)
  await page.goto(LIVE)
  return { ctx, page }
}
const db = (page, fn, arg) =>
  page.evaluate(
    async ({ body, arg }) => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      // eslint-disable-next-line no-new-func
      const out = await new Function('dbx', 'arg', body)(dbx, arg)
      dbx.close()
      return out
    },
    { body: fn, arg },
  )
const PUT = `const tx = dbx.transaction([arg.name], 'readwrite'); for (const row of arg.list) tx.objectStore(arg.name).put(row); return new Promise((res, rej) => { tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error) })`
const ALL = `return new Promise((res, rej) => { const r = dbx.transaction([arg], 'readonly').objectStore(arg).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })`
/** The app's stores stand (its first open made them), then the record goes in with no app page open, then the app again. */
async function seeded(page, record) {
  await page.waitForFunction(async () => (await indexedDB.databases()).some((d) => d.name === 'life-mirror' && (d.version ?? 0) > 1), undefined, { timeout: 30000 })
  await page.goto(new URL('icons/life-mirror-192.png', LIVE).href)
  await db(page, PUT, { name: 'checkins', list: record.checkins })
  await db(page, PUT, { name: 'days', list: record.days })
  await page.goto(LIVE)
  let rows = []
  for (let i = 0; i < 120 && rows.length <= 20; i++) {
    rows = (await db(page, ALL, 'forecasts')).filter((f) => f.madeOn === TODAY)
    if (rows.length <= 20) await page.waitForTimeout(1000)
  }
  return rows
}
async function weekly(page) {
  await page.locator('nav.tabs').getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await page.getByTestId('week-ahead').waitFor({ state: 'visible' })
  await page.getByTestId('week-ahead-details').click()
  await page.getByTestId('week-ahead-model').waitFor({ state: 'visible' })
}
async function shot(page, name) {
  if (!SHOTS) return
  await page.waitForTimeout(400)
  const head = await page.locator('[data-testid="weekly"] h2.section').first().boundingBox()
  const card = await page.getByTestId('week-ahead').boundingBox()
  await page.screenshot({ path: `${SHOTS}/${name}.png`, clip: { x: 0, y: Math.max(0, head.y - 12), width: 390, height: card.y + card.height - head.y + 24 } })
}

try {
  {
    const { ctx, page } = await fresh(null)
    await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-about').click()
    const commit = (await text(page.getByTestId('build-commit'))) ?? ''
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }
  for (const [way, record, sentence] of WAYS) {
    const { ctx, page } = await fresh(WHEN)
    const rows = await seeded(page, record)
    check(`${way}: the writer at the open writes the day by it`, rows.length > 20 && rows.every((f) => f.model === way), `${rows.length} rows, ways ${[...new Set(rows.map((f) => f.model))].join(', ')}`)
    check(`${way}: each row keeps what the four would have written`, rows.filter((f) => f.four).length > 20)
    await weekly(page)
    const ahead = page.getByTestId('week-ahead')
    check(`${way}: seven bars, the lowest marked, never said as one level`, (await ahead.getByTestId('ahead-bar').count()) === 7 && (await ahead.locator('.wa-bar.is-low').count()) > 0 && (await page.getByTestId('week-ahead-summary').count()) === 0)
    const said = await text(page.getByTestId('week-ahead-model'))
    check(`${way}: Details names the way in its approved sentence, word for word`, said === sentence, said ?? '')
    await shot(page, way)
    await ctx.close()
  }
  {
    const { ctx, page } = await fresh(WHEN)
    const rows = await seeded(page, seed.standIn({}))
    check('nothing there: the four’s pick writes the day, with nothing of Stage C’s', rows.length > 20 && rows.every((f) => FOUR.includes(f.model) && !f.four && !f.stageB && !f.weather), `${rows.length} rows`)
    await weekly(page)
    check('nothing there: Details names the four’s way, as before', ((await text(page.getByTestId('week-ahead-model'))) ?? '').includes('of four ways to forecast, the one that came closest a day ahead over your last four weeks.'))
    await shot(page, 'none')
    await ctx.close()
  }
} finally {
  await browser.close()
}

check('the page reached no host but the site itself', [...hosts].every((h) => h === SITE), `only ${[...hosts].join(', ')}`)
check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
