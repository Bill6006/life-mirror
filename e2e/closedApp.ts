import type { Page } from '@playwright/test'

/**
 * Sends the page to a file of the app's own origin that runs no app code, so a test can change the record with no app
 * page open, and open the app again after it with `page.goto('./')`.
 *
 * A change made under an open page races with that page (2026-11-13). The page checks today's row at several moments
 * of its own, with the settings as it last read them: a test that deleted the row and changed the settings in one
 * write, then reloaded, sometimes found the row made again from the settings as they stood before the change. The
 * page's check and the test's write were logged in the same millisecond. On the phone nothing deletes a day's row
 * under an open page, so the app has no such race; only a test written this way does.
 */
export async function leaveApp(page: Page): Promise<void> {
  await page.goto('./icons/life-mirror-192.png')
}
