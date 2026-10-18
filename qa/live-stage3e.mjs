// Stage 3, item 6, weather as context, on the live site, in fresh throwaway contexts with stand-in records and a
// stand-in place only: nothing touches the owner's data, and the weather service is answered in the page, never reached
// (no cloud token is ever set). Off on a fresh install; its words first, naming the area and the site's address; one
// request a day with nothing in it but the area to one decimal and two dates, and no referrer; the forecast with its
// credit, and on the day's sheet as values only; Evidence's comparisons once 14 days hold weather, and none of it with
// the switch off; and the outdoor moves set aside while rain is forecast for the hour.
// node live-stage3e.mjs <expected short commit>
// LIVE_URL=<url> points it at another copy of the site, such as a local preview, to prove the script itself.
import { chromium } from './common.mjs'

const want = process.argv[2]
const LIVE = process.env.LIVE_URL ?? 'https://bill6006.github.io/life-mirror/'
const SITE = new URL(LIVE).host
const WEATHER = 'api.open-meteo.com'
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}
const errors = []
const hosts = new Set()
const answered = []
// CHROMIUM_PATH=<path> launches that browser instead of Playwright's own, where its own is not installed.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const seen = async (loc, ms = 8000) => loc.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
const text = async (loc) => ((await loc.textContent({ timeout: 8000 }).catch(() => '')) ?? '').trim()

/** Open-Meteo's reply, stood in for: the two days asked, rain in the hours from 13:00 and 14:00 of the second. */
function reply(url) {
  const u = new URL(url)
  const [a, b] = [u.searchParams.get('start_date') ?? '', u.searchParams.get('end_date') ?? '']
  const hours = (d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)
  return JSON.stringify({
    daily_units: { time: 'iso8601', rain_sum: 'mm', showers_sum: 'mm', sunshine_duration: 's', temperature_2m_max: '°C' },
    daily: { time: [a, b], rain_sum: [0.4, 2.1], showers_sum: [0, 0.2], sunshine_duration: [30_600, 18_000], temperature_2m_max: [17.2, 15.6] },
    hourly_units: { time: 'iso8601', rain: 'mm', showers: 'mm' },
    hourly: { time: [...hours(a), ...hours(b)], rain: Array.from({ length: 48 }, (_, i) => (i === 24 + 14 || i === 24 + 15 ? 0.7 : 0)), showers: Array.from({ length: 48 }, () => 0) },
  })
}

/**
 * A moment by London's clock, the stand-in area's own (51.5, -0.1): its pages run in London's zone too, so the check reads
 * the same on any machine (2026-10-18; it once passed only near UTC). British Summer Time holds through 2026-10-24, past
 * every day here.
 */
const london = (month, day, hour, minute = 0) => new Date(Date.UTC(2026, month, day, hour - 1, minute))

async function fresh(when, direction = true) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', timezoneId: 'Europe/London' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => {
    const host = new URL(r.url()).host
    if (host !== WEATHER) hosts.add(host)
  })
  const asked = []
  await page.route(`https://${WEATHER}/**`, (route) => {
    asked.push({ url: route.request().url(), headers: route.request().headers() })
    answered.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: reply(route.request().url()) })
  })
  await page.clock.setFixedTime(when)
  await page.goto(LIVE)
  if (direction) {
    await page.getByTestId('direction-input').fill('One line, mine')
    await page.getByRole('button', { name: 'Keep it', exact: true }).click()
    await page.waitForTimeout(400)
  }
  return { ctx, page, asked }
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

/** Waits until a read says yes, a few seconds at most: a write takes a moment. */
const until = async (read) => {
  for (let i = 0; i < 24; i++) {
    if (await read()) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

/**
 * Sixteen days of stand-in record, each with weather on its day's record, the rainy ones' evenings lower (with `records`),
 * and the place and the switch set. A write the store refuses is reported, never left hanging.
 */
const seed = (page, on, today, records = true) =>
  page.evaluate(
    async ({ on, today, records }) => {
      const asked = ['mood', 'irritation', 'energy', 'stress', 'focus', 'overwhelm']
      const dbx = await new Promise((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction(['checkins', 'days', 'settings'], 'readwrite')
      for (let d = 2; d <= (records ? 17 : 1); d++) {
        const day = `2026-10-${String(d).padStart(2, '0')}`
        const rainy = d % 3 === 0
        for (const [block, p, h] of [['morning', 3, 7], ['evening', rainy ? 2 : 4, 19]]) {
          const answers = Object.fromEntries(asked.map((id) => [id, ['stress', 'overwhelm', 'irritation'].includes(id) ? 6 - p : p]))
          const at = new Date(Date.UTC(2026, 9, d, h - 1, 40)).toISOString()
          tx.objectStore('checkins').add({ day, block, asked, startedAt: at, completedAt: at, updatedAt: at, answers, activeMs: 60_000 })
        }
        tx.objectStore('days').put({ day, weekday: new Date(Date.UTC(2026, 9, d)).getUTCDay(), withHer: true, studyNight: false, churchDay: false, atOffice: false, pickupTime: null, soloUntil: '20:00', light: { rise: '07:10', set: '18:20' }, changed: false, createdAt: `${day}T06:00:00.000Z`, weather: { rain: rainy ? 6.4 : 0.2, sun: d % 2 ? 8.5 : 2.5, high: 15, at: `${day}T08:00:00.000Z` } })
      }
      if (today) tx.objectStore('days').put({ day: today, weekday: 0, withHer: true, studyNight: false, churchDay: false, atOffice: false, pickupTime: null, soloUntil: '20:00', light: { rise: '07:12', set: '18:18' }, changed: false, createdAt: `${today}T06:00:00.000Z`, weather: { rain: 2.3, sun: 5, high: 15.6, at: `${today}T08:00:00.000Z`, hours: Array.from({ length: 24 }, (_, h) => (h === 13 || h === 14 ? 0.7 : 0)) } })
      const store = tx.objectStore('settings')
      const row = await new Promise((res) => {
        const q = store.get(1)
        q.onsuccess = () => res(q.result)
      })
      store.put({ ...(row ?? {}), id: 1, place: { lat: 51.5, lon: -0.1 }, weather: { on } })
      await new Promise((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
        tx.onabort = () => rej(tx.error)
      })
      dbx.close()
    },
    { on, today, records },
  )

try {
  {
    // A fresh install: off, its words first, Not now, then on: one request with nothing but the area and two dates.
    const { ctx, page, asked } = await fresh(london(9, 18, 9, 30))
    await tab(page, 'Settings')
    await page.getByTestId('settings-about').click()
    const commit = (await page.getByTestId('build-commit').textContent())?.trim()
    check('the build stamp is the pushed commit', commit === want, `shows ${commit}`)
    await page.reload()
    await tab(page, 'Settings')
    await page.getByTestId('settings-week').click()
    const sw = page.getByTestId('weather-switch')
    check('Weather for your area is off on a fresh install', (await sw.getAttribute('aria-pressed', { timeout: 8000 }).catch(() => null)) === 'false' && (await text(sw)).includes('Off. Nothing is asked of any weather service.'))
    await page.getByTestId('place-field').fill('51.46, -0.13', { timeout: 8000 }).catch(() => undefined)
    await page.getByTestId('place-field').press('Enter').catch(() => undefined)
    await sw.click({ timeout: 8000 }).catch(() => undefined)
    const words = await text(page.getByTestId('weather-words'))
    check('its words come first, naming the area to one decimal, the site’s address and the terms', words.includes('your area to one decimal, about 11 km: 51.5, -0.1') && words.includes(`and this site’s address, ${SITE}`) && words.includes('for 90 days'), words.slice(0, 60))
    await page.getByTestId('weather-not-now').click({ timeout: 8000 }).catch(() => undefined)
    check('Not now leaves it off, and nothing is asked', (await sw.getAttribute('aria-pressed', { timeout: 8000 }).catch(() => null)) === 'false' && asked.length === 0)
    await sw.click({ timeout: 8000 }).catch(() => undefined)
    await page.getByTestId('weather-on').click({ timeout: 8000 }).catch(() => undefined)
    const status = page.getByTestId('weather-status')
    await until(async () => (await text(status)).includes('Today’s forecast'))
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.1&daily=rain_sum,showers_sum,sunshine_duration,temperature_2m_max&hourly=rain,showers&timezone=auto&start_date=2026-10-17&end_date=2026-10-18'
    check('turned on, one request, naming nothing but the area to one decimal and two dates, with no referrer', asked.length === 1 && asked[0].url === url && asked[0].headers.referer === undefined, `${asked.length} asked`)
    const credit = page.getByTestId('weather-credit')
    check('the forecast shows, with its credit to Open-Meteo', (await text(status)).includes('Today’s forecast: 2.3 mm of rain, 5 hours of sun') && (await credit.getAttribute('href', { timeout: 8000 }).catch(() => null)) === 'https://open-meteo.com/')
    const sheet = await until(async () => {
      const row = (await rowsOf(page, 'facts')).find((r) => r.day === '2026-10-18')
      const f = row?.sheet.facts.find((x) => x.id === 'weather.today')
      return f && JSON.stringify(f.values) === JSON.stringify({ rain: 2.3, sun: 5, high: 16, highF: 60 })
    })
    check('the day’s sheet carries today’s forecast, values only', sheet)
    await page.reload()
    await page.waitForTimeout(1500)
    check('a reload asks nothing more today', asked.length === 1, `${asked.length} asked`)
    await ctx.close()
  }
  {
    // Sixteen days with weather: Evidence's comparisons, with their credit; switched off, none of it.
    const { ctx, page } = await fresh(london(9, 18, 19, 30))
    await seed(page, true, null)
    await page.reload()
    await tab(page, 'Moves')
    await page.getByRole('button', { name: /^Evidence/ }).click({ timeout: 8000 }).catch(() => undefined)
    const rain = await text(page.getByTestId('weather-rain-line'))
    check('Evidence sets rainy days against dry ones, like for like, with the credit', rain === 'Rainy days, 1 mm of rain or more: 5 of 16 days with weather. Like for like on the morning’s band, the evening read 50 points lower than on dry days (5 and 11 evenings).' && (await seen(page.getByTestId('weather-evidence-credit'))), rain.slice(0, 60))
    await seed(page, false, null, false)
    await page.reload()
    await tab(page, 'Moves')
    await page.getByRole('button', { name: /^Evidence/ }).click({ timeout: 8000 }).catch(() => undefined)
    await seen(page.getByTestId('nothing-line'))
    // The section reads its own records after the screen shows: absent means absent for a while, not at the first look.
    let absent = true
    for (let i = 0; i < 8; i++) {
      if ((await page.getByTestId('weather-rain-line').count()) > 0) absent = false
      await page.waitForTimeout(250)
    }
    check('switched off, none of it shows', absent)
    await ctx.close()
  }
  {
    // Rain forecast for the hour, the switch on: the afternoon's draw sets the outdoor moves aside for rain.
    const { ctx, page } = await fresh(london(9, 18, 13, 30), false)
    await seed(page, true, '2026-10-18')
    await page.reload()
    await page.getByRole('button', { name: /Check in/ }).click({ timeout: 8000 }).catch(() => undefined)
    for (let i = 0; i < 30; i++) {
      if (await page.getByTestId('give-back').isVisible()) break
      const title = await page.locator('#ci-title').textContent({ timeout: 3000 }).catch(() => null)
      if (title === null) {
        await page.waitForTimeout(300)
        continue
      }
      await page.getByTestId('anchor').nth(2).click({ timeout: 5000 }).catch(() => undefined)
      await page.locator('#ci-title', { hasNotText: title }).or(page.getByTestId('give-back')).first().waitFor({ timeout: 8000 }).catch(() => undefined)
    }
    let excluded = null
    await until(async () => {
      const drawn = (await rowsOf(page, 'offers')).find((o) => o.block === 'afternoon' && o.draw)
      excluded = drawn?.draw.excluded.rain ?? null
      return excluded !== null
    })
    check('while rain is forecast for the hour, the outdoor moves wait', JSON.stringify([...(excluded ?? [])].sort()) === JSON.stringify(['green-walk', 'sit-outside-five', 'walk-ten']), JSON.stringify(excluded))
    await ctx.close()
  }
  const others = [...hosts].filter((h) => h !== SITE)
  check('the page reached no host but the site itself; the weather service was answered in the page, never reached', others.length === 0 && answered.every((u) => new URL(u).host === WEATHER), others.join(', ') || `only ${SITE}; ${answered.length} weather requests answered in the page`)
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
}
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} of ${results.length} passed`)
