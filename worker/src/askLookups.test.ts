import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { answerIdOf, askTaskIds } from '../../src/ask/shared'
import type { AskTurn } from '../../src/ask/types'
import { storedPatterns } from '../../src/counted/patterns'
import { patternTable } from '../../src/counted/table'
import { checkin, day as dayN, input } from '../../src/counted/testing'
import type { Fact, FactSheet } from '../../src/factTypes'
import { handleAskBriefing, handleAskContext, handleAskLine, runAsks, withLookups } from './ask'
import { handleContext, SERVED_STORE, taskIdOf } from './claude'
import { askInstructions } from './prompt'
import { APP, BRAIN_APP, memoryStore } from './turso'

// Ask's lookups end to end (2026-11-13), on stand-in records: a run asks a lookup through the bridge, cites a fact it
// was served, and its answer is checked against the day's sheet and the lookups together, by the one checker.

const TZ = 'America/New_York'
const env = { TIMEZONE: TZ, FALLBACK_TIME: '11:00', LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 'fire-token', CLAUDE_TIMEOUT_MINUTES: '20' }
const DAY = '2026-11-12'
/** New York local times (UTC−5 in November). */
const at = (hhmm: string) => new Date(`${DAY}T${String(Number(hhmm.slice(0, 2)) + 5).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)

type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown, when = `${DAY}T12:00:00.000Z`) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: when, deleted: 0, synced_at: when })

// Eight weeks of evenings: a late dinner on the eight Saturdays alone, and a nap on five scattered evenings.
const A = 250
const saturday = (n: number): boolean => new Date(2026, 0, 1 + n).getDay() === 6
const TABLE = storedPatterns(patternTable(input({ checkins: Array.from({ length: 56 }, (_, i) => checkin(A + i, 'evening', { extras: { ...(saturday(A + i) ? { dinner: true } : {}), ...([3, 11, 20, 34, 47].includes(i) ? { napped: true } : {}) } })) }), dayN(A + 56)), `${DAY}T12:00:00.000Z`)

const SHEET: FactSheet = {
  version: 1,
  day: DAY,
  builtAt: `${DAY}T12:41:00.000Z`,
  hour: 7,
  weeks: 8,
  days: 56,
  direction: null,
  said: [],
  checkedIn: { morning: `${DAY}T12:40:00.000Z` },
  facts: [
    { id: 'week.today', tags: ['cue'], text: 'Today is Thursday; a daycare day.', values: {} },
    { id: 'record', tags: [], text: 'The record holds 56 days.', values: { days: 56 } },
  ],
} as FactSheet

function record(): Mem {
  const store = memoryStore()
  put(store, 'facts', DAY, DAY, { day: DAY, builtAt: SHEET.builtAt, updatedAt: SHEET.builtAt, sheet: SHEET }, SHEET.builtAt)
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
  put(store, 'patterns', 'table', null, TABLE)
  put(store, 'checkins', '900', '2026-11-10', { id: 900, day: '2026-11-10', block: 'evening', completedAt: '2026-11-11T01:00:00.000Z', answers: {}, extras: { note: 'walked 17 blocks home' } })
  void store.writeBrief({ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'x', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: at('07:48').toISOString(), factsDay: DAY, refusals: [], writer: 'claude', forDay: DAY }, at('07:48').toISOString())
  void store.writeTask({ id: taskIdOf('coach', DAY), kind: 'task', task: 'coach', day: DAY, at: at('07:50').toISOString(), status: 'written', trigger: 'checkin', factsDay: DAY, askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 1, refusals: [] })
  return store
}

let seq = 1_770_000_000_000
function asked(store: Mem, question: string): AskTurn & { id: number } {
  const id = seq++
  const turn: AskTurn & { id: number } = { id, threadId: id, day: DAY, at: at('09:00').toISOString(), question, tier: 'standard', state: 'waiting', kind: 'typed', version: 'v', cited: [], updatedAt: at('09:00').toISOString() }
  put(store, 'askTurns', String(id), turn.day, turn)
  return turn
}

const fetcher = (async (u: string | URL | Request) => {
  const href = String(u)
  if (href.endsWith('library.json')) return new Response('[]', { status: 200 })
  if (href.endsWith('catalogue.json')) return new Response(JSON.stringify({ moves: [] }), { status: 200 })
  return new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_s' }), { status: 200 })
}) as typeof fetch
const deps = (store: Mem, now: Date) => ({ env, store, now, gate: 'open' as const, fetcher })
const url = (path: string, params: Record<string, string>) => new URL(`https://w.test${path}?${new URLSearchParams({ task: 'ask', day: DAY, ...params })}`)
const briefing = (store: Mem, now: Date) => handleAskBriefing(deps(store, now), url('/claude/briefing', {}))
const read = (store: Mem, now: Date, params: Record<string, string>) => handleAskContext(deps(store, now), url('/claude/context', params))
const post = (store: Mem, now: Date, answer: unknown) => handleAskLine(deps(store, now), { task: 'ask', day: DAY, answer, askedModel: 'opus', writtenModel: 'claude-fable-5-2', runnerModel: 'claude-haiku-5-5' })
const answerOf = (store: Mem, turnId: number) => JSON.parse(store.rows.get(`${BRAIN_APP}|askAnswers|${answerIdOf(turnId)}`)?.body ?? 'null')
const servedOf = (store: Mem) => JSON.parse(store.rows.get(`${BRAIN_APP}|${SERVED_STORE}|${askTaskIds(DAY)[0]}`)?.body ?? 'null')
const reason = (r: { body: unknown }) => (r.body as { reason: string }).reason

/** A question asked, its run started, its briefing read: ready for its reads. */
async function started(question = 'When am I most likely to have a late dinner?'): Promise<{ store: Mem; turn: AskTurn & { id: number } }> {
  const store = record()
  const turn = asked(store, question)
  expect(await runAsks(env, store, at('09:01'), { gate: 'open', fireFetcher: fetcher })).toMatchObject({ ran: true, turn: turn.id })
  expect((await briefing(store, at('09:02'))).status).toBe(200)
  return { store, turn }
}

const SATURDAY = 'pattern.chip.dinner.weekday.6'
const MONDAY = 'pattern.chip.dinner.weekday.1'
const GOOD = { text: 'Late dinners cluster on Saturdays, and in your record that stands as a steady pattern.\n\nIt was recorded on 8 of 8 Saturdays, against 0 of 48 other days.', factIds: [SATURDAY], cardIds: [], test: null, note: false }

describe('the briefing', () => {
  it('lists the eight lookups a run may ask for, each with its parameters, beside the categories', async () => {
    const { store } = await started()
    const b = (await briefing(store, at('09:02'))).body as { context: { lookups: string[]; categories: string[] }; instructions: string }
    expect(b.context.lookups).toHaveLength(8)
    expect(b.context.lookups[0]).toBe('lookup=kinds (optional q, a keyword): what the record counts, each with its id; and what it deliberately does not count')
    expect(b.context.lookups.map((l) => l.split(/[ &]/)[0])).toEqual(['lookup=kinds', 'lookup=pattern', 'lookup=day', 'lookup=moves', 'lookup=workouts', 'lookup=pathSteps', 'lookup=lines', 'lookup=forecasts'])
    expect(b.context.categories).toContain('notes')
    // The briefing prints the day's sheet alone: nothing of the table is on it.
    expect(JSON.stringify(b)).not.toContain('pattern.chip')
  })

  it('tells the writer how a lookup’s facts differ from a category’s lines, and how a counted pattern is said', () => {
    for (const task of ['ask', 'deep'] as const) {
      const text = askInstructions(task, 120, null)
      expect(text).toContain("A category's lines (category=) may change what you say but are never cited, and no number may rest on them.")
      expect(text).toContain("A lookup's facts (lookup=) each have an id in brackets: cite them in factIds beside the FACTS ids, and a number in a cited lookup fact may be said.")
      expect(text).toContain('is answered from the pattern table, never from a count of your own')
      expect(text).toContain('"Most likely", "most often", "usually" and "tends to" only when a cited cell stands as a steady pattern.')
      expect(text).toContain('A count written "7 of 26" counts as one number for the limits on numbers.')
    }
  })
})

describe('a lookup through the bridge', () => {
  it('answers with facts, counts as one of the run’s reads, is kept with the served sheet and logged by count and size', async () => {
    const { store } = await started()
    const kinds = await read(store, at('09:03'), { lookup: 'kinds', q: 'dinner' })
    expect(kinds.status).toBe(200)
    expect(kinds.body).toMatchObject({ lookup: 'kinds', complete: true, notRead: 0 })
    expect((kinds.body as { facts: { id: string; text: string }[] }).facts).toEqual([{ id: 'kinds.chip.dinner', text: 'A late or heavy dinner: counted by the day; recorded at 8 of 56 it can speak for. Its pattern: lookup=pattern&kind=chip.dinner.' }])
    const pattern = await read(store, at('09:04'), { lookup: 'pattern', kind: 'chip.dinner' })
    const facts = (pattern.body as { facts: { id: string; text: string }[] }).facts
    expect(facts.map((f) => f.id)).toEqual(expect.arrayContaining(['pattern.chip.dinner.all', SATURDAY, MONDAY]))
    // The reply carries each fact's id and words; its values stay with the Worker, for the check.
    expect(Object.keys(facts[0]).sort()).toEqual(['id', 'text'])
    const task = await store.readTask(askTaskIds(DAY)[0])
    expect(task?.contextCalls).toBe(2)
    expect(task?.contextBytes).toBeGreaterThan(500)
    const kept = servedOf(store).lookups as Fact[]
    expect(kept.map((f) => f.id)).toEqual(expect.arrayContaining(['kinds.chip.dinner', SATURDAY]))
    expect(kept.find((f) => f.id === SATURDAY)?.values).toMatchObject({ k: 8, n: 8, restK: 0, m: 48, standing: 'pattern', category: 'dayRecord' })
    // The served sheet itself is untouched: the lookups ride beside it.
    expect(servedOf(store).sheet.facts.map((f: Fact) => f.id)).toEqual(['week.today', 'record'])
    const reads = (await store.readReads(10)).filter((r) => r.category.startsWith('lookup.'))
    expect(reads.map((r) => r.category).sort()).toEqual(['lookup.kinds', 'lookup.pattern'])
    expect(reads.every((r) => r.task === 'ask' && r.via === 'context' && r.count > 0 && r.bytes > 0)).toBe(true)
    expect(JSON.stringify(reads)).not.toContain('dinner')
  })

  it('refuses an unknown lookup or parameter, and stops at the run’s twenty reads', async () => {
    const { store } = await started()
    expect(await read(store, at('09:03'), { lookup: 'everything' })).toMatchObject({ status: 400, body: { error: 'lookup "everything" is not one the layer names' } })
    expect(await read(store, at('09:03'), { lookup: 'pattern', kind: 'chip.dinner', person: 'x' })).toMatchObject({ status: 400, body: { error: 'unknown parameter "person" for the lookup pattern' } })
    expect(await read(store, at('09:03'), { lookup: 'kinds', category: 'notes' })).toMatchObject({ status: 400, body: { error: 'ask for a category or a lookup, never both' } })
    // A refused query is no read.
    expect((await store.readTask(askTaskIds(DAY)[0]))?.contextCalls).toBe(0)
    for (let i = 0; i < 20; i++) expect((await read(store, at('09:04'), { lookup: 'pattern', kind: 'chip.napped' })).status).toBe(200)
    expect(await read(store, at('09:05'), { lookup: 'kinds' })).toMatchObject({ status: 429, body: { error: 'at most 20 reads a run' } })
  })

  it('cuts a lookup to what the run may still read, and says it was cut', async () => {
    const { store } = await started()
    const task = (await store.readTask(askTaskIds(DAY)[0])) as NonNullable<Awaited<ReturnType<Mem['readTask']>>>
    await store.writeTask({ ...task, contextBytes: 64 * 1024 - 700 })
    const r = await read(store, at('09:03'), { lookup: 'pattern', kind: 'chip.dinner' })
    const body = r.body as { facts: unknown[]; complete: boolean; cutForSize: number }
    expect(body.complete).toBe(false)
    expect(body.cutForSize).toBeGreaterThan(0)
    expect(body.facts.length).toBeGreaterThan(0)
    expect((servedOf(store).lookups as Fact[]).length).toBe(body.facts.length)
  })

  it('is served to Ask alone: the line’s own run is refused a lookup', async () => {
    // A morning before the day's line is written: its run is open.
    const store = memoryStore()
    put(store, 'facts', DAY, DAY, { day: DAY, builtAt: SHEET.builtAt, updatedAt: SHEET.builtAt, sheet: SHEET }, SHEET.builtAt)
    put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
    put(store, 'patterns', 'table', null, TABLE)
    void store.writeTask({ id: taskIdOf('line', DAY), kind: 'task', task: 'line', day: DAY, at: at('07:45').toISOString(), status: 'fired', trigger: 'checkin', factsDay: DAY, askedModel: 'opus', firedAt: at('07:45').toISOString(), contextCalls: 0, contextBytes: 0, posts: 0, refusals: [] })
    const r = await handleContext({ env, store, now: at('07:46'), fetcher }, new URL(`https://w.test/claude/context?task=line&day=${DAY}&lookup=kinds`))
    expect(r).toMatchObject({ status: 403, body: { error: 'the line task is served no lookup' } })
  })

  it('keeps an id served twice once, the later one', () => {
    const f = (id: string, text: string): Fact => ({ id, tags: [], text, values: {} })
    expect(withLookups([f('a', 'old'), f('b', 'kept')], [f('a', 'new'), f('c', 'more')])).toEqual([f('b', 'kept'), f('a', 'new'), f('c', 'more')])
  })
})

describe('an answer checked against the sheet and the lookups together', () => {
  it('passes when it cites a lookup’s fact and says only that fact’s numbers, and its cited words are kept for the phone', async () => {
    const { store, turn } = await started()
    await read(store, at('09:03'), { lookup: 'pattern', kind: 'chip.dinner' })
    expect(await post(store, at('09:05'), GOOD)).toEqual({ status: 200, body: { ok: true } })
    const row = answerOf(store, turn.id)
    expect(row).toMatchObject({ status: 'answered', factIds: [SATURDAY] })
    // What "What this rests on" shows on the phone: the fact's own words, as the writer read them.
    expect(row.facts).toEqual([{ id: SATURDAY, text: 'A steady pattern: a late or heavy dinner was recorded more often on Saturdays (8 of 8 on Saturdays, against 0 of 48 on other days).' }])
  })

  it('refuses a number that is in no cited fact, as it always has', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'pattern', kind: 'chip.dinner' })
    const r = await post(store, at('09:05'), { ...GOOD, text: GOOD.text.replace('8 of 8 Saturdays', '6 of 8 Saturdays') })
    expect(r.status).toBe(422)
    expect(reason(r)).toContain('the number 6 is not in the cited facts')
    // A number of the table whose fact the answer did not cite is refused too: 5 is the naps' count, not the dinners'.
    await read(store, at('09:06'), { lookup: 'pattern', kind: 'chip.napped' })
    const other = await post(store, at('09:07'), { ...GOOD, text: `${GOOD.text} A nap was recorded on 5 evenings.` })
    expect(reason(other)).toContain('the number 5 is not in the cited facts')
  })

  it('refuses a number that appears only in a category’s lines', async () => {
    const { store } = await started()
    const notes = await read(store, at('09:03'), { category: 'notes', from: '2026-11-01' })
    expect(JSON.stringify(notes.body)).toContain('walked 17 blocks home')
    // A category's reply says whether its read was whole, as a lookup's does.
    expect(notes.body).toMatchObject({ complete: true, notRead: 0, linesLeftOut: 0 })
    const r = await post(store, at('09:05'), { text: 'You walked 17 blocks home one evening, by your own note.', factIds: ['record'], cardIds: [], test: null, note: false })
    expect(r.status).toBe(422)
    expect(reason(r)).toContain('the number 17 is not in the cited facts')
  })

  it('refuses a lookup fact the run was never served', async () => {
    const { store } = await started()
    const r = await post(store, at('09:05'), GOOD)
    expect(r.status).toBe(422)
    expect(reason(r)).toBe(`fact "${SATURDAY}" is not on the sheet`)
  })

  it('takes a lookup’s fact away when its switch is turned off between the lookup and the answer', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'pattern', kind: 'chip.dinner' })
    put(store, 'brainPrefs', 'prefs', null, { id: 'prefs', writerModel: 'opus', switches: { dayRecord: false } })
    const r = await post(store, at('09:05'), GOOD)
    expect(r.status).toBe(422)
    expect(reason(r)).toBe(`fact "${SATURDAY}" is not on the sheet`)
    // The probe that can say yes: the switch back on, the same answer passes.
    put(store, 'brainPrefs', 'prefs', null, { id: 'prefs', writerModel: 'opus', switches: {} })
    expect((await post(store, at('09:06'), GOOD)).status).toBe(200)
  })

  it('holds a counted pattern to its standing: no usual-case word over a comparison with no clear pattern', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'pattern', kind: 'chip.dinner' })
    const r = await post(store, at('09:05'), { text: 'Late dinners are most often on Mondays.\n\nIt was recorded on 0 of 8 Mondays, against 8 of 48 other days.', factIds: [MONDAY], cardIds: [], test: null, note: false })
    expect(r.status).toBe(422)
    expect(reason(r)).toContain('says "most often" of a comparison with no clear pattern yet')
    // The honest answer on the same cell passes.
    expect((await post(store, at('09:06'), { text: 'There is no clear pattern yet for late dinners on Mondays.\n\nIt was recorded on 0 of 8 Mondays, against 8 of 48 other days.', factIds: [MONDAY], cardIds: [], test: null, note: false })).status).toBe(200)
  })

  it('refuses a cause said over a counted pattern, as over any association', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'pattern', kind: 'chip.dinner' })
    const r = await post(store, at('09:05'), { ...GOOD, text: 'Saturdays gave you late dinners, and that is why the pattern stands.\n\nIt was recorded on 8 of 8 Saturdays, against 0 of 48 other days.' })
    expect(r.status).toBe(422)
    expect(reason(r)).toContain('of an association in the record')
  })

  it('answers a question with no pattern as no clear pattern yet, with the counts', async () => {
    const { store, turn } = await started('When am I most likely to nap?')
    const r = await read(store, at('09:03'), { lookup: 'pattern', kind: 'chip.napped' })
    const facts = (r.body as { facts: { id: string; text: string }[] }).facts
    // Five naps over 56 evenings: enough to compare by the weekday, and nothing stands out.
    expect(facts[0]).toEqual({ id: 'pattern.chip.napped.all', text: `A nap: recorded at 5 of 56 days the record can speak for, up to ${dayN(A + 55)}. 7 comparisons were looked at, by the weekday. No clear pattern yet in any of them.` })
    expect(facts.slice(1).every((f) => f.text.startsWith('No clear pattern yet: a nap, '))).toBe(true)
    expect(facts).toHaveLength(8)
    const honest = { text: 'There is no clear pattern yet for when you nap.\n\nA nap was recorded on 5 of 56 days, and none of the 7 comparisons stands out.', factIds: ['pattern.chip.napped.all'], cardIds: [], test: null, note: false }
    // Said as the usual case, the same counts are refused; said honestly, they pass.
    const eager = await post(store, at('09:04'), { ...honest, text: honest.text.replace('There is no clear pattern yet for when you nap.', 'You usually nap midweek.') })
    expect(reason(eager)).toContain('says "usually" of a comparison with no clear pattern yet')
    expect((await post(store, at('09:05'), honest)).status).toBe(200)
    expect(answerOf(store, turn.id).facts[0].text).toContain('No clear pattern yet in any of them.')
  })

  it('answers a thing recorded too rarely to compare with its counts and what is needed', async () => {
    const { store } = await started('When does nothing land?')
    const r = await read(store, at('09:03'), { lookup: 'pattern', kind: 'chip.nothingLanded' })
    const facts = (r.body as { facts: { id: string; text: string }[] }).facts
    expect(facts.map((f) => f.id)).toEqual(['pattern.chip.nothingLanded.all'])
    expect(facts[0].text).toContain('Too few to compare yet: a comparison needs 8 occasions in a cell and 8 outside it, and 5 occurrences in all.')
    const said = { text: 'There is too little to compare yet.\n\nIt was recorded on 0 of 56 days; a comparison needs 8 occasions in a cell and 5 occurrences in all.', factIds: ['pattern.chip.nothingLanded.all'], cardIds: [], test: null, note: false }
    expect((await post(store, at('09:05'), said)).status).toBe(200)
  })
})
