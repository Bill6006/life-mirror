// The Path request fix (2026-11-21) on the live site, in fresh throwaway contexts with stand-in rows only (the browser
// tests' own, e2e/fixtures/generated.json): nothing touches the owner's data, and no request leaves the browser but to
// the site itself. The build stamp; a request whose Path came back reads "Ready to read." with Read it while the Path is
// still to decide; after Later, after Not this, after a start, and once removed from Aims, the row says where the Path
// stands, with no Read it; a read screen left open in a second window while the Path is started offers no second start,
// and no Later or Not this; and Add's read screen starts a Path removed from Aims again.
// node live-path-request.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
// SHOTS=<folder> also saves the request's row in each state, and the read screen left open, at a phone's size.
import { readFileSync } from 'node:fs'
import { chromium } from './common.mjs'

const want = process.argv[2]
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const SHOTS = process.env.SHOTS ?? null
const GENERATED = JSON.parse(readFileSync(new URL('../e2e/fixtures/generated.json', import.meta.url), 'utf8'))
const GARDEN = GENERATED[0]
const WHEN = new Date(2026, 10, 9, 19, 5)
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
const seen = (loc) => loc.waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false)

async function opened(ctx) {
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.addInitScript(() => localStorage.setItem('lm.inStep', '1'))
  await page.clock.setFixedTime(WHEN)
  await page.goto(LIVE)
  return page
}
async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', locale: 'en-US' })
  return { ctx, page: await opened(ctx) }
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
      const ok = ['checkins', 'forecasts', 'settings', 'pathRequests', 'pathJobs', 'generatedPaths'].every((s) => dbx.objectStoreNames.contains(s))
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
const decisions = (page) =>
  page.evaluate(async (path) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const all = await new Promise((res, rej) => {
      const q = dbx.transaction(['pathVersions'], 'readonly').objectStore('pathVersions').getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return all.filter((v) => v.path === path).map((v) => v.decision)
  }, GARDEN.pathId)

const tab = (page, name) => page.locator('nav.tabs').getByRole('button', { name, exact: true }).click()
async function fromAdd(page) {
  await tab(page, 'Aims')
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId(`aim-kind-path-${GARDEN.pathId}`).click()
  return seen(page.getByTestId('path-read'))
}
/** The request's row: its line, whether it offers Read it; with SHOTS, its card at a phone's size. */
async function row(page, name) {
  const r = page.getByTestId('path-request').filter({ hasText: 'Grow vegetables' })
  await seen(r)
  const line = await text(r.getByTestId('path-request-state'))
  const read = await r.getByTestId('path-request-read').count()
  if (SHOTS) {
    // In the middle of the screen, clear of the tab bar that stays over its foot.
    const card = page.getByTestId('path-requests')
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(300)
    await card.screenshot({ path: `${SHOTS}/${name}.png` })
  }
  return { line, read }
}

try {
  {
    const { ctx, page } = await fresh()
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await fresh()
    await leave(page)
    await put(page, 'pathRequests', [{ id: 1, at: '2026-11-07T03:00:00.000Z', goal: 'Grow vegetables in a small garden bed this summer', minutes: 120, route: 'fits', state: 'queued' }])
    await put(page, 'pathJobs', [{ id: 'job:1', requestId: 1, state: 'ready', at: '2026-11-08T04:00:00.000Z', day: '2026-11-07', pathId: GARDEN.pathId, version: '1' }])
    await put(page, 'generatedPaths', GENERATED)
    await page.goto(LIVE)

    await tab(page, 'Aims')
    const ready = await row(page, 'row-ready')
    check('still to decide: "Ready to read." with Read it', ready.line === 'Ready to read.' && ready.read === 1, `${ready.line} | Read it ${ready.read}`)
    await page.getByTestId('path-request').filter({ hasText: 'Grow vegetables' }).getByTestId('path-request-read').click()
    await page.getByTestId('path-read-later').click()
    await tab(page, 'Aims')
    const later = await row(page, 'row-later')
    check('after Later: set aside, Add still has it, no Read it', later.line === 'Set aside for later: Add still has it.' && later.read === 0, `${later.line} | Read it ${later.read}`)

    await fromAdd(page)
    await page.getByTestId('path-read-notthis').click()
    await page.getByTestId('path-read-notthis-confirm').click()
    await tab(page, 'Aims')
    const declined = await row(page, 'row-not-this')
    check('after Not this, from Add: said so, Add still has it, no Read it', declined.line === 'You chose Not this: Add still has it.' && declined.read === 0, `${declined.line} | Read it ${declined.read}`)

    // A second window of the app reads the Path from Add while the first starts it.
    const other = await opened(ctx)
    const reading = await fromAdd(other)
    const startOffered = (await other.getByTestId('path-read-start').count()) === 1
    await fromAdd(page)
    await page.getByTestId('path-read-start').click()
    await page.getByTestId('path-start-begin').click()
    const open = other.getByTestId('path-read')
    const followed = await seen(open.getByTestId('path-read-started'))
    const line = await text(open.getByTestId('path-read-started'))
    const eyebrow = await text(open.locator('.screen-head .eyebrow'))
    const buttons = (await open.getByTestId('path-read-start').count()) + (await open.getByTestId('path-read-later').count()) + (await open.getByTestId('path-read-notthis').count())
    if (SHOTS) await open.screenshot({ path: `${SHOTS}/read-screen-left-open.png` })
    check('a read screen left open while the Path is started elsewhere: no Start, Later or Not this', reading && startOffered && followed && line === 'Started: it is on your Aims.' && eyebrow === 'A Path you started' && buttons === 0, `${eyebrow} | ${line} | ${buttons} buttons`)
    await open.getByTestId('path-read-close').click()
    check('its Close closes it', (await other.getByTestId('path-read').count()) === 0)
    await other.close()

    await tab(page, 'Aims')
    const started = await row(page, 'row-started')
    check('after a start: on your Aims, no Read it', started.line === 'Started: it is on your Aims.' && started.read === 0, `${started.line} | Read it ${started.read}`)
    const once = await decisions(page)
    check('one start written', JSON.stringify(once) === JSON.stringify(['later', 'notThis', 'started']), once.join(', '))

    const garden = page.locator(`[data-path="${GARDEN.pathId}"][data-kind="path"]`)
    const toggle = garden.getByTestId('path-details')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await garden.getByRole('button', { name: 'Remove', exact: true }).click()
    await garden.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
    const removed = await row(page, 'row-removed')
    check('removed from Aims: said so, Add still has it, no Read it', removed.line === 'Started, then removed from your Aims: Add still has it.' && removed.read === 0, `${removed.line} | Read it ${removed.read}`)
    await fromAdd(page)
    const again = (await page.getByTestId('path-read-start').count()) === 1 && (await page.getByTestId('path-read-started').count()) === 0
    check('Add’s read screen starts it again', again)
    await page.getByTestId('path-read-start').click()
    await page.getByTestId('path-start-begin').click()
    await tab(page, 'Aims')
    const back = await row(page, 'row-started-again')
    check('started again: on your Aims, no Read it', back.line === 'Started: it is on your Aims.' && back.read === 0, `${back.line} | Read it ${back.read}`)
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
