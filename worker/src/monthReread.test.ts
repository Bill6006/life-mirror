import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import { buildMonth } from './month'
import { monthToReread, REREAD_QUIET_MS, type RereadState } from './monthSchedule'
import { handleMonthBriefing, MONTH_CHECKS_STORE, monthTaskIdOf, runMonths, setMonthSwitch, wrongObservations, type MonthDeps, type MonthsEnv } from './monthTask'
import { accessFor, gatesFrom, type Catalogue } from './retrieval'
import { APP, memoryStore, type TaskRow } from './turso'

// Reading a month again (2026-11-13), on stand-in records: a record changed since its lines were built, still for six
// hours; a write-up an older method wrote; never a forgotten month; and what was marked wrong handed to the read.

const TZ = 'America/New_York'
const env = { TIMEZONE: TZ, LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 't' } as unknown as MonthsEnv
/** The rows were last written at 15:00 in New York on 13 November; the schedule looks seven hours later, at 22:00. */
const SYNCED = '2026-11-13T20:00:00.000Z'
const NOW = new Date('2026-11-14T03:00:00.000Z')
const TODAY = '2026-11-13'
const BEFORE = '2026-11-12T10:00:00.000Z'
const AFTER = '2026-11-13T21:00:00.000Z'

type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown, synced = SYNCED) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: synced, deleted: 0, synced_at: synced })
const dayAt = (n: number): string => new Date(Date.UTC(2026, 8, 25 + n)).toISOString().slice(0, 10)
function record(): Mem {
  const store = memoryStore()
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
  let id = 1
  for (let n = 0; n < 43; n++) {
    const day = dayAt(n)
    put(store, 'days', day, day, { day })
    put(store, 'checkins', String(id), day, { id: id++, day, block: 'evening', answers: {}, extras: { note: `A stand-in note for ${day}.` }, completedAt: `${day}T23:00:00.000Z` })
  }
  return store
}
const fetcher = (async (u: string | URL | Request) => (String(u).endsWith('catalogue.json') ? new Response(JSON.stringify({ moves: [] }), { status: 200 }) : new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_s' }), { status: 200 }))) as typeof fetch
const run = (store: Mem, over: Parameters<typeof runMonths>[3] = {}, now = NOW) => runMonths(env, store, now, { fireFetcher: fetcher, fetcher, ...over })
const writeUp = (month: string, builtAt: string, over: Record<string, unknown> = {}) => ({ id: `${month}:1`, month, reading: 1, at: builtAt, day: builtAt.slice(0, 10), method: 1, model: 'stand-in', builtFrom: { counts: { days: 30 }, parts: 1, lines: 90, fingerprint: 'a'.repeat(64), builtAt }, recorded: [{ text: 'A stand-in month.', days: [`${month}-28`], kinds: ['dayRecord'] }], noticed: [{ text: 'A stand-in connection.', days: [`${month}-28`], kinds: ['dayRecord'] }], ...over })
/** Both whole months written: September after the record's last change, October before it. */
async function written(october: Record<string, unknown> = {}): Promise<Mem> {
  const store = record()
  await setMonthSwitch(store, true, new Date(SYNCED))
  await store.writeBrainRow('writeups', '2026-09:1', TODAY, writeUp('2026-09', AFTER), AFTER)
  await store.writeBrainRow('writeups', '2026-10:1', '2026-11-12', writeUp('2026-10', BEFORE, october), BEFORE)
  return store
}
async function fingerprintOfOctober(store: Mem): Promise<string> {
  const b = await buildMonth({ store, catalogue: new Map() as unknown as Catalogue, a: accessFor('deep', gatesFrom(await store.readRecord('settings', '1')), readBrainPrefs(null)), day: TODAY, now: NOW, timeZone: TZ, showPrivate: false, question: '' }, '2026-10-01')
  if (!b.ok) throw new Error(b.reason)
  return b.fingerprint
}

describe('the month to read again', () => {
  const state = (over: Partial<RereadState> = {}): RereadState => ({ month: '2026-10', builtAt: BEFORE, method: 1, changed: SYNCED, checked: null, ...over })
  const pick = (months: RereadState[], method = 1, now = NOW) => monthToReread({ now, method, months })

  it('is one whose record changed after its lines were built, once that record has been still for six hours', () => {
    expect(REREAD_QUIET_MS).toBe(6 * 3_600_000)
    expect(pick([state()])).toEqual({ month: '2026-10', why: 'changed' })
    // Changed five hours ago: not yet; six hours ago to the minute: now.
    expect(pick([state()], 1, new Date('2026-11-14T01:00:00.000Z'))).toBeNull()
    expect(pick([state()], 1, new Date('2026-11-14T02:00:00.000Z'))).toEqual({ month: '2026-10', why: 'changed' })
  })

  it('is none whose record last changed before its lines were built, none with no change known, and none whose change was looked at already', () => {
    expect(pick([state({ builtAt: AFTER })])).toBeNull()
    expect(pick([state({ changed: null })])).toBeNull()
    expect(pick([state({ checked: SYNCED })])).toBeNull()
    // A newer change than the one looked at puts it up again.
    expect(pick([state({ checked: '2026-11-13T12:00:00.000Z' })])).toEqual({ month: '2026-10', why: 'changed' })
  })

  it('is one an older method wrote, whatever its record; and the oldest month first', () => {
    expect(pick([state({ changed: null })], 2)).toEqual({ month: '2026-10', why: 'method' })
    expect(pick([state({ method: 2, changed: null })], 2)).toBeNull()
    expect(pick([state(), state({ month: '2026-09' })])).toEqual({ month: '2026-09', why: 'changed' })
    expect(pick([state({ builtAt: AFTER }), state({ month: '2026-11' })])).toEqual({ month: '2026-11', why: 'changed' })
  })
})

describe('the schedule reads a month again', () => {
  it('when its record changed since its lines were built and its lines are no longer the same', async () => {
    const store = await written()
    expect(await run(store)).toEqual({ ran: true, reason: 'Claude is reading the month', day: '2026-10-01', task: 'task:2026-10-01:month' })
    expect(((await store.readTask(monthTaskIdOf('2026-10-01'))) as TaskRow).status).toBe('fired')
  })

  it('never before the record has been still for six hours', async () => {
    const store = await written()
    expect(await run(store, {}, new Date('2026-11-14T01:30:00.000Z'))).toEqual({ ran: false, reason: 'no month is waiting to be read', day: TODAY })
  })

  it('never when the change left the month’s lines as they were, and that change is not looked at twice', async () => {
    const probe = await written()
    const same = await fingerprintOfOctober(probe)
    const store = await written({ builtFrom: { counts: { days: 30 }, parts: 1, lines: 90, fingerprint: same, builtAt: BEFORE } })
    expect(await run(store)).toEqual({ ran: false, reason: 'the record of 2026-10 changed and its lines did not', day: '2026-10-01' })
    expect((await store.readBrainRows<{ changed: string }>(MONTH_CHECKS_STORE, 10)).map((r) => [r.id, r.body.changed])).toEqual([['2026-10', SYNCED]])
    expect(await store.readTask(monthTaskIdOf('2026-10-01'))).toBeNull()
    expect(await run(store, {}, new Date(NOW.getTime() + 15 * 60_000))).toEqual({ ran: false, reason: 'no month is waiting to be read', day: TODAY })
    // A later change is looked at again.
    put(store, 'checkins', '900', '2026-10-17', { id: 900, day: '2026-10-17', block: 'afternoon', answers: {}, extras: { note: 'A note added later.' }, completedAt: '2026-10-17T19:00:00.000Z' }, '2026-11-14T04:00:00.000Z')
    // Ten in the morning in New York: the quiet hours hold a re-read as they hold a first read.
    expect((await run(store, {}, new Date('2026-11-14T15:00:00.000Z'))).reason).toBe('quiet hours: 9:00 to 11:30 keep the window for the day’s line')
    expect((await run(store, {}, new Date('2026-11-14T17:00:00.000Z'))).task).toBe('task:2026-10-01:month')
  })

  it('never a month whose newest write-up was forgotten', async () => {
    const store = await written()
    put(store, 'noteMarks', 'forget', null, { id: 'forget', kind: 'forget', at: '2026-11-12T12:00:00.000Z', updatedAt: '2026-11-12T12:00:00.000Z' })
    expect(await run(store)).toEqual({ ran: false, reason: 'no month is waiting to be read', day: TODAY })
    // Forgotten before the write-up was written: that write-up stands, and its month is read again.
    put(store, 'noteMarks', 'forget', null, { id: 'forget', kind: 'forget', at: '2026-11-11T12:00:00.000Z', updatedAt: '2026-11-11T12:00:00.000Z' })
    expect((await run(store)).task).toBe('task:2026-10-01:month')
  })

  it('only after every first read: a month never read comes before a month read again', async () => {
    const store = record()
    await setMonthSwitch(store, true, new Date(SYNCED))
    await store.writeBrainRow('writeups', '2026-10:1', '2026-11-12', writeUp('2026-10', BEFORE), BEFORE)
    expect((await run(store)).day).toBe('2026-09-01')
  })

  it('never once that month’s three tries of the day are used', async () => {
    const store = await written()
    await store.writeTask({ id: monthTaskIdOf('2026-10-01'), kind: 'task', task: 'month', day: '2026-10-01', at: SYNCED, status: 'refused', trigger: 'ask', factsDay: '2026-10-01', askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 2, refusals: [], month: { parts: 1, served: [1], other: 0, lines: 10, fingerprint: 'x', tries: { day: TODAY, n: 3 } } })
    expect(await run(store)).toEqual({ ran: false, reason: 'no month is waiting to be read', day: TODAY })
  })

  it('and the plan names it, with why, and does nothing', async () => {
    const store = await written()
    expect(await run(store, { plan: true })).toMatchObject({ ran: false, reason: 'no month is waiting to be read', reread: '2026-10 (its record changed)', written: ['2026-09', '2026-10'] })
    expect(await store.readTask(monthTaskIdOf('2026-10-01'))).toBeNull()
    expect(await store.readBrainRows(MONTH_CHECKS_STORE, 10)).toEqual([])
  })
})

describe('each month’s rows and when one last changed', () => {
  it('are counted over the stores a day’s lines are built from: a deleted row holds nothing and still says when it changed', async () => {
    const store = memoryStore()
    put(store, 'days', '2026-09-30', '2026-09-30', { day: '2026-09-30' }, '2026-10-01T10:00:00.000Z')
    put(store, 'checkins', '1', '2026-09-30', { id: 1 }, '2026-10-02T10:00:00.000Z')
    put(store, 'journal', '1', '2026-07-04', { id: 1 }, '2026-11-01T10:00:00.000Z')
    store.put({ app: APP, store: 'offers', id: '5', day: '2026-05-02', body: '{}', updated_at: '2026-06-01T10:00:00.000Z', deleted: 1, synced_at: '2026-06-01T10:00:00.000Z' })
    store.put({ app: APP, store: 'notes', id: '6', day: '2026-09-12', body: '{}', updated_at: '2026-11-05T10:00:00.000Z', deleted: 1, synced_at: '2026-11-05T10:00:00.000Z' })
    expect(await store.monthStamps()).toEqual([
      { month: '2026-05', held: 0, changed: '2026-06-01T10:00:00.000Z' },
      { month: '2026-09', held: 2, changed: '2026-11-05T10:00:00.000Z' },
    ])
  })

  it('a month that holds only deleted rows is owed no read', async () => {
    const store = memoryStore()
    await setMonthSwitch(store, true, new Date(SYNCED))
    store.put({ app: APP, store: 'offers', id: '5', day: '2026-05-02', body: '{}', updated_at: SYNCED, deleted: 1, synced_at: SYNCED })
    expect(await run(store, { plan: true })).toMatchObject({ reason: 'no month is waiting to be read', months: [] })
  })
})

describe('what was marked wrong in an earlier reading', () => {
  const deps = (store: Mem): MonthDeps => ({ env, store, now: NOW, fetcher, types: [] })
  const mark = (store: Mem, id: string, kind = 'wrong') => put(store, 'noteMarks', id, null, { id, kind, at: SYNCED, updatedAt: SYNCED })

  it('is handed to the read in its own words: an observation of this month, marked, once', async () => {
    const store = await written()
    await store.writeBrainRow('writeups', '2026-10:2', TODAY, writeUp('2026-10', AFTER, { id: '2026-10:2', reading: 2 }), AFTER)
    mark(store, 'obs:2026-10:1:noticed:1')
    mark(store, 'obs:2026-10:2:noticed:1')
    mark(store, 'obs:2026-09:1:recorded:1')
    mark(store, 'event:checkins:18:raised-voice')
    expect(await wrongObservations(store, '2026-10')).toEqual(['A stand-in connection.'])
    expect(await wrongObservations(store, '2026-09')).toEqual(['A stand-in month.'])
    expect(await wrongObservations(store, '2026-11')).toEqual([])
    await store.writeTask({ id: monthTaskIdOf('2026-10-01'), kind: 'task', task: 'month', day: '2026-10-01', at: NOW.toISOString(), status: 'fired', trigger: 'ask', factsDay: '2026-10-01', askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 0, refusals: [] })
    const b = (await handleMonthBriefing(deps(store), new URL('https://w.test/claude/briefing?task=month&day=2026-10-01'))).body as { instructions: string }
    expect(b.instructions).toContain('OBSERVATIONS MARKED WRONG by the person in an earlier reading of this month, not to be said again in these or other words:\n- “A stand-in connection.”')
  })

  it('is not an observation whose mark was taken back, nor one of another kind of mark', async () => {
    const store = await written()
    mark(store, 'obs:2026-10:1:noticed:1', 'forget')
    expect(await wrongObservations(store, '2026-10')).toEqual([])
  })
})
