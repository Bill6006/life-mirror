import { expect, test, type Page } from '@playwright/test'
import { storeRows } from './askSeed'
import { NOTICED_KEY, putRows, seedNoticed } from './noticedSeed'

// Notes: exact words, and a home for what is noticed in notes (Phase 5, 2026-11-13), in the browser, on stand-in
// records. The database holds the two new stores; what was noticed has its own sheet behind a row on the Brain screen
// that shows only while there is something to show; one event is marked wrong and the mark taken back; and the Brain
// screen names a search of the notes among what Claude read.

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

async function start(page: Page, opts: { key?: boolean } = {}): Promise<void> {
  if (opts.key !== false) await page.addInitScript((k) => localStorage.setItem(k, '1'), NOTICED_KEY)
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

test('the database holds the two stores for what is noticed, keyed by a name, at version 29', async ({ page }) => {
  await start(page)
  const shape = await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('life-mirror')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const tx = dbx.transaction(['noteEvents', 'noteMarks'], 'readonly')
    const out = { version: dbx.version, stores: ['noteEvents', 'noteMarks'].map((s) => [s, tx.objectStore(s).keyPath, tx.objectStore(s).autoIncrement]) }
    dbx.close()
    return out
  })
  // Dexie keeps its version times ten.
  expect(shape).toEqual({ version: 290, stores: [['noteEvents', 'id', false], ['noteMarks', 'id', false]] })
})

test('the Brain screen shows no row while nothing noticed stands: with no event, and with events of no type the list knows', async ({ page }) => {
  // No test key here: the one list of event types is empty, as on every phone in a hand.
  await start(page, { key: false })
  await openBrain(page)
  await expect(page.getByTestId('brain-reads')).toBeVisible()
  await expect(page.getByTestId('brain-noticed')).toHaveCount(0)
  // Events arrive, and still none stands: no type is known yet.
  await seedNoticed(page)
  await page.reload()
  await openBrain(page)
  await expect(page.getByTestId('brain-reads')).toBeVisible()
  await expect(page.getByTestId('brain-noticed')).toHaveCount(0)
  expect(await storeRows(page, 'noteEvents')).toHaveLength(6)
})

test('what was noticed has its own sheet: each with your own words, one marked wrong and the mark taken back', async ({ page }) => {
  await start(page)
  const seeded = await seedNoticed(page)
  await page.reload()
  await openBrain(page)
  // The row says how many there are to read: the four that stand, of six stored.
  const row = page.getByTestId('brain-noticed')
  await expect(row).toBeVisible()
  await expect(row).toContainText('Things Claude noticed in notes you wrote, each with your own words. One you mark wrong counts for nothing.')
  await expect(page.getByTestId('brain-noticed-open')).toHaveText('Read them (4)')
  await page.getByTestId('brain-noticed-open').click()
  const sheet = page.getByTestId('noticed-screen')
  await expect(sheet).toBeVisible()
  const events = sheet.getByTestId('noticed-event')
  await expect(events).toHaveCount(4)
  // The newest note first, each with the words quoted from its note; the one whose note never held its quote, and the one of no known type, are not here.
  for (const [i, quote] of seeded.quotes.entries()) await expect(events.nth(i).getByTestId('noticed-quote')).toHaveText(`“${quote}”`)
  await expect(sheet).not.toContainText('words the note does not hold')
  // The type as the list names it today: the one stored under an earlier id reads as the first stand-in type.
  await expect(events.nth(0)).toContainText('A stand-in thing')
  await expect(events.nth(2)).toContainText('Another stand-in thing')
  await expect(events.nth(0)).toContainText('Claude noticed')
  await expect(events.nth(0)).toContainText('evening check-in')
  await expect(events.nth(1)).toContainText('a note you kept')

  // Marked wrong: it says so, the phone's own record holds the mark, and the mark is queued for the cloud.
  await events.nth(3).getByTestId('noticed-wrong').click()
  await expect(events.nth(3).getByTestId('noticed-marked')).toContainText('Marked wrong.')
  await expect(events.nth(3).getByTestId('noticed-wrong')).toHaveCount(0)
  await expect.poll(async () => (await storeRows<{ id: string; kind: string }>(page, 'noteMarks')).map((m) => [m.id, m.kind])).toEqual([['event:e1', 'wrong']])
  const queued = async () => (await storeRows<{ store: string; key: string; op: string }>(page, 'outbox')).filter((r) => r.store === 'noteMarks').map((r) => [r.key, r.op])
  await expect.poll(queued).toEqual([['event:e1', 'put']])
  // The others are untouched, and nothing of the Worker's rows is ever queued.
  await expect(sheet.getByTestId('noticed-wrong')).toHaveCount(3)
  expect((await storeRows<{ store: string }>(page, 'outbox')).filter((r) => r.store === 'noteEvents')).toEqual([])

  // Taken back: the control returns, the mark is gone, and that is queued too.
  await events.nth(3).getByTestId('noticed-undo').click()
  await expect(events.nth(3).getByTestId('noticed-wrong')).toBeVisible()
  await expect.poll(async () => (await storeRows(page, 'noteMarks')).length).toBe(0)
  await expect.poll(async () => (await queued()).at(-1)).toEqual(['event:e1', 'delete'])

  // Done goes back to the Brain screen, the row still there.
  await page.getByTestId('noticed-done').click()
  await expect(page.getByTestId('brain-screen')).toBeVisible()
  await expect(page.getByTestId('brain-noticed-open')).toHaveText('Read them (4)')
})

test('an event leaves the sheet at once when its note no longer holds the quoted words', async ({ page }) => {
  await start(page)
  await seedNoticed(page)
  await page.reload()
  await openBrain(page)
  await expect(page.getByTestId('brain-noticed-open')).toHaveText('Read them (4)')
  // The note edited under the app: the words quoted from it are gone.
  const noted = (await storeRows<{ id: number; extras?: { note?: string } }>(page, 'checkins')).filter((r) => r.extras?.note?.includes('raised my voice at the dog'))
  expect(noted).toHaveLength(1)
  await putRows(page, 'checkins', [{ ...noted[0], extras: { ...noted[0].extras, note: 'A long, calm day.' } }])
  await page.reload()
  await openBrain(page)
  await expect(page.getByTestId('brain-noticed-open')).toHaveText('Read them (3)')
  await page.getByTestId('brain-noticed-open').click()
  await expect(page.getByTestId('noticed-screen')).not.toContainText('I raised my voice at the dog again')
})

test('the Brain screen names a search of the notes among what Claude read, by its count and size', async ({ page }) => {
  await start(page)
  await putRows(page, 'brainReads', [{ id: 'read:lookup:9', day: '2026-09-24', at: '2026-09-24T17:05:00.000Z', task: 'ask', category: 'lookup.noteWords', count: 14, bytes: 3072, via: 'context' }])
  await page.reload()
  await openBrain(page)
  const group = page.getByTestId('brain-screen').getByTestId('brain-read-group')
  await expect(group).toHaveCount(1)
  await expect(group).toContainText('Lookup: words in your notes 14, 3.0 KB')
})
