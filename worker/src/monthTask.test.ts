import { describe, expect, it } from 'vitest'
import type { EventType } from '../../src/noteEvents/types'
import { SERVED_STORE } from './claude'
import { handleMonthBriefing, handleMonthContext, keptMonth, MONTH_OTHER_READS, MONTH_READS_MOST, monthTaskIdOf, partsUnread, wrongEvents, type KeptMonth, type MonthDeps } from './monthTask'
import { monthSpan, type MonthSpan } from './month'
import { APP, memoryStore, type TaskRow } from './turso'

// The month's read as a task of the bridge (2026-11-13), on a stand-in month: its briefing, the month kept at its
// first serving, each part served and recorded, and nothing else served.

const TZ = 'America/New_York'
const env = { TIMEZONE: TZ, LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 't' } as unknown as MonthDeps['env']
const NOW = new Date('2026-11-13T20:00:00.000Z')
const FIRST = '2026-10-01'
const ID = monthTaskIdOf(FIRST)
const TYPES: EventType[] = [{ id: 'raised-voice', label: 'Raised my voice', definition: 'The note says you raised your voice at someone.', was: ['yelled'] }]

type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: NOW.toISOString(), deleted: 0, synced_at: NOW.toISOString() })
const dayAt = (n: number): string => new Date(Date.UTC(2026, 8, 25 + n)).toISOString().slice(0, 10)

/** A stand-in record from 25 September to 6 November 2026: a day row, a morning and an evening check-in each day, the evening's with a note. */
function standIn(note: (day: string) => string = (d) => `A stand-in note for ${d}.`): Mem {
  const store = memoryStore()
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
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
async function withTask(store: Mem, over: Partial<TaskRow> = {}): Promise<Mem> {
  await store.writeTask(task(over))
  return store
}
const fetcher = (async (u: string | URL | Request) => (String(u).endsWith('catalogue.json') ? new Response(JSON.stringify({ moves: [] }), { status: 200 }) : new Response('[]', { status: 200 }))) as typeof fetch
const deps = (store: Mem, now = NOW): MonthDeps => ({ env, store, now, fetcher, types: TYPES })
const url = (path: string, params: Record<string, string> = {}, base: Record<string, string> = { task: 'month', day: FIRST }) => new URL(`https://w.test${path}?${new URLSearchParams({ ...base, ...params })}`)
const briefing = (store: Mem, now = NOW) => handleMonthBriefing(deps(store, now), url('/claude/briefing'))
const read = (store: Mem, params: Record<string, string>, now = NOW) => handleMonthContext(deps(store, now), url('/claude/context', params))
const body = (r: { body: unknown }) => r.body as Record<string, unknown>
const LONG = () => 'word '.repeat(400)

describe('the month’s briefing', () => {
  it('serves the rules, the shape of the answer and the month’s parts, and keeps the month as it was built', async () => {
    const store = await withTask(standIn())
    const r = await briefing(store)
    expect(r.status).toBe(200)
    const b = body(r)
    expect(b.task).toBe('month')
    expect(String(b.instructions).split('\n')[0]).toContain('one whole month of one person\'s own record, 2026-10,')
    expect(b.briefing).toBe('MONTH 2026-10, in 1 part:\n- part 1: 2026-09-28 to 2026-11-03, 148 lines; outside the month: 2026-09-28, 2026-09-29, 2026-09-30, 2026-11-01, 2026-11-02, 2026-11-03')
    expect(Object.keys(b.answer as object)).toEqual(['recorded', 'noticed', 'events'])
    expect((b.context as { lookups: string[]; maxCalls: number }).lookups[0]).toBe('lookup=month&part=<1 to 1>: one part of the month, whole days in order, each line with its id')
    expect((b.context as { maxCalls: number }).maxCalls).toBe(1 + MONTH_OTHER_READS)
    expect(b.attemptsLeft).toBe(2)
    // Kept in the task's own served row, and what it was built from on the task: never a line of it there.
    const kept = (await store.readBrainRow<KeptMonth>(SERVED_STORE, ID)) as KeptMonth
    expect(kept.taskAt).toBe(NOW.toISOString())
    expect(kept.month.parts).toHaveLength(1)
    expect(kept.month.lines).toBe(124)
    const t = (await store.readTask(ID)) as TaskRow
    expect(t.month).toEqual({ parts: 1, served: [], other: 0, lines: 124, fingerprint: kept.month.fingerprint })
    expect(JSON.stringify(t)).not.toContain('stand-in note')
  })

  it('names every part of a month that needs more than one', async () => {
    const store = await withTask(standIn(LONG))
    const b = body(await briefing(store))
    const parts = ((await store.readTask(ID)) as TaskRow).month?.parts ?? 0
    expect(parts).toBeGreaterThan(1)
    expect(String(b.briefing).split('\n')).toHaveLength(parts + 1)
    expect(String(b.briefing).split('\n')[0]).toBe(`MONTH 2026-10, in ${parts} parts:`)
    expect((b.context as { maxCalls: number }).maxCalls).toBe(parts + 4)
    expect(String(b.instructions)).toContain(`lookup=month&part=1 to lookup=month&part=${parts}.`)
  })

  it('serves the kept month again, as it was first built, whatever the record has become since', async () => {
    const store = await withTask(standIn())
    await briefing(store)
    const first = ((await store.readTask(ID)) as TaskRow).month?.fingerprint
    put(store, 'checkins', '46', '2026-10-17', { id: 46, day: '2026-10-17', block: 'evening', answers: {}, extras: { note: 'Words written after the month was first served.' }, completedAt: '2026-10-17T23:00:00.000Z' })
    await briefing(store)
    expect(((await store.readTask(ID)) as TaskRow).month?.fingerprint).toBe(first)
    const part = body(await read(store, { lookup: 'month', part: '1' }))
    expect(JSON.stringify(part.facts)).not.toContain('Words written after')
    expect(JSON.stringify(part.facts)).toContain('A stand-in note for 2026-10-17.')
  })

  it('builds the month afresh for a task started again', async () => {
    const store = await withTask(standIn())
    await briefing(store)
    const first = ((await store.readTask(ID)) as TaskRow).month?.fingerprint
    put(store, 'checkins', '46', '2026-10-17', { id: 46, day: '2026-10-17', block: 'evening', answers: {}, extras: { note: 'Words written before the second start.' }, completedAt: '2026-10-17T23:00:00.000Z' })
    const later = new Date('2026-11-14T20:00:00.000Z')
    await store.writeTask(task({ at: later.toISOString() }))
    await briefing(store, later)
    expect(((await store.readTask(ID)) as TaskRow).month?.fingerprint).not.toBe(first)
  })

  it('serves nothing of a month that was not read whole, and the task ends saying why', async () => {
    const store = await withTask(standIn())
    const real = store.countRecords.bind(store)
    store.countRecords = async (s, range) => (await real(s, range)) + (s === 'offers' ? 2 : 0)
    const r = await briefing(store)
    expect(r.status).toBe(409)
    expect(body(r).error).toBe('the month 2026-10 was not read whole: 0 of 2 rows of offers')
    const t = (await store.readTask(ID)) as TaskRow
    expect([t.status, t.fallbackReason]).toEqual(['fallback', 'the month 2026-10 was not read whole: 0 of 2 rows of offers'])
    expect(await store.readBrainRow(SERVED_STORE, ID)).toBeNull()
  })

  it('is refused for another task’s name, a day that is no month’s first, no open task, and no attempt left', async () => {
    const store = await withTask(standIn())
    expect((await handleMonthBriefing(deps(store), url('/claude/briefing', {}, { task: 'ask', day: FIRST }))).status).toBe(400)
    expect(body(await handleMonthBriefing(deps(store), url('/claude/briefing', {}, { task: 'month', day: '2026-10-15' }))).error).toBe('day must be the first day of a month, YYYY-MM-01')
    expect(body(await handleMonthBriefing(deps(store), url('/claude/briefing', {}, { task: 'month', day: '2026-09-01' }))).error).toBe('no month task is open for 2026-09')
    expect(body(await briefing(await withTask(standIn(), { status: 'written' }))).error).toBe('no month task is open for 2026-10')
    expect(body(await briefing(await withTask(standIn(), { posts: 2 }))).error).toBe('no attempts left')
  })
})

describe('a part of the month', () => {
  it('is served as ids and words alone, recorded on the task, and logged by its count and size', async () => {
    const store = await withTask(standIn())
    await briefing(store)
    const r = await read(store, { lookup: 'month', part: '1' })
    expect(r.status).toBe(200)
    const b = body(r) as { part: number; parts: number; days: string[]; outside: string[]; lines: number; facts: Record<string, unknown>[] }
    expect([b.part, b.parts, b.lines, b.days.length, b.outside.length]).toEqual([1, 1, 148, 37, 6])
    expect(b.facts).toHaveLength(148)
    for (const f of b.facts) expect(Object.keys(f)).toEqual(['id', 'text'])
    const t = (await store.readTask(ID)) as TaskRow
    expect(t.month?.served).toEqual([1])
    expect(t.contextCalls).toBe(1)
    expect(t.contextBytes).toBeGreaterThan(1000)
    const [logged] = await store.readReads(5)
    expect(logged).toMatchObject({ task: 'month', category: 'lookup.month', count: 148, bytes: t.contextBytes, via: 'context' })
    expect(JSON.stringify(logged)).not.toContain('stand-in note')
  })

  it('served twice is recorded once, and the parts not yet served are known', async () => {
    const store = await withTask(standIn(LONG))
    await briefing(store)
    const parts = ((await store.readTask(ID)) as TaskRow).month?.parts ?? 0
    await read(store, { lookup: 'month', part: '2' })
    await read(store, { lookup: 'month', part: '2' })
    const t = (await store.readTask(ID)) as TaskRow
    expect(t.month?.served).toEqual([2])
    expect(t.contextCalls).toBe(2)
    expect(partsUnread(t)).toEqual(Array.from({ length: parts }, (_, i) => i + 1).filter((p) => p !== 2))
    for (let p = 1; p <= parts; p++) await read(store, { lookup: 'month', part: String(p) })
    expect(partsUnread((await store.readTask(ID)) as TaskRow)).toEqual([])
    expect(partsUnread({})).toEqual([])
  })

  it('stays recorded when the briefing is fetched again', async () => {
    const store = await withTask(standIn())
    await briefing(store)
    await read(store, { lookup: 'month', part: '1' })
    await read(store, { lookup: 'kinds' })
    await briefing(store)
    expect(((await store.readTask(ID)) as TaskRow).month).toMatchObject({ served: [1], other: 1 })
  })

  it('is refused before the briefing, out of range, and with a parameter that is not its own', async () => {
    const store = await withTask(standIn())
    expect(body(await read(store, { lookup: 'month', part: '1' })).error).toBe('fetch the briefing first: the month is built when it is served')
    await briefing(store)
    for (const part of ['0', '2', '1.5', 'one', '']) expect(body(await read(store, { lookup: 'month', part })).error, part).toBe('part must be a whole number from 1 to 1')
    expect(body(await read(store, { lookup: 'month', part: '1', from: '2026-01-01' })).error).toBe('unknown parameter "from" for the lookup month')
  })
})

describe('what else the month task is served', () => {
  it('is the pattern table’s kinds and cells, four reads at most, and no other lookup or category', async () => {
    const store = await withTask(standIn())
    await briefing(store)
    for (const params of [{ lookup: 'day', date: '2026-10-17' }, { lookup: 'noteWords', q: 'stand-in' }, { category: 'notes' }, {}]) {
      const r = await read(store, params as Record<string, string>)
      expect([r.status, body(r).error], JSON.stringify(params)).toEqual([403, 'the month task is served the lookups month, kinds and pattern, and nothing else'])
    }
    expect(MONTH_OTHER_READS).toBe(4)
    expect(MONTH_READS_MOST).toBe(20)
    for (let i = 0; i < 4; i++) expect((await read(store, { lookup: 'kinds' })).status, `read ${i + 1}`).toBe(200)
    const t = (await store.readTask(ID)) as TaskRow
    expect(t.month?.other).toBe(4)
    expect(t.month?.served).toEqual([])
    const fifth = await read(store, { lookup: 'pattern', kind: 'sleep.short' })
    expect([fifth.status, body(fifth).error]).toEqual([429, 'at most 4 reads beside the month\'s own parts'])
    // The month's own parts are not counted among them.
    expect((await read(store, { lookup: 'month', part: '1' })).status).toBe(200)
    expect((await store.readReads(10)).map((x) => x.category).sort()).toEqual(['lookup.kinds', 'lookup.kinds', 'lookup.kinds', 'lookup.kinds', 'lookup.month'])
  })
})

describe('the events marked wrong', () => {
  const SPAN = monthSpan(FIRST) as MonthSpan
  const eventRow = (id: string, day: string, type = 'yelled') => ({ type, note: { store: 'checkins', id: '46', day, block: 'evening' }, quote: `A stand-in note for ${day}.`, noticedAt: '2026-11-13T22:00:00.000Z', method: 'month-1' })
  async function seeded(): Promise<Mem> {
    const store = await withTask(standIn())
    await store.writeBrainRow('noteEvents', 'checkins:46:raised-voice', '2026-10-17', eventRow('a', '2026-10-17'), NOW.toISOString())
    await store.writeBrainRow('noteEvents', 'checkins:50:raised-voice', '2026-10-19', eventRow('b', '2026-10-19'), NOW.toISOString())
    await store.writeBrainRow('noteEvents', 'checkins:10:raised-voice', '2026-09-29', eventRow('c', '2026-09-29'), NOW.toISOString())
    const mark = (eventId: string) => put(store, 'noteMarks', `event:${eventId}`, null, { id: `event:${eventId}`, kind: 'wrong', at: NOW.toISOString(), updatedAt: NOW.toISOString() })
    mark('checkins:46:raised-voice')
    mark('checkins:10:raised-voice')
    return store
  }

  it('are the month’s own, each under its type’s name today, and no event that was not marked', async () => {
    expect(await wrongEvents(await seeded(), SPAN, TYPES)).toEqual([{ type: 'raised-voice', day: '2026-10-17', quote: 'A stand-in note for 2026-10-17.' }])
  })

  it('are handed to the read in its instructions', async () => {
    const b = body(await briefing(await seeded()))
    expect(String(b.instructions)).toContain('MARKED WRONG by the person, never to be tagged again:\n- raised-voice on 2026-10-17: “A stand-in note for 2026-10-17.”')
    expect(String(body(await briefing(await withTask(standIn()))).instructions)).not.toContain('MARKED WRONG')
  })
})

describe('the kept month', () => {
  it('is none before the briefing, and none for a task started at another moment', async () => {
    const store = await withTask(standIn())
    expect(await keptMonth(store, task())).toBeNull()
    await briefing(store)
    expect((await keptMonth(store, task()))?.month.span.month).toBe('2026-10')
    expect(await keptMonth(store, task({ at: '2026-11-14T20:00:00.000Z' }))).toBeNull()
  })
})
