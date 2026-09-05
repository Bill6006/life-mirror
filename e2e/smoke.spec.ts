import { expect, test, type Page } from '@playwright/test'

/** Taps the middle phrase for each reading until the give-back card appears; skips the evening extras. */
async function tapThrough(page: Page): Promise<number> {
  const card = page.getByTestId('give-back')
  const extras = page.getByTestId('extras')
  const anchor = page.getByTestId('anchor').nth(2)
  let taps = 0
  for (let i = 0; i < 20; i++) {
    await expect(card.or(extras).or(anchor).first()).toBeVisible()
    if (await card.isVisible()) break
    if (await extras.isVisible()) {
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      continue
    }
    await anchor.click()
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

  const taps = await tapThrough(page)
  expect([5, 13]).toContain(taps)

  // The card: the reading out of 100 with its recipe, and the change since last time.
  const card = page.getByTestId('give-back')
  await expect(card.getByTestId('reading-100')).toContainText('50')
  await expect(card.getByTestId('reading-100')).toContainText('Stabilize')
  await expect(card.getByTestId('reading-100')).toContainText(/of 6 ingredients · equal weights/)
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

  // Correct one reading: the first row, then the first phrase.
  await summary.getByRole('button').first().click()
  await page.getByTestId('anchor').first().click()
  await expect(summary).toBeVisible()

  // Delete the whole check-in: two taps.
  await page.getByRole('button', { name: 'Delete this check-in' }).click()
  await page.getByRole('button', { name: 'Tap again to delete it' }).click()
  await expect(page.getByRole('button', { name: /Check in/ })).toBeVisible()
})

test('a tapped reminder opens the current block straight away', async ({ page }) => {
  await page.goto('./?checkin=1')
  await expect(page.getByTestId('anchor').first()).toBeVisible()
  await expect(page).toHaveURL(/\/life-mirror\/$/)
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
