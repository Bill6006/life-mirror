import { describe, expect, it } from 'vitest'
import { storedPatterns } from '../../src/counted/patterns'
import type { PatternsRecord } from '../../src/counted/stored'
import { patternTable } from '../../src/counted/table'
import { checkin, day as dayN, input } from '../../src/counted/testing'
import { noteEventOf } from '../../src/noteEvents/shared'
import type { EventType } from '../../src/noteEvents/types'
import { writeUpOf, type WriteUp } from '../../src/writeups/shared'
import { eventIdOf, followedOf, handleMonthBriefing, handleMonthContext, handleMonthLine, monthTaskIdOf, type MonthDeps } from './monthTask'
import { APP, memoryStore, type TaskRow } from './turso'

// The month's post (2026-11-13), on a stand-in month: whole, or nothing saved; the answer checked against the kept
// month; the write-up stored beside any earlier reading; each event stored against its note's record.

const TZ = 'America/New_York'
const env = { TIMEZONE: TZ, LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 't' } as unknown as MonthDeps['env']
const NOW = new Date('2026-11-13T20:00:00.000Z')
const FIRST = '2026-10-01'
const ID = monthTaskIdOf(FIRST)
const TYPES: EventType[] = [{ id: 'raised-voice', label: 'Raised my voice', definition: 'The note says you raised your voice at someone.', was: ['yelled'] }]

// Eight weeks of evenings with a late dinner on the eight Saturdays alone: the stand-in pattern table.
const A = 250
const saturday = (n: number): boolean => new Date(2026, 0, 1 + n).getDay() === 6
const tableAt = (updatedAt: string): PatternsRecord => storedPatterns(patternTable(input({ checkins: Array.from({ length: 56 }, (_, i) => checkin(A + i, 'evening', { extras: saturday(A + i) ? { dinner: true } : {} })) }), dayN(A + 56)), updatedAt)
const TABLE = tableAt('2026-11-13T12:00:00.000Z')

type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: NOW.toISOString(), deleted: 0, synced_at: NOW.toISOString() })
const dayAt = (n: number): string => new Date(Date.UTC(2026, 8, 25 + n)).toISOString().slice(0, 10)
const NOTE: Record<string, string> = { '2026-10-03': 'I raised my voice at the dog again.', '2026-10-09': 'Up late once more.' }

/** A stand-in record from 25 September to 6 November 2026; the evening of 3 October is check-in 18, of 9 October check-in 30. */
function standIn(note: (day: string) => string = (d) => NOTE[d] ?? `A stand-in note for ${d}.`, table: PatternsRecord | null = TABLE): Mem {
  const store = memoryStore()
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
  if (table) put(store, 'patterns', 'table', null, table)
  let id = 1
  for (let n = 0; n < 43; n++) {
    const day = dayAt(n)
    put(store, 'days', day, day, { day, atOffice: n % 2 === 0 })
    put(store, 'checkins', String(id), day, { id: id++, day, block: 'morning', answers: {}, extras: {}, completedAt: `${day}T12:00:00.000Z` })
    put(store, 'checkins', String(id), day, { id: id++, day, block: 'evening', answers: {}, extras: { note: note(day) }, completedAt: `${day}T23:00:00.000Z` })
  }
  return store
}
const task = (over: Partial<TaskRow> = {}): TaskRow => ({ id: ID, kind: 'task', task: 'month', day: FIRST, at: NOW.toISOString(), status: 'fired', trigger: 'forced', factsDay: FIRST, askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 0, refusals: [], ...over })
const fetcher = (async (u: string | URL | Request) => (String(u).endsWith('catalogue.json') ? new Response(JSON.stringify({ moves: [] }), { status: 200 }) : new Response('[]', { status: 200 }))) as typeof fetch
const deps = (store: Mem, now = NOW): MonthDeps => ({ env, store, now, fetcher, types: TYPES })
const url = (path: string, params: Record<string, string> = {}) => new URL(`https://w.test${path}?${new URLSearchParams({ task: 'month', day: FIRST, ...params })}`)
const body = (r: { body: unknown }) => r.body as Record<string, unknown>

interface Ids {
  note03: string
  note09: string
  day03: string
}
/** A task started, its briefing fetched and its parts read (all of them, or those named); the ids of three of the month's lines. */
async function ready(store: Mem, opts: { over?: Partial<TaskRow>; now?: Date; parts?: number[] } = {}): Promise<Ids> {
  const now = opts.now ?? NOW
  await store.writeTask(task({ at: now.toISOString(), ...opts.over }))
  await handleMonthBriefing(deps(store, now), url('/claude/briefing'))
  const total = ((await store.readTask(ID)) as TaskRow).month?.parts ?? 0
  const lines: { id: string; text: string }[] = []
  for (const p of opts.parts ?? Array.from({ length: total }, (_, i) => i + 1)) lines.push(...((body(await handleMonthContext(deps(store, now), url('/claude/context', { lookup: 'month', part: String(p) }))).facts as { id: string; text: string }[]) ?? []))
  const find = (day: string, words: string) => lines.find((l) => l.id.startsWith(`day.${day}.`) && l.text.includes(words))?.id ?? ''
  return { note03: find('2026-10-03', 'you wrote'), note09: find('2026-10-09', 'you wrote'), day03: find('2026-10-03', 'the day:') }
}
const answer = (ids: Ids, over: Record<string, unknown> = {}) => ({
  recorded: [{ text: 'You wrote notes in the evening.', factIds: [ids.note03, ids.note09] }],
  noticed: [{ text: 'A late dinner went with Saturdays.', factIds: [ids.day03], follow: { kind: 'chip.dinner', split: 'weekday', cell: '6' } }],
  events: [{ type: 'raised-voice', factId: ids.note03, quote: 'I raised my voice at the dog again' }],
  ...over,
})
const post = (store: Mem, a: unknown, now = NOW) => handleMonthLine(deps(store, now), { task: 'month', day: FIRST, answer: a, askedModel: 'opus', writtenModel: 'claude-stand-in', runnerModel: 'runner', subagentError: null })
const writeUps = async (store: Mem): Promise<WriteUp[]> => (await store.readBrainRows<unknown>('writeups', 50)).flatMap((r) => (writeUpOf(r.id, r.body) ? [writeUpOf(r.id, r.body) as WriteUp] : [])).sort((a, b) => a.reading - b.reading)
const events = async (store: Mem) => (await store.readBrainRows<unknown>('noteEvents', 50)).flatMap((r) => (noteEventOf(r.id, r.body) ? [noteEventOf(r.id, r.body)] : []))
const LONG = (d: string) => NOTE[d] ?? 'word '.repeat(400)

describe('a month’s answer that passes', () => {
  it('becomes the month’s write-up, read whole by the shape the phone reads, with what it was built from', async () => {
    const store = standIn()
    const ids = await ready(store)
    const r = await post(store, answer(ids))
    expect([r.status, r.body]).toEqual([200, { ok: true }])
    const [w] = await writeUps(store)
    const t = (await store.readTask(ID)) as TaskRow
    expect(w).toMatchObject({ id: '2026-10:1', month: '2026-10', reading: 1, at: NOW.toISOString(), day: '2026-11-13', method: 1, model: 'claude-stand-in' })
    expect(w.builtFrom).toEqual({ counts: { days: 37, checkins: 74, offers: 0, outcomes: 0, notes: 0, pathMarks: 0 }, parts: 1, lines: 124, fingerprint: t.month?.fingerprint, builtAt: NOW.toISOString() })
    expect(w.recorded).toEqual([{ text: 'You wrote notes in the evening.', days: ['2026-10-03', '2026-10-09'], kinds: ['notes'] }])
    // The pattern to follow carries the table's own counts for that cell on this day: a late dinner on all eight Saturdays.
    expect(w.noticed).toEqual([{ text: 'A late dinner went with Saturdays.', days: ['2026-10-03'], kinds: ['dayRecord'], followed: { kind: 'chip.dinner', split: 'weekday', cell: '6', k: 8, n: 8, restK: 0, m: 48 } }])
    expect([t.status, t.posts, t.writtenModel, t.month?.reading, t.month?.events, t.month?.dropped]).toEqual(['written', 1, 'claude-stand-in', 1, 1, 0])
  })

  it('stores each event against its note’s record, as the row the phone reads', async () => {
    const store = standIn()
    await post(store, answer(await ready(store)))
    expect(await events(store)).toEqual([{ id: 'checkins:18:raised-voice', type: 'raised-voice', note: { store: 'checkins', id: '18', day: '2026-10-03', block: 'evening' }, quote: 'I raised my voice at the dog again', noticedAt: NOW.toISOString(), method: 'month-1' }])
    expect(eventIdOf({ store: 'notes', id: '30' }, 'up-late')).toBe('notes:30:up-late')
  })

  it('is taken as JSON written out, too', async () => {
    const store = standIn()
    const r = await post(store, JSON.stringify(answer(await ready(store))))
    expect(r.status).toBe(200)
    expect(await writeUps(store)).toHaveLength(1)
  })

  it('is filed under the app’s day: an answer posted at one in the morning belongs to the day before', async () => {
    const store = standIn()
    const late = new Date('2026-11-14T06:00:00.000Z')
    const ids = await ready(store, { now: late })
    put(store, 'patterns', 'table', null, tableAt('2026-11-14T05:00:00.000Z'))
    expect((await post(store, answer(ids), late)).status).toBe(200)
    expect((await writeUps(store))[0].day).toBe('2026-11-13')
  })
})

describe('whole, or nothing saved', () => {
  it('refuses an answer while a part of the month was not read, and takes it once every part was', async () => {
    const store = standIn(LONG)
    const ids = await ready(store, { parts: [1] })
    const total = ((await store.readTask(ID)) as TaskRow).month?.parts ?? 0
    expect(total).toBeGreaterThan(2)
    const rest = Array.from({ length: total - 1 }, (_, i) => i + 2)
    const r = await post(store, answer(ids))
    expect([r.status, r.body]).toEqual([422, { ok: false, reason: `parts ${rest.join(', ')} of ${total} were not read: read every part, then post again`, retry: true }])
    expect(await writeUps(store)).toEqual([])
    expect(await events(store)).toEqual([])
    for (const p of rest.slice(0, -1)) await handleMonthContext(deps(store), url('/claude/context', { lookup: 'month', part: String(p) }))
    expect(body(await post(store, answer(ids))).reason).toBe(`part ${total} of ${total} was not read: read every part, then post again`)
    expect(((await store.readTask(ID)) as TaskRow).status).toBe('refused')
  })

  it('is refused before the briefing was fetched', async () => {
    const store = standIn()
    await store.writeTask(task())
    const r = await post(store, { recorded: [], noticed: [] })
    expect([r.status, body(r).error]).toEqual([409, 'fetch the briefing first: the month is built when it is served'])
  })
})

describe('an answer the check refuses', () => {
  it('is refused with every reason, stores nothing, and after its one retry the task ends refused', async () => {
    const store = standIn()
    const ids = await ready(store)
    const bad = answer(ids, { recorded: [{ text: 'You wrote notes on 12 evenings.', factIds: [ids.note03] }] })
    const first = await post(store, bad)
    expect([first.status, first.body]).toEqual([422, { ok: false, reason: 'you recorded 1: the number 12 is not in the cited facts', retry: true }])
    const second = await post(store, bad)
    expect(body(second).retry).toBe(false)
    const t = (await store.readTask(ID)) as TaskRow
    expect([t.status, t.posts, t.refusals.length]).toEqual(['refused', 2, 2])
    expect(await writeUps(store)).toEqual([])
    expect(await events(store)).toEqual([])
    expect((await post(store, answer(ids))).status).toBe(409)
  })

  it('refuses a line of a kind switched off since the month was served', async () => {
    const store = standIn()
    const ids = await ready(store)
    put(store, 'brainPrefs', 'prefs', null, { id: 'prefs', switches: { notes: false } })
    const r = await post(store, answer(ids, { events: [] }))
    expect(body(r).reason).toBe(`you recorded 1: cites lines this month's read did not serve: ${ids.note03}, ${ids.note09}`)
  })
})

describe('the surface rules at the post', () => {
  it('refuse a private item named while names may not be shown, and pass it once they may', async () => {
    const store = standIn()
    put(store, 'privateItems', '7', null, { id: 7, name: 'Standin' })
    const ids = await ready(store)
    const named = answer(ids, { recorded: [{ text: 'You marked Standin beside a note.', factIds: [ids.note03] }] })
    expect(body(await post(store, named)).reason).toBe('you recorded 1: names a private item while "Show private items by name outside this screen" is off')
    put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: true, privateInSelection: false })
    expect((await post(store, named)).status).toBe(200)
  })
})

describe('a pattern to follow', () => {
  const noticed = (ids: Ids, follow: unknown) => answer(ids, { noticed: [{ text: 'A late dinner went with Saturdays.', factIds: [ids.day03], follow }] })

  it('is refused when the table does not hold its kind, its split or its cell', async () => {
    const store = standIn()
    const ids = await ready(store)
    expect(body(await post(store, noticed(ids, { kind: 'chip.nothing', split: 'weekday', cell: '6' }))).reason).toBe('Claude noticed 1: names a pattern the table does not hold (chip.nothing, weekday, 6): take the three from lookup=kinds and lookup=pattern, or leave "follow" out')
    expect(await writeUps(store)).toEqual([])
  })

  it('is refused when no pattern table can be read now: none, or one grown stale', async () => {
    for (const table of [null, tableAt('2026-11-10T12:00:00.000Z')]) {
      const store = standIn(undefined, table)
      const r = await post(store, noticed(await ready(store), { kind: 'chip.dinner', split: 'weekday', cell: '6' }))
      expect(body(r).reason, table ? 'stale' : 'none').toBe('Claude noticed 1: names a pattern to follow, and no pattern table can be read now: leave "follow" out')
    }
  })

  it('is found by its kind, split and cell, and answered as not held for a kind this run may not read', () => {
    const ok = { kind: 'chip.dinner', split: 'weekday', cell: '6' }
    expect(followedOf(ok, TABLE, () => true)).toEqual({ kind: 'chip.dinner', split: 'weekday', cell: '6', k: 8, n: 8, restK: 0, m: 48 })
    expect(followedOf({ ...ok, cell: '9' }, TABLE, () => true)).toContain('does not hold (chip.dinner, weekday, 9)')
    expect(followedOf({ ...ok, split: 'month' }, TABLE, () => true)).toContain('does not hold')
    expect(followedOf(ok, TABLE, () => false)).toContain('does not hold (chip.dinner, weekday, 6)')
    expect(followedOf(ok, null, () => true)).toContain('no pattern table can be read now')
  })

  it('needs no table when the answer follows nothing', async () => {
    const store = standIn(undefined, null)
    const ids = await ready(store)
    expect((await post(store, answer(ids, { noticed: [{ text: 'A late dinner went with Saturdays.', factIds: [ids.day03] }] }))).status).toBe(200)
    expect((await writeUps(store))[0].noticed[0]).not.toHaveProperty('followed')
  })
})

describe('a later reading', () => {
  it('is a new row beside the first, never over it', async () => {
    const store = standIn()
    await post(store, answer(await ready(store)))
    const later = new Date('2026-11-13T22:00:00.000Z')
    const ids = await ready(store, { now: later })
    expect((await post(store, answer(ids, { recorded: [{ text: 'A second reading of the month.', factIds: [ids.note09] }] }), later)).status).toBe(200)
    const all = await writeUps(store)
    expect(all.map((w) => [w.id, w.recorded[0].text])).toEqual([['2026-10:1', 'You wrote notes in the evening.'], ['2026-10:2', 'A second reading of the month.']])
    expect(((await store.readTask(ID)) as TaskRow).month?.reading).toBe(2)
  })

  it('is numbered among its own month’s readings, whatever another month holds', async () => {
    const store = standIn()
    const other = { id: '2026-09:3', month: '2026-09', reading: 3, at: '2026-11-12T10:00:00.000Z', day: '2026-11-12', method: 1, model: 'stand-in', builtFrom: { counts: { days: 30 }, parts: 1, lines: 90, fingerprint: 'a'.repeat(64) }, recorded: [{ text: 'A stand-in September.', days: ['2026-09-20'], kinds: ['dayRecord'] }], noticed: [] }
    await store.writeBrainRow('writeups', other.id, other.day, other, other.at)
    await post(store, answer(await ready(store)))
    expect((await writeUps(store)).map((w) => w.id).sort()).toEqual(['2026-09:3', '2026-10:1'])
  })

  it('that finds an event again writes nothing new: the first stands', async () => {
    const store = standIn()
    await post(store, answer(await ready(store)))
    const later = new Date('2026-11-13T22:00:00.000Z')
    await post(store, answer(await ready(store, { now: later }), { events: [{ type: 'yelled', factId: (await ready(store, { now: later })).note03, quote: 'raised my voice' }] }), later)
    expect((await events(store)).map((e) => [e?.id, e?.quote, e?.noticedAt])).toEqual([['checkins:18:raised-voice', 'I raised my voice at the dog again', NOW.toISOString()]])
    expect(((await store.readTask(ID)) as TaskRow).month?.events).toBe(0)
  })

  it('replaces an event’s quote when its note no longer holds the words first quoted', async () => {
    const store = standIn()
    await store.writeBrainRow('noteEvents', 'checkins:18:raised-voice', '2026-10-03', { type: 'raised-voice', note: { store: 'checkins', id: '18', day: '2026-10-03', block: 'evening' }, quote: 'words the note held before it was edited', noticedAt: '2026-11-01T10:00:00.000Z', method: 'month-1' }, '2026-11-01T10:00:00.000Z')
    await post(store, answer(await ready(store)))
    expect((await events(store)).map((e) => [e?.quote, e?.noticedAt])).toEqual([['I raised my voice at the dog again', NOW.toISOString()]])
  })
})

describe('an event the owner marked wrong', () => {
  it('does not return, whatever the run found, and the task says how many were dropped', async () => {
    const store = standIn()
    put(store, 'noteMarks', 'event:checkins:18:raised-voice', null, { id: 'event:checkins:18:raised-voice', kind: 'wrong', at: NOW.toISOString(), updatedAt: NOW.toISOString() })
    const r = await post(store, answer(await ready(store)))
    expect(r.status).toBe(200)
    expect(await events(store)).toEqual([])
    const t = (await store.readTask(ID)) as TaskRow
    expect([t.month?.events, t.month?.dropped]).toEqual([0, 1])
    // The write-up itself is kept: only the event is dropped.
    expect(await writeUps(store)).toHaveLength(1)
  })
})
