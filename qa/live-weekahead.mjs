// The simpler week-ahead graph (the forecast follow-ups, item 8, 2026-11-19) on the live site, in fresh throwaway
// contexts with stand-in records only: nothing touches the owner's data, and no request leaves the browser but to the
// site itself. The build stamp; then the card on days alike, before and after twenty day-ahead forecasts are scored,
// and on a record whose Mondays dip: seven bars, each with its number, and nothing else in the graph; the small line
// under it; Details closed until opened, holding the ranges, the way and, until twenty are scored, how the range is built.
// node live-weekahead.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
// SHOTS=<folder> also saves the card in each state at a phone's size, to be set beside the approved frames.
import { chromium } from './common.mjs'

const want = process.argv[2]
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
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const text = (loc) => loc.textContent({ timeout: 5000 }).then((t) => (t ?? '').trim(), () => null)

async function fresh(when, theme = null) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.addInitScript((t) => {
    localStorage.setItem('lm.inStep', '1')
    if (t) localStorage.setItem('life-mirror.theme', t)
  }, theme)
  await page.clock.setFixedTime(when)
  await page.goto(LIVE)
  return { ctx, page }
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
const MORNING = ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality']
const AFTERNOON = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm']
const EVENING = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']
const dayOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
/** Complete check-ins for the days before `today`, each day's readings at its weekday's level (0 Sunday to 6 Saturday). */
function checkins(today, days, byWeekday) {
  const out = []
  for (let d = days; d >= 1; d--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d)
    const p = byWeekday[date.getDay()]
    const at = (hour) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 40).toISOString()
    const answers = (ids) => Object.fromEntries(ids.map((id) => [id, ['mood', 'energy', 'focus'].includes(id) ? p : ['stress', 'overwhelm', 'irritation'].includes(id) ? 6 - p : 3]))
    for (const [block, ids, hour] of [['morning', MORNING, 7], ['afternoon', AFTERNOON, 13], ['evening', EVENING, 19]]) {
      out.push({ day: dayOf(date), block, asked: ids, startedAt: at(hour), completedAt: at(hour), updatedAt: at(hour), answers: answers(ids), activeMs: 60_000 })
    }
  }
  return out
}
/** Twenty forecasts made a day ahead and scored since, thirteen inside their range. */
const scores = (today) =>
  Array.from({ length: 20 }, (_, i) => {
    const day = dayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1 - i))
    return { day, block: 'morning', horizon: 1, model: 'sameSlot', point: 75, lo: 70, hi: 80, actual: i < 13 ? 75 : 60, error: i < 13 ? 0 : -15, hit: i < 13, scoredOn: day }
  })
async function weekly(page) {
  await page.reload()
  await page.locator('nav.tabs').getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await page.getByTestId('week-ahead').waitFor({ state: 'visible' })
}
/** The section's heading to the card's foot, as the approved frames show it. */
async function shot(page, name) {
  if (!SHOTS) return
  await page.waitForTimeout(400)
  const head = await page.locator('[data-testid="weekly"] h2.section').first().boundingBox()
  const card = await page.getByTestId('week-ahead').boundingBox()
  await page.screenshot({ path: `${SHOTS}/${name}.png`, clip: { x: 0, y: Math.max(0, head.y - 12), width: 390, height: card.y + card.height - head.y + 24 } })
}
const NOW = new Date(2026, 8, 30, 12, 0)
const DAYS = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']

try {
  {
    // Days alike: the build stamp, the card closed, Details opened; then twenty scored.
    const { ctx, page } = await fresh(NOW)
    await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await put(page, 'checkins', checkins(NOW, 35, [4, 4, 4, 4, 4, 4, 4]))
    await weekly(page)
    const card = page.getByTestId('week-ahead')
    const words = await card.locator('svg.chart text').allTextContents()
    check('the graph holds seven numbers and seven days, nothing else', JSON.stringify(words) === JSON.stringify([...Array(7).fill('75'), ...DAYS]), words.join(' '))
    check('seven bars, none marked lowest', (await card.getByTestId('ahead-bar').count()) === 7 && (await card.locator('.is-low').count()) === 0)
    const summary = await text(page.getByTestId('week-ahead-summary'))
    check('the opening line, as before', summary === 'No difference between the days to show: this forecast does not tell one weekday from another. Your expected level this week is around 75.', summary ?? 'no line')
    const rate = await text(page.getByTestId('week-ahead-rate'))
    check('under the graph, when it will say how often they land', rate === 'How often its forecasts land is said here once twenty day-ahead forecasts are scored.', rate ?? 'no line')
    check('no caption', !((await text(card)) ?? '').includes('Daily expected value'))
    check('Details closed until opened', (await page.getByTestId('week-ahead-details').getAttribute('aria-expanded')) === 'false' && (await page.getByTestId('week-ahead-range').count()) === 0)
    await shot(page, 'alike-closed')
    await page.getByTestId('week-ahead-details').click()
    const range = await text(page.getByTestId('week-ahead-range'))
    const way = await text(page.getByTestId('week-ahead-model'))
    const sized = await text(page.getByTestId('week-ahead-sized'))
    check('Details: the range', range === 'Expected range: 75–75 each day.', range ?? 'no line')
    check('Details: the way', (way ?? '').includes('the one that came closest a day ahead over your last four weeks'), way ?? 'no line')
    check('Details: how the range is built, under twenty scored', sized === 'Its range is sized from its own misses over those weeks, so that six in ten of them fall inside it.', sized ?? 'no line')
    await shot(page, 'alike-open-under-twenty')
    await put(page, 'forecastScores', scores(NOW))
    await weekly(page)
    const counted = await text(page.getByTestId('week-ahead-rate'))
    check('twenty scored: the count, under the graph', counted === 'Of 20 day-ahead forecasts scored so far, 13 landed inside their range (65 percent).', counted ?? 'no line')
    await shot(page, 'alike-closed-twenty')
    await page.getByTestId('week-ahead-details').click()
    check('twenty scored: no word of how the range is built', (await page.getByTestId('week-ahead-sized').count()) === 0 && (await page.getByTestId('week-ahead-model').isVisible()))
    await shot(page, 'alike-open-twenty')
    await ctx.close()
  }
  {
    // Mondays dip: the Monday's bar alone in the accent, a third the height of the others; Details holds the ranges.
    const { ctx, page } = await fresh(NOW)
    await put(page, 'checkins', checkins(NOW, 35, [4, 2, 4, 4, 4, 4, 4]))
    await weekly(page)
    const card = page.getByTestId('week-ahead')
    const values = await card.getByTestId('ahead-value').allTextContents()
    check('the Monday dips', JSON.stringify(values) === JSON.stringify(['75', '75', '75', '75', '25', '75', '75']), values.join(' '))
    const heights = await card.getByTestId('ahead-bar').evaluateAll((bars) => bars.map((b) => b.getBBox().height))
    check('each bar as tall as its reading: the Monday’s a third', heights.length === 7 && heights[0] / heights[4] > 2.8 && heights[0] / heights[4] < 3.2, heights.map((h) => h.toFixed(1)).join(' '))
    check('its bar alone marked lowest', (await card.locator('.wa-bar.is-low').count()) === 1)
    check('no one level said when the days differ', (await page.getByTestId('week-ahead-summary').count()) === 0)
    await shot(page, 'differ-closed')
    await page.getByTestId('week-ahead-details').click()
    const range = await text(page.getByTestId('week-ahead-range'))
    check('Details: the ranges, when the days differ', /^Expected range: \d+–\d+ (each day|tomorrow and \d+–\d+ a week out)\.$/.test(range ?? ''), range ?? 'no line')
    await shot(page, 'differ-open')
    await ctx.close()
  }
  if (SHOTS) {
    // The other two themes, days alike and Details closed.
    for (const theme of ['instrument', 'signal']) {
      const { ctx, page } = await fresh(NOW, theme)
      await put(page, 'checkins', checkins(NOW, 35, [4, 4, 4, 4, 4, 4, 4]))
      await weekly(page)
      await shot(page, `alike-closed-${theme}`)
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}

check('the page reached no host but the site itself', [...hosts].every((h) => h === SITE), `only ${[...hosts].join(', ')}`)
check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
