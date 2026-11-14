import { expect, test, type Page } from '@playwright/test'
import { storeRows } from './askSeed'
import { leaveApp } from './closedApp'
import { putRows } from './noticedSeed'
import { seedWriteUps } from './writeupsSeed'

// The monthly write-ups (Phase 6, 2026-11-13), in the browser, on stand-in records. The database holds their store;
// the Brain screen has the owner's switch for the monthly read, and a row for the write-ups only while there is one
// to show; a month's sheet shows what was recorded and what Claude noticed, each with the days it came from; one
// observation is marked wrong and the mark taken back; everything learned is forgotten in one confirmed step.

// Every test fails on an uncaught error in the page, not only on what it asserts.
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

const WHEN = new Date(2026, 8, 24, 13, 30)

async function start(page: Page): Promise<void> {
  await page.clock.setFixedTime(WHEN)
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
}

async function openBrain(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Brain/ }).click()
  await expect(page.getByTestId('brain-screen')).toBeVisible()
}

async function openMonth(page: Page): Promise<void> {
  await openBrain(page)
  await page.getByTestId('brain-writeups-open').click()
  await expect(page.getByTestId('writeups-screen')).toBeVisible()
  await page.getByTestId('writeups-month').first().click()
  await expect(page.getByTestId('writeup-screen')).toBeVisible()
}

test('the database holds the store of write-ups, keyed by a name, at version 30', async ({ page }) => {
  await start(page)
  const shape = await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('life-mirror')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const store = dbx.transaction(['writeups'], 'readonly').objectStore('writeups')
    const out = { version: dbx.version, keyPath: store.keyPath, auto: store.autoIncrement }
    dbx.close()
    return out
  })
  // Dexie keeps its version times ten.
  expect(shape).toEqual({ version: 300, keyPath: 'id', auto: false })
})

test('the Brain screen has the switch for the monthly read, on until turned off, and no row for write-ups while there is none', async ({ page }) => {
  await start(page)
  await openBrain(page)
  const toggle = page.getByTestId('brain-monthly-read')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toContainText('Monthly read')
  await expect(page.getByTestId('brain-writeups-row')).toHaveCount(0)
  // Turned off, the Brain settings hold it, and the change is queued for the cloud; turned on again, the field is gone.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => (await storeRows<{ id: string; monthlyRead?: boolean }>(page, 'brainPrefs')).map((r) => [r.id, r.monthlyRead])).toEqual([['prefs', false]])
  await expect.poll(async () => (await storeRows<{ store: string }>(page, 'outbox')).some((r) => r.store === 'brainPrefs')).toBe(true)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await storeRows<Record<string, unknown>>(page, 'brainPrefs')).map((r) => 'monthlyRead' in r)).toEqual([false])
})

test('a month’s write-up has its own sheet: what you recorded and what Claude noticed, each with its days, one marked wrong and the mark taken back', async ({ page }) => {
  await start(page)
  await seedWriteUps(page)
  await page.reload()
  await openBrain(page)
  const row = page.getByTestId('brain-writeups-row')
  await expect(row).toContainText('Each month Claude read in full, and what stood out. One you mark wrong counts for nothing.')
  await expect(page.getByTestId('brain-writeups-open')).toHaveText('Read them (1)')
  await page.getByTestId('brain-writeups-open').click()
  const month = page.getByTestId('writeups-month')
  await expect(month).toHaveCount(1)
  await expect(month).toContainText('September 2026')
  await expect(month).toContainText('4 things · read ')
  await month.click()
  const sheet = page.getByTestId('writeup-screen')
  await expect(sheet).toContainText('September 2026')
  await expect(sheet).toContainText('You recorded')
  await expect(sheet).toContainText('Claude noticed')
  await expect(sheet).toContainText('Guesses to watch, never facts.')
  const cards = sheet.getByTestId('writeup-observation')
  await expect(cards).toHaveCount(4)
  await expect(cards.nth(0).getByTestId('writeup-text')).toHaveText('You checked in every evening of the stretch.')
  await expect(cards.nth(0).getByTestId('writeup-days')).toContainText('From ')
  // What was recorded carries no "Claude noticed"; what Claude noticed does, and the followed one says from when it is counted.
  await expect(cards.nth(0)).not.toContainText('Claude noticed')
  await expect(cards.nth(2)).toContainText('Claude noticed')
  await expect(cards.nth(2).getByTestId('writeup-followed')).toContainText('Counted from the next day on.')
  await expect(cards.nth(3).getByTestId('writeup-followed')).toHaveCount(0)

  // Marked wrong: it says so, the phone's own record holds the mark, and the mark is queued for the cloud.
  await cards.nth(2).getByTestId('writeup-wrong').click()
  await expect(cards.nth(2).getByTestId('writeup-marked')).toContainText('Marked wrong.')
  await expect.poll(async () => (await storeRows<{ id: string; kind: string }>(page, 'noteMarks')).map((m) => [m.id, m.kind])).toEqual([['obs:2026-09:1:noticed:1', 'wrong']])
  const queued = async () => (await storeRows<{ store: string; key: string; op: string }>(page, 'outbox')).filter((r) => r.store === 'noteMarks').map((r) => [r.key, r.op])
  await expect.poll(queued).toEqual([['obs:2026-09:1:noticed:1', 'put']])
  await expect(sheet.getByTestId('writeup-wrong')).toHaveCount(3)
  // Nothing of the Worker's rows is ever queued.
  expect((await storeRows<{ store: string }>(page, 'outbox')).filter((r) => r.store === 'writeups')).toEqual([])
  // Taken back: the control returns and the mark is gone.
  await cards.nth(2).getByTestId('writeup-undo').click()
  await expect(cards.nth(2).getByTestId('writeup-wrong')).toBeVisible()
  await expect.poll(async () => (await storeRows(page, 'noteMarks')).length).toBe(0)

  await page.getByTestId('writeup-back').click()
  await expect(page.getByTestId('writeups-screen')).toBeVisible()
  await page.getByTestId('writeups-done').click()
  await expect(page.getByTestId('brain-screen')).toBeVisible()
})

test('a month read twice shows its newest reading, with the earlier one beside it', async ({ page }) => {
  await start(page)
  await seedWriteUps(page, { earlier: true })
  await page.reload()
  await openMonth(page)
  const sheet = page.getByTestId('writeup-screen')
  await expect(sheet.getByTestId('writeup-text').first()).toHaveText('You checked in every evening of the stretch.')
  const other = sheet.getByTestId('writeup-other')
  await expect(other).toHaveCount(1)
  await expect(other).toContainText('An earlier reading, from ')
  await other.click()
  await expect(sheet.getByTestId('writeup-text').first()).toHaveText('An earlier reading said this of the same days.')
  await expect(sheet.getByTestId('writeup-other')).toContainText('The newest reading, from ')
  await sheet.getByTestId('writeup-other').click()
  await expect(sheet.getByTestId('writeup-text').first()).toHaveText('You checked in every evening of the stretch.')
})

test('an observation leaves the sheet at once when a day it came from holds no record any more', async ({ page }) => {
  await start(page)
  const { days } = await seedWriteUps(page)
  await page.reload()
  await openMonth(page)
  await expect(page.getByTestId('writeup-observation')).toHaveCount(4)
  // The day deleted with no app page open: its check-ins and its own row.
  await leaveApp(page)
  await page.evaluate(async (day) => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('life-mirror')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const tx = dbx.transaction(['checkins', 'days'], 'readwrite')
    const store = tx.objectStore('checkins')
    await new Promise<void>((res, rej) => {
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) return res()
        if ((c.value as { day: string }).day === day) c.delete()
        c.continue()
      }
      cursor.onerror = () => rej(cursor.error)
    })
    tx.objectStore('days').delete(day)
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  }, days[7])
  await page.goto('./')
  await openMonth(page)
  await expect(page.getByTestId('writeup-observation')).toHaveCount(3)
  await expect(page.getByTestId('writeup-screen')).not.toContainText('A walk before dinner went with calmer evenings.')
})

test('“Forget everything it learned” takes one step to confirm, and the write-ups are gone from the Brain screen', async ({ page }) => {
  await start(page)
  await seedWriteUps(page)
  await page.reload()
  await openBrain(page)
  await page.getByTestId('brain-writeups-open').click()
  const forget = page.getByTestId('forget-learned')
  await expect(forget).toContainText('The write-ups, the patterns followed from them, and what was noticed in your notes: gone from every screen and every count. Your own record stays as it is.')
  await forget.getByTestId('forget-learned-open').click()
  // Kept: nothing is forgotten, and the control is as it was.
  await forget.getByTestId('forget-learned-no').click()
  await expect(forget.getByTestId('forget-learned-open')).toBeVisible()
  expect(await storeRows(page, 'noteMarks')).toHaveLength(0)
  await forget.getByTestId('forget-learned-open').click()
  await forget.getByTestId('forget-learned-yes').click()
  await expect(page.getByTestId('writeups-none')).toBeVisible()
  await expect.poll(async () => (await storeRows<{ id: string; kind: string }>(page, 'noteMarks')).map((m) => [m.id, m.kind])).toEqual([['forget', 'forget']])
  // The Worker's rows stay on record; they are only no longer shown.
  expect(await storeRows(page, 'writeups')).toHaveLength(1)
  await page.getByTestId('writeups-done').click()
  await expect(page.getByTestId('brain-writeups-row')).toHaveCount(0)
  await expect(page.getByTestId('brain-monthly-read')).toBeVisible()
})

test('the Brain screen names a month’s reads among what Claude read, by their count and size', async ({ page }) => {
  await start(page)
  await putRows(page, 'brainReads', [{ id: 'read:month:1', day: '2026-09-24', at: '2026-09-24T17:05:00.000Z', task: 'month', category: 'lookup.month', count: 148, bytes: 37888, via: 'context' }])
  await page.reload()
  await openBrain(page)
  const group = page.getByTestId('brain-screen').getByTestId('brain-read-group')
  await expect(group).toHaveCount(1)
  await expect(group).toContainText('the monthly read')
  await expect(group).toContainText('Lookup: a month of your record 148, 37.0 KB')
})
