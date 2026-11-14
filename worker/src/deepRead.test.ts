import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { answerIdOf, ASK_WORDS, askTaskIds, deepTaskId } from '../../src/ask/shared'
import type { AskTurn } from '../../src/ask/types'
import { GUESS_WORDS, isAssociationFact, isFollowedFact, isNoticedFact, isTableFact, isWriteUpFact, noticedRefusals, patternWordingRefusals } from '../../src/brainShared'
import { copy } from '../../src/copy'
import { storedPatterns } from '../../src/counted/patterns'
import { patternTable } from '../../src/counted/table'
import { checkin, day as dayN, input } from '../../src/counted/testing'
import type { Fact, FactSheet } from '../../src/factTypes'
import { obsMarkIdOf, WRITEUPS_STORE, type WriteUp } from '../../src/writeups/shared'
import { handleAskBriefing, handleAskContext, handleAskLine, runAsks } from './ask'
import { SERVED_STORE, taskIdOf } from './claude'
import { DAYS_NAMED, DEEP_READ_TRIES, DEEP_SPARE_READS, deepReadsMost, lackingRefusal, monthName, monthsOf, monthsText, NOTICED_WORDS, parseDeepQuery } from './deepRead'
import { mayRead, parseLookupQuery } from './lookups'
import { askInstructions, DEEP_RULES } from './prompt'
import { accessFor, DEEP_LOOKUPS, factCategories, gatesFrom, LOOKUPS, parseContextQuery } from './retrieval'
import { APP, BRAIN_APP, memoryStore } from './turso'

// "Coach me on everything" covers everything (2026-11-14), end to end on stand-in records: the deep tier reads the
// monthly write-ups under the phone's own rule and the month under way in parts, with no one-year limit; its answer
// is checked against what it read; what Claude noticed is never repeated as fact; and ordinary Ask is served none of it.

const TZ = 'America/New_York'
const env = { TIMEZONE: TZ, FALLBACK_TIME: '11:00', LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 'fire-token', CLAUDE_TIMEOUT_MINUTES: '20' }
const DAY = '2026-11-12'
/** New York local times (UTC−5 in November). */
const at = (hhmm: string) => new Date(`${DAY}T${String(Number(hhmm.slice(0, 2)) + 5).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)

type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown, when = `${DAY}T12:00:00.000Z`) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: when, deleted: 0, synced_at: when })

// Eight weeks of evenings: a late dinner on the eight Saturdays alone. One guess is followed in the table: counted on the days after it was noticed.
const A = 250
const saturday = (n: number): boolean => new Date(2026, 0, 1 + n).getDay() === 6
const N1_MARK = obsMarkIdOf('2026-10:1', 'noticed', 1)
const followed = (standing: 'tooFew' | 'lead' = 'tooFew') => [{ id: N1_MARK, kind: 'chip.dinner', split: 'weekday' as const, cell: '6', noticedOn: '2026-11-04', k: 1, n: 1, restK: 0, m: 6, standing, direction: 'higher' as const, family: 3 }]
const table = (standing: 'tooFew' | 'lead' = 'tooFew') => storedPatterns(patternTable(input({ checkins: Array.from({ length: 56 }, (_, i) => checkin(A + i, 'evening', { extras: saturday(A + i) ? { dinner: true } : {} })) }), dayN(A + 56)), `${DAY}T12:00:00.000Z`, followed(standing) as never)

const sheet = (showPrivate = false): FactSheet =>
  ({
    version: 1,
    day: DAY,
    builtAt: `${DAY}T12:41:00.000Z`,
    hour: 7,
    weeks: 8,
    days: 56,
    direction: null,
    said: [],
    showPrivate,
    checkedIn: { morning: `${DAY}T12:40:00.000Z` },
    facts: [
      { id: 'week.today', tags: ['cue'], text: 'Today is Thursday; a daycare day.', values: {} },
      { id: 'record', tags: [], text: 'The record holds 56 days.', values: { days: 56 } },
    ],
  }) as FactSheet

const SATURDAYS = ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24']
const FINGERPRINT = 'a'.repeat(64)
const writeUp = (month: string, reading: number, over: Partial<WriteUp>): WriteUp => ({ id: `${month}:${reading}`, month, reading, at: '2026-11-05T04:48:20.000Z', day: '2026-11-04', method: 1, model: 'claude-fable-5-2', builtFrom: { counts: { days: 30 }, parts: 2, lines: 120, fingerprint: FINGERPRINT }, recorded: [], noticed: [], ...over })
const OCTOBER = writeUp('2026-10', 1, {
  recorded: [
    { text: 'A late dinner was marked on 4 Saturdays.', days: SATURDAYS, kinds: ['dayRecord'] },
    { text: 'Two notes mention the long walk home.', days: ['2026-10-06', '2026-10-20'], kinds: ['notes'] },
  ],
  noticed: [
    { text: 'Late dinners seem to fall on Saturdays.', days: SATURDAYS, kinds: ['dayRecord'], followed: { kind: 'chip.dinner', split: 'weekday', cell: '6', k: 4, n: 4, restK: 0, m: 27 } },
    { text: 'Church days seem calmer.', days: ['2026-10-04'], kinds: ['faith'], faith: true },
  ],
})
const SEPTEMBER = writeUp('2026-09', 1, { at: '2026-11-05T04:32:37.000Z', recorded: [{ text: 'A nap was marked on 3 evenings.', days: ['2026-09-05', '2026-09-12', '2026-09-19'], kinds: ['dayRecord'] }] })

const R1 = 'writeups.2026-10.recorded.1'
const R2 = 'writeups.2026-10.recorded.2'
const N1 = 'writeups.2026-10.noticed.1'
const SINCE = 'writeups.2026-10.noticed.1.since'
const N2 = 'writeups.2026-10.noticed.2'
const S1 = 'writeups.2026-09.recorded.1'
const ALL = [S1, R1, R2, N1, SINCE, N2]

interface Opts {
  /** Days whose own row is not there. */
  without?: string[]
  settings?: Record<string, unknown>
  showPrivate?: boolean
  standing?: 'tooFew' | 'lead'
}

/** A stand-in record: a day in August, a few in September and October, November up to the twelfth; two months' write-ups; the table. */
function record(o: Opts = {}): Mem {
  const store = memoryStore()
  const s = sheet(o.showPrivate === true)
  put(store, 'facts', DAY, DAY, { day: DAY, builtAt: s.builtAt, updatedAt: s.builtAt, sheet: s }, s.builtAt)
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: o.showPrivate === true, privateInSelection: false, ...o.settings })
  put(store, 'patterns', 'table', null, table(o.standing))
  const days = ['2026-08-20', '2026-09-05', '2026-09-12', '2026-09-19', '2026-10-03', '2026-10-04', '2026-10-06', '2026-10-10', '2026-10-17', '2026-10-20', '2026-10-24', ...Array.from({ length: 12 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)]
  for (const d of days) if (!o.without?.includes(d)) put(store, 'days', d, d, { day: d, atOffice: false })
  put(store, 'checkins', '900', '2026-11-10', { id: 900, day: '2026-11-10', block: 'evening', completedAt: '2026-11-11T01:00:00.000Z', answers: {}, extras: { note: 'walked 17 blocks home' } })
  put(store, 'checkins', '901', '2026-11-11', { id: 901, day: '2026-11-11', block: 'morning', completedAt: '2026-11-11T12:30:00.000Z', answers: {}, extras: {} })
  void store.writeBrainRow(WRITEUPS_STORE, OCTOBER.id, OCTOBER.day, OCTOBER, OCTOBER.at)
  void store.writeBrainRow(WRITEUPS_STORE, SEPTEMBER.id, SEPTEMBER.day, SEPTEMBER, SEPTEMBER.at)
  void store.writeBrief({ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'x', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: at('07:48').toISOString(), factsDay: DAY, refusals: [], writer: 'claude', forDay: DAY }, at('07:48').toISOString())
  void store.writeTask({ id: taskIdOf('coach', DAY), kind: 'task', task: 'coach', day: DAY, at: at('07:50').toISOString(), status: 'written', trigger: 'checkin', factsDay: DAY, askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 1, refusals: [] })
  return store
}

let seq = 1_780_000_000_000
function asked(store: Mem, tier: 'standard' | 'deep', question = 'Coach me on everything.'): AskTurn & { id: number } {
  const id = seq++
  const turn: AskTurn & { id: number } = { id, threadId: id, day: DAY, at: at('09:00').toISOString(), question, tier, state: 'waiting', kind: 'typed', version: 'v', cited: [], updatedAt: at('09:00').toISOString() }
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
type Task = 'ask' | 'deep'
const url = (task: Task, path: string, params: Record<string, string>) => new URL(`https://w.test${path}?${new URLSearchParams({ task, day: DAY, ...params })}`)
const briefing = (store: Mem, now: Date, task: Task = 'deep') => handleAskBriefing(deps(store, now), url(task, '/claude/briefing', {}))
const read = (store: Mem, now: Date, params: Record<string, string>, task: Task = 'deep') => handleAskContext(deps(store, now), url(task, '/claude/context', params))
const post = (store: Mem, now: Date, answer: unknown, task: Task = 'deep') => handleAskLine(deps(store, now), { task, day: DAY, answer, askedModel: 'opus', writtenModel: 'claude-fable-5-2', runnerModel: 'claude-haiku-5-5' })
const taskId = (task: Task) => (task === 'deep' ? deepTaskId(DAY) : askTaskIds(DAY)[0])
const servedOf = (store: Mem, task: Task = 'deep') => JSON.parse(store.rows.get(`${BRAIN_APP}|${SERVED_STORE}|${taskId(task)}`)?.body ?? 'null')
const answerOf = (store: Mem, turnId: number) => JSON.parse(store.rows.get(`${BRAIN_APP}|askAnswers|${answerIdOf(turnId)}`)?.body ?? 'null')
const reason = (r: { body: unknown }) => (r.body as { reason: string }).reason
const factsOf = (r: { body: unknown }) => (r.body as { facts: { id: string; text: string }[] }).facts
const taskOf = async (store: Mem, task: Task = 'deep') => (await store.readTask(taskId(task))) as NonNullable<Awaited<ReturnType<Mem['readTask']>>>

/** A question asked, its run started, its briefing read: ready for its reads. */
async function started(store: Mem = record(), tier: 'standard' | 'deep' = 'deep'): Promise<{ store: Mem; turn: AskTurn & { id: number } }> {
  const turn = asked(store, tier)
  expect(await runAsks(env, store, at('09:01'), { gate: 'open', fireFetcher: fetcher })).toMatchObject({ ran: true, turn: turn.id })
  expect((await briefing(store, at('09:02'), tier === 'deep' ? 'deep' : 'ask')).status).toBe(200)
  return { store, turn }
}
/** The ids of the write-ups' facts a deep run on this record is served. */
async function served(store: Mem): Promise<string[]> {
  await started(store)
  return factsOf(await read(store, at('09:03'), { lookup: 'writeups' })).map((f) => f.id)
}

const answer = (text: string, factIds: string[]) => ({ text, factIds, cardIds: [], test: null, note: false })
/** Cites what October recorded, and says which month it lacks. */
const RECORDED = answer('October holds one thing worth knowing about.\n\nA late dinner was marked on 4 Saturdays that month. I had no write-up for August.', [R1])
/** Cites what Claude noticed, as a guess, and says which month it lacks. */
const NOTICED = answer('One thing from October is worth watching, and it is only a guess so far.\n\nLate dinners may fall on Saturdays: nobody has tested that. I had no write-up for August.', [N1])

describe('the write-ups, served to the deep tier', () => {
  it('serves each observation as a fact, the oldest month first: what was recorded, what Claude noticed, and a followed guess counted since', async () => {
    const { store } = await started()
    const r = await read(store, at('09:03'), { lookup: 'writeups' })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ lookup: 'writeups', complete: true, months: ['2026-09', '2026-10'], lacking: ['2026-08'] })
    const facts = factsOf(r)
    expect(facts.map((f) => f.id)).toEqual(ALL)
    expect(facts[1]).toEqual({ id: R1, text: 'October 2026, you recorded: A late dinner was marked on 4 Saturdays. It came from the days 2026-10-03, 2026-10-10, 2026-10-17, 2026-10-24.' })
    // What Claude noticed says in its own words that it is a guess, and that nobody tested it.
    expect(facts[3]).toEqual({ id: N1, text: 'October 2026, Claude noticed (a guess made on reading the month; nobody tested it): Late dinners seem to fall on Saturdays. It came from the days 2026-10-03, 2026-10-10, 2026-10-17, 2026-10-24.' })
    expect(NOTICED_WORDS).toBe('Claude noticed (a guess made on reading the month; nobody tested it)')
    // The guess counted since, from the table as the phone last kept it, in a pattern fact's words.
    expect(facts[4]).toEqual({ id: SINCE, text: 'Counted since Claude noticed it on 2026-11-04, on the days after alone: Too few to compare yet: a late or heavy dinner, 1 of 1 on Saturdays, against 0 of 6 on other days.' })
    expect(facts[5].text).toBe('October 2026, Claude noticed (a guess made on reading the month; nobody tested it): Church days seem calmer. It came from the day 2026-10-04.')
    // The reply carries each fact's id and words; its values stay with the Worker, for the check.
    expect(Object.keys(facts[0]).sort()).toEqual(['id', 'text'])
    const kept = servedOf(store).lookups as Fact[]
    expect(kept.find((f) => f.id === R1)?.values).toMatchObject({ said1: 4, days: 4, year: 2026, month: '2026-10', part: 'recorded', kinds: 'dayRecord', category: 'dayRecord' })
    expect(kept.find((f) => f.id === SINCE)?.values).toMatchObject({ k: 1, n: 1, restK: 0, m: 6, family: 3, standing: 'tooFew', part: 'since', kinds: 'dayRecord' })
    expect(kept.find((f) => f.id === N2)?.tags).toEqual(['faith'])
  })

  it('serves one month when a month is asked for, and says so when that month has none', async () => {
    const { store } = await started()
    expect(factsOf(await read(store, at('09:03'), { lookup: 'writeups', month: '2026-09' })).map((f) => f.id)).toEqual([S1])
    const none = await read(store, at('09:04'), { lookup: 'writeups', month: '2026-08' })
    expect(none.body).toMatchObject({ facts: [], note: 'no write-up can be read for 2026-08' })
  })

  it('serves each month’s newest reading alone', async () => {
    const store = record()
    const second = writeUp('2026-10', 2, { at: '2026-11-08T04:00:00.000Z', day: '2026-11-07', recorded: [{ text: 'A late dinner was marked on 4 Saturdays, each after six.', days: SATURDAYS, kinds: ['dayRecord'] }] })
    void store.writeBrainRow(WRITEUPS_STORE, second.id, second.day, second, second.at)
    await started(store)
    const facts = factsOf(await read(store, at('09:03'), { lookup: 'writeups', month: '2026-10' }))
    expect(facts.map((f) => f.id)).toEqual([R1])
    expect(facts[0].text).toContain('each after six')
  })

  it('names the days it came from up to eight, then says how many more', async () => {
    expect(DAYS_NAMED).toBe(8)
    const store = record()
    const many = writeUp('2026-11', 1, { recorded: [{ text: 'A walk was marked most days.', days: Array.from({ length: 11 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`), kinds: ['dayRecord'] }] })
    void store.writeBrainRow(WRITEUPS_STORE, many.id, many.day, many, many.at)
    await started(store)
    const f = factsOf(await read(store, at('09:03'), { lookup: 'writeups', month: '2026-11' }))[0]
    expect(f.text).toBe('November 2026, you recorded: A walk was marked most days. It came from the days 2026-11-01, 2026-11-02, 2026-11-03, 2026-11-04, 2026-11-05, 2026-11-06, 2026-11-07, 2026-11-08, and 3 more days.')
    expect((servedOf(store).lookups as Fact[])[0].values).toMatchObject({ days: 11, more: 3 })
  })

  it('refuses ordinary Ask both lookups', async () => {
    const { store } = await started(record(), 'standard')
    expect(DEEP_LOOKUPS).toEqual(['writeups', 'monthSoFar'])
    expect(await read(store, at('09:03'), { lookup: 'writeups' }, 'ask')).toMatchObject({ status: 403, body: { error: 'the lookup writeups is served to “Coach me on everything” alone' } })
    expect(await read(store, at('09:03'), { lookup: 'monthSoFar', part: '1' }, 'ask')).toMatchObject({ status: 403, body: { error: 'the lookup monthSoFar is served to “Coach me on everything” alone' } })
    expect((await taskOf(store, 'ask')).deep).toBeUndefined()
    expect(servedOf(store, 'ask').lookups).toBeUndefined()
    // Nor is either among the nine it may ask for.
    for (const l of DEEP_LOOKUPS) expect((LOOKUPS as readonly string[]).includes(l)).toBe(false)
  })

  it('reads a query for a deep lookup strictly', () => {
    const parse = (q: string) => parseDeepQuery(new URL(`https://w.test/claude/context?task=deep&day=${DAY}&${q}`))
    expect(parse('lookup=writeups')).toEqual({ ok: true, query: { lookup: 'writeups' } })
    expect(parse('lookup=writeups&month=2026-10')).toEqual({ ok: true, query: { lookup: 'writeups', month: '2026-10' } })
    expect(parse('lookup=writeups&month=2026-13')).toEqual({ ok: false, reason: 'month must be a month, YYYY-MM' })
    expect(parse('lookup=writeups&part=1')).toEqual({ ok: false, reason: 'unknown parameter "part" for the lookup writeups' })
    expect(parse('lookup=writeups&category=notes')).toEqual({ ok: false, reason: 'ask for a category or a lookup, never both' })
    expect(parse('lookup=monthSoFar')).toEqual({ ok: true, query: { lookup: 'monthSoFar', part: 1 } })
    expect(parse('lookup=monthSoFar&part=3')).toEqual({ ok: true, query: { lookup: 'monthSoFar', part: 3 } })
    expect(parse('lookup=monthSoFar&part=17')).toEqual({ ok: false, reason: 'part must be a whole number from 1 to 16' })
    expect(parse('lookup=monthSoFar&part=0')).toEqual({ ok: false, reason: 'part must be a whole number from 1 to 16' })
    expect(parse('lookup=monthSoFar&month=2026-10')).toEqual({ ok: false, reason: 'unknown parameter "month" for the lookup monthSoFar' })
  })
})

describe('what of a write-up is served: the phone’s own rule, at the moment of serving', () => {
  it('serves everything on a record with nothing hidden', async () => {
    expect(await served(record())).toEqual(ALL)
  })

  it('serves nothing written at or before the forget moment, and everything written after it', async () => {
    const forgot = record()
    put(forgot, 'noteMarks', 'forget', null, { id: 'forget', kind: 'forget', at: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' })
    await started(forgot)
    expect((await read(forgot, at('09:03'), { lookup: 'writeups' })).body).toMatchObject({ facts: [], months: [], lacking: ['2026-08', '2026-09', '2026-10'], note: 'no month has a write-up that can be read' })
    // The probe that can say yes: a forget moment before both write-ups hides neither.
    const earlier = record()
    put(earlier, 'noteMarks', 'forget', null, { id: 'forget', kind: 'forget', at: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' })
    expect(await served(earlier)).toEqual(ALL)
  })

  it('leaves out an observation the owner marked wrong, and a followed guess with it', async () => {
    const store = record()
    put(store, 'noteMarks', obsMarkIdOf('2026-10:1', 'recorded', 2), null, { kind: 'wrong', at: '2026-11-09T00:00:00.000Z', updatedAt: '2026-11-09T00:00:00.000Z' })
    expect(await served(store)).toEqual(ALL.filter((id) => id !== R2))
    const guess = record()
    put(guess, 'noteMarks', N1_MARK, null, { kind: 'wrong', at: '2026-11-09T00:00:00.000Z', updatedAt: '2026-11-09T00:00:00.000Z' })
    expect(await served(guess)).toEqual(ALL.filter((id) => id !== N1 && id !== SINCE))
  })

  it('leaves out an observation that cites a day which no longer holds a record', async () => {
    expect(await served(record({ without: ['2026-10-20'] }))).toEqual(ALL.filter((id) => id !== R2))
    // A check-in of the day holds it as its own row does.
    const store = record({ without: ['2026-10-20'] })
    put(store, 'checkins', '77', '2026-10-20', { id: 77, day: '2026-10-20', block: 'evening', completedAt: '2026-10-21T01:00:00.000Z', answers: {}, extras: {} })
    expect(await served(store)).toEqual(ALL)
  })

  it('leaves out an observation that drew on a kind of record this run may not read', async () => {
    const store = record()
    put(store, 'brainPrefs', 'prefs', null, { id: 'prefs', writerModel: 'opus', switches: { notes: false } })
    expect(await served(store)).toEqual(ALL.filter((id) => id !== R2))
  })

  it('leaves out an observation that drew on faith while faith is hidden', async () => {
    expect(await served(record({ settings: { hideFaith: true } }))).toEqual(ALL.filter((id) => id !== N2))
  })

  it('leaves out an observation that names a private item while names may not be shown', async () => {
    const named = writeUp('2026-10', 2, { at: '2026-11-08T04:00:00.000Z', recorded: [{ text: 'Zed was marked on 2 days.', days: ['2026-10-03', '2026-10-10'], kinds: ['privateItems'] }] })
    const hidden = record({ settings: { privateInSelection: true } })
    put(hidden, 'privateItems', '1', null, { id: 1, name: 'Zed' })
    void hidden.writeBrainRow(WRITEUPS_STORE, named.id, named.day, named, named.at)
    // The newest reading holds nothing to show, so the reading before it is the one served, as on the phone.
    expect((await served(hidden)).filter((id) => id.startsWith('writeups.2026-10'))).toEqual([R1, R2, N1, SINCE, N2])
    const shown = record({ settings: { privateInSelection: true }, showPrivate: true })
    put(shown, 'privateItems', '1', null, { id: 1, name: 'Zed' })
    void shown.writeBrainRow(WRITEUPS_STORE, named.id, named.day, named, named.at)
    await started(shown)
    expect(factsOf(await read(shown, at('09:03'), { lookup: 'writeups', month: '2026-10' }))).toEqual([{ id: R1, text: 'October 2026, you recorded: Zed was marked on 2 days. It came from the days 2026-10-03, 2026-10-10.' }])
  })

  it('reads each fact under every kind its observation drew on: a kind missing or unknown is closed', () => {
    const f = (kinds: string | undefined, tags: string[] = []): Fact => ({ id: R1, tags, text: 'x', values: kinds === undefined ? {} : { kinds } })
    expect(factCategories(f('dayRecord|notes'), new Map())).toEqual(['dayRecord', 'notes'])
    expect(factCategories(f('dayRecord', ['faith']), new Map())).toEqual(['dayRecord', 'faith'])
    expect(factCategories(f('faith', ['faith']), new Map())).toEqual(['faith'])
    expect(factCategories(f('dayRecord|everything'), new Map())).toEqual(['dayRecord', 'closed'])
    expect(factCategories(f(undefined), new Map())).toEqual(['closed'])
    expect(factCategories(f(''), new Map())).toEqual(['closed'])
    const access = accessFor('deep', gatesFrom({ hideFaith: false, privateInSelection: false }), { writerModel: 'opus', switches: { notes: false } } as never)
    expect(mayRead(f('dayRecord'), access)).toBe(true)
    expect(mayRead(f('dayRecord|notes'), access)).toBe(false)
    expect(mayRead(f(undefined), access)).toBe(false)
  })

  it('holds a served fact to the rule again at the check: one marked wrong after it was served is taken out', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'writeups' })
    put(store, 'noteMarks', obsMarkIdOf('2026-10:1', 'recorded', 1), null, { kind: 'wrong', at: at('09:04').toISOString(), updatedAt: at('09:04').toISOString() })
    const r = await post(store, at('09:05'), RECORDED)
    expect(r.status).toBe(422)
    expect(reason(r)).toBe(`fact "${R1}" is not on the sheet`)
    // The probe that can say yes: the mark taken back, the same answer passes.
    store.rows.delete(`${APP}|noteMarks|${obsMarkIdOf('2026-10:1', 'recorded', 1)}`)
    expect(await post(store, at('09:06'), RECORDED)).toEqual({ status: 200, body: { ok: true } })
  })

  it('takes a served fact out when a day it cites is deleted before the answer', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'writeups' })
    store.rows.delete(`${APP}|days|2026-10-17`)
    expect(reason(await post(store, at('09:05'), RECORDED))).toBe(`fact "${R1}" is not on the sheet`)
  })
})

describe('what Claude noticed is never repeated as fact', () => {
  it('passes an answer that cites a guess and says it is one, and keeps its cited words for the phone', async () => {
    const { store, turn } = await started()
    await read(store, at('09:03'), { lookup: 'writeups' })
    expect(await post(store, at('09:05'), NOTICED)).toEqual({ status: 200, body: { ok: true } })
    expect(answerOf(store, turn.id)).toMatchObject({ status: 'answered', factIds: [N1] })
    expect(answerOf(store, turn.id).facts[0].text).toContain('Claude noticed (a guess made on reading the month; nobody tested it)')
  })

  it('refuses a guess said as a fact, said as the usual case, and said as a cause: every reason at once', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'writeups' })
    const flat = await post(store, at('09:05'), answer('One thing from October is worth knowing.\n\nLate dinners fall on Saturdays. I had no write-up for August.', [N1]))
    expect(flat.status).toBe(422)
    expect(reason(flat)).toBe('cites what Claude noticed without saying it is a guess: say "Claude noticed", "a guess", "may", "might" or "not tested"')
  })

  it('refuses the usual-case words on a guess’s strength, and a cause', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'writeups' })
    const usual = await post(store, at('09:05'), answer('One thing from October is worth knowing.\n\nLate dinners usually fall on Saturdays, and Saturdays gave you those late dinners. I had no write-up for August.', [N1]))
    expect(usual.status).toBe(422)
    expect(reason(usual)).toContain('cites what Claude noticed without saying it is a guess')
    expect(reason(usual)).toContain('says "usually" on what Claude noticed: a guess nobody tested is never the usual case')
    expect(reason(usual)).toContain('of an association in the record')
  })

  it('lets a number be said only if the cited fact holds it', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'writeups' })
    const r = await post(store, at('09:05'), { ...NOTICED, text: NOTICED.text.replace('Late dinners may fall on Saturdays', 'Late dinners may fall on 5 Saturdays') })
    expect(reason(r)).toContain('the number 5 is not in the cited facts')
    // What was recorded holds its own number, and no other.
    expect(reason(await post(store, at('09:06'), { ...RECORDED, text: RECORDED.text.replace('4 Saturdays', '6 Saturdays') }))).toContain('the number 6 is not in the cited facts')
  })

  it('reads the guess words as the rule names them: the month of May is not "may"', () => {
    for (const said of ['Claude noticed it.', 'It is a guess.', 'It may hold.', 'It might hold.', 'It is not tested.']) expect(GUESS_WORDS.test(said), said).toBe(true)
    for (const said of ['In May it held.', 'It holds.', 'A guest came.']) expect(GUESS_WORDS.test(said), said).toBe(false)
    expect(noticedRefusals('In May the dinners fell on Saturdays.', [N1])).toEqual(['cites what Claude noticed without saying it is a guess: say "Claude noticed", "a guess", "may", "might" or "not tested"'])
    expect(noticedRefusals('The dinners may fall on Saturdays.', [N1])).toEqual([])
    // With no guess cited the rule says nothing.
    expect(noticedRefusals('The dinners usually fall on Saturdays.', [R1])).toEqual([])
    // Every usual-case word is named when all are asked for.
    expect(noticedRefusals('It may be that they usually, and most often, fall there.', [N1], true)).toEqual(['says "usually", "most often" on what Claude noticed: a guess nobody tested is never the usual case'])
  })

  it('knows a write-up’s facts apart: what was recorded, a guess, and a guess counted since', () => {
    expect([R1, N1, SINCE].map(isWriteUpFact)).toEqual([true, true, true])
    expect([R1, N1, SINCE].map(isNoticedFact)).toEqual([false, true, false])
    expect([R1, N1, SINCE].map(isFollowedFact)).toEqual([false, false, true])
    // Each is read from the record, so no cause is said on one; the count alone is held to a pattern fact's rule.
    expect([R1, N1, SINCE].map(isAssociationFact)).toEqual([true, true, true])
    expect([R1, N1, SINCE].map(isTableFact)).toEqual([false, false, true])
    expect(isWriteUpFact('pattern.chip.dinner.all')).toBe(false)
  })
})

describe('a followed guess, with its count since', () => {
  it('is held to the wording a pattern fact keeps: nothing ahead of anything while too few stand', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'writeups' })
    const eager = await post(store, at('09:05'), answer('The guess about Saturdays has little to go on so far.\n\nSince Claude noticed it, a late dinner came more often on Saturdays: 1 of 1, against 0 of 6 other days. I had no write-up for August.', [SINCE]))
    expect(eager.status).toBe(422)
    expect(reason(eager)).toContain('says "more often" of a comparison with no clear pattern yet')
    const honest = answer('The guess about Saturdays has too little to compare yet.\n\nSince Claude noticed it, a late dinner was recorded on 1 of 1 Saturdays, against 0 of 6 other days. I had no write-up for August.', [SINCE])
    expect(await post(store, at('09:06'), honest)).toEqual({ status: 200, body: { ok: true } })
  })

  it('at a lead is said as a lead, with how many were looked at', async () => {
    const { store } = await started(record({ standing: 'lead' }))
    const facts = factsOf(await read(store, at('09:03'), { lookup: 'writeups', month: '2026-10' }))
    expect(facts.find((f) => f.id === SINCE)?.text).toBe('Counted since Claude noticed it on 2026-11-04, on the days after alone: A lead, not yet a pattern: a late or heavy dinner was recorded more often on Saturdays (1 of 1 on Saturdays, against 0 of 6 on other days). 3 comparisons were looked at.')
    const kept = (servedOf(store).lookups as Fact[]).filter((f) => f.id === SINCE)
    expect(patternWordingRefusals('Since then a late dinner came more often on Saturdays.', [SINCE], { facts: kept })).toEqual(['cites a comparison that stands at a lead without saying so: say "a lead"', 'cites a lead without saying how many comparisons were looked at: 3'])
    expect(patternWordingRefusals('Since then it is a lead: of the 3 comparisons looked at, Saturdays came more often.', [SINCE], { facts: kept })).toEqual([])
  })

  it('is not served while the table holds no count for it, or cannot be read', async () => {
    const none = record()
    put(none, 'patterns', 'table', null, { ...table(), followed: undefined })
    expect(await served(none)).toEqual(ALL.filter((id) => id !== SINCE))
    const stale = record()
    put(stale, 'patterns', 'table', null, { ...table(), updatedAt: '2026-11-01T12:00:00.000Z' })
    expect(await served(stale)).toEqual(ALL.filter((id) => id !== SINCE))
  })
})

describe('the month under way, raw, in parts', () => {
  it('serves the days of the month up to the task’s day, each line as the exact-day lookup words it, with how many parts there are', async () => {
    const { store } = await started()
    const r = await read(store, at('09:03'), { lookup: 'monthSoFar', part: '1' })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ lookup: 'monthSoFar', complete: true, month: '2026-11', part: 1, parts: 1 })
    expect((r.body as { days: string[] }).days).toEqual(Array.from({ length: 12 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`))
    const facts = factsOf(r)
    expect(facts[0]).toEqual({ id: 'day.2026-11-01.1', text: '2026-11-01: the day: at home' })
    expect(facts.map((f) => f.text)).toContain('2026-11-10, 20:00: at the evening check-in you wrote: “walked 17 blocks home”')
    // The same lines the exact-day lookup gives, under the same ids.
    const day = factsOf(await read(store, at('09:04'), { lookup: 'day', date: '2026-11-10' }))
    expect(facts.filter((f) => f.id.startsWith('day.2026-11-10.'))).toEqual(day)
    // Nothing after the task's day, and nothing before the month.
    expect(facts.every((f) => f.id >= 'day.2026-11-01' && f.id < 'day.2026-11-13')).toBe(true)
    expect(await read(store, at('09:05'), { lookup: 'monthSoFar', part: '2' })).toMatchObject({ status: 400, body: { error: 'part must be a whole number from 1 to 1' } })
  })

  it('is built once a run and kept with what the run was served: a record that changes later changes nothing served', async () => {
    const { store } = await started()
    const first = factsOf(await read(store, at('09:03'), { lookup: 'monthSoFar', part: '1' }))
    expect(servedOf(store).deep.soFar).toMatchObject({ builtAt: at('09:03').toISOString(), month: '2026-11', counts: { days: 12, checkins: 2, offers: 0, outcomes: 0, notes: 0, pathMarks: 0 }, lines: first.length })
    put(store, 'checkins', '902', '2026-11-12', { id: 902, day: '2026-11-12', block: 'morning', completedAt: `${DAY}T13:00:00.000Z`, answers: {}, extras: { note: 'a new note' } })
    const again = factsOf(await read(store, at('09:06'), { lookup: 'monthSoFar', part: '1' }))
    expect(again).toEqual(first)
    expect(servedOf(store).deep.soFar.builtAt).toBe(at('09:03').toISOString())
  })

  it('is whole or nothing: a read short of the database’s own count serves nothing, keeps nothing and costs nothing', async () => {
    const { store } = await started()
    const count = store.countRecords.bind(store)
    let short = true
    store.countRecords = async (s, range) => (await count(s, range)) + (short && s === 'checkins' ? 1 : 0)
    const r = await read(store, at('09:03'), { lookup: 'monthSoFar', part: '1' })
    expect(r).toEqual({ status: 503, body: { error: 'the month under way was not read whole: 2 of 3 rows of checkins', costs: 'nothing: a read that fails is not counted', retry: true, next: 'ask this read once more' } })
    expect(servedOf(store).deep.soFar).toBeUndefined()
    expect(servedOf(store).lookups).toBeUndefined()
    expect(await taskOf(store)).toMatchObject({ contextCalls: 0, contextBytes: 0, deep: { reads: 0, bytes: 0, parts: [], failed: { 'monthSoFar:1': 1 } } })
    expect((await store.readReads(10)).filter((x) => x.category === 'lookup.monthSoFar')).toEqual([])
    // Asked once more and failing again: the run is told to go on without it, and to say so.
    expect(DEEP_READ_TRIES).toBe(2)
    expect((await read(store, at('09:04'), { lookup: 'monthSoFar', part: '1' })).body).toMatchObject({ retry: false, next: 'go on without it, and say in the answer what you could not read' })
    // Whole again, it is served.
    short = false
    expect((await read(store, at('09:05'), { lookup: 'monthSoFar', part: '1' })).status).toBe(200)
    expect((await taskOf(store)).deep).toMatchObject({ reads: 1, parts: [1], failed: { 'monthSoFar:1': 2 } })
  })

  it('checks an answer against the part it read: a line’s number may be said once its line is cited', async () => {
    const { store } = await started()
    const facts = factsOf(await read(store, at('09:03'), { lookup: 'monthSoFar', part: '1' }))
    const note = facts.find((f) => f.text.includes('walked 17 blocks home'))?.id as string
    const said = answer('This month one evening stands out in your own words.\n\nYou wrote that you walked 17 blocks home.', [note])
    expect(await post(store, at('09:05'), said)).toEqual({ status: 200, body: { ok: true } })
    // The same words with the line uncited rest on nothing the run read.
    const { store: other } = await started()
    await read(other, at('09:03'), { lookup: 'monthSoFar', part: '1' })
    expect(reason(await post(other, at('09:05'), { ...said, factIds: ['record'] }))).toContain('the number 17 is not in the cited facts')
  })

  it('takes a line away when its switch is turned off after the month was built', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'monthSoFar', part: '1' })
    put(store, 'brainPrefs', 'prefs', null, { id: 'prefs', writerModel: 'opus', switches: { notes: false } })
    const again = factsOf(await read(store, at('09:04'), { lookup: 'monthSoFar', part: '1' }))
    expect(again.some((f) => f.text.includes('walked 17 blocks home'))).toBe(false)
    expect(again.length).toBeGreaterThan(0)
  })

  it('says so when the month holds nothing yet', async () => {
    const store = memoryStore()
    const s = sheet()
    put(store, 'facts', DAY, DAY, { day: DAY, builtAt: s.builtAt, updatedAt: s.builtAt, sheet: s }, s.builtAt)
    put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
    await started(store)
    expect((await read(store, at('09:03'), { lookup: 'monthSoFar', part: '1' })).body).toMatchObject({ facts: [], parts: 0, note: 'nothing this run may read is recorded this month yet' })
  })
})

describe('no one-year limit for the deep tier', () => {
  const lookupUrl = (q: string) => new URL(`https://w.test/claude/context?task=deep&day=${DAY}&${q}`)

  it('lets its lookups over a range reach back past a year; ordinary Ask keeps a year', async () => {
    expect(parseLookupQuery(lookupUrl('lookup=moves&from=2020-01-01'), DAY)).toEqual({ ok: false, reason: 'from may reach back a year at most' })
    expect(parseLookupQuery(lookupUrl('lookup=moves&from=2020-01-01'), DAY, { first: '2026-08-01' })).toEqual({ ok: true, query: { lookup: 'moves', from: '2020-01-01', to: DAY, limit: 50 } })
    // The other limits stand for it as for anyone.
    expect(parseLookupQuery(lookupUrl('lookup=moves&from=2020-01-01&to=2026-12-01'), DAY, { first: '2026-08-01' })).toEqual({ ok: false, reason: 'to may not be after the task’s day' })
    const { store } = await started()
    for (const lookup of ['moves', 'workouts', 'pathSteps', 'lines']) expect((await read(store, at('09:03'), { lookup, from: '2020-01-01' })).status, lookup).toBe(200)
    const { store: ordinary } = await started(record(), 'standard')
    expect(await read(ordinary, at('09:03'), { lookup: 'moves', from: '2020-01-01' }, 'ask')).toMatchObject({ status: 400, body: { error: 'from may reach back a year at most' } })
  })

  it('searches the notes from the record’s first day unless told otherwise; ordinary Ask from a year back', async () => {
    const { store } = await started()
    expect(factsOf(await read(store, at('09:03'), { lookup: 'noteWords', q: 'walked' }))[0].text).toContain('Your notes from 2026-08-01 to 2026-11-12 were searched')
    const { store: ordinary } = await started(record(), 'standard')
    expect(factsOf(await read(ordinary, at('09:03'), { lookup: 'noteWords', q: 'walked' }, 'ask'))[0].text).toContain('Your notes from 2025-11-11 to 2026-11-12 were searched')
    // With no record at all, the deep tier's search starts a year back as well.
    expect(parseLookupQuery(lookupUrl('lookup=noteWords&q=walked'), DAY, { first: null })).toMatchObject({ ok: true, query: { from: '2025-11-11' } })
  })

  it('lets a category’s read reach back past a year too; ordinary Ask keeps a year', async () => {
    const category = (q: string) => new URL(`https://w.test/claude/context?task=deep&day=${DAY}&${q}`)
    expect(parseContextQuery(category('category=notes&from=2020-01-01'), DAY)).toEqual({ ok: false, reason: 'from may reach back a year at most' })
    expect(parseContextQuery(category('category=notes&from=2020-01-01'), DAY, true)).toMatchObject({ ok: true, category: 'notes' })
    const { store } = await started()
    expect((await read(store, at('09:03'), { category: 'notes', from: '2020-01-01' })).status).toBe(200)
    const { store: ordinary } = await started(record(), 'standard')
    expect(await read(ordinary, at('09:03'), { category: 'notes', from: '2020-01-01' }, 'ask')).toMatchObject({ status: 400, body: { error: 'from may reach back a year at most' } })
  })
})

describe('the deep tier’s budget', () => {
  it('counts the write-ups and the parts beside its other reads, never against them, and logs each by count and size', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'writeups' })
    await read(store, at('09:04'), { lookup: 'monthSoFar', part: '1' })
    const t = await taskOf(store)
    expect([t.contextCalls, t.contextBytes]).toEqual([0, 0])
    expect(t.deep).toMatchObject({ reads: 2, parts: [1] })
    expect(t.deep?.bytes).toBeGreaterThan(1000)
    const reads = (await store.readReads(10)).filter((r) => r.category.startsWith('lookup.'))
    expect(reads.map((r) => r.category).sort()).toEqual(['lookup.monthSoFar', 'lookup.writeups'])
    expect(reads.every((r) => r.task === 'deep' && r.via === 'context' && r.count > 0 && r.bytes > 0)).toBe(true)
    expect(reads.reduce((n, r) => n + r.bytes, 0)).toBe(t.deep?.bytes)
    // By count and size alone: never a word of what was read.
    expect(JSON.stringify(reads)).not.toMatch(/dinner|walked|Saturdays/)
    // An ordinary lookup still counts as it did.
    await read(store, at('09:05'), { lookup: 'kinds' })
    expect((await taskOf(store)).contextCalls).toBe(1)
  })

  it('grows with the months, and stops: the months that have a write-up, sixteen parts, and four spare', async () => {
    expect([DEEP_SPARE_READS, deepReadsMost(0), deepReadsMost(2), deepReadsMost(16)]).toEqual([4, 20, 22, 36])
    const { store } = await started()
    for (let i = 0; i < 22; i++) expect((await read(store, at('09:03'), { lookup: 'writeups', month: '2026-09' })).status).toBe(200)
    expect(await read(store, at('09:04'), { lookup: 'writeups' })).toMatchObject({ status: 429, body: { error: 'at most 22 reads of the write-ups and the month under way a run' } })
    expect(await read(store, at('09:04'), { lookup: 'monthSoFar', part: '1' })).toMatchObject({ status: 429 })
    // Nothing else is raised: its other reads stop at twenty, as ordinary Ask's do.
    for (let i = 0; i < 20; i++) expect((await read(store, at('09:05'), { lookup: 'pattern', kind: 'chip.dinner' })).status).toBe(200)
    expect(await read(store, at('09:06'), { lookup: 'kinds' })).toMatchObject({ status: 429, body: { error: 'at most 20 reads a run' } })
  })
})

describe('which months it lacks', () => {
  it('is told in its briefing which months have a write-up, which is under way and which have none; and that is kept with what it was served', async () => {
    const { store } = await started()
    const b = (await briefing(store, at('09:02'))).body as { briefing: string; context: { besideThose: string[]; lookups: string[]; reach: string; failedRead: string } }
    expect(b.briefing).toContain('THE MONTHS\nA write-up can be read for: September 2026, October 2026 (lookup=writeups).\nThe month under way, November 2026, has no write-up yet: its record is read raw (lookup=monthSoFar&part=1).\nNo write-up can be read for: August 2026. When you cite a write-up, say that you have none for this month, by the month’s name.')
    expect(servedOf(store).deep.months).toEqual({ have: ['2026-09', '2026-10'], underWay: '2026-11', lacking: ['2026-08'] })
    // Its own two lookups are named beside the nine, with its reach and what a failed read costs.
    expect(b.context.lookups).toHaveLength(9)
    expect(b.context.besideThose.map((l) => l.split(/[ &]/)[0])).toEqual(['lookup=writeups', 'lookup=monthSoFar'])
    expect(b.context.reach).toBe('no limit: from may be any day, back to the record’s first')
    expect(b.context.failedRead).toBe('costs nothing: ask it once more, then go on without it and say so')
    // The briefing prints the day's sheet alone: nothing of a write-up is on it.
    expect(JSON.stringify(b)).not.toContain('writeups.2026')
    expect(servedOf(store).sheet.facts.map((f: Fact) => f.id)).toEqual(['week.today', 'record'])
  })

  it('says the months as they stand: none to read, none lacking, several lacking', () => {
    const f = (month: string, part: string): Fact => ({ id: `writeups.${month}.${part}.1`, tags: [], text: 'x', values: { month, part } })
    const stamps = [{ month: '2026-08', held: 3 }, { month: '2026-09', held: 40 }, { month: '2026-10', held: 0 }, { month: '2026-11', held: 20 }, { month: '2026-12', held: 2 }]
    // A month that holds nothing lacks nothing; the month under way and any after it are never lacking; a guess's count alone makes no month.
    expect(monthsOf([f('2026-09', 'recorded'), { ...f('2026-08', 'since'), id: 'writeups.2026-08.noticed.1.since' }], stamps, '2026-11-12')).toEqual({ have: ['2026-09'], underWay: '2026-11', lacking: ['2026-08'] })
    expect(monthsOf([], stamps, '2026-11-12')).toEqual({ have: [], underWay: '2026-11', lacking: ['2026-08', '2026-09'] })
    expect(monthsText({ have: [], underWay: '2026-11', lacking: ['2026-08', '2026-09'] })).toBe('THE MONTHS\nNo month has a write-up that can be read.\nThe month under way, November 2026, has no write-up yet: its record is read raw (lookup=monthSoFar&part=1).\nNo write-up can be read for: August 2026, September 2026. When you cite a write-up, say that you have none for each of these months, by the month’s name.')
    expect(monthsText({ have: ['2026-10'], underWay: '2026-11', lacking: [] })).toBe('THE MONTHS\nA write-up can be read for: October 2026 (lookup=writeups).\nThe month under way, November 2026, has no write-up yet: its record is read raw (lookup=monthSoFar&part=1).')
    expect(monthName('2027-01')).toBe('January 2027')
  })

  it('refuses an answer that cites a write-up and does not name a month that has none; one that cites none is not bound', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'writeups' })
    const silent = await post(store, at('09:05'), { ...RECORDED, text: RECORDED.text.replace(' I had no write-up for August.', '') })
    expect(silent.status).toBe(422)
    expect(reason(silent)).toBe('cites a monthly write-up without saying which months have none: say that no write-up could be read for August')
    expect(await post(store, at('09:06'), RECORDED)).toEqual({ status: 200, body: { ok: true } })
    const { store: other } = await started()
    expect(await post(other, at('09:05'), answer('Your record is still young.\n\nIt holds 56 days so far.', ['record']))).toEqual({ status: 200, body: { ok: true } })
  })

  it('holds each lacking month by its own name, with its capital', () => {
    expect(lackingRefusal('I had none for August or May.', [R1], ['2026-05', '2026-08'])).toBeNull()
    expect(lackingRefusal('I had none for August; it may be thin.', [R1], ['2026-05', '2026-08'])).toBe('cites a monthly write-up without saying which months have none: say that no write-up could be read for May')
    expect(lackingRefusal('Nothing is said.', [R1], ['2026-05', '2026-08'])).toBe('cites a monthly write-up without saying which months have none: say that no write-up could be read for May, August')
    expect(lackingRefusal('Nothing is said.', ['record'], ['2026-08'])).toBeNull()
    expect(lackingRefusal('Nothing is said.', [R1], [])).toBeNull()
  })

  it('adds the reason to the others, so one retry mends them all', async () => {
    const { store } = await started()
    await read(store, at('09:03'), { lookup: 'writeups' })
    const r = await post(store, at('09:05'), answer('One thing from October is worth knowing.\n\nLate dinners fall on Saturdays.', [N1]))
    expect(reason(r)).toBe('cites what Claude noticed without saying it is a guess: say "Claude noticed", "a guess", "may", "might" or "not tested"; and cites a monthly write-up without saying which months have none: say that no write-up could be read for August')
  })
})

describe('a failed read', () => {
  it('costs a deep run nothing and may be asked once more; ordinary Ask is as it was', async () => {
    const { store } = await started()
    const one = store.readRecord.bind(store)
    let down = true
    store.readRecord = async (s, id) => {
      if (down && s === 'patterns') throw new Error('down')
      return one(s, id)
    }
    const r = await read(store, at('09:03'), { lookup: 'pattern', kind: 'chip.dinner' })
    expect(r).toEqual({ status: 503, body: { error: 'the read could not be made', costs: 'nothing: a read that fails is not counted', retry: true, next: 'ask this read once more' } })
    expect(await taskOf(store)).toMatchObject({ contextCalls: 0, contextBytes: 0, deep: { reads: 0, failed: { 'kind=chip.dinner&lookup=pattern': 1 } } })
    expect((await read(store, at('09:04'), { lookup: 'pattern', kind: 'chip.dinner' })).body).toMatchObject({ retry: false })
    // The write-ups read the table too: failing, they cost nothing either.
    expect(await read(store, at('09:04'), { lookup: 'writeups' })).toMatchObject({ status: 503, body: { retry: true } })
    expect((await taskOf(store)).deep).toMatchObject({ reads: 0, failed: { 'writeups:all': 1 } })
    down = false
    expect((await read(store, at('09:05'), { lookup: 'pattern', kind: 'chip.dinner' })).status).toBe(200)
    expect((await taskOf(store)).contextCalls).toBe(1)
    // Ordinary Ask: the failure is the request's own, as before.
    const { store: ordinary } = await started(record(), 'standard')
    const two = ordinary.readRecord.bind(ordinary)
    ordinary.readRecord = async (s, id) => {
      if (s === 'patterns') throw new Error('down')
      return two(s, id)
    }
    await expect(read(ordinary, at('09:03'), { lookup: 'pattern', kind: 'chip.dinner' }, 'ask')).rejects.toThrow('down')
  })
})

describe('the longer answer, and what the deep tier is told', () => {
  it('is prompted to about 250 words and held to 450', async () => {
    expect(ASK_WORDS).toEqual({ ask: 220, deep: 450 })
    const told = askInstructions('deep', ASK_WORDS.deep, null)
    expect(told).toContain('"Coach me on everything" is a coaching read of the whole record, about 250 words in four or five short paragraphs')
    expect(told).toContain('the validator refuses more than 450 words')
    const { store } = await started()
    const b = (await briefing(store, at('09:02'))).body as { answer: { text: string }; instructions: string }
    expect(b.answer.text).toBe('the answer, at most 450 words')
    // The briefing's own instructions are those, with How firm beside them.
    expect(b.instructions).toContain('about 250 words in four or five short paragraphs')
    expect(b.instructions).toContain('the validator refuses more than 450 words')
    for (const rule of DEEP_RULES) expect(b.instructions).toContain(rule)
    // Held: 451 words are refused by their count.
    const long = answer(Array.from({ length: 451 }, () => 'word').join(' '), ['record'])
    expect(reason(await post(store, at('09:05'), long))).toContain('451 words; at most 450')
  })

  it('is told its four rules, word for word, and ordinary Ask none of them', () => {
    expect(DEEP_RULES).toHaveLength(4)
    const deep = askInstructions('deep', 450, null)
    const ask = askInstructions('ask', 220, null)
    for (const rule of DEEP_RULES) {
      expect(deep).toContain(rule)
      expect(ask).not.toContain(rule)
    }
    expect(ask).not.toMatch(/lookup=writeups|lookup=monthSoFar|THE MONTHS/)
    expect(deep).toContain('- Before you write, read the whole record as it is kept for you: every monthly write-up (lookup=writeups) and the month under way (lookup=monthSoFar&part=1, then each further part its reply names). These two do not count against your other reads.')
    expect(deep).toContain('One that says "Claude noticed" is a guess Claude made on reading the month, which nobody tested: it is never a fact. With one cited, say it is a guess, in one of these words: "Claude noticed", "a guess", "may", "might" or "not tested"; never call it the usual case ("usually", "most often", "tends to"), and never a cause.')
    expect(deep).toContain('- When you cite a write-up and THE MONTHS names months that have none, say in the answer that you had no write-up for each of them, naming the month by its name alone, with no year.')
    expect(deep).toContain('- A read that fails costs nothing: ask it once more. If it fails again, go on without it, and say in the answer what you could not read.')
  })
})

describe('privacy', () => {
  it('has a name on the phone for each of the two reads', () => {
    const labels = copy.brainScreen.readLabels as Record<string, string>
    expect(DEEP_LOOKUPS.map((l) => labels[`lookup.${l}`])).toEqual(['Lookup: your monthly write-ups', 'Lookup: this month so far'])
  })

  it('never reads the journal, and puts nothing on the day’s sheet', async () => {
    const store = record()
    put(store, 'journal', '1', '2026-11-10', { id: 1, night: '2026-11-10', text: 'a private night' })
    const stores: string[] = []
    const many = store.readRecords.bind(store)
    store.readRecords = async (s, range, limit) => {
      stores.push(s)
      return many(s, range, limit)
    }
    await started(store)
    const all = [await read(store, at('09:03'), { lookup: 'writeups' }), await read(store, at('09:04'), { lookup: 'monthSoFar', part: '1' })]
    expect(stores).toContain('noteMarks')
    expect(stores).toContain('checkins')
    expect(stores).not.toContain('journal')
    expect(JSON.stringify(all)).not.toContain('a private night')
    expect(servedOf(store).sheet.facts.map((f: Fact) => f.id)).toEqual(['week.today', 'record'])
    expect((JSON.parse(store.rows.get(`${APP}|facts|${DAY}`)?.body ?? 'null') as { sheet: FactSheet }).sheet.facts.map((f) => f.id)).toEqual(['week.today', 'record'])
  })
})
