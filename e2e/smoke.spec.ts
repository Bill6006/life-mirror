import { expect, test, type Page } from '@playwright/test'

/** Taps one phrase of the reading on screen (the middle one unless told otherwise), then waits for the screen to move on: the next reading, the extras, or the card. */
async function tapAnchor(page: Page, nth = 2): Promise<boolean> {
  // The screen can move on by itself after the last tap (the save is async), so a reading that
  // is gone by the time we look is not an error: report no tap and let the caller look again.
  const title = await page.locator('#ci-title').textContent({ timeout: 1500 }).catch(() => null)
  if (title === null) return false
  try {
    await page.getByTestId('anchor').nth(nth).click({ timeout: 3000 })
  } catch {
    return false
  }
  const moved = page.locator('#ci-title', { hasNotText: title }).or(page.getByTestId('give-back')).or(page.getByTestId('extras')).or(page.getByTestId('outcome-ask'))
  await expect(moved.first()).toBeVisible()
  return true
}

/** Taps through every reading until the give-back card appears; skips the evening extras and any open move's question. */
async function tapThrough(page: Page, nth = 2): Promise<number> {
  const card = page.getByTestId('give-back')
  const extras = page.getByTestId('extras')
  const ask = page.getByTestId('outcome-ask')
  const anchor = page.getByTestId('anchor').nth(nth)
  let taps = 0
  for (let i = 0; i < 24; i++) {
    await expect(card.or(extras).or(ask).or(anchor).first()).toBeVisible()
    if (await card.isVisible()) break
    if (await ask.isVisible()) {
      await page.getByRole('button', { name: 'Not now', exact: true }).click()
      await expect(ask).toBeHidden()
      continue
    }
    if (await extras.isVisible()) {
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(extras).toBeHidden()
      continue
    }
    if (await tapAnchor(page, nth)) taps++
  }
  await expect(card).toBeVisible()
  return taps
}

test('the live shell installs, reads on a phone, and opens offline', async ({ page, context }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('Life Mirror')
  await expect(page.getByText('Not logged yet').first()).toBeVisible()

  for (const name of ['Now', 'Mirror', 'Moves', 'Aims', 'Settings']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }

  // Installable: a manifest is linked and the theme colour is the ground.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest$/)
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#14171f')

  // One scroll per screen: nothing is wider than the phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // The About stamp carries a commit the pipeline run can be matched against.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByTestId('build-commit')).toHaveText(/^([0-9a-f]{7}|unbuilt)$/)

  // Offline after one load: wait for the worker, cut the network, reload.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Not logged yet').first()).toBeVisible()
  await context.setOffline(false)
})

test('a check-in gives back a reading, survives a relaunch, and can be changed or deleted', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()

  // Morning asks 13, afternoon 7, evening 8: every block feeds all six ingredients.
  const taps = await tapThrough(page)
  expect([7, 8, 13]).toContain(taps)

  // The card: the reading out of 100 with its recipe, and the change since last time.
  const card = page.getByTestId('give-back')
  await expect(card.getByTestId('reading-100')).toContainText('50')
  await expect(card.getByTestId('stance')).toHaveText('Getting by')
  await expect(card.getByTestId('stance')).toHaveAttribute('data-band', 'gettingBy')
  await expect(card.getByTestId('reading-100')).toContainText(/6 of 6 ingredients · equal weights/)
  await expect(card.getByText(/first reading/)).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Now carries the same reading, on a scale that reads as five bands with both endpoints shown.
  await expect(page.getByTestId('reading-100')).toContainText('50')
  const hero = page.getByTestId('reading-100')
  await expect(hero.getByTestId('scale-band')).toHaveCount(5)
  await expect(hero.getByTestId('scale-num').first()).toHaveText('0')
  await expect(hero.getByTestId('scale-num').last()).toHaveText('100')
  await expect(hero.getByTestId('scale-band').filter({ hasText: 'GETTING BY' })).toHaveClass(/is-active/)
  await expect(page.getByRole('button', { name: /Logged/ })).toBeVisible()

  // Relaunch: every answer is still there.
  await page.reload()
  await expect(page.getByRole('button', { name: /Logged/ })).toBeVisible()
  await page.getByRole('button', { name: /Logged/ }).click()
  const summary = page.getByTestId('summary')
  await expect(summary).toBeVisible()

  // Correct one reading: the first reading row, then the first phrase.
  await summary.getByTestId('reading-row').first().click()
  await page.getByTestId('anchor').first().click()
  await expect(summary).toBeVisible()

  // Delete the whole check-in: two taps.
  await page.getByRole('button', { name: 'Delete this check-in' }).click()
  await page.getByRole('button', { name: 'Tap again to delete it' }).click()
  await expect(page.getByRole('button', { name: /Check in/ })).toBeVisible()
})

test('an incomplete block reads Incomplete and no number', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await page.getByTestId('anchor').nth(2).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  const hero = page.getByTestId('reading-incomplete')
  await expect(hero).toBeVisible()
  await expect(hero.locator('.hero-word')).toHaveText('Incomplete')
  await expect(hero.locator('.hero-num')).toHaveCount(0)
})

test('a tapped reminder opens the current block straight away', async ({ page }) => {
  await page.goto('./?checkin=1')
  await expect(page.getByTestId('anchor').first()).toBeVisible()
  await expect(page).toHaveURL(/\/life-mirror\/$/)
})

test('the direction sentence is asked once, kept on the phone, and never asked again', async ({ page }) => {
  await page.goto('./')
  const ask = page.getByTestId('direction-ask')
  await expect(ask).toBeVisible()
  await page.getByTestId('direction-input').fill('One line of my own.')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await expect(ask).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('direction-ask')).toHaveCount(0)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByTestId('direction-field')).toHaveValue('One line of my own.')
})

test('one move follows a check-in, can be skipped, is asked about next time, and History keeps three records', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 14, 0))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)

  // The card carries the move, its why, its testing line and the honest evidence line.
  const card = page.getByTestId('give-back')
  await expect(card.getByTestId('move-card')).toBeVisible()
  await expect(card.getByText('Why this')).toBeVisible()
  await expect(card.getByText('Testing')).toBeVisible()
  await expect(card.getByText('Little evidence')).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Now shows it and the honest line; Skip records and shows the next candidate.
  const first = await page.getByTestId('move-card').getByTestId('move-name').innerText()
  await expect(page.getByTestId('knows')).toContainText('weeks of record')
  await page.getByRole('button', { name: /^Skip/ }).click()
  await expect(page.getByTestId('move-card').getByTestId('move-name')).not.toHaveText(first)

  // The constant lives in Settings; nothing about her appears on Now.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByTestId('lives-with-me')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.getByText(/she is with you|She's away/)).toHaveCount(0)

  // The evening check-in opens with the question, one tap, then the readings.
  await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
  await page.reload()
  await page.getByRole('button', { name: /Check in/ }).click()
  await expect(page.getByTestId('outcome-ask')).toBeVisible()
  await page.getByTestId('outcome').first().click()
  const passive = page.getByTestId('passive-done')
  if (await passive.isVisible()) await passive.click()
  await tapThrough(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // History: offer, card and outcome as separate records.
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^History/ }).click()
  const rows = page.getByTestId('history-row')
  await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(3)
  await expect(rows.filter({ hasText: 'Outcome' }).first()).toBeVisible()
  await expect(rows.filter({ hasText: 'Offer' }).first()).toBeVisible()
  await expect(rows.filter({ hasText: 'Skipped' }).first()).toBeVisible()
})

test('the evening chips answer from the record and the text line is kept', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  const extras = page.getByTestId('extras')
  const anchor = page.getByTestId('anchor').nth(2)
  for (let i = 0; i < 10; i++) {
    await expect(extras.or(anchor).first()).toBeVisible()
    if (await extras.isVisible()) break
    await tapAnchor(page)
  }
  await expect(extras).toBeVisible()
  await page.getByTestId('chip-nothingLanded').click()
  await expect(page.getByTestId('chip-answer')).toContainText('First time recorded')

  // The exceptions to the week are statements inside the check-in, and change today alone.
  await expect(page.getByTestId('chip-away')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('chip-study').click()
  await expect(page.getByTestId('chip-study')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('note-input').fill('A line the app had no question for')
  await page.getByTestId('note-input').blur()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // A study night: the step offers a version sized to one sitting, and Not now is never silent.
  // Energy was the middle phrase tonight, so "tired" is contradicted, said plainly, and the smaller version offered.
  await expect(page.getByTestId('study-step')).toBeVisible()
  await page.getByTestId('study-not-now').click()
  await page.getByTestId('study-reason-tired').click()
  await expect(page.getByTestId('study-check')).toContainText('You said tired. Tonight Energy reads Even.')
  // The smaller version is offered when one exists; the smallest version says so instead of going quiet.
  await expect(page.getByText('instead?').or(page.getByText('This is already the smallest version'))).toBeVisible()
  await page.getByTestId('study-not-now-final').click()
  await expect(page.getByTestId('give-back')).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Now states the fact, with the plain count, and no toggle.
  await expect(page.getByTestId('study-fact')).toContainText('Study night · 0 kept of 1')
  await expect(page.getByTestId('study-fact').getByRole('button')).toHaveCount(0)

  // The line survives a relaunch, on the check-in it belongs to.
  await page.reload()
  await page.getByRole('button', { name: /Logged/ }).click()
  await page.getByRole('button', { name: /^Change the extras/ }).click()
  await expect(page.getByTestId('note-input')).toHaveValue('A line the app had no question for')
})

test('the mirror draws from the record, and delete everything empties it', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await expect(page.getByTestId('trace')).toBeVisible()
  await expect(page.getByTestId('trace').locator('circle.ch-dot')).toHaveCount(1)
  await expect(page.getByTestId('mini')).toHaveCount(7)
  await expect(page.getByTestId('heatmap')).toBeVisible()
  await expect(page.getByText('Moving together is not causing.')).toBeVisible()
  await page.getByRole('button', { name: 'Hunger', exact: true }).click()
  await expect(page.getByTestId('trace').locator('circle.ch-dot-ov')).toHaveCount(1)

  // Data: private items stay out of an export unless ticked; delete everything takes two taps and a word.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Data Export everything/ }).click()
  await expect(page.getByTestId('include-private')).not.toBeChecked()
  await page.getByTestId('delete-start').click()
  await expect(page.getByTestId('delete-confirm')).toBeDisabled()
  await page.getByTestId('delete-word').fill('delete')
  await page.getByTestId('delete-confirm').click()
  await expect(page.getByRole('button', { name: /Check in/ })).toBeVisible()
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await expect(page.getByTestId('trace').locator('circle.ch-dot')).toHaveCount(0)
})

test('the catalogue is readable in full from the Moves tab', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Read the catalogue/ }).click()
  await expect(page.getByText('The catalogue', { exact: true })).toBeVisible()
  await expect(page.getByTestId('family-moves')).toHaveCount(13)
  const count = await page.locator('[data-testid="family-moves"] .move').count()
  expect(count).toBeGreaterThanOrEqual(60)
  expect(count).toBeLessThanOrEqual(100)
  await expect(page.getByRole('heading', { name: 'Time with her, no agenda' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'One low-pressure conversation with a woman' })).toBeVisible()

  // Phase 9: tags and starting beliefs on every entry, proposals marked, the research and the prompt readable.
  await expect(page.getByTestId('prior').first()).toContainText('Starting belief')
  await expect(page.getByTestId('learned-tags').locator('.move')).toHaveCount(8)
  await expect(page.getByRole('heading', { name: 'Ask one question in a group' })).toBeVisible()
  await expect(page.locator('#move-ask-one-question .move-status')).toContainText('rung 1 of the participation ladder')
  await expect(page.locator('#move-no-spend-day .move-status')).toContainText('Parked')
  await expect(page.getByRole('heading', { name: 'Set the alarm for leaving, not arriving' })).toBeVisible()
  await expect(page.getByTestId('research')).toHaveCount(4)
  await expect(page.getByRole('heading', { name: 'Behavioural activation' })).toBeVisible()
  await expect(page.getByTestId('extension-prompt')).toContainText('THE RULES')
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // The alternates sit under the phrases, for the veto.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Wording/ }).click()
  await expect(page.getByTestId('alternate')).toHaveCount(48)
})

test('Low-demand mode and depth change the check-in at once and persist', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('block-row')).toHaveCount(3)

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('low-demand').click()
  await expect(page.getByTestId('low-demand')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.getByTestId('block-row')).toHaveCount(1)

  await page.reload()
  await expect(page.getByTestId('block-row')).toHaveCount(1)

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('low-demand').click()
  await page.getByRole('button', { name: 'Short', exact: true }).click()
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.getByTestId('block-row')).toHaveCount(3)

  await page.getByRole('button', { name: /Check in/ }).click()
  const taps = await tapThrough(page)
  expect(taps).toBe(3)
  await expect(page.getByTestId('give-back').getByTestId('reading-100')).toContainText('3 of 6')
})

test('aims: a commitment with nothing typed, a step held above the move, Resume asked next time, a ladder moved by tap, counts only', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 14, 0))
  await page.goto('./')
  // The direction line, asked once, so Becoming has something to show back unchanged.
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()

  // Aims → add a commitment → the certification. Nothing typed; the step is pre-filled.
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-certification').click()
  await expect(page.getByTestId('aim-card')).toHaveCount(1)
  await expect(page.getByTestId('aim-step')).toContainText('Write the exact next study step')

  // Now: the lowest phrase on everything, and the step still sits above the move, both named.
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page, 0)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('your-aims')).toBeVisible()
  await expect(page.getByTestId('aim-card')).toBeVisible()
  await expect(page.getByTestId('tonight')).toBeVisible()
  await expect(page.getByTestId('differ')).toContainText('on purpose')
  const stepBox = await page.getByTestId('aim-card').boundingBox()
  const moveBox = await page.getByTestId('move-card').first().boundingBox()
  expect(stepBox && moveBox && stepBox.y < moveBox.y).toBe(true)

  // Resume is one tap; the next check-in asks about it, one tap.
  await page.getByTestId('aim-resume').click()
  await expect(page.getByTestId('aim-started')).toBeVisible()
  await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
  await page.reload()
  await page.getByRole('button', { name: /Check in/ }).click()
  const ask = page.getByTestId('outcome-ask')
  for (let i = 0; i < 4; i++) {
    await expect(ask.or(page.getByTestId('anchor').first()).first()).toBeVisible()
    if (!(await ask.isVisible())) break
    const title = (await ask.locator('h1').textContent()) ?? ''
    if (title.includes('Write the exact next study step')) await page.getByTestId('outcome').first().click()
    else await page.getByRole('button', { name: 'Not now', exact: true }).click()
    await expect(ask.locator('h1', { hasNotText: title }).or(page.getByTestId('anchor').first()).first()).toBeVisible()
  }
  await tapThrough(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Follow-through: counts only, and never a proportion anywhere under Aims.
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Follow-through/ }).click()
  await expect(page.getByTestId('follow-steps')).toContainText('1 started, 1 finished')
  await expect(page.locator('#main')).not.toContainText('%')
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // The proof ladder: a skill typed once on the phone, moved only by tap; the step follows it.
  await page.getByRole('button', { name: /^The proof ladder/ }).click()
  await page.getByTestId('skill-input').fill('Subnetting')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByTestId('skill-row')).toContainText('Not started')
  await page.getByTestId('rung-up').click()
  await expect(page.getByTestId('skill-row')).toContainText('Watched or read')
  await expect(page.locator('#main')).not.toContainText('%')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('aim-step')).toContainText('Subnetting · practise it')

  // Becoming: the direction line unchanged, and a dated count from what was marked done.
  await page.getByRole('button', { name: /^Becoming/ }).click()
  await expect(page.getByTestId('direction-line')).toHaveText('One line, mine')
  await expect(page.getByTestId('becoming-study')).toContainText('1 · last')
  await expect(page.locator('#main')).not.toContainText('%')
})

test('learning: Evidence shows a card with its tier, the two new chips answer from the record, and an imported hypothesis is a card and nothing else', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  const extras = page.getByTestId('extras')
  const anchor = page.getByTestId('anchor').nth(2)
  for (let i = 0; i < 10; i++) {
    await expect(extras.or(anchor).first()).toBeVisible()
    if (await extras.isVisible()) break
    await tapAnchor(page)
  }
  // The two Phase 10 chips: statements, answered from the record at once.
  await page.getByTestId('chip-coolingOff').click()
  await expect(page.getByTestId('chip-answer').first()).toContainText('First time recorded')
  await page.getByTestId('chip-bigSocial').click()
  await expect(page.getByText('The recovery gap rides alongside')).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('give-back')).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Evidence: the evening's card with its tier in the conclusion register, and the honest line.
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByTestId('evidence')).toBeVisible()
  await expect(page.getByTestId('evidence-card').first()).toBeVisible()
  await expect(page.getByTestId('tier').first()).toContainText('Little evidence')
  await expect(page.getByText(/Some answers take months/)).toBeVisible()
  await expect(page.getByText('Private items enter selection only when you turn that on', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // An imported hypothesis: a card, marked imported, and nowhere else.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Data Export everything/ }).click()
  await page.getByTestId('hypothesis-input').fill('{"move": "walk-ten", "alternative": "nap-ten", "target": "energy", "context": "afternoon"}')
  await page.getByTestId('hypothesis-add').click()
  await expect(page.getByTestId('hypothesis-result')).toContainText('Card written')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByTestId('evidence-card').filter({ hasText: 'imported, to test' })).toHaveCount(1)
  await expect(page.getByTestId('evidence-card').filter({ hasText: 'A ten-minute walk, now against' })).toBeVisible()
})

test('the brief and the weekly view: silent until the record is long enough, and the necessities are one tap', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
  await page.goto('./')
  await expect(page.getByTestId('brief-starts')).toContainText('The brief starts after seven days of record')
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await expect(page.getByTestId('weekly')).toBeVisible()
  await expect(page.getByTestId('hit-rate')).toContainText('No day-ahead forecasts scored yet')
  await expect(page.getByTestId('best-silent')).toContainText('0 so far')
  await expect(page.getByTestId('family-health')).toHaveCount(13)
  await expect(page.getByTestId('weekly-prompt')).toContainText('THE RULES')
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // The necessities signal: a tap marks a miss, inside the evening check-in.
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await page.getByRole('button', { name: /Check in/ }).click()
  const extras = page.getByTestId('extras')
  const anchor = page.getByTestId('anchor').nth(2)
  for (let i = 0; i < 10; i++) {
    await expect(extras.or(anchor).first()).toBeVisible()
    if (await extras.isVisible()) break
    await tapAnchor(page)
  }
  await page.getByTestId('necessity-shower').click()
  await expect(page.getByTestId('necessity-shower')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('give-back')).toBeVisible()
})

test('testing smarter: readings and chips are decided by you, no swap yet, the baseline steady line, the estimator named', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Readings and chips/ }).click()
  await expect(page.getByTestId('readings-screen')).toBeVisible()
  await expect(page.getByTestId('proposals-none')).toContainText('No proposal')
  await expect(page.locator('[data-testid^="chip-state-"]')).toHaveCount(8)
  await expect(page.locator('[data-testid^="chip-back-"]')).toHaveCount(0)
  await expect(page.getByTestId('swaps-none')).toContainText('No swap yet')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: /^Wording/ }).click()
  await expect(page.getByTestId('swapped')).toHaveCount(0)
  await expect(page.getByTestId('alternate')).toHaveCount(48)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await expect(page.getByTestId('baseline-steady')).toContainText('needs ten days')
})

test('the cloud copy shows its database, stays off without a token, and never touches the network in the pipeline', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto('./')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Cloud copy/ }).click()
  await expect(page.getByTestId('cloud')).toBeVisible()
  await expect(page.getByTestId('cloud-url')).toHaveText('libsql://life-record-bill6006.aws-us-east-1.turso.io')
  await expect(page.getByTestId('cloud-status')).toHaveText('Sync is off until a token exists.')
  // Opening the app already wrote today's context record, so something can be pending before any tap.
  const pendingOf = async () => Number(((await page.getByTestId('cloud-pending').textContent()) ?? '').match(/[0-9]+/)?.[0] ?? '0')
  const before = await pendingOf()
  await expect(page.getByTestId('sync-now')).toBeDisabled()
  await expect(page.getByTestId('token-input')).toHaveAttribute('type', 'password')
  await expect(page.getByTestId('token-keep')).toBeDisabled()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // A check-in queues its changes; without a token they wait on the phone and no request leaves for the database.
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Cloud copy/ }).click()
  await expect(page.getByTestId('cloud-pending')).toContainText(/[0-9]+ pending/)
  expect(await pendingOf()).toBeGreaterThan(before)
  expect(requests.some((u) => u.includes('turso.io'))).toBe(false)
})
