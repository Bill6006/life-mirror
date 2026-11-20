// Batch 1 of the forecast follow-ups (2026-11-20), item 3, on the live site, in fresh throwaway contexts with stand-in
// records only: nothing touches the owner's data, and no request leaves the browser but to the site itself. The build
// stamp; a check-in whose forecast was moved says so under "Usually", in the approved words, a private item by its name
// only while names are shown; today's forecast in the Brain card's Why carries the same words, a private item always
// as "a private item". Items 1 and 4 change only what Claude is told and checked by, and item 2 an invisible tap area:
// their own tests hold them.
// node live-batch1.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
// SHOTS=<folder> also saves each state at a phone's size, to be set beside the approved frames.
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
const DAY = '2026-09-30'
const BEFORE = '2026-09-29'
const MORNING = ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality']
const EVENING = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']

async function fresh(when) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.addInitScript(() => localStorage.setItem('lm.inStep', '1'))
  await page.clock.setFixedTime(when)
  await page.goto(LIVE)
  return { ctx, page }
}
/**
 * Away to a file of the site's own that runs no app code, so rows are written with no app page open; first, the app's
 * database standing with its stores, since a fresh phone's first open makes them and a page sent away sooner leaves
 * none. It looks at the list of databases first, so it never makes an empty one itself.
 */
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
      const ok = ['checkins', 'forecasts', 'settings', 'privateItems', 'brainBriefs'].every((s) => dbx.objectStoreNames.contains(s))
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
const rowsOf = (page, store) =>
  page.evaluate(async (name) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise((res, rej) => {
      const q = dbx.transaction([name], 'readonly').objectStore(name).getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return rows
  }, store)
function checkin(day, block, hour) {
  const ids = block === 'morning' ? MORNING : EVENING
  const at = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour, 40).toISOString()
  const answers = Object.fromEntries(ids.map((id) => [id, ['mood', 'energy', 'focus'].includes(id) ? 4 : ['stress', 'overwhelm', 'irritation'].includes(id) ? 2 : 3]))
  return { day, block, asked: ids, startedAt: at, completedAt: at, updatedAt: at, answers, activeMs: 60_000 }
}
const forecast = (over = {}) => ({ day: DAY, block: 'morning', horizon: 0, madeOn: DAY, model: 'sameBlock', point: 60, lo: 52, hi: 68, whatIf: null, ...over })
const ITEM = { id: 41, name: 'Late snack', createdAt: '2026-09-01T00:00:00.000Z', archived: 0 }
async function shot(page, name, locator) {
  if (!SHOTS) return
  await page.waitForTimeout(300)
  await locator.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** The morning check-in's summary, its forecast as `row`; returns the usual line and the line under it. */
async function summary(name, row, { names = false, evening = false } = {}) {
  const { ctx, page } = await fresh(new Date(2026, 8, 30, 10, 0))
  await leave(page)
  await put(page, 'checkins', [...(evening ? [checkin(BEFORE, 'evening', 19)] : []), checkin(DAY, 'morning', 7)])
  await put(page, 'privateItems', [ITEM])
  await put(page, 'forecasts', [forecast(row)])
  if (names) await put(page, 'settings', [{ ...((await rowsOf(page, 'settings'))[0] ?? { id: 1 }), showPrivate: true }])
  await page.goto(LIVE)
  await page.getByRole('button', { name: /Logged/ }).click()
  await page.getByTestId('usual-line').waitFor({ state: 'visible' })
  const usual = await text(page.getByTestId('usual-line'))
  const moved = (await page.getByTestId('adjusted-line').count()) ? await text(page.getByTestId('adjusted-line')) : null
  const top = await page.getByTestId('summary').boundingBox()
  const last = await page.getByTestId(moved ? 'adjusted-line' : 'usual-line').boundingBox()
  if (SHOTS && top && last) await page.screenshot({ path: `${SHOTS}/${name}.png`, clip: { x: 0, y: Math.max(0, top.y - 8), width: 390, height: last.y + last.height - top.y + 24 } })
  await ctx.close()
  return { usual, moved }
}

/** Now's Brain card, a line Claude wrote citing today's morning forecast, Why opened; returns the Why's words. */
async function why(name, row) {
  const { ctx, page } = await fresh(new Date(2026, 8, 30, 8, 5))
  await leave(page)
  await put(page, 'privateItems', [ITEM])
  await put(page, 'settings', [{ ...((await rowsOf(page, 'settings'))[0] ?? { id: 1 }), showPrivate: true }])
  await put(page, 'forecasts', [forecast(row)])
  await put(page, 'brainBriefs', [{ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'Keep the morning light: start with one small thing.', mode: 'observation', factIds: ['forecast.morning'], cardIds: [], model: 'claude-opus-5-5', at: `${DAY}T12:00:00.000Z`, writer: 'claude', askedModel: 'opus' }])
  await page.goto(LIVE)
  const card = page.getByTestId('brief')
  await card.getByTestId('brief-why').click()
  const panel = card.getByTestId('brief-why-panel')
  await panel.waitFor({ state: 'visible' })
  const words = await text(panel)
  await shot(page, name, card)
  await ctx.close()
  return words
}

try {
  {
    const { ctx, page } = await fresh(new Date(2026, 8, 30, 10, 0))
    await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }
  const plain = await summary('checkin-unmoved', {})
  check('nothing moved: the usual line alone', plain.usual === 'Usually 60 (52 to 68) at this time.' && plain.moved === null, `${plain.usual} | ${plain.moved}`)
  const dinner = await summary('checkin-morning-moved', { point: 60, lo: 52, hi: 68, adj: -6.2, adjBy: ['night.dinner'] })
  check('moved by last night’s dinner, in the approved words', dinner.moved === 'Adjusted about 6 lower, for a late or heavy dinner last night.', dinner.moved ?? 'no line')
  const short = await summary('checkin-short-night', { adj: -3, adjBy: ['sleep.short'] })
  check('a short night', short.moved === 'Adjusted about 3 lower, for a short night reported yesterday.', short.moved ?? 'no line')
  const band = await summary('checkin-evening-band', { adj: 2.1, adjBy: ['evening.band'] }, { evening: true })
  check('the evening’s band, as it read', band.moved === 'Adjusted about 2 higher, for yesterday evening reading Solid.', band.moved ?? 'no line')
  const named = await summary('checkin-private-named', { point: 62, lo: 54, hi: 70, adj: -4, adjBy: ['private.41'] }, { names: true })
  check('a private item by its name while names are shown', named.moved === 'Adjusted about 4 lower, for Late snack marked last night.', named.moved ?? 'no line')
  const unnamed = await summary('checkin-private-unnamed', { point: 62, lo: 54, hi: 70, adj: -4, adjBy: ['private.41'] })
  check('a private item as "a private item" while they are not', unnamed.moved === 'Adjusted about 4 lower, for a private item marked last night.', unnamed.moved ?? 'no line')
  const two = await summary('checkin-two-things', { point: 59, lo: 51, hi: 67, adj: -7, adjBy: ['sleep.short', 'noticed.raised-voice'] })
  check('a note event and two things joined', two.moved === "Adjusted about 7 lower, for a short night reported yesterday and something Claude noticed in last night's note.", two.moved ?? 'no line')
  check('never "because"', [dinner, short, band, named, unnamed, two].every((x) => !/because/i.test(x.moved ?? '')))
  const whyPlain = await why('why-unmoved', {})
  check('the Why: today’s forecast as before where nothing moved it', (whyPlain ?? '').includes("Today's morning is forecast at 60, 52 to 68.") && !(whyPlain ?? '').includes('Adjusted'), whyPlain ?? 'no panel')
  const whyMoved = await why('why-morning-moved', { adj: -6.2, adjBy: ['night.dinner'] })
  check('the Why: the same words after today’s forecast', (whyMoved ?? '').includes("Today's morning is forecast at 60, 52 to 68. Adjusted about 6 lower, for a late or heavy dinner last night."), whyMoved ?? 'no panel')
  const whyPrivate = await why('why-private', { point: 58, lo: 50, hi: 66, adj: -4, adjBy: ['private.41'] })
  check('the Why: a private item always "a private item", names shown or not', (whyPrivate ?? '').includes("Today's morning is forecast at 58, 50 to 66. Adjusted about 4 lower, for a private item marked last night.") && !(whyPrivate ?? '').includes('Late snack'), whyPrivate ?? 'no panel')
} finally {
  await browser.close()
}

check('the page reached no host but the site itself', [...hosts].every((h) => h === SITE), `only ${[...hosts].join(', ')}`)
check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
