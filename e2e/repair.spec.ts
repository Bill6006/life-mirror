import { expect, test, type Page } from '@playwright/test'

// The learning repair in the browser, in its preview (only an automated browser holding the preview key opens it; the
// owner's phone sees it closed until stage R6). Stage R2: its engine, rebuilt from the record, draws a check-in's move
// and keeps every chance with its version. Stage R3: the learning week's invitation on Now, and Yes starting a week.

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lm.inStep', '1')
      localStorage.setItem('life-mirror.preview.learningRepair', '1')
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
 * nothing extra at even chances, seen, answered and closed, the walk's tests fitting it.
 */
async function seedRepairRecord(page: Page, days: number): Promise<void> {
  await page.evaluate(
    async ({ n, fits }) => {
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
          const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours[block], 40)
          const done = new Date(at.getTime() + 95_000).toISOString()
          tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: at.toISOString(), completedAt: done, updatedAt: done, answers, activeMs: 60_000 })
          const moveId = k % 2 ? 'walk-ten' : 'nothing'
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
    { n: days, fits: FITS },
  )
}

/** Today's offers as the phone holds them. */
async function offersOf(page: Page, day: string): Promise<{ moveId: string; candidates: string[]; propensities: Record<string, number>; draw?: { engine: string } }[]> {
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

const todayKey = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

async function start(page: Page): Promise<void> {
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

test('closed, the phone shows no week and draws as before', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('life-mirror.preview.learningRepair')
    } catch {
      // nothing to remove
    }
  })
  await start(page)
  await seedRepairRecord(page, 10)
  await page.reload()
  await expect(page.getByRole('button', { name: /Check in/ })).toBeVisible()
  await expect(page.getByTestId('week-invite')).toHaveCount(0)
  await expect(page.getByTestId('week-running')).toHaveCount(0)
})
