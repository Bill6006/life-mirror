import { expect, test, type Page } from '@playwright/test'

// The two features agreed for after the clean window, built behind closed gates (the owner's word,
// 2026-10-04): home-only moves with Skip's "Not home", and Away from home. Closed, as they ship,
// nothing of either shows or is stored. Previewed, as only an automated browser may, each works end
// to end; a preview reaches nothing but this browser's own screen and store.

const HOME = 'life-mirror.preview.homeOnly'
const AWAY = 'life-mirror.preview.away'
const HOME_IDS = ['open-windows', 'one-surface', 'one-load-done', 'shower-speaker', 'toothbrush-where-you-are', 'shoes-by-the-door', 'no-cook-dinners']

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
})
test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

/** A phone that has read its cloud before, at a fixed moment, with the previews named; the one-time direction asked and answered. */
async function start(page: Page, previews: readonly string[]): Promise<void> {
  await page.addInitScript((keys) => {
    localStorage.setItem('lm.inStep', '1')
    for (const k of keys) localStorage.setItem(k, '1')
  }, previews)
  // A Wednesday morning.
  await page.clock.setFixedTime(new Date(2026, 9, 14, 10, 0))
  await page.goto('./')
  await page.getByTestId('direction-input').fill('One line, mine')
  await page.getByRole('button', { name: 'Keep it', exact: true }).click()
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

/** The morning's check-in, tapped through to its summary. */
async function checkIn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await page.getByRole('button', { name: /Check in/ }).click()
  const card = page.getByTestId('give-back')
  for (let i = 0; i < 24; i++) {
    await expect(card.or(page.getByTestId('anchor').nth(2)).first()).toBeVisible()
    if (await card.isVisible()) break
    await tapAnchor(page)
  }
  await expect(card).toBeVisible()
}

async function rowsOf<T = Record<string, unknown>>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (s) =>
      new Promise<T[]>((res, rej) => {
        const r = indexedDB.open('life-mirror')
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          const q = r.result.transaction([s], 'readonly').objectStore(s).getAll()
          q.onerror = () => rej(q.error)
          q.onsuccess = () => {
            res(q.result as T[])
            r.result.close()
          }
        }
      }),
    store,
  )
}

type OfferRow = { id: number; day: string; kind: string; moveId: string; skippedAt: string | null; closedAt: string | null; skipReason?: string }

/** Makes the morning's live move one that needs the house, as a draw could have; then Now reads it. */
async function liveMoveIs(page: Page, moveId: string): Promise<void> {
  const live = (await rowsOf<OfferRow & Record<string, unknown>>(page, 'offers')).find((o) => o.kind === 'block' && o.day === '2026-10-14' && o.skippedAt === null)
  if (!live) throw new Error('no live move')
  await page.evaluate(
    async (row) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const q = indexedDB.open('life-mirror')
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      const tx = dbx.transaction(['offers'], 'readwrite')
      tx.objectStore('offers').put(row)
      await new Promise<void>((res) => (tx.oncomplete = () => res()))
      dbx.close()
    },
    { ...live, moveId, cardId: null, whyNot: null, passiveId: null },
  )
  await page.reload()
  await page.getByRole('button', { name: 'Now', exact: true }).click()
}

/** A trip stored as an open gate would store it, and today's record taken away so the app shapes the day again with it there. */
async function storeTrip(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('life-mirror')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const settings = await new Promise<Record<string, unknown>>((res) => {
      const q = dbx.transaction(['settings'], 'readonly').objectStore('settings').get(1)
      q.onsuccess = () => res(q.result)
    })
    const tx = dbx.transaction(['settings', 'days'], 'readwrite')
    tx.objectStore('settings').put({ ...settings, away: { from: '2026-10-14', to: '2026-10-16', setAt: '2026-10-13T20:00:00.000Z' } })
    tx.objectStore('days').delete('2026-10-14')
    await new Promise<void>((res) => (tx.oncomplete = () => res()))
    dbx.close()
  })
  await page.reload()
}

test('closed, as both ship: no trip row, no "Not home", no needs-home, and nothing of either stored or read, a trip stored or not', async ({ page }) => {
  await start(page, [])
  // Even with a trip already stored, the closed gate reads none of it: today is shaped by the week alone.
  await storeTrip(page)
  await expect(page.getByTestId('away-line')).toHaveCount(0)
  await expect.poll(async () => (await rowsOf<{ day: string }>(page, 'days')).some((d) => d.day === '2026-10-14')).toBe(true)
  expect((await rowsOf(page, 'days')).every((d) => !('awayFromHome' in d))).toBe(true)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByTestId('settings-week')).toBeVisible()
  await expect(page.getByTestId('settings-away')).toHaveCount(0)
  // The catalogue lists the windows with no need of the house.
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Read the catalogue/ }).click()
  await expect(page.locator('#move-open-windows .move-meta').first()).toContainText('needs nothing')
  expect(await page.getByText(/needs home/).count()).toBe(0)
  await page.getByRole('button', { name: 'Done', exact: true }).last().click()

  await checkIn(page)
  await expect(page.getByTestId('chip-office')).toBeVisible()
  await expect(page.getByTestId('chip-away-from-home')).toHaveCount(0)
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  await liveMoveIs(page, 'open-windows')
  const card = page.getByTestId('move-card').filter({ hasText: 'Open the windows for ten minutes' })
  await expect(card.getByTestId('move-facts')).toContainText('needs nothing')
  await expect(card.getByTestId('move-skip')).toBeVisible()
  await expect(card.getByTestId('move-not-home')).toHaveCount(0)
  await expect(page.getByTestId('away-line')).toHaveCount(0)
  await card.getByTestId('move-skip').click()
  await expect(page.getByTestId('move-card').filter({ hasText: 'Open the windows for ten minutes' })).toHaveCount(0)

  const offers = await rowsOf<OfferRow>(page, 'offers')
  expect(offers.find((o) => o.moveId === 'open-windows')?.skippedAt).not.toBeNull()
  expect(offers.every((o) => o.skipReason === undefined)).toBe(true)
  expect((await rowsOf(page, 'days')).every((d) => !('awayFromHome' in d))).toBe(true)
})

test('Away from home, previewed: set in its own screen, said on Now and in the check-in, and ended in one tap', async ({ page }) => {
  await start(page, [AWAY])
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const row = page.getByTestId('settings-away')
  await expect(row).toContainText('Not set')
  await row.click()
  await expect(page.getByTestId('away-screen')).toBeVisible()
  await expect(page.getByTestId('away-from')).toHaveValue('2026-10-14')

  // The last day is needed, and three weeks at most.
  await page.getByTestId('away-save').click()
  await expect(page.getByTestId('away-problem')).toHaveText('Give the last day: a trip always ends by itself.')
  await page.getByTestId('away-to').fill('2026-11-10')
  await page.getByTestId('away-save').click()
  await expect(page.getByTestId('away-problem')).toContainText('Three weeks at most')
  await page.getByTestId('away-to').fill('2026-10-17')
  await page.getByTestId('away-save').click()
  await expect(page.getByTestId('away-problem')).toHaveCount(0)
  await expect(page.getByTestId('away-status')).toHaveText('Away from home until Saturday, October 17.')

  // Only the dates are kept; today is shaped by the trip, the week's office and daycare set aside.
  const [settings] = await rowsOf<{ away?: { from: string; to: string } }>(page, 'settings')
  expect(settings.away).toMatchObject({ from: '2026-10-14', to: '2026-10-17' })
  expect(Object.keys(settings.away ?? {}).sort()).toEqual(['from', 'setAt', 'to'])
  const today = (await rowsOf<{ day: string; atOffice?: boolean; pickupTime: string | null; awayFromHome?: unknown }>(page, 'days')).find((d) => d.day === '2026-10-14')
  expect(today?.awayFromHome).toBeTruthy()
  expect(today?.pickupTime).toBeNull()

  await page.locator('.sub-head .back').click()
  await expect(page.getByTestId('settings-away')).toContainText('Until Sat, Oct 17')

  // Now: one row, to the trip's screen.
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await expect(page.getByTestId('away-line')).toContainText('Away from home until Saturday, October 17.')

  // The check-in's day rows: the trip's row says until when, and the office row gives way to it.
  await checkIn(page)
  await expect(page.getByTestId('chip-away-from-home')).toContainText('until Sat, Oct 17')
  await expect(page.getByTestId('chip-office')).toHaveCount(0)
  await page.getByTestId('chip-away-from-home').click()
  await expect(page.getByTestId('away-screen')).toBeVisible()
  // Begun today, its first day can still move.
  await expect(page.getByTestId('away-from')).toBeEnabled()
  await expect(page.getByTestId('away-from')).toHaveValue('2026-10-14')

  // Ended today: the trip had begun today, so it goes whole, and today has its week back.
  await page.getByTestId('away-end').click()
  await expect(page.getByTestId('away-status')).toHaveCount(0)
  await page.locator('.sub-head .back').click()
  await expect(page.getByTestId('give-back')).toBeVisible()
  await expect(page.getByTestId('chip-office')).toBeVisible()
  await expect(page.getByTestId('chip-away-from-home')).not.toContainText('until')
  expect((await rowsOf<{ away?: unknown }>(page, 'settings'))[0].away).toBeUndefined()
  expect((await rowsOf<{ day: string; awayFromHome?: unknown }>(page, 'days')).find((d) => d.day === '2026-10-14')?.awayFromHome).toBeUndefined()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('away-line')).toHaveCount(0)

  // A trip under way keeps its first day; ended the next morning, it keeps the day it had and ends the day before.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('settings-away').click()
  await page.getByTestId('away-to').fill('2026-10-16')
  await page.getByTestId('away-save').click()
  await expect(page.getByTestId('away-status')).toHaveText('Away from home until Friday, October 16.')
  await page.clock.setFixedTime(new Date(2026, 9, 15, 9, 0))
  await page.reload()
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await page.getByTestId('away-open').click()
  await expect(page.getByTestId('away-from')).toBeDisabled()
  await expect(page.getByTestId('away-end')).toHaveText('End it today')
  await page.getByTestId('away-end').click()
  await expect(page.getByTestId('away-status')).toHaveCount(0)
  expect((await rowsOf<{ away?: unknown }>(page, 'settings'))[0].away).toMatchObject({ from: '2026-10-14', to: '2026-10-14' })
  const days = await rowsOf<{ day: string; awayFromHome?: unknown }>(page, 'days')
  expect(days.find((d) => d.day === '2026-10-14')?.awayFromHome).toBeTruthy()
  expect(days.find((d) => d.day === '2026-10-15')?.awayFromHome).toBeUndefined()
})

test('Not home, previewed: a move that needs the house says so, and Skip with "Not home" shows one that does not', async ({ page }) => {
  await start(page, [HOME])
  await checkIn(page)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await liveMoveIs(page, 'open-windows')
  const card = page.getByTestId('move-card').filter({ hasText: 'Open the windows for ten minutes' })
  await expect(card.getByTestId('move-facts')).toContainText('needs home')
  await expect(card.getByTestId('move-skip')).toHaveText('Skip · show another')
  await expect(card.getByTestId('move-not-home')).toHaveText('Not home · show another')
  await card.getByTestId('move-not-home').click()
  await expect(card).toHaveCount(0)

  const offers = await rowsOf<OfferRow>(page, 'offers')
  expect(offers.find((o) => o.moveId === 'open-windows')?.skipReason).toBe('notHome')
  const next = offers.filter((o) => o.day === '2026-10-14' && o.kind === 'block' && o.skippedAt === null)
  expect(next).toHaveLength(1)
  expect(HOME_IDS).not.toContain(next[0].moveId)
  await expect(page.getByTestId('move-card').first().getByTestId('move-not-home')).toHaveCount(0)

  // The catalogue lists the windows with the house among its needs (the closed test's probe, shown able to say yes).
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^Read the catalogue/ }).click()
  await expect(page.locator('#move-open-windows .move-meta').first()).toContainText('needs home')
  await expect(page.locator('#move-walk-ten .move-meta').first()).not.toContainText('home')
})
