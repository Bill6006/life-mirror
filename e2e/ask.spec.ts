import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { seedRecord, seedThread } from './askSeed'

// Ask Life Mirror in the browser (stage A1, 2026-10-19), in its preview: only an automated browser holding the test key at 1
// opens it while it is built. The question box and the starters that have something to say; a starter's answer laid out by
// the app from the repair's read; a typed question waiting, with the findings its words name; "Ask about this" from
// Evidence and from the Brain card's Why; an answer whose evidence has changed; and Past conversations, searched and
// deleted from. Every record here is a stand-in.

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lm.inStep', '1')
      if (!localStorage.getItem('ask-test-closed')) localStorage.setItem('life-mirror.preview.ask', '1')
    } catch {
      // A page without local storage stays closed.
    }
  })
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

/** A fixed afternoon, so the block and the stand-in days are the same whatever hour the runner keeps. */
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

async function openAsk(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByTestId('ask-open').click()
  await expect(page.getByTestId('ask')).toBeVisible()
}

test('opens from Mirror’s header only in its preview, its question box first and the starters that have something to say', async ({ page }) => {
  await start(page, 0)
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await expect(page.getByTestId('ask-open')).toHaveText('Ask')
  await page.getByTestId('ask-open').click()
  await expect(page.getByTestId('ask-box')).toBeVisible()
  // An empty record: no test yet, so no starter has anything to say.
  await expect(page.locator('[data-testid^="ask-starter-"]')).toHaveCount(0)
  // Closed, as it ships: no button.
  await page.evaluate(() => localStorage.setItem('ask-test-closed', '1'))
  await page.evaluate(() => localStorage.removeItem('life-mirror.preview.ask'))
  await page.reload()
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mirror' })).toBeVisible()
  await expect(page.getByTestId('ask-open')).toHaveCount(0)
})

test('"What do you know" answers at once from the repair’s read, opens its thread, and stands first in Recent', async ({ page }) => {
  await start(page)
  await openAsk(page)
  await expect(page.getByTestId('ask-starter-know')).toHaveText('What do you know about me so far?')
  await expect(page.getByTestId('ask-starter-next')).toBeVisible()
  await page.getByTestId('ask-starter-know').click()
  await expect(page.getByTestId('ask-thread')).toBeVisible()
  const answer = page.getByTestId('ask-answer')
  await expect(page.getByTestId('ask-question')).toHaveText('What do you know about me so far?')
  await expect(answer).toContainText('A ten-minute walk, now, for Stress over the next block')
  await expect(answer).toContainText('Being tested now')
  await page.locator('.sub-head .back').click()
  await expect(page.getByTestId('ask-thread-row')).toHaveCount(1)
  await expect(page.getByTestId('ask-thread-row')).toContainText('What do you know about me so far?')
  await expect(page.getByTestId('ask-thread-row')).toContainText('answered')
  // "What should we test next": each test being run whole, the next in the queue, and what would settle it.
  await page.getByTestId('ask-starter-next').click()
  await expect(page.getByTestId('ask-answer')).toContainText('Next in the queue')
  await expect(page.getByTestId('ask-answer')).toContainText('What would settle it')
})

test('a typed question waits for Claude, with the findings its words name shown at once, and can be cancelled', async ({ page }) => {
  await start(page)
  await openAsk(page)
  await page.getByTestId('ask-box').fill('Does a walk help my stress?')
  await page.getByTestId('ask-send').click()
  await expect(page.getByTestId('ask-thread')).toBeVisible()
  await expect(page.getByTestId('ask-waiting')).toHaveText('Waiting for Claude’s answer.')
  await expect(page.getByTestId('ask-matches')).toContainText('A ten-minute walk, now, for Stress over the next block')
  await page.getByTestId('ask-cancel').click()
  await expect(page.getByTestId('ask-cancelled')).toBeVisible()
  await expect(page.getByTestId('ask-waiting')).toHaveCount(0)
})

test('"Ask about this" on Evidence opens a thread with the test attached, and back returns to Evidence', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  const test_ = page.getByTestId('repair-test').filter({ hasText: 'Stress' }).first()
  await test_.getByTestId('repair-ask').click()
  await expect(page.getByTestId('ask-thread')).toBeVisible()
  await expect(page.getByTestId('ask-question')).toHaveText('About A ten-minute walk, now, for Stress over the next block')
  await expect(page.getByTestId('ask-answer')).toContainText('Offered')
  // The walk's stress test is established in this record: settled, so nothing is said of what would settle it.
  await expect(page.getByTestId('ask-answer')).toContainText('Established: helps')
  await expect(page.getByTestId('ask-answer')).not.toContainText('What would settle it')
  await page.locator('.sub-head .back').click()
  await expect(page.getByTestId('ask')).toBeVisible()
  await page.locator('.sub-head .back').click()
  await expect(page.getByTestId('repair-test').first()).toBeVisible()
})

test('"Ask about this" in the Brain card’s Why asks about the day’s line', async ({ page }) => {
  await start(page)
  await page.getByTestId('brief-why').click()
  await page.getByTestId('brief-ask').click()
  await expect(page.getByTestId('ask-thread')).toBeVisible()
  await expect(page.getByTestId('ask-question')).toHaveText('About the day’s line')
  await expect(page.getByTestId('ask-answer')).toBeVisible()
})

test('an answer whose cited finding has changed since says so, says what, and asks again in the same thread', async ({ page }) => {
  await start(page)
  // An earlier read that held the walk's stress test established, helping, and the mood test at an early sign.
  await seedThread(page, 'What do you know about me so far?', 'know', [{ key: 'walk-ten|stress|nextBlock', level: 'established', direction: 'hurts', revised: false, lo: null, hi: null }], daysBefore(3))
  await page.reload()
  await openAsk(page)
  await expect(page.getByTestId('ask-thread-row')).toContainText('evidence changed')
  await page.getByTestId('ask-thread-row').click()
  const marker = page.getByTestId('ask-changed')
  await expect(marker).toContainText('The evidence behind this has changed')
  await expect(marker.getByTestId('ask-change')).toContainText('A ten-minute walk, now, for Stress: Established: hurts →')
  await page.getByTestId('ask-again').click()
  await expect(page.getByTestId('ask-turn')).toHaveCount(2)
  await expect(page.getByTestId('ask-turn').nth(1).getByTestId('ask-changed')).toHaveCount(0)
  // Asked again on today's evidence, the thread reads answered in Recent.
  await page.locator('.sub-head .back').click()
  await expect(page.getByTestId('ask-thread-row')).toContainText('answered')
  await expect(page.getByTestId('ask-thread-row')).not.toContainText('evidence changed')
})

test('the export carries every conversation under its own key, each answer as laid out then', async ({ page }) => {
  // The download rather than the share sheet, so the test can read the file.
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }))
  await start(page, 0)
  await seedThread(page, 'What do you know about me so far?', 'know', [], daysBefore(1))
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-data').click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON and CSV', exact: true }).click()
  const out = JSON.parse(readFileSync(await (await download).path(), 'utf8'))
  expect(out.ask.threads.map((t: { title: string }) => t.title)).toEqual(['What do you know about me so far?'])
  expect(out.ask.turns).toHaveLength(1)
  expect(out.ask.turns[0]).toMatchObject({ question: 'What do you know about me so far?', state: 'answered', answer: [{ title: null, lines: ['As it stood then.'] }] })
  expect(out.key.ask).toMatch(/Nothing here is evidence/)
})

test('Recent keeps two rows whatever the count; Past conversations lists every one, searchable, and deletes after a confirmation', async ({ page }) => {
  await start(page)
  for (const [i, title] of ['What do you know about me so far?', 'What should we test next?', 'What do you know about me so far?'].entries()) {
    await seedThread(page, title, i === 1 ? 'next' : 'know', [], daysBefore(5 - i))
  }
  await page.reload()
  await openAsk(page)
  await expect(page.getByTestId('ask-thread-row')).toHaveCount(2)
  await expect(page.getByTestId('ask-past-open')).toContainText('3')
  await page.getByTestId('ask-past-open').click()
  await expect(page.getByTestId('ask-past')).toBeVisible()
  await expect(page.getByTestId('ask-thread-row')).toHaveCount(3)
  await page.getByTestId('ask-search').fill('test next')
  await expect(page.getByTestId('ask-thread-row')).toHaveCount(1)
  await page.getByTestId('ask-search').fill('nothing like this')
  await expect(page.getByTestId('ask-no-match')).toBeVisible()
  await page.getByTestId('ask-search').fill('')
  await page.getByTestId('ask-thread-row').first().click()
  await page.getByTestId('ask-delete').click()
  await expect(page.getByTestId('ask-delete-confirm')).toContainText('Anything you made from it stays.')
  await page.getByTestId('ask-delete-no').click()
  await expect(page.getByTestId('ask-delete-confirm')).toHaveCount(0)
  await page.getByTestId('ask-delete').click()
  await page.getByTestId('ask-delete-yes').click()
  await expect(page.getByTestId('ask')).toBeVisible()
  await expect(page.getByTestId('ask-past-open')).toContainText('2')
})
