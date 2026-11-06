// The owner's fix of 2026-11-06 on the live site, in fresh throwaway contexts with stand-in records only: nothing touches
// the owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set). A home day marked At the
// office today reads Out among people as Yes and stops asking it, the two facts kept apart (nothing written for the
// inference); a reload keeps it; marked off, the question comes back and the owner's answer stands. A scheduled office day
// still reads it as Yes, and Working from home still asks it. The Sabbath and the Third Day are checked by live-church.mjs.
// node live-office.mjs <expected short commit> [screenshot folder]
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium, tab } from './common.mjs'

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
const seen = async (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
const gone = async (loc, ms = 8000) => loc.waitFor({ state: 'detached', timeout: ms }).then(() => true, () => false)
const text = async (loc) => ((await loc.first().textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()
const pressed = async (loc) => (await loc.getAttribute('aria-pressed', { timeout: 8000 }).catch(() => null)) === 'true'

// Each capture centred on the screen, so the tab bar never covers what it shows.
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
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  return { ctx, page }
}

async function section(page, id) {
  await tab(page, 'Settings')
  await page.getByTestId(`settings-${id}`).click()
}

/** A check-in, every reading at its second anchor, up to its summary. */
async function toSummary(page) {
  await page.getByRole('button', { name: /Check in/ }).click()
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId('give-back').isVisible()) break
    if (await page.getByTestId('extras').isVisible()) await page.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {})
    else if (await page.getByTestId('outcome-ask').isVisible()) await page.getByRole('button', { name: 'Not now', exact: true }).click().catch(() => {})
    else if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(1).click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(200)
  }
  return page.getByTestId('give-back').isVisible()
}

/** The day's record, read straight from the phone's database. */
async function dayRecord(page, day) {
  return page.evaluate(async (d) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const days = await new Promise((res, rej) => {
      const q = dbx.transaction(['days'], 'readonly').objectStore('days').getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return days.find((x) => x.day === d) ?? null
  }, day)
}

/** Waits until the day's record says what is wanted, as a tap's write takes a moment. */
async function dayUntil(page, day, ok, ms = 8000) {
  const end = Date.now() + ms
  let last = null
  while (Date.now() < end) {
    last = await dayRecord(page, day)
    if (last && ok(last)) return last
    await page.waitForTimeout(200)
  }
  return last
}

const facts = (d) => JSON.stringify({ officeDay: d?.officeDay, atOffice: d?.atOffice, amongPeople: d?.amongPeople })

try {
  {
    const { ctx, page } = await fresh()
    await page.goto(LIVE)
    await section(page, 'about')
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }

  // A home day, the week holding no office day: Monday morning's check-in.
  {
    const { ctx, page } = await fresh()
    await page.clock.setFixedTime(new Date(2026, 8, 21, 9, 5))
    await page.goto(LIVE)
    check('Monday morning’s check-in reaches its summary', await toSummary(page))
    const office = page.getByTestId('chip-office')
    const among = page.getByTestId('chip-among-people')
    check('the office row says At the office today, not marked', (await text(office)).includes('At the office today') && !(await pressed(office)), await text(office))
    check('Out among people is asked on the home day', await seen(among))
    await shot(office, 'office-home-day')
    await office.click()
    check('At the office today, tapped once, is marked', await seen(page.locator('[data-testid="chip-office"][aria-pressed="true"]')))
    check('and Out among people is no longer asked: it reads Yes without a second tap', await gone(among))
    const marked = await dayUntil(page, '2026-09-21', (d) => d.atOffice === true)
    check('the day keeps At the office alone: nothing is written for the inference, the two facts apart', marked?.officeDay === false && marked?.atOffice === true && marked?.amongPeople === undefined, facts(marked))
    await shot(office, 'office-marked')
    await page.reload()
    await page.getByTestId('block-row').first().click()
    check('a reload keeps the day as left', (await pressed(page.getByTestId('chip-office'))) && (await page.getByTestId('chip-among-people').count()) === 0)
    await page.getByTestId('chip-office').click()
    const back = page.getByTestId('chip-among-people')
    check('marked off again, Out among people is asked, unanswered', (await seen(back)) && !(await pressed(back)))
    await back.click()
    check('and the owner’s own answer stands', await seen(page.locator('[data-testid="chip-among-people"][aria-pressed="true"]')))
    const own = await dayUntil(page, '2026-09-21', (d) => d.amongPeople === true)
    check('the owner’s own mark is kept as theirs', own?.atOffice === false && own?.amongPeople === true, facts(own))
    await ctx.close()
  }

  // A scheduled office day: the Sunday before, the week holds Mondays at the office.
  {
    const { ctx, page } = await fresh()
    await page.clock.setFixedTime(new Date(2026, 8, 20, 12, 0))
    await page.goto(LIVE)
    await section(page, 'week')
    await page.getByTestId('office-days').getByRole('button', { name: 'Monday', exact: true }).click()
    check('the week holds Mondays at the office', await seen(page.getByTestId('office-days').locator('button[aria-label="Monday"][aria-pressed="true"]')))
    await page.clock.setFixedTime(new Date(2026, 8, 21, 9, 5))
    await page.goto(LIVE)
    check('Monday morning’s check-in reaches its summary', await toSummary(page))
    const office = page.getByTestId('chip-office')
    const among = page.getByTestId('chip-among-people')
    check('the office row says Working from home today, not marked', (await text(office)).includes('Working from home today') && !(await pressed(office)), await text(office))
    check('Out among people is not asked on the office day', (await among.count()) === 0)
    await office.click()
    check('marked Working from home, nothing is inferred from the schedule: Out among people is asked', await seen(among))
    const home = await dayUntil(page, '2026-09-21', (d) => d.atOffice === false)
    check('the day keeps Working from home, with no answer written for Out among people', home?.officeDay === true && home?.atOffice === false && home?.amongPeople === undefined, facts(home))
    await shot(among, 'office-working-from-home')
    await office.click()
    check('at the office again, the question goes', await gone(among))
    await ctx.close()
  }

  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
