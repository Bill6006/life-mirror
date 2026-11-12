import { expect, test, type Page } from '@playwright/test'

// One batch of small fixes (2026-11-12), in the browser, on stand-in records. A commitment on a Path this phone does
// not know shows no row and breaks no screen; a screen that throws while it is drawn says so, with a way to try again
// and a way back, and keeps the fault by its name alone; "Delete everything" leaves no token in either of its homes;
// a private item is named outside its own screen only while the name switch is on.

// Every test fails on an uncaught error in the page, not only on what it asserts.
let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  // The phone here has read its cloud before, so its ids run from one.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lm.inStep', '1')
    } catch {
      // A page without local storage counts as in step anyway.
    }
  })
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

/** Writes rows straight into one of the phone's stores, as an earlier day of use would have left them; returns their keys. */
async function put(page: Page, store: string, rows: readonly unknown[]): Promise<number[]> {
  return page.evaluate(
    async ({ name, list }) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction([name], 'readwrite')
      const keys: number[] = []
      for (const row of list) {
        const q = tx.objectStore(name).put(row)
        q.onsuccess = () => keys.push(q.result as number)
      }
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
      return keys
    },
    { name: store, list: rows },
  )
}

/** The rows a store holds. */
async function rowsOf<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise<unknown[]>((res, rej) => {
      const q = dbx.transaction([name], 'readonly').objectStore(name).getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return rows
  }, store) as Promise<T[]>
}

/** Changes the settings record as a tap in Settings would have left it. */
async function patchSettings(page: Page, patch: Record<string, unknown>): Promise<void> {
  const [settings] = await rowsOf<Record<string, unknown>>(page, 'settings')
  await put(page, 'settings', [{ ...(settings ?? { id: 1 }), ...patch }])
}

const aimOn = (path: string) => ({ kind: 'path', path, name: null, stepMoveId: null, createdAt: '2026-11-01T12:00:00.000Z', archivedAt: null })

test('a commitment on a Path this phone does not know shows no row and breaks no screen', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 10, 13, 30))
  await page.goto('./')
  // As on a new phone: the commitment has arrived in the phone's own rows, the generated Path it runs on has not.
  await put(page, 'aims', [aimOn('gen-not-here-yet'), aimOn('social')])
  await page.reload()
  // Now draws, with the one People row the known Path gives.
  await expect(page.getByRole('button', { name: /Check in/ })).toBeVisible()
  await expect(page.locator('[data-kind="path"]')).toHaveCount(1)
  await expect(page.getByTestId('screen-fault')).toHaveCount(0)
  // Aims draws: the known Path's card, and nothing for the other, not even a card to read it.
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await expect(page.locator('[data-path="social"]')).toHaveCount(1)
  await expect(page.locator('[data-kind="path"]')).toHaveCount(1)
  await expect(page.getByTestId('path-waiting')).toHaveCount(0)
  await expect(page.getByTestId('screen-fault')).toHaveCount(0)
  // Evidence draws too, its Path reps section naming the known Path alone.
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByTestId('evidence')).toBeVisible()
  await expect(page.getByTestId('path-evidence-reps')).toHaveCount(1)
  await expect(page.getByTestId('screen-fault')).toHaveCount(0)
  // The commitment itself is untouched, waiting for its Path.
  expect((await rowsOf<{ path: string }>(page, 'aims')).map((a) => a.path).sort()).toEqual(['gen-not-here-yet', 'social'])
})

test('a screen that throws while it is drawn says so, tries again, and gives a way back; the fault is kept by its name alone', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 10, 13, 30))
  await page.goto('./')
  const [aimId] = await put(page, 'aims', [aimOn('social')])
  await page.reload()
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  const card = page.locator('[data-path="social"]')
  await expect(card).toHaveCount(1)
  // Under the open list, the commitment's Path goes missing: the list still shows its row, and the screen the row
  // opens asks the engine for a Path that is not there, which throws, as the engine should.
  await put(page, 'aims', [{ ...aimOn('gone-from-the-phone'), id: aimId }])
  await card.getByTestId('path-change').first().click()
  const fault = page.getByTestId('screen-fault')
  await expect(fault).toBeVisible()
  await expect(fault).toContainText('This screen could not be shown just now.')
  await expect(page.getByTestId('path-change-screen')).toHaveCount(0)
  // Kept on this phone for the Worker's report: a count, the minute, the screen and the error's name; never its message.
  const kept = await page.evaluate(() => localStorage.getItem('life-mirror.screen.faults'))
  expect(JSON.parse(kept ?? 'null')).toMatchObject({ count: 1, name: 'Error', screen: 'pathChange' })
  expect(kept).not.toContain('gone-from-the-phone')
  expect(kept).not.toContain('unknown path')
  // Try again with the fault still there: the line stays, and the count goes up.
  await page.getByTestId('screen-fault-again').click()
  await expect(fault).toBeVisible()
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('life-mirror.screen.faults'))) ?? 'null')).toMatchObject({ count: 2 })
  // The Path back, Try again draws the screen.
  await put(page, 'aims', [{ ...aimOn('social'), id: aimId }])
  await page.getByTestId('screen-fault-again').click()
  await expect(page.getByTestId('path-change-screen')).toBeVisible()
  await expect(fault).toHaveCount(0)
})

test('a screen that throws over the tabs can be left: Close returns to the tabs, which work as ever', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 10, 13, 30))
  await page.goto('./')
  const [aimId] = await put(page, 'aims', [aimOn('social')])
  await page.reload()
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  const card = page.locator('[data-path="social"]')
  await expect(card).toHaveCount(1)
  await put(page, 'aims', [{ ...aimOn('gone-from-the-phone'), id: aimId }])
  await card.getByTestId('path-change').first().click()
  await expect(page.getByTestId('screen-fault')).toBeVisible()
  await page.getByTestId('screen-fault-leave').click()
  await expect(page.getByTestId('screen-fault')).toHaveCount(0)
  await expect(page.locator('nav.tabs')).toBeVisible()
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await expect(page.getByTestId('screen-fault')).toHaveCount(0)
})

/** A stand-in for the cloud database: every statement goes through, and nothing is held. */
async function emptyCloud(page: Page): Promise<{ requests: () => number }> {
  let requests = 0
  await page.route(/turso\.io/, async (route) => {
    const req = route.request()
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    requests++
    const body = req.postDataJSON() as { requests: { type: string; batch?: { steps: unknown[] } }[] }
    const empty = { cols: [], rows: [], affected_row_count: 0, last_insert_rowid: null }
    const results = body.requests.map((r) => {
      if (r.type === 'execute') return { type: 'ok', response: { type: 'execute', result: empty } }
      if (r.type === 'batch') return { type: 'ok', response: { type: 'batch', result: { step_results: (r.batch?.steps ?? []).map(() => empty), step_errors: (r.batch?.steps ?? []).map(() => null) } } }
      return { type: 'ok', response: { type: r.type } }
    })
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ baton: null, base_url: null, results }) })
  })
  return { requests: () => requests }
}

const TOKEN_KEYS = ['lm.cloudToken', 'lm.cloudTokenMark', 'lm.cloudTokenLog', 'lm.cloudDevice']
const tokenHomes = (page: Page) => page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k) !== null])), TOKEN_KEYS)

test('after Delete everything and a restart, no token is found in either of its homes, and nothing syncs', async ({ page }) => {
  const cloud = await emptyCloud(page)
  await page.goto('./')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-cloud').click()
  await page.getByTestId('token-input').fill('stand-in-token-never-real')
  await page.getByTestId('token-keep').click()
  // Kept in both homes, and a sync went through: the probe can say yes.
  await expect.poll(async () => (await tokenHomes(page))['lm.cloudToken']).toBe(true)
  await expect.poll(() => cloud.requests()).toBeGreaterThan(0)
  await expect.poll(async () => (await rowsOf<{ cloud?: { token?: string | null } }>(page, 'settings'))[0]?.cloud?.token).toBe('stand-in-token-never-real')
  expect(await tokenHomes(page)).toEqual({ 'lm.cloudToken': true, 'lm.cloudTokenMark': true, 'lm.cloudTokenLog': true, 'lm.cloudDevice': true })
  // Another app's key at the same address, which the wipe must leave alone.
  await page.evaluate(() => localStorage.setItem('another-app.choice', 'kept'))

  await page.goto('./')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-data').click()
  await page.getByTestId('delete-start').click()
  await page.getByTestId('delete-word').fill('delete')
  await page.getByTestId('delete-confirm').click()
  // The app starts again, empty.
  await expect(page.getByRole('button', { name: /Check in/ })).toBeVisible()
  expect(await tokenHomes(page)).toEqual({ 'lm.cloudToken': false, 'lm.cloudTokenMark': false, 'lm.cloudTokenLog': false, 'lm.cloudDevice': false })
  expect(await page.evaluate(() => localStorage.getItem('another-app.choice'))).toBe('kept')
  // And again after a further restart: no token came back into the settings, and nothing was asked of the cloud.
  const asked = cloud.requests()
  await page.reload()
  await expect(page.getByRole('button', { name: /Check in/ })).toBeVisible()
  await page.waitForTimeout(1500)
  expect((await rowsOf<{ cloud?: { token?: string | null } }>(page, 'settings'))[0]?.cloud?.token ?? null).toBeNull()
  expect(await tokenHomes(page)).toEqual({ 'lm.cloudToken': false, 'lm.cloudTokenMark': false, 'lm.cloudTokenLog': false, 'lm.cloudDevice': false })
  expect(cloud.requests()).toBe(asked)
})

test('a private item is named on Evidence only while the name switch is on', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 10, 13, 30))
  await page.goto('./')
  const morning = ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality']
  const evening = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']
  const [itemId] = await put(page, 'privateItems', [{ name: 'Stand-in item', createdAt: '2026-10-20T12:00:00.000Z', archived: 0 }])
  const checkins: unknown[] = []
  for (let d = 12; d >= 1; d--) {
    const date = new Date(2026, 10, 10 - d)
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const at = (hour: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 40).toISOString()
    const answers = (ids: string[], level: number) => Object.fromEntries(ids.map((id) => [id, level]))
    // Logged on every other evening; shown on all of them, so the rest count as evenings without it.
    const logged = d % 2 === 0
    checkins.push({ day, block: 'morning', asked: morning, startedAt: at(7), completedAt: at(7), updatedAt: at(7), answers: answers(morning, 3), activeMs: 60_000 })
    checkins.push({ day, block: 'evening', asked: evening, startedAt: at(19), completedAt: at(19), updatedAt: at(19), answers: answers(evening, 3), activeMs: 60_000, extras: { privateShown: { [String(itemId)]: true }, ...(logged ? { private: { [String(itemId)]: true } } : {}) } })
  }
  await put(page, 'checkins', checkins)
  await patchSettings(page, { privateInSelection: true, showPrivate: false })
  await page.reload()

  const open = async () => {
    await page.getByRole('button', { name: 'Moves', exact: true }).click()
    await page.getByRole('button', { name: /^Evidence/ }).click()
    await expect(page.getByTestId('evidence')).toBeVisible()
  }
  await open()
  const line = page.getByTestId('private-association')
  await expect(line).toHaveCount(1)
  // The name switch off: the line is there, and says "A private item".
  await expect(line).toContainText(/^A private item: /)
  await expect(page.getByTestId('evidence')).not.toContainText('Stand-in item')

  // The switch on: the same line names it.
  await patchSettings(page, { showPrivate: true })
  await page.reload()
  await open()
  await expect(page.getByTestId('private-association')).toContainText(/^Stand-in item: /)
})

/** Taps one phrase of the reading on screen, then waits for the screen to move on. */
async function tapAnchor(page: Page): Promise<boolean> {
  const title = await page.locator('#ci-title').textContent({ timeout: 1500 }).catch(() => null)
  if (title === null) return false
  try {
    await page.getByTestId('anchor').nth(2).click({ timeout: 3000 })
  } catch {
    return false
  }
  const moved = page.locator('#ci-title', { hasNotText: title }).or(page.getByTestId('give-back')).or(page.getByTestId('extras')).or(page.getByTestId('outcome-ask'))
  await expect(moved.first()).toBeVisible()
  return true
}

/** The open block's check-in, start to finish. */
async function checkIn(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Check in/ }).click()
  const card = page.getByTestId('give-back')
  const extras = page.getByTestId('extras')
  const ask = page.getByTestId('outcome-ask')
  for (let i = 0; i < 24; i++) {
    await expect(card.or(extras).or(ask).or(page.getByTestId('anchor').nth(2)).first()).toBeVisible()
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
  }
  await expect(card).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
}

test('a private item is named on the move card only while the name switch is on', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 10, 13, 30))
  await page.goto('./')
  const morning = ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality']
  const afternoon = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm']
  const evening = ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness']
  // Placed at the afternoon check-in, so its line belongs on the afternoon's move card.
  const [itemId] = await put(page, 'privateItems', [{ name: 'Stand-in item', createdAt: '2026-10-20T12:00:00.000Z', archived: 0, blocks: ['afternoon'] }])
  const checkins: unknown[] = []
  for (let d = 12; d >= 1; d--) {
    const date = new Date(2026, 10, 10 - d)
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const at = (hour: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 40).toISOString()
    const answers = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, 3]))
    const row = (block: string, ids: string[], hour: number, extras?: unknown) => ({ day, block, asked: ids, startedAt: at(hour), completedAt: at(hour), updatedAt: at(hour), answers: answers(ids), activeMs: 60_000, ...(extras ? { extras } : {}) })
    checkins.push(row('morning', morning, 7))
    // Shown at every afternoon, logged at every other one: six afternoons with it, six without.
    checkins.push(row('afternoon', afternoon, 13, { privateShown: { [String(itemId)]: true }, ...(d % 2 === 0 ? { private: { [String(itemId)]: true } } : {}) }))
    checkins.push(row('evening', evening, 19))
  }
  await put(page, 'checkins', checkins)
  await patchSettings(page, { privateInSelection: true, showPrivate: false })
  await page.reload()
  await checkIn(page)
  const cardOnNow = page.getByTestId('move-card').first()
  await expect(cardOnNow).toBeVisible()
  // The record's line sits with the card's reasons, under its fold-out.
  await cardOnNow.getByTestId('move-why').click()
  const line = page.getByTestId('private-line')
  // The name switch off: the card carries the record's line, and says "a private item".
  await expect(line).toHaveCount(1)
  await expect(line).toContainText('afternoons with a private item logged')
  await expect(cardOnNow).not.toContainText('Stand-in item')

  // The switch on: the same line names it.
  await patchSettings(page, { showPrivate: true })
  await page.reload()
  await expect(page.getByTestId('move-card').first()).toBeVisible()
  await page.getByTestId('move-card').first().getByTestId('move-why').click()
  await expect(page.getByTestId('private-line')).toContainText('afternoons with Stand-in item logged')
})
