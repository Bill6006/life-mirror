import { expect, test, type Page } from '@playwright/test'

// The learning repair in the browser. Built in its preview (only an automated browser holding the test key at 1 opened it);
// open for everyone since stage R6, so the key at 1 changes nothing, and only an automated browser holding it at 0 sees it
// closed, as today's engine, its fallback, runs. Stage R2: its engine, rebuilt from the record, draws a check-in's move
// and keeps every chance with its version. Stage R3: the learning week's invitation on Now, and Yes starting a week.

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lm.inStep', '1')
    } catch {
      // A page without local storage stays closed.
    }
  })
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

/** The walk's three tests: whichever the queue runs fitted each seeded check-in. */
const FITS = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock']

/**
 * Days of a record written straight into the phone's store: each check-in complete, each with a draw between the walk and
 * nothing extra at even chances, seen, answered and closed, the walk's tests fitting it. With `effect`, each draw is a fair
 * coin fixed by its slot, and stress reads lowest at the check-in after a walk and highest after nothing extra.
 */
async function seedRepairRecord(page: Page, days: number, effect = false): Promise<void> {
  await page.evaluate(
    async ({ n, fits, effect }) => {
      // The slot's number mixed (mulberry32's step): a fair coin with no pattern running through it.
      const coin = (slot: number) => {
        let a = (slot * 7919 + 13) | 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296 < 0.5
      }
      let last: string | null = null
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
      const tx = dbx.transaction(['checkins', 'offers', 'outcomes'], 'readwrite')
      const now = new Date()
      let k = 0
      for (let d = n; d >= 1; d--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        for (const block of Object.keys(blocks)) {
          k++
          const answers: Record<string, number> = {}
          blocks[block].forEach((id, ri) => {
            answers[id] = 1 + ((k + ri) % 5)
          })
          if (effect && last !== null) answers.stress = last === 'walk-ten' ? 1 : 5
          const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40)
          const done = new Date(at.getTime() + 95_000).toISOString()
          tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
          const moveId = effect ? (coin(k - 1) ? 'walk-ten' : 'nothing') : k % 2 ? 'walk-ten' : 'nothing'
          last = moveId
          const offerId = await new Promise<number>((res) => {
            const q = tx.objectStore('offers').add({ kind: 'block', day, block, at: done, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: done, seenAt: done, fits })
            q.onsuccess = () => res(q.result as number)
          })
          tx.objectStore('outcomes').add({ offerId, moveId, day, block, at: done, outcome: 'done', why: null, passiveOutcome: null, seen: true })
        }
      }
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { n: days, fits: FITS, effect },
  )
}

/** Today's offers as the phone holds them. */
async function offersOf(page: Page, day: string): Promise<{ id: number; kind: string; moveId: string; candidates: string[]; propensities: Record<string, number>; draw?: { engine: string } }[]> {
  return page.evaluate(async (d) => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rows = await new Promise<{ day: string }[]>((res) => {
      const q = dbx.transaction(['offers'], 'readonly').objectStore('offers').getAll()
      q.onsuccess = () => res(q.result)
    })
    dbx.close()
    return rows.filter((o) => o.day === d) as never
  }, day)
}

/**
 * A fixed afternoon for every test that starts here, so the block and the stand-in days are the same whatever hour the
 * runner keeps (2026-10-19: a run between midnight and four in the morning, UTC, found the app's day still the day before,
 * its evening already seeded, and no check-in to open).
 */
const WHEN = new Date(2026, 8, 24, 13, 30)

const todayKey = () => `${WHEN.getFullYear()}-${String(WHEN.getMonth() + 1).padStart(2, '0')}-${String(WHEN.getDate()).padStart(2, '0')}`

async function start(page: Page): Promise<void> {
  await page.clock.setFixedTime(WHEN)
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
}

test('the repair draws a check-in’s move from the record, keeping every chance and its version', async ({ page }) => {
  await start(page)
  await seedRepairRecord(page, 10)
  await page.reload()
  await page.getByRole('button', { name: /Check in/ }).click()
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId('give-back').isVisible()) break
    if (await page.getByTestId('extras').isVisible()) break
    if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(1).click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
  await page.getByRole('button', { name: 'Done', exact: true }).first().click()
  await expect.poll(async () => (await offersOf(page, todayKey())).length).toBeGreaterThan(0)
  const [offer] = await offersOf(page, todayKey())
  expect(offer.draw?.engine).toBe('repair-1')
  expect(offer.candidates).toContain('nothing')
  expect(offer.candidates).toContain(offer.moveId)
  expect(Object.values(offer.propensities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
})

test('a skip’s replacement is drawn by the new engine, among real moves alone, the skipped one left out (2026-10-20)', async ({ page }) => {
  await start(page)
  await seedRepairRecord(page, 10)
  await page.reload()
  await page.getByRole('button', { name: /Check in/ }).click()
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId('give-back').isVisible()) break
    if (await page.getByTestId('extras').isVisible()) break
    if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(1).click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
  await page.getByRole('button', { name: 'Done', exact: true }).first().click()
  const blocks = async () => (await offersOf(page, todayKey())).filter((o) => o.kind === 'block')
  await expect.poll(async () => (await blocks()).length).toBe(1)
  const [first] = await blocks()
  // Skipped on Now, Skip's promise is kept by the new engine, among real moves alone, the skipped one left out.
  await page.getByTestId('move-skip').first().click()
  await expect.poll(async () => (await blocks()).length).toBe(2)
  const next = (await blocks()).find((o) => o.id !== first.id)
  expect(next?.draw?.engine).toBe('repair-1')
  expect(next?.candidates).not.toContain('nothing')
  expect(next?.candidates).not.toContain(first.moveId)
  expect(Object.values(next?.propensities ?? {}).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
})

test('the pickup-time move is drawn by the new engine, never nothing extra (2026-10-20)', async ({ page }) => {
  // On a day with no move offered before it, so the day's rule leaves its candidates whole.
  await start(page)
  await seedRepairRecord(page, 10)
  // The week given a pickup at five, today's shape made again from it, the clock inside the ninety minutes.
  await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = dbx.transaction(['settings', 'days'], 'readwrite')
    const s = await new Promise<Record<string, unknown>>((res) => {
      const q = tx.objectStore('settings').get(1)
      q.onsuccess = () => res(q.result as Record<string, unknown>)
    })
    tx.objectStore('settings').put({ ...s, week: { ...(s.week as object), pickupTime: '17:00' } })
    tx.objectStore('days').delete('2026-09-24')
    await new Promise((res) => (tx.oncomplete = res))
    dbx.close()
  })
  await page.clock.setFixedTime(new Date(2026, 8, 24, 16, 0))
  await page.reload()
  const pickups = async () => (await offersOf(page, todayKey())).filter((o) => o.kind === 'pickup')
  await expect.poll(async () => (await pickups()).length).toBe(1)
  const [pickup] = await pickups()
  expect(pickup.draw?.engine).toBe('repair-1')
  expect(pickup.candidates).not.toContain('nothing')
  expect(pickup.candidates).toContain(pickup.moveId)
})

test('a learning week is offered on Now once a running test has fitted three recent days, and Yes starts it', async ({ page }) => {
  await start(page)
  await seedRepairRecord(page, 10)
  await page.reload()
  const invite = page.getByTestId('week-invite')
  await expect(invite).toBeVisible()
  await expect(invite).toContainText('A learning week?')
  await page.getByTestId('week-yes').click()
  await expect(invite).toBeHidden()
  await expect(page.getByTestId('week-running')).toContainText('Learning week · day 1 of 7')
})

test('the old closed mode’s key closes nothing: the same record still offers its week (2026-10-20)', async ({ page }) => {
  // The key that once closed the learning engine, set as an automated test browser could set it: the engine is the only one.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('life-mirror.preview.learningRepair', '0')
    } catch {
      // A page without local storage has no key to set.
    }
  })
  await start(page)
  await seedRepairRecord(page, 10)
  await page.reload()
  await expect(page.getByTestId('week-invite')).toBeVisible()
  await expect(page.getByTestId('engine-failed-now')).toHaveCount(0)
})

/** The rung words a test can show, and the old tiers it must never show while the repair is on. */
const RUNG = /^(No call yet|(Early sign|Likely|Established): (helps|little difference|hurts))( · revised)?$/
const TIERS = ['Little evidence', 'Unclear', 'Promising', 'Holds up', 'Unhelpful here']

test('Evidence shows the repair’s tests by rung, its track record at their head, in place of the cards (stage R4)', async ({ page }) => {
  await start(page)
  await seedRepairRecord(page, 14, true)
  await page.reload()
  await page.locator('nav.tabs').getByRole('button', { name: 'Moves', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Evidence/ })).toContainText('Every test with its rung, counts and interval')
  await page.getByRole('button', { name: /^Evidence/ }).click()
  // It opens with what helps you (stage R4, part 2): the walk under Stress, research beside it; then the tests nearest
  // finishing, the walk's among them with the day it began.
  await expect(page.locator('h2.section').first()).toHaveText('What helps you')
  const stressHelps = page.getByTestId('helps-reading').filter({ hasText: 'Stress' })
  await expect(stressHelps.getByTestId('helps-move').filter({ hasText: 'A ten-minute walk, now:' })).toContainText(/steps when done, your record pooled with research \(\+0\.40\) · (Early sign|Likely|Established): helps/)
  await expect(page.getByTestId('nearest-test').filter({ hasText: 'A ten-minute walk, now, for Stress over the next block' })).toContainText(/· since \w{3}, \w{3} \d{1,2} ·/)
  await expect(page.getByTestId('track-record')).toBeVisible()
  await expect(page.getByTestId('track-early')).toHaveText(/^(No early sign has resolved yet\.|Of \d+ early signs?, \d+ held\.)/)
  // The walk's test on stress, after fourteen days of a strong effect: a call that helps, run by the queue.
  const walk = page.getByTestId('repair-test').filter({ hasText: 'A ten-minute walk, now' }).filter({ hasText: 'for Stress over the next block' })
  await expect(walk).toHaveCount(1)
  await expect(walk.getByTestId('repair-rung')).toHaveText(/^(Early sign|Likely|Established): helps/)
  await expect(walk).toContainText('being tested now')
  await expect(walk).toContainText(/offered \d+ times and held back \d+, each with the reading after it, over \d+ days/)
  for (const rung of await page.getByTestId('repair-rung').allTextContents()) expect(rung).toMatch(RUNG)
  await expect(page.getByTestId('evidence-card')).toHaveCount(0)
  await expect(page.getByTestId('evidence')).not.toContainText('coin-flip slice')
  // The Legend names the rungs, not the tiers.
  await page.reload()
  await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-legend').click()
  await expect(page.getByText(/always with its rung/)).toBeVisible()
  await expect(page.getByText(/always with its evidence tier/)).toHaveCount(0)
})


test('Now and Evidence describe the learning engine, and no tag lending is shown (R6; the only engine since 2026-10-20)', async ({ page }) => {
  await start(page)
  await seedRepairRecord(page, 14, true)
  await page.reload()
  // Now: how it picks, in the repair's words, with its tests under way.
  const knows = page.getByTestId('knows')
  await knows.getByTestId('knows-more').click()
  await expect(knows).toContainText('Every move that fits keeps a chance of being drawn, and so does nothing extra, so each offer is a fair comparison')
  await expect(knows).toContainText(/(\d+ tests|one test) under way/)
  await expect(knows).not.toContainText('one offer in five')
  await page.locator('nav.tabs').getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByTestId('repair-test').first()).toBeVisible()
  // Nothing today says what nothing extra is now; today's tag lending, which the one belief model replaces, is not shown.
  await expect(page.getByTestId('nothing-line')).toHaveText(/^Drawn \d+ times: blocks with no extra move, lived as usual\. Every move’s test compares the blocks where the move was suggested with these, whatever was done in either\.$/)
  await expect(page.getByRole('heading', { name: 'What the tags have learned' })).toHaveCount(0)
  await expect(page.getByTestId('tags-learned')).toHaveCount(0)
  await expect(page.getByTestId('repair-fault')).toHaveCount(0)
})


test('Settings → Data has no Import a hypothesis: the retired engine’s cards are never made (2026-10-20)', async ({ page }) => {
  await start(page)
  await page.locator('nav.tabs').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-data').click()
  await expect(page.getByRole('button', { name: 'Export JSON and CSV' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Import a hypothesis' })).toHaveCount(0)
  await expect(page.getByTestId('hypothesis-input')).toHaveCount(0)
  await expect(page.getByTestId('hypothesis-repair')).toHaveCount(0)
})

test('the engine failing, end to end: no move is offered, Now and Evidence say so, and nothing else draws (2026-10-20)', async ({ page }) => {
  // The test browsers' stand-in for a record no test foresaw: every rebuild throws.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('life-mirror.test.repairFault', '1')
    } catch {
      // A page without local storage cannot stand in the fault.
    }
  })
  await start(page)
  await seedRepairRecord(page, 10)
  await page.reload()
  // Now's first read throws: the engine has failed for the session, and nothing offers a week.
  await expect(page.getByTestId('week-invite')).toHaveCount(0)
  await page.getByRole('button', { name: /Check in/ }).click()
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId('give-back').isVisible()) break
    if (await page.getByTestId('extras').isVisible()) break
    if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(1).click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
  await page.getByRole('button', { name: 'Done', exact: true }).first().click()
  // Back to Now, whichever block the runner's clock is in: an evening's check-in ends on its summary, with a Done of its own.
  await expect
    .poll(async () => {
      if (await page.locator('nav.tabs').isVisible()) return true
      await page.getByRole('button', { name: 'Done', exact: true }).first().click({ timeout: 2000 }).catch(() => {})
      return page.locator('nav.tabs').isVisible()
    })
    .toBe(true)
  // The check-in done, no move was drawn, by this engine or any other, and Now says so where the move would be.
  await expect(page.getByTestId('engine-failed-now')).toHaveText('No move this time: the learning engine could not read your record. Moves are never drawn any other way. It tries again the next time you open the app.')
  expect(await offersOf(page, todayKey())).toEqual([])
  // Evidence, in the same session: the failure said in place of the tests, and nothing of an older engine.
  await page.locator('nav.tabs').getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByTestId('engine-failed')).toHaveText('The learning engine could not read your record just now, so its tests are not shown and no move is offered. Moves are never drawn any other way. It tries again the next time you open the app.')
  await expect(page.getByTestId('repair-test')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Cards', exact: true })).toHaveCount(0)
  // The start and the reload after the stand-in record are two starts of the app, each failing once, on one day.
  await expect(page.getByTestId('repair-fault')).toHaveText(/^The learning engine could not read your record 2 times on \w{3}, \w{3} \d{1,2}\. Each time, no move was offered until the app was opened again\. Moves are never drawn any other way\.$/)

  // Opened again, Now is drawn before the engine's first read fails; it says so the moment it does, without being left.
  await page.reload()
  await expect(page.getByTestId('engine-failed-now')).toBeVisible()
})

test('the breaker: a trip kept on this phone shows one quiet line at the head of Evidence, for four weeks after the last (R6)', async ({ page }) => {
  // Stand-in trips, as the breaker keeps them: a count, the first and last day, the error's name.
  const dayAgo = (n: number) => {
    const at = new Date(WHEN.getFullYear(), WHEN.getMonth(), WHEN.getDate() - n)
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
  }
  const keep = (faults: object) =>
    page.addInitScript((f) => {
      try {
        localStorage.setItem('life-mirror.repair.faults', JSON.stringify(f))
      } catch {
        // A page without local storage keeps no trip.
      }
    }, faults)
  await keep({ count: 2, first: dayAgo(5), last: dayAgo(1), name: 'TypeError' })
  await start(page)
  await page.locator('nav.tabs').getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByTestId('repair-fault')).toHaveText(/^The learning engine could not read your record 2 times since \w{3}, \w{3} \d{1,2}, the last on \w{3}, \w{3} \d{1,2}\. Each time, no move was offered until the app was opened again\. Moves are never drawn any other way\.$/)
  await expect(page.getByTestId('repair-fault')).not.toContainText('TypeError')
  // Four weeks after the last trip, the line is gone; the trips stay kept.
  await keep({ count: 1, first: dayAgo(29), last: dayAgo(29), name: 'TypeError' })
  await page.reload()
  await page.locator('nav.tabs').getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByTestId('evidence')).toBeVisible()
  await expect(page.getByTestId('repair-fault')).toHaveCount(0)
})

test('the move card names the drawn move’s own test by its rung, never a tier (stage R4)', async ({ page }) => {
  // The page's random draws fixed, so the check-in's move is the same every run.
  await page.addInitScript((seed) => {
    let x = seed
    Math.random = () => {
      x = (x * 16807) % 2147483647
      return x / 2147483647
    }
  }, 11)
  // A fixed afternoon, so the record's days, and with them the draw, are the same whatever day the test runs.
  await page.clock.setFixedTime(new Date(2026, 8, 24, 13, 30))
  await start(page)
  await seedRepairRecord(page, 14, true)
  await page.reload()
  await page.getByRole('button', { name: /Check in/ }).click()
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId('give-back').isVisible()) break
    if (await page.getByTestId('extras').isVisible()) break
    if (await page.locator('#ci-title').isVisible()) await page.getByTestId('anchor').nth(1).click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
  await page.getByRole('button', { name: 'Done', exact: true }).first().click()
  await expect.poll(async () => (await offersOf(page, '2026-09-24')).length).toBeGreaterThan(0)
  const [offer] = await offersOf(page, '2026-09-24')
  expect(offer.draw?.engine).toBe('repair-1')
  // The seed above draws a real move; nothing extra has no test of its own and shows no rung.
  expect(offer.moveId).not.toBe('nothing')
  // The evidence sits one tap away, under Why.
  const card = page.getByTestId('move-card').first()
  await card.getByTestId('move-why').click()
  const tier = card.getByTestId('move-tier')
  await expect(tier).toBeVisible()
  const words = ((await tier.textContent()) ?? '').trim()
  expect(words).toMatch(RUNG)
  expect(TIERS).not.toContain(words)
  // Its test is the repair's own: a fair draw each time the move fits, never an old card against one alternative.
  const testing = card.locator('.calc-line.testing')
  await expect(testing).toContainText('a fair draw decides whether it is offered')
  await expect(testing).not.toContainText(/Card \d+/)
})

/**
 * Days whose check-ins all read alike, each with a draw between the walk and nothing extra; on alternate evenings the
 * recovery gap rode alongside and was done, and social energy read high the next morning, low after the others; the gap's
 * own card, as the app writes it when it first rides along.
 */
async function seedGapRecord(page: Page, days: number): Promise<void> {
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
    const tx = dbx.transaction(['checkins', 'offers', 'outcomes', 'cards'], 'readwrite')
    const now = new Date()
    let k = 0
    let gapYesterday = false
    for (let d = n; d >= 1; d--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      for (const block of Object.keys(blocks)) {
        k++
        const answers: Record<string, number> = {}
        for (const id of blocks[block]) answers[id] = 3
        if (block === 'morning') answers.socialEnergy = gapYesterday ? 5 : 1
        const done = new Date(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40).getTime() + 95_000).toISOString()
        tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: done, completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
        const moveId = k % 2 ? 'walk-ten' : 'nothing'
        const gap = block === 'evening' && d % 2 === 0
        const offerId = await new Promise<number>((res) => {
          const q = tx.objectStore('offers').add({ kind: 'block', day, block, at: done, situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: gap ? 'recovery-gap' : null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: done, seenAt: done })
          q.onsuccess = () => res(q.result as number)
        })
        tx.objectStore('outcomes').add({ offerId, moveId, day, block, at: done, outcome: 'done', why: null, passiveOutcome: gap ? 'done' : null, seen: true })
        if (block === 'evening') gapYesterday = gap
      }
    }
    tx.objectStore('cards').add({ createdAt: new Date(now.getTime() - n * 86_400_000).toISOString(), situationKey: 'passive:evening', block: 'evening', target: 'socialEnergy', moveId: 'recovery-gap', alternativeId: 'nothing', window: 'nextMorning', worthwhile: 1, origin: 'passive' })
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    dbx.close()
  }, days)
}

test('a passive item’s association at Promising proposes a one-tap test, and the tap sets it (stage R4b)', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 24, 13, 30))
  await start(page)
  await seedGapRecord(page, 14)
  await page.reload()
  await page.locator('nav.tabs').getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByRole('heading', { name: 'Rode alongside', exact: true })).toBeVisible()
  const gap = page.getByTestId('evidence-card').filter({ hasText: 'Keep the evening after a big social day empty' })
  await expect(gap.getByTestId('tier')).toContainText('Promising')
  const offer = gap.getByTestId('passive-test-offer')
  await expect(offer).toContainText('Test it on Energy over the next morning')
  await offer.getByTestId('passive-test-start').click()
  await expect(gap.getByTestId('passive-test-running')).toContainText('Being tested since Thu, Sep 24')
  await expect(gap.getByTestId('passive-test-offer')).toHaveCount(0)
})
