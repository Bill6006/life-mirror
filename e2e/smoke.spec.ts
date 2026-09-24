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

// Every test fails on an uncaught error in the page, not only on what it asserts (Part 18).
let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

/** Writes days of completed check-ins straight into the phone's store, the last evening lonely enough to be spoken to. */
async function seedRecord(page: Page, days: number): Promise<void> {
  await page.evaluate(async (n) => {
    const blocks: Record<string, string[]> = {
      morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
      afternoon: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
      evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
    }
    const hours: Record<string, number> = { morning: 7, afternoon: 13, evening: 19 }
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['checkins'], 'readwrite')
    const store = tx.objectStore('checkins')
    const now = new Date()
    for (let d = n; d >= 1; d--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      let bi = 0
      for (const block of Object.keys(blocks)) {
        bi++
        const answers: Record<string, number> = {}
        blocks[block].forEach((id, ri) => {
          answers[id] = 1 + ((d * 7 + bi * 3 + ri * 3 + (ri % 2) * d) % 5)
        })
        if (d === 1 && block === 'evening') answers.loneliness = 5
        const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40)
        const done = new Date(at.getTime() + 95_000)
        store.add({ day, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done.toISOString(), updatedAt: done.toISOString(), answers, activeMs: 60_000 })
      }
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  }, days)
}

/** Writes a row into one of the phone's stores as the sync from the brain's rows would; the caller reloads to read it. */
async function putInto(page: Page, store: string, row: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    async ({ store, r }) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const q = indexedDB.open('life-mirror')
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      const tx = dbx.transaction([store], 'readwrite')
      tx.objectStore(store).put(r)
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { store, r: row },
  )
}

/** Writes a line into the phone's store as the Worker's sync would; the caller reloads to read it. */
async function putBrief(page: Page, row: Record<string, unknown>): Promise<void> {
  await putInto(page, 'brainBriefs', row)
}

/** Settings is a list of sections (2026-09-24): open one by its row. */
async function settingsSection(page: Page, id: string): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId(`settings-${id}`).click()
}

/** From a section back to the Settings tab, where the tab bar shows again. */
async function backToSettings(page: Page): Promise<void> {
  await page.locator('.sub-head .back').click()
  await expect(page.locator('nav.tabs')).toBeVisible()
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
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0d111d')

  // One scroll per screen: nothing is wider than the phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // The About stamp carries a commit the pipeline run can be matched against.
  await settingsSection(page, 'about')
  await expect(page.getByTestId('build-commit')).toHaveText(/^([0-9a-f]{7}|unbuilt)$/)
  await backToSettings(page)

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

test('the Brain screen: who writes the line, what Claude may read, who wrote recent lines and what Claude read; a line Claude wrote says so under Why', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 18, 8, 5))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await putBrief(page, { id: '2026-09-18:brief', day: '2026-09-18', kind: 'brief', text: 'A line Claude wrote for this test.', mode: 'observation', factIds: ['record'], cardIds: [], model: 'claude-opus-5-5', at: '2026-09-18T11:48:00.000Z', factsDay: '2026-09-18', writer: 'claude', askedModel: 'opus' })
  await putInto(page, 'brainReads', { id: 'read:1', day: '2026-09-18', at: '2026-09-18T11:47:00.000Z', task: 'line', category: 'notes', count: 3, bytes: 240, via: 'briefing' })
  await putInto(page, 'brainReads', { id: 'read:2', day: '2026-09-18', at: '2026-09-18T11:47:01.000Z', task: 'line', category: 'reflections', count: 2, bytes: 2048, via: 'briefing' })
  // A coach run made by hand to test the path: its reads are shown apart, as a test run.
  await putInto(page, 'brainReads', { id: 'read:3', day: '2026-09-18', at: '2026-09-18T11:49:00.000Z', task: 'coach', category: 'notes', count: 1, bytes: 80, via: 'context', dry: true })
  await page.reload()

  // The card: the one-word tag in the title row, and under Why, Claude with the model asked for and the one that wrote.
  const card = page.getByTestId('brief')
  await expect(card.getByTestId('brief-line')).toHaveText('A line Claude wrote for this test.')
  await expect(card.getByTestId('brief-writer-tag')).toHaveText('Brain')
  await card.getByTestId('brief-why').click()
  await expect(card.getByTestId('brief-writer')).toHaveText('Written by Claude through your claude.ai routine: asked for Opus, written by claude-opus-5-5, from your record as Settings → Brain allows.')

  // Settings → Brain.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Brain/ }).click()
  const screen = page.getByTestId('brain-screen')
  await expect(screen.getByTestId('brain-intro')).toContainText('under your own claude.ai account with model training off')
  await expect(screen.getByTestId('brain-intro')).toContainText('what you write about other people included')
  await expect(screen.getByTestId('brain-intro')).toContainText('Anthropic’s handling and retention follow your Claude account’s current terms and privacy settings')
  await expect(screen.getByTestId('brain-model-opus')).toHaveAttribute('aria-pressed', 'true')
  await screen.getByTestId('brain-model-sonnet').click()
  await expect(screen.getByTestId('brain-model-sonnet')).toHaveAttribute('aria-pressed', 'true')
  await expect(screen.getByTestId('brain-model-opus')).toHaveAttribute('aria-pressed', 'false')
  await expect(screen.locator('[data-testid^="brain-switch-"]')).toHaveCount(11)
  await expect(screen.getByTestId('brain-switch-notes')).toHaveAttribute('aria-pressed', 'true')
  await screen.getByTestId('brain-switch-notes').click()
  await expect(screen.getByTestId('brain-switch-notes')).toHaveAttribute('aria-pressed', 'false')
  await expect(screen.getByTestId('brain-recent-line')).toHaveText(/Claude, asked for Opus, written by claude-opus-5-5$/)
  const groups = screen.getByTestId('brain-read-group')
  await expect(groups).toHaveCount(2)
  await expect(groups.nth(0)).toContainText('the coach, a test run')
  await expect(groups.nth(0)).toContainText('Check-in notes 1, 80 B')
  await expect(groups.nth(1)).toContainText('the day’s line')
  await expect(groups.nth(1)).toContainText('Check-in notes 3, 240 B')
  await expect(groups.nth(1)).toContainText('Reflections 2, 2.0 KB')
  await expect(screen.getByTestId('brain-coach')).toContainText('It is watched every day')
  await expect(screen.getByTestId('brain-coach')).toContainText('the app’s own pick stands until ten clean days in a row')
  await expect(screen.getByTestId('brain-switch-monthlyCheck')).toContainText('Read only by the coach; never by the day’s line or the review.')
  await expect(screen.getByTestId('brain-coach-last')).toHaveText('It has not chosen yet.')
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Reopened, the screen shows the choices as they were left: they are kept in the synced row.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Brain/ }).click()
  await expect(page.getByTestId('brain-switch-notes')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('brain-model-sonnet')).toHaveAttribute('aria-pressed', 'true')
})

test('a past day is named by its day, never "Today so far", and the null offer is not a move with a name', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 8, 0))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await expect(page.getByTestId('day-glance')).toContainText('Today so far')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  // The next morning, yesterday's summary is headed with yesterday.
  await page.clock.setFixedTime(new Date(2026, 8, 8, 8, 30))
  await page.reload()
  await page.getByRole('button', { name: /Morning check-in of .*Sep 7/ }).click()
  await expect(page.getByTestId('summary')).toBeVisible()
  await expect(page.getByTestId('day-glance')).toContainText('Sep 7')
  await expect(page.getByTestId('day-glance')).not.toContainText('Today so far')
})

test('the brief card: the line, its action and the taps by default; the readings, the grounds and the writer behind Why; no error on a seeded open; a title that says when to act on the line', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 18, 8, 5))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  // Three and a half weeks written at once, then opened: forecasting runs twice on open and must not collide.
  await seedRecord(page, 24)
  await page.reload()
  const card = page.getByTestId('brief')
  await expect(card.getByTestId('brief-line')).toBeVisible()
  await expect(card.getByTestId('brief-last-night')).toHaveCount(0)
  await expect(card.getByTestId('brief-writer')).toHaveCount(0)
  await expect(card.getByTestId('brief-writer-tag')).toHaveCount(0)
  await card.getByTestId('brief-why').click()
  const why = card.getByTestId('brief-why-panel')
  await expect(why).toContainText('Why this line')
  await expect(why).toContainText('Also from your record')
  await expect(why.getByTestId('brief-last-night')).toBeVisible()
  await expect(why.getByTestId('brief-writer')).toHaveText('Chosen on this phone from your record, by the situation engine.')
  // A line the Worker wrote carries a one-word tag in the title row, and Why names the model.
  const workerLine = { id: '2026-09-18:brief', day: '2026-09-18', kind: 'brief', text: 'A line the Worker wrote for this test.', mode: 'observation', factIds: ['record'], cardIds: [], model: '@cf/test/model', at: '2026-09-18T09:15:00.000Z', factsDay: '2026-09-17' }
  await putBrief(page, workerLine)
  await page.reload()
  await expect(card.getByTestId('brief-line')).toHaveText('A line the Worker wrote for this test.')
  await expect(card.getByTestId('brief-writer-tag')).toHaveText('Brain')
  await card.getByTestId('brief-why').click()
  await expect(card.getByTestId('brief-writer')).toContainText('@cf/test/model')

  // The title says when the line is meant to be acted on, from its action alone (owner, 2026-09-23). With no action: for today.
  await expect(card.getByTestId('brief-when')).toHaveText('For today')
  // A tap that does it on the spot is now, and for today once taken.
  await putBrief(page, { ...workerLine, action: { kind: 'depth', value: 'short' } })
  await page.reload()
  await expect(card.getByTestId('brief-when')).toHaveText('Now')
  await card.getByTestId('brief-action').click()
  await expect(card.getByTestId('brief-acted')).toBeVisible()
  await expect(card.getByTestId('brief-when')).toHaveText('For today')
  // A step pinned to her bedtime is later today, before the plan is made and after it, and for today once the moment passes.
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-name-input').fill('Networking')
  await page.getByTestId('aim-name-add').click()
  await expect(page.getByTestId('aim-card')).toHaveCount(1)
  await putBrief(page, { ...workerLine, action: { kind: 'plan', aimId: 1, cue: 'afterBedtime' } })
  await page.reload()
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(card.getByTestId('brief-when')).toHaveText('Later today')
  await expect(card.getByTestId('brief-action')).toHaveText('Plan it: after her bedtime, 20:00')
  await card.getByTestId('brief-action').click()
  await expect(card.getByTestId('brief-acted')).toHaveText('Planned for today.')
  await expect(card.getByTestId('brief-when')).toHaveText('Later today')
  await page.clock.setFixedTime(new Date(2026, 8, 18, 20, 5))
  await page.reload()
  await expect(card.getByTestId('brief-when')).toHaveText('For today')
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
  await settingsSection(page, 'direction')
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
  await card.getByTestId('move-why').click()
  const evidence = card.getByTestId('move-evidence')
  await expect(evidence.getByText('Why this')).toBeVisible()
  await expect(evidence.getByText('Testing')).toBeVisible()
  await expect(evidence.getByText('Little evidence')).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Now shows it and the honest line; Skip records and shows the next candidate.
  const first = await page.getByTestId('move-card').getByTestId('move-name').innerText()
  await expect(page.getByTestId('knows')).toContainText(/weeks? of record/)
  await page.getByRole('button', { name: /^Skip/ }).click()
  await expect(page.getByTestId('move-card').getByTestId('move-name')).not.toHaveText(first)

  // The constant lives in Settings; nothing about her appears on Now.
  await settingsSection(page, 'week')
  await expect(page.getByTestId('lives-with-me')).toHaveAttribute('aria-pressed', 'true')
  await backToSettings(page)
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

  // The note field says who reads it (Part 17).
  await expect(page.getByTestId('note-input')).toHaveAttribute('placeholder', 'One line. Claude may read it, as Settings → Brain allows.')
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
  await expect(page.getByTestId('before-card')).toContainText('none of it is a cause')
  await page.getByRole('button', { name: 'Hunger', exact: true }).click()
  await expect(page.getByTestId('trace').locator('circle.ch-dot-ov')).toHaveCount(1)

  // Data: private items stay out of an export unless ticked; delete everything takes two taps and a word.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-data').click()
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
  await expect(page.getByTestId('family-moves')).toHaveCount(15)
  const count = await page.locator('[data-testid="family-moves"] .move').count()
  expect(count).toBeGreaterThanOrEqual(60)
  // Every entry, live moves and path reps; the plan's hundred live moves is held by the unit test.
  expect(count).toBeLessThanOrEqual(150)
  await expect(page.getByRole('heading', { name: 'Time with her, no agenda' })).toBeVisible()
  await expect(page.locator('#move-low-pressure-conversation')).toBeVisible()

  // Phase 9: tags and starting beliefs on every entry, proposals marked, the research and the prompt readable.
  await expect(page.getByTestId('prior').first()).toContainText('Starting belief')
  await expect(page.getByTestId('learned-tags').locator('.move')).toHaveCount(8)
  await expect(page.locator('#move-ask-one-question')).toBeVisible()
  await expect(page.locator('#move-ask-one-question .move-status')).toContainText('rung 1 of the participation ladder')
  await expect(page.locator('#move-ask-one-question .move-status')).toContainText('Social path, stage 4, moves the stage')

  // Parts 23 and 26: both paths readable in full; since Parts 24 and 27 their reps are offered through their rows alone.
  await expect(page.getByTestId('path')).toHaveCount(2)
  await expect(page.getByTestId('path-stage')).toHaveCount(13)
  await expect(page.getByTestId('path').first()).toContainText('Stage 1 · Presence')
  await expect(page.getByTestId('path').nth(1)).toContainText('Stage 7 · Keeping')
  await expect(page.getByTestId('path-channel')).toContainText('off until you turn it on')
  await expect(page.getByTestId('never-counted').first()).toContainText('a second ask after a no')
  await expect(page.getByTestId('path-act')).toHaveCount(6)
  await expect(page.getByTestId('path-act').filter({ hasText: 'If you are a parent: a decision that is yours alone' })).toContainText('never schedules an introduction and never recommends one')
  await expect(page.getByTestId('path-rep-after').first()).toContainText('offered by the app once these are done: Talk about a good ordinary week')
  // The monthly check's help: a yes to the safety or the conduct question shows it, a doubt alone does not (owner, 2026-09-23).
  const check = page.getByTestId('path-act').filter({ hasText: 'A monthly private check' })
  await expect(check).toContainText('inside this check and nowhere else')
  expect(((await check.innerText()).match(/A yes shows the help\./g) ?? []).length).toBe(2)
  await expect(page.getByTestId('path-act').filter({ hasText: 'A yes shows the help.' })).toHaveCount(1)
  // Parts 24 and 27 wired both paths, so their cards are admitted and their reps kept for their rows.
  await expect(page.getByTestId('path-evidence').first()).toContainText('(admitted;')
  await expect(page.getByTestId('path-evidence').nth(1)).toContainText('(admitted;')
  await expect(page.getByTestId('path-evidence').nth(1)).not.toContainText('draft')
  await expect(page.locator('#move-greet-by-name .move-status')).toContainText('Offered through its path’s row alone, never by the day’s draw')
  await expect(page.locator('#move-re-engage-someone .move-status')).toContainText('Offered through its path’s row alone, never by the day’s draw')
  await expect(page.getByTestId('path-act').filter({ hasText: 'A relationship course, if you want one' })).toContainText('never needed to move on')
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

  await settingsSection(page, 'checkins')
  await page.getByTestId('low-demand').click()
  await expect(page.getByTestId('low-demand')).toHaveAttribute('aria-pressed', 'true')
  await backToSettings(page)
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.getByTestId('block-row')).toHaveCount(1)

  await page.reload()
  await expect(page.getByTestId('block-row')).toHaveCount(1)

  await settingsSection(page, 'checkins')
  await page.getByTestId('low-demand').click()
  await page.getByRole('button', { name: 'Short', exact: true }).click()
  await backToSettings(page)
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

  // Aims → add a commitment → study, named by you; with no skills yet the step is the catalogue's own.
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-name-input').fill('Networking')
  await page.getByTestId('aim-name-add').click()
  await expect(page.getByTestId('aim-card')).toHaveCount(1)
  await expect(page.getByTestId('aim-step')).toContainText('Write the exact next study step')

  // Now: the lowest phrase on everything, and the step still sits above the move, both named.
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page, 0)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('your-aims')).toBeVisible()
  await expect(page.getByTestId('aim-card')).toBeVisible()
  await expect(page.getByTestId('aim-card')).toContainText('Networking')
  // The brief's line: the judgment engine speaks from the record, and one tap says how it landed.
  await expect(page.getByTestId('brief-line')).toContainText('Networking has no skill on its ladder yet')
  await page.getByTestId('brief-useful').click()
  await expect(page.getByTestId('brief-noted')).toBeVisible()
  // The two headings say it; there is no explaining line under Tonight any more.
  await expect(page.getByTestId('tonight')).toHaveCount(0)
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
  await expect(page.getByTestId('subject-chip')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('skill-input').fill('Subnetting')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByTestId('skill-subject')).toContainText('Networking')
  await expect(page.getByTestId('skill-row')).toContainText('Not started')
  await page.getByTestId('rung-up').click()
  await expect(page.getByTestId('skill-row')).toContainText('Watched or read')
  await expect(page.locator('#main')).not.toContainText('%')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('aim-step')).toContainText('Subnetting · practise it')
  // The last fact on the card, and the six proofs changed in one tap: the mark stays, the words change.
  await expect(page.getByTestId('aim-last')).toContainText('moved today')
  await page.getByTestId('aim-details').click()
  await page.getByTestId('aim-ladder-change').click()
  await page.getByTestId('aim-ladder-language').click()
  await expect(page.getByTestId('aim-step')).toContainText('Subnetting · say it')
  await expect(page.getByTestId('aim-proofs')).toContainText('Language proofs')

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
  await page.getByTestId('settings-data').click()
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
  // The week ahead is the first thing on the screen, and says what it is waiting for.
  await expect(page.getByTestId('week-ahead')).toContainText('The week ahead appears after fourteen days of record')
  const order = await page.getByTestId('weekly').locator('h2.section').allInnerTexts()
  expect(order[0].toLowerCase()).toBe('the week ahead, as you usually are')
  await expect(page.getByTestId('hit-rate')).toContainText('No day-ahead forecasts scored yet')
  await expect(page.getByTestId('best-silent')).toContainText('0 so far')
  await expect(page.getByTestId('family-health')).toHaveCount(14)
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
  await expect(page.locator('[data-testid^="chip-state-"]')).toHaveCount(10)
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

test('fatherhood: Aims → Her adds a skill from the checklists, counts one with the help she needed, and the rung moves only by your tap', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Her/ }).click()
  await expect(page.getByTestId('her')).toBeVisible()
  await expect(page.getByTestId('her-source')).toContainText('CDC')
  await expect(page.getByTestId('her-moments')).toContainText('None counted yet')

  await page.getByRole('button', { name: /^Add a skill from the checklists/ }).click()
  await expect(page.getByTestId('her-pick')).toBeVisible()
  await page.getByTestId('her-add-counts-to-ten').click()
  await expect(page.getByTestId('her-add-counts-to-ten')).toBeDisabled()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('her-skill')).toHaveCount(1)
  await expect(page.getByTestId('her-rung')).toHaveText('Not introduced')

  // One count: the moment is dated, the counts are plain, and the rung has not moved.
  await page.getByTestId('her-count').click()
  await page.getByTestId('her-help-some').click()
  await expect(page.getByTestId('her-counts')).toContainText('Did it 1 · on her own 0 · a little help 1 · a lot of help 0')
  await expect(page.getByTestId('her-rung')).toHaveText('Not introduced')
  await expect(page.getByTestId('her-moments')).toContainText('1 moment')

  // The rung moves by the tap and by nothing else; no proportion of skills anywhere on the screen.
  await page.getByTestId('her-rung-open').click()
  await page.getByTestId('her-rung-practicingWithDaddy').click()
  await expect(page.getByTestId('her-rung')).toHaveText('Practicing with Daddy')
  await expect(page.getByTestId('her')).not.toContainText('%')
  await expect(page.getByTestId('her')).not.toContainText(/[0-9]+ of [0-9]+/)

  // Kept across a relaunch.
  await page.reload()
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Her/ }).click()
  await expect(page.getByTestId('her-rung')).toHaveText('Practicing with Daddy')
  await expect(page.getByTestId('her-moments')).toContainText('1 moment')

  // The catalogue: the fatherhood family is there, and time with her, no agenda, is still its own move under people.
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Read the catalogue/ }).click()
  await expect(page.getByRole('heading', { name: 'Practise one of her skills together' })).toBeVisible()
  await expect(page.locator('#family-people').getByRole('heading', { name: 'Time with her, no agenda' })).toBeVisible()
})

test('a Done tap on the card, once the move’s minutes have passed, writes the outcome at that moment, collapses the card, and the next check-in does not ask', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 12, 5))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('move-card')).toBeVisible()
  // The draw may offer Nothing today, which by design has no Done tap: Skip shows the next, and
  // the null offer is never offered twice in a day, so one skip reaches a move.
  if ((await page.getByTestId('move-name').first().textContent())?.trim() === 'Nothing today') {
    await page.getByRole('button', { name: /^Skip/ }).click()
    await expect(page.getByTestId('move-name').first()).not.toHaveText('Nothing today')
  }
  // The minutes have not passed: no tap, no box, nothing sits there unticked.
  await expect(page.getByTestId('move-done')).toHaveCount(0)
  await expect(page.getByTestId('move-card')).toContainText('Asked at your next check-in')

  // Later in the same block the tap is there; one tap, and the card is a fact line with the time of the tap.
  await page.clock.setFixedTime(new Date(2026, 8, 7, 16, 30))
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await page.getByTestId('move-done').click()
  await expect(page.getByTestId('move-fact')).toContainText(/Done · 4:30 pm/)
  // A passive item alongside is asked right there, once; answered, nothing sits unticked.
  const inline = page.getByTestId('passive-inline-done')
  if (await inline.count()) await inline.click()
  await expect(page.getByTestId('move-card').getByRole('button')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('move-fact')).toContainText('Done')

  // The evening check-in goes straight to the readings: nothing left to ask.
  await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
  await page.reload()
  await page.getByRole('button', { name: /Check in/ }).click()
  await expect(page.getByTestId('anchor').first()).toBeVisible()
  await expect(page.getByTestId('outcome-ask')).toHaveCount(0)

  // History keeps the outcome as its own record beside the offer.
  await tapThrough(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^History/ }).click()
  await expect(page.getByTestId('history-row').filter({ hasText: 'Outcome' }).first()).toBeVisible()
})

test('the Done tap closes with its block: after that, only the next check-in records the move', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 12, 5))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('move-card')).toBeVisible()
  await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
  await page.reload()
  await expect(page.getByTestId('move-done')).toHaveCount(0)
  await page.getByRole('button', { name: /Check in/ }).click()
  await expect(page.getByTestId('outcome-ask')).toBeVisible()
})

test('the cloud token survives its database copy going missing, and the screen says what happened', async ({ page }) => {
  // The database is never reached: every request to the host is refused at the browser.
  await page.route(/turso\.io/, (route) => route.abort())
  const token = 'e2e-token-never-real'
  await page.goto('./')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Cloud copy/ }).click()
  await page.getByTestId('token-input').fill(token)
  await page.getByTestId('token-keep').click()
  await expect(page.getByTestId('token-set')).toBeVisible()
  await expect(page.getByTestId('token-log')).toContainText('saved')

  // The token gone from the app's database with no removal, the way it went on the phone.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('life-mirror')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite')
      const store = tx.objectStore('settings')
      const read = store.get(1)
      read.onsuccess = () => {
        const settings = read.result as { cloud: { token: string | null; tokenSavedAt: string | null } }
        settings.cloud.token = null
        settings.cloud.tokenSavedAt = null
        store.put(settings)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })

  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Cloud copy/ }).click()
  await expect(page.getByTestId('token-set')).toBeVisible()
  await expect(page.getByTestId('token-notice')).toContainText('written again')
  expect(await page.getByTestId('token-notice').textContent()).not.toContain(token)
  expect(await page.getByTestId('token-log').textContent()).not.toContain(token)
})

test('the exception chips sit on a morning summary too, and change today alone', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 9, 5))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await expect(page.getByTestId('give-back')).toBeVisible()
  // The morning's yes/no caffeine chip is gone; the Caffeine item stands in its place (Part 21).
  await expect(page.getByTestId('chip-heavyCaffeine')).toHaveCount(0)
  await expect(page.getByTestId('caffeine')).toBeVisible()
  await expect(page.getByTestId('chip-away')).toBeVisible()
  await expect(page.getByTestId('chip-office')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('chip-office').click()
  await expect(page.getByTestId('chip-office')).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await page.getByTestId('block-row').first().click()
  await expect(page.getByTestId('chip-office')).toHaveAttribute('aria-pressed', 'true')
})

/** Reads one check-in's extras straight from the phone's store. */
async function extrasOf(page: Page, day: string, block: string): Promise<Record<string, unknown> | null> {
  return page.evaluate(
    async ([d, b]) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const rows = await new Promise<Array<{ day: string; block: string; extras?: Record<string, unknown> }>>((res, rej) => {
        const q = dbx.transaction(['checkins'], 'readonly').objectStore('checkins').getAll()
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      dbx.close()
      return rows.find((r) => r.day === d && r.block === b)?.extras ?? null
    },
    [day, block],
  )
}

test('caffeine is one optional item: a band per window, tapped again to clear, no None to tap', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 9, 5))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await expect(page.getByTestId('give-back')).toBeVisible()

  // On the morning summary: four bands, the helper text, and nothing to tap for none.
  const card = page.getByTestId('caffeine')
  await expect(page.getByRole('heading', { name: 'Caffeine so far today' })).toBeVisible()
  await expect(card.getByRole('button')).toHaveText(['Under 100 mg', '100–199 mg', '200–299 mg', '300+ mg'])
  await expect(page.getByTestId('caffeine-help')).toContainText('Only if you had some; with none, leave it.')
  await expect(page.getByTestId('chip-heavyCaffeine')).toHaveCount(0)
  // Seen and left alone: shown is written once it is on screen, no band, and never a zero.
  await card.scrollIntoViewIfNeeded()
  await expect.poll(async () => (await extrasOf(page, '2026-09-07', 'morning'))?.caffeineShown ?? null).toBe(true)
  expect((await extrasOf(page, '2026-09-07', 'morning'))?.caffeineIntake).toBeUndefined()

  // One tap sets a band; the band survives a relaunch; the same tap again clears it.
  await page.getByTestId('caffeine-2').click()
  await expect(page.getByTestId('caffeine-2')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('caffeine-3')).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => (await extrasOf(page, '2026-09-07', 'morning'))?.caffeineIntake ?? null).toMatchObject({ band: 2, since: null })
  await page.reload()
  await page.getByTestId('block-row').first().click()
  await expect(page.getByTestId('caffeine-2')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('caffeine-2').click()
  await expect(page.getByTestId('caffeine-2')).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => (await extrasOf(page, '2026-09-07', 'morning'))?.caffeineIntake ?? null).toBeNull()

  // In the evening it sits among the extras, for the window since the last check-in.
  await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
  await page.reload()
  await page.getByRole('button', { name: /Check in/ }).click()
  const extras = page.getByTestId('extras')
  const anchor = page.getByTestId('anchor').nth(2)
  const ask = page.getByTestId('outcome-ask')
  for (let i = 0; i < 14; i++) {
    await expect(extras.or(anchor).or(ask).first()).toBeVisible()
    if (await extras.isVisible()) break
    if (await ask.isVisible()) {
      await page.getByRole('button', { name: 'Not now', exact: true }).click()
      await expect(ask).toBeHidden()
      continue
    }
    await tapAnchor(page)
  }
  await expect(extras).toBeVisible()
  await expect(extras.getByRole('heading', { name: 'Caffeine since your last check-in' })).toBeVisible()
  await expect(page.getByText('Caffeine after midday')).toHaveCount(0)
  await page.getByTestId('caffeine-1').click()
  await expect(page.getByTestId('caffeine-1')).toHaveAttribute('aria-pressed', 'true')
  const evening = await extrasOf(page, '2026-09-07', 'evening')
  expect(evening?.caffeineIntake).toMatchObject({ band: 1 })
  expect((evening?.caffeineIntake as { since: string | null }).since).not.toBeNull()
})

test('caffeine on board sits beside the reading without moving it, and Evidence says what the record holds', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 9, 5))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await expect(page.getByTestId('give-back')).toBeVisible()
  const reading = page.getByTestId('reading-100').first()
  const number = await reading.locator('.hero-num').textContent()
  await expect(page.getByTestId('caffeine-on-board')).toHaveCount(0)
  await page.getByTestId('caffeine-3').click()
  await expect(reading.getByTestId('caffeine-on-board')).toHaveText(' · caffeine on board')
  await expect(reading.locator('.hero-num')).toHaveText(number ?? '')

  // Now carries the same marker beside the same number.
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.getByTestId('reading-100').getByTestId('caffeine-on-board')).toBeVisible()
  await expect(page.getByTestId('reading-100').locator('.hero-num')).toHaveText(number ?? '')

  // Evidence: the habit in counts, and each comparison waiting for groups of five.
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  const card = page.getByTestId('caffeine-evidence')
  await expect(card).toBeVisible()
  await expect(page.getByTestId('caffeine-habit')).toHaveText('Reported on 1 of the last 28 days. Usual morning band: 200–299 mg. Shown and left untapped: 0 windows, which is none reported, never a confirmed none.')
  await expect(page.getByTestId('caffeine-bands')).toContainText('Nothing reported yet.')
  await expect(card).toContainText('capped at Promising')
  await expect(card).not.toContainText(/caffeine-free|because of|\bcaus/i)
})

test('the line does what it says in one tap, shows why it said it, and the week is reviewed under the week ahead', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 14, 0))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-name-input').fill('French')
  await page.getByTestId('aim-ladder-language').click()
  await page.getByTestId('aim-name-add').click()
  await page.getByRole('button', { name: /^The proof ladder/ }).click()
  await page.getByTestId('skill-input').fill('Ten words')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  // A commitment with a step and no moment for it: the line says so, and offers the moment itself.
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.getByTestId('brief-line')).toContainText('French: the step is Ten words · hear or read it.')
  await expect(page.getByTestId('brief-action')).toHaveText('Plan it: after her bedtime, 20:00')
  // Why it said this: the fact as the record words it, and the card with its grade and its source.
  await page.getByTestId('brief-why').click()
  await expect(page.getByTestId('brief-why-panel')).toContainText('French (study): the step is “Ten words · hear or read it”')
  await expect(page.getByTestId('brief-why-panel')).toContainText('Gollwitzer')
  await page.getByTestId('brief-why').click()
  await expect(page.getByTestId('brief-why-panel')).toHaveCount(0)
  // One tap: the plan is made, the row on Now carries it, and the line stays with what was done under it.
  await page.getByTestId('brief-action').click()
  await expect(page.getByTestId('brief-acted')).toHaveText('Planned for today.')
  await expect(page.getByTestId('brief-action')).toHaveCount(0)
  await expect(page.getByTestId('aim-plan')).toContainText('After her bedtime, 20:00')
  await page.reload()
  await expect(page.getByTestId('brief-line')).toContainText('French: the step is Ten words')
  await expect(page.getByTestId('brief-acted')).toHaveText('Planned for today.')
  // The week reviewed sits under the week ahead, from the record alone until the Worker writes one.
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await expect(page.getByTestId('week-review')).toBeVisible()
  const order = await page.getByTestId('weekly').locator('h2.section').allInnerTexts()
  expect(order.slice(0, 2).map((t) => t.toLowerCase())).toEqual(['the week ahead, as you usually are', 'the week, reviewed'])
  await expect(page.getByTestId('week-review-held')).toHaveText('No commitment had a step started in the last seven days.')
  await expect(page.getByTestId('week-review-did-not')).toHaveText('French: added today, no step started yet.')
  await expect(page.getByTestId('week-review-change')).not.toBeEmpty()
})

test('study named by you: a language and an instrument sit beside each other, each with its own proofs and its own row on Now', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 7, 14, 0))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-name-input').fill('French')
  await page.getByTestId('aim-ladder-language').click()
  await page.getByTestId('aim-name-add').click()
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-certification').click()
  await page.getByTestId('aim-name-input').fill('Piano')
  await page.getByTestId('aim-ladder-craft').click()
  await page.getByTestId('aim-name-add').click()
  await expect(page.getByTestId('aim-card')).toHaveCount(2)
  // The brief's line speaks to the record as it stands: two commitments and no skill yet.
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.getByTestId('brief-line')).toContainText('French has no skill on its ladder yet')
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  // The ladder: a skill under each subject, each climbing its own proofs.
  await page.getByRole('button', { name: /^The proof ladder/ }).click()
  await expect(page.getByTestId('subject-chip')).toHaveCount(2)
  await page.getByTestId('skill-input').fill('Ten words')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByTestId('subject-chip').last().click()
  await page.getByTestId('skill-input').fill('Scale of C')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByTestId('skill-subject')).toHaveCount(2)
  await page.getByTestId('rung-up').first().click()
  await expect(page.getByTestId('skill-row').first()).toContainText('Heard or read')
  await page.getByTestId('rung-up').last().click()
  await expect(page.getByTestId('skill-row').last()).toContainText('Watched or listened')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  // Each subject's step, side by side; on Now, one row each, no card taller than a line or two.
  await expect(page.getByTestId('aim-step').first()).toContainText('Ten words · say it')
  await expect(page.getByTestId('aim-step').last()).toContainText('Scale of C · try it slowly')
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.getByTestId('aim-card')).toHaveCount(2)
  // The morning's line is withdrawn once its facts no longer hold: both ladders moved today, and nothing else is true yet.
  await expect(page.getByTestId('brief')).toBeVisible()
  await expect(page.getByTestId('brief-line')).toHaveCount(0)
  // One tap says when: a cue for the first step, then Resume; the plan is kept and counted.
  await page.getByTestId('aim-plan-open').first().click()
  await page.getByTestId('aim-cue-afterBedtime').first().click()
  await expect(page.getByTestId('aim-plan').first()).toContainText('After her bedtime, 20:00')
  await page.getByTestId('aim-resume').first().click()
  await expect(page.getByTestId('aim-started')).toHaveCount(1)
  await expect(page.getByTestId('aim-resume')).toHaveCount(1)
  // Done on the step, once its ten minutes have passed, moves the skill up and says so on the same row.
  await page.clock.setFixedTime(new Date(2026, 8, 7, 14, 12))
  await page.reload()
  await page.getByTestId('aim-done').click()
  await expect(page.getByTestId('aim-moved')).toContainText('Ten words advanced to Said.')
  await expect(page.getByTestId('aim-step').first()).toContainText('Ten words · use it with notes')
  await expect(page.getByTestId('aim-last').first()).toContainText('moved today')
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await expect(page.getByTestId('aim-cue-count').first()).toContainText('After her bedtime · started 1 of 1 planned')
})

test('the Social path: added under Aims, one People row on Now with its stage in words, Done counted; at home in the evening no in-person rep is the day’s, and Change still reaches one', async ({ page }) => {
  // A Monday morning marked at the office on its summary: people are around by today's shape (Part 20's tier 1).
  await page.clock.setFixedTime(new Date(2026, 8, 7, 9, 5))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await page.getByTestId('chip-office').click()
  await expect(page.getByTestId('chip-office')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Aims: A person is no longer offered; the Social path is added in one tap.
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await expect(page.getByTestId('aim-kind-person')).toHaveCount(0)
  await page.getByTestId('aim-kind-path-social').click()
  await expect(page.locator('[data-kind="path"]')).toHaveCount(1)
  await expect(page.locator('[data-kind="path"]').getByTestId('path-stage')).toContainText('Stage 1 of 6 · Presence')

  // Now: one People row with its stage in words, and an in-person rep of the stage while people are around.
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  const row = page.locator('[data-kind="path"]')
  await expect(row).toHaveCount(1)
  await expect(row.getByTestId('path-stage')).toContainText('The Social path · Stage 1 of 6 · Presence')
  const ids: Record<string, string> = { 'Eye contact with a stranger': 'eye-contact-stranger', 'Three things about the other person': 'attention-outward', 'Greet someone by name': 'greet-by-name' }
  const rep = ((await row.getByTestId('aim-step').textContent()) ?? '').trim()
  expect(Object.keys(ids)).toContain(rep)

  // Resume, then Done once its minute has passed; the card counts it.
  await row.getByTestId('aim-resume').click()
  await expect(row.getByTestId('aim-started')).toBeVisible()
  await page.clock.setFixedTime(new Date(2026, 8, 7, 9, 20))
  await page.reload()
  await page.locator('[data-kind="path"]').getByTestId('aim-done').click()
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await expect(page.getByTestId('path-rep-count')).toHaveText(`${rep} · done 1 · partly 0 · no 0`)
  // Part 25: the card says in one line which rule chose today's rep, under How this path works.
  await page.getByTestId('path-how').click()
  await expect(page.getByTestId('path-why')).toContainText('Why this rep')
  // Evidence counts the rep; a difference waits for five a side.
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByTestId('path-rep-evidence').first()).toContainText(`${rep} · drawn 1 · done 1 · partly 0 · no 0`)
  await expect(page.getByTestId('path-rep-compare')).toHaveCount(0)
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // The evening at home: nobody around by today's shape, so no in-person rep is the day's rep.
  await page.clock.setFixedTime(new Date(2026, 8, 7, 19, 5))
  await page.reload()
  const evening = page.locator('[data-kind="path"]')
  await expect(evening.getByTestId('path-none')).toHaveText('No people rep fits tonight.')
  await expect(evening.getByTestId('aim-resume')).toHaveCount(0)
  // Change still lists every rep of the stage, and one you pick is today's, whatever the shape says.
  await evening.getByTestId('path-change').click()
  await expect(page.getByTestId('path-change-screen')).toContainText('Nobody around by today’s shape')
  const other = Object.entries(ids).find(([name]) => name !== rep)?.[1] as string
  await page.getByTestId(`path-choice-${other}`).click()
  const picked = page.locator('[data-kind="path"]')
  await expect(picked.getByTestId('aim-step')).toHaveText(Object.entries(ids).find(([, id]) => id === other)?.[0] as string)
  await expect(picked).toContainText('Your pick')
  await expect(picked.getByTestId('aim-resume')).toBeVisible()
})

test('the coach: a pick stubbed for today shows its version under the rep and says why; one for another day is ignored', async ({ page }) => {
  // A Monday morning marked at the office: the Social path's stage-1 reps all fit (Part 20's tier 1).
  await page.clock.setFixedTime(new Date(2026, 8, 7, 9, 5))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await page.getByTestId('chip-office').click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-path-social').click()
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  const row = page.locator('[data-kind="path"]')
  const ids: Record<string, string> = { 'Eye contact with a stranger': 'eye-contact-stranger', 'Three things about the other person': 'attention-outward', 'Greet someone by name': 'greet-by-name' }
  const shown = ids[((await row.getByTestId('aim-step').textContent()) ?? '').trim()]
  const other = Object.values(ids).find((id) => id !== shown) as string
  // Each rep the coach names carries its own line of today's version.
  const lineFor = (id: string) => `Today at the office: ${id.replace(/-/g, ' ')}, with your attention out there.`
  const pick = (day: string, named: string[]) => ({ id: `${day}:coach`, day, block: 'morning', path: 'social', ids: named, versions: Object.fromEntries(named.map((id) => [id, lineFor(id)])), model: 'claude-opus-5-5', at: `${day}T13:00:00.000Z` })

  // Yesterday's pick is stale: the app's own pick stands, with no version.
  await putInto(page, 'coachPicks', pick('2026-09-06', [other]))
  await page.reload()
  await expect(row.getByTestId('aim-step')).toBeVisible()
  await expect(row.getByTestId('path-coach-version')).toHaveCount(0)

  // Today's names two reps the row may offer: one of them is drawn, with its own line under it.
  await putInto(page, 'coachPicks', pick('2026-09-07', [shown, other]))
  await page.reload()
  const drawn = ids[((await row.getByTestId('aim-step').textContent()) ?? '').trim()]
  expect([shown, other]).toContain(drawn)
  await expect(row.getByTestId('path-coach-version')).toHaveText(lineFor(drawn))
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.locator('[data-path="social"]').getByTestId('path-how').click()
  await expect(page.locator('[data-path="social"]')).toContainText('The coach named two of the reps that fit now; drawn between them, even chances, kept with the step.')
})

test('the Partner path: added by its own tap beside the Social path, one People row on Now, a shared rep counted for both, a date day, and the monthly check’s help only on a yes', async ({ page }) => {
  // A Wednesday morning marked at the office: people are around by today's shape.
  await page.clock.setFixedTime(new Date(2026, 8, 23, 9, 5))
  await page.goto('./')
  await page.getByRole('button', { name: /Check in/ }).click()
  await tapThrough(page)
  await page.getByTestId('chip-office').click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Aims: each path added by its own tap, two separate commitments; only one card holds today's rep.
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-path-social').click()
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-path-partner').click()
  await expect(page.locator('[data-kind="path"]')).toHaveCount(2)
  const partnerCard = page.locator('[data-path="partner"]')
  await expect(partnerCard.getByTestId('path-stage')).toContainText('Stage 1 of 7 · Meeting')
  await expect(page.getByTestId('aim-resume')).toHaveCount(1)
  await expect(page.getByTestId('path-elsewhere')).toHaveCount(1)
  await partnerCard.getByTestId('path-settings').click()
  await expect(partnerCard.getByTestId('partner-online')).toHaveAttribute('aria-pressed', 'false')

  // Now: exactly one People row; a Partner-only rep holds it on a day the bound allows.
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  const row = page.locator('[data-kind="path"]')
  await expect(row).toHaveCount(1)
  await expect(row.getByTestId('path-stage')).toContainText('The Partner path · Stage 1 of 7 · Meeting')
  expect(['Say hello again to someone you liked talking to', 'Ask a friend for an introduction']).toContain(((await row.getByTestId('aim-step').textContent()) ?? '').trim())

  // Change switches path: a rep both paths hold, picked through Social, is the row's and counts for both.
  await row.getByTestId('path-change').click()
  await page.getByTestId('path-switch-social').click()
  await page.getByTestId('path-choice-greet-by-name').click()
  await expect(row).toHaveCount(1)
  await expect(row.getByTestId('aim-step')).toHaveText('Greet someone by name')
  await expect(row.getByTestId('path-both')).toContainText('Counts for both paths')
  await row.getByTestId('aim-resume').click()
  await expect(row.getByTestId('aim-started')).toBeVisible()
  await page.clock.setFixedTime(new Date(2026, 8, 23, 9, 20))
  await page.reload()
  await page.locator('[data-kind="path"]').getByTestId('aim-done').click()
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  for (const p of ['social', 'partner']) await expect(page.locator(`[data-path="${p}"]`).getByTestId('path-rep-count')).toHaveText('Greet someone by name · done 1 · partly 0 · no 0')

  // A date declared with its day: today moves the path to Dating, and a rep about your conduct on a date is the row's today.
  await partnerCard.getByTestId('path-dates').click()
  await partnerCard.getByTestId('partner-date-2026-09-23').click()
  await expect(partnerCard.getByTestId('partner-date-2026-09-23')).toHaveAttribute('aria-pressed', 'true')
  await expect(partnerCard.getByTestId('path-stage')).toContainText('Stage 4 of 7 · Dating')
  // From Dating on the month's reflection and check are yours, and a note before each step: the card says the month's are open.
  await expect(partnerCard.getByTestId('partner-check-open')).toBeVisible()
  await expect(partnerCard.getByTestId('partner-reflection-open')).toBeVisible()
  await partnerCard.getByTestId('path-settings').click()
  await partnerCard.getByRole('button', { name: /^Notes and checks/ }).click()
  await expect(page.getByTestId('monthly-check')).toBeVisible()
  await expect(page.getByTestId('partner-reflection-monthly')).toBeVisible()
  await expect(page.getByTestId('partner-decide')).toBeVisible()
  await expect(page.getByTestId('partner-values')).toHaveCount(1)
  await expect(page.getByTestId('partner-later')).toHaveCount(0)
  // The monthly reflection, one part written: the card's line for it goes.
  await page.getByTestId('partner-monthly-understood-input').fill('They asked about my week and listened.')
  await page.getByTestId('partner-monthly-understood-input-save').click()
  await expect(page.getByTestId('partner-monthly-understood')).toContainText('Saved')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(partnerCard.getByTestId('partner-reflection-open')).toHaveCount(0)
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.locator('[data-kind="path"]')).toHaveCount(1)
  await expect(page.locator('[data-kind="path"]').getByTestId('path-stage')).toContainText('The Partner path · Stage 4 of 7 · Dating')
  expect(['On time, phone away', 'Ask, then follow what they say', 'Share something real in turn', 'End the date clearly and kindly', 'Talk about a good ordinary week', 'Talk about what you are each working toward', 'Talk about the people in your lives', 'Thank them for one specific thing', 'Reappraise a disagreement']).toContain(((await page.locator('[data-kind="path"]').getByTestId('aim-step').textContent()) ?? '').trim())
  // A rep with a guardrail says it on the row: their answer is final.
  await page.locator('[data-kind="path"]').getByTestId('path-change').click()
  await page.getByTestId('path-choice-date-end-clearly').click()
  await expect(page.locator('[data-kind="path"]').getByTestId('path-guardrail')).toHaveText('Their answer is final. A second ask after a no is never offered.')

  // The next stage declared in one tap, with nothing asked first; this month's check stays open.
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await partnerCard.getByTestId('path-dates').click()
  await partnerCard.getByTestId('partner-declare').click()
  await expect(partnerCard.getByTestId('path-stage')).toContainText('Stage 5 of 7 · Deciding')
  await expect(partnerCard.getByTestId('partner-declared')).toContainText('Undo')
  await expect(partnerCard.getByTestId('partner-check-open')).toBeVisible()

  // Notes and checks: an engagement is one tap and needs no course; the course is a suggestion beside its note.
  await partnerCard.getByTestId('path-settings').click()
  await partnerCard.getByRole('button', { name: /^Notes and checks/ }).click()
  await expect(page.getByTestId('partner-notes')).toBeVisible()
  await page.getByTestId('partner-step-engagement').click()
  await expect(page.getByTestId('partner-milestone')).toContainText('We got engaged')
  await page.getByTestId('partner-reflection-input').fill('A good walk by the river.')
  await page.getByTestId('partner-reflection-keep').click()
  await expect(page.getByTestId('partner-reflection')).toContainText('A good walk by the river.')
  // Your values in three parts, and a step's note written with your own record in front of you.
  await page.getByTestId('partner-values-nonNegotiables-input').fill('Honesty, and kindness when it is hard.')
  await page.getByTestId('partner-values-nonNegotiables-input-save').click()
  await page.getByTestId('partner-decide-step-engagement').click()
  await expect(page.getByTestId('partner-course')).toContainText('never needed to move on')
  await page.getByTestId('partner-decide-back').click()
  await page.getByTestId('partner-decide-step-child').click()
  const record = page.getByTestId('partner-record')
  await expect(record).toContainText('Honesty, and kindness when it is hard.')
  await expect(record).toContainText('They asked about my week and listened.')
  await expect(record).toContainText('A good walk by the river.')
  await expect(page.getByTestId('partner-considerations')).toContainText('never schedules an introduction and never recommends one')
  await expect(page.getByTestId('partner-considerations')).toContainText('Expert opinion')
  await page.getByTestId('partner-decide-child-input').fill('Not until it has been steady for a while.')
  await page.getByTestId('partner-decide-child-input-save').click()
  await page.getByTestId('partner-decide-back').click()
  await expect(page.getByTestId('partner-decide-step-child')).toContainText('Written')

  // The monthly check: a doubt alone shows nothing; a yes to safety or conduct shows the fixed help, inside the check.
  await expect(page.getByTestId('check-help')).toHaveCount(0)
  await page.getByTestId('check-doubt-yes').click()
  await expect(page.getByTestId('check-doubt-yes')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('check-help')).toHaveCount(0)
  await page.getByTestId('check-safety-yes').click()
  await expect(page.getByTestId('monthly-check').getByTestId('check-help')).toContainText('1-800-799-7233')
  await page.getByTestId('check-safety-yes').click()
  await expect(page.getByTestId('check-help')).toHaveCount(0)
  await page.getByTestId('check-conduct-yes').click()
  await expect(page.getByTestId('check-help')).toHaveCount(1)
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  // Answered this month, so the card's prompt is gone; the help appears on no other screen.
  await expect(partnerCard.getByTestId('partner-check-open')).toHaveCount(0)
  await expect(page.getByTestId('check-help')).toHaveCount(0)
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.getByTestId('check-help')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('1-800-799-7233')

  // Undo: the date deleted, the stage recomputed from what is left.
  await page.getByRole('button', { name: 'Aims', exact: true }).click()
  await partnerCard.getByTestId('path-dates').click()
  await partnerCard.getByTestId('partner-declared-undo').click()
  await partnerCard.getByTestId('partner-date-2026-09-23').click()
  await expect(partnerCard.getByTestId('path-stage')).toContainText('Stage 1 of 7 · Meeting')
})

test('the use log counts on this phone alone, and what Claude lacked is counted under Brain (Part 34)', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 24, 9, 30))
  await page.goto('./')
  // A few screens, and a check-in opened and left before its end.
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await page.getByRole('button', { name: /Check in/ }).first().click()
  await page.getByTestId('anchor').nth(2).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await settingsSection(page, 'data')
  const card = page.getByTestId('use-log')
  await expect(card).toContainText('never synced, never sent')
  await expect(card.getByTestId('use-checkins')).toHaveText('Check-ins: 1 opened, 1 left before the end')
  // Now three times: on opening, by its tab, and on leaving the check-in.
  await expect(card.getByTestId('use-screens')).toContainText('Now 3')
  await card.getByTestId('use-screens').click()
  await expect(card.getByTestId('use-screen-list')).toContainText('Mirror 1')
  await expect(card.getByTestId('use-screen-list')).toContainText('Data and privacy 1')
  await expect(card.getByTestId('use-screen-list')).toContainText('Settings 1')
  await page.getByRole('button', { name: 'Done', exact: true }).last().click()
  // Claude has named nothing yet; a line that named two things is counted, never shown.
  await page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => {
          const tx = r.result.transaction('brainBriefs', 'readwrite')
          tx.objectStore('brainBriefs').put({ id: '2026-09-24:brief', day: '2026-09-24', kind: 'brief', text: 'A line Claude wrote for this test.', mode: 'observation', factIds: ['record'], cardIds: [], model: 'claude-opus-5-5', at: '2026-09-24T13:00:00.000Z', factsDay: '2026-09-24', writer: 'claude', askedModel: 'opus', lacked: ['workoutDetail', 'notes'] })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(tx.error)
        }
      }),
  )
  await page.getByTestId('settings-brain').click()
  await expect(page.getByTestId('brain-lacked-counts')).toHaveText('Your notes 1 · Workout detail 1')
})
