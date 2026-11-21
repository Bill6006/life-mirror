// Batch 2 of the forecast follow-ups (2026-11-21), item 6, on the live site, in fresh throwaway contexts with stand-in
// records only (the browser tests' own, e2e/holdRecords.ts): nothing touches the owner's data, and no request leaves
// the browser but to the site itself. The build stamp; on Mirror's "What comes before your days", a pair at a steady
// pattern 43 days running and more reads as one, and one at a pattern for fewer reads as a lead, each with its Details
// closed until opened, in the approved contract's words; the evening's "Evenings like this one" says tonight's pair in
// the same held standing; and the days are kept on the phone with the build they were worked out under.
// node live-batch2.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
// SHOTS=<folder> also saves each row at a phone's size, to be set beside the approved frames.
import { chromium } from './common.mjs'
import { fortnights, hundredDays } from '../e2e/holdRecords.ts'

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

async function fresh(when) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', locale: 'en-US' })
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
      const ok = ['checkins', 'forecasts', 'settings'].every((s) => dbx.objectStoreNames.contains(s))
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

/** A fresh phone at `when` holding `rows`, the app open again. */
async function seeded(when, rows) {
  const { ctx, page } = await fresh(when)
  await leave(page)
  await put(page, 'checkins', rows)
  await page.goto(LIVE)
  return { ctx, page }
}

/**
 * The stress pair's row once its days are known: its standing, whether its Details were closed, their sentence once
 * opened, and the fold's place. With SHOTS, the screen from `top` to the row's foot, its Details open, as the frames draw it.
 */
async function row(page, within, name, top) {
  const r = within.getByTestId('before-pair').filter({ hasText: 'After an evening with stress high' })
  const known = await r.getByTestId('before-details').waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false)
  const standing = await text(r.getByTestId('before-standing'))
  const closed = (await r.getByTestId('before-details-line').count()) === 0
  const placed = await r.evaluate((li) => {
    const s = li.querySelector('[data-testid="before-standing"]')
    const fold = li.querySelector('[data-testid="before-details"]')?.closest('.disclosure')
    return !!s && !!fold && s.nextElementSibling === fold && fold.querySelector('.d-label')?.textContent === 'Details'
  }).catch(() => false)
  if (known) await r.getByTestId('before-details').click()
  const line = known ? await text(r.getByTestId('before-details-line')) : null
  if (SHOTS) {
    await top.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    const a = await top.boundingBox()
    const b = await r.boundingBox()
    if (a && b) await page.screenshot({ path: `${SHOTS}/${name}.png`, clip: { x: 0, y: Math.max(0, a.y - 8), width: 390, height: b.y + b.height - a.y + 20 } })
  }
  return { known, standing, closed, placed, line }
}

try {
  {
    const { ctx, page } = await fresh(new Date(2026, 10, 30, 10, 0))
    await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await seeded(new Date(2026, 10, 30, 21, 5), hundredDays(new Date(2026, 10, 30), false))
    await page.locator('nav.tabs').getByRole('button', { name: 'Mirror', exact: true }).click()
    const held = await row(page, page, 'mirror-held', page.getByTestId('before-days'))
    check('Mirror: a pair at a pattern 84 days running reads as a steady pattern', held.known && held.standing === 'A steady pattern', `${held.standing}`)
    check('its Details sit under its standing line, labelled Details, closed until opened', held.placed && held.closed)
    check('its Details: since when, and how many days running', held.line === 'A steady pattern since September 8, 84 days running.', held.line ?? 'no line')
    const kept = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('lm.heldPairs') ?? 'null')
      } catch {
        return null
      }
    })
    check('the days are kept on this phone with the build they were worked out under', kept?.v === 1 && typeof kept.build === 'string' && kept.build.startsWith(want) && Object.keys(kept.days ?? {}).length === 100, kept ? `${String(kept.build).slice(0, 7)}, ${Object.keys(kept.days ?? {}).length} days` : 'nothing kept')
    await page.reload()
    await page.locator('nav.tabs').getByRole('button', { name: 'Mirror', exact: true }).click()
    const again = await row(page, page, 'mirror-held-again', page.getByTestId('before-days'))
    check('opened again, the same standing and words', again.standing === 'A steady pattern' && again.line === held.line, `${again.standing} | ${again.line}`)
    await ctx.close()
  }
  {
    const { ctx, page } = await seeded(new Date(2026, 8, 20, 21, 5), fortnights(new Date(2026, 8, 20), false))
    await page.locator('nav.tabs').getByRole('button', { name: 'Mirror', exact: true }).click()
    const lead = await row(page, page, 'mirror-not-yet-held', page.getByTestId('before-days'))
    check('Mirror: a pair at a pattern 2 days running reads as a lead, with how many were looked at', lead.known && lead.standing === 'A lead, not yet a pattern · 1 looked at', `${lead.standing}`)
    check('its Details, closed until opened: how many days, and from how many it is called one', lead.placed && lead.closed && lead.line === 'It has read as a steady pattern 2 days running; it is called one from 43.', lead.line ?? 'no line')
    await ctx.close()
  }
  {
    const { ctx, page } = await seeded(new Date(2026, 10, 30, 21, 5), hundredDays(new Date(2026, 10, 30), true))
    await page.getByRole('button', { name: /^Evening Logged/ }).click()
    const card = page.getByTestId('pattern-card')
    const shown = await card.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false)
    const evening = shown ? await row(page, card, 'evening-held', card) : null
    check('Evenings like this one: tonight’s pair in the held standing, its Details the same', !!evening && evening.standing === 'A steady pattern' && evening.placed && evening.closed && evening.line === 'A steady pattern since September 8, 84 days running.', evening ? `${evening.standing} | ${evening.line}` : 'no card')
    check('worded as an association, never a cause', ((await card.textContent().catch(() => '')) ?? '').includes('an association, never a cause'))
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
