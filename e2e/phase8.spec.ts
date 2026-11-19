import { expect, test, type Page } from '@playwright/test'
import { challengerRecord, SEED_ITEM, SEED_TYPE, SEED_TYPE_LABEL } from './challengerSeed'
import { putRows } from './noticedSeed'

// The forecast's challenger (Phase 8, 2026-11-19), in the browser, on a stand-in record: the writer moves today's
// morning by a private item and a note event the evening before, and the Weekly View keeps its UI, naming neither
// (fix 9: "it never names a private item or a note event, and says "a private item" at most").

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  // The phone here has read its cloud before, so its ids run from one.
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

// The record's last day is the day before this one, and its morning is still to come.
const TODAY = '2026-09-18'
const WHEN = new Date(2026, 8, 18, 8, 0)

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

test('the writer moves today’s morning by a private item and a note event, and the Weekly View names neither', async ({ page }) => {
  test.setTimeout(120_000)
  await page.clock.setFixedTime(WHEN)
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  const { checkins, events } = challengerRecord(TODAY)
  await putRows(page, 'checkins', checkins)
  await putRows(page, 'privateItems', [SEED_ITEM])
  await putRows(page, 'noteEvents', events)
  await page.reload()
  // The writer runs at the open: today's morning is written moved, by both.
  let morning: Record<string, unknown> | undefined
  await expect
    .poll(async () => {
      morning = (await rowsOf(page, 'forecasts')).find((f) => f.day === TODAY && f.block === 'morning' && f.horizon === 0)
      return Array.isArray(morning?.adjBy) ? (morning?.adjBy as string[]).slice().sort() : null
    }, { timeout: 60_000 })
    .toEqual([`noticed.${SEED_TYPE}`, `private.${SEED_ITEM.id}`].sort())
  expect(['sameBlock', 'weekdayBlock', 'lastValue', 'blend']).toContain(morning?.model)
  expect(morning?.adj as number).toBeLessThan(0)
  // The Weekly View, as ever: it shows the forecast's way, and names neither the item nor the event, nor their ids.
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  const weekly = page.getByTestId('weekly')
  await expect(weekly).toBeVisible()
  await expect(page.getByTestId('week-ahead-model')).toBeVisible()
  const shown = (await weekly.innerText()).toLowerCase()
  for (const never of [SEED_ITEM.name, SEED_TYPE_LABEL, SEED_TYPE, `private.${SEED_ITEM.id}`, 'noticed.']) expect(shown, never).not.toContain(never.toLowerCase())
})
