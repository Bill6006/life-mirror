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
 *
 * It first waits for the app's database to stand with its stores (2026-11-20). On a fresh phone the app's first open
 * makes them, and a page sent away before that open ends leaves none: one seed in a run wrote straight after the first
 * load and failed with "object store not found".
 */
export async function leaveApp(page: Page): Promise<void> {
  await appReady(page)
  await page.goto('./icons/life-mirror-192.png')
}

/**
 * Waits until the app's database stands with its stores. It looks first at the list of databases, so it never makes an
 * empty one itself, then opens it with no version, which waits behind any open the app has under way.
 */
export async function appReady(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      const known = await indexedDB.databases()
      if (!known.some((d) => d.name === 'life-mirror' && (d.version ?? 0) > 1)) return false
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const ok = ['checkins', 'forecasts', 'settings', 'privateItems'].every((s) => dbx.objectStoreNames.contains(s))
      dbx.close()
      return ok
    },
    undefined,
    { polling: 100 },
  )
}
