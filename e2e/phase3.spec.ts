import { expect, test, type Page } from '@playwright/test'

// The one standard at the check-in and on the move card (Phase 3, 2026-11-12), in the browser, on stand-in records.
// A marked chip is answered from the same family Evidence and the day's sheet read: three taps say "too few to compare
// yet" where two readings used to be set side by side, and a comparison that stands says its readings with the very
// words Evidence says for it.

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

/** Opens the block's check-in and answers its readings, as far as the optional taps or, where a block has none, the summary. */
async function toSummary(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Check in/ }).click()
  const card = page.getByTestId('give-back')
  const extras = page.getByTestId('extras')
  const ask = page.getByTestId('outcome-ask')
  for (let i = 0; i < 30; i++) {
    await expect(card.or(extras).or(ask).or(page.getByTestId('anchor').nth(2)).first()).toBeVisible()
    if ((await card.isVisible()) || (await extras.isVisible())) break
    if (await ask.isVisible()) {
      await page.getByRole('button', { name: 'Not now', exact: true }).click()
      await expect(ask).toBeHidden()
      continue
    }
    await tapAnchor(page)
  }
  await expect(card.or(extras).first()).toBeVisible()
}

const ASKED = {
  morning: ['mood', 'irritation', 'stress', 'overwhelm', 'motivation', 'confidence', 'focus', 'loneliness', 'socialEnergy', 'energy', 'hunger', 'sleepHours', 'sleepQuality'],
  afternoon: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'],
  evening: ['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'],
} as const
const HOURS = { morning: 7, afternoon: 13, evening: 19 } as const
const DOWN = ['irritation', 'stress', 'overwhelm', 'loneliness']

/** A completed check-in `back` days before 10 November 2026: every reading in the middle, or the day read well (4) or badly (2). */
function row(back: number, block: keyof typeof ASKED, level: 2 | 3 | 4, extras?: Record<string, unknown>, over: Record<string, number> = {}): Record<string, unknown> {
  const date = new Date(2026, 10, 10 - back)
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), HOURS[block], 40).toISOString()
  const answers = { ...Object.fromEntries(ASKED[block].map((id) => [id, id === 'hunger' || id.startsWith('sleep') ? 3 : DOWN.includes(id) ? 6 - level : level])), ...over }
  return { day, block, asked: ASKED[block], startedAt: at, completedAt: at, updatedAt: at, answers, activeMs: 60_000, ...(extras ? { extras } : {}) }
}

/** Eight of four weeks' days, in no rhythm: a fortnight that reads the same turned round would test nothing. */
const eight = (back: number) => [3, 4, 6, 10].includes((back - 1) % 14)

test('the evening’s chips answer under the one standard: three taps are too few to compare, and a comparison that stands says its readings in the words Evidence uses', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 10, 19, 5))
  await page.goto('./')
  // One of your own chips, asked beside the built-in ones.
  await patchSettings(page, { ownChips: [{ id: 'standin1', label: 'Stand-in one', createdAt: '2026-10-01T12:00:00.000Z', removedAt: null }] })
  // Four weeks of evenings that all read the same, each with its morning after. Something rattled on eight of them in no
  // rhythm, and the mornings after those read badly; your own chip on the same eight; a nap on three.
  const shown = { chipsShown: { 'own:standin1': true } }
  const checkins: unknown[] = []
  for (let back = 29; back >= 2; back--) {
    const rattled = eight(back)
    checkins.push(row(back, 'evening', 3, { ...shown, ...(rattled ? { coolingOff: true, own: { standin1: true } } : {}), ...([5, 12, 19].includes(back) ? { napped: true } : {}) }))
    checkins.push(row(back - 1, 'morning', rattled ? 2 : 4))
  }
  await put(page, 'checkins', checkins)
  await page.reload()
  await toSummary(page)
  const extras = page.getByTestId('extras')
  await expect(extras).toBeVisible()
  const answer = (chip: string) => extras.locator(`li[data-chip="${chip}"]`).getByTestId('chip-answer').locator('.calc-line').first()

  // Three naps: before 2026-11-12 the answer set three mornings against twenty-five.
  await page.getByTestId('chip-napped').click()
  await expect(answer('napped')).toHaveText('3 times before: too few to compare yet.')
  // Never marked before: said as it always was.
  await page.getByTestId('chip-nothingLanded').click()
  await expect(answer('nothingLanded')).toHaveText('First time recorded.')
  // Eight evenings against twenty: the readings, the like-for-like difference, and where it stands.
  await page.getByTestId('chip-coolingOff').click()
  await expect(answer('coolingOff')).toHaveText(/^8 times before\. The morning after read \d+, against \d+ after evenings that started the same \(8 and 20\)\. Like for like, \d+ points lower: a steady pattern\.$/)
  const said = (await answer('coolingOff').textContent()) ?? ''
  const clause = /The morning after read .*$/.exec(said)?.[0] ?? ''
  expect(clause).toContain('Like for like')
  // Your own chip, among your own chips alone: the same evenings, so the same readings, in a family of its own.
  const own = extras.getByRole('button', { name: 'Stand-in one' })
  await own.scrollIntoViewIfNeeded()
  await own.click()
  await expect(answer('own:standin1')).toHaveText(said)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('give-back')).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Evidence says the same comparison with the same readings and the same standing.
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  const evidence = page.getByTestId('evidence')
  await expect(evidence).toBeVisible()
  await expect(evidence).toContainText(`8 evenings marked. ${clause.replace(/ \(8 and 20\)/, '')} Cooling off ran`)
  await expect(evidence.getByTestId('own-chip-evidence')).toHaveText(`Stand-in one: 8 evenings marked. ${clause}`)
})

test('the afternoon’s something sweet answers under the one standard, from the evenings after', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 10, 14, 5))
  await page.goto('./')
  // Four weeks of afternoons that read the same and showed the chip: something sweet on eight, the evenings of those read badly.
  const checkins: unknown[] = []
  for (let back = 29; back >= 2; back--) {
    const sweet = eight(back)
    checkins.push(row(back, 'morning', 3), row(back, 'afternoon', 3, { chipsShown: { sweet: true }, ...(sweet ? { sweet: true } : {}) }), row(back, 'evening', sweet ? 2 : 4))
  }
  await put(page, 'checkins', checkins)
  await page.reload()
  await toSummary(page)
  const chip = page.getByTestId('chip-sweet')
  await chip.scrollIntoViewIfNeeded()
  await chip.click()
  await expect(page.locator('li[data-chip="sweet"]').getByTestId('chip-answer')).toHaveText(/^8 times before\. The evening read \d+, against \d+ after afternoons that started the same \(8 and 20\)\. Like for like, \d+ points lower: a steady pattern\.$/)
})

test('a private item’s line on the move card says too few to compare where six afternoons used to set two readings side by side', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 10, 13, 30))
  await page.goto('./')
  // Placed at the afternoon check-in; shown at every afternoon of twelve days and logged at every other one.
  const [itemId] = await put(page, 'privateItems', [{ name: 'Stand-in item', createdAt: '2026-10-20T12:00:00.000Z', archived: 0, blocks: ['afternoon'] }])
  const checkins: unknown[] = []
  for (let back = 12; back >= 1; back--) {
    checkins.push(row(back, 'morning', 3), row(back, 'afternoon', 3, { privateShown: { [String(itemId)]: true }, ...(back % 2 === 0 ? { private: { [String(itemId)]: true } } : {}) }), row(back, 'evening', 3))
  }
  await put(page, 'checkins', checkins)
  await patchSettings(page, { privateInSelection: true, showPrivate: false })
  await page.reload()
  await toSummary(page)
  if (await page.getByTestId('extras').isVisible()) await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('give-back')).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  const card = page.getByTestId('move-card').first()
  await expect(card).toBeVisible()
  await card.getByTestId('move-why').click()
  await expect(page.getByTestId('private-line')).toHaveText(/^Your record: afternoons with a private item logged, too few to compare yet\. An alternative: .+\.$/)
  // Evidence's line for the same item says the same.
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  await expect(page.getByTestId('private-association')).toHaveText(/^A private item, logged in the afternoon: too few to compare yet\. An alternative: .+\.$/)
})

test('a caffeine difference that stands is said on Evidence with where it stands: a lead at most for next-night sleep', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 10, 13, 30))
  await page.goto('./')
  // Thirty-five pairs of days over ten weeks: a morning that began on six to seven hours and reported a band, then the next
  // morning's sleep. Fifteen heavier days and twenty lighter, three heavier in each seven and in no rhythm; the nights after
  // the heavier days an hour shorter and a step worse.
  const bands = Array.from({ length: 5 }, () => [3, 3, 1, 3, 1, 1, 1]).flat()
  const checkins: unknown[] = []
  bands.forEach((band, k) => {
    const back = 70 - 2 * k
    const at = new Date(2026, 10, 10 - back, 7, 40).toISOString()
    checkins.push(row(back, 'morning', 3, { caffeineIntake: { band, at, since: null }, caffeineShown: true }))
    checkins.push(row(back - 1, 'morning', 3, undefined, band >= 3 ? { sleepHours: 3, sleepQuality: 3 } : { sleepHours: 4, sleepQuality: 4 }))
  })
  await put(page, 'checkins', checkins)
  await page.reload()
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Evidence/ }).click()
  const bandsCard = page.getByTestId('caffeine-bands')
  await expect(bandsCard.getByTestId('caffeine-bands-group')).toHaveCount(2)
  // Each difference with where it stands: a lead, with how many were looked at, and never a steady pattern on a scale of steps.
  await expect(page.getByTestId('caffeine-bands-diff')).toHaveText('Like for like on the sleep the day began with, the last group against the first: sleep -60 min (a lead, not yet a pattern; 2 looked at) and quality -1.0 of a step (a lead, not yet a pattern; 2 looked at).')
  await expect(page.getByTestId('evidence')).not.toContainText('a steady pattern')
})
