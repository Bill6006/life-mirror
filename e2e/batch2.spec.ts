import { expect, test, type Locator, type Page } from '@playwright/test'
import { leaveApp } from './closedApp'
import { fortnights, hundredDays, type Row } from './holdRecords'

// The forecast follow-ups, Batch 2, item 6 (its verdict passed on 2026-11-21 at 43 days): "A steady pattern" has to
// hold, on Mirror's "What comes before your days" and on the evening check-in's "Evenings like this one". A pair reads
// as a steady pattern only once it has stood as one 43 days running, and until then as a lead; under it, the app's own
// Details fold, closed until opened, holds one sentence in the approved contract's words. Stand-in records only,
// written with no app page open. The days are said as a phone set to US English says them.

test.use({ locale: 'en-US' })

const pageErrors: string[] = []
test.beforeEach(({ page }) => {
  pageErrors.length = 0
  page.on('pageerror', (e) => pageErrors.push(e.message))
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

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

/** A fresh phone at `now`, the record written with no app page open, then the app opened again. */
async function seed(page: Page, now: Date, rows: Row[]): Promise<void> {
  await page.clock.setFixedTime(now)
  await page.goto('./')
  await leaveApp(page)
  await put(page, 'checkins', rows)
  await page.goto('./')
}

const stressRow = (within: Page | Locator): Locator => within.getByTestId('before-pair').filter({ hasText: 'After an evening with stress high' })

/** The fold sits under the row's standing line, inside the row, and is labelled Details. */
async function underTheStanding(row: Locator): Promise<boolean> {
  return row.evaluate((li) => {
    const standing = li.querySelector('[data-testid="before-standing"]')
    const fold = li.querySelector('[data-testid="before-details"]')?.closest('.disclosure')
    return !!standing && !!fold && standing.nextElementSibling === fold && fold.querySelector('.d-label')?.textContent === 'Details'
  })
}

test('item 6: on Mirror, a pair at a steady pattern 43 days running and more reads as one; its Details, closed until opened, say since when and for how many days', async ({ page }) => {
  await seed(page, new Date(2026, 10, 30, 21, 5), hundredDays(new Date(2026, 10, 30), false))
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  const row = stressRow(page)
  // Its days are worked out a slice at a time; once known, the pair has stood at a pattern since September 8.
  await expect(row.getByTestId('before-details')).toBeVisible({ timeout: 30_000 })
  await expect(row.getByTestId('before-standing')).toHaveText('A steady pattern')
  await expect(row).toContainText('next morning’s reading · lower by 25')
  expect(await underTheStanding(row)).toBe(true)
  await expect(row.getByTestId('before-details-line')).toHaveCount(0)
  await row.getByTestId('before-details').click()
  await expect(row.getByTestId('before-details-line')).toHaveText('A steady pattern since September 8, 84 days running.')
  // In the calculation register, as the week ahead's Details hold their lines.
  await expect(row.locator('.disclosure .calc > p.calc-line')).toHaveCount(1)
})

test('item 6: on Mirror, a pair at a steady pattern for fewer than 43 days reads as a lead; its Details say for how many days, and from how many it is called one', async ({ page }) => {
  await seed(page, new Date(2026, 8, 20, 21, 5), fortnights(new Date(2026, 8, 20), false))
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  const row = stressRow(page)
  await expect(row.getByTestId('before-details')).toBeVisible({ timeout: 30_000 })
  await expect(row.getByTestId('before-standing')).toHaveText('A lead, not yet a pattern · 1 looked at')
  expect(await underTheStanding(row)).toBe(true)
  await row.getByTestId('before-details').click()
  await expect(row.getByTestId('before-details-line')).toHaveText('It has read as a steady pattern 2 days running; it is called one from 43.')
})

test('item 6: after an evening, Evenings like this one says tonight’s pair in the held standing, with its Details', async ({ page }) => {
  await seed(page, new Date(2026, 10, 30, 21, 5), hundredDays(new Date(2026, 10, 30), true))
  await page.getByRole('button', { name: /^Evening Logged/ }).click()
  const card = page.getByTestId('pattern-card')
  await expect(card).toContainText('Evenings like this one')
  const row = stressRow(card)
  await expect(row.getByTestId('before-details')).toBeVisible({ timeout: 30_000 })
  await expect(row.getByTestId('before-standing')).toHaveText('A steady pattern')
  expect(await underTheStanding(row)).toBe(true)
  await expect(row.getByTestId('before-details-line')).toHaveCount(0)
  await row.getByTestId('before-details').click()
  await expect(row.getByTestId('before-details-line')).toHaveText('A steady pattern since September 8, 84 days running.')
  await expect(card).toContainText('an association, never a cause')
})
