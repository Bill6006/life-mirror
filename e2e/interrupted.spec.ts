import { expect, test, type Page } from '@playwright/test'

// The blank Now (2026-10-23): the phone's storage interrupted while Now made its first reads left Now an empty screen
// under the tab bar, with no error, until the app was reopened; interrupted while the database opened, every screen.
// Here an existing user's shape of record, the owner's steps on Location Context first, then the browser's storage
// interrupted as Chrome does when its storage fails under a page: every transaction under way aborted, the connection
// closed with its close event. Now must show its record again by itself, with no reload; never an empty screen while it
// reads; and the interruption is kept for the Worker's report.

/** A fixed afternoon inside the pickup's window (pickup 17:30), the afternoon's check-in done and its move done. */
const WHEN = new Date(2026, 9, 23, 16, 26, 30)
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const TODAY = day(WHEN)

/** Page errors other than the interruption's own: the storage refusing a write while it is out is expected, nothing else. */
let pageErrors: string[] = []

test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => {
    if (!['DatabaseClosedError', 'AbortError', 'InvalidStateError', 'OpenFailedError'].includes(e.name)) pageErrors.push(`${e.name}: ${e.message}`)
  })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lm.inStep', '1')
    } catch {
      // A page without local storage is in step anyway.
    }
    // The phone gives approximate positions, as the owner's does: 2 km across, the first answer five minutes old.
    const at = (age: number) => ({ coords: { latitude: 40.7128, longitude: -74.006, accuracy: 2000 }, timestamp: Date.now() - age }) as unknown as GeolocationPosition
    const g = navigator.geolocation
    g.getCurrentPosition = (ok) => void setTimeout(() => ok(at(5 * 60_000)), 50)
    g.watchPosition = (ok) => {
      setTimeout(() => ok(at(5 * 60_000)), 30)
      setTimeout(() => ok(at(0)), 600)
      return 1
    }
    g.clearWatch = () => undefined
    const query = navigator.permissions.query.bind(navigator.permissions)
    navigator.permissions.query = (d: PermissionDescriptor) => (d.name === 'geolocation' ? Promise.resolve({ state: 'granted' } as PermissionStatus) : query(d))
    // The interruption: every connection and transaction the page holds, and, once asked for, the storage cut under it the
    // way Chrome cuts it, at the page's first transaction (the open's own last step) or at its first read of the check-ins.
    const w = window as unknown as { __cut?: () => number; __cuts: number }
    w.__cuts = 0
    const conns: IDBDatabase[] = []
    const live = new Set<IDBTransaction>()
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (this: IDBFactory, ...args: [string, number?]) {
      const req = open.apply(this, args)
      req.addEventListener('success', () => conns.push(req.result))
      return req
    }
    w.__cut = () => {
      let aborted = 0
      for (const t of [...live]) {
        try {
          t.abort()
          aborted++
        } catch {
          // Already done.
        }
      }
      for (const c of conns.splice(0)) {
        c.close()
        c.dispatchEvent(new Event('close'))
      }
      w.__cuts++
      return aborted
    }
    const when = sessionStorage.getItem('test.cut')
    // Dropping lasts until the test ends it, never a time the machine's speed decides.
    ;(window as unknown as { __dropping: boolean }).__dropping = sessionStorage.getItem('test.drop') === '1'
    sessionStorage.removeItem('test.drop')
    const tx = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      const t = tx.apply(this, args)
      live.add(t)
      const done = () => live.delete(t)
      t.addEventListener('complete', done)
      t.addEventListener('abort', done)
      const names = [args[0]].flat() as string[]
      // The open's own first step reads every store at once; a read of the check-ins alone is a screen's.
      const due = when === 'open' || (when === 'read' && t.mode === 'readonly' && names.length === 1 && names[0] === 'checkins')
      if (due && sessionStorage.getItem('test.cut')) {
        sessionStorage.removeItem('test.cut')
        queueMicrotask(() => w.__cut?.())
      }
      // Dropped with no word: the page's first reads of the check-ins aborted, the connection left open and no close heard.
      if ((window as unknown as { __dropping: boolean }).__dropping && t.mode === 'readonly' && names.length === 1 && names[0] === 'checkins') queueMicrotask(() => t.abort())
      return t
    }
  })
})

test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

/** An existing user's record, written straight into the phone's store as it holds one. */
async function seedExistingUser(page: Page): Promise<void> {
  await page.evaluate(
    async ({ today, now }) => {
      const blocks: Record<string, string[]> = {
        morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
        afternoon: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
        evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
      }
      const hours: Record<string, number> = { morning: 9, afternoon: 13, evening: 19 }
      const fits = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock']
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction(['checkins', 'offers', 'outcomes', 'settings', 'places', 'placeCandidates'], 'readwrite')
      const add = (store: string, row: Record<string, unknown>) =>
        new Promise<number>((res) => {
          const q = tx.objectStore(store).add(row)
          q.onsuccess = () => res(q.result as number)
        })
      const base = new Date(now)
      const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      let k = 0
      for (let d = 21; d >= 0; d--) {
        const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() - d)
        const dk = key(date)
        for (const block of Object.keys(blocks)) {
          if (d === 0 && block === 'evening') continue
          k++
          const answers: Record<string, number> = {}
          blocks[block].forEach((id, ri) => {
            answers[id] = 1 + ((k + ri * 3) % 5)
          })
          const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40)
          const done = new Date(at.getTime() + 95_000).toISOString()
          tx.objectStore('checkins').add({ day: dk, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
          const moveId = k % 2 ? 'walk-ten' : 'nothing'
          // The afternoon's move skipped once, the next done on its card, as the owner's was today; the rest answered.
          if (d === 0 && block === 'afternoon') await add('offers', { kind: 'block', day: dk, block, at: done, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: done, closedAt: null, seenAt: done, fits })
          const id = await add('offers', { kind: 'block', day: dk, block, at: done, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: done, seenAt: done, fits })
          tx.objectStore('outcomes').add({ offerId: id, moveId, day: dk, block, at: done, outcome: moveId === 'nothing' ? null : 'done', why: null, passiveOutcome: null, seen: true })
        }
      }
      // The pickup's move, open in its window.
      tx.objectStore('offers').add({ kind: 'pickup', day: today, block: 'afternoon', at: new Date(base.getTime() - 4 * 60_000).toISOString(), situationKey: 'pickup:energy', target: 'energy', stance: '', band: '', reading: 0, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: null })
      const settings = tx.objectStore('settings')
      const get = settings.get(1)
      get.onsuccess = () => {
        const s = get.result
        const weekdays = { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false }
        settings.put({ ...s, location: { on: true, area: { lat: 40.7, lon: -74, at: new Date(base.getTime() - 86_400_000).toISOString() } }, weather: { on: true }, week: { ...s.week, livesWithMe: true, daycareDays: weekdays, pickupTime: '17:30' } })
      }
      const named = new Date(base.getTime() - 9 * 86_400_000)
      tx.objectStore('places').put({ id: 1, kind: 'home', cells: ['seeded-home'], area: { lat: 40.7, lon: -74 }, learnedAt: named.toISOString() })
      tx.objectStore('placeCandidates').put({ id: 1, cells: ['seeded-candidate'], area: { lat: 40.7, lon: -74 }, firstDay: key(named), lastDay: key(new Date(base.getTime() - 86_400_000)), days: 3, morning: 0, afternoon: 3, evening: 0, office: 0, church: 0 })
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { today: TODAY, now: WHEN.getTime() },
  )
}

/** The app opened as the owner's phone opens it: the record there, Now shown once in full. */
async function existingUser(page: Page): Promise<void> {
  await page.clock.setFixedTime(WHEN)
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await expect(page.getByTestId('block-row').first()).toBeVisible()
  await seedExistingUser(page)
  await page.reload()
  await shown(page)
}

/** Now with its record: the day's blocks, the pickup's move and the afternoon's. */
async function shown(page: Page, timeout = 10_000): Promise<void> {
  await expect(page.getByTestId('block-row')).toHaveCount(3, { timeout })
  await expect(page.locator('[data-testid="move-card"][data-kind="pickup"]')).toBeVisible({ timeout })
  await expect(page.getByTestId('place-question')).toBeVisible({ timeout })
}

/** The owner's steps of 2026-10-23: Location Context switched off, on again, off and on, then back to Now. */
async function ownersSteps(page: Page): Promise<void> {
  await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-location').click()
  const sw = page.getByTestId('location-switch')
  await expect(sw).toHaveAttribute('aria-pressed', 'true')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-pressed', 'false')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-pressed', 'true')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-pressed', 'false')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-pressed', 'true')
  await page.goBack()
  await page.locator('nav.tabs').getByRole('button', { name: 'Now', exact: true }).click()
  await shown(page)
}

/** What the phone kept of the interruptions, as the Worker's report would read them. */
function kept(page: Page): Promise<{ count: number; name: string; waits?: number; waited?: string[] } | null> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('life-mirror.storage.faults') ?? 'null'))
}

test('the storage cut while Now reads an existing record: Now shows its record again by itself, with no reload', async ({ page }) => {
  await existingUser(page)
  await ownersSteps(page)
  await page.evaluate(() => sessionStorage.setItem('test.cut', 'read'))
  await page.reload()
  // The interruption came, and no second load: the same page asks its reads again.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __cuts: number }).__cuts)).toBe(1)
  await shown(page)
  expect(await page.evaluate(() => (window as unknown as { __cuts: number }).__cuts)).toBe(1)
  expect((await kept(page))?.count).toBeGreaterThanOrEqual(1)
  // Now is not left on its reading line, and Settings, Mirror and Now again all draw.
  await expect(page.getByTestId('now-reading')).toHaveCount(0)
  await page.locator('nav.tabs').getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.locator('nav.tabs').getByRole('button', { name: 'Now', exact: true }).click()
  await shown(page)
})

test('the storage cut while the database opens: every read waits, then the record shows, with no reload', async ({ page }) => {
  await existingUser(page)
  await page.evaluate(() => sessionStorage.setItem('test.cut', 'open'))
  await page.reload()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __cuts: number }).__cuts)).toBe(1)
  await shown(page)
  // The rest of the app reads and writes again too: Location Context still switches, and its state holds.
  await ownersSteps(page)
  expect((await kept(page))?.count).toBeGreaterThanOrEqual(1)
})

test('never an empty screen while Now reads: its head and a line, then Try again past its limit, then the record', async ({ page }) => {
  await existingUser(page)
  // The check-ins held by another connection's long write, so Now's first reads wait (released after six seconds).
  await page.evaluate(() => sessionStorage.setItem('test.hold', '1'))
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('test.hold')) return
    sessionStorage.removeItem('test.hold')
    const r = indexedDB.open('life-mirror')
    r.onsuccess = () => {
      const t = r.result.transaction(['checkins'], 'readwrite')
      const store = t.objectStore('checkins')
      // The page's clock is fixed: the hold's six seconds are timed by performance.now, which it leaves running.
      const until = performance.now() + 6000
      const spin = () => {
        if (performance.now() < until) store.count().onsuccess = spin
      }
      spin()
      t.oncomplete = () => r.result.close()
    }
  })
  await page.reload()
  const reading = page.getByTestId('now-reading')
  await expect(reading).toBeVisible()
  await expect(reading.locator('h1')).toHaveText('Now')
  await expect(reading).toContainText('Reading the record on this phone.')
  await expect(reading).toContainText('taking longer than usual', { timeout: 6000 })
  await expect(page.getByTestId('now-read-again')).toBeVisible()
  // The hold ends, and the reads waiting on it answer.
  await shown(page, 15_000)
  const k = await kept(page)
  expect(k?.waits).toBeGreaterThanOrEqual(1)
  expect(k?.waited).toContain('checkins')
})

test('a first read dropped with no word and no close: Try again asks it again, and Now shows its record', async ({ page }) => {
  await existingUser(page)
  await page.evaluate(() => sessionStorage.setItem('test.drop', '1'))
  await page.reload()
  const reading = page.getByTestId('now-reading')
  await expect(reading).toContainText('taking longer than usual', { timeout: 6000 })
  // Nothing asks the dropped read again by itself: it waits for the tap.
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('block-row')).toHaveCount(0)
  // The storage answers again; only Try again asks the dropped read again.
  await page.evaluate(() => void ((window as unknown as { __dropping: boolean }).__dropping = false))
  await page.waitForTimeout(1000)
  await expect(page.getByTestId('block-row')).toHaveCount(0)
  await page.getByTestId('now-read-again').click()
  await shown(page)
  expect((await kept(page))?.waited).toEqual(['checkins'])
})

test('the next start carries the interruption on the facts row, for the Worker’s report alone', async ({ page }) => {
  await existingUser(page)
  await page.evaluate(() => sessionStorage.setItem('test.cut', 'read'))
  await page.reload()
  await shown(page)
  await page.reload()
  await shown(page)
  await expect
    .poll(
      () =>
        page.evaluate(async (today) => {
          const dbx = await new Promise<IDBDatabase>((res) => {
            const r = indexedDB.open('life-mirror')
            r.onsuccess = () => res(r.result)
          })
          const got = await new Promise<{ sheet?: { storageFault?: { count: number }; facts: { id: string }[] } } | undefined>((res) => {
            const q = dbx.transaction(['facts'], 'readonly').objectStore('facts').get(today)
            q.onsuccess = () => res(q.result)
          })
          dbx.close()
          return got?.sheet?.storageFault?.count ?? 0
        }, TODAY),
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(1)
})
