import { expect, test, type Page } from '@playwright/test'
import { leaveApp } from './closedApp'

// The forecast follow-ups, Batch 1 (2026-11-20, at the owner's word), item 3: a check-in says when its forecast was
// moved, under "Usually" in the same small style, in the approved contract's words; a private item by its name only
// while names are shown outside its screen; the evening's band as that evening read. Stand-in records only, written
// with no app page open.

const DAY = '2026-09-30'
const BEFORE = '2026-09-29'
const MORNING = ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality']
const EVENING = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']

/** Writes rows straight into one of the phone's stores, with no app page open. */
async function put(page: Page, store: string, list: unknown[]): Promise<void> {
  await page.evaluate(
    async ({ name, rows }) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction([name], 'readwrite')
      for (const row of rows) tx.objectStore(name).put(row)
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { name: store, rows: list },
  )
}

async function rowsOf(page: Page, store: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (name) => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise<Record<string, unknown>[]>((res, rej) => {
      const q = dbx.transaction([name], 'readonly').objectStore(name).getAll()
      q.onsuccess = () => res(q.result as Record<string, unknown>[])
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return rows
  }, store)
}

/** A complete check-in, every reading at the level the record's other tests use (mood, energy and focus 4). */
function checkin(day: string, block: 'morning' | 'evening', hour: number): Record<string, unknown> {
  const ids = block === 'morning' ? MORNING : EVENING
  const at = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour, 40).toISOString()
  const answers = Object.fromEntries(ids.map((id) => [id, ['mood', 'energy', 'focus'].includes(id) ? 4 : ['stress', 'overwhelm', 'irritation'].includes(id) ? 2 : 3]))
  return { day, block, asked: ids, startedAt: at, completedAt: at, updatedAt: at, answers, activeMs: 60_000 }
}

/** Today's morning forecast, as the challenger leaves a row it moved. */
const moved = (over: Record<string, unknown> = {}) => ({ day: DAY, block: 'morning', horizon: 0, madeOn: DAY, model: 'sameBlock', point: 60, lo: 52, hi: 68, whatIf: null, adj: -6.2, adjBy: ['night.dinner'], ...over })

/** Today's morning check-in, done, opened from Now. */
async function openMorning(page: Page): Promise<void> {
  await page.goto('./')
  await page.getByRole('button', { name: /Logged/ }).click()
  await expect(page.getByTestId('summary')).toBeVisible()
}

async function seed(page: Page, write: () => Promise<void>): Promise<void> {
  await page.clock.setFixedTime(new Date(2026, 8, 30, 10, 0))
  await page.goto('./')
  await leaveApp(page)
  await write()
}

test('item 3: the check-in says by about how much its forecast was moved, and for what, under "Usually" in the same small style; nothing on a day it was not moved', async ({ page }) => {
  await seed(page, async () => {
    await put(page, 'checkins', [checkin(DAY, 'morning', 7)])
    await put(page, 'forecasts', [moved()])
  })
  await openMorning(page)
  await expect(page.getByTestId('usual-line')).toHaveText('Usually 60 (52 to 68) at this time.')
  await expect(page.getByTestId('adjusted-line')).toHaveText('Adjusted about 6 lower, for a late or heavy dinner last night.')
  const same = await page.evaluate(() => {
    const u = document.querySelector('[data-testid="usual-line"]') as HTMLElement
    const a = document.querySelector('[data-testid="adjusted-line"]') as HTMLElement
    const su = getComputedStyle(u)
    const sa = getComputedStyle(a)
    return u.nextElementSibling === a && u.className === a.className && su.fontSize === sa.fontSize && su.color === sa.color
  })
  expect(same).toBe(true)
  // The same row as it would stand had nothing moved it: the line goes, and the usual one stays.
  await leaveApp(page)
  const row = (await rowsOf(page, 'forecasts')).find((f) => f.day === DAY && f.block === 'morning') as Record<string, unknown>
  const { adj, adjBy, ...plain } = row
  expect([adj, adjBy]).toEqual([-6.2, ['night.dinner']])
  await put(page, 'forecasts', [plain])
  await openMorning(page)
  await expect(page.getByTestId('usual-line')).toHaveText('Usually 60 (52 to 68) at this time.')
  await expect(page.getByTestId('adjusted-line')).toHaveCount(0)
})

test('item 3: a private item is named on the check-in only while names are shown outside its screen', async ({ page }) => {
  await seed(page, async () => {
    await put(page, 'checkins', [checkin(DAY, 'morning', 7)])
    await put(page, 'privateItems', [{ id: 41, name: 'Stand-in item', createdAt: '2026-09-01T00:00:00.000Z', archived: 0 }])
    await put(page, 'forecasts', [moved({ point: 58, lo: 50, hi: 66, adj: -4, adjBy: ['private.41'] })])
  })
  await openMorning(page)
  await expect(page.getByTestId('adjusted-line')).toHaveText('Adjusted about 4 lower, for a private item marked last night.')
  await leaveApp(page)
  const settings = (await rowsOf(page, 'settings'))[0] ?? { id: 1 }
  await put(page, 'settings', [{ ...settings, showPrivate: true }])
  await openMorning(page)
  await expect(page.getByTestId('adjusted-line')).toHaveText('Adjusted about 4 lower, for Stand-in item marked last night.')
})

test('item 3: the evening’s band is named as it read, and two things are joined by "and"', async ({ page }) => {
  await seed(page, async () => {
    await put(page, 'checkins', [checkin(BEFORE, 'evening', 19), checkin(DAY, 'morning', 7)])
    await put(page, 'forecasts', [moved({ adj: -7, adjBy: ['evening.band', 'sleep.short'] })])
  })
  await openMorning(page)
  await expect(page.getByTestId('adjusted-line')).toHaveText('Adjusted about 7 lower, for yesterday evening reading Solid and a short night reported yesterday.')
})
