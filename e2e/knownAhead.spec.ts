import { expect, test, type Page } from '@playwright/test'
import { buildSync } from 'esbuild'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { leaveApp } from './closedApp'
import { putRows } from './noticedSeed'

// Stage C of the week ahead switched on (2026-11-23, at the owner's word), in the browser, on stand-in records only:
// the records of src/knownAheadTesting.ts, built here at run time and seeded straight into the phone's stores. On each
// record where one of Stage C's ways is in use, the writer at the open writes the day by that way, and the Weekly View
// draws its seven bars with the lowest marked, never says the week as one level nor its days alike, and names the way
// under Details in its approved sentence, word for word. On a record with nothing there, the four's pick writes the day
// and the card is exactly as before Stage C.

type Seed = typeof import('../src/knownAheadTesting')
type StandIn = ReturnType<Seed['standIn']>
let seed: Seed
test.beforeAll(async () => {
  const out = resolve(`node_modules/.cache/known-ahead/seed-${process.pid}.mjs`)
  buildSync({ entryPoints: [resolve('src/knownAheadTesting.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' })
  seed = (await import(pathToFileURL(out).href)) as Seed
})

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lm.inStep', '1')
    } catch {
      // A page without local storage counts as in step anyway.
    }
  })
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

// The stand-in records' last day is the day before this one, and its morning is still to come.
const TODAY = '2026-11-23'
const WHEN = new Date(2026, 10, 23, 6, 0)
const FOUR = ['sameBlock', 'weekdayBlock', 'lastValue', 'blend']

/** Every row of one of the phone's stores. */
const rowsOf = (page: Page, store: string): Promise<Record<string, unknown>[]> =>
  page.evaluate(async (name) => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('life-mirror')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const all = await new Promise<Record<string, unknown>[]>((res, rej) => {
      const r = dbx.transaction([name], 'readonly').objectStore(name).getAll()
      r.onsuccess = () => res(r.result as Record<string, unknown>[])
      r.onerror = () => rej(r.error)
    })
    dbx.close()
    return all
  }, store)

/** A fresh phone at the day's start, the record seeded with no app page open, then the app again: its writer runs at the open. */
async function seeded(page: Page, s: StandIn): Promise<Record<string, unknown>[]> {
  await page.clock.setFixedTime(WHEN)
  await page.goto('./')
  await leaveApp(page)
  await putRows(page, 'checkins', s.checkins as unknown as Record<string, unknown>[])
  await putRows(page, 'days', s.days as unknown as Record<string, unknown>[])
  await page.goto('./')
  let rows: Record<string, unknown>[] = []
  await expect
    .poll(async () => {
      rows = (await rowsOf(page, 'forecasts')).filter((f) => f.madeOn === TODAY)
      return rows.length
    }, { timeout: 120_000 })
    .toBeGreaterThan(20)
  return rows
}

async function weekly(page: Page): Promise<void> {
  await page.locator('nav.tabs').getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await expect(page.getByTestId('week-ahead')).toBeVisible()
}

const WAYS: readonly { name: string; way: string; record: (s: Seed) => StandIn; sentence: string }[] = [
  {
    name: 'a weekday rhythm in every reading, by the score’s own test inside Stage C',
    way: 'levelWeekday',
    record: (s) => s.standIn({ steps: (_d, w) => s.TWO_READINGS[w] }),
    sentence: 'Expected from your usual level at this time of day and how this weekday usually differs. This way is used only after clear weekday differences have held for four weeks.',
  },
  {
    name: 'a weekday rhythm in two readings',
    way: 'levelReadings',
    // Mood by weekday at a step and a half, energy the other way round: the readings' own tests held, the score's not, and the days still apart.
    record: (s) => s.standIn({ steps: (_d, w, _b, id) => (id === 'mood' ? 1.5 * s.TWO_READINGS[w] : id === 'energy' ? -0.6 * s.TWO_READINGS[w] : 0), wobble: s.twoReadingsWobble }),
    sentence: 'Expected from your usual level at this time of day and how this weekday usually differs in some of your readings. This way is used only after clear weekday differences have held for four weeks.',
  },
  {
    name: 'sunshine that drives the day, with its forecasts kept',
    way: 'levelWeather',
    record: (s) => s.standIn({ steps: s.bySunshine(), weather: true }),
    sentence: 'Expected from your usual level at this time of day and the weather forecast for the day. This way is used only after a clear tie between the weather and your days has held for four weeks.',
  },
  {
    name: 'the weekday rhythm and the sunshine together',
    way: 'levelWeekdayWeather',
    record: (s) => s.standIn({ steps: (d, w, b, id, turn) => s.TWO_READINGS[w] + s.bySunshine()(d, w, b, id, turn), weather: true }),
    sentence: 'Expected from your usual level at this time of day, how this weekday usually differs and the weather forecast for the day. Each part is used only after it has held clearly for four weeks.',
  },
]

for (const w of WAYS) {
  test(`switched on, on ${w.name}: the day is written by ${w.way}, and the week ahead draws its days apart and names the way in its own words`, async ({ page }) => {
    test.setTimeout(240_000)
    const rows = await seeded(page, w.record(seed))
    // Every row the day's run wrote is the way's, and keeps beside it what the four would have written.
    expect(rows.every((f) => f.model === w.way)).toBe(true)
    expect(rows.filter((f) => f.four !== undefined).length).toBeGreaterThan(20)
    expect(rows.every((f) => (f.weather !== undefined) === w.way.endsWith('Weather'))).toBe(true)
    await weekly(page)
    const ahead = page.getByTestId('week-ahead')
    await expect(ahead.getByTestId('ahead-bar')).toHaveCount(7)
    // The days differ: drawn day by day, the lowest marked, never said as one level.
    expect(await ahead.locator('.wa-bar.is-low').count()).toBeGreaterThan(0)
    await expect(page.getByTestId('week-ahead-summary')).toHaveCount(0)
    await page.getByTestId('week-ahead-details').click()
    await expect(page.getByTestId('week-ahead-model')).toHaveText(w.sentence)
    await expect(page.getByTestId('week-ahead-model')).not.toContainText(/come out alike|of four ways|does not tell one weekday/)
    await expect(page.getByTestId('week-ahead-range')).toBeVisible()
  })
}

test('switched on, on a record with nothing there: the four’s pick writes the day, and the card is exactly as before Stage C', async ({ page }) => {
  test.setTimeout(240_000)
  const rows = await seeded(page, seed.standIn({}))
  expect(rows.every((f) => FOUR.includes(f.model as string))).toBe(true)
  expect(rows.every((f) => f.four === undefined && f.stageB === undefined && f.weather === undefined)).toBe(true)
  await weekly(page)
  await expect(page.getByTestId('week-ahead').getByTestId('ahead-bar')).toHaveCount(7)
  await page.getByTestId('week-ahead-details').click()
  await expect(page.getByTestId('week-ahead-model')).toContainText('of four ways to forecast, the one that came closest a day ahead over your last four weeks.')
})
