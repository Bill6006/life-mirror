import { describe, expect, it } from 'vitest'
import { LACKED } from '../../src/brainShared'
import type { FactSheet } from '../../src/factTypes'
import catalogue from '../../src/catalogue.json'
import cards from '../../src/library.json'
import { runBrief, runReview } from './brief'
import { bearerOk, fallbackReason, fireText, handleBriefing, handleContext, handleLine, MAX_POSTS, surfaceGuard, taskIdOf } from './claude'
import handler from './index'
import { APP, BRAIN_APP, memoryStore, type TaskRow } from './turso'

// Claude writes the line; the Worker stays in charge (Parts 30 and 31), end to end against the
// store in memory, a routine stood in for, and a model stood in for when the free chain writes.

const env = {
  TIMEZONE: 'America/New_York',
  BRIEF_HOUR: '5',
  FALLBACK_TIME: '11:00',
  MODELS: 'model-a',
  LIBRARY_URL: 'https://example.test/library.json',
  CATALOGUE_URL: 'https://example.test/catalogue.json',
  CLAUDE_WRITER: 'on',
  CLAUDE_FIRE_URL: 'https://example.test/fire',
  CLAUDE_FIRE_TOKEN: 'fire-token',
  CLAUDE_TIMEOUT_MINUTES: '20',
}
const fetcher = (async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('catalogue') ? catalogue : cards), { headers: { 'content-type': 'application/json' } })) as typeof fetch
/** New York local times (UTC−4). */
const at = (hhmm: string, day = '2026-09-18') => new Date(`${day}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)
const DAY = '2026-09-18'
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekdayOf = (day: string) => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]
const next = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
/** Weekdays are daycare days; weekends are not. */
const daycare = (day: string) => !['Saturday', 'Sunday'].includes(weekdayOf(day))
const shape = (label: string, day: string) => `${label} ${weekdayOf(day)}; ${daycare(day) ? 'a daycare day with pickup at 17:30' : 'not a daycare day'}; at home; not a study night; her bedtime 20:00.`

function sheetFor(day: string, extra: FactSheet['facts'] = [], patch: Partial<FactSheet> = {}): FactSheet {
  return {
    version: 1,
    day,
    builtAt: `${day}T11:41:00.000Z`,
    hour: 7,
    weeks: 3,
    days: 22,
    direction: null,
    said: [{ day: '2026-09-17', source: 'phone', situationId: 'first-skill', text: 'The phone said this yesterday.', feedback: null }],
    checkedIn: { morning: `${day}T11:40:00.000Z` },
    shortlist: [{ situationId: 'cue-switch', mode: 'strategy', text: 'After her bedtime held 1 of 4.', factIds: ['aim.1'], cardIds: ['implementation-intentions'], score: 0.8 }],
    facts: [
      { id: 'week.today', tags: ['cue'], text: shape('Today is', day), values: { weekday: weekdayOf(day), daycare: daycare(day) ? 1 : 0, pickup: daycare(day) ? '17:30' : null, office: 0, church: 0, studyNight: 0 } },
      { id: 'week.tomorrow', tags: ['cue'], text: shape('Tomorrow is', next(day)), values: { day: next(day), weekday: weekdayOf(next(day)), daycare: daycare(next(day)) ? 1 : 0, pickup: daycare(next(day)) ? '17:30' : null, office: 0, church: 0, studyNight: 0 } },
      { id: 'aim.1', tags: ['study', 'cue'], text: 'French: planned after her bedtime at 20:00, not started; cues: after her bedtime started 1 of 4.', values: { name: 'French', cue_afterBedtime_n: 4, cue_afterBedtime_started: 1 }, n: 4 },
      { id: 'note.2026-09-17.evening', tags: ['writing'], text: 'On 2026-09-17, at the evening check-in, you wrote: “work was heavy”.', values: { day: '2026-09-17', block: 'evening', note: 'work was heavy' } },
      ...extra,
    ],
    ...patch,
  }
}

type Store = ReturnType<typeof memoryStore>
const put = (store: Store, app: string, s: string, id: string, day: string | null, body: unknown, when = '2026-09-18T11:41:00.000Z') => store.put({ app, store: s, id, day, body: JSON.stringify(body), updated_at: when, deleted: 0, synced_at: when })
function withSheet(sheet: FactSheet = sheetFor(DAY), store: Store = memoryStore()): Store {
  put(store, APP, 'facts', sheet.day, sheet.day, { day: sheet.day, builtAt: sheet.builtAt, updatedAt: sheet.builtAt, sheet }, sheet.builtAt)
  put(store, APP, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
  return store
}

/** A routine stood in for: every call recorded with what the store held at that moment. */
function routine(store: Store, status = 200, extra: Record<string, string> = {}) {
  const calls: { body: { text: string }; taskStatus: string | undefined; auth: string | null }[] = []
  const f = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body)), taskStatus: (await store.readTask(taskIdOf('line', DAY)))?.status ?? (await store.readTask(taskIdOf('review', '2026-09-20')))?.status, auth: new Headers(init?.headers).get('authorization') })
    return new Response(JSON.stringify(status < 300 ? { claude_code_session_url: 'https://claude.ai/code/session_x' } : { error: { message: status === 400 ? 'Routine is paused.' : 'limited' } }), { status, headers: extra })
  }) as typeof fetch
  return { f, calls }
}

const good = { mode: 'strategy', text: 'After her bedtime held 1 of 4 plans. Try the next check-in as the cue today.', factIds: ['aim.1'], cardIds: ['implementation-intentions'], action: { kind: 'plan', aimId: 1, cue: 'nextCheckIn' } }
const freeLine = JSON.stringify({ candidates: [{ mode: 'strategy', text: 'French waits after her bedtime; a smaller step at the next check-in may land better today.', factIds: ['aim.1'], cardIds: ['implementation-intentions'], action: null }] })
const freeRun = async () => ({ response: freeLine })
const briefOf = (store: Store, id: string) => JSON.parse(store.rows.get(`${BRAIN_APP}|briefs|${id}`)?.body ?? 'null')
const deps = (store: Store, now: Date) => ({ env, store, now, fetcher })
const url = (path: string, q: Record<string, string>) => new URL(`https://w.test${path}?${new URLSearchParams(q)}`)
const post = (store: Store, now: Date, answer: unknown, extra: Record<string, unknown> = {}) => handleLine(deps(store, now), { task: 'line', day: DAY, answer, askedModel: 'opus', writtenModel: 'claude-opus-5-5', runnerModel: 'claude-haiku-4-5-20251001', subagentError: null, ...extra })

async function fired(store: Store = withSheet(), now = at('07:45')) {
  const r = routine(store)
  await runBrief(env, store, freeRun, now, { fetcher, fireFetcher: r.f })
  return r
}

describe('the fire', () => {
  it('marks the day’s task before it fires, fires once with no personal text, and then waits', async () => {
    const store = withSheet()
    const r = routine(store)
    expect(await runBrief(env, store, freeRun, at('07:45'), { fetcher, fireFetcher: r.f })).toMatchObject({ wrote: false, reason: 'Claude is writing', writer: 'claude', trigger: 'checkin' })
    expect(r.calls).toHaveLength(1)
    expect(r.calls[0].taskStatus).toBe('firing')
    expect(r.calls[0].auth).toBe('Bearer fire-token')
    expect(r.calls[0].body.text).toBe(fireText('line', DAY, 'opus'))
    expect(r.calls[0].body.text).not.toMatch(/French|heavy|bedtime/)
    expect(await store.readTask(taskIdOf('line', DAY))).toMatchObject({ status: 'fired', askedModel: 'opus', trigger: 'checkin', factsDay: DAY, sessionUrl: 'https://claude.ai/code/session_x' })
    expect(await runBrief(env, store, freeRun, at('07:50'), { fetcher, fireFetcher: r.f })).toMatchObject({ wrote: false, reason: 'waiting for Claude' })
    expect(r.calls).toHaveLength(1)
  })

  it('asks for the writer model the Brain settings name, and Opus for anything outside the four', async () => {
    for (const [asked, sent] of [['haiku', 'haiku'], ['fable', 'fable'], ['best', 'opus'], ['claude-3-opus-20240229', 'opus']]) {
      const store = withSheet()
      put(store, APP, 'brainPrefs', 'prefs', null, { id: 'prefs', writerModel: asked, switches: {} })
      const r = routine(store)
      await runBrief(env, store, freeRun, at('07:45'), { fetcher, fireFetcher: r.f })
      expect(r.calls[0].body.text, asked).toContain(`model=${sent}`)
    }
  })

  it('falls to the free chain at once on a 429, a paused routine, a server error or no answer, and says why', async () => {
    const cases: [number, Record<string, string>, RegExp][] = [
      [429, { 'retry-after': '3600' }, /limited \(429, retry after 3600\)/],
      [400, {}, /refused the fire \(400: Routine is paused\.\)/],
      [503, {}, /server erred \(503\)/],
    ]
    for (const [status, headers, why] of cases) {
      const store = withSheet()
      const r = routine(store, status, headers)
      const out = await runBrief(env, store, freeRun, at('07:45'), { fetcher, fireFetcher: r.f })
      expect(out, String(status)).toMatchObject({ wrote: true, writer: 'free' })
      expect(out.fallback).toMatch(why)
      expect(briefOf(store, `${DAY}:brief`)).toMatchObject({ writer: 'free', model: 'model-a' })
      expect(briefOf(store, `${DAY}:brief`).fallback).toMatch(why)
      expect(await store.readTask(taskIdOf('line', DAY))).toMatchObject({ status: 'fallback', writer: 'free', fireStatus: status })
    }
    const store = withSheet()
    const down = (async () => {
      throw new Error('network down')
    }) as typeof fetch
    const out = await runBrief(env, store, freeRun, at('07:45'), { fetcher, fireFetcher: down })
    expect(out).toMatchObject({ wrote: true, writer: 'free' })
    expect(out.fallback).toMatch(/did not reach the routine \(network down\)/)
  })

  it('lets the free chain write at the first tick twenty minutes after the fire with no valid line', async () => {
    const store = withSheet()
    await fired(store)
    expect(await runBrief(env, store, freeRun, at('08:04'), { fetcher })).toMatchObject({ wrote: false, reason: 'waiting for Claude' })
    const out = await runBrief(env, store, freeRun, at('08:05'), { fetcher })
    expect(out).toMatchObject({ wrote: true, writer: 'free', fallback: 'no valid line from Claude within 20 minutes' })
    expect(await store.readTask(taskIdOf('line', DAY))).toMatchObject({ status: 'fallback', writer: 'free', fallbackReason: 'no valid line from Claude within 20 minutes' })
    // Claude's line arriving late is refused: the day's line is written.
    expect((await post(store, at('08:10'), good)).status).toBe(409)
  })

  it('keeps Claude’s line when it lands while the free chain is writing in its place', async () => {
    const store = withSheet()
    await fired(store)
    // The chain starts at the twenty-minute tick; Claude’s line lands before the chain stores its own.
    const racing = async () => {
      await post(store, at('08:05'), good)
      return { response: freeLine }
    }
    expect(await runBrief(env, store, racing, at('08:05'), { fetcher })).toMatchObject({ wrote: false, reason: 'written already' })
    expect(briefOf(store, `${DAY}:brief`)).toMatchObject({ writer: 'claude', text: good.text })
    expect(await store.readTask(taskIdOf('line', DAY))).toMatchObject({ status: 'written', writer: 'claude' })
  })

  it('writes with the free chain alone while Claude is switched off, as before Part 30', async () => {
    const store = withSheet()
    const r = routine(store)
    const out = await runBrief({ ...env, CLAUDE_WRITER: 'off' }, store, freeRun, at('07:45'), { fetcher, fireFetcher: r.f })
    expect(out).toMatchObject({ wrote: true, writer: 'free' })
    expect(out.fallback).toBeUndefined()
    expect(r.calls).toHaveLength(0)
  })

  it('reads its fallback reason from the task alone', () => {
    const t: TaskRow = { id: 'task:x', kind: 'task', task: 'line', day: DAY, at: '2026-09-18T11:45:00.000Z', firedAt: '2026-09-18T11:45:00.000Z', status: 'fired', trigger: 'checkin', factsDay: DAY, askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 0, refusals: [] }
    expect(fallbackReason(t, new Date('2026-09-18T12:04:59Z'), 20)).toBeNull()
    expect(fallbackReason(t, new Date('2026-09-18T12:05:00Z'), 20)).toBe('no valid line from Claude within 20 minutes')
    expect(fallbackReason({ ...t, status: 'refused' }, new Date('2026-09-18T11:46:00Z'), 20)).toBe('Claude’s line was refused twice')
    expect(fallbackReason({ ...t, status: 'written' }, new Date('2026-09-19T11:46:00Z'), 20)).toBeNull()
  })
})

describe('the briefing', () => {
  it('serves the day’s briefing, its rules and the answer’s shape, with private context read and logged, never its content', async () => {
    const store = withSheet()
    put(store, APP, 'reflections', '7', '2026-09-16', { id: 7, path: 'social', kind: 'reflection', day: '2026-09-16', text: 'A long talk with a neighbour.', createdAt: '', updatedAt: '' })
    put(store, APP, 'checkins', '40', '2026-09-15', { id: 40, day: '2026-09-15', block: 'evening', answers: {}, extras: { note: 'slept badly again' } })
    await fired(store)
    const r = await handleBriefing(deps(store, at('07:47')), url('/claude/briefing', { task: 'line', day: DAY }))
    expect(r.status).toBe(200)
    const b = r.body as { instructions: string; briefing: string; askedModel: string; attemptsLeft: number; context: { categories: string[]; maxCalls: number } }
    expect(b.askedModel).toBe('opus')
    expect(b.attemptsLeft).toBe(MAX_POSTS)
    expect(b.instructions).toContain('Reading is not showing')
    expect(b.briefing).toContain('[aim.1] French')
    expect(b.briefing).toContain('A long talk with a neighbour.')
    expect(b.briefing).toContain('slept badly again')
    expect(b.briefing).toContain("private items' names may not be shown")
    expect(b.context.categories).not.toContain('monthlyCheck')
    expect(b.context.maxCalls).toBe(20)
    const reads = [...store.rows.values()].filter((row) => row.app === BRAIN_APP && row.store === 'reads').map((row) => JSON.parse(row.body ?? '{}'))
    expect(reads.length).toBeGreaterThan(0)
    for (const read of reads) expect(Object.keys(read).sort()).toEqual(['at', 'bytes', 'category', 'count', 'day', 'id', 'task', 'via'])
    expect(reads.find((x) => x.category === 'reflections')).toMatchObject({ count: 1, via: 'briefing', task: 'line' })
    expect(JSON.stringify(reads)).not.toContain('neighbour')
  })

  it('answers 409 with no open task, once the line is written, and on a sheet for another day', async () => {
    const store = withSheet()
    expect((await handleBriefing(deps(store, at('07:47')), url('/claude/briefing', { task: 'line', day: DAY }))).status).toBe(409)
    await fired(store)
    expect((await post(store, at('07:48'), good)).status).toBe(200)
    expect((await handleBriefing(deps(store, at('07:49')), url('/claude/briefing', { task: 'line', day: DAY }))).status).toBe(409)
    // A task whose sheet is two days before the day it is for: refused, whoever asks.
    const old = withSheet(sheetFor('2026-09-16', [], { builtAt: '2026-09-18T01:00:00.000Z' }))
    await old.writeTask({ id: taskIdOf('line', DAY), kind: 'task', task: 'line', day: DAY, at: '2026-09-18T11:45:00.000Z', firedAt: '2026-09-18T11:45:00.000Z', status: 'fired', trigger: 'fallback', factsDay: '2026-09-16', askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 0, refusals: [] })
    const r = await handleBriefing(deps(old, at('07:47')), url('/claude/briefing', { task: 'line', day: DAY }))
    expect(r).toMatchObject({ status: 409, body: { error: 'the sheet is for 2026-09-16, not 2026-09-18 or the day before it' } })
  })

  it('refuses to serve a day whose line another writer stored meanwhile, and a task whose posts are used up', async () => {
    const store = withSheet()
    await fired(store)
    // A line forced by hand while Claude’s task was open: the day is written, so Claude is not served it.
    await store.writeBrief({ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'A line forced by hand.', mode: 'observation', factIds: ['aim.1'], cardIds: [], model: 'model-a', at: '2026-09-18T11:50:00.000Z', factsDay: DAY }, '2026-09-18T11:50:00.000Z')
    expect(await handleBriefing(deps(store, at('07:51')), url('/claude/briefing', { task: 'line', day: DAY }))).toEqual({ status: 409, body: { error: 'the line for 2026-09-18 is written already' } })
    expect((await post(store, at('07:52'), good)).status).toBe(409)
    // A task still open whose two posts are spent, whatever led there, takes no third.
    const spent = withSheet()
    await fired(spent)
    const t = await spent.readTask(taskIdOf('line', DAY))
    await spent.writeTask({ ...(t as TaskRow), posts: MAX_POSTS })
    expect(await post(spent, at('07:50'), good)).toEqual({ status: 409, body: { error: 'no attempts left' } })
  })

  it('refuses a task or day it does not know the shape of', async () => {
    const store = withSheet()
    expect((await handleBriefing(deps(store, at('07:47')), url('/claude/briefing', { task: 'everything', day: DAY }))).status).toBe(400)
    expect((await handleBriefing(deps(store, at('07:47')), url('/claude/briefing', { task: 'coach', day: DAY }))).status).toBe(409)
    expect((await handleBriefing(deps(store, at('07:47')), url('/claude/briefing', { task: 'line', day: '18-09-2026' }))).status).toBe(400)
  })
})

describe('the line Claude posts back', () => {
  it('is stored with who wrote it, asked for and run by, once', async () => {
    const store = withSheet()
    await fired(store)
    expect(await post(store, at('07:48'), good)).toEqual({ status: 200, body: { ok: true } })
    expect(briefOf(store, `${DAY}:brief`)).toMatchObject({ writer: 'claude', model: 'claude-opus-5-5', askedModel: 'opus', runnerModel: 'claude-haiku-4-5-20251001', trigger: 'checkin', factsDay: DAY, forDay: DAY, text: good.text, action: good.action })
    expect(await store.readTask(taskIdOf('line', DAY))).toMatchObject({ status: 'written', writer: 'claude', writtenModel: 'claude-opus-5-5', posts: 1, latencyMs: 180_000 })
    expect((await post(store, at('07:49'), good)).status).toBe(409)
    expect(await runBrief(env, store, freeRun, at('08:30'), { fetcher })).toMatchObject({ wrote: false, reason: 'written already' })
  })

  it('keeps what Claude said it lacked, known ids only, each once, at most three, and never refuses a line over it (Part 34)', async () => {
    const store = withSheet()
    await fired(store)
    expect(await post(store, at('07:48'), { ...good, lacked: ['workoutDetail', 'bogus', 'workoutDetail', 'notes', 'sleepDetail', 'people'] })).toEqual({ status: 200, body: { ok: true } })
    expect(briefOf(store, `${DAY}:brief`).lacked).toEqual(['workoutDetail', 'notes', 'sleepDetail'])
    const other = withSheet()
    await fired(other)
    expect(await post(other, at('07:48'), { ...good, lacked: 'everything' })).toEqual({ status: 200, body: { ok: true } })
    expect(briefOf(other, `${DAY}:brief`).lacked).toBeUndefined()
  })

  it('tells Claude the list it may name what it lacked from, and shows the field in the answer’s shape (Part 34)', async () => {
    const store = withSheet()
    await fired(store)
    const b = (await handleBriefing(deps(store, at('07:46')), url('/claude/briefing', { task: 'line', day: DAY }))).body as { instructions: string; answer: Record<string, unknown> }
    for (const id of LACKED) expect(b.instructions).toContain(id)
    expect(b.instructions).toMatch(/never decides whether your answer is accepted/)
    expect(b.answer).toHaveProperty('lacked')
  })

  it('refuses an invalid line with its reason, allows one corrected retry, and after two refusals the free chain writes', async () => {
    const store = withSheet()
    await fired(store)
    const bad = { ...good, text: 'You failed again at French.' }
    expect(await post(store, at('07:48'), bad)).toEqual({ status: 422, body: { ok: false, reason: 'uses the word "failed"', retry: true } })
    expect(await post(store, at('07:49'), { ...good, text: 'French: 99 plans.' })).toEqual({ status: 422, body: { ok: false, reason: 'the number 99 is not in the cited facts', retry: false } })
    expect(await store.readTask(taskIdOf('line', DAY))).toMatchObject({ status: 'refused', posts: 2 })
    expect((await post(store, at('07:50'), good)).status).toBe(409)
    expect(await runBrief(env, store, freeRun, at('08:00'), { fetcher })).toMatchObject({ wrote: true, writer: 'free', fallback: 'Claude’s line was refused twice' })
  })

  it('applies the day guard to Claude as to any writer: a pickup named on a Saturday is refused', async () => {
    // Friday's sheet, the line written for Saturday from the fallback hour: the day guard reads Saturday's shape.
    const store = withSheet(sheetFor(DAY, [], { checkedIn: {} }))
    const sat = '2026-09-19'
    const r = routine(store)
    await runBrief(env, store, freeRun, at('11:00', sat), { fetcher, fireFetcher: r.f })
    const t = await store.readTask(taskIdOf('line', sat))
    expect(t).toMatchObject({ status: 'fired', trigger: 'fallback', factsDay: DAY })
    const out = await handleLine(deps(store, at('11:02', sat)), { task: 'line', day: sat, answer: { ...good, text: 'After pickup, give French ten minutes.', action: null } })
    expect(out).toMatchObject({ status: 422, body: { ok: false, retry: true } })
    expect((out.body as { reason: string }).reason).toMatch(/speaks of pickup or daycare, which Saturday 2026-09-19 does not hold/)
  })

  it('keeps private names off the phone while they may not be shown, and speaks of dating only when the Partner path bears on the day', async () => {
    const store = withSheet()
    put(store, APP, 'privateItems', '3', null, { id: 3, name: 'Pottery', createdAt: '', archived: 0 })
    await fired(store)
    expect(await post(store, at('07:48'), { ...good, text: 'Pottery waits after her bedtime; try the next check-in today, 1 of 4 so far.' })).toMatchObject({ status: 422, body: { reason: 'names a private item while "Show private items by name outside this screen" is off' } })
    expect(await post(store, at('07:49'), { ...good, text: 'Before your date tonight, French at the next check-in held 1 of 4.' })).toMatchObject({ status: 422, body: { reason: 'speaks of dating or a partner when nothing on the Partner path bears on it' } })
    expect(surfaceGuard('Enjoy your date; after her bedtime held 1 of 4.', { names: [], bears: true })).toBeNull()
    expect(surfaceGuard('No dates this week, and that is fine.', { names: [], bears: true })).toBe('speaks of dating from what did not happen')
  })

  it('lets a date declared for the day bear on the line', async () => {
    const store = withSheet()
    put(store, APP, 'pathMarks', '9', DAY, { id: 9, path: 'partner', kind: 'date', day: DAY, at: '' })
    await fired(store)
    expect((await post(store, at('07:48'), { ...good, text: 'Before your date tonight, French at the next check-in held 1 of 4; keep it short.' })).status).toBe(200)
  })
})

describe('reading on demand', () => {
  it('reads one permitted category at a time, filtered, capped at twenty reads a run, and logged without content', async () => {
    const store = withSheet()
    for (let i = 1; i <= 5; i++) put(store, APP, 'checkins', `c${i}`, `2026-09-1${i}`, { id: i, day: `2026-09-1${i}`, block: 'evening', answers: {}, extras: { note: `note number ${i}` } })
    await fired(store)
    const q = (extra: Record<string, string>) => handleContext(deps(store, at('07:47')), url('/claude/context', { task: 'line', day: DAY, ...extra }))
    const r = await q({ category: 'notes', q: 'number 3' })
    expect(r).toMatchObject({ status: 200, body: { category: 'notes', items: [{ day: '2026-09-13', text: 'at the evening check-in you wrote: “note number 3”' }], truncated: false } })
    const logged = [...store.rows.values()].filter((row) => row.store === 'reads').map((row) => JSON.parse(row.body ?? '{}'))
    expect(logged).toMatchObject([{ category: 'notes', count: 1, via: 'context' }])
    expect(JSON.stringify(logged)).not.toContain('number 3')
    for (let i = 1; i < 20; i++) expect((await q({ category: 'notes' })).status).toBe(200)
    expect(await q({ category: 'notes' })).toEqual({ status: 429, body: { error: 'at most 20 reads a run' } })
  })

  it('refuses an invented category, one the task never reads, one switched off, and any parameter the layer does not name, so no request can gather several people', async () => {
    const store = withSheet()
    put(store, APP, 'brainPrefs', 'prefs', null, { id: 'prefs', writerModel: 'opus', switches: { reflections: false } })
    await fired(store)
    const q = (extra: Record<string, string>) => handleContext(deps(store, at('07:47')), url('/claude/context', { task: 'line', day: DAY, ...extra }))
    expect((await q({ category: 'everything' })).status).toBe(400)
    expect((await q({ category: 'monthlyCheck' })).status).toBe(403)
    expect((await q({ category: 'coachCore' })).status).toBe(403)
    expect((await q({ category: 'reflections' })).status).toBe(403)
    expect(await q({ category: 'notes', person: 'anyone' })).toEqual({ status: 400, body: { error: 'unknown parameter "person"' } })
    expect((await q({ category: 'notes', from: '2020-01-01' })).status).toBe(400)
    expect((await q({ category: 'notes', to: '2026-09-30' })).status).toBe(400)
  })
})

describe('the Sunday review through the same bridge (Part 31)', () => {
  const SUN = '2026-09-20'
  const reviewAnswer = { held: 'French held 1 of 4 plans after her bedtime.', didNot: 'Most plans after her bedtime did not start.', change: 'Try the next check-in as the cue this week.', factIds: ['aim.1'], cardIds: ['implementation-intentions'] }

  it('fires at the hour, reads the week, keeps the Partner path to acts done and the monthly check out, and stores Claude’s three parts', async () => {
    const store = withSheet(sheetFor('2026-09-19', [], { builtAt: '2026-09-20T01:00:00.000Z' }))
    put(store, APP, 'monthlyChecks', '1', '2026-09-19', { id: 1, month: '2026-09', day: '2026-09-19', answers: { safety: false, conduct: false, doubt: true }, at: '' })
    put(store, APP, 'offers', '50', '2026-09-18', { id: 50, day: '2026-09-18', moveId: 'talk-ordinary-week', paths: ['partner'], skippedAt: null })
    put(store, APP, 'outcomes', '60', '2026-09-18', { id: 60, offerId: 50, day: '2026-09-18', outcome: 'done' })
    put(store, APP, 'offers', '51', '2026-09-17', { id: 51, day: '2026-09-17', moveId: 'talk-your-people', paths: ['partner'], skippedAt: null })
    put(store, APP, 'outcomes', '61', '2026-09-17', { id: 61, offerId: 51, day: '2026-09-17', outcome: 'no' })
    const r = routine(store)
    expect(await runReview(env, store, freeRun, at('05:00', SUN), { fetcher, fireFetcher: r.f })).toMatchObject({ wrote: false, reason: 'Claude is writing' })
    expect(r.calls[0].body.text).toBe(fireText('review', SUN, 'opus'))
    const b = await handleBriefing(deps(store, at('05:02', SUN)), url('/claude/briefing', { task: 'review', day: SUN }))
    const text = (b.body as { briefing: string }).briefing
    expect(text).toContain('Talk about a good ordinary week, done')
    expect(text).not.toContain('Talk about the people in your lives')
    expect(text).not.toMatch(/monthly check|doubt/i)
    const out = await handleLine(deps(store, at('05:03', SUN)), { task: 'review', day: SUN, answer: reviewAnswer, askedModel: 'opus', writtenModel: 'claude-opus-5-5' })
    expect(out.status).toBe(200)
    expect(briefOf(store, `${SUN}:review`)).toMatchObject({ kind: 'review', writer: 'claude', parts: { held: reviewAnswer.held, didNot: reviewAnswer.didNot, change: reviewAnswer.change }, trigger: 'sunday' })
  })

  it('refuses a review that counts dates that did not happen, and falls back after the time even past the hour', async () => {
    const store = withSheet(sheetFor('2026-09-19', [], { builtAt: '2026-09-20T01:00:00.000Z' }))
    const r = routine(store)
    await runReview(env, store, freeRun, at('05:45', SUN), { fetcher, fireFetcher: r.f })
    const out = await handleLine(deps(store, at('05:50', SUN)), { task: 'review', day: SUN, answer: { ...reviewAnswer, didNot: 'No dates this week.' } })
    expect(out).toMatchObject({ status: 422, body: { reason: 'speaks of dating from what did not happen', retry: true } })
    const freeReview = async () => ({ response: JSON.stringify(reviewAnswer) })
    expect(await runReview(env, store, freeReview, at('06:05', SUN), { fetcher })).toMatchObject({ wrote: true, writer: 'free', fallback: 'no valid line from Claude within 20 minutes' })
  })
})

describe('the keyed door', () => {
  it('opens only for the bridge key the agent proxy adds, compared in constant time', async () => {
    expect(bearerOk('Bearer k'.repeat(1), 'k')).toBe(true)
    expect(bearerOk('Bearer x', 'k')).toBe(false)
    expect(bearerOk(null, 'k')).toBe(false)
    expect(bearerOk('Bearer k', undefined)).toBe(false)
    const bare = { CLAUDE_BRIDGE_KEY: 'bridge-key', TURSO_URL: 'https://db.test', TURSO_TOKEN: 't' } as unknown as Parameters<NonNullable<typeof handler.fetch>>[1]
    for (const path of ['/claude/briefing?task=line&day=2026-09-18', '/claude/context?task=line&day=2026-09-18&category=notes']) {
      const r = await handler.fetch!(new Request(`https://w.test${path}`) as never, bare, {} as never)
      expect(r.status, path).toBe(401)
    }
    const r = await handler.fetch!(new Request('https://w.test/claude/line', { method: 'POST', headers: { authorization: 'Bearer wrong' }, body: '{}' }) as never, bare, {} as never)
    expect(r.status).toBe(401)
    expect((await handler.fetch!(new Request('https://w.test/claude/ping') as never, bare, {} as never)).status).toBe(401)
    expect((await handler.fetch!(new Request('https://w.test/run/claude-fire?key=x') as never, bare, {} as never)).status).toBe(404)
    // The reports answer only the run key.
    for (const path of ['/run/reads-report', '/run/bridge-report', '/run/brief-report']) expect((await handler.fetch!(new Request(`https://w.test${path}?key=nope`) as never, { ...bare, RUN_KEY: 'run-key' } as never, {} as never)).status, path).toBe(404)
  })
})

describe('how Life Mirror is used, while its gate is closed (Follow-up F1)', () => {
  const usage: FactSheet['facts'] = [
    { id: 'usage.line', tags: [], text: 'The line’s one tap: offered on 5 of the 7 days to yesterday, taken on 2 of them. Why under the line: opened 4 times.', values: { days: 7, offered: 5, taken: 2, why: 4 } },
    { id: 'usage.screens', tags: [], text: 'Screens in the 28 days to yesterday: opened most, Now 40.', values: { days: 28, often: 'Now 40', rarely: '', never: '', neverDays: 56 } },
  ]

  it('serves a briefing with none of it, the same as a sheet without it, and logs no read of it', async () => {
    const store = withSheet(sheetFor(DAY, usage))
    await fired(store)
    const r = await handleBriefing(deps(store, at('07:47')), url('/claude/briefing', { task: 'line', day: DAY }))
    expect(r.status).toBe(200)
    const b = r.body as { briefing: string; context: { categories: string[] } }
    expect(b.briefing).not.toContain('usage.')
    expect(b.briefing).not.toContain('HOW LIFE MIRROR IS USED')
    expect(b.context.categories).not.toEqual(expect.arrayContaining(['usage']))
    expect(b.context.categories).not.toContain('usageEvents')
    const plain = withSheet(sheetFor(DAY))
    await fired(plain)
    const p = (await handleBriefing(deps(plain, at('07:47')), url('/claude/briefing', { task: 'line', day: DAY }))).body as { briefing: string }
    expect(b.briefing).toBe(p.briefing)
    const reads = [...store.rows.values()].filter((row) => row.app === BRAIN_APP && row.store === 'reads').map((row) => JSON.parse(row.body ?? '{}').category)
    expect(reads).not.toContain('usage')
  })

  it('refuses a read of it on demand, counts and events alike, and logs nothing', async () => {
    const store = withSheet(sheetFor(DAY, usage))
    await fired(store)
    const q = (category: string) => handleContext(deps(store, at('07:47')), url('/claude/context', { task: 'line', day: DAY, category }))
    expect(await q('usage')).toEqual({ status: 403, body: { error: 'the line task may not read usage' } })
    expect(await q('usageEvents')).toEqual({ status: 403, body: { error: 'the line task may not read usageEvents' } })
    expect([...store.rows.values()].filter((row) => row.store === 'reads')).toEqual([])
  })
})
