import { expect, test, type Page } from '@playwright/test'
import { putRows } from './noticedSeed'

// "Coach me on everything" covers everything (Phase 7, 2026-11-14), in the browser, on stand-in records. The phone's
// side is small: the Brain screen names the deep tier's two new reads among what Claude read, by count and size.
// What the reads serve, and how an answer is held to them, is the Worker's, and is tested there.

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

const WHEN = new Date(2026, 10, 12, 13, 30)

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

test('the Brain screen names the deep tier’s reads of the write-ups and of the month so far, by count and size', async ({ page }) => {
  await start(page)
  await putRows(page, 'brainReads', [
    { id: 'read:deep:200', day: '2026-11-12', at: '2026-11-12T17:05:00.000Z', task: 'deep', category: 'lookup.writeups', count: 24, bytes: 6144, via: 'context' },
    { id: 'read:deep:201', day: '2026-11-12', at: '2026-11-12T17:06:00.000Z', task: 'deep', category: 'lookup.monthSoFar', count: 131, bytes: 22528, via: 'context' },
  ])
  await page.reload()
  await openBrain(page)
  const group = page.getByTestId('brain-screen').getByTestId('brain-read-group')
  await expect(group).toHaveCount(1)
  await expect(group).toContainText('“Coach me on everything”')
  await expect(group).toContainText('Lookup: your monthly write-ups 24, 6.0 KB')
  await expect(group).toContainText('Lookup: this month so far 131, 22.0 KB')
  // Never the raw name of a read: each has words of its own.
  await expect(group).not.toContainText('lookup.')
})
