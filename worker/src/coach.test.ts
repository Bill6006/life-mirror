import { describe, expect, it } from 'vitest'
import type { CoachBlock, FactSheet } from '../../src/factTypes'
import catalogue from '../../src/catalogue.json'
import cards from '../../src/library.json'
import { COACH_CORE_KEYS } from './briefing'
import { handleBriefing, handleContext, handleLine, taskIdOf } from './claude'
import { coachGate, coachToday, coachWatch, GATE_DAYS, recordSpot, runCoach, type Gate } from './coach'
import { addDays } from './time'
import { APP, BRAIN_APP, memoryStore, type BriefRow, type SpotRow, type TaskRow } from './turso'

// The coach (Part 32): the ten-day reliability check read from the bridge's own rows; the watch that
// turned it into monitoring after launch (the owner's word, 2026-09-23), switching the coach off on a
// failure until the clean window is re-established; the coach job behind it, standing down when it
// is off; the coach briefing by allowlist, with no tier-2 field and nothing unnamed; the answer held
// to the row's own candidates, the people guard and the day's shape. The acceptance list and the
// standing regression checks of the plan, item by item.

const TZ = 'America/New_York'
const env = {
  TIMEZONE: TZ,
  FALLBACK_TIME: '11:00',
  LIBRARY_URL: 'https://example.test/library.json',
  CATALOGUE_URL: 'https://example.test/catalogue.json',
  CLAUDE_WRITER: 'on',
  CLAUDE_FIRE_URL: 'https://example.test/fire',
  CLAUDE_FIRE_TOKEN: 'fire-token',
  CLAUDE_TIMEOUT_MINUTES: '20',
  COACH_WRITER: 'on',
}
const fetcher = (async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('catalogue') ? catalogue : cards), { headers: { 'content-type': 'application/json' } })) as typeof fetch
/** New York local times (UTC−4). */
const at = (hhmm: string, day: string) => new Date(`${day}T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3)}:00Z`)
const TODAY = '2026-10-05'

type Store = ReturnType<typeof memoryStore>
const put = (store: Store, app: string, s: string, id: string, day: string | null, body: unknown, when = '2026-10-05T11:41:00.000Z') => store.put({ app, store: s, id, day, body: JSON.stringify(body), updated_at: when, deleted: 0, synced_at: when })

const task = (day: string, extra: Partial<TaskRow> = {}): TaskRow => ({ id: taskIdOf('line', day), kind: 'task', task: 'line', day, at: `${day}T11:45:00.000Z`, firedAt: `${day}T11:45:00.000Z`, status: 'written', trigger: 'checkin', factsDay: day, askedModel: 'opus', fires: 1, contextCalls: 0, contextBytes: 0, posts: 1, refusals: [], ...extra })
const line = (day: string, writer: 'claude' | 'free' = 'claude', hh = '07:48'): BriefRow => ({ id: `${day}:brief`, day, kind: 'brief', text: 'x', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: at(hh, day).toISOString(), factsDay: day, writer })
const review = (day: string): BriefRow => ({ ...line(day), id: `${day}:review`, kind: 'review' })
const spot = (day: string, clean = true): SpotRow => ({ id: `spot:${day}`, kind: 'spotcheck', day, at: `${day}T22:00:00.000Z`, runs: 3, clean })

/** Days back from yesterday, each fired on schedule with its line; Sundays with their review. */
function history(n: number, today = TODAY, claudeOn: (k: number) => boolean = () => true): { tasks: TaskRow[]; briefs: BriefRow[] } {
  const tasks: TaskRow[] = []
  const briefs: BriefRow[] = []
  for (let k = 1; k <= n; k++) {
    const day = addDays(today, -k)
    tasks.push(task(day))
    briefs.push(line(day, claudeOn(k) ? 'claude' : 'free'))
    if (new Date(`${day}T12:00:00Z`).getUTCDay() === 0) briefs.push(review(day))
  }
  return { tasks, briefs }
}
const reasonsOf = (g: Gate) => g.reasons.join(' | ')

describe('the reliability gate', () => {
  it('opens after ten consecutive scheduled clean days with Claude’s own line on seven and a clean spot-check since the count began', () => {
    const h = history(GATE_DAYS)
    const g = coachGate([...h.tasks, spot(addDays(TODAY, -3))], h.briefs, TODAY, TZ)
    expect(g).toMatchObject({ met: true, streak: 10, claudeDays: 10, reasons: [] })
    expect(g.window).toHaveLength(10)
  })

  it('stays shut short of ten days, with no spot-check, or with Claude on fewer than seven', () => {
    const nine = history(9)
    expect(reasonsOf(coachGate([...nine.tasks, spot(addDays(TODAY, -2))], nine.briefs, TODAY, TZ))).toContain('9 of 10 consecutive scheduled days so far')
    const ten = history(10)
    expect(reasonsOf(coachGate(ten.tasks, ten.briefs, TODAY, TZ))).toContain('no spot-check of the run logs recorded')
    const six = history(10, TODAY, (k) => k <= 6)
    expect(reasonsOf(coachGate([...six.tasks, spot(addDays(TODAY, -1))], six.briefs, TODAY, TZ))).toContain("Claude's own line on 6 of the 10 days; 7 are needed")
  })

  it('restarts the count at any day that broke a safety condition, and never counts a day run by hand', () => {
    const cases: [string, (h: { tasks: TaskRow[]; briefs: BriefRow[] }) => void, string][] = [
      ['a day with no line', (h) => h.briefs.splice(h.briefs.findIndex((b) => b.day === addDays(TODAY, -4) && b.kind === 'brief'), 1), 'no line stored'],
      ['a late line', (h) => (h.briefs.find((b) => b.day === addDays(TODAY, -4) && b.kind === 'brief') as BriefRow).at = at('13:01', addDays(TODAY, -4)).toISOString(), 'the line came after 13:00'],
      ['a day fired twice', (h) => ((h.tasks.find((t) => t.day === addDays(TODAY, -4)) as TaskRow).fires = 2), 'fired more than once'],
      ['a Sunday with no review', (h) => h.briefs.splice(h.briefs.findIndex((b) => b.kind === 'review'), 1), 'no Sunday review stored'],
    ]
    for (const [name, spoil, problem] of cases) {
      const h = history(14)
      spoil(h)
      const g = coachGate([...h.tasks, spot(addDays(TODAY, -1))], h.briefs, TODAY, TZ)
      expect(g.met, name).toBe(false)
      expect(reasonsOf(g), name).toContain(problem)
      expect(g.streak, name).toBeLessThan(GATE_DAYS)
    }
    const forced = history(14)
    ;(forced.tasks.find((t) => t.day === addDays(TODAY, -5)) as TaskRow).forced = true
    expect(coachGate([...forced.tasks, spot(addDays(TODAY, -1))], forced.briefs, TODAY, TZ)).toMatchObject({ met: false, streak: 4 })
  })

  it('wants the latest spot-check clean and made since the count began', () => {
    const h = history(12)
    expect(reasonsOf(coachGate([...h.tasks, spot(addDays(TODAY, -2), false)], h.briefs, TODAY, TZ))).toContain('found a key in a run log')
    expect(reasonsOf(coachGate([...h.tasks, spot(addDays(TODAY, -20))], h.briefs, TODAY, TZ))).toContain('came before the current count began')
  })
})

describe('the watch: the ten-day check as monitoring after launch', () => {
  const LAUNCH = '2026-09-23'
  const now = at('08:00', TODAY)
  type History = { tasks: TaskRow[]; briefs: BriefRow[] }
  const watch = (h: History, spots: SpotRow[] = [spot(LAUNCH)], when = now, launch: string | null = LAUNCH) => coachWatch([...h.tasks, ...spots], h.briefs, when, TZ, launch)
  const lineOf = (h: History, day: string) => h.briefs.find((b) => b.day === day && b.kind === 'brief') as BriefRow
  const taskOf = (h: History, day: string) => h.tasks.find((t) => t.day === day) as TaskRow
  /** A day with no task and no line, as when there was nothing to write from. */
  const gap = (h: History, day: string) => {
    h.tasks.splice(h.tasks.indexOf(taskOf(h, day)), 1)
    h.briefs.splice(h.briefs.indexOf(lineOf(h, day)), 1)
  }
  const lastOf = (xs: { day: string }[]) => xs[xs.length - 1]

  it('is on from launch with a clean spot-check made since launch, before a single day is watched', () => {
    expect(coachWatch([spot(LAUNCH)], [], at('20:00', LAUNCH), TZ, LAUNCH)).toMatchObject({ on: true, launch: LAUNCH, failures: [], reasons: [] })
    expect(coachWatch([], [], at('20:00', LAUNCH), TZ, LAUNCH)).toMatchObject({ on: false, reasons: ['no clean spot-check of the run logs since launch'] })
    expect(coachWatch([spot('2026-09-20')], [], at('20:00', LAUNCH), TZ, LAUNCH).on).toBe(false)
  })

  it('stays on through clean days; a day with nothing to write from, or run by hand, is a gap and not a failure', () => {
    expect(watch(history(12))).toMatchObject({ on: true, failures: [] })
    const h = history(12)
    gap(h, '2026-09-30')
    taskOf(h, '2026-10-02').forced = true
    expect(watch(h)).toMatchObject({ on: true, failures: [] })
    // The ten-day check itself still counts only scheduled days: its count restarts after the gap.
    expect(watch(h).tenDays).toMatchObject({ met: false, streak: 2 })
  })

  it('turns off on a day that broke a safety condition, from that day, and says which', () => {
    const DAY = '2026-10-01'
    const cases: [string, (h: History) => void, string, string][] = [
      ['no line', (h) => h.briefs.splice(h.briefs.indexOf(lineOf(h, DAY)), 1), DAY, 'no line stored'],
      ['a late line', (h) => (lineOf(h, DAY).at = at('13:01', DAY).toISOString()), DAY, 'the line came after 13:00'],
      ['fired twice', (h) => (taskOf(h, DAY).fires = 2), DAY, 'fired more than once'],
      ['run by hand over a scheduled one', (h) => Object.assign(taskOf(h, DAY), { forced: true, fires: 2 }), DAY, 'fired more than once'],
      ['a line for another day', (h) => (lineOf(h, DAY).forDay = '2026-10-02'), DAY, 'the line was written for another day'],
      ['a Sunday with no review', (h) => h.briefs.splice(h.briefs.findIndex((b) => b.id === '2026-10-04:review'), 1), '2026-10-04', 'no Sunday review stored'],
      [
        'a wrong-day refusal left unresolved',
        (h) => {
          h.briefs.splice(h.briefs.indexOf(lineOf(h, DAY)), 1)
          taskOf(h, DAY).refusals = ['the sheet is for 2026-09-30, not 2026-10-01']
        },
        DAY,
        'a wrong-day refusal left unresolved',
      ],
    ]
    for (const [name, spoil, day, problem] of cases) {
      const h = history(12)
      spoil(h)
      const w = watch(h)
      expect(w.on, name).toBe(false)
      expect(lastOf(w.failures).day, name).toBe(day)
      expect(w.reasons.join(' '), name).toContain(problem)
    }
  })

  it('turns off the same day once today’s condition is settled, and not before', () => {
    const h = history(12)
    h.tasks.push(task(TODAY))
    expect(watch(h, [spot(LAUNCH)], at('12:59', TODAY)).on).toBe(true)
    const late = watch(h, [spot(LAUNCH)], at('13:00', TODAY))
    expect(late.on).toBe(false)
    expect(lastOf(late.failures)).toEqual({ day: TODAY, problems: ['no line stored'] })
    const twice = history(12)
    twice.tasks.push(task(TODAY, { fires: 2 }))
    expect(watch(twice, [spot(LAUNCH)], at('08:00', TODAY)).on).toBe(false)
  })

  it('turns off on a spot-check that found a key; a clean one after it does not bring the coach back alone', () => {
    const h = history(12)
    const w = watch(h, [spot(LAUNCH), spot('2026-10-02', false)])
    expect(w.on).toBe(false)
    expect(w.failures).toEqual([{ day: '2026-10-02', problems: ['a spot-check of 3 run logs found a key'] }])
    expect(watch(h, [spot(LAUNCH), spot('2026-10-02', false), spot('2026-10-03')]).on).toBe(false)
  })

  it('turns off when Claude’s own line is stored on fewer than seven of the last ten scheduled days', () => {
    // Days back from today: the free chain wrote on 10/3, 10/1, 9/29 and 9/27.
    const four = watch(history(12, TODAY, (k) => ![2, 4, 6, 8].includes(k)))
    expect(four.on).toBe(false)
    expect(four.failures[0].day).toBe('2026-10-03')
    expect(four.reasons.join(' ')).toContain('Claude’s own line on 6 of the last 10 scheduled days')
    expect(watch(history(12, TODAY, (k) => ![2, 4, 6].includes(k))).on).toBe(true)
  })

  it('the post-launch check: turns off when Claude’s own line is on no three days in a row among the first five', () => {
    // The free chain wrote on 9/25 and 9/27: Claude on 9/24, 9/26 and 9/28, never three in a row.
    const w = watch(history(12, TODAY, (k) => ![10, 8].includes(k)))
    expect(w.on).toBe(false)
    expect(w.failures).toEqual([{ day: '2026-09-28', problems: ['Claude’s own line on no 3 days in a row among the first 5 after launch'] }])
    expect(watch(history(12, TODAY, (k) => k !== 10)).on).toBe(true)
  })

  it('comes back on the first day the ten-day check is met with all ten days after the failure and the latest spot-check clean, not before', () => {
    // 9/24's line came late; ten clean days follow, 9/25 to 10/4.
    const h = history(12)
    lineOf(h, '2026-09-24').at = at('13:30', '2026-09-24').toISOString()
    expect(watch(h, [spot(LAUNCH), spot('2026-10-01')])).toMatchObject({ on: true, restored: TODAY, failures: [{ day: '2026-09-24' }], reasons: [] })
    // No spot-check since the count began: still off. Nine days: still off.
    expect(watch(h, [spot(LAUNCH)]).on).toBe(false)
    expect(watch(h, [spot(LAUNCH), spot('2026-10-01')], at('08:00', '2026-10-04')).on).toBe(false)
  })

  it('once back, stays on through a later gap, and turns off again at the next failure', () => {
    const later = '2026-10-10'
    const h = history(17, later)
    lineOf(h, '2026-09-24').at = at('13:30', '2026-09-24').toISOString()
    gap(h, '2026-10-07')
    expect(watch(h, [spot(LAUNCH), spot('2026-10-01')], at('08:00', later))).toMatchObject({ on: true, restored: '2026-10-05' })
    lineOf(h, '2026-10-08').at = at('14:00', '2026-10-08').toISOString()
    const again = watch(h, [spot(LAUNCH), spot('2026-10-01')], at('08:00', later))
    expect(again.on).toBe(false)
    expect(lastOf(again.failures).day).toBe('2026-10-08')
  })

  it('with no launch day, or one still to come, the ten-day check alone decides, as at first', () => {
    const h = history(GATE_DAYS)
    expect(watch(h, [spot(addDays(TODAY, -3))], now, null)).toMatchObject({ on: true, launch: null })
    expect(watch(h, [], now, null)).toMatchObject({ on: false, launch: null })
    expect(watch({ tasks: [], briefs: [] }, [spot(LAUNCH)], now, '2026-10-06')).toMatchObject({ on: false, launch: null })
  })
})

// A day with the Social path's row on, at the office in the morning.
const ELIGIBLE = ['greet-by-name', 'ask-one-question']
function coachBlock(extra: Record<string, unknown> = {}, row: CoachBlock['row'] = { path: 'social', candidates: ELIGIBLE }): CoachBlock & Record<string, unknown> {
  return {
    eligible: [{ path: 'social', ids: ELIGIBLE }],
    ineligibleReason: null,
    day: TODAY,
    block: 'morning',
    shape: 'People around by today’s shape: at the office',
    stages: [{ path: 'social', stage: 2, name: 'One step past hello', reentry: false }],
    dateDay: false,
    perRep: [
      { path: 'social', id: 'greet-by-name', drawn: 4, done: 3, partly: 0, no: 1, last: ['done', 'no'], settings: ['recurring'] },
      { path: 'social', id: 'ask-one-question', drawn: 2, done: 1, partly: 1, no: 0, last: ['partly'], settings: [] },
    ],
    row,
    ...extra,
  }
}
function sheetFor(day: string): FactSheet {
  return {
    version: 1,
    day,
    builtAt: `${day}T11:41:00.000Z`,
    hour: 7,
    weeks: 3,
    days: 30,
    direction: null,
    said: [],
    checkedIn: { morning: `${day}T11:40:00.000Z` },
    facts: [
      { id: 'week.today', tags: ['cue'], text: 'Today is Monday; a daycare day with pickup at 17:30; at the office; not a study night; her bedtime 20:00.', values: { weekday: 'Monday', daycare: 1, pickup: '17:30', office: 1, church: 0, studyNight: 0 } },
      { id: 'week.tomorrow', tags: ['cue'], text: 'Tomorrow is Tuesday; a daycare day with pickup at 17:30.', values: { day: addDays(day, 1), weekday: 'Tuesday', daycare: 1, pickup: '17:30', office: 0, church: 0, studyNight: 0 } },
    ],
  }
}
/** A store where the gate is met, today's sheet carries the morning check-in and the coach block, and today's line is stored. */
function ready(block: CoachBlock & Record<string, unknown> = coachBlock(), opts: { line?: boolean; settings?: Record<string, unknown>; prefs?: Record<string, unknown> } = {}): Store {
  const store = memoryStore()
  const h = history(GATE_DAYS)
  for (const t of h.tasks) void store.writeTask(t)
  for (const b of h.briefs) void store.writeBrief(b, b.at)
  void store.writeSpot(spot(addDays(TODAY, -2)))
  const sheet = sheetFor(TODAY)
  put(store, APP, 'facts', TODAY, TODAY, { day: TODAY, builtAt: sheet.builtAt, updatedAt: sheet.builtAt, sheet, coach: block }, sheet.builtAt)
  put(store, APP, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false, ...(opts.settings ?? {}) })
  if (opts.prefs) put(store, APP, 'brainPrefs', 'prefs', null, { id: 'prefs', ...opts.prefs })
  if (opts.line !== false) void store.writeBrief(line(TODAY), line(TODAY).at)
  return store
}
function routine(store: Store) {
  const calls: { text: string; taskStatus: string | undefined }[] = []
  const f = (async (_u: string | URL | Request, init?: RequestInit) => {
    calls.push({ text: JSON.parse(String(init?.body)).text, taskStatus: (await store.readTask(taskIdOf('coach', TODAY)))?.status })
    return new Response(JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/session_c' }), { status: 200 })
  }) as typeof fetch
  return { f, calls }
}
const deps = (store: Store, now: Date) => ({ env, store, now, fetcher })
const url = (path: string, q: Record<string, string>) => new URL(`https://w.test${path}?${new URLSearchParams(q)}`)
const post = (store: Store, now: Date, answer: unknown) => handleLine(deps(store, now), { task: 'coach', day: TODAY, answer, askedModel: 'opus', writtenModel: 'claude-opus-5-5', runnerModel: 'claude-haiku-4-5-20251001' })
const coachRow = (store: Store) => JSON.parse(store.rows.get(`${BRAIN_APP}|coach|${TODAY}:coach`)?.body ?? 'null')

describe('the coach job', () => {
  it('stays off while switched off or, with no launch day, while the ten-day check is not met, and says why', async () => {
    const store = ready()
    expect(await runCoach({ ...env, COACH_WRITER: 'off' }, store, at('07:50', TODAY))).toMatchObject({ ran: false, reason: 'the coach is off' })
    const shut = memoryStore()
    const r = await runCoach(env, shut, at('07:50', TODAY))
    expect(r).toMatchObject({ ran: false, reason: 'the watch has the coach off', watch: { on: false, launch: null } })
    expect(r.watch?.reasons.join(' ')).toContain('0 of 10 consecutive scheduled days so far')
  })

  it('once the gate is met, fires once after the day’s line, marking the task first, and leaves the app’s pick standing if no answer comes in time', async () => {
    const store = ready()
    const r = routine(store)
    expect(await runCoach(env, store, at('07:50', TODAY), { fireFetcher: r.f })).toMatchObject({ ran: true, reason: 'Claude is coaching' })
    expect(r.calls).toEqual([{ text: `Life Mirror bridge: task=coach day=${TODAY} model=opus. Read CLAUDE.md in this repository and do exactly what it says, then stop.`, taskStatus: 'firing' }])
    expect(await runCoach(env, store, at('08:00', TODAY), { fireFetcher: r.f })).toMatchObject({ ran: false, reason: 'waiting for Claude' })
    expect(await runCoach(env, store, at('08:10', TODAY), { fireFetcher: r.f })).toMatchObject({ ran: false, reason: 'no valid line from Claude within 20 minutes' })
    expect(await store.readTask(taskIdOf('coach', TODAY))).toMatchObject({ status: 'fallback', fallbackReason: 'no valid line from Claude within 20 minutes; the app’s own pick stands' })
    expect(r.calls).toHaveLength(1)
  })

  it('waits for the day’s line, has nothing to do while a step is started, and defers to the monthly check’s help on the Partner path', async () => {
    expect(await runCoach(env, ready(coachBlock(), { line: false }), at('07:50', TODAY))).toMatchObject({ ran: false, reason: 'waiting for the day’s line' })
    expect(await runCoach(env, ready(coachBlock({}, { path: 'social', candidates: [] })), at('07:50', TODAY))).toMatchObject({ ran: false, reason: 'nothing for the coach to choose' })
    const partner = ready(coachBlock({}, { path: 'partner', candidates: ['talk-ordinary-week'] }))
    put(partner, APP, 'monthlyChecks', '1', TODAY, { id: 1, month: TODAY.slice(0, 7), day: TODAY, answers: { safety: true, conduct: false, doubt: null } })
    expect(await runCoach(env, partner, at('07:50', TODAY))).toMatchObject({ ran: false, reason: 'the monthly check’s help is showing; the coach defers to it' })
  })
})

async function opened(store: Store, now = at('07:50', TODAY), e: Parameters<typeof runCoach>[0] = env) {
  const r = routine(store)
  await runCoach(e, store, now, { fireFetcher: r.f })
}

/** A store on launch day: nothing behind it but a clean spot-check made since launch, today's sheet with the coach block, and today's line. */
function fresh(block: CoachBlock & Record<string, unknown> = coachBlock()): Store {
  const store = memoryStore()
  void store.writeSpot({ ...spot(TODAY), at: `${TODAY}T11:00:00.000Z` })
  const sheet = sheetFor(TODAY)
  put(store, APP, 'facts', TODAY, TODAY, { day: TODAY, builtAt: sheet.builtAt, updatedAt: sheet.builtAt, sheet, coach: block }, sheet.builtAt)
  put(store, APP, 'settings', '1', null, { id: 1, hideFaith: false, showPrivate: false, privateInSelection: false })
  void store.writeBrief(line(TODAY), line(TODAY).at)
  return store
}
const launched = { ...env, COACH_LAUNCH: TODAY }
const keyFound: SpotRow = { ...spot(TODAY, false), id: 'spot:found', at: `${TODAY}T11:55:00.000Z` }
const pickOf = (id: string, path = 'social') => ({ id: `${TODAY}:coach`, day: TODAY, block: 'morning', path, ids: [id], versions: { [id]: 'x' }, model: 'claude-opus-5-5', askedModel: 'opus', runnerModel: null, at: at('07:52', TODAY).toISOString() })

describe('the coach job after launch', () => {
  it('runs from launch with nothing behind it but a clean spot-check made since', async () => {
    const store = fresh()
    const r = routine(store)
    expect(await runCoach(launched, store, at('07:50', TODAY), { fireFetcher: r.f })).toMatchObject({ ran: true, reason: 'Claude is coaching' })
    expect(r.calls).toHaveLength(1)
  })

  it('off by its watch, fires nothing and takes back today’s pick where the phone reads it, keeping it on record', async () => {
    const store = fresh()
    await opened(store, at('07:50', TODAY), launched)
    expect(await post(store, at('07:52', TODAY), { picks: [{ id: ELIGIBLE[0], version: 'At the office, greet one colleague by name as you pass.' }] })).toEqual({ status: 200, body: { ok: true } })
    void store.writeSpot(keyFound)
    expect(await runCoach(launched, store, at('12:00', TODAY))).toMatchObject({ ran: false, reason: 'the watch has the coach off', withdrawn: true, watch: { on: false, launch: TODAY } })
    const kept = store.rows.get(`${BRAIN_APP}|coach|${TODAY}:coach`)
    expect(kept?.deleted).toBe(1)
    expect(JSON.parse(kept?.body ?? '{}')).toMatchObject({ ids: [ELIGIBLE[0]] })
    expect(await store.hasCoach(`${TODAY}:coach`)).toBe(false)
    expect(await store.readTask(taskIdOf('coach', TODAY))).toMatchObject({ status: 'written', withdrawn: { reason: expect.stringContaining('found a key') } })
    // Taken back once: the next tick finds nothing left to take, and still fires nothing.
    expect(await runCoach(launched, store, at('12:15', TODAY))).toMatchObject({ ran: false, reason: 'the watch has the coach off' })
    expect(await runCoach(launched, store, at('12:15', TODAY))).not.toHaveProperty('withdrawn')
  })

  it('off by its watch, closes a run still open, so its answer is refused and nothing is stored', async () => {
    const store = fresh()
    await opened(store, at('07:50', TODAY), launched)
    void store.writeSpot(keyFound)
    expect(await runCoach(launched, store, at('12:00', TODAY))).toMatchObject({ ran: false, reason: 'the watch has the coach off' })
    expect(await store.readTask(taskIdOf('coach', TODAY))).toMatchObject({ status: 'fallback', fallbackReason: expect.stringContaining('the app’s own pick stands') })
    expect(await post(store, at('12:01', TODAY), { picks: [{ id: ELIGIBLE[0], version: 'At the office, greet one colleague by name.' }] })).toMatchObject({ status: 409 })
    expect(await store.hasCoach(`${TODAY}:coach`)).toBe(false)
  })

  it('switched off, takes back today’s pick too', async () => {
    const store = fresh()
    await store.writeCoach(pickOf(ELIGIBLE[0]), at('07:52', TODAY).toISOString())
    expect(await runCoach({ ...launched, COACH_WRITER: 'off' }, store, at('08:00', TODAY))).toMatchObject({ ran: false, reason: 'the coach is off', withdrawn: true })
    expect(await store.hasCoach(`${TODAY}:coach`)).toBe(false)
  })

  it('on the Partner path, a pick made before the monthly check’s help showed gives way to it; a Social pick does not', async () => {
    const help = { id: 1, month: TODAY.slice(0, 7), day: TODAY, answers: { safety: true, conduct: false, doubt: null } }
    const partner = fresh(coachBlock({}, { path: 'partner', candidates: ['talk-ordinary-week'] }))
    await partner.writeCoach(pickOf('talk-ordinary-week', 'partner'), at('07:52', TODAY).toISOString())
    void partner.writeTask({ ...task(TODAY), id: taskIdOf('coach', TODAY), task: 'coach' })
    put(partner, APP, 'monthlyChecks', '1', TODAY, help)
    expect(await runCoach(launched, partner, at('09:00', TODAY))).toMatchObject({ ran: false, reason: 'the monthly check’s help is showing; the coach defers to it', withdrawn: true })
    expect(await partner.hasCoach(`${TODAY}:coach`)).toBe(false)
    const social = fresh()
    await social.writeCoach(pickOf(ELIGIBLE[0]), at('07:52', TODAY).toISOString())
    void social.writeTask({ ...task(TODAY), id: taskIdOf('coach', TODAY), task: 'coach' })
    put(social, APP, 'monthlyChecks', '1', TODAY, help)
    expect(await runCoach(launched, social, at('09:00', TODAY))).toEqual({ ran: false, reason: 'done for today', day: TODAY })
    expect(await social.hasCoach(`${TODAY}:coach`)).toBe(true)
  })

  it('reports where today stands by ids and counts: the row the phone’s block offers, the task and the pick', async () => {
    const store = fresh()
    await opened(store, at('07:50', TODAY), launched)
    await post(store, at('07:52', TODAY), { picks: [{ id: ELIGIBLE[0], version: 'At the office, greet one colleague by name.' }, { id: ELIGIBLE[1], version: 'At the office, ask one colleague one question about their morning.' }] })
    expect(await coachToday(store, TODAY)).toEqual({ day: TODAY, coachBlock: true, row: { path: 'social', candidates: 2 }, task: { status: 'written', forced: false, dry: false, fallbackReason: null, withdrawn: null }, pick: { path: 'social', reps: 2, model: 'claude-opus-5-5' } })
    // A block from the phone's earlier build carries no row.
    expect(await coachToday(fresh(coachBlock({}, null)), TODAY)).toMatchObject({ coachBlock: true, row: null, task: null, pick: null })
  })

  it('marks every read of a run made by hand to test the path as a test, and no read of a real run', async () => {
    const dry = fresh()
    const r = routine(dry)
    await runCoach(launched, dry, at('07:50', TODAY), { force: true, dry: true, fireFetcher: r.f })
    await handleBriefing(deps(dry, at('07:51', TODAY)), url('/claude/briefing', { task: 'coach', day: TODAY }))
    await handleContext(deps(dry, at('07:52', TODAY)), url('/claude/context', { task: 'coach', day: TODAY, category: 'notes' }))
    const reads = await dry.readReads(50)
    expect(reads.length).toBeGreaterThan(1)
    expect(reads.every((x) => x.dry === true)).toBe(true)
    const real = fresh()
    await opened(real, at('07:50', TODAY), launched)
    await handleBriefing(deps(real, at('07:51', TODAY)), url('/claude/briefing', { task: 'coach', day: TODAY }))
    const realReads = await real.readReads(50)
    expect(realReads.length).toBeGreaterThan(1)
    expect(realReads.some((x) => 'dry' in x)).toBe(false)
  })
})

describe('the coach briefing', () => {
  it('carries the decision core by allowlist: nothing unnamed and no tier-2 field reaches it, by key', async () => {
    const store = ready(coachBlock({ carried: 'Weekend afternoons have carried an in-person rep 3 times', peopleSeen: 3, invented: 'x' }))
    await opened(store)
    const r = await handleBriefing(deps(store, at('07:52', TODAY)), url('/claude/briefing', { task: 'coach', day: TODAY }))
    expect(r.status).toBe(200)
    const body = r.body as { core: Record<string, unknown>; briefing: string; instructions: string; context: { categories: string[] } }
    expect(Object.keys(body.core).sort()).toEqual([...COACH_CORE_KEYS].sort())
    for (const k of Object.keys(body.core)) expect(k).not.toMatch(/tier|carried|seen|invented/i)
    expect(JSON.stringify(body)).not.toMatch(/has carried|carried an in-person|peopleSeen|invented/)
    expect(body.briefing).toContain('- [greet-by-name] Greet someone by name: drawn 4, done 3, partly 0, no 1')
    expect(body.instructions).toContain('never suggest seeing or talking to anyone in person')
    expect(body.context.categories).not.toContain('tier2')
  })

  it('gives the coach byte-identical payloads whatever tier 2 says: the sheet’s tier-2 fact and any tier-2 key on the block change nothing', async () => {
    // Tier 2 is history by context (Part 20); the coach reads history by rep alone, so records that differ only in tier 2 brief it identically.
    const a = ready()
    const b = ready(coachBlock({ carried: 'Weekend afternoons have carried an in-person rep 9 times' }))
    const withTier2 = (store: Store, n: number) => {
      const sheet = { ...sheetFor(TODAY), facts: [...sheetFor(TODAY).facts, { id: 'people.seen', tags: ['social'], text: `Weekday mornings have carried an in-person rep ${n} times.`, values: { n } }] }
      const row = JSON.parse(store.rows.get(`${APP}|facts|${TODAY}`)?.body ?? '{}')
      put(store, APP, 'facts', TODAY, TODAY, { ...row, sheet }, sheet.builtAt)
    }
    withTier2(a, 3)
    withTier2(b, 9)
    await opened(a)
    await opened(b)
    const one = await handleBriefing(deps(a, at('07:52', TODAY)), url('/claude/briefing', { task: 'coach', day: TODAY }))
    const two = await handleBriefing(deps(b, at('07:52', TODAY)), url('/claude/briefing', { task: 'coach', day: TODAY }))
    expect(JSON.stringify(one.body)).toBe(JSON.stringify(two.body))
  })

  it('reads under the coach’s profile: the monthly check on the Partner path while its switch is on, private items only while they may inform a pick, faith only while shown', async () => {
    const block = coachBlock({}, { path: 'partner', candidates: ['talk-ordinary-week'] })
    const s = ready(block)
    put(s, APP, 'monthlyChecks', '2', '2026-10-01', { id: 2, month: '2026-10', day: '2026-10-01', answers: { safety: false, conduct: false, doubt: true } })
    put(s, APP, 'privateItems', '4', null, { id: 4, name: 'Pottery', archived: 0 })
    await opened(s)
    const text = ((await handleBriefing(deps(s, at('07:52', TODAY)), url('/claude/briefing', { task: 'coach', day: TODAY }))).body as { briefing: string }).briefing
    expect(text).toContain('the monthly check for 2026-10: safety no, conduct no, a doubt set aside yes')
    expect(text).not.toContain('Pottery')
    const off = ready(block, { prefs: { writerModel: 'opus', switches: { monthlyCheck: false } }, settings: { privateInSelection: true } })
    put(off, APP, 'monthlyChecks', '2', '2026-10-01', { id: 2, month: '2026-10', day: '2026-10-01', answers: { safety: false, conduct: false, doubt: true } })
    put(off, APP, 'privateItems', '4', null, { id: 4, name: 'Pottery', archived: 0 })
    await opened(off)
    const text2 = ((await handleBriefing(deps(off, at('07:52', TODAY)), url('/claude/briefing', { task: 'coach', day: TODAY }))).body as { briefing: string }).briefing
    expect(text2).not.toContain('monthly check for')
    expect(text2).toContain('Pottery')
    // On demand too: tier 2 is not a category the coach may read; the monthly check is, while on.
    const q = (store: Store, category: string) => handleContext(deps(store, at('07:53', TODAY)), url('/claude/context', { task: 'coach', day: TODAY, category }))
    expect((await q(s, 'tier2')).status).toBe(403)
    expect((await q(s, 'monthlyCheck')).status).toBe(200)
    expect((await q(off, 'monthlyCheck')).status).toBe(403)
  })
})

describe('the coach’s answer', () => {
  it('refuses any rep outside the row’s own candidates, more than two, or the same twice', async () => {
    const store = ready()
    await opened(store)
    expect(await post(store, at('07:52', TODAY), { picks: [{ id: 'host-something-small', version: 'Say hello first.' }] })).toMatchObject({ status: 422, body: { reason: '"host-something-small" is not one of the reps the row may offer now', retry: true } })
    const again = ready()
    await opened(again)
    expect(await post(again, at('07:52', TODAY), { picks: [...ELIGIBLE, 'greet-by-name'].map((id) => ({ id, version: 'x' })) })).toMatchObject({ status: 422, body: { reason: 'picks must name one or two reps, each with its id and version' } })
    const twice = ready()
    await opened(twice)
    expect(await post(twice, at('07:52', TODAY), { picks: [{ id: 'greet-by-name', version: 'x' }, { id: 'greet-by-name', version: 'y' }] })).toMatchObject({ status: 422, body: { reason: 'the same rep named twice' } })
  })

  it('holds the version to twenty-five words and the people guard: no rating, verdict or reply as a measure', async () => {
    const cases: [string, string][] = [
      ['At the office this morning, greet one colleague by name as you pass, and notice what they are carrying today before you ask them anything else at all.', '28 words; at most 25'],
      ['Rate how warm each colleague is before you greet them.', 'rates, ranks or compares a person, or counts an outcome as success'],
      ['Greet the avoidant one by name first.', 'passes a verdict on a person'],
      ['Greet someone by name and count it if they reply.', 'treats a reply, a match or a rejection as a measure'],
    ]
    for (const [version, reason] of cases) {
      const store = ready()
      await opened(store)
      expect(await post(store, at('07:52', TODAY), { picks: [{ id: 'greet-by-name', version }] }), version).toMatchObject({ status: 422, body: { reason } })
      // With two named, each line is held to the rules, and the refusal names the rep whose line broke one.
      const two = ready()
      await opened(two)
      expect(await post(two, at('07:52', TODAY), { picks: [{ id: 'greet-by-name', version: 'Greet one colleague by name.' }, { id: 'ask-one-question', version }] }), version).toMatchObject({ status: 422, body: { reason: `ask-one-question: ${reason}` } })
    }
  })

  it('refuses anyone in person when nobody is around by today’s shape, so the app’s own pick stands', async () => {
    const store = ready(coachBlock({ ineligibleReason: 'Nobody is around in this block by today’s shape, so in-person reps wait.' }, { path: 'social', candidates: ['text-a-friend'] }))
    await opened(store)
    expect(await post(store, at('07:52', TODAY), { picks: [{ id: 'text-a-friend', version: 'Send the message, then go talk to someone in person at lunch.' }] })).toMatchObject({ status: 422, body: { reason: 'puts someone in person beside him when nobody is around by today’s shape' } })
    expect(await post(store, at('07:53', TODAY), { picks: [{ id: 'text-a-friend', version: 'Talk to someone face to face today.' }] })).toMatchObject({ status: 422, body: { retry: false } })
    expect(coachRow(store)).toBeNull()
    expect(await store.readTask(taskIdOf('coach', TODAY))).toMatchObject({ status: 'refused' })
  })

  it('stores two reps, each with its own line, where the phone reads them; a dry run by hand is checked and never stored there', async () => {
    const store = ready()
    await opened(store)
    const version = 'At the office, greet one colleague by name as you pass; put your attention on what they are carrying.'
    const asked = 'At the office, ask one colleague one question about their morning, then follow their answer.'
    expect(await post(store, at('07:52', TODAY), { picks: [{ id: ELIGIBLE[0], version }, { id: ELIGIBLE[1], version: asked }] })).toEqual({ status: 200, body: { ok: true } })
    expect(coachRow(store)).toMatchObject({ day: TODAY, block: 'morning', path: 'social', ids: ELIGIBLE, versions: { [ELIGIBLE[0]]: version, [ELIGIBLE[1]]: asked }, model: 'claude-opus-5-5', askedModel: 'opus' })
    expect(await store.readTask(taskIdOf('coach', TODAY))).toMatchObject({ status: 'written', writer: 'claude' })
    const dry = ready()
    const r = routine(dry)
    await runCoach(env, dry, at('07:50', TODAY), { force: true, dry: true, fireFetcher: r.f })
    expect(await post(dry, at('07:52', TODAY), { picks: [{ id: 'greet-by-name', version }] })).toEqual({ status: 200, body: { ok: true, dry: true } })
    expect(coachRow(dry)).toBeNull()
    expect(await dry.readTask(taskIdOf('coach', TODAY))).toMatchObject({ status: 'written', dry: true, forced: true })
  })

  it('records a spot-check of the run logs by the day it was made', async () => {
    const store = memoryStore()
    expect(await recordSpot(store, at('20:00', TODAY), TZ, 4, true)).toMatchObject({ kind: 'spotcheck', day: TODAY, runs: 4, clean: true })
  })
})
