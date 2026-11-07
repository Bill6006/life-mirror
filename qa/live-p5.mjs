// Asking for a Path and a generated Path (P5, 2026-11-07) on the live site, in fresh throwaway contexts with stand-in
// records only: nothing touches the owner's data, and nothing is sent anywhere but the site itself (no cloud token is
// ever set, so a request asked here never leaves the throwaway browser). Make a Path routes a goal by the rules with
// the app's own words, keeps a Path request queued for the cloud, and asks a vague goal again; a generated Path, its
// rows standing in as the phone pulls them, is ready to read, read on one screen, started and run; a strand that waits
// is off until turned on, pauses what it names, and opens the app's own private check, its answers never kept.
// node live-p5.mjs <expected short commit> [screenshot folder]
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { readFileSync } from 'node:fs'
import { chromium, tab } from './common.mjs'

const want = process.argv[2]
const SHOTS = process.argv[3] ?? null
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const GENERATED = JSON.parse(readFileSync(new URL('../e2e/fixtures/generated.json', import.meta.url), 'utf8'))
const [GARDEN, ASKING] = GENERATED
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const seen = async (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
const text = async (loc) => ((await loc.first().textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()

const shot = async (loc, name) => {
  if (!SHOTS) return
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  await loc.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.protocol === 'http:' || u.protocol === 'https:') hosts.add(u.host)
  })
  return { ctx, page }
}

async function rows(page, store) {
  return page.evaluate(async (s) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const all = await new Promise((res, rej) => {
      const q = dbx.transaction([s], 'readonly').objectStore(s).getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return all
  }, store)
}

async function rowsUntil(page, store, ok, ms = 8000) {
  const end = Date.now() + ms
  let last = []
  while (Date.now() < end) {
    last = await rows(page, store)
    if (ok(last)) return last
    await page.waitForTimeout(200)
  }
  return last
}

async function putAll(page, store, list) {
  await page.evaluate(
    async ({ store, list }) => {
      const dbx = await new Promise((res, rej) => {
        const q = indexedDB.open('life-mirror')
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      const tx = dbx.transaction([store], 'readwrite')
      for (const r of list) tx.objectStore(store).put(r)
      await new Promise((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { store, list },
  )
}

async function openMake(page) {
  await tab(page, 'Aims')
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-make-path').click()
}

/** One block of checks: a step that cannot run is a FAIL with its reason, and the next block still runs. */
async function block(name, fn) {
  const { ctx, page } = await fresh()
  try {
    await fn(page)
  } catch (e) {
    check(`${name}: every step ran`, false, String(e).split(/\r?\n/)[0].slice(0, 200))
  } finally {
    await ctx.close()
  }
}

try {
  await block('the build stamp', async (page) => {
    await page.goto(LIVE)
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
  })

  await block('asking for a Path', async (page) => {
    await page.clock.setFixedTime(new Date(2026, 10, 9, 20, 5))
    await page.goto(LIVE)
    await openMake(page)
    const make = page.getByTestId('make-path')
    check('Add holds Make a Path, its intake on one screen', (await seen(make)) && (await text(make)).includes('Where should it show up?') && (await text(make)).includes('Minutes a week'))
    await page.getByTestId('make-path-goal').fill('Grow vegetables in a small garden bed this summer')
    await page.getByTestId('make-path-where-home').click()
    await shot(make, 'p5-make')
    await page.getByTestId('make-path-ask').click()
    const route = page.getByTestId('make-path-route')
    check('a goal the rules route as a Path waits for a draft, never instantly, never in the morning hours', (await route.getAttribute('data-route')) === 'fits' && (await text(route)).includes('never between 9:00 AM and 11:30 AM'), await text(route))
    const requests = await rowsUntil(page, 'pathRequests', (r) => r.length === 1)
    check('the request is kept with its route, queued', requests.length === 1 && requests[0].route === 'fits' && requests[0].state === 'queued')
    const outbox = await rows(page, 'outbox')
    check('it is queued for the cloud, which this throwaway browser never reaches', outbox.some((r) => r.store === 'pathRequests'))
    await page.getByTestId('make-path-done').click()
    await openMake(page)
    await page.getByTestId('make-path-goal').fill('be better')
    await page.getByTestId('make-path-ask').click()
    check('a vague goal is asked again, nothing kept', (await page.getByTestId('make-path-route').getAttribute('data-route')) === 'unclear' && (await rows(page, 'pathRequests')).length === 1)
    await page.getByTestId('make-path-again').click()
    await page.getByTestId('make-path-goal').fill('Make more friends')
    await page.getByTestId('make-path-ask').click()
    check('a goal a Path covers says which, in the app’s own words', (await text(page.getByTestId('make-path-route'))).includes('The Social path covers this'))
    await page.getByTestId('make-path-done').click()
    await tab(page, 'Aims')
    const list = page.getByTestId('path-requests')
    check('Aims lists the requests with where each stands', (await seen(list)) && (await text(list)).includes('Waiting for a draft.') && (await text(list)).includes('The Social path covers this'))
    await shot(list, 'p5-requests')
  })

  await block('a generated Path', async (page) => {
    await page.clock.setFixedTime(new Date(2026, 10, 9, 19, 5))
    await page.goto(LIVE)
    await putAll(page, 'pathRequests', [
      { id: 1, at: '2026-11-07T03:00:00.000Z', goal: 'Grow vegetables in a small garden bed this summer', minutes: 120, route: 'fits', state: 'queued' },
      { id: 2, at: '2026-11-07T03:05:00.000Z', goal: 'Get comfortable asking for help, at a counter and at home', minutes: 120, route: 'fits', state: 'queued' },
    ])
    await putAll(page, 'pathJobs', [
      { id: 'job:1', requestId: 1, state: 'ready', at: '2026-11-08T04:00:00.000Z', day: '2026-11-07', pathId: GARDEN.pathId, version: '1' },
      { id: 'job:2', requestId: 2, state: 'ready', at: '2026-11-08T04:05:00.000Z', day: '2026-11-07', pathId: ASKING.pathId, version: '1' },
    ])
    await putAll(page, 'generatedPaths', GENERATED)
    await page.reload()
    await tab(page, 'Aims')
    const ready = page.getByTestId('path-request').filter({ hasText: 'Grow vegetables' })
    check('a generated Path that came back is ready to read, and offered nowhere yet', (await text(ready.getByTestId('path-request-state'))) === 'Ready to read.' && (await page.locator(`[data-path="${GARDEN.pathId}"][data-kind="path"]`).count()) === 0)
    await ready.getByTestId('path-request-read').click()
    const read = page.getByTestId('path-read')
    check('it is read on one screen, labelled experimental', (await text(read.getByTestId('path-read-label'))) === 'Experimental' && (await text(read)).includes('Garden'))
    await shot(read, 'p5-read')
    await page.getByTestId('path-read-start').click()
    await page.getByTestId('path-start-begin').click()
    const garden = page.locator(`[data-path="${GARDEN.pathId}"][data-kind="path"]`)
    check('started, it runs: its card at its first stage', (await seen(garden)) && (await text(garden)).includes('Planting'))

    await tab(page, 'Aims')
    await page.locator(`[data-testid="path-new"][data-path="${ASKING.pathId}"]`).getByTestId('path-new-read').click()
    await page.getByTestId('path-read-start').click()
    // Counted only once the screen shows, as a count before it draws reads nothing.
    check('a people Path opens on the app’s own two questions', (await seen(page.getByTestId('path-start-question').first())) && (await page.getByTestId('path-start-question').count()) === 2)
    await page.getByTestId('path-start-avoid-no').click()
    await page.getByTestId('path-start-afraid-no').click()
    await page.getByTestId('path-start-focus-asking').click()
    await page.getByTestId('path-start-begin').click()
    const asking = page.locator(`[data-path="${ASKING.pathId}"][data-kind="path"]`)
    check('its strand that waits is off, and no private check shows', (await seen(asking)) && (await asking.getByTestId('path-check').count()) === 0)
    await asking.getByTestId('path-details').click()
    await asking.getByTestId('path-strand-on-together').click()
    const on = await rowsUntil(page, 'aims', (a) => JSON.stringify(a.find((x) => x.path === ASKING.pathId)?.strands) === '["together"]')
    const aim = on.find((x) => x.path === ASKING.pathId)
    check('turning it on pauses what it names, dated', JSON.stringify(aim?.strands) === '["together"]' && aim?.strandsLog?.length === 1)
    const chk = asking.getByTestId('path-check')
    check('its private check opens, the app’s own three questions', (await seen(chk)) && (await chk.getByTestId('path-check-question').count()) === 3)
    await chk.getByTestId('path-check-safety-yes').click()
    check('a yes shows the fixed help', (await text(chk.getByTestId('path-check-help'))).includes('National Domestic Violence Hotline'))
    await shot(chk, 'p5-check')
    await chk.getByTestId('path-check-done').click()
    const after = (await rowsUntil(page, 'aims', (a) => a.find((x) => x.path === ASKING.pathId)?.checkedMonth === '2026-11')).find((x) => x.path === ASKING.pathId)
    check('only the month is kept, never the answers', after?.checkedMonth === '2026-11' && !JSON.stringify(after).includes('safety'))
  })

  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
