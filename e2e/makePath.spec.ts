import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Asking for a Path and the Path that comes back (P5 of the AI-generated Paths design), driven as the owner would:
// the intake under Add, the route the rules give it with the app's own words, the request listed with where its
// job stands and withdrawn before its draft starts; then, with the Worker's rows standing in as the phone would
// pull them, a generated Path read on one screen, started and run; a strand that waits is off until you turn it
// on, pauses what it names, and its strand's private check opens, the app's own help on a yes, its answers not
// kept. The rows come from e2e/fixtures/generated.json, which a unit test checks against the compiler.

const GENERATED = JSON.parse(readFileSync('e2e/fixtures/generated.json', 'utf8')) as { pathId: string; path: { name: string } }[]
const [GARDEN, ASKING] = GENERATED

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

async function putAll(page: Page, store: string, list: unknown[]): Promise<void> {
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

async function openMake(page: Page): Promise<void> {
  await tab(page, 'Aims')
  await page.getByRole('button', { name: /^Add a commitment/ }).click()
  await page.getByTestId('aim-kind-make-path').click()
  await expect(page.getByTestId('make-path')).toBeVisible()
}

test('asking for a Path: the rules route it before anything is kept, the app’s own words for every route, and the request listed with where it stands', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 7, 20, 5))
  await page.goto('./')

  // A goal the rules route as a Path, asked offline: kept on the phone, queued for the cloud, waiting for a draft.
  await openMake(page)
  await context.setOffline(true)
  await page.getByTestId('make-path-goal').fill('Grow vegetables in a small garden bed this summer')
  await page.getByTestId('make-path-where-home').click()
  await page.getByTestId('make-path-minutes-120').click()
  await page.getByTestId('make-path-ask').click()
  await expect(page.getByTestId('make-path-route')).toHaveAttribute('data-route', 'fits')
  await expect(page.getByTestId('make-path-route')).toContainText('It takes hours, never minutes, and never between 9:00 and 11:30. Nothing runs until you read it and start it.')
  await page.getByTestId('make-path-done').click()
  await expect.poll(async () => (await rows(page, 'pathRequests')).map((r) => [r.goal, r.where, r.minutes, r.route, r.state])).toEqual([['Grow vegetables in a small garden bed this summer', ['home'], 120, 'fits', 'queued']])
  await expect.poll(async () => (await rows(page, 'outbox')).filter((r) => r.store === 'pathRequests').length).toBe(1)
  await context.setOffline(false)

  // On Aims: waiting for a draft, withdrawn before it starts.
  await tab(page, 'Aims')
  const req = page.getByTestId('path-request')
  await expect(req).toHaveCount(1)
  await expect(req.getByTestId('path-request-state')).toHaveText('Waiting for a draft.')
  await req.getByTestId('path-request-withdraw').click()
  await expect(req.getByTestId('path-request-state')).toHaveText('Withdrawn.')

  // Too vague: asked again in place, nothing kept.
  await openMake(page)
  await page.getByTestId('make-path-goal').fill('be better')
  await page.getByTestId('make-path-ask').click()
  await expect(page.getByTestId('make-path-route')).toHaveAttribute('data-route', 'unclear')
  await page.getByTestId('make-path-again').click()
  await expect(page.getByTestId('make-path-goal')).toHaveValue('be better')

  // Covered already, and a risk: the app's own words, no draft.
  await page.getByTestId('make-path-goal').fill('Make more friends')
  await page.getByTestId('make-path-ask').click()
  await expect(page.getByTestId('make-path-route')).toContainText('The Social path covers this')
  await page.getByTestId('make-path-done').click()
  await openMake(page)
  await page.getByTestId('make-path-goal').fill('I want to kill myself')
  await page.getByTestId('make-path-ask').click()
  await expect(page.getByTestId('make-path-route')).toContainText('call or text 988')
  await page.getByTestId('make-path-done').click()
  const states = (await rows(page, 'pathRequests')).map((r) => [r.route, r.state])
  expect(states).toEqual([['fits', 'withdrawn'], ['existing', 'triaged'], ['redirect', 'triaged']])
  // Listed with the words the intake showed: the Path that covers it, not a draft that never comes.
  await tab(page, 'Aims')
  await expect(page.getByTestId('path-request').filter({ hasText: 'Make more friends' }).getByTestId('path-request-state')).toHaveText('The Social path covers this: add it from Add.')
})

test('a generated Path that came back: read on one screen, started and run; a strand that waits pauses what it names, and its private check opens with the app’s own help', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 9, 19, 5))
  await page.goto('./')
  // The rows as the phone pulls them: two requests, their jobs ready, and their versions.
  await putAll(page, 'pathRequests', [
    { id: 1, at: '2026-11-07T03:00:00.000Z', goal: 'Grow vegetables in a small garden bed this summer', minutes: 120, route: 'fits', state: 'queued' },
    { id: 2, at: '2026-11-07T03:05:00.000Z', goal: 'Get comfortable asking for help, at a counter and at home', minutes: 120, route: 'fits', state: 'queued' },
  ])
  await putAll(page, 'pathJobs', [
    { id: 'job:1', requestId: 1, state: 'ready', at: '2026-11-08T04:00:00.000Z', day: '2026-11-07', pathId: GARDEN.pathId, version: '1' },
    { id: 'job:2', requestId: 2, state: 'ready', at: '2026-11-08T04:05:00.000Z', day: '2026-11-07', pathId: ASKING.pathId, version: '1' },
  ])
  await putAll(page, 'generatedPaths', GENERATED)
  await page.reload()

  // Ready to read, and offered nowhere until it is started.
  await tab(page, 'Aims')
  await expect(page.locator(`[data-testid="path-new"][data-path="${GARDEN.pathId}"]`)).toHaveCount(1)
  await expect(page.locator(`[data-path="${GARDEN.pathId}"][data-kind="path"]`)).toHaveCount(0)
  const ready = page.getByTestId('path-request').filter({ hasText: 'Grow vegetables' })
  await expect(ready.getByTestId('path-request-state')).toHaveText('Ready to read.')
  await ready.getByTestId('path-request-read').click()
  const read = page.getByTestId('path-read')
  await expect(read.getByTestId('path-read-label')).toHaveText('Experimental')
  await expect(read).toContainText('Garden')
  await page.getByTestId('path-read-start').click()
  await page.getByTestId('path-start-begin').click()
  const garden = page.locator(`[data-path="${GARDEN.pathId}"][data-kind="path"]`)
  await expect(garden).toHaveCount(1)
  await expect(garden).toContainText('Planting')

  // The people Path: its own social-fear screen, its fear strand off on two noes; then Together turned on.
  await tab(page, 'Aims')
  await page.locator(`[data-testid="path-new"][data-path="${ASKING.pathId}"]`).getByTestId('path-new-read').click()
  await page.getByTestId('path-read-start').click()
  await expect(page.getByTestId('path-start-question')).toHaveCount(2)
  await page.getByTestId('path-start-avoid-no').click()
  await page.getByTestId('path-start-afraid-no').click()
  await expect(page.getByTestId('path-start-help')).toHaveCount(0)
  await page.getByTestId('path-start-focus-asking').click()
  await page.getByTestId('path-start-begin').click()
  const asking = page.locator(`[data-path="${ASKING.pathId}"][data-kind="path"]`)
  await expect(asking).toHaveCount(1)
  await expect(asking.getByTestId('path-check')).toHaveCount(0)
  const toggle = asking.getByTestId('path-details')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect(asking.getByTestId('path-strand-waits')).toContainText('Together waits: turn it on when it applies to you, and off when it ends. While Together is on, Asking pauses, its stages kept.')
  await asking.getByTestId('path-strand-on-together').click()
  await expect.poll(async () => (await rows(page, 'aims')).find((a) => a.path === ASKING.pathId)?.strands).toEqual(['together'])
  const log = (await rows(page, 'aims')).find((a) => a.path === ASKING.pathId)?.strandsLog as { strands: string[] }[]
  expect(log.map((x) => x.strands)).toEqual([['together']])

  // Its private check: the app's own questions; a yes shows the fixed help; only the month is kept.
  const check = asking.getByTestId('path-check')
  await expect(check).toHaveCount(1)
  await expect(check.getByTestId('path-check-question')).toHaveCount(3)
  await check.getByTestId('path-check-safety-yes').click()
  await expect(check.getByTestId('path-check-help')).toContainText('National Domestic Violence Hotline')
  await check.getByTestId('path-check-done').click()
  await expect(asking.getByTestId('path-check')).toHaveCount(0)
  const aim = (await rows(page, 'aims')).find((a) => a.path === ASKING.pathId) as Record<string, unknown>
  expect(aim.checkedMonth).toBe('2026-11')
  expect(JSON.stringify(aim)).not.toContain('safety')

  // Turned off again: Asking comes back, its stages kept.
  await asking.getByTestId('path-strand-on-together').click()
  await expect.poll(async () => (await rows(page, 'aims')).find((a) => a.path === ASKING.pathId)?.strands).toEqual(['asking'])
})
