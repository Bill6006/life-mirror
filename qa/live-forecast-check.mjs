// Batch 3 (2026-11-21), the moved forecasts' check, on the live site, in fresh throwaway contexts with stand-in rows
// only: nothing touches the owner's data, and no request leaves the browser but to the site itself. The build stamp; on a
// fresh phone the Weekly View's Scorecard says how many moved forecasts are scored and when they are first read; with
// ten days of stand-in moved forecasts, each with its plain forecast and its score, the first look read as "keep
// watching" and as "switch it off", in the approved contract's shape, under the Scorecard's hit rate.
// node live-forecast-check.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
// SHOTS=<folder> also saves the Scorecard in each state at a phone's size.
import { chromium } from './common.mjs'

const want = process.argv[2]
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const SHOTS = process.env.SHOTS ?? null
const WHEN = new Date(2026, 11, 15, 19, 5)
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', locale: 'en-US' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.addInitScript(() => localStorage.setItem('lm.inStep', '1'))
  await page.clock.setFixedTime(WHEN)
  await page.goto(LIVE)
  return { ctx, page }
}

/** Away to a file of the site's own that runs no app code, once the app's database stands with its stores. */
async function leave(page) {
  await page.waitForFunction(
    async () => {
      const known = await indexedDB.databases()
      if (!known.some((d) => d.name === 'life-mirror' && (d.version ?? 0) > 1)) return false
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const ok = ['checkins', 'forecasts', 'forecastScores', 'settings'].every((s) => dbx.objectStoreNames.contains(s))
      dbx.close()
      return ok
    },
    undefined,
    { polling: 100 },
  )
  await page.goto(new URL('icons/life-mirror-192.png', LIVE).href)
}
const put = (page, store, rows) =>
  page.evaluate(
    async ({ name, list }) => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction([name], 'readwrite')
      for (const row of list) tx.objectStore(name).put(row)
      await new Promise((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { name: store, list: rows },
  )

const SLOTS = [
  ['morning', 0],
  ['afternoon', 0],
  ['evening', 0],
  ['morning', 1],
]
/** Ten days of stand-in moved forecasts from 1 December, four a day; a day's first carries its whole gain, alternately a + 3 and a − 3: the clearance is a. */
function tenDays(a) {
  const forecasts = []
  const scores = []
  for (let i = 0; i < 10; i++) {
    const day = `2026-12-${String(1 + i).padStart(2, '0')}`
    SLOTS.forEach(([block, horizon], slot) => {
      const gain = slot === 0 ? (i % 2 === 0 ? a + 3 : a - 3) : 0
      const actual = 50
      const moved = gain >= 0 ? actual + 1 : actual + 1 - gain
      const plain = gain >= 0 ? actual - 1 - gain : actual - 1
      const madeOn = horizon === 0 ? day : new Date(Date.UTC(2026, 11, i)).toISOString().slice(0, 10)
      forecasts.push({ day, block, horizon, madeOn, model: 'sameBlock', point: moved, lo: moved - 5, hi: moved + 5, whatIf: null, adj: moved - plain, adjBy: ['sleep.short'], plain: { point: plain, lo: plain - 5, hi: plain + 5 } })
      scores.push({ day, block, horizon, model: 'sameBlock', point: moved, lo: moved - 5, hi: moved + 5, actual, error: actual - moved, hit: Math.abs(actual - moved) <= 5, scoredOn: day })
    })
  }
  return { forecasts, scores }
}

/** The Scorecard's moved-forecast lines once its fold is opened; whether they sit under the hit rate; with SHOTS, the fold. */
async function scorecard(page, name) {
  await page.locator('nav.tabs').getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  const fold = page.getByTestId('weekly-scorecard')
  const closed = (await fold.getAttribute('aria-expanded')) === 'false' && (await page.getByTestId('moved-check').count()) === 0
  await fold.click()
  await page.getByTestId('moved-check').first().waitFor({ state: 'visible', timeout: 10000 })
  const placed = await page.getByTestId('hit-rate').evaluate((hit) => hit.nextElementSibling?.getAttribute('data-testid') === 'moved-check')
  const lines = (await page.getByTestId('moved-check').allTextContents()).map((t) => t.trim())
  if (SHOTS) {
    const card = page.getByTestId('hit-rate').locator('xpath=ancestor::div[contains(@class,"card")][1]')
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(300)
    await card.screenshot({ path: `${SHOTS}/${name}.png` })
  }
  return { closed, placed, lines }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

try {
  {
    const { ctx, page } = await fresh()
    await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await fresh()
    const s = await scorecard(page, 'scorecard-none-yet')
    check('a fresh phone: closed until opened, under the hit rate', s.closed && s.placed)
    check('a fresh phone: none scored yet, and when they are first read', same(s.lines, ['Forecasts moved and scored: 0', 'They are set beside the plain forecast once 40 are scored, on at least 10 days.']), s.lines.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page } = await fresh()
    await leave(page)
    const rows = tenDays(1)
    await put(page, 'forecasts', rows.forecasts)
    await put(page, 'forecastScores', rows.scores)
    await page.goto(LIVE)
    const s = await scorecard(page, 'scorecard-keep-watching')
    check('the first look, keep watching: in the contract’s shape', s.placed && same(s.lines, ['Forecasts moved and scored: 40', 'Range held: 40 of 40 moved, 40 of 40 plain', 'Average miss: 1.3 moved, 1.5 plain', 'Read as written down beforehand: keep watching.', 'Read on December 11; read again once 80 are scored (40 so far).']), s.lines.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page } = await fresh()
    await leave(page)
    const rows = tenDays(-2.5)
    await put(page, 'forecasts', rows.forecasts)
    await put(page, 'forecastScores', rows.scores)
    await page.goto(LIVE)
    const s = await scorecard(page, 'scorecard-switch-it-off')
    check('the first look, switch it off: said, and from when', s.placed && same(s.lines.slice(0, 2), ['Forecasts moved and scored: 40', 'Range held: 35 of 40 moved, 40 of 40 plain']) && same(s.lines.slice(3), ['Read as written down beforehand: switch it off.', 'Read on December 11: forecasts written from then on are not moved.']), s.lines.join(' | '))
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
