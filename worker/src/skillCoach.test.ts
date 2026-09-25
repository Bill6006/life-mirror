import { describe, expect, it } from 'vitest'
import type { FactSheet } from '../../src/factTypes'
import { proposalIdOf, revisionOf, type CoachAsk } from '../../src/coachShared'
import { taskIdOf } from './claude'
import { coachWatch, watchNow } from './coach'
import handler from './index'
import { coachInstructions, handleCoachBriefing, handleCoachLine, progressTaskId, runCommitments, skillTaskIds } from './skillCoach'
import { addDays } from './time'
import { APP, BRAIN_APP, memoryStore, type BriefRow, type Store, type TaskRow } from './turso'

// Parts 40 and 41 in the Worker. Closed, as the build ships: the skill coach's job, its bridge routes
// and its by-hand route all refuse before anything is read or fired, and the monitoring's own watch
// reads exactly as before. Open (in these tests only): it waits for the day's line and the coach,
// fires at most two suggestion runs a day and one batched review run, briefs one commitment whole
// under the Brain switches with every read logged, stores only an answer that passes the checks,
// and lets a failed run go with no free model standing in.

const TZ = 'America/New_York'
const env = { TIMEZONE: TZ, FALLBACK_TIME: '11:00', LIBRARY_URL: 'https://example.test/library.json', CATALOGUE_URL: 'https://example.test/catalogue.json', CLAUDE_WRITER: 'on', CLAUDE_FIRE_URL: 'https://example.test/fire', CLAUDE_FIRE_TOKEN: 'fire-token', CLAUDE_TIMEOUT_MINUTES: '20' }
/** New York local times (UTC−4). */
const at = (hhmm: string, day = DAY) => new Date(`${day}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)
const DAY = '2026-10-06'
const OPEN = { gate: 'open' as const }

type Mem = ReturnType<typeof memoryStore>
const put = (store: Mem, s: string, id: string, day: string | null, body: unknown, when = `${DAY}T12:00:00.000Z`) => store.put({ app: APP, store: s, id, day, body: JSON.stringify(body), updated_at: when, deleted: 0, synced_at: when })

const ITALIAN = { id: 1, kind: 'certification', stepMoveId: null, name: 'Learn Italian', about: 'I can read a little', currentSkillId: 2, rhythm: { perWeek: 3, restDays: 0 }, createdAt: '2026-09-20T12:00:00.000Z', archivedAt: null }
const TEN = { id: 2, name: 'Ten words', aimId: 1, method: 'A phrasebook', how: 'One page, then the ten words aloud.', minutes: 30, source: 'you', startedAt: '2026-09-28T16:00:00.000Z', order: 2, createdAt: '2026-09-28T16:00:00.000Z', archivedAt: null }
const NUMBERS = { id: 1, name: 'Numbers', aimId: 1, method: 'A phrasebook', source: 'you', startedAt: '2026-09-20T16:00:00.000Z', endedAt: '2026-09-28T16:00:00.000Z', order: 1, createdAt: '2026-09-20T16:00:00.000Z', archivedAt: null }
const HAND = { id: 3, kind: 'certification', stepMoveId: null, name: 'Learn a cartwheel', currentSkillId: null, createdAt: '2026-10-01T12:00:00.000Z', archivedAt: null }

function sheet(day: string): FactSheet {
  return { version: 1, day, builtAt: `${day}T11:41:00.000Z`, hour: 7, weeks: 3, days: 20, direction: null, said: [], checkedIn: { morning: `${day}T11:40:00.000Z` }, facts: [{ id: 'week.today', tags: ['cue'], text: 'Today is Tuesday; a daycare day.', values: {} }, { id: 'outside.7d', tags: ['workout'], text: 'Workout days in the last seven: 2 (Saturday, Monday).', values: { n: 2 } }, { id: 'workout.last', tags: ['workout', 'evening'], text: 'The last workout: Monday evening, 40 minutes.', values: {} }] }
}

/** A day after monitoring: the line stored, the coach done, Italian with a current skill and its sessions, and a cartwheel with none. */
function record(extra: (s: Mem) => void = () => {}): Mem {
  const store = memoryStore()
  const sh = sheet(DAY)
  put(store, 'facts', DAY, DAY, { day: DAY, builtAt: sh.builtAt, updatedAt: sh.builtAt, sheet: sh }, sh.builtAt)
  put(store, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
  put(store, 'aims', '1', null, ITALIAN)
  put(store, 'aims', '3', null, HAND)
  put(store, 'skills', '1', null, NUMBERS)
  put(store, 'skills', '2', null, TEN)
  const sessions: [number, string, string, string | null, string | null][] = [
    [11, '2026-09-29', 'done', 'right', null],
    [12, '2026-09-30', 'done', 'easy', null],
    [13, '2026-10-01', 'no', null, 'noTime'],
    [14, '2026-10-02', 'partly', 'hard', null],
    [15, '2026-10-03', 'done', 'easy', 'the numbers stuck'],
  ]
  for (const [id, day, outcome, ease, extraText] of sessions) {
    put(store, 'offers', String(id), day, { id, day, kind: 'step', moveId: 'skill:2', situationKey: 'aim:certification', skippedAt: null, at: `${day}T23:00:00.000Z` })
    put(store, 'outcomes', String(id), day, { id, offerId: id, outcome, at: `${day}T23:30:00.000Z`, ...(ease ? { ease } : {}), ...(outcome === 'no' ? { why: extraText } : extraText ? { note: extraText } : {}) })
  }
  put(store, 'checkins', '90', '2026-10-05', { id: 90, day: '2026-10-05', block: 'evening', answers: {}, extras: { note: 'wrist a bit sore' } })
  void store.writeBrief({ id: `${DAY}:brief`, day: DAY, kind: 'brief', text: 'x', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: at('07:48').toISOString(), writer: 'claude', forDay: DAY }, at('07:48').toISOString())
  void store.writeTask({ id: taskIdOf('coach', DAY), kind: 'task', task: 'coach', day: DAY, at: at('07:50').toISOString(), status: 'written', trigger: 'checkin', factsDay: DAY, askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 1, refusals: [] })
  extra(store)
  return store
}

let askSeq = 100
/** The phone's ask, as its outbox would sync it. */
function ask(store: Mem, a: Partial<CoachAsk> & { aimId: number; kind: CoachAsk['kind'] }, aim: Record<string, unknown> = ITALIAN, skill: Record<string, unknown> | null = TEN): number {
  const id = askSeq++
  const body: CoachAsk = { id, revision: revisionOf(aim as Parameters<typeof revisionOf>[0], skill as Parameters<typeof revisionOf>[1]), day: DAY, at: at('09:00').toISOString(), claude: true, ...a }
  put(store, 'coachAsks', String(id), DAY, body)
  return id
}

function routine() {
  const calls: string[] = []
  const f = (async (_u: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)).text)
    return new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_s' }), { status: 200 })
  }) as typeof fetch
  return { f, calls }
}
const deps = (store: Mem, now: Date, gate: 'gated' | 'open' = 'open') => ({ env, store, now, gate })
const url = (q: Record<string, string>) => new URL(`https://w.test/claude/briefing?${new URLSearchParams(q)}`)
const post = (store: Mem, now: Date, task: 'skill' | 'progress', answer: unknown, gate: 'gated' | 'open' = 'open') => handleCoachLine(deps(store, now, gate), { task, day: DAY, answer, askedModel: 'opus', writtenModel: 'claude-opus-5-5', runnerModel: 'claude-haiku-4-5-20251001' })
const proposal = (store: Mem, askId: number) => JSON.parse(store.rows.get(`${BRAIN_APP}|proposals|${proposalIdOf(askId)}`)?.body ?? 'null')
const suggestion = (askId: number, extra: Record<string, unknown> = {}) => ({ proposals: [{ askId, skill: 'Understand everyday spoken Italian', method: 'A phrasebook', how: 'One page a session, read aloud.', minutes: 30, rhythm: { perWeek: 3, restDays: 0 }, why: 'Listening first builds the ear.', physical: false, safety: null, likelyNext: 'Short spoken answers', ...extra }] })

/** A store that refuses to be touched: any method call is recorded, and the call throws. */
function untouchable(): { store: Store; touched: string[] } {
  const touched: string[] = []
  const store = new Proxy({} as Store, {
    get(_t, prop) {
      return () => {
        touched.push(String(prop))
        throw new Error(`touched ${String(prop)}`)
      }
    },
  })
  return { store, touched }
}

describe('with the gate closed, as the build ships', () => {
  it('returns from the job before anything is read or fired, by schedule or by hand', async () => {
    const { store, touched } = untouchable()
    const r = routine()
    expect(await runCommitments(env, store, at('12:00'), { fireFetcher: r.f })).toEqual({ ran: false, reason: 'gated' })
    expect(await runCommitments(env, store, at('12:00'), { force: true, fireFetcher: r.f })).toEqual({ ran: false, reason: 'gated' })
    expect(touched).toEqual([])
    expect(r.calls).toEqual([])
  })

  it('refuses the bridge’s briefing and answer for a skill coach run, whatever is asked', async () => {
    const store = record()
    const id = ask(store, { aimId: 1, kind: 'setup' })
    await store.writeTask({ id: skillTaskIds(DAY)[0], kind: 'task', task: 'skill', day: DAY, at: at('12:00').toISOString(), status: 'fired', trigger: 'ask', factsDay: DAY, askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 0, refusals: [], asks: [id] })
    expect(await handleCoachBriefing(deps(store, at('12:01'), 'gated'), url({ task: 'skill', day: DAY }))).toEqual({ status: 403, body: { error: 'the skill coach is not switched on' } })
    expect(await post(store, at('12:02'), 'skill', suggestion(id), 'gated')).toEqual({ status: 403, body: { error: 'the skill coach is not switched on' } })
    expect(proposal(store, id)).toBeNull()
  })

  it('answers the by-hand route with the gate’s word, before any database is opened', async () => {
    const res = await handler.fetch?.(new Request('https://w.test/run/commitments?key=run-key&force=1'), { ...env, RUN_KEY: 'run-key' } as never, {} as never)
    expect(await res?.json()).toEqual({ job: 'commitments', ran: false, reason: 'gated' })
  })

  it('leaves the monitoring’s watch exactly as it was, whatever skill coach rows sit beside the day’s tasks', async () => {
    const plain = record()
    const busy = record()
    for (let k = 1; k <= 4; k++) {
      const day = addDays(DAY, -k)
      const task = (id: string, t: TaskRow['task']): TaskRow => ({ id, kind: 'task', task: t, day, at: `${day}T13:00:00.000Z`, status: 'written', trigger: 'ask', factsDay: day, askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 1, refusals: [], asks: [1] })
      for (const s of [plain, busy]) {
        await s.writeTask({ ...task(taskIdOf('line', day), 'line'), trigger: 'checkin' })
        await s.writeBrief({ id: `${day}:brief`, day, kind: 'brief', text: 'x', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: `${day}T11:50:00.000Z`, writer: 'claude', forDay: day } as BriefRow, `${day}T11:50:00.000Z`)
      }
      await busy.writeTask(task(skillTaskIds(day)[0], 'skill'))
      await busy.writeTask(task(skillTaskIds(day)[1], 'skill'))
      await busy.writeTask({ ...task(progressTaskId(day), 'progress'), status: 'refused' })
    }
    const a = await watchNow(plain, at('12:00'), TZ, addDays(DAY, -5))
    const b = await watchNow(busy, at('12:00'), TZ, addDays(DAY, -5))
    expect(b).toEqual(a)
    const rows = await busy.readWatchRows(addDays(DAY, -5))
    expect(coachWatch(rows.rows, rows.lines, at('12:00'), TZ, addDays(DAY, -5))).toEqual(a)
  })
})

describe('the skill coach’s job, opened in these tests', () => {
  it('never runs before the day’s line and the coach are settled, nor with Claude off or Commitments unreadable', async () => {
    const early = record((s) => s.rows.delete(`${BRAIN_APP}|briefs|${DAY}:brief`))
    ask(early, { aimId: 1, kind: 'setup' })
    expect(await runCommitments(env, early, at('12:00'), OPEN)).toMatchObject({ ran: false, reason: 'waiting for the day’s line' })
    const coaching = record((s) => void s.writeTask({ id: taskIdOf('coach', DAY), kind: 'task', task: 'coach', day: DAY, at: at('07:50').toISOString(), status: 'fired', trigger: 'checkin', factsDay: DAY, askedModel: 'opus', contextCalls: 0, contextBytes: 0, posts: 0, refusals: [] }))
    ask(coaching, { aimId: 1, kind: 'setup' })
    expect(await runCommitments(env, coaching, at('12:00'), OPEN)).toMatchObject({ reason: 'waiting for the coach' })
    // No coach task today: the coach's own word decides whether it will still run.
    const noCoach = record((s) => s.rows.delete(`${BRAIN_APP}|bridge|${taskIdOf('coach', DAY)}`))
    ask(noCoach, { aimId: 1, kind: 'setup' })
    expect(await runCommitments(env, noCoach, at('12:00'), OPEN)).toMatchObject({ reason: 'waiting for the coach' })
    expect(await runCommitments(env, noCoach, at('12:00'), { ...OPEN, coach: { reason: 'waiting for the day’s line' } })).toMatchObject({ reason: 'waiting for the coach' })
    expect(await runCommitments(env, noCoach, at('12:00'), { ...OPEN, coach: { reason: 'nothing for the coach to choose' }, fireFetcher: routine().f })).toMatchObject({ ran: true })
    const off = record()
    ask(off, { aimId: 1, kind: 'setup' })
    expect(await runCommitments({ ...env, CLAUDE_WRITER: 'off' }, off, at('12:00'), OPEN)).toMatchObject({ reason: 'Claude is off' })
    put(off, 'brainPrefs', 'prefs', null, { id: 'prefs', writerModel: 'opus', switches: { commitments: false } })
    expect(await runCommitments(env, off, at('12:00'), OPEN)).toMatchObject({ reason: 'Claude may not read commitments' })
  })

  it('fires once for the asks waiting, marking the run first, with no personal text; and nothing when nothing is asked', async () => {
    expect(await runCommitments(env, record(), at('12:00'), OPEN)).toMatchObject({ ran: false, reason: 'nothing asked' })
    const store = record()
    const id = ask(store, { aimId: 1, kind: 'setup' })
    const r = routine()
    expect(await runCommitments(env, store, at('12:00'), { ...OPEN, fireFetcher: r.f })).toEqual({ ran: true, reason: 'Claude is suggesting', day: DAY, task: skillTaskIds(DAY)[0], asks: [id] })
    expect(r.calls).toEqual([`Life Mirror bridge: task=skill day=${DAY} model=opus. Read CLAUDE.md in this repository and do exactly what it says, then stop.`])
    expect(await store.readTask(skillTaskIds(DAY)[0])).toMatchObject({ task: 'skill', status: 'fired', trigger: 'ask', asks: [id] })
    expect(await runCommitments(env, store, at('12:05'), { ...OPEN, fireFetcher: r.f })).toMatchObject({ ran: false, reason: 'waiting for Claude' })
    expect(r.calls).toHaveLength(1)
  })

  it('lets a run with no answer in time go, and no free model writes in its place', async () => {
    const store = record()
    const id = ask(store, { aimId: 1, kind: 'setup' })
    await runCommitments(env, store, at('12:00'), { ...OPEN, fireFetcher: routine().f })
    expect(await runCommitments(env, store, at('12:21'), OPEN)).toMatchObject({ ran: false, reason: 'no valid line from Claude within 20 minutes' })
    expect(await store.readTask(skillTaskIds(DAY)[0])).toMatchObject({ status: 'fallback', fallbackReason: 'no valid line from Claude within 20 minutes; nothing was suggested, and the commitment works by hand' })
    expect(proposal(store, id)).toBeNull()
  })

  it('makes at most two suggestion runs a day; a later ask waits for tomorrow', async () => {
    const store = record()
    const r = routine()
    for (const [k, when] of [[0, '12:00'], [1, '14:00']] as const) {
      const id = ask(store, { aimId: k === 0 ? 1 : 3, kind: 'setup', at: at(when).toISOString() }, k === 0 ? ITALIAN : HAND, k === 0 ? TEN : null)
      expect(await runCommitments(env, store, at(when), { ...OPEN, fireFetcher: r.f })).toMatchObject({ ran: true, task: skillTaskIds(DAY)[k], asks: [id] })
      const t = (await store.readTask(skillTaskIds(DAY)[k])) as TaskRow
      await store.writeTask({ ...t, status: 'written' })
    }
    ask(store, { aimId: 1, kind: 'setup', at: at('16:00').toISOString() })
    expect(await runCommitments(env, store, at('16:00'), { ...OPEN, fireFetcher: r.f })).toMatchObject({ ran: false, reason: 'today’s two suggestion runs are used; the rest wait for tomorrow' })
    expect(r.calls).toHaveLength(2)
  })

  it('batches the day’s reviews in one run after the suggestions, and makes no second review run that day', async () => {
    const store = record()
    const a = ask(store, { aimId: 1, kind: 'review', skillId: 2, days: 6, reason: 'ordinary', hardRun: false })
    const b = ask(store, { aimId: 3, kind: 'review', skillId: 9, days: 6, reason: 'ordinary' }, HAND, null)
    const r = routine()
    expect(await runCommitments(env, store, at('12:00'), { ...OPEN, fireFetcher: r.f })).toMatchObject({ ran: true, task: progressTaskId(DAY), asks: [a, b] })
    await store.writeTask({ ...((await store.readTask(progressTaskId(DAY))) as TaskRow), status: 'written' })
    ask(store, { aimId: 1, kind: 'review', skillId: 2, days: 7, at: at('15:00').toISOString() })
    expect(await runCommitments(env, store, at('15:00'), { ...OPEN, fireFetcher: r.f })).toMatchObject({ ran: false, reason: 'nothing asked' })
  })
})

async function opened(store: Mem, now = at('12:00')): Promise<void> {
  await runCommitments(env, store, now, { ...OPEN, fireFetcher: routine().f })
}

describe('a suggestion run (Part 40), opened in these tests', () => {
  it('briefs the commitment whole: its words, current skill, sessions and how they went, a refusal and why, earlier skills; and logs each read', async () => {
    const store = record()
    const id = ask(store, { aimId: 1, kind: 'setup' })
    await opened(store)
    const r = await handleCoachBriefing(deps(store, at('12:01')), url({ task: 'skill', day: DAY }))
    expect(r.status).toBe(200)
    const body = r.body as { instructions: string; briefing: string; answer: unknown; attemptsLeft: number }
    expect(body.instructions).toBe(coachInstructions('skill'))
    expect(body.briefing).toContain(`[ask ${id}] SUGGEST the current skill for this commitment.`)
    for (const s of ['Goal: Learn Italian.', 'What would change the advice, in their words: I can read a little.', 'How it is learned or practised: A phrasebook.', 'Current skill: “Ten words” since 2026-09-28', 'Rhythm: 3 sessions a week, no rest day between.', '4 sessions on 4 different days; marked Hard 1, About right 1, Easy 2', '2026-10-03 done, Easy, “the numbers stuck”', 'Not done lately, and why when said: 2026-10-01 (no time)', 'Skills before it: “Numbers”', 'wrist a bit sore']) expect(body.briefing).toContain(s)
    // Italian is not physical: no workouts read for it.
    expect(body.briefing).not.toContain('Workout days')
    const reads = (await store.readReads(20)).map((x) => [x.task, x.category, x.count]).sort()
    expect(reads).toEqual([['skill', 'commitments', 1], ['skill', 'notes', 1]])
    expect(body.attemptsLeft).toBe(2)
  })

  it('reads no notes with the notes switch off, and a physical goal’s workouts only while the day’s record may be read', async () => {
    const store = record((s) => put(s, 'brainPrefs', 'prefs', null, { id: 'prefs', writerModel: 'opus', switches: { notes: false } }))
    ask(store, { aimId: 3, kind: 'setup' }, HAND, null)
    await opened(store)
    const body = (await handleCoachBriefing(deps(store, at('12:01')), url({ task: 'skill', day: DAY }))).body as { briefing: string }
    expect(body.briefing).toContain('This goal reads as physical: yes.')
    expect(body.briefing).toContain('Workout days in the last seven: 2')
    expect(body.briefing).not.toContain('wrist a bit sore')
    expect((await store.readReads(20)).map((x) => x.category).sort()).toEqual(['commitments', 'dayRecord'])
  })

  it('tells Claude what was said to a physical goal’s one safety question, and counts the goal’s own numbers as the briefing’s', async () => {
    const RUN = { id: 5, kind: 'certification', stepMoveId: null, name: 'Run a 5k', currentSkillId: null, createdAt: '2026-10-01T12:00:00.000Z', archivedAt: null }
    const store = record((s) => put(s, 'aims', '5', null, RUN))
    const hand = ask(store, { aimId: 3, kind: 'setup', care: 'A sore left wrist' }, HAND, null)
    const run = ask(store, { aimId: 5, kind: 'setup', care: '' }, RUN, null)
    await opened(store)
    const body = (await handleCoachBriefing(deps(store, at('12:01')), url({ task: 'skill', day: DAY }))).body as { briefing: string }
    expect(body.briefing).toContain('Asked about any injury or condition the practice should respect, they said: “A sore left wrist”.')
    expect(body.briefing).toContain('Asked about any injury or condition the practice should respect, they had nothing to add.')
    const safety = 'Warm the wrists and ankles first, stop at sharp pain, and keep the rest day. Not medical advice.'
    const both = {
      proposals: [
        { askId: hand, skill: 'Cartwheels along a line', method: null, how: 'Kick up facing the wall and hold, wrists warmed first.', minutes: 12, rhythm: { perWeek: 3, restDays: 1 }, why: 'Wall holds build the line while the wrist is minded.', physical: true, safety, likelyNext: 'Freestanding kick-ups' },
        { askId: run, skill: 'Run-walk intervals', method: null, how: 'Alternate a minute of running with two of walking.', minutes: 25, rhythm: { perWeek: 3, restDays: 1 }, why: 'Intervals build toward the 5k without strain.', physical: true, safety, likelyNext: null },
      ],
    }
    expect(await post(store, at('12:03'), 'skill', both)).toEqual({ status: 200, body: { ok: true, answered: [hand, run] } })
    // Italian, never asked the question, says nothing of it.
    const other = record()
    ask(other, { aimId: 1, kind: 'setup' })
    await opened(other)
    expect(((await handleCoachBriefing(deps(other, at('12:01')), url({ task: 'skill', day: DAY }))).body as { briefing: string }).briefing).not.toContain('injury')
  })

  it('stores an answer that passes, as the proposal the phone shows, for the commitment as it was asked about', async () => {
    const store = record()
    const id = ask(store, { aimId: 1, kind: 'setup' })
    await opened(store)
    expect(await post(store, at('12:03'), 'skill', suggestion(id))).toEqual({ status: 200, body: { ok: true, answered: [id] } })
    expect(proposal(store, id)).toMatchObject({ id: proposalIdOf(id), askId: id, aimId: 1, kind: 'setup', revision: revisionOf(ITALIAN as never, TEN as never), model: 'claude-opus-5-5', askedModel: 'opus', suggestion: { skill: 'Understand everyday spoken Italian', physical: false } })
    expect(await store.readTask(skillTaskIds(DAY)[0])).toMatchObject({ status: 'written', writer: 'claude' })
    // Answered: nothing more to ask for it.
    expect(await runCommitments(env, store, at('13:00'), OPEN)).toMatchObject({ reason: 'nothing asked' })
  })

  it('refuses an answer that breaks a rule, once with a retry, then leaves the commitment to be set by hand', async () => {
    const store = record()
    const id = ask(store, { aimId: 3, kind: 'setup' }, HAND, null)
    await opened(store)
    const noSafety = { proposals: [{ askId: id, skill: 'Cartwheels along a line', method: null, how: 'Kick up facing the wall and hold.', minutes: 12, rhythm: { perWeek: 3, restDays: 1 }, why: 'The line first.', physical: true, safety: null, likelyNext: null }] }
    expect(await post(store, at('12:03'), 'skill', noSafety)).toEqual({ status: 422, body: { ok: false, reason: `ask ${id}: a physical skill needs its safety line`, retry: true } })
    expect(await post(store, at('12:04'), 'skill', { proposals: [{ ...noSafety.proposals[0], safety: 'Warm up.', why: 'You will be 80% there.' }] })).toMatchObject({ status: 422, body: { retry: false } })
    expect(await store.readTask(skillTaskIds(DAY)[0])).toMatchObject({ status: 'refused', fallbackReason: 'Claude’s answer was refused twice; nothing was suggested, and the commitment works by hand' })
    expect(proposal(store, id)).toBeNull()
  })

  it('does not answer an ask made before the commitment changed, nor one about faith while faith is hidden', async () => {
    const stale = record()
    ask(stale, { aimId: 1, kind: 'setup' }, { ...ITALIAN, currentSkillId: 1 }, NUMBERS)
    await opened(stale)
    expect(await handleCoachBriefing(deps(stale, at('12:01')), url({ task: 'skill', day: DAY }))).toEqual({ status: 409, body: { error: 'no ask of this run still stands' } })
    const hidden = record((s) => {
      put(s, 'settings', '1', null, { id: 1, hideFaith: true, showPrivate: false, privateInSelection: false })
      put(s, 'aims', '4', null, { id: 4, kind: 'certification', stepMoveId: null, name: 'Read the Bible in Greek', currentSkillId: null, createdAt: '2026-10-01T12:00:00.000Z', archivedAt: null })
    })
    ask(hidden, { aimId: 4, kind: 'setup' }, { id: 4, name: 'Read the Bible in Greek', currentSkillId: null }, null)
    await opened(hidden)
    expect((await handleCoachBriefing(deps(hidden, at('12:01')), url({ task: 'skill', day: DAY }))).status).toBe(409)
  })

  it('stores nothing from a dry run made by hand', async () => {
    const store = record()
    const id = ask(store, { aimId: 1, kind: 'setup' })
    await runCommitments(env, store, at('12:00'), { ...OPEN, force: true, dry: true, fireFetcher: routine().f })
    expect((await handleCoachBriefing(deps(store, at('12:01')), url({ task: 'skill', day: DAY }))).status).toBe(200)
    const reads = await store.readReads(20)
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.every((x) => x.dry === true)).toBe(true)
    expect(await post(store, at('12:03'), 'skill', suggestion(id))).toEqual({ status: 200, body: { ok: true, answered: [id], dry: true } })
    expect(proposal(store, id)).toBeNull()
  })
})

describe('a review run (Part 41), opened in these tests', () => {
  const keep = (askId: number) => ({ reviews: [{ askId, verdict: 'keep', evidence: ['2 of the 4 sessions marked Easy.'], why: 'The skill still fits the goal.', change: null }] })

  it('says why each review is due, keeps to Keep, Adjust or Simplify when three Hard sessions brought it, and stores what passes', async () => {
    const store = record()
    const a = ask(store, { aimId: 1, kind: 'review', skillId: 2, days: 4, reason: 'struggle', hardRun: true })
    await opened(store)
    const body = (await handleCoachBriefing(deps(store, at('12:01')), url({ task: 'progress', day: DAY }))).body as { briefing: string; instructions: string }
    expect(body.instructions).toBe(coachInstructions('progress'))
    expect(body.briefing).toContain(`[ask ${a}] REVIEW the current skill: 3 sessions in a row were marked Hard, on 3 different days, which brings a review forward. Keep, Adjust or Simplify only.`)
    const progress = { reviews: [{ askId: a, verdict: 'progress', evidence: ['3 sessions in a row marked Hard.'], why: 'Moving on may help.', change: { skill: 'Short spoken answers' } }] }
    expect(await post(store, at('12:03'), 'progress', progress)).toMatchObject({ status: 422, body: { reason: `ask ${a}: three Hard sessions in a row bring a review forward for Keep, Adjust or Simplify, never Progress`, retry: true } })
    expect(await post(store, at('12:04'), 'progress', keep(a))).toEqual({ status: 200, body: { ok: true, answered: [a] } })
    expect(proposal(store, a)).toMatchObject({ kind: 'review', review: { verdict: 'keep', change: null } })
  })

  it('refuses a number the briefing never gave', async () => {
    const store = record()
    const a = ask(store, { aimId: 1, kind: 'review', skillId: 2, days: 6, reason: 'ordinary' })
    await opened(store)
    expect(await post(store, at('12:03'), 'progress', { reviews: [{ askId: a, verdict: 'keep', evidence: ['9 sessions marked Easy.'], why: 'x', change: null }] })).toMatchObject({ status: 422, body: { reason: `ask ${a}: the number 9 is not in the briefing` } })
  })
})
