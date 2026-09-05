import { expect, test } from '@playwright/test'

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

test('a check-in completes by tapping, gives something back, survives a relaunch, and can be changed or deleted', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()

  // The middle phrase for each reading until the give-back card appears (13 taps at most).
  const card = page.getByTestId('give-back')
  const anchor = page.getByTestId('anchor').nth(2)
  for (let i = 0; i < 14; i++) {
    await expect(card.or(anchor)).toBeVisible()
    if (await card.isVisible()) break
    await anchor.click()
  }
  await expect(card).toBeVisible()
  await expect(page.getByText(/first reading/)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
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
