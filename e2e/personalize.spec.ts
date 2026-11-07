import { expect, test, type Locator, type Page } from '@playwright/test'

// Personalization (P6 of the AI-generated Paths design, 2026-11-07), driven as the owner would on the speaking Path:
// the sheet of your stage's reps, a preference taken and undone in place, Not for me refused where the stage would lose
// its floor, a kind of setting you don't have; a rep answered No at the check-in with the Path's own reason, set aside
// at once when it felt unsafe and said in front with the Path's own help; a suggestion from the record used and undone;
// and a tap made offline, kept and queued for the cloud.

let pageErrors: string[] = []
test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
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

async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click()
}

async function details(card: Locator): Promise<void> {
  const toggle = card.getByTestId('path-details')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}

async function rows(page: Page, store: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (s) => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('life-mirror')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    const all = await new Promise<Record<string, unknown>[]>((res, rej) => {
      const q = dbx.transaction([s], 'readonly').objectStore(s).getAll()
      q.onsuccess = () => res(q.result as Record<string, unknown>[])
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return all
  }, store)
}

async function putAll(page: Page, store: string, list: Record<string, unknown>[]): Promise<void> {
  await page.evaluate(
    async ({ store, list }) => {
      const dbx = await new Promise<IDBDatabase>((res, rej) => {
        const q = indexedDB.open('life-mirror')
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      const tx = dbx.transaction([store], 'readwrite')
      for (const r of list) tx.objectStore(store).put(r)
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      dbx.close()
    },
    { store, list },
  )
}

/** Reads and starts the speaking Path, Speaking to several people alone. */
async function startSpeaking(page: Page): Promise<void> {
  await tab(page, 'Aims')
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-path-speaking').click()
  await page.getByTestId('path-read-start').click()
  await page.getByTestId('path-start-focus-speaking').click()
  await page.getByTestId('path-start-begin').click()
  await expect(card(page)).toHaveCount(1)
}

const card = (page: Page) => page.locator('[data-path="speaking"][data-kind="path"]')
const fitRep = (page: Page, id: string) => page.locator(`[data-testid="path-fit-rep"][data-rep="${id}"]`)

test('your reps and settings: a preference taken and undone in place, Not for me refused where the stage keeps its floor, a kind of setting you don’t have', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
  await page.goto('./')
  await startSpeaking(page)
  await details(card(page))
  await expect(card(page).getByTestId('path-changes-none')).toHaveText('None yet: the Path runs as it was built.')
  await card(page).getByTestId('path-fit-open').click()

  const sheet = page.getByTestId('path-fit')
  await expect(sheet).toContainText('Your reps and settings')
  await expect(sheet.getByTestId('path-fit-rep')).toHaveCount(3)
  await fitRep(page, 'read-aloud').getByTestId('path-fit-prefer').click()
  await expect(fitRep(page, 'read-aloud').getByTestId('path-fit-prefer')).toHaveAttribute('aria-pressed', 'true')
  // Three different reps is this stage's floor: one set aside would leave two, so it is kept, and nothing is written.
  await fitRep(page, 'story-recording').getByTestId('path-fit-aside').click()
  await expect(fitRep(page, 'story-recording').getByTestId('path-fit-refused')).toHaveText('Kept: without it the stage has too few different reps to move on. To skip it today, pick another through Change.')
  await expect(fitRep(page, 'story-recording').getByTestId('path-fit-aside')).toHaveAttribute('aria-pressed', 'false')
  const group = page.locator('[data-testid="path-fit-setting"][data-setting="group"]')
  await group.getByTestId('path-fit-no-setting').click()
  await expect(group.getByTestId('path-fit-no-setting')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await rows(page, 'pathAdaptations')).map((r) => [r.kind, r.rep ?? r.setting, r.origin, r.state])).toEqual([
    ['prefer', 'read-aloud', 'preference', 'applied'],
    ['noSetting', 'group', 'correction', 'applied'],
  ])
  await page.getByTestId('path-fit-close').click()

  // On the card: each change with its origin, why and Undo; undone, it stays, marked.
  await tab(page, 'Aims')
  await details(card(page))
  const changes = card(page).getByTestId('path-change-row')
  await expect(changes).toHaveCount(2)
  const prefer = card(page).locator('[data-testid="path-change-row"][data-kind="prefer"]')
  await expect(prefer).toContainText('Read one page aloud, as if to a room: drawn more often')
  await expect(prefer).toContainText('From your preference')
  await expect(prefer).toContainText('You said you prefer it.')
  await prefer.getByTestId('path-change-undo').click()
  await expect(prefer).toHaveAttribute('data-state', 'undone')
  await expect(prefer.getByTestId('path-change-undone')).toContainText('Undone')
  await expect.poll(async () => (await rows(page, 'pathAdaptations')).map((r) => r.state)).toEqual(['undone', 'applied'])
})

test('a rep answered No at the check-in: the Path’s own reason asked once, and one that felt unsafe set aside at once, said in front with the Path’s own help', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
  await page.goto('./')
  await startSpeaking(page)
  await tab(page, 'Now')
  const row = page.locator('[data-kind="path"]')
  const rep = (await row.getByTestId('aim-step').textContent())?.trim() ?? ''
  await row.getByTestId('aim-start').click()
  await row.getByTestId('path-predict-start').click()
  await expect(row.getByTestId('aim-started')).toBeVisible()
  await page.clock.setFixedTime(new Date(2026, 10, 9, 13, 5))
  await page.reload()
  await page.getByRole('button', { name: /Check in/ }).click()
  const ask = page.getByTestId('outcome-ask')
  await ask.getByTestId('outcome').nth(2).click()
  await ask.getByTestId('why').nth(1).click()
  await expect(ask).toContainText('One optional tap: what got in the way?')
  await expect(ask.getByTestId('chance-yes')).toHaveCount(0)
  await ask.getByTestId('path-why-unsafe').click()
  await expect(page.getByTestId('outcome-ask')).toHaveCount(0)
  await expect.poll(async () => (await rows(page, 'outcomes')).map((x) => [x.outcome, x.why, x.pathWhy, x.chance])).toEqual([['no', 'didntWant', 'unsafe', true]])
  await expect.poll(async () => (await rows(page, 'pathAdaptations')).map((r) => [r.kind, r.origin, r.state])).toEqual([['setAside', 'safety', 'applied']])

  await page.goto('./')
  await tab(page, 'Aims')
  await expect(card(page).getByTestId('path-safety-line')).toHaveText(`${rep} is set aside: you said it felt unsafe or harmful. Undo it under Details if that changes.`)
  await expect(card(page).getByTestId('path-safety-help')).toBeVisible()
  await details(card(page))
  const safety = card(page).locator('[data-testid="path-change-row"][data-kind="setAside"]')
  await expect(safety).toContainText('From safety')
  // On the sheet it is said, never a toggle.
  await card(page).getByTestId('path-fit-open').click()
  await expect(page.getByTestId('path-fit-safety')).toHaveCount(1)
  await page.getByTestId('path-fit-close').click()
  await tab(page, 'Aims')
  await details(card(page))
  await card(page).locator('[data-testid="path-change-row"][data-kind="setAside"]').getByTestId('path-change-undo').click()
  await expect(card(page).getByTestId('path-safety')).toHaveCount(0)
})

test('a suggestion from the record: Use it applies it with its origin and why, and Undo keeps it, undone', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
  await page.goto('./')
  await startSpeaking(page)
  // Nerves on, and four of one of its reps answered No with no chance coming up.
  const [aim] = await rows(page, 'aims')
  await putAll(page, 'aims', [{ ...aim, strands: ['speaking', 'nerves'] }])
  const days = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']
  await putAll(page, 'offers', days.map((d, k) => ({ id: 800 + k, kind: 'step', day: d, block: 'morning', at: `${d}T14:00:00.000Z`, situationKey: 'aim:path:speaking', target: 'mood', stance: '', band: '', reading: 0, moveId: 'sp-n-no-lines', minutes: 2, cardId: null, candidates: ['sp-n-no-lines'], coinFlip: false, passiveId: null, whyNot: null, propensity: 1, propensities: { 'sp-n-no-lines': 1 }, chosenBy: 'app', paths: ['speaking'], setting: 'group', rule: 'only', stage: 1, skippedAt: null, closedAt: `${d}T20:00:00.000Z` })))
  await putAll(page, 'outcomes', days.map((d, k) => ({ id: 1800 + k, offerId: 800 + k, moveId: 'sp-n-no-lines', day: d, block: 'evening', at: `${d}T20:00:00.000Z`, outcome: 'no', why: null, passiveOutcome: null, reason: 'noReason', seen: true, chance: false, pathWhy: 'noChance' })))
  await page.reload()
  await tab(page, 'Aims')
  await expect(card(page).getByTestId('path-details')).toContainText('A suggestion for you')
  await details(card(page))
  const s = card(page).getByTestId('path-suggestion')
  await expect(s).toHaveCount(1)
  await expect(s).toContainText(': set aside')
  await expect(s).toContainText('From what your week allows')
  await expect(s).toContainText('No chance came up for it on 4 of its last 4 answered steps.')
  await s.getByTestId('path-suggestion-use').click()
  await expect(card(page).getByTestId('path-suggestion')).toHaveCount(0)
  const applied = card(page).locator('[data-testid="path-change-row"][data-kind="setAside"]')
  await expect(applied).toHaveAttribute('data-state', 'applied')
  await expect.poll(async () => (await rows(page, 'pathAdaptations')).map((r) => [r.kind, r.rep, r.origin, r.state])).toEqual([['setAside', 'sp-n-no-lines', 'feasibility', 'applied']])
  await applied.getByTestId('path-change-undo').click()
  await expect(applied).toHaveAttribute('data-state', 'undone')
})

test('a tap made offline is kept on the phone and queued for the cloud', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 9, 9, 5))
  await page.goto('./')
  await startSpeaking(page)
  await details(card(page))
  await card(page).getByTestId('path-fit-open').click()
  await context.setOffline(true)
  await fitRep(page, 'read-aloud').getByTestId('path-fit-prefer').click()
  await expect(fitRep(page, 'read-aloud').getByTestId('path-fit-prefer')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await rows(page, 'outbox')).filter((r) => r.store === 'pathAdaptations').length).toBe(1)
  await page.reload()
  await context.setOffline(true)
  await tab(page, 'Aims')
  await details(card(page))
  await expect(card(page).locator('[data-testid="path-change-row"][data-kind="prefer"]')).toHaveAttribute('data-state', 'applied')
  await context.setOffline(false)
})
