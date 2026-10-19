// The owner's six fixes of 2026-10-19 on the live site, in fresh throwaway contexts with stand-in records only: nothing
// touches the owner's data, and nothing is sent anywhere but the site itself (no cloud token is ever set, and the phone's
// location is stood in for). Item 1: a scheduled office day reads Out among people as Yes and does not ask it until Working
// from home is marked. Item 2: a morning asks both Motivation and Confidence. Item 4: a database the browser cleared keeps
// this phone's own choices, Location Context on and a place named (the day changed by hand comes back from the cloud copy,
// which needs a token, so it is held by the browser suite's stand-in cloud instead). Item 5: naming a place says at once
// that it is reading, its buttons wait, a rough reading is followed, and every outcome is said. Item 6: the trip is
// "Out of town / traveling", its meaning kept.
// node live-six-fixes.mjs <expected short commit> [screenshot folder]
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
const text = async (loc) => ((await loc.first().textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()
const HOME = { latitude: 51.50722, longitude: -0.1275, accuracy: 25 }

// Each capture centred on the screen, so the tab bar never covers what it shows.
const shot = async (loc, name) => {
  if (!SHOTS) return
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  await loc.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** A fresh context, the phone's location stood in for at a made-up spot; `state` carries another context's local storage alone. */
async function fresh(state) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', ...(state ? { storageState: state } : {}) })
  await ctx.grantPermissions(['geolocation'], { origin: new URL(LIVE).origin })
  await ctx.setGeolocation(HOME)
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

/** The day's record and its morning check-in, read straight from the phone's database. */
async function record(page, day) {
  return page.evaluate(async (d) => {
    const dbx = await new Promise((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const all = (name) =>
      new Promise((res, rej) => {
        const q = dbx.transaction([name], 'readonly').objectStore(name).getAll()
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
    const [days, checkins] = [await all('days'), await all('checkins')]
    dbx.close()
    return { day: days.find((x) => x.day === d) ?? null, morning: checkins.find((c) => c.day === d && c.block === 'morning') ?? null }
  }, day)
}

/** The phone's location on the open page: the quick read after `quickMs` at `quick` metres across, or a throw; a watch then gives `watched`. */
async function phoneLocation(page, plan) {
  await page.evaluate((p) => {
    const [latitude, longitude] = p.where ?? [51.50722, -0.1275]
    const at = (accuracy) => ({ coords: { latitude, longitude, accuracy }, timestamp: Date.now() })
    navigator.geolocation.getCurrentPosition = (ok) => {
      if (p.quick === 'throws') throw new Error('the location service stopped')
      setTimeout(() => ok(at(p.quick)), p.quickMs ?? 0)
    }
    navigator.geolocation.watchPosition = (ok) => {
      ;(p.watched ?? []).forEach((a, i) => setTimeout(() => ok(at(a)), (i + 1) * (p.stepMs ?? 200)))
      return 1
    }
    navigator.geolocation.clearWatch = () => undefined
  }, plan)
}

try {
  {
    const { ctx, page } = await fresh()
    await page.goto(LIVE)
    await section(page, 'about')
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await ctx.close()
  }

  // Items 1 and 2: the Sunday before, the week holds Mondays at the office; Monday morning's check-in.
  {
    const { ctx, page } = await fresh()
    await page.clock.setFixedTime(new Date(2026, 8, 20, 12, 0))
    await page.goto(LIVE)
    await section(page, 'week')
    const monday = page.getByTestId('office-days').getByRole('button', { name: 'Monday', exact: true })
    await monday.click()
    check('the week holds Mondays at the office', await seen(page.getByTestId('office-days').locator('button[aria-label="Monday"][aria-pressed="true"]')))
    await page.clock.setFixedTime(new Date(2026, 8, 21, 9, 5))
    await page.goto(LIVE)
    check('Monday morning’s check-in reaches its summary', await toSummary(page))
    const office = page.getByTestId('chip-office')
    check('the office row says Working from home today, not marked', (await text(office)).includes('Working from home today') && (await office.getAttribute('aria-pressed')) === 'false', await text(office))
    check('Out among people is not asked on the office day', (await page.getByTestId('chip-among-people').count()) === 0)
    await shot(page.getByTestId('chip-office'), 'six-office-day')
    const r = await record(page, '2026-09-21')
    check('the day keeps that the week scheduled it at the office, and nothing of the owner’s is written by the inference', r.day?.officeDay === true && r.day?.atOffice === true && r.day?.amongPeople === undefined, JSON.stringify({ officeDay: r.day?.officeDay, atOffice: r.day?.atOffice, amongPeople: r.day?.amongPeople }))
    const two = (r.morning?.asked ?? []).filter((id) => id === 'motivation' || id === 'confidence')
    check('the morning asked both Motivation and Confidence, thirteen readings in all', r.morning?.asked?.length === 13 && two.length === 2, `${r.morning?.asked?.length} asked: ${two.join(', ')}`)
    await office.click()
    const among = page.getByTestId('chip-among-people')
    check('marked Working from home, Out among people is asked', await seen(among))
    await among.click().catch(() => {})
    check('and the owner’s answer stands', await seen(page.locator('[data-testid="chip-among-people"][aria-pressed="true"]')))
    await shot(among, 'six-working-from-home')
    await office.click()
    check('at the office again, the question goes', await among.waitFor({ state: 'detached', timeout: 8000 }).then(() => true, () => false))
    await ctx.close()
  }

  // Item 6: the trip's row and screen.
  {
    const { ctx, page } = await fresh()
    await page.goto(LIVE)
    await tab(page, 'Settings')
    const row = page.getByTestId('settings-away')
    check('Settings names the trip Out of town / traveling', (await text(row)).includes('Out of town / traveling'), await text(row))
    await row.click()
    const screen = page.getByTestId('away-screen')
    check('its screen says what it means: away from the normal local area', (await seen(screen)) && (await text(screen)).includes('Away from your normal local area, not at work, a park or a store nearby.'))
    await shot(screen, 'six-out-of-town')
    await ctx.close()
  }

  // Item 5: naming a place.
  {
    const { ctx, page } = await fresh()
    await page.clock.setFixedTime(new Date(2026, 9, 20, 14, 0))
    await page.goto(LIVE)
    await section(page, 'location')
    await page.getByTestId('location-switch').click()
    check('Location Context turns on', await seen(page.locator('[data-testid="location-switch"][aria-pressed="true"]')))
    const status = page.getByTestId('location-name-status')
    await phoneLocation(page, { quick: 25, quickMs: 1500 })
    await page.getByTestId('location-name-home').click()
    check('a tap says at once that it is reading', await seen(status.filter({ hasText: 'Reading where you are. This can take up to half a minute.' }), 1200))
    check('and every button waits for it', (await page.getByTestId('location-name-work').isDisabled()) && (await page.getByTestId('location-name-church').isDisabled()))
    await shot(page.getByTestId('location-name-here'), 'six-naming-reading')
    check('then says it is named', await seen(status.filter({ hasText: 'Named. It is known from now on.' })))
    await phoneLocation(page, { quick: 1800, watched: [900, 30], stepMs: 900, where: [51.51391, -0.09875] })
    await page.getByTestId('location-name-work').click()
    check('a rough reading says how rough, and is followed', await seen(status.filter({ hasText: 'Still reading: the phone’s position is 1800 metres across so far, and a place needs one within 500.' }), 1500))
    await shot(page.getByTestId('location-name-here'), 'six-naming-rough')
    check('until one is good enough to name by', await seen(status.filter({ hasText: 'Named. It is known from now on.' })))
    await phoneLocation(page, { quick: 'throws' })
    await page.getByTestId('location-name-church').click()
    check('a failure that throws is said too', await seen(status.filter({ hasText: 'Reading where you are did not work (the location service stopped). Try again in a moment.' })))
    await ctx.close()
  }

  // Item 4: a database the browser cleared, local storage kept.
  {
    const a = await fresh()
    await a.page.goto(LIVE)
    // Something only the database holds, to tell a new database from the old one.
    await a.page.getByTestId('direction-input').fill('One line, mine')
    await a.page.getByRole('button', { name: 'Keep it', exact: true }).click()
    await section(a.page, 'location')
    await a.page.getByTestId('location-switch').click()
    await a.page.getByTestId('location-name-home').click()
    check('Home named where the phone is', await seen(a.page.getByTestId('location-name-status').filter({ hasText: 'Named. It is known from now on.' })))
    const state = await a.ctx.storageState()
    await a.ctx.close()
    const b = await fresh(state)
    await b.page.goto(LIVE)
    check('a second context starts with local storage alone: the direction kept in the database is gone', await seen(b.page.getByTestId('direction-input')))
    await section(b.page, 'location')
    check('after the clear, Location Context is still on', await seen(b.page.locator('[data-testid="location-switch"][aria-pressed="true"]')))
    check('and Home is still named', (await text(b.page.getByTestId('location-places'))).includes('Home'), await text(b.page.getByTestId('location-places')))
    await shot(b.page.getByTestId('location-places'), 'six-after-clear')
    await b.ctx.close()
  }

  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself', others.length === 0, others.join(', ') || `only ${SITE}`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
