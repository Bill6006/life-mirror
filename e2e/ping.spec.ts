import { expect, test, type Page } from '@playwright/test'

// The ping (the owner's report and decision of 2026-10-20). Its section in Settings showed only after Remind me was
// switched off and on, since the screen read the notification permission once, at opening, and the phone's page
// permission read undecided until something asked; and a browser that withdraws the permission cancels the address. The
// browser's notification permission and push manager are stand-ins here: no push service is reached, and every address is
// made up.

const TIMES = { morning: '09:30', afternoon: '13:00', evening: '19:30' }
const KEPT = 'https://push.example.test/kept'
const NEW = 'https://push.example.test/new'

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

/** The browser's permission and push manager, stood in: the page permission given, the address it holds, and the asks counted. */
async function stubPush(page: Page, o: { permission: NotificationPermission; live: string | null }): Promise<void> {
  await page.addInitScript(
    ({ permission, live, made }) => {
      try {
        localStorage.setItem('lm.inStep', '1')
      } catch {
        // A page without local storage numbers its ids as before.
      }
      let current: NotificationPermission = permission
      const asked = { permission: 0 }
      const fake = (endpoint: string) => ({
        endpoint,
        options: { applicationServerKey: null },
        toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'made-up-p256dh', auth: 'made-up-auth' } }),
        unsubscribe: async () => {
          held = null
          return true
        },
      })
      let held: ReturnType<typeof fake> | null = live ? fake(live) : null
      ;(window as unknown as { __asked: typeof asked }).__asked = asked
      ;(window as unknown as { __setPermission: (p: NotificationPermission) => void }).__setPermission = (p) => {
        current = p
      }
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => current })
      Notification.requestPermission = async () => {
        asked.permission++
        if (current === 'default') current = 'granted'
        return current
      }
      PushManager.prototype.getSubscription = async function () {
        return held as unknown as PushSubscription | null
      }
      PushManager.prototype.subscribe = async function () {
        held = fake(made)
        return held as unknown as PushSubscription
      }
      PushManager.prototype.permissionState = async function () {
        return current === 'granted' ? 'granted' : current === 'denied' ? 'denied' : 'prompt'
      }
    },
    { permission: o.permission, live: o.live, made: NEW },
  )
}

/** The settings record, read or merged straight in the phone's database. */
function settings(page: Page, merge?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return page.evaluate(async (m) => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const store = dbx.transaction(['settings'], 'readwrite').objectStore('settings')
    const now = await new Promise<Record<string, unknown> | undefined>((res, rej) => {
      const q = store.get(1)
      q.onsuccess = () => res(q.result as Record<string, unknown> | undefined)
      q.onerror = () => rej(q.error)
    })
    const next = m ? { ...(now ?? {}), id: 1, ...m } : (now ?? {})
    if (m)
      await new Promise<void>((res, rej) => {
        const q = store.put(next)
        q.onsuccess = () => res()
        q.onerror = () => rej(q.error)
      })
    dbx.close()
    return next
  }, merge)
}

const asked = (page: Page) => page.evaluate(() => (window as unknown as { __asked: { permission: number } }).__asked.permission)

test('Settings shows the ping with the page permission undecided, never switching reminders off and on, and the tap sets it up', async ({ page }) => {
  await stubPush(page, { permission: 'default', live: null })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await settings(page, { reminders: { enabled: true, times: TIMES } })
  await page.reload()
  // A ping never set up asks for nothing on Now.
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByTestId('ping-lost')).toHaveCount(0)

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-checkins').click()
  const ping = page.getByTestId('ping')
  await expect(ping).toBeVisible()
  await expect(ping.getByRole('heading', { name: 'The ping' })).toBeVisible()
  expect(await asked(page)).toBe(0)

  await ping.getByRole('button', { name: 'Set up the ping' }).click()
  await expect(page.getByTestId('ping-details')).toBeVisible()
  expect(await asked(page)).toBe(1)
  expect((await settings(page)).push).toMatchObject({ subscription: { endpoint: NEW }, needsTap: false, syncedEndpoint: NEW })
  // The address syncs with the settings: nothing to copy by hand, and the note says so, with no fixed times.
  await page.getByTestId('ping-details').click()
  const note = page.getByText('The address travels with your cloud copy', { exact: false })
  await expect(note).toBeVisible()
  await expect(note).toContainText('at your reminder times')
  await expect(page.getByRole('button', { name: 'Copy address' })).toHaveCount(0)
  await expect(page.getByText('PUSH_SUBSCRIPTION', { exact: false })).toHaveCount(0)
})

test('turned off by hand, the ping stays off: nothing makes the address again and nothing asks', async ({ page }) => {
  await stubPush(page, { permission: 'granted', live: KEPT })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await settings(page, { reminders: { enabled: true, times: TIMES }, push: { subscription: { endpoint: KEPT, expirationTime: null, keys: { p256dh: 'made-up-p256dh', auth: 'made-up-auth' } }, subscribedAt: '2026-10-19T20:30:00.000Z', changed: false, syncedEndpoint: KEPT } })
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-checkins').click()
  await page.getByTestId('ping-details').click()
  await page.getByRole('button', { name: 'Unsubscribe' }).click()
  await expect(page.getByTestId('ping').getByRole('button', { name: 'Set up the ping' })).toBeVisible()
  const off = (await settings(page)).push as Record<string, unknown>
  expect(off).toMatchObject({ subscription: null, needsTap: false })
  expect(typeof off.droppedAt).toBe('string')
  // The next start, the browser offering an address again and notifications allowed: nothing is taken, made or asked.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true))
  await page.waitForTimeout(500)
  await expect(page.getByTestId('ping-lost')).toHaveCount(0)
  expect((await settings(page)).push).toMatchObject({ subscription: null, droppedAt: off.droppedAt })
})

test('the ping’s section stays hidden while notifications are blocked, and says so', async ({ page }) => {
  await stubPush(page, { permission: 'denied', live: null })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await settings(page, { reminders: { enabled: true, times: TIMES } })
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-checkins').click()
  await expect(page.getByText("Notifications are off for this app in the phone's settings.")).toBeVisible()
  await expect(page.getByTestId('ping')).toHaveCount(0)
})

test('Settings reads the permission again when the app comes back: blocked meanwhile, the section goes and the note says so', async ({ page }) => {
  await stubPush(page, { permission: 'granted', live: KEPT })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await settings(page, { reminders: { enabled: true, times: TIMES }, push: { subscription: { endpoint: KEPT, expirationTime: null, keys: { p256dh: 'made-up-p256dh', auth: 'made-up-auth' } }, subscribedAt: '2026-10-19T20:30:00.000Z', changed: false, syncedEndpoint: KEPT } })
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-checkins').click()
  await expect(page.getByTestId('ping')).toBeVisible()
  await page.evaluate(() => {
    ;(window as unknown as { __setPermission: (p: NotificationPermission) => void }).__setPermission('denied')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByText("Notifications are off for this app in the phone's settings.")).toBeVisible()
  await expect(page.getByTestId('ping')).toHaveCount(0)
})

test('at start, a ping whose address the browser lost asks for one tap on Now, and the tap makes it again', async ({ page }) => {
  await stubPush(page, { permission: 'default', live: null })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await settings(page, { reminders: { enabled: true, times: TIMES }, push: { subscription: { endpoint: KEPT, expirationTime: null, keys: { p256dh: 'made-up-p256dh', auth: 'made-up-auth' } }, subscribedAt: '2026-10-19T20:30:00.000Z', changed: false, syncedEndpoint: KEPT } })
  await page.reload()
  const line = page.getByTestId('ping-lost')
  await expect(line).toBeVisible()
  await expect(line).toContainText('Reminders can’t reach you with the app closed until the ping is set up again.')
  expect((await settings(page)).push).toMatchObject({ subscription: null, needsTap: true, subscribedAt: '2026-10-19T20:30:00.000Z' })
  expect(await asked(page)).toBe(0)

  await line.getByTestId('ping-restore').click()
  await expect(line).toHaveCount(0)
  expect(await asked(page)).toBe(1)
  expect((await settings(page)).push).toMatchObject({ subscription: { endpoint: NEW }, needsTap: false, syncedEndpoint: NEW })
})

test('at start, a live address kept and synced asks for nothing', async ({ page }) => {
  await stubPush(page, { permission: 'default', live: KEPT })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  await settings(page, { reminders: { enabled: true, times: TIMES }, push: { subscription: { endpoint: KEPT, expirationTime: null, keys: { p256dh: 'made-up-p256dh', auth: 'made-up-auth' } }, subscribedAt: '2026-10-19T20:30:00.000Z', changed: false, syncedEndpoint: KEPT } })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  // The start-up check has run once the service worker answered; nothing changed and nothing asks.
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true))
  await page.waitForTimeout(500)
  await expect(page.getByTestId('ping-lost')).toHaveCount(0)
  expect((await settings(page)).push).toMatchObject({ subscription: { endpoint: KEPT }, subscribedAt: '2026-10-19T20:30:00.000Z' })
  expect(await asked(page)).toBe(0)
})
