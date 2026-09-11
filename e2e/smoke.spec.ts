import { expect, test, type Page } from '@playwright/test'

/** Taps the middle phrase of the reading on screen, then waits for the screen to move on: the next reading, the extras, or the card. */
async function tapAnchor(page: Page): Promise<void> {
  const title = (await page.locator('#ci-title').textContent()) ?? ''
  await page.getByTestId('anchor').nth(2).click()
  const moved = page.locator('#ci-title', { hasNotText: title }).or(page.getByTestId('give-back')).or(page.getByTestId('extras')).or(page.getByTestId('outcome-ask'))
  await expect(moved.first()).toBeVisible()
}

/** Taps through every reading until the give-back card appears; skips the evening extras and any open move's question. */
async function tapThrough(page: Page): Promise<number> {
  const card = page.getByTestId('give-back')
  const extras = page.getByTestId('extras')
  const ask = page.getByTestId('outcome-ask')
  const anchor = page.getByTestId('anchor').nth(2)
  let taps = 0
  for (let i = 0; i < 24; i++) {
    await expect(card.or(extras).or(ask).or(anchor).first()).toBeVisible()
    if (await card.isVisible()) break
    if (await ask.isVisible()) {
      await page.getByRole('button', { name: 'Not now', exact: true }).click()
      continue
    }
    if (await extras.isVisible()) {
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      continue
    }
    await tapAnchor(page)
    taps++
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
  await expect(card.getByTestId('stance')).toHaveText('Stabilize')
  await expect(card.getByTestId('reading-100')).toContainText(/6 of 6 ingredients · equal weights/)
  await expect(card.getByText(/first reading/)).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Now carries the same reading.
  await expect(page.getByTestId('reading-100')).toContainText('50')
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
  await expect(page.getByTestId('give-back')).toBeVisible()

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
  await expect(page.getByTestId('family-moves')).toHaveCount(12)
  const count = await page.locator('.move').count()
  expect(count).toBeGreaterThanOrEqual(60)
  expect(count).toBeLessThanOrEqual(90)
  await expect(page.getByRole('heading', { name: 'Time with her, no agenda' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'One low-pressure conversation with a woman' })).toBeVisible()
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
