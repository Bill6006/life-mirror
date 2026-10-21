import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { seedNote, seedRecord, seedThread, seedTurns, storeRows } from './askSeed'

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
      // Open as it ships (stage A4, 2026-10-21); a test that says so closes it with the key at 0, as only an automated browser can.
      if (localStorage.getItem('ask-test-closed')) localStorage.setItem('life-mirror.preview.ask', '0')
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

test('opens from Mirror’s header as it ships, its question box first and the starters that have something to say', async ({ page }) => {
  await start(page, 0)
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await expect(page.getByTestId('ask-open')).toHaveText('Ask')
  await page.getByTestId('ask-open').click()
  await expect(page.getByTestId('ask-box')).toBeVisible()
  // An empty record: no test yet, so no starter has anything to say.
  await expect(page.locator('[data-testid^="ask-starter-"]')).toHaveCount(0)
  // Closed by the test key at 0: no button.
  await page.evaluate(() => localStorage.setItem('ask-test-closed', '1'))
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
  // This phone keeps no cloud copy: said plainly, and the findings answer from the record meanwhile.
  await expect(page.getByTestId('ask-waiting')).toContainText('Claude’s answers come through your cloud copy')
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
  // A note kept from Ask (stage A3).
  await seedNote(page, 'A stand-in note, kept from Ask.', '2026-09-23')
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
  expect(out.notes).toEqual([{ day: '2026-09-23', text: 'A stand-in note, kept from Ask.', from: 'ask', question: 1, createdAt: '2026-09-23T13:05:00.000Z' }])
})

test('Claude’s answer, when it comes, shows with the findings it cited folded under it until tapped, and its thread then reads answered (stage A2; folded 2026-10-21)', async ({ page }) => {
  await start(page)
  await seedTurns(page, 'Does a walk help my stress?', [{ question: 'Does a walk help my stress?', claude: { status: 'answered', text: 'Your own record says a ten-minute walk likely helps your stress.\nMore fair draws are what would settle it.', facts: [{ id: 'ladder.walk-ten.stress', text: 'Test: a stand-in fact, as the run read it.' }], model: 'claude-opus-5-5' } }], daysBefore(0))
  await page.reload()
  await openAsk(page)
  await page.getByTestId('ask-thread-row').click()
  const claude = page.getByTestId('ask-claude')
  await expect(claude).toContainText('Your own record says a ten-minute walk likely helps your stress.')
  await expect(claude.locator('.ask-claude-text')).toHaveCount(2)
  // What the answer rests on starts folded (2026-10-21): the coaching leads, and every finding it cited is one tap away.
  const fold = page.getByTestId('ask-claude-cited-open')
  await expect(fold).toHaveText('What this rests on')
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('ask-claude-cited')).toHaveCount(0)
  await fold.click()
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('ask-claude-cited')).toContainText('Test: a stand-in fact, as the run read it.')
  await expect(claude).toContainText('Written by Claude (claude-opus-5-5).')
  await expect(page.getByTestId('ask-waiting')).toHaveCount(0)
  // An answer that marks no stated fact offers no note; a test already established offers no "Test it" (stage A3).
  await expect(page.getByTestId('ask-note')).toHaveCount(0)
  await expect(page.getByTestId('ask-test-it')).toHaveCount(0)
  // The phone marks its own question answered.
  await page.locator('.sub-head .back').click()
  await expect(page.getByTestId('ask-thread-row')).toContainText('answered')
  // Deleting a thread a run has read says a copy stays in the routine's history.
  await page.getByTestId('ask-thread-row').click()
  await page.getByTestId('ask-delete').click()
  await expect(page.getByTestId('ask-delete-copy')).toContainText('stays in the routine’s history on claude.ai')
})

test('no checked answer is said plainly, with the findings its words name, never an unchecked one (stage A2)', async ({ page }) => {
  await start(page)
  await seedTurns(page, 'Does a walk help my stress?', [{ question: 'Does a walk help my stress?', claude: { status: 'failed' } }], daysBefore(0))
  await page.reload()
  await openAsk(page)
  await page.getByTestId('ask-thread-row').click()
  await expect(page.getByTestId('ask-no-checked')).toContainText('Couldn’t produce a checked answer.')
  await expect(page.getByTestId('ask-matches')).toContainText('A ten-minute walk, now, for Stress over the next block')
  await expect(page.getByTestId('ask-claude')).toHaveCount(0)
  // No run that reached Claude is on this phone for it: the plain confirmation.
  await page.getByTestId('ask-delete').click()
  await expect(page.getByTestId('ask-delete-confirm')).toBeVisible()
  await expect(page.getByTestId('ask-delete-copy')).toHaveCount(0)
})

test('with a cloud copy: the day’s allowance, the deep tier with its cost, and "Explain this to me" under a quick answer (stage A2)', async ({ page }) => {
  // The database is never reached: every request to its host is refused at the browser.
  await page.route(/turso\.io/, (route) => route.abort())
  await start(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Cloud copy/ }).click()
  await page.getByTestId('token-input').fill('e2e-token-never-real')
  await page.getByTestId('token-keep').click()
  await expect(page.getByTestId('token-set')).toBeVisible()
  await page.reload()
  await openAsk(page)
  await expect(page.getByTestId('ask-allowance')).toHaveText('Claude: 3 of 3 answers left today.')
  await expect(page.getByTestId('ask-starter-deep')).toHaveText('Coach me on everything')
  await expect(page.getByTestId('ask-deep-cost')).toHaveText('Counts as 2 of today’s answers, once a day.')
  await page.getByTestId('ask-starter-know').click()
  await page.getByTestId('ask-explain').click()
  await expect(page.getByTestId('ask-turn')).toHaveCount(2)
  await expect(page.getByTestId('ask-turn').nth(1).getByTestId('ask-question')).toHaveText('Explain this to me.')
  // The database cannot be reached here, so the question has not gone yet, and says so.
  await expect(page.getByTestId('ask-turn').nth(1).getByTestId('ask-waiting')).toHaveText('Not sent yet: it goes when the phone is online.')
})

test('a thread at its size limit suggests a new one, and sums nothing up (stage A2)', async ({ page }) => {
  await start(page)
  await seedTurns(page, 'Does a walk help my stress?', Array.from({ length: 8 }, (_, i) => ({ question: `Question ${i + 1}?`, state: 'cancelled' as const })), daysBefore(0))
  await page.reload()
  await openAsk(page)
  await page.getByTestId('ask-thread-row').click()
  await expect(page.getByTestId('ask-turn')).toHaveCount(8)
  await expect(page.getByTestId('ask-too-long')).toContainText('ask in a new one from Ask')
  await expect(page.getByTestId('ask-thread').getByTestId('ask-box')).toHaveCount(0)
})

test('a question naming one test offers "Test it": its card, the context it names, and the asking kept, asked again on a later day (stage A3)', async ({ page }) => {
  await start(page)
  await openAsk(page)
  await page.getByTestId('ask-box').fill('Does a walk help my mood on office days?')
  await page.getByTestId('ask-send').click()
  await expect(page.getByTestId('ask-thread')).toBeVisible()
  await page.getByTestId('ask-test-it').click()
  const card = page.getByTestId('ask-test-card')
  await expect(card).toContainText('A ten-minute walk, now, for Mood over the next block')
  await expect(card).toContainText('It is compared with nothing extra at the moments it fits')
  await expect(card).toContainText('Each check-in where it fits is its own draw.')
  await expect(card).toContainText('The reading out of 100 is read alongside it, as a second measure.')
  await expect(card).toContainText('the same thresholds for every test')
  await expect(page.getByTestId('ask-test-stop')).toHaveText('In the queue it runs until its call is established, or for 45 days, longer while it shows at least an early sign of helping.')
  await expect(card).toContainText('Pre-registered on')
  // The context the question names is the test's own, read on those days: none of its own yet on this record.
  await expect(page.getByTestId('ask-test-context')).toContainText('At the office: no call of its own yet.')
  // The question itself asked about the test today: said, and no second tap offered today.
  await expect(page.getByTestId('ask-sooner-done')).toContainText('Asked about on Thu, Sep 24')
  await expect(page.getByTestId('ask-sooner')).toHaveCount(0)
  // The next day, "Test it sooner" asks again; a second tap that day adds nothing.
  await page.clock.setFixedTime(new Date(WHEN.getTime() + 86_400_000))
  await page.reload()
  await openAsk(page)
  await page.getByTestId('ask-thread-row').click()
  await page.getByTestId('ask-test-it').click()
  await page.getByTestId('ask-sooner').click()
  await expect(page.getByTestId('ask-sooner')).toHaveCount(0)
  await expect(page.getByTestId('ask-sooner-done')).toContainText('Asked about on Fri, Sep 25')
  const turns = await storeRows<{ asked?: { key: string; day: string }[] }>(page, 'askTurns')
  expect(turns.flatMap((t) => t.asked ?? [])).toEqual([
    { key: 'walk-ten|mood|nextBlock', day: '2026-09-24' },
    { key: 'walk-ten|mood|nextBlock', day: '2026-09-25' },
  ])
})

test('an answer that marks a stated fact offers "Add this as a note": the question’s own words, editable, kept on its day; and the test the answer names (stage A3)', async ({ page }) => {
  await start(page)
  await seedTurns(page, 'The neighbours had a party until two.', [{ question: 'The neighbours had a party until two.', claude: { status: 'answered', text: 'That is a note of the night, not a reading.\nA ten-minute walk is being tested on your mood.', facts: [{ id: 'ladder.walk-ten.mood', text: 'Test: a stand-in fact, as the run read it.' }], model: 'claude-opus-5-5', test: 'walk-ten|mood|nextBlock', noteOffer: true } }], daysBefore(0))
  await page.reload()
  await openAsk(page)
  await page.getByTestId('ask-thread-row').click()
  // The test the answer names, though the question names none.
  await expect(page.getByTestId('ask-test-it')).toBeVisible()
  await page.getByTestId('ask-note').click()
  await expect(page.getByTestId('ask-note-text')).toHaveValue('The neighbours had a party until two.')
  // "Not now" keeps nothing.
  await page.getByTestId('ask-note-not-now').click()
  await expect(page.getByTestId('ask-note-edit')).toHaveCount(0)
  expect(await storeRows(page, 'notes')).toEqual([])
  await page.getByTestId('ask-note').click()
  await page.getByTestId('ask-note-text').fill('The neighbours had a loud party until two.')
  await page.getByTestId('ask-note-keep').click()
  await expect(page.getByTestId('ask-note-kept')).toContainText('Kept as a note on Thu, Sep 24, with your words under Mirror.')
  expect(await storeRows(page, 'notes')).toEqual([expect.objectContaining({ day: '2026-09-24', text: 'The neighbours had a loud party until two.', from: 'ask' })])
  // Kept, it reads kept after a reload, and is offered no more.
  await page.reload()
  await openAsk(page)
  await page.getByTestId('ask-thread-row').click()
  await expect(page.getByTestId('ask-note-kept')).toBeVisible()
  await expect(page.getByTestId('ask-note')).toHaveCount(0)
  // With the owner's words under Mirror, removable at a second tap; removed, the conversation offers it again.
  // Back from the conversation to Ask, and from Ask to Mirror.
  await page.locator('.sub-head .back').click()
  await page.locator('.sub-head .back').click()
  await page.getByTestId('words-door').click()
  const kept = page.getByTestId('words-kept')
  await expect(kept).toHaveCount(1)
  await expect(page.getByTestId('words-kept-note')).toContainText('The neighbours had a loud party until two.')
  await page.getByTestId('words-kept-remove').click()
  await expect(page.getByTestId('words-kept-remove')).toHaveText('Tap again to remove it')
  await page.getByTestId('words-kept-remove').click()
  await expect(kept).toHaveCount(0)
  expect(await storeRows(page, 'notes')).toEqual([])
  await page.locator('.sub-head .back').click()
  await page.getByTestId('ask-open').click()
  await page.getByTestId('ask-thread-row').click()
  await expect(page.getByTestId('ask-note')).toBeVisible()
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
