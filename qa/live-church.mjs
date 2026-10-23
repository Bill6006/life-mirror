// Sabbath Day and Third Day (Item 3, 2026-10-23), on the live site, in fresh throwaway contexts with stand-in records only:
// nothing touches the owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set). Settings:
// two tabs over the one weekday grid, Saturday and Tuesday chosen, each schedule's times behind Edit times, an edit kept
// through a reload, the block as compact as the Church day was. The day: the Sabbath every block and the Third Day its
// evening, as context only; the Sabbath morning does not ask Out among people and writes nothing for it; a Tuesday morning
// asks it; the Sabbath evening's note asks about a big social day, a Tuesday evening's does not.
// node live-church.mjs <expected short commit> [screenshot folder]
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium } from './common.mjs'

const want = process.argv[2]
const SHOTS = process.argv[3] ?? null
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
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const text = async (loc) => ((await loc.textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()
const seen = async (loc, ms = 8000) => loc.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
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
const values = (page) => page.getByTestId('church-time').evaluateAll((els) => els.map((e) => e.value))

/** Opens the check-in and taps the middle of every reading until `endId`; any move asked about is left. */
async function checkIn(page, endId) {
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
    // Settings on a Tuesday morning.
    const { ctx, page } = await fresh(new Date(2026, 9, 27, 9, 5))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await page.reload()
    const open = async () => {
      await tab(page, 'Settings')
      await page.getByTestId('settings-week').click()
    }
    await open()
    const block = page.getByTestId('church-schedule')
    const days = block.locator('.seg-days .seg-opt')
    check('two tabs, Sabbath Day and Third Day, where the Church day label was, over one weekday grid', (await text(page.getByTestId('church-tab-sabbath'))) === 'Sabbath Day' && (await text(page.getByTestId('church-tab-third'))) === 'Third Day' && (await block.locator('.seg-days').count()) === 1)
    check('the Sabbath chosen first, on Saturday', (await page.getByTestId('church-tab-sabbath').getAttribute('aria-selected')) === 'true' && (await days.nth(6).getAttribute('aria-pressed')) === 'true')
    const head = await block.locator('.church-head').boundingBox()
    const grid = await block.locator('.seg-days').boundingBox()
    const whole = await block.boundingBox()
    check('as compact as the Church day was: one row, then the grid, times closed', head && grid && whole && head.height <= 56 && whole.height <= head.height + grid.height + 24 && (await page.getByTestId('church-times').count()) === 0, `${head?.height} + ${grid?.height} of ${whole?.height}`)
    await shot(block, 'church-closed')
    await page.getByTestId('church-times-open').click()
    check('Edit times opens the Sabbath’s three services', JSON.stringify(await values(page)) === JSON.stringify(['07:30', '14:30', '19:30']), JSON.stringify(await values(page)))
    await shot(block, 'church-sabbath-times')
    await page.getByTestId('church-tab-third').click()
    check('the Third Day: the same grid, Tuesday chosen, its one service at 19:30', (await days.nth(2).getAttribute('aria-pressed')) === 'true' && JSON.stringify(await values(page)) === JSON.stringify(['19:30']))
    await page.getByTestId('church-time-add').click()
    await page.getByTestId('church-time').nth(1).fill('19:00')
    await page.waitForTimeout(400)
    await page.getByTestId('church-time-remove').nth(0).click()
    await days.nth(4).click()
    await page.waitForTimeout(400)
    await page.reload()
    await open()
    await page.getByTestId('church-tab-third').click()
    await page.getByTestId('church-times-open').click()
    check('an edit is kept through a reload: the Third Day on Thursday at 19:00', (await page.getByTestId('church-schedule').locator('.seg-days .seg-opt').nth(4).getAttribute('aria-pressed')) === 'true' && JSON.stringify(await values(page)) === JSON.stringify(['19:00']), JSON.stringify(await values(page)))
    await shot(page.getByTestId('church-schedule'), 'church-third-times')
    await ctx.close()
  }
  {
    // A Saturday: the Sabbath morning asks no Out among people and writes none; its evening's note asks about a big social day.
    const { ctx, page } = await fresh(new Date(2026, 9, 24, 9, 5))
    await checkIn(page, 'give-back')
    const day = (await rowsOf(page, 'days')).find((d) => d.day === '2026-10-24')
    check('the Sabbath morning does not ask Out among people today, and writes no answer for it', (await seen(page.getByTestId('chip-office'))) && (await page.getByTestId('chip-among-people').count()) === 0 && day?.church === 'sabbath' && day?.amongPeople === undefined, JSON.stringify({ church: day?.church, amongPeople: day?.amongPeople }))
    await page.clock.setFixedTime(new Date(2026, 9, 24, 21, 5))
    await page.reload()
    await checkIn(page, 'extras')
    check('the Sabbath evening asks whether it made a big social day, never assumes it', (await text(page.getByTestId('church-ask'))).startsWith('The Sabbath today.') && (await page.getByTestId('chip-bigSocial').getAttribute('aria-pressed')) === 'false')
    await ctx.close()
  }
  {
    // A Tuesday worked from home: its morning asks Out among people; church is its evening alone; its evening asks nothing special.
    const { ctx, page } = await fresh(new Date(2026, 9, 27, 9, 5))
    await checkIn(page, 'give-back')
    const day = (await rowsOf(page, 'days')).find((d) => d.day === '2026-10-27')
    check('a Third Day morning asks Out among people as any day, at home by its week, church its evening alone', (await seen(page.getByTestId('chip-among-people'))) && day?.church === 'third' && JSON.stringify(day?.services) === '["19:30"]' && day?.atOffice === false && day?.amongPeople === undefined, JSON.stringify({ church: day?.church, services: day?.services, atOffice: day?.atOffice }))
    await page.clock.setFixedTime(new Date(2026, 9, 27, 21, 5))
    await page.reload()
    await checkIn(page, 'extras')
    check('a Third Day evening adds no big-social note: an ordinary service is no big social day', (await seen(page.getByTestId('chip-bigSocial'))) && (await page.getByTestId('church-ask').count()) === 0)
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
