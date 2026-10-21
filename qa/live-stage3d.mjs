// Stage 3, item 5, the check-in and the readings put to use, on the live site, in fresh throwaway contexts with
// stand-in records only: nothing touches the owner's data, and nothing is sent anywhere but the site itself (no
// cloud token is ever set). Both Motivation and Confidence each morning (one in turn until the owner's fix of
// 2026-10-19, this check restated with it); the optional taps above the move, and an
// untouched move drawn again when a chip changes the day; Out among people today; When was the last?; the two sleep
// readings asked late after a morning without them; time in nature and Something sweet; your own chips; and
// the expectancy tap after a People rep.
// node live-stage3d.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium } from './common.mjs'

const want = process.argv[2]
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()
// CHROMIUM_PATH=<path> launches that browser instead of Playwright's own, where its own is not installed.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const seen = async (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
const text = async (loc) => ((await loc.textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()

async function fresh(when) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.clock.setFixedTime(when)
  await page.goto(LIVE)
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.waitForTimeout(400)
  return { ctx, page }
}
const tab = async (page, name) => {
  await page.locator('nav.tabs').getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(300)
}

/** Reads every row of one table of the phone's store. */
const rowsOf = (page, table) =>
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
  }, table)

/** Waits until a read of the store says yes, a few seconds at most: a tap's write takes a moment. */
const until = async (read) => {
  for (let i = 0; i < 20; i++) {
    if (await read()) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

/** Opens the check-in and taps the middle of every reading until its summary or the evening's extras; any move asked about is left. */
async function checkIn(page, endId = 'give-back') {
  await page.getByRole('button', { name: /Check in/ }).click()
  for (let i = 0; i < 30; i++) {
    const end = page.getByTestId(endId)
    if (await end.isVisible()) return true
    const ask = page.getByTestId('outcome-ask')
    if (await ask.isVisible()) {
      await page.getByRole('button', { name: /^(Not now|Leave it unanswered)$/ }).click()
      await page.waitForTimeout(300)
      continue
    }
    const title = await page.locator('#ci-title').textContent({ timeout: 3000 }).catch(() => null)
    if (title === null) {
      await page.waitForTimeout(300)
      continue
    }
    await page.getByTestId('anchor').nth(2).click({ timeout: 5000 }).catch(() => undefined)
    await page.locator('#ci-title', { hasNotText: title }).or(end).or(ask).first().waitFor({ timeout: 8000 }).catch(() => undefined)
  }
  return page.getByTestId(endId).isVisible()
}
const top = (page, testid) => page.getByTestId(testid).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY).catch(() => -1)

try {
  {
    // A Monday morning: both Motivation and Confidence asked; the optional taps above the move; a chip draws it again.
    const { ctx, page } = await fresh(new Date(2026, 9, 19, 9, 5))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await page.reload()
    const done = await checkIn(page)
    const morning = (await rowsOf(page, 'checkins')).find((c) => c.block === 'morning')
    const turn = (morning?.asked ?? []).filter((id) => id === 'motivation' || id === 'confidence')
    check('the morning asks thirteen readings, both Motivation and Confidence', done && morning?.asked.length === 13 && turn.length === 2, `${morning?.asked.length} asked, ${turn.join(', ')}`)
    const [caffeine, chips, move, readings] = [await top(page, 'caffeine'), await top(page, 'chip-office'), await top(page, 'move-card'), await top(page, 'reading-row')]
    check('Caffeine and Today, if different sit above the move, and the move above the readings', caffeine >= 0 && chips >= 0 && caffeine < move && chips < move && move < readings, `${caffeine} ${chips} ${move} ${readings}`)
    check('Out among people today is the fourth Today chip', (await text(page.getByTestId('chip-among-people'))).includes('Out among people today'))
    await page.getByTestId('chip-office').click({ timeout: 8000 }).catch(() => undefined)
    check('a chip that changes the day draws the untouched move again, and the card says so', (await text(page.getByTestId('move-redrawn'))) === 'Drawn again for the day as it is now.')
    await page.getByTestId('caffeine-1').click({ timeout: 8000 }).catch(() => undefined)
    const last = await seen(page.getByTestId('caffeine-last'))
    await page.getByTestId('caffeine-last-underHour').click({ timeout: 8000 }).catch(() => undefined)
    const kept = await until(async () => (await rowsOf(page, 'checkins')).some((c) => c.block === 'morning' && c.extras?.caffeineIntake?.last === 'underHour'))
    check('once caffeine is reported, When was the last? asks, and the answer is kept', last && kept)
    await ctx.close()
  }
  {
    // An afternoon after no morning: the two sleep readings first, each said to be asked late.
    const { ctx, page } = await fresh(new Date(2026, 9, 19, 14, 5))
    await page.getByRole('button', { name: /Check in/ }).click()
    const first = await text(page.locator('#ci-title'))
    const note = await text(page.getByTestId('asked-late'))
    check('after a morning without them, the afternoon asks Sleep hours first, marked asked late', first === 'Sleep hours' && note.startsWith('Asked late, about last night'), `${first} | ${note}`)
    await ctx.close()
  }
  {
    // An evening: your own chip added under Settings after it says where a label goes, then asked beside the others.
    const { ctx, page } = await fresh(new Date(2026, 9, 19, 19, 5))
    await tab(page, 'Settings')
    await page.getByTestId('settings-extras').click({ timeout: 8000 }).catch(() => undefined)
    const where = await text(page.getByTestId('own-chip-where'))
    await page.getByTestId('own-chip-input').fill('Stand-in chip', { timeout: 8000 }).catch(() => undefined)
    await page.getByTestId('own-chip-add').click({ timeout: 8000 }).catch(() => undefined)
    const added = await seen(page.getByTestId('own-chip-row').filter({ hasText: 'Stand-in chip' }))
    check('Your own chips says where a label goes before it is saved, and keeps one', where.includes('No model reads it now') && added, where.slice(0, 60))
    await page.locator('.sub-head .back').click({ timeout: 8000 }).catch(() => undefined)
    await tab(page, 'Now')
    const extras = await checkIn(page, 'extras')
    const box = page.getByTestId('extras')
    check('the evening asks time in nature and Something sweet among the chips', extras && (await seen(box.getByTestId('chip-nature'))) && (await seen(box.getByTestId('chip-sweet'))))
    check('…and your own chip by its label', await seen(box.getByRole('button', { name: 'Stand-in chip' })))
    await ctx.close()
  }
  {
    // The People row: a rep done, then one optional tap against what was expected.
    const { ctx, page } = await fresh(new Date(2026, 9, 19, 9, 5))
    await tab(page, 'Aims')
    await page.getByRole('button', { name: /^Add a commitment/ }).click({ timeout: 8000 }).catch(() => undefined)
    await page.getByTestId('aim-kind-path-social').click({ timeout: 8000 }).catch(() => undefined)
    await tab(page, 'Now')
    await page.locator('[data-kind="path"]').getByTestId('aim-start').click({ timeout: 8000 }).catch(() => undefined)
    // A tap's write takes a moment: reload only once the row shows the rep started.
    await seen(page.locator('[data-kind="path"]').getByTestId('aim-started'))
    await page.clock.setFixedTime(new Date(2026, 9, 19, 9, 20))
    await page.reload()
    await page.locator('[data-kind="path"]').getByTestId('aim-done').click({ timeout: 8000 }).catch(() => undefined)
    const ask = page.locator('[data-kind="path"]').getByTestId('path-expect-tap')
    const asked = (await seen(ask)) && (await text(ask)).includes('Easier than you expected, about as expected, or harder?')
    await ask.getByTestId('path-expect-harder').click({ timeout: 8000 }).catch(() => undefined)
    const stored = await until(async () => (await rowsOf(page, 'outcomes')).some((x) => x.outcome === 'done' && x.expectancy === 'harder'))
    check('after a People rep is done, one tap against what was expected, kept on its answer', asked && stored, `asked ${asked}, kept ${stored}`)
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
