import { expect, test, type Page } from '@playwright/test'
import { seedRecord, seedTurns, storeRows } from './askSeed'

// Lookups as facts and the pattern table (Phase 4, 2026-11-13), in the browser, on stand-in records. The phone builds
// the pattern table after the day's sheet, as one record, and queues it for the cloud like any record; an answer that
// cited a lookup's fact shows that fact's words under "What this rests on"; and the Brain screen names a lookup's read.

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
const daysBefore = (n: number) => new Date(WHEN.getTime() - n * 86_400_000).toISOString()

async function start(page: Page, days = 30): Promise<void> {
  await page.clock.setFixedTime(WHEN)
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  if (days) await seedRecord(page, days)
  await page.reload()
}

/** Writes one row straight into one of the phone's stores. */
async function putInto(page: Page, store: string, row: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    async ({ name, r }) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const q = indexedDB.open('life-mirror')
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      const tx = dbx.transaction([name], 'readwrite')
      tx.objectStore(name).put(r)
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { name: store, r: row },
  )
}

interface StoredTable {
  id: string
  format: number
  builtFor: string
  kinds: { id: string; label: string; known: number; occurrences: number; family: number; private: boolean; category: string }[]
  level: { split: string; cell: string; n: number; mean: number; bands: number[] }[]
}

test('the phone builds the pattern table after the day’s sheet, as one record, and queues it for the cloud once', async ({ page }) => {
  await start(page, 60)
  // No screen waits for it: it arrives on its own, a moment after the app opens.
  await expect.poll(async () => (await storeRows<StoredTable>(page, 'patterns')).length, { timeout: 20_000 }).toBe(1)
  const [table] = await storeRows<StoredTable>(page, 'patterns')
  expect(table.id).toBe('table')
  expect(table.format).toBe(1)
  // Built for today: only the days before it are counted.
  expect(table.builtFor).toBe('2026-09-24')
  expect(table.kinds.length).toBeGreaterThan(20)
  const ids = table.kinds.map((k) => k.id)
  expect(ids).toEqual(expect.arrayContaining(['sleep.short', 'chip.dinner', 'level.low', 'level.high']))
  // Every kind carries its counts, and a count never exceeds the occasions the record can speak for.
  expect(table.kinds.every((k) => k.occurrences <= k.known && typeof k.label === 'string' && k.label.length > 0)).toBe(true)
  // The level's averages: one cell for each check-in of the day the record holds, each with its five bands.
  expect(table.level.filter((l) => l.split === 'checkin').length).toBeGreaterThan(0)
  expect(table.level.every((l) => l.bands.length === 5 && l.bands.reduce((a, b) => a + b, 0) === l.n)).toBe(true)
  // Queued for the cloud as one row, like any record; and opening the app again the same day queues nothing more.
  const queued = async () => (await storeRows<{ store: string; key: string; op: string }>(page, 'outbox')).filter((r) => r.store === 'patterns')
  expect((await queued()).map((r) => [r.key, r.op])).toEqual([['table', 'put']])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mirror', exact: true })).toBeVisible()
  await page.waitForTimeout(1500)
  expect(await queued()).toHaveLength(1)
  expect(await storeRows<StoredTable>(page, 'patterns')).toHaveLength(1)
  // The day's sheet holds nothing of the table: no fact with a lookup's head.
  const [facts] = (await storeRows<{ day: string; sheet: { facts: { id: string }[] } }>(page, 'facts')).filter((f) => f.day === '2026-09-24')
  const heads = new Set(facts.sheet.facts.map((f) => f.id.split('.')[0]))
  for (const head of ['kinds', 'pattern', 'day', 'moves', 'workouts', 'pathSteps', 'lines', 'forecast']) expect(heads.has(head), head).toBe(false)
})

test('an answer that cited a lookup’s fact shows that fact’s own words under "What this rests on"', async ({ page }) => {
  await start(page)
  const words = 'A steady pattern: a late or heavy dinner was recorded more often on Saturdays (8 of 8 on Saturdays, against 0 of 48 on other days).'
  await seedTurns(page, 'When am I most likely to have a late dinner?', [{ question: 'When am I most likely to have a late dinner?', claude: { status: 'answered', text: 'Late dinners cluster on Saturdays, and in your record that stands as a steady pattern.\nIt was recorded on 8 of 8 Saturdays, against 0 of 48 other days.', facts: [{ id: 'pattern.chip.dinner.weekday.6', text: words }], model: 'claude-opus-5-5' } }], daysBefore(0))
  await page.reload()
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByTestId('ask-open').click()
  await expect(page.getByTestId('ask')).toBeVisible()
  await page.getByTestId('ask-thread-row').click()
  const claude = page.getByTestId('ask-claude')
  await expect(claude).toContainText('Late dinners cluster on Saturdays')
  const fold = page.getByTestId('ask-claude-cited-open')
  await expect(fold).toHaveText('What this rests on')
  await expect(page.getByTestId('ask-claude-cited')).toHaveCount(0)
  await fold.click()
  await expect(page.getByTestId('ask-claude-cited')).toContainText(words)
})

test('the Brain screen names a lookup’s read among what Claude read, by its count and size', async ({ page }) => {
  await start(page, 0)
  await putInto(page, 'brainReads', { id: 'read:lookup:1', day: '2026-09-24', at: '2026-09-24T17:05:00.000Z', task: 'ask', category: 'lookup.pattern', count: 9, bytes: 2048, via: 'context' })
  await putInto(page, 'brainReads', { id: 'read:lookup:2', day: '2026-09-24', at: '2026-09-24T17:04:00.000Z', task: 'ask', category: 'lookup.kinds', count: 3, bytes: 300, via: 'context' })
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Brain/ }).click()
  const group = page.getByTestId('brain-screen').getByTestId('brain-read-group')
  await expect(group).toHaveCount(1)
  await expect(group).toContainText('Lookup: when a thing was recorded 9, 2.0 KB')
  await expect(group).toContainText('Lookup: what is counted 3, 300 B')
})
