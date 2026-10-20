import { expect, test, type Page } from '@playwright/test'

// The honesty checks the record runs on itself (stage R7), in the browser, on stand-in records only: readings that move
// together, put to you once a month with your three answers; where the forecast misses; and whether what goes missing
// follows how you were, said on the weekly view and, when it does, at Evidence's head.

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lm.inStep', '1')
    } catch {
      // A page without local storage keeps ids as they always ran.
    }
  })
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

/** A fixed afternoon, so the stand-in days are the same every run. */
const WHEN = new Date(2026, 8, 24, 13, 30)

async function start(page: Page): Promise<void> {
  await page.clock.setFixedTime(WHEN)
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
}

/**
 * Days of complete check-ins written straight into the phone's store, before the fixed day. `pattern` gives each day's
 * morning and evening: a level from 1 to 5 (each ingredient set by its own direction, so 1 reads low and 5 high), or null
 * for a check-in never started. Mood and Energy are given one position together at every check-in when `twins` is set.
 */
async function seed(page: Page, days: number, pattern: (i: number) => { morning: number | null; evening: number | null }, twins = false, apart = false): Promise<void> {
  const plan = Array.from({ length: days }, (_, i) => pattern(i))
  await page.evaluate(
    async ({ plan, twins, apart }) => {
      // Each reading on its own course: a fixed pseudo-random position per day and reading, so no two move together.
      const own = (i: number, id: string) => {
        let h = 0
        for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
        const x = Math.sin(i * 12.9898 + h * 0.0078233) * 43758.5453
        return 1 + Math.floor((x - Math.floor(x)) * 5)
      }
      const down = new Set(['stress', 'irritation', 'overwhelm', 'loneliness', 'hunger'])
      const blocks: Record<string, string[]> = {
        morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
        evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
      }
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const tx = dbx.transaction(['checkins'], 'readwrite')
      const today = new Date()
      plan.forEach((p, i) => {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (i + 1))
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        for (const block of ['morning', 'evening'] as const) {
          const level = p[block]
          if (level === null) continue
          const answers: Record<string, number> = {}
          for (const id of blocks[block]) answers[id] = apart ? own(i * 2 + (block === 'evening' ? 1 : 0), id) : down.has(id) ? 6 - level : level
          // A second, independent course for every reading but the twins, so only they move together.
          if (twins) for (const id of blocks[block]) if (id !== 'mood' && id !== 'energy') answers[id] = 1 + ((i * 3 + id.length) % 5)
          if (twins) answers.energy = answers.mood
          const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block === 'morning' ? 7 : 19, 40).toISOString()
          tx.objectStore('checkins').add({ day, block, asked: blocks[block], startedAt: at, completedAt: at, updatedAt: at, answers, activeMs: 60_000 })
        }
      })
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { plan, twins, apart },
  )
  await page.reload()
}

async function weekly(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await expect(page.getByTestId('weekly')).toBeVisible()
  await page.getByTestId('weekly-honesty').click()
  await expect(page.getByTestId('honesty')).toBeVisible()
}

test('the weekly view says the three checks among its diagnostics, closed until opened, each saying none on a quiet record', async ({ page }) => {
  await start(page)
  await seed(page, 25, () => ({ morning: 3, evening: 3 }), false, true)
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await expect(page.getByTestId('weekly-honesty')).toHaveAttribute('aria-expanded', 'false')
  await page.getByTestId('weekly-honesty').click()
  await expect(page.getByTestId('honesty-together')).toHaveText('Readings that move together · No two readings moved together almost always over the last thirty days.')
  await expect(page.getByTestId('honesty-misses')).toContainText('Where the forecast misses ·')
  await expect(page.getByTestId('honesty-missing')).toContainText(/^What goes missing · Over the last 56 days, \d+ of \d+ check-ins asked for were never started, and \d+ of \d+ started left a reading unanswered\. Neither follows the reading before, the block or the day\. Missing stays missing\.$/)
  await expect(page.getByTestId('missing-pattern')).toHaveCount(0)
})

test('two readings that moved together almost always are put to you, and your answer is kept for the month, a request listed', async ({ page }) => {
  await start(page)
  await seed(page, 25, (i) => ({ morning: 1 + ((i * 7 + 3) % 5), evening: 1 + ((i * 7 + 1) % 5) }), true)
  await weekly(page)
  await expect(page.getByTestId('honesty-together').filter({ hasText: 'Mood and Energy moved together almost always' })).toBeVisible()
  await expect(page.getByTestId('honesty-together').first()).toContainText('Your answer on each is under Settings → Readings and wording.')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-readings').click()
  const pair = page.getByTestId('together-pair').filter({ hasText: 'Mood and Energy' })
  await expect(pair).toContainText(/Mood and Energy moved together almost always over the last thirty days: rank correlation 1\.00 over \d+ shared check-ins\./)
  await expect(pair.getByTestId('together-keep')).toHaveText('Keep both')
  await expect(pair.getByTestId('together-reword')).toHaveText('Reword one')
  await expect(pair.getByTestId('together-merge')).toHaveText('Merge them')
  await pair.getByTestId('together-reword').click()
  await expect(pair).toHaveCount(0)
  await expect(page.getByTestId('together-request')).toHaveText(/^Mood or Energy: reword one, asked \w{3}, \w{3} \d{1,2}$/)
  // Kept with the settings: still answered, and the request still listed, after a reload.
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-readings').click()
  await expect(page.getByTestId('together-pair').filter({ hasText: 'Mood and Energy' })).toHaveCount(0)
  await expect(page.getByTestId('together-request')).toHaveCount(1)
})

test('when evenings go missing after low mornings, Evidence and the weekly view say so, and which way the record may lean', async ({ page }) => {
  await start(page)
  // Forty days: every morning logged, low on alternate days; the evening after a low morning mostly never started.
  await seed(page, 40, (i) => ({ morning: i % 2 === 0 ? 1 : 5, evening: i % 2 === 0 && i % 10 !== 0 ? null : 3 }))
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByTestId('missing-pattern')).toContainText(/^What goes missing has a pattern: /)
  await expect(page.getByTestId('missing-pattern')).toContainText(/Check-ins never started after a low reading: \d+ of \d+, against \d+ of \d+ otherwise\./)
  await expect(page.getByTestId('missing-pattern')).toContainText('Low moments may be under-recorded, so what the record shows may lean high.')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await weekly(page)
  await expect(page.getByTestId('honesty-missing')).toContainText('Check-ins never started after a low reading')
  await expect(page.getByTestId('honesty-missing')).toContainText('How the estimates treat it is to be revisited.')
})

test('the scorecard gives the learning engine’s tests and calls, the old closed key changing nothing (2026-10-20)', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await page.getByTestId('weekly-scorecard').click()
  await expect(page.getByTestId('scorecard-tests')).toHaveText(/^Tests under way \d+; calls resolved \d+, held \d+\.$/)
  await page.addInitScript(() => localStorage.setItem('life-mirror.preview.learningRepair', '0'))
  await page.reload()
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: /^The weekly view/ }).click()
  await page.getByTestId('weekly-scorecard').click()
  await expect(page.getByTestId('scorecard-tests')).toHaveText(/^Tests under way \d+; calls resolved \d+, held \d+\.$/)
  await expect(page.getByText(/Experiments declared/)).toHaveCount(0)
})
