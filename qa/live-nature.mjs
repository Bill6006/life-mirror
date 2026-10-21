// Time in nature (item 2 of 4, 2026-10-21), on the live site, in fresh throwaway contexts with stand-in records only: nothing
// touches the owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set). The evening asks
// "20+ min in nature today, in total" and no longer Outside a while today; Walk somewhere green done counts the day, said
// so; What counts opens one line; without a move in nature the chip waits for a tap, answered at once and kept through a
// relaunch.
// node live-nature.mjs <expected short commit> [screenshot folder]
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium } from './common.mjs'

const want = process.argv[2]
const SHOTS = process.argv[3] ?? null
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const LABEL = '20+ min in nature today, in total'
const WHAT = 'Time spent in green or natural places, such as a park, garden, woods or by water, walking or sitting. Separate times add up.'
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
const text = async (loc) => ((await loc.textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()
const shot = async (loc, name) => {
  if (!SHOTS) return
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  await loc.screenshot({ path: `${SHOTS}/${name}.png` })
}

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

/** Adds one stand-in row to a table of the phone's store. */
const addRow = (page, table, row) =>
  page.evaluate(
    async ({ table, row }) => {
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction([table], 'readwrite')
      tx.objectStore(table).add(row)
      await new Promise((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { table, row },
  )

/** Waits until a read of the store says yes, a few seconds at most: a tap's write takes a moment. */
const until = async (read) => {
  for (let i = 0; i < 20; i++) {
    if (await read()) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

/** Opens the check-in and taps the middle of every reading until the evening's extras; any move asked about is left. */
async function checkIn(page, endId = 'extras') {
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

try {
  {
    // An evening after Walk somewhere green was done that afternoon: thirty minutes somewhere green count the day.
    const { ctx, page } = await fresh(new Date(2026, 9, 23, 19, 5))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await addRow(page, 'outcomes', { offerId: 9001, moveId: 'green-walk', day: '2026-10-23', block: 'afternoon', at: new Date(2026, 9, 23, 15, 0).toISOString(), outcome: 'done', why: null, passiveOutcome: null })
    await page.reload()
    const reached = await checkIn(page)
    const box = page.getByTestId('extras')
    const chip = box.getByTestId('chip-nature')
    check('the evening asks the new mark in its short label, and no longer Outside a while today', reached && (await text(chip)) === LABEL && (await box.getByTestId('chip-outside').count()) === 0, await text(chip))
    check('Walk somewhere green done counts the day: the chip on, and said so', (await chip.getAttribute('aria-pressed')) === 'true' && (await chip.isDisabled()) && (await text(page.getByTestId('nature-from-move'))) === 'Counted from Walk somewhere green.')
    await shot(chip.locator('xpath=..'), 'nature-from-move')
    const closed = (await page.getByTestId('nature-what-text').count()) === 0
    await page.getByTestId('nature-what').click()
    check('What counts opens one line, closed until tapped', closed && (await text(page.getByTestId('nature-what-text'))) === WHAT, await text(page.getByTestId('nature-what-text')))
    await shot(chip.locator('xpath=..'), 'nature-what')
    await ctx.close()
  }
  {
    // An evening with no move in nature: the chip waits for the person's own tap, kept through a relaunch.
    const { ctx, page } = await fresh(new Date(2026, 9, 24, 19, 5))
    const reached = await checkIn(page)
    const chip = page.getByTestId('extras').getByTestId('chip-nature')
    const waiting = reached && (await chip.getAttribute('aria-pressed')) === 'false' && !(await chip.isDisabled()) && (await page.getByTestId('nature-from-move').count()) === 0
    await shot(chip.locator('xpath=..'), 'nature-waiting')
    await chip.click()
    const kept = await until(async () => (await rowsOf(page, 'checkins')).some((c) => c.day === '2026-10-24' && c.block === 'evening' && c.extras?.nature === true))
    check('without one, the chip waits for a tap, and the tap is kept', waiting && kept)
    check('…answered at once from the record: the first time', (await text(page.getByTestId('extras').getByTestId('chip-answer').first())).includes('First time recorded'))
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.waitForTimeout(400)
    await page.reload()
    const after = (await rowsOf(page, 'checkins')).find((c) => c.day === '2026-10-24' && c.block === 'evening')
    check('a relaunch keeps it, as the new mark alone', after?.extras?.nature === true && after?.extras?.outside === undefined)
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
