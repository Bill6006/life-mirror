import { describe, expect, it } from 'vitest'
import { pathTaskIdOf } from '../../src/pathJob'
import type { EventType } from '../../src/noteEvents/types'
import { buildMonth } from './month'
import { STAND_IN_NOTES, standInFirst, standInStore } from './monthStandIn'
import { handleMonthBriefing, handleMonthContext, handleMonthLine, monthHandIdOf, monthSwitchOn, monthTaskIdOf, runMonths, setMonthSwitch, type MonthDeps, type MonthsEnv } from './monthTask'
import { accessFor, gatesFrom, type Catalogue } from './retrieval'
import { readBrainPrefs } from '../../src/brainShared'
import { APP, memoryStore, type TaskRow } from './turso'

// The monthly read's schedule, its switch, and the run by hand on a stand-in month (2026-11-13), on stand-in records.

const TZ = 'America/New_York'
const env = { TIMEZONE: TZ, LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 't' } as unknown as MonthsEnv
/** 13 November 2026, 15:00 in New York. */
const NOW = new Date('2026-11-13T20:00:00.000Z')
const TODAY = '2026-11-13'
const TYPES: EventType[] = [{ id: 'raised-voice', label: 'Raised my voice', definition: 'The note says you raised your voice at someone.' }]

type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown, deleted = 0) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: NOW.toISOString(), deleted, synced_at: NOW.toISOString() })
const dayAt = (n: number): string => new Date(Date.UTC(2026, 8, 25 + n)).toISOString().slice(0, 10)

/** The owner's stand-in record, 25 September to 6 November 2026: it holds September, October and November. */
function record(): Mem {
  const store = memoryStore()
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
  let id = 1
  for (let n = 0; n < 43; n++) {
    const day = dayAt(n)
    put(store, 'days', day, day, { day })
    put(store, 'checkins', String(id), day, { id: id++, day, block: 'evening', answers: {}, extras: { note: 'WORDS OF THE REAL RECORD' }, completedAt: `${day}T23:00:00.000Z` })
  }
  return store
}
async function switched(store: Mem = record()): Promise<Mem> {
  await setMonthSwitch(store, true, NOW)
  return store
}
function firing(status = 200) {
  const texts: string[] = []
  const fetcher = (async (_u: string | URL | Request, init?: RequestInit) => {
    texts.push(String((JSON.parse(String(init?.body)) as { text: string }).text))
    return new Response(JSON.stringify(status === 200 ? { claude_code_session_url: 'https://claude.ai/code/session_s' } : { error: { message: 'limited' } }), { status })
  }) as typeof fetch
  return { texts, fetcher }
}
const run = (store: Mem, f = firing(), over: Parameters<typeof runMonths>[3] = {}, now = NOW, e = env) => runMonths(e, store, now, { fireFetcher: f.fetcher, ...over })
const writeUp = (month: string) => ({ id: `${month}:1`, month, reading: 1, at: '2026-11-13T15:00:00.000Z', day: TODAY, method: 1, model: 'stand-in', builtFrom: { counts: { days: 30 }, parts: 1, lines: 90, fingerprint: 'a'.repeat(64) }, recorded: [{ text: 'A stand-in month.', days: [`${month}-20`], kinds: ['dayRecord'] }], noticed: [] })
const taskRow = (id: string, day: string, over: Partial<TaskRow> = {}): TaskRow => ({ id, kind: 'task', task: 'month', day, at: NOW.toISOString(), status: 'fired', trigger: 'ask', factsDay: day, askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 0, refusals: [], ...over })
const catalogueFetcher = (async (u: string | URL | Request) => (String(u).endsWith('catalogue.json') ? new Response(JSON.stringify({ moves: [] }), { status: 200 }) : new Response('[]', { status: 200 }))) as typeof fetch
const deps = (store: Mem, gate: 'gated' | 'open' = 'open', now = NOW): MonthDeps => ({ env, store, now, fetcher: catalogueFetcher, types: TYPES, gate })
const url = (path: string, day: string, params: Record<string, string> = {}) => new URL(`https://w.test${path}?${new URLSearchParams({ task: 'month', day, ...params })}`)
const body = (r: { body: unknown }) => r.body as Record<string, unknown>

describe('the monthly read starts nothing', () => {
  it('while its gate is closed, while Claude is off, while its switch is not set, or while it is switched off in Settings', async () => {
    const f = firing()
    expect(await run(record(), f, { gate: 'gated' })).toEqual({ ran: false, reason: 'gated' })
    expect(await run(await switched(), f, {}, NOW, { ...env, CLAUDE_WRITER: 'off' } as MonthsEnv)).toEqual({ ran: false, reason: 'Claude is off' })
    expect(await run(record(), f)).toEqual({ ran: false, reason: 'the monthly read is not switched on yet' })
    const off = await switched()
    put(off, 'brainPrefs', 'prefs', null, { id: 'prefs', monthlyRead: false })
    expect(await run(off, f)).toEqual({ ran: false, reason: 'the monthly read is switched off in Settings' })
    expect(f.texts).toEqual([])
  })

  it('between 9:00 and 11:30', async () => {
    const f = firing()
    expect(await run(await switched(), f, {}, new Date('2026-11-13T15:00:00.000Z'))).toEqual({ ran: false, reason: 'quiet hours: 9:00 to 11:30 keep the window for the day’s line', day: TODAY })
    expect(f.texts).toEqual([])
  })

  it('while another run of the routine is under way: the day’s line, an answer to a question, a Path being drafted', async () => {
    for (const id of [`task:${TODAY}:line`, `task:${TODAY}:ask`, pathTaskIdOf(TODAY, 'path')]) {
      const store = await switched()
      await store.writeTask({ ...taskRow(id, TODAY), task: 'line' })
      expect((await run(store)).reason, id).toBe('waiting for the Brain’s run under way')
    }
  })
})

describe('the month the schedule reads', () => {
  it('is the oldest month owed: the task is marked, then the routine fired with no personal text', async () => {
    const store = await switched()
    const f = firing()
    expect(await run(store, f)).toEqual({ ran: true, reason: 'Claude is reading the month', day: '2026-09-01', task: 'task:2026-09-01:month' })
    expect(f.texts).toEqual(['Life Mirror bridge: task=month day=2026-09-01 model=opus. Read CLAUDE.md in this repository and do exactly what it says, then stop.'])
    const t = (await store.readTask(monthTaskIdOf('2026-09-01'))) as TaskRow
    expect([t.task, t.status, t.trigger, t.dry, t.month?.tries]).toEqual(['month', 'fired', 'ask', undefined, { day: TODAY, n: 1 }])
  })

  it('is never one that has a write-up, nor the month still under way', async () => {
    const store = await switched()
    await store.writeBrainRow('writeups', '2026-09:1', TODAY, writeUp('2026-09'), NOW.toISOString())
    expect((await run(store)).day).toBe('2026-10-01')
    const done = await switched()
    for (const m of ['2026-09', '2026-10']) await done.writeBrainRow('writeups', `${m}:1`, TODAY, writeUp(m), NOW.toISOString())
    expect(await run(done)).toEqual({ ran: false, reason: 'no month is waiting to be read', day: TODAY })
  })

  it('waits while a month is being read, lets a run past its time go, and tries that month again', async () => {
    const store = await switched()
    await run(store)
    expect(await run(store, firing(), {}, new Date(NOW.getTime() + 5 * 60_000))).toEqual({ ran: false, reason: 'a month is being read', day: TODAY })
    const later = new Date(NOW.getTime() + 25 * 60_000)
    expect((await run(store, firing(), {}, later)).task).toBe('task:2026-09-01:month')
    const t = (await store.readTask(monthTaskIdOf('2026-09-01'))) as TaskRow
    expect([t.status, t.month?.tries, t.fires]).toEqual(['fired', { day: TODAY, n: 2 }, 2])
  })

  it('lets a run past its time go even when its month is not tried again today', async () => {
    const store = await switched()
    const stale = new Date(NOW.getTime() - 25 * 60_000).toISOString()
    await store.writeTask(taskRow(monthTaskIdOf('2026-09-01'), '2026-09-01', { at: stale, firedAt: stale, month: { parts: 1, served: [], other: 0, lines: 10, fingerprint: 'x', tries: { day: TODAY, n: 3 } } }))
    expect((await run(store)).day).toBe('2026-10-01')
    const t = (await store.readTask(monthTaskIdOf('2026-09-01'))) as TaskRow
    expect([t.status, t.fallbackReason]).toEqual(['fallback', 'no valid line from Claude within 20 minutes'])
  })

  it('goes on to the next month once a month’s three tries of the day are used', async () => {
    const store = await switched()
    await store.writeTask(taskRow(monthTaskIdOf('2026-09-01'), '2026-09-01', { status: 'refused', month: { parts: 1, served: [1], other: 0, lines: 10, fingerprint: 'x', tries: { day: TODAY, n: 3 } } }))
    expect((await run(store)).day).toBe('2026-10-01')
    // Tried yesterday, it is tried again today.
    const fresh = await switched()
    await fresh.writeTask(taskRow(monthTaskIdOf('2026-09-01'), '2026-09-01', { status: 'refused', month: { parts: 1, served: [1], other: 0, lines: 10, fingerprint: 'x', tries: { day: '2026-11-12', n: 3 } } }))
    expect((await run(fresh)).day).toBe('2026-09-01')
  })

  it('is none once two months were read today', async () => {
    const store = await switched()
    put(store, 'days', '2026-08-15', '2026-08-15', { day: '2026-08-15' })
    for (const m of ['2026-08', '2026-09']) {
      await store.writeBrainRow('writeups', `${m}:1`, TODAY, writeUp(m), NOW.toISOString())
      await store.writeTask(taskRow(monthTaskIdOf(`${m}-01`), `${m}-01`, { status: 'written', writtenAt: '2026-11-13T18:00:00.000Z' }))
    }
    expect(await run(store)).toEqual({ ran: false, reason: '2 months are read a day at most', day: TODAY })
    // Written yesterday, they do not count against today.
    for (const m of ['2026-08', '2026-09']) await store.writeTask(taskRow(monthTaskIdOf(`${m}-01`), `${m}-01`, { status: 'written', writtenAt: '2026-11-12T18:00:00.000Z' }))
    expect((await run(store)).day).toBe('2026-10-01')
  })

  it('ends the try when the fire fails, and says why', async () => {
    const store = await switched()
    const r = await run(store, firing(429))
    expect([r.ran, r.reason, r.task]).toEqual([false, 'the routine is limited (429)', 'task:2026-09-01:month'])
    const t = (await store.readTask(monthTaskIdOf('2026-09-01'))) as TaskRow
    expect([t.status, t.fallbackReason, t.month?.tries?.n]).toEqual(['fallback', 'the routine is limited (429)', 1])
  })
})

describe('the plan', () => {
  it('says what the schedule would do now, by months and states alone, and does nothing', async () => {
    const store = record()
    await store.writeBrainRow('writeups', '2026-09:1', TODAY, writeUp('2026-09'), NOW.toISOString())
    const f = firing()
    expect(await run(store, f, { plan: true })).toEqual({ ran: false, reason: 'would read 2026-10', day: TODAY, switchedOn: false, months: ['2026-09', '2026-10', '2026-11'], written: ['2026-09'] })
    expect(f.texts).toEqual([])
    expect(await store.readTask(monthTaskIdOf('2026-10-01'))).toBeNull()
    await setMonthSwitch(store, true, NOW)
    expect((await run(store, f, { plan: true })).switchedOn).toBe(true)
    expect(f.texts).toEqual([])
  })
})

describe('the switch', () => {
  it('is off until it is set, and can be set back', async () => {
    const store = record()
    expect(await monthSwitchOn(store)).toBe(false)
    await setMonthSwitch(store, true, NOW)
    expect(await monthSwitchOn(store)).toBe(true)
    await setMonthSwitch(store, false, new Date(NOW.getTime() + 1000))
    expect(await monthSwitchOn(store)).toBe(false)
  })
})

describe('a run by hand', () => {
  /** The run started by hand, its briefing fetched and every part read; the stand-in month's lines. */
  async function started(store: Mem): Promise<{ first: string; lines: { id: string; text: string }[] }> {
    const f = firing()
    const r = await run(store, f, { dry: true, gate: 'gated' })
    const first = String(r.day)
    await handleMonthBriefing(deps(store, 'gated'), url('/claude/briefing', first))
    const parts = ((await store.readTask(monthHandIdOf(first))) as TaskRow).month?.parts ?? 0
    const lines: { id: string; text: string }[] = []
    for (let p = 1; p <= parts; p++) lines.push(...(body(await handleMonthContext(deps(store, 'gated'), url('/claude/context', first, { lookup: 'month', part: String(p) }))).facts as { id: string; text: string }[]))
    return { first, lines }
  }
  const inside = (lines: { id: string; text: string }[], words: string) => lines.find((l) => l.id.startsWith('day.2026-10-') && l.text.includes(words))?.id ?? ''
  const post = (store: Mem, first: string, answer: unknown) => handleMonthLine(deps(store, 'gated'), { task: 'month', day: first, answer, writtenModel: 'claude-stand-in', runnerModel: 'runner' })

  it('reads a stand-in month under an id of its own, past the gate and the switch, and nothing of the owner’s record', async () => {
    const store = record()
    const f = firing()
    expect(await run(store, f, { dry: true, gate: 'gated' })).toEqual({ ran: true, reason: 'Claude is reading the month', day: '2026-10-01', task: 'task:2026-10-01:month.hand' })
    expect(f.texts[0]).toContain('task=month day=2026-10-01 model=opus.')
    const t = (await store.readTask(monthHandIdOf('2026-10-01'))) as TaskRow
    expect([t.dry, t.forced, t.trigger, t.status]).toEqual([true, true, 'forced', 'fired'])
    expect(await store.readTask(monthTaskIdOf('2026-10-01'))).toBeNull()
    const b = await handleMonthBriefing(deps(store, 'gated'), url('/claude/briefing', '2026-10-01'))
    expect(b.status).toBe(200)
    const part = body(await handleMonthContext(deps(store, 'gated'), url('/claude/context', '2026-10-01', { lookup: 'month', part: '1' })))
    const served = JSON.stringify(part.facts)
    expect(served).toContain('I raised my voice in traffic on the way home.')
    expect(served).not.toContain('WORDS OF THE REAL RECORD')
    // Logged as a run by hand.
    expect((await store.readReads(5))[0]).toMatchObject({ task: 'month', category: 'lookup.month', dry: true })
  })

  it('is checked like any, and stores nothing the phone reads', async () => {
    const store = record()
    const { first, lines } = await started(store)
    const note = inside(lines, 'I raised my voice in traffic')
    const good = { recorded: [{ text: 'You wrote of a loud drive home.', factIds: [note] }], noticed: [], events: [{ type: 'raised-voice', factId: note, quote: 'I raised my voice in traffic' }] }
    const r = await post(store, first, good)
    expect([r.status, r.body]).toEqual([200, { ok: true, dry: true }])
    expect(await store.readBrainRows('writeups', 10)).toEqual([])
    expect(await store.readBrainRows('noteEvents', 10)).toEqual([])
    const t = (await store.readTask(monthHandIdOf(first))) as TaskRow
    expect([t.status, t.month?.reading, t.month?.events]).toEqual(['written', undefined, 0])
    // And a run by hand that fails the check is refused like any.
    const again = record()
    const s = await started(again)
    const bad = await post(again, s.first, { recorded: [{ text: 'You wrote of 12 loud drives.', factIds: [inside(s.lines, 'I raised my voice in traffic')] }], noticed: [] })
    expect([bad.status, body(bad).reason]).toEqual([422, 'you recorded 1: the number 12 is not in the cited facts'])
  })
})

describe('closed, the handlers', () => {
  it('serve a run by hand and nothing else', async () => {
    const store = record()
    await store.writeTask(taskRow(monthTaskIdOf('2026-10-01'), '2026-10-01'))
    const r = await handleMonthBriefing(deps(store, 'gated'), url('/claude/briefing', '2026-10-01'))
    expect([r.status, body(r).error]).toEqual([403, 'the monthly read is not switched on'])
    expect((await handleMonthBriefing(deps(store, 'open'), url('/claude/briefing', '2026-10-01'))).status).toBe(200)
  })
})

describe('the stand-in month', () => {
  it('is the newest month whose three days after it have all passed', () => {
    expect(standInFirst('2026-11-13')).toBe('2026-10-01')
    expect(standInFirst('2026-11-04')).toBe('2026-10-01')
    expect(standInFirst('2026-11-03')).toBe('2026-09-01')
    expect(standInFirst('2027-01-02')).toBe('2026-11-01')
    expect(standInFirst('2027-01-20')).toBe('2026-12-01')
  })

  it('is a record the month’s build reads whole, with notes that are nobody’s', async () => {
    const store = standInStore('2026-10-01')
    const catalogue = new Map() as unknown as Catalogue
    const b = await buildMonth({ store, catalogue, a: accessFor('deep', gatesFrom(await store.readRecord('settings', '1')), readBrainPrefs(null)), day: TODAY, now: NOW, timeZone: TZ, showPrivate: false, question: '' }, '2026-10-01')
    expect(b.ok).toBe(true)
    if (!b.ok) return
    expect(b.counts).toMatchObject({ days: 37, checkins: 74 })
    const notes = b.parts.flatMap((p) => p.facts).filter((f) => f.text.includes('you wrote'))
    // Two evenings in three hold a note: 25 of 37.
    expect(notes).toHaveLength(25)
    for (const f of notes) expect(STAND_IN_NOTES.some((n) => f.text.includes(n)), f.text).toBe(true)
    expect(standInStore('2026-10-15').readRecords('days')).resolves.toEqual([])
  })
})
