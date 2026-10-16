import { describe, expect, it } from 'vitest'
import { readBrainPrefs } from '../../src/brainShared'
import type { FactSheet } from '../../src/factTypes'
import catalogue from '../../src/catalogue.json'
import cards from '../../src/library.json'
import { permitted } from './briefing'
import { runBrief, runReview } from './brief'
import { handleBriefing, handleContext, handleLine, servedEntries, taskIdOf } from './claude'
import { accessFor, contextFor, gatesFrom, JOURNAL_BRIEF_CHARS, loadCatalogue, parseContextQuery, readCategory } from './retrieval'
import { APP, BRAIN_APP, memoryStore } from './turso'

// Let it out's Brain use (agreed 2026-10-15): Claude's line and Sunday review read the journal under its
// own switch, the free models never; it reaches the whole record; and a line drawing on it is held to the
// never-evidence rule by the Worker's check, end to end against the store in memory.

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
const at = (hhmm: string, day = DAY) => new Date(`${day}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)
const DAY = '2026-09-18'
const SUN = '2026-09-20'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const next = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

function sheetFor(day: string, builtAt = `${day}T11:41:00.000Z`): FactSheet {
  const weekday = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]
  const daycare = weekday !== 'Saturday' && weekday !== 'Sunday'
  const tomorrow = WEEKDAYS[new Date(`${next(day)}T12:00:00Z`).getUTCDay()]
  const daycareTomorrow = tomorrow !== 'Saturday' && tomorrow !== 'Sunday'
  return {
    version: 1,
    day,
    builtAt,
    hour: 7,
    weeks: 3,
    days: 22,
    direction: null,
    said: [],
    checkedIn: { morning: builtAt },
    shortlist: [],
    facts: [
      { id: 'week.today', tags: ['cue'], text: `Today is ${weekday}; ${daycare ? 'a daycare day with pickup at 17:30' : 'not a daycare day'}; at home; not a study night; her bedtime 20:00.`, values: { weekday, daycare: daycare ? 1 : 0, pickup: daycare ? '17:30' : null, office: 0, church: 0, studyNight: 0, bedtime: '20:00' } },
      { id: 'week.tomorrow', tags: ['cue'], text: `Tomorrow is ${tomorrow}; ${daycareTomorrow ? 'a daycare day with pickup at 17:30' : 'not a daycare day'}; at home; not a study night; her bedtime 20:00.`, values: { day: next(day), weekday: tomorrow, daycare: daycareTomorrow ? 1 : 0, pickup: daycareTomorrow ? '17:30' : null, bedtime: '20:00', office: 0, church: 0, studyNight: 0 } },
      { id: 'aim.1', tags: ['study', 'cue'], text: 'Veltish: planned after her bedtime at 20:00, not started; cues: after her bedtime started 1 of 4.', values: { name: 'Veltish', cue_afterBedtime_n: 4, cue_afterBedtime_started: 1 }, n: 4 },
    ],
  }
}

type Store = ReturnType<typeof memoryStore>
const put = (store: Store, s: string, id: string, day: string | null, body: unknown, when = '2026-09-18T11:41:00.000Z') => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: when, deleted: 0, synced_at: when })
const entry = (store: Store, id: number, day: string, text: string) => put(store, 'journal', String(id), day, { id, day, text, writtenAt: `${day}T02:00:00.000Z`, editedAt: null, updatedAt: `${day}T02:00:00.000Z` })

/** A record with a week of nights in the journal, one about faith, and one from two springs back. */
function record(sheet: FactSheet = sheetFor(DAY), settings: Record<string, unknown> = {}, prefs?: unknown): Store {
  const store = memoryStore()
  put(store, 'facts', sheet.day, sheet.day, { day: sheet.day, builtAt: sheet.builtAt, updatedAt: sheet.builtAt, sheet }, sheet.builtAt)
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false, ...settings })
  if (prefs) put(store, 'brainPrefs', 'prefs', null, prefs)
  entry(store, 1, '2026-09-17', 'Work ran late again and I felt like I was letting everyone down at home.')
  entry(store, 2, '2026-09-16', 'Prayed before bed and felt calmer than I have all week.')
  entry(store, 3, '2026-09-15', 'A better day. The walk after dinner cleared my head.')
  entry(store, 4, '2024-03-02', 'First spring walk by the river, cold but bright, and nobody needed anything from me.')
  return store
}

function routine() {
  return (async () => new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_x' }), { status: 200 })) as typeof fetch
}
const deps = (store: Store, now: Date) => ({ env, store, now, fetcher })
const url = (path: string, q: Record<string, string>) => new URL(`https://w.test${path}?${new URLSearchParams(q)}`)
const briefOf = (store: Store, id: string) => JSON.parse(store.rows.get(`${BRAIN_APP}|briefs|${id}`)?.body ?? 'null')
const base = { mode: 'strategy', factIds: ['aim.1'], cardIds: ['implementation-intentions'], action: { kind: 'plan', aimId: 1, cue: 'nextCheckIn' }, firmness: 'balanced' }
const tail = 'After her bedtime held 1 of 4 plans; try the next check-in as the cue today.'
const post = (store: Store, now: Date, answer: unknown) => handleLine(deps(store, now), { task: 'line', day: DAY, answer, askedModel: 'opus', writtenModel: 'claude-opus-5-5' })

async function briefed(store: Store) {
  await runBrief(env, store, async () => ({ response: '' }), at('07:45'), { fetcher, fireFetcher: routine() })
  return handleBriefing(deps(store, at('07:46')), url('/claude/briefing', { task: 'line', day: DAY }))
}

describe('who may read the journal', () => {
  const gates = gatesFrom({ hideFaith: false })
  it('Claude’s line and review alone, under its own switch; never the free models, the coach or the skill coach', () => {
    expect(permitted('line', 'claude', 'journal', gates)).toBe(true)
    expect(permitted('review', 'claude', 'journal', gates)).toBe(true)
    for (const task of ['coach', 'skill', 'progress'] as const) expect(permitted(task, 'claude', 'journal', gates)).toBe(false)
    for (const task of ['line', 'review'] as const) expect(permitted(task, 'free', 'journal', gates)).toBe(false)
    const off = readBrainPrefs({ switches: { journal: false } })
    expect(off.switches).toEqual({ journal: false })
    expect(permitted('line', 'claude', 'journal', gates, off.switches)).toBe(false)
    // Its own switch: turning the check-in notes off leaves the journal as it was, and the other way round.
    expect(permitted('line', 'claude', 'journal', gates, readBrainPrefs({ switches: { notes: false } }).switches)).toBe(true)
    expect(permitted('line', 'claude', 'notes', gates, off.switches)).toBe(true)
  })
})

describe('reading the journal', () => {
  const x = async (store: Store, hideFaith = false) => ({ store, catalogue: await loadCatalogue(env.CATALOGUE_URL, fetcher), a: accessFor('line', gatesFrom({ hideFaith }), readBrainPrefs(null)) })

  it('gives each night whole with its night, newest first, as what was written; a night about faith only while faith may be read', async () => {
    const store = record()
    const all = await readCategory(await x(store), 'journal', { from: '2026-09-11', to: DAY, limit: 10 })
    expect(all).toEqual([
      { day: '2026-09-17', text: 'in your journal that night you wrote: “Work ran late again and I felt like I was letting everyone down at home.”' },
      { day: '2026-09-16', text: 'in your journal that night you wrote: “Prayed before bed and felt calmer than I have all week.”' },
      { day: '2026-09-15', text: 'in your journal that night you wrote: “A better day. The walk after dinner cleared my head.”' },
    ])
    const hidden = await readCategory(await x(store, true), 'journal', { from: '2026-09-11', to: DAY, limit: 10 })
    expect(hidden?.map((i) => i.day)).toEqual(['2026-09-17', '2026-09-15'])
  })

  it('reaches the whole record, not a year, and a keyword searches the words written, not the label they are read under', async () => {
    const store = record()
    const q = parseContextQuery(url('/claude/context', { task: 'line', day: DAY, category: 'journal', from: '2020-01-01', q: 'walk' }), DAY)
    expect(q.ok).toBe(true)
    if (!q.ok) return
    expect((await readCategory(await x(store), 'journal', q.q))?.map((i) => i.day)).toEqual(['2026-09-15', '2024-03-02'])
    expect(await readCategory(await x(store), 'journal', { ...q.q, q: 'journal' })).toEqual([])
    // Words the database cannot cut by first (a curly quote) are searched in the words written alone, not the label.
    expect(await readCategory(await x(store), 'journal', { ...q.q, q: 'wrote: “' })).toEqual([])
    // Every other category keeps its year.
    expect(parseContextQuery(url('/claude/context', { task: 'line', day: DAY, category: 'notes', from: '2020-01-01' }), DAY)).toEqual({ ok: false, reason: 'from may reach back a year at most' })
  })

  it('briefs a long night only up to its cut, and says where to read the rest; read on demand it is whole', async () => {
    const store = record()
    const long = `${'The day kept going and going. '.repeat(60)}And then it stopped.`
    entry(store, 5, '2026-09-14', long)
    const ctx = await contextFor(store, await loadCatalogue(env.CATALOGUE_URL, fetcher), accessFor('line', gatesFrom({ hideFaith: false }), readBrainPrefs(null)), DAY, 'run', at('07:46'))
    const line = ctx.text.split('\n').find((l) => l.startsWith('- 2026-09-14')) ?? ''
    expect(line).toContain('(cut here; read it whole with category=journal, from and to 2026-09-14)')
    expect(line).not.toContain('And then it stopped.')
    expect(line.length).toBeLessThan(JOURNAL_BRIEF_CHARS + 200)
    expect(ctx.journal).toEqual(['2026-09-17', '2026-09-16', '2026-09-15', '2026-09-14'])
    const whole = await readCategory(await x(store), 'journal', { from: '2026-09-14', to: '2026-09-14', limit: 1 })
    expect(whole?.[0].text).toContain('And then it stopped.')
  })
})

describe('the briefing', () => {
  it('carries the last seven nights after the rest of the context, keeps their nights with the task, and asks which it drew on', async () => {
    const store = record()
    const r = await briefed(store)
    const b = r.body as { briefing: string; answer: Record<string, unknown>; context: { categories: string[] } }
    expect(b.briefing).toContain('[journal] Your journal, the last seven nights (what you wrote, never evidence)')
    expect(b.briefing).toContain('“Work ran late again')
    expect(b.briefing).not.toContain('First spring walk')
    expect(b.briefing).toContain('WHAT YOU WROTE (the journal')
    expect(b.answer.journal).toEqual(['the night (YYYY-MM-DD) of each journal entry you drew on, or none'])
    expect(b.context.categories).toContain('journal')
    expect((await store.readTask(taskIdOf('line', DAY)))?.journal).toEqual(['2026-09-15', '2026-09-16', '2026-09-17'])
    // Logged by count and size, never its words.
    const reads = [...store.rows.values()].filter((row) => row.app === BRAIN_APP && row.store === 'reads').map((row) => row.body ?? '')
    expect(reads.some((t) => t.includes('"category":"journal"'))).toBe(true)
    expect(reads.join(' ')).not.toContain('letting everyone down')
  })

  it('with its switch off, carries none of it, asks nothing of it, and states no rules for it', async () => {
    const store = record(sheetFor(DAY), {}, { writerModel: 'opus', switches: { journal: false } })
    const r = await briefed(store)
    const b = r.body as { briefing: string; answer: Record<string, unknown>; context: { categories: string[] } }
    expect(b.briefing).not.toContain('[journal]')
    expect(b.briefing).not.toContain('letting everyone down')
    expect(b.briefing).not.toContain('WHAT YOU WROTE')
    expect(b.answer).not.toHaveProperty('journal')
    expect(b.context.categories).not.toContain('journal')
    expect((await store.readTask(taskIdOf('line', DAY)))?.journal).toBeUndefined()
    const q = await handleContext(deps(store, at('07:47')), url('/claude/context', { task: 'line', day: DAY, category: 'journal' }))
    expect(q.status).toBe(403)
  })

  it('never reaches the free models: their prompt is the fact sheet alone', async () => {
    const store = record()
    const prompts: string[] = []
    const ai = async (_model: string, input: unknown) => {
      prompts.push(JSON.stringify(input))
      return { response: JSON.stringify({ candidates: [{ mode: 'strategy', text: tail, factIds: ['aim.1'], cardIds: ['implementation-intentions'], action: null, firmness: 'balanced' }] }) }
    }
    await runBrief({ ...env, CLAUDE_WRITER: 'off' }, store, ai, at('07:45'), { fetcher })
    expect(prompts.length).toBeGreaterThan(0)
    for (const p of prompts) {
      expect(p).not.toContain('letting everyone down')
      expect(p).not.toContain('journal')
    }
  })
})

describe('a line drawing on the journal', () => {
  it('is stored with the nights it drew on when it names the night and frames it as what was written', async () => {
    const store = record()
    await briefed(store)
    const out = await post(store, at('07:48'), { ...base, text: `Last night you wrote that work ran late again. ${tail}`, journal: ['2026-09-17'] })
    expect(out).toEqual({ status: 200, body: { ok: true } })
    expect(briefOf(store, `${DAY}:brief`)).toMatchObject({ writer: 'claude', journal: ['2026-09-17'] })
  })

  it('is refused for words lifted from a night without naming it, a night never given, or a cause', async () => {
    const lifted = record()
    await briefed(lifted)
    expect(await post(lifted, at('07:48'), { ...base, text: `The walk after dinner cleared my head. ${tail}`, journal: [] })).toMatchObject({ status: 422, body: { reason: expect.stringContaining('draws on the journal of 2026-09-15 without saying so'), retry: true } })

    const unknown = record()
    await briefed(unknown)
    expect(await post(unknown, at('07:48'), { ...base, text: `On 2 March you wrote about a walk by the river. ${tail}`, journal: ['2024-03-02'] })).toMatchObject({ status: 422, body: { reason: 'journal: the night of 2024-03-02 was not among the entries you were given' } })

    const cause = record()
    await briefed(cause)
    expect(await post(cause, at('07:48'), { ...base, text: `Last night you wrote that work ran late, and that is why the evening felt heavy. ${tail}`, journal: ['2026-09-17'] })).toMatchObject({ status: 422, body: { reason: 'a statement from the journal carries no cause' } })
  })

  it('may draw on a night read on demand from years back, once that read has given it', async () => {
    const store = record()
    await briefed(store)
    const q = await handleContext(deps(store, at('07:47')), url('/claude/context', { task: 'line', day: DAY, category: 'journal', from: '2020-01-01', q: 'river' }))
    expect(q.status).toBe(200)
    const body = q.body as { items: { day: string }[]; rules?: string }
    expect(body.items.map((i) => i.day)).toEqual(['2024-03-02'])
    expect(body.rules).toContain('WHAT YOU WROTE')
    expect((await store.readTask(taskIdOf('line', DAY)))?.journal).toEqual(['2024-03-02', '2026-09-15', '2026-09-16', '2026-09-17'])
    expect(await post(store, at('07:48'), { ...base, text: `On 2 March 2024 you wrote about a spring walk by the river. ${tail}`, journal: ['2024-03-02'] })).toEqual({ status: 200, body: { ok: true } })
  })

  it('is checked against the nights read again whole, in a few reads however far apart they are', async () => {
    const store = record()
    const reads: string[] = []
    const counted = { ...store, readRecords: (s: string, range?: { from?: string; to?: string; like?: string }, limit?: number) => (reads.push(`${s}:${range?.from}:${range?.to}`), store.readRecords(s, range, limit)) }
    const served = await servedEntries(counted, ['2026-09-17', '2024-03-02', '2026-09-15'])
    expect(served.map((e) => e.day).sort()).toEqual(['2024-03-02', '2026-09-15', '2026-09-17'])
    expect(reads).toEqual(['journal:2024-03-02:2024-03-02', 'journal:2026-09-15:2026-09-17'])
  })
})

describe('the Sunday review drawing on the journal', () => {
  const answer = { held: 'Veltish held 1 of 4 plans after her bedtime.', didNot: 'Most plans after her bedtime did not start.', change: 'Try the next check-in as the cue this week.', factIds: ['aim.1'], cardIds: ['implementation-intentions'], firmness: 'balanced' }
  async function reviewed(store: Store) {
    await runReview(env, store, async () => ({ response: '' }), at('05:00', SUN), { fetcher, fireFetcher: routine() })
    return handleBriefing(deps(store, at('05:02', SUN)), url('/claude/briefing', { task: 'review', day: SUN }))
  }
  const send = (store: Store, a: unknown) => handleLine(deps(store, at('05:03', SUN)), { task: 'review', day: SUN, answer: a, askedModel: 'opus', writtenModel: 'claude-opus-5-5' })

  it('reads the week’s nights and may ask one follow-up question from them, kept beside its three parts', async () => {
    const store = record(sheetFor('2026-09-19', '2026-09-20T01:00:00.000Z'))
    const b = await reviewed(store)
    const body = b.body as { briefing: string; answer: Record<string, unknown> }
    expect(body.briefing).toContain('[journal] Your journal this week (what you wrote, never evidence)')
    expect(body.answer.question).toBe('one follow-up question from what was written, or null')
    const question = 'On Thursday you wrote that work ran late again; what would make a late evening lighter?'
    expect(await send(store, { ...answer, question, journal: ['2026-09-17'] })).toEqual({ status: 200, body: { ok: true } })
    expect(briefOf(store, `${SUN}:review`)).toMatchObject({ kind: 'review', parts: { held: answer.held, didNot: answer.didNot, change: answer.change, question }, journal: ['2026-09-17'] })
  })

  it('refuses a question that names no night, and one that is not a question', async () => {
    const none = record(sheetFor('2026-09-19', '2026-09-20T01:00:00.000Z'))
    await reviewed(none)
    expect(await send(none, { ...answer, question: 'What would make a late evening lighter?', journal: [] })).toMatchObject({ status: 422, body: { reason: 'question: a follow-up question comes from what was written: list in "journal" the nights it draws on' } })
    const flat = record(sheetFor('2026-09-19', '2026-09-20T01:00:00.000Z'))
    await reviewed(flat)
    expect(await send(flat, { ...answer, question: 'On Thursday you wrote that work ran late again.', journal: ['2026-09-17'] })).toMatchObject({ status: 422, body: { reason: 'question: is not a question' } })
  })
})
