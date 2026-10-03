import { expect, test, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test'

// Sync safety (2026-10-02), in the browser the phone runs. A phone's browser can clear the app's
// database and leave its local storage standing: the token's second copy comes back, and so must
// everything else. Here it happens on purpose: a second browser context takes the first one's local
// storage and none of its database. The cloud is a stand-in inside this
// test that answers the database's HTTP protocol (Hrana over HTTP, version 2) for the statements the
// app sends; nothing leaves the machine, and the token is made up.

const TOKEN = 'e2e-token-never-real'
const APP = 'life-mirror'
const BRAIN = 'life-mirror-brain'
const COLUMNS = ['app', 'store', 'id', 'day', 'body', 'updated_at', 'deleted', 'device_id', 'synced_at'] as const

interface Row {
  app: string
  store: string
  id: string
  day: string | null
  body: string | null
  updated_at: string
  deleted: number
  device_id: string
  synced_at: string
}
type Value = { type: 'null' } | { type: 'integer'; value: string } | { type: 'float'; value: number } | { type: 'text'; value: string } | { type: 'blob'; base64: string }
interface Stmt {
  sql?: string
  /** A statement the client stored earlier with store_sql, named by its number. */
  sql_id?: number
  args?: Value[]
}

const valueOf = (v: Value): string | number | null => (v.type === 'null' ? null : v.type === 'integer' ? Number(v.value) : v.type === 'blob' ? v.base64 : v.value)
const asValue = (v: unknown): Value => (v === null || v === undefined ? { type: 'null' } : typeof v === 'number' ? (Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v }) : { type: 'text', value: String(v) })

/** The live table's refusal, as the database answers it: body is NOT NULL (seen on the phone, 2026-10-02). */
const notNull = (): Error => Object.assign(new Error('SQLite error: NOT NULL constraint failed: records.body'), { code: 'SQLITE_CONSTRAINT' })

/** The stand-in cloud: the records table and the devices touch, as the app's five statements use them, with the live table's NOT NULL body and a batch written whole or not at all. */
class Cloud {
  rows = new Map<string, Row>()
  /** Each completed sync ends by touching its device: one count per sync that went through. */
  touches = 0
  refused: string[] = []
  /** Unreachable: every request fails as a network that is down does. */
  down = false
  /** A store whose rows the table refuses, as it refused a row with no body. */
  refuseStore: string | null = null
  private known = new Set<string>()
  private stored = new Map<number, string>()
  private held: Promise<void> | null = null
  private open: (() => void) | null = null

  seed(row: Row): void {
    this.rows.set(`${row.app}|${row.store}|${row.id}`, row)
  }

  /** Every pull of the app's own rows waits until let go: the restore is slow, and the phone is used meanwhile. */
  hold(): void {
    this.held = new Promise((resolve) => (this.open = resolve))
  }

  letGo(): void {
    this.open?.()
    this.held = null
    this.open = null
  }

  live(store: string): Row[] {
    return [...this.rows.values()].filter((r) => r.app === APP && r.store === store && !r.deleted)
  }

  /**
   * What each record of the app's is, by its id: its day, block and moment. Use goes on writing (the
   * usage log, today's sheet), so a later reading may hold more records, but every record it held
   * before must still be the same record under the same id.
   */
  identities(): Map<string, string> {
    const out = new Map<string, string>()
    for (const r of this.rows.values()) {
      if (r.app !== APP || r.store === 'settings') continue
      const b = r.body ? (JSON.parse(r.body) as Record<string, unknown>) : {}
      out.set(`${r.store}|${r.id}`, `${r.deleted}|${String(b.day ?? b.forDay ?? '')}|${String(b.block ?? '')}|${String(b.startedAt ?? b.at ?? b.createdAt ?? b.madeOn ?? b.setAt ?? '')}`)
    }
    return out
  }

  private async run(stmt: Stmt): Promise<{ cols: string[]; rows: unknown[][]; affected: number }> {
    const sql = (stmt.sql ?? this.stored.get(stmt.sql_id ?? -1) ?? '').trim()
    const args = (stmt.args ?? []).map(valueOf)
    if (/^(BEGIN|COMMIT|ROLLBACK|PRAGMA)\b/i.test(sql)) return { cols: [], rows: [], affected: 0 }
    if (sql.startsWith('INSERT OR REPLACE INTO records')) {
      const r = Object.fromEntries(COLUMNS.map((c, i) => [c, args[i]])) as unknown as Row
      if (r.body === null || r.body === undefined || r.store === this.refuseStore) throw notNull()
      this.seed({ ...r, deleted: Number(r.deleted) })
      return { cols: [], rows: [], affected: 1 }
    }
    if (sql.startsWith(`SELECT ${COLUMNS.join(', ')} FROM records WHERE app = ? AND synced_at > ? ORDER BY synced_at ASC LIMIT ?`)) {
      const [app, after, limit] = args as [string, string, number]
      if (app === APP && this.held) await this.held
      const out = [...this.rows.values()].filter((r) => r.app === app && r.synced_at > after).sort((a, b) => (a.synced_at < b.synced_at ? -1 : a.synced_at > b.synced_at ? 1 : 0)).slice(0, limit)
      return { cols: [...COLUMNS], rows: out.map((r) => COLUMNS.map((c) => r[c])), affected: 0 }
    }
    if (sql.startsWith('UPDATE devices SET last_sync')) {
      this.touches++
      return { cols: [], rows: [], affected: this.known.has(String(args[1])) ? 1 : 0 }
    }
    if (sql.startsWith('INSERT INTO devices')) {
      this.known.add(String(args[0]))
      return { cols: [], rows: [], affected: 1 }
    }
    this.refused.push(sql)
    throw new Error(`not a statement the app sends: ${sql.slice(0, 60)}`)
  }

  private result(r: { cols: string[]; rows: unknown[][]; affected: number }) {
    return { cols: r.cols.map((name) => ({ name, decltype: null })), rows: r.rows.map((row) => row.map(asValue)), affected_row_count: r.affected, last_insert_rowid: null }
  }

  async handle(route: Route): Promise<void> {
    const req = route.request()
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' }
    if (this.down) return route.abort('failed')
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (!req.url().endsWith('/v2/pipeline')) return route.fulfill({ status: 404, headers, body: '{}' })
    const body = req.postDataJSON() as { requests: { type: string; stmt?: Stmt; batch?: { steps: { stmt: Stmt }[] }; sql?: string; sql_id?: number }[] }
    const results: unknown[] = []
    for (const r of body.requests) {
      try {
        if (r.type === 'close') results.push({ type: 'ok', response: { type: 'close' } })
        else if (r.type === 'store_sql' && r.sql_id !== undefined && r.sql !== undefined) {
          this.stored.set(r.sql_id, r.sql)
          results.push({ type: 'ok', response: { type: 'store_sql' } })
        } else if (r.type === 'close_sql' && r.sql_id !== undefined) {
          this.stored.delete(r.sql_id)
          results.push({ type: 'ok', response: { type: 'close_sql' } })
        }
        else if (r.type === 'execute' && r.stmt) results.push({ type: 'ok', response: { type: 'execute', result: this.result(await this.run(r.stmt)) } })
        else if (r.type === 'batch' && r.batch) {
          const stepResults: unknown[] = []
          const before = new Map(this.rows)
          try {
            for (const step of r.batch.steps) stepResults.push(this.result(await this.run(step.stmt)))
          } catch (e) {
            // One step refused: the batch's transaction rolls back, and nothing of it is written.
            this.rows = before
            throw e
          }
          results.push({ type: 'ok', response: { type: 'batch', result: { step_results: stepResults, step_errors: stepResults.map(() => null) } } })
        } else throw new Error(`not a request the app sends: ${r.type}`)
      } catch (e) {
        results.push({ type: 'error', error: { message: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code ?? 'SQLITE_ERROR' } })
      }
    }
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ baton: null, base_url: null, results }) })
  }
}

type State = Awaited<ReturnType<BrowserContext['storageState']>>

interface Phone {
  context: BrowserContext
  page: Page
  errors: string[]
}

/** A phone: a browser context with the project's phone settings, its cloud requests answered by the stand-in, its clock at `at` and running. */
async function phone(browser: Browser, cloud: Cloud, at: Date, state?: State): Promise<Phone> {
  const use = test.info().project.use
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport ?? undefined, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, colorScheme: use.colorScheme ?? undefined, storageState: state })
  await context.route(/turso\.io/, (route) => cloud.handle(route))
  const page = await context.newPage()
  await page.clock.install({ time: at })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  return { context, page, errors }
}

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

/** The ids a store holds on the phone, read straight from its database. */
function localIds(page: Page, store: string): Promise<number[]> {
  return page.evaluate(async (name) => {
    const dbx = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('life-mirror')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const keys = await new Promise<IDBValidKey[]>((res, rej) => {
      const q = dbx.transaction([name], 'readonly').objectStore(name).getAllKeys()
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    dbx.close()
    return (keys as number[]).sort((a, b) => a - b)
  }, store)
}

async function openSettings(page: Page, row: RegExp | string): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  if (typeof row === 'string') await page.getByTestId(row).click()
  else await page.getByRole('button', { name: row }).click()
}

/** What the phone shows of its record and its sync: Cloud copy, the brain's recent lines, and the moves' History. */
async function shows(page: Page, cloud: Cloud): Promise<void> {
  await page.goto('./')
  await openSettings(page, /Cloud copy/)
  await expect(page.getByTestId('cloud-pending')).toHaveText('nothing pending')
  await expect(page.getByTestId('cloud-status')).not.toContainText('did not go through')
  await expect(page.getByTestId('cloud-storage')).toHaveText(/when space runs low/)
  await page.goto('./')
  await openSettings(page, 'settings-brain')
  await expect(page.getByTestId('brain-recent-line')).toHaveCount(2)
  await page.goto('./')
  await page.getByRole('button', { name: 'Moves', exact: true }).click()
  await page.getByRole('button', { name: /^History/ }).click()
  await expect(page.getByTestId('history-row')).toHaveCount(cloud.live('offers').length)
}

/** Every record held before is the same record now, and every record added since took an id above any its store held. */
function sameRecords(before: Map<string, string>, after: Map<string, string>): string[] {
  const wrong: string[] = []
  const max = new Map<string, number>()
  for (const [key, what] of before) {
    const [store, id] = key.split('|')
    if (after.get(key) !== what) wrong.push(`${key}: ${what} -> ${after.get(key) ?? 'gone'}`)
    if (Number.isInteger(Number(id))) max.set(store, Math.max(max.get(store) ?? 0, Number(id)))
  }
  for (const key of after.keys()) {
    const [store, id] = key.split('|')
    if (!before.has(key) && Number.isInteger(Number(id)) && Number(id) <= (max.get(store) ?? 0)) wrong.push(`${key}: a new record under an id already used`)
  }
  return wrong
}

const day = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('a phone whose database is cleared gets every record back, hands out no id the cloud holds, and settles with nothing pending', async ({ browser }) => {
  test.setTimeout(180_000)
  const morning = new Date(2026, 2, 8, 9, 5)
  const cloud = new Cloud()
  // The Worker's lines of the two days before, as the brain writes them.
  for (const back of [2, 1]) {
    const d = day(new Date(2026, 2, 8 - back))
    cloud.seed({ app: BRAIN, store: 'briefs', id: `${d}:brief`, day: d, body: JSON.stringify({ day: d, kind: 'brief', text: 'A line.', mode: 'observation', factIds: ['record'], cardIds: [], model: 'claude-opus', writer: 'claude', askedModel: 'opus', at: `${d}T13:15:00.000Z` }), updated_at: `${d}T13:15:01.000Z`, deleted: 0, device_id: 'worker', synced_at: `${d}T13:15:01.000Z` })
  }

  // The phone as it was: the token kept, the morning checked in and synced.
  const a = await phone(browser, cloud, morning)
  await a.page.goto('./')
  await openSettings(a.page, /Cloud copy/)
  await a.page.getByTestId('token-input').fill(TOKEN)
  await a.page.getByTestId('token-keep').click()
  await expect.poll(() => cloud.touches).toBeGreaterThan(0)
  await a.page.goto('./')
  await checkIn(a.page)
  await expect.poll(() => cloud.live('checkins').length).toBe(1)
  await expect.poll(() => cloud.live('offers').length).toBe(1)
  const original = cloud.live('checkins')[0]
  const originalOffer = cloud.live('offers')[0]
  const state = await a.context.storageState()
  expect(a.errors).toEqual([])
  await a.context.close()

  // The browser clears the database and keeps local storage. The restore is slow; the morning is checked in again meanwhile.
  cloud.hold()
  const b = await phone(browser, cloud, new Date(2026, 2, 8, 9, 20), state)
  await b.page.goto('./')
  await checkIn(b.page)
  const handed = await localIds(b.page, 'checkins')
  expect(handed).toHaveLength(1)
  expect(handed[0]).toBeGreaterThan(Number(original.id))
  expect((await localIds(b.page, 'offers'))[0]).toBeGreaterThan(Number(originalOffer.id))
  const before = cloud.touches
  cloud.letGo()
  await expect.poll(() => cloud.touches, { timeout: 30_000 }).toBeGreaterThan(before)

  // One check-in for the morning: the later one. The earlier is kept whole aside and tombstoned, never refused, never lost.
  expect(cloud.refused).toEqual([])
  expect(cloud.live('checkins').map((r) => r.id)).toEqual([String(handed[0])])
  const aside = [...cloud.rows.values()].find((r) => r.app === APP && r.store === 'superseded' && r.id === `checkins:${original.id}`)
  expect(JSON.parse(aside?.body as string).body).toEqual(JSON.parse(original.body as string))
  // The morning's first move stays whole under its own id, beside the second.
  expect(cloud.live('offers').find((r) => r.id === originalOffer.id)?.body).toBe(originalOffer.body)
  expect(cloud.live('offers')).toHaveLength(2)
  await shows(b.page, cloud)

  // Relaunched, and synced again: the same record, nothing written twice.
  const settled = cloud.identities()
  const relaunch = cloud.touches
  await b.page.reload()
  await expect.poll(() => cloud.touches, { timeout: 30_000 }).toBeGreaterThan(relaunch)
  await shows(b.page, cloud)
  expect(sameRecords(settled, cloud.identities())).toEqual([])
  const relaunched = cloud.identities()
  const stateB = await b.context.storageState()
  const kept = { checkins: await localIds(b.page, 'checkins'), offers: await localIds(b.page, 'offers') }
  expect(b.errors).toEqual([])
  await b.context.close()

  // Cleared again, the token's database copy restored a second time: the same record, the same ids, nothing written over.
  const c = await phone(browser, cloud, new Date(2026, 2, 11, 20, 50), stateB)
  const third = cloud.touches
  await c.page.goto('./')
  await expect.poll(() => cloud.touches, { timeout: 30_000 }).toBeGreaterThan(third)
  expect({ checkins: await localIds(c.page, 'checkins'), offers: await localIds(c.page, 'offers') }).toEqual(kept)
  expect(sameRecords(relaunched, cloud.identities())).toEqual([])
  await openSettings(c.page, /Cloud copy/)
  // The token's restore is in the log; a change still waiting when the database went (the last screens' use) came back with it.
  await expect(c.page.getByTestId('token-log')).toContainText('written again')
  await shows(c.page, cloud)
  expect(c.errors).toEqual([])
  await c.context.close()
})

// Sync safety, second part (2026-10-02). On the phone one queued deletion went up with no body; the
// table refused it and every batch with it, and hours later the browser cleared the database with
// the day's changes still waiting: a move answered Done on its card, and what rode alongside it.

/** Every record a store holds on the phone, by id, read straight from its database. */
function localRows(page: Page, store: string): Promise<Record<string, unknown>[]> {
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
    return rows as Record<string, unknown>[]
  }, store)
}

/** The token kept on a new phone, and its first sync through. */
async function connectPhone(p: Phone, cloud: Cloud): Promise<void> {
  await p.page.goto('./')
  await openSettings(p.page, /Cloud copy/)
  await p.page.getByTestId('token-input').fill(TOKEN)
  await p.page.getByTestId('token-keep').click()
  await expect.poll(() => cloud.touches).toBeGreaterThan(0)
  await p.page.goto('./')
}

/** The afternoon's check-in, then Done on its move's card later in the block; what rides alongside is left open. */
async function moveDoneOnTheCard(page: Page): Promise<void> {
  await checkIn(page)
  await expect(page.getByTestId('move-card').first()).toBeVisible()
  // Nothing today has no Done tap by design: Skip shows the next move.
  if ((await page.getByTestId('move-name').first().textContent())?.trim() === 'Nothing today') {
    await page.getByRole('button', { name: /^Skip/ }).click()
    await expect(page.getByTestId('move-name').first()).not.toHaveText('Nothing today')
  }
  await page.clock.setFixedTime(new Date(2026, 2, 8, 16, 30))
  await page.getByRole('button', { name: 'Mirror', exact: true }).click()
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await page.getByTestId('move-done').click()
  await expect(page.getByTestId('move-fact')).toContainText(/Done · 4:30 PM/)
}

const byId = (rows: Record<string, unknown>[]) => new Map(rows.map((r) => [Number(r.id), r]))

test('a database cleared before the cloud had the day gets back the move answered Done and what rides alongside it, under their own ids, and sends them', async ({ browser }) => {
  test.setTimeout(180_000)
  const cloud = new Cloud()
  const a = await phone(browser, cloud, new Date(2026, 2, 8, 12, 5))
  await connectPhone(a, cloud)
  // The cloud takes nothing from here (on the phone, the refused deletion held back every batch).
  cloud.down = true
  await moveDoneOnTheCard(a.page)
  const before = { offers: await localRows(a.page, 'offers'), outcomes: await localRows(a.page, 'outcomes'), checkins: await localRows(a.page, 'checkins'), cards: await localRows(a.page, 'cards') }
  expect(before.outcomes).toHaveLength(1)
  expect(before.outcomes[0]).toMatchObject({ outcome: 'done', passiveOutcome: null })
  const answered = before.offers.find((o) => o.id === before.outcomes[0].offerId) as Record<string, unknown>
  expect(cloud.live('offers')).toHaveLength(0)
  const state = await a.context.storageState()
  expect(a.errors).toEqual([])
  await a.context.close()

  // The browser clears the database and keeps local storage; the cloud is back.
  cloud.down = false
  const b = await phone(browser, cloud, new Date(2026, 2, 8, 20, 30), state)
  const touched = cloud.touches
  await b.page.goto('./')
  await expect.poll(() => cloud.touches, { timeout: 30_000 }).toBeGreaterThan(touched)

  // Every record of the afternoon back on the phone as it was, under its own id.
  for (const store of ['offers', 'outcomes', 'checkins', 'cards'] as const) {
    const now = byId(await localRows(b.page, store))
    for (const r of before[store]) expect(now.get(Number(r.id)), `${store} ${String(r.id)}`).toEqual(r)
  }
  // And in the cloud, whole.
  expect(cloud.live('outcomes').map((r) => JSON.parse(r.body as string))).toEqual(before.outcomes)
  for (const o of before.offers) expect(JSON.parse(cloud.live('offers').find((r) => r.id === String(o.id))?.body as string)).toEqual(o)
  expect(cloud.refused).toEqual([])

  // Now shows the answered move; what rides alongside it is still asked, right there.
  await b.page.goto('./')
  if (answered.passiveId) {
    await expect(b.page.getByTestId('move-fact')).toContainText('Done')
    await expect(b.page.getByTestId('passive-inline')).toBeVisible()
  }
  // History shows it done; Cloud copy says what came back, and nothing waits.
  await b.page.getByRole('button', { name: 'Moves', exact: true }).click()
  await b.page.getByRole('button', { name: /^History/ }).click()
  await expect(b.page.getByTestId('history-row').filter({ hasText: `Offer ${String(answered.id)}` })).toContainText('Done')
  await b.page.goto('./')
  await openSettings(b.page, /Cloud copy/)
  await expect(b.page.getByTestId('cloud-pending')).toHaveText('nothing pending')
  await expect(b.page.getByText(/put back from the phone’s second copy/).first()).toBeVisible()
  expect(b.errors).toEqual([])
  await b.context.close()
})

test('an answer deleted just after it went up stays deleted and goes up as a tombstone the table takes; a row the table refuses holds back nothing else, and Cloud copy says so', async ({ browser }) => {
  test.setTimeout(180_000)
  const cloud = new Cloud()
  const p = await phone(browser, cloud, new Date(2026, 2, 8, 12, 5))
  await connectPhone(p, cloud)
  await moveDoneOnTheCard(p.page)
  await expect.poll(() => cloud.live('outcomes').length, { timeout: 30_000 }).toBe(1)
  const id = cloud.live('outcomes')[0].id

  // From here the table refuses the use log's rows, as it refused the deletion with no body.
  await expect.poll(async () => (await localRows(p.page, 'outbox')).length, { timeout: 30_000 }).toBe(0)
  const usedBefore = cloud.live('useLog').length
  cloud.refuseStore = 'useLog'
  // The answer deleted in History: it goes up as a tombstone while the refused rows wait.
  await p.page.getByRole('button', { name: 'Moves', exact: true }).click()
  await p.page.getByRole('button', { name: /^History/ }).click()
  await p.page.getByTestId('history-delete').first().click()
  await p.page.getByTestId('history-delete').first().click()
  await expect.poll(() => cloud.rows.get(`${APP}|outcomes|${id}`)?.deleted, { timeout: 30_000 }).toBe(1)
  expect(cloud.rows.get(`${APP}|outcomes|${id}`)?.body).toBe('{}')
  // The use rows queued since wait on the phone: none of them reached the table.
  expect(cloud.live('useLog')).toHaveLength(usedBefore)

  // Synced again after a relaunch: still deleted on the phone and in the cloud.
  await p.page.reload()
  await openSettings(p.page, /Cloud copy/)
  await p.page.getByTestId('sync-now').click()
  await expect(p.page.getByTestId('cloud-status')).toContainText('The cloud refused')
  await expect(p.page.getByTestId('cloud-status')).toContainText('the rest went through')
  await expect(p.page.getByTestId('cloud-pending')).toHaveText(/^\d+ pending$/)
  expect(await localRows(p.page, 'outcomes')).toEqual([])
  expect(cloud.rows.get(`${APP}|outcomes|${id}`)?.deleted).toBe(1)

  // The table takes them again: the waiting rows go up, and nothing is pending.
  cloud.refuseStore = null
  await p.page.getByTestId('sync-now').click()
  await expect(p.page.getByTestId('cloud-pending')).toHaveText('nothing pending')
  await expect(p.page.getByTestId('cloud-status')).toContainText('Last sync')
  expect(cloud.live('useLog').length).toBeGreaterThan(0)
  expect(p.errors).toEqual([])
  await p.context.close()
})
