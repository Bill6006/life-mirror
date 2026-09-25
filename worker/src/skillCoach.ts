import { readBrainPrefs } from '../../src/brainShared'
import { ASK_KEEPS_DAYS, checkReview, checkSuggestion, FAITH_WORDS, HARD_RUN, isPhysical, MAX_SETUP_RUNS_A_DAY, practised, proposalIdOf, revisionOf, skillSessions, SKILL_COACH, type CoachAsk, type CoachContext, type CoachProposal, type OfferLike, type OutcomeLike, type ReviewSuggestion, type SkillSession, type SkillSuggestion } from '../../src/coachShared'
import { claudeOn, fallbackReason, fire, fireFailure, fireText, MAX_POSTS, timeoutMinutes, type ClaudeEnv, type Deps, type Reply } from './claude'
import type { Env } from './env'
import { parseOutput } from './prompt'
import { accessFor, bytesOf, gatesFrom, itemLines, logRead, privateNames, readCategory, type Access, type Item } from './retrieval'
import { addDays, localTime } from './time'
import type { Store, TaskRow } from './turso'

// Parts 40 and 41 in the Worker: the skill coach's runs, on the same bridge as the line and the coach.
// A suggestion for a learning commitment's current skill fires on demand when the phone asks, at most
// two runs a day, never before the day's line and the coach (D7); reviews the app found due are
// batched in one run a day after them. Claude reads one commitment whole, under the Brain switches,
// with every read logged; its answer passes the same checks on the Worker the phone relies on, and is
// stored as a proposal the phone shows and the owner decides. No free model stands in: a run that
// fails leaves the commitment to be set by hand. While the gate is closed nothing here runs at all:
// no read, no fire, no row.

export type CoachTask = 'skill' | 'progress'
export const skillTaskIds = (day: string): [string, string] => [`task:${day}:skill`, `task:${day}:skill.2`]
export const progressTaskId = (day: string): string => `task:${day}:progress`

type Gate = 'gated' | 'open'
export type CommitmentsEnv = ClaudeEnv & Pick<Env, 'TIMEZONE'>

export interface CommitmentsOptions {
  /** By hand with the run key: without waiting for the day's line and the coach. Never past the gate. */
  force?: boolean
  dry?: boolean
  fireFetcher?: typeof fetch
  /** For the tests; the deployed Worker reads the shared gate. */
  gate?: Gate
  /** What the coach's job said on this same tick, when it ran first. */
  coach?: { reason: string }
}

export interface CommitmentsResult {
  ran: boolean
  reason: string
  day?: string
  task?: string
  asks?: number[]
}

/** What the coach's job says when it will not run today, so the skill coach need not wait for it. */
const COACH_STANDS_DOWN = ['done for today', 'the coach is off', 'Claude is off', 'the watch has the coach off', 'nothing for the coach to choose', 'no coach block for today yet', 'the monthly check’s help is showing']

/** Why the skill coach must wait for the day's line or the coach, or null once both are settled for the day. */
async function waitFor(store: Store, day: string, coach: CommitmentsOptions['coach']): Promise<string | null> {
  if (!(await store.hasBrief(`${day}:brief`))) return 'waiting for the day’s line'
  const [line, c] = await Promise.all([store.readTask(`task:${day}:line`), store.readTask(`task:${day}:coach`)])
  if (line && (line.status === 'firing' || line.status === 'fired')) return 'waiting for the day’s line'
  if (c) return c.status === 'firing' || c.status === 'fired' ? 'waiting for the coach' : null
  return coach && COACH_STANDS_DOWN.some((r) => coach.reason.startsWith(r)) ? null : 'waiting for the coach'
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function askOf(id: string, body: unknown): (CoachAsk & { id: number }) | null {
  const b = obj(body)
  const n = Number(b.id ?? id)
  if (!Number.isInteger(n) || typeof b.aimId !== 'number' || (b.kind !== 'setup' && b.kind !== 'review') || typeof b.revision !== 'string' || typeof b.day !== 'string') return null
  const { care, ...rest } = b as unknown as CoachAsk
  return { ...rest, id: n, ...(typeof care === 'string' ? { care: care.trim().slice(0, 200) } : {}) }
}

/** The asks still waiting: Claude asked, undecided, unanswered, within three days, not already carried by a run today; the newest per commitment and kind. */
async function pendingAsks(store: Store, day: string, today: readonly TaskRow[]): Promise<{ setup: number[]; review: number[] }> {
  const [rows, answered] = await Promise.all([store.readRecords('coachAsks', { from: addDays(day, -ASK_KEEPS_DAYS) }), store.proposalIds()])
  const carried = new Set(today.flatMap((t) => t.asks ?? []))
  const newest = new Map<string, CoachAsk & { id: number }>()
  for (const r of rows) {
    const a = askOf(r.id, r.body)
    if (!a || a.claude !== true || a.decision || answered.has(proposalIdOf(a.id)) || carried.has(a.id)) continue
    const k = `${a.kind}:${a.aimId}`
    const prev = newest.get(k)
    if (!prev || a.at > prev.at) newest.set(k, a)
  }
  const all = [...newest.values()].sort((a, b) => (a.at < b.at ? -1 : 1))
  return { setup: all.filter((a) => a.kind === 'setup').map((a) => a.id), review: all.filter((a) => a.kind === 'review').map((a) => a.id) }
}

/** Marks the run, then fires the routine with no personal text: the task, the day and the model alias. The mark comes first, since a fire has no idempotency key. */
async function startCoachTask(env: CommitmentsEnv, store: Store, now: Date, task: CoachTask, id: string, day: string, asks: number[], opts: CommitmentsOptions): Promise<CommitmentsResult> {
  const [prefsRow, prev] = await Promise.all([store.readRecord('brainPrefs', 'prefs'), store.readTask(id)])
  const prefs = readBrainPrefs(prefsRow)
  const at = now.toISOString()
  const row: TaskRow = { id, kind: 'task', task, day, at, status: 'firing', trigger: opts.force ? 'forced' : 'ask', factsDay: day, askedModel: prefs.writerModel, ...(opts.force ? { forced: true } : {}), fires: (prev ? (prev.fires ?? 1) : 0) + 1, contextCalls: 0, contextBytes: 0, posts: 0, refusals: [], asks, ...(opts.dry ? { dry: true } : {}) }
  await store.writeTask(row)
  const f = await fire(env, fireText(task, day, prefs.writerModel), opts.fireFetcher)
  if (f.ok) {
    await store.writeTask({ ...row, status: 'fired', firedAt: at, fireStatus: f.status, sessionUrl: f.sessionUrl })
    return { ran: true, reason: task === 'skill' ? 'Claude is suggesting' : 'Claude is reviewing', day, task: id, asks }
  }
  const why = fireFailure(f)
  await store.writeTask({ ...row, status: 'fallback', fireStatus: f.status, retryAfter: f.retryAfter, error: f.error, fallbackReason: `${why}; nothing was suggested, and the commitment works by hand` })
  return { ran: false, reason: why, day, task: id, asks }
}

/**
 * The skill coach's job, each tick after the coach's. Closed, it returns before reading anything.
 * Open: a run under way is waited for, or let go when it fails (no free model writes a suggestion);
 * then, once the day's line and the coach are settled, the asks waiting are answered: suggestions
 * first, in at most two runs a day, then the day's reviews in one.
 */
export async function runCommitments(env: CommitmentsEnv, store: Store, now: Date, opts: CommitmentsOptions = {}): Promise<CommitmentsResult> {
  if ((opts.gate ?? SKILL_COACH) !== 'open') return { ran: false, reason: 'gated' }
  if (!claudeOn(env)) return { ran: false, reason: 'Claude is off' }
  const day = localTime(now, env.TIMEZONE).day
  const today = (await Promise.all([...skillTaskIds(day), progressTaskId(day)].map((id) => store.readTask(id)))).filter((t): t is TaskRow => t !== null)
  for (const t of today) {
    if (t.status !== 'firing' && t.status !== 'fired') continue
    const why = fallbackReason(t, now, timeoutMinutes(env))
    if (!why) return { ran: false, reason: 'waiting for Claude', day, task: t.id }
    await store.writeTask({ ...t, status: 'fallback', fallbackReason: `${why}; nothing was suggested, and the commitment works by hand` })
    return { ran: false, reason: why, day, task: t.id }
  }
  if (!opts.force) {
    const wait = await waitFor(store, day, opts.coach)
    if (wait) return { ran: false, reason: wait, day }
  }
  const [settings, prefs] = await Promise.all([store.readRecord('settings', '1'), store.readRecord('brainPrefs', 'prefs')])
  if (!accessFor('skill', gatesFrom(settings), readBrainPrefs(prefs)).allowed('commitments')) return { ran: false, reason: 'Claude may not read commitments', day }
  const pending = await pendingAsks(store, day, today)
  const setupRuns = today.filter((t) => t.task === 'skill').length
  if (pending.setup.length && setupRuns < MAX_SETUP_RUNS_A_DAY) return startCoachTask(env, store, now, 'skill', skillTaskIds(day)[setupRuns], day, pending.setup, opts)
  if (pending.review.length && !today.some((t) => t.task === 'progress')) return startCoachTask(env, store, now, 'progress', progressTaskId(day), day, pending.review, opts)
  if (pending.setup.length) return { ran: false, reason: 'today’s two suggestion runs are used; the rest wait for tomorrow', day }
  return { ran: false, reason: 'nothing asked', day }
}

// ─── The briefing and the answer ────────────────────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const reply = (status: number, body: unknown): Reply => ({ status, body })
export type CoachDeps = Deps & { gate?: Gate }

/** The run a request is for: the day's skill coach run still open, with a post left. Refused outright while the gate is closed. */
async function openCoachTask(deps: CoachDeps, task: unknown, day: unknown): Promise<{ ok: true; t: TaskRow } | { ok: false; reply: Reply }> {
  if ((deps.gate ?? SKILL_COACH) !== 'open') return { ok: false, reply: reply(403, { error: 'the skill coach is not switched on' }) }
  if (task !== 'skill' && task !== 'progress') return { ok: false, reply: reply(400, { error: 'task must be skill or progress' }) }
  if (typeof day !== 'string' || !DAY_RE.test(day)) return { ok: false, reply: reply(400, { error: 'day must be YYYY-MM-DD' }) }
  const ids = task === 'skill' ? skillTaskIds(day) : [progressTaskId(day)]
  const tasks = (await Promise.all(ids.map((id) => deps.store.readTask(id)))).filter((t): t is TaskRow => t !== null && (t.status === 'firing' || t.status === 'fired'))
  const t = tasks.sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  if (!t) return { ok: false, reply: reply(409, { error: `no ${task} run is open for ${day}` }) }
  if (t.posts >= MAX_POSTS) return { ok: false, reply: reply(409, { error: 'no attempts left' }) }
  return { ok: true, t }
}

/** One commitment as the run reads it, and what its answer is checked against. */
interface Item_ {
  ask: CoachAsk & { id: number }
  aimId: number
  text: string
  ctx: CoachContext
  currentSkill: string
  hardRun: boolean
}

const EASE: Record<string, string> = { hard: 'Hard', right: 'About right', easy: 'Easy' }
const WHY: Record<string, string> = { noTime: 'no time', didntWant: 'did not want to', tired: 'tired', tooMuch: 'too much on' }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A commitment whole, as the briefing says it: its words, its current skill and practice, its sessions and how they went, refusals and why, the skills before it, and what was proposed before with what was done. Every count it says goes into the numbers an answer may use. */
function commitmentText(ask: CoachAsk & { id: number }, aim: Record<string, unknown>, skills: Record<string, unknown>[], sessions: SkillSession[], earlier: { name: string; sessions: number; from: string | null; to: string | null }[], history: { day: string; words: string; decision: string }[], since: string | null, physical: boolean, care: string | null, numbers: Set<string>): string {
  const n = (v: number) => {
    numbers.add(String(v))
    return v
  }
  const current = skills.find((s) => s.id === aim.currentSkillId) ?? null
  const rhythm = obj(aim.rhythm)
  const schedule = Array.isArray(aim.schedule) ? (aim.schedule as number[]) : []
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const p = practised(sessions)
  const ease = { hard: 0, right: 0, easy: 0 } as Record<string, number>
  for (const s of p.sessions) if (s.ease) ease[s.ease]++
  const refusals = sessions.filter((s) => s.outcome === 'no').slice(-5).reverse()
  const head =
    ask.kind === 'setup'
      ? `[ask ${ask.id}] SUGGEST the current skill for this commitment.`
      : ask.reason === 'struggle'
        ? `[ask ${ask.id}] REVIEW the current skill: ${n(HARD_RUN)} sessions in a row were marked Hard, on ${n(HARD_RUN)} different days, which brings a review forward. Keep, Adjust or Simplify only.`
        : `[ask ${ask.id}] REVIEW the current skill: ${n(ask.days ?? p.days.length)} different practice days on it.`
  const lines = [
    head,
    `Goal: ${str(aim.name)}.`,
    str(aim.about) ? `What would change the advice, in their words: ${str(aim.about)}.` : null,
    `How it is learned or practised: ${str(current?.method) || str(aim.method) || 'not sure yet'}.`,
    current
      ? `Current skill: “${str(current.name)}”${since ? ` since ${since}` : ''}${str(current.how) ? `; how: ${str(current.how)}` : ''}${typeof current.minutes === 'number' ? `; ${n(current.minutes)} minutes a session` : ''}.`
      : 'Current skill: none named yet.',
    typeof rhythm.perWeek === 'number' ? `Rhythm: ${n(rhythm.perWeek as number)} sessions a week${typeof rhythm.restDays === 'number' && rhythm.restDays > 0 ? `, ${plural(n(rhythm.restDays as number), 'rest day', 'rest days')} between` : ', no rest day between'}.` : 'Rhythm: flexible, none set.',
    schedule.length ? `Fixed days: ${schedule.map((d) => days[d] ?? '').join(', ')}.` : null,
    `This goal reads as physical: ${physical ? 'yes' : 'no, unless you judge otherwise'}.`,
    physical && care !== null ? (care ? `Asked about any injury or condition the practice should respect, they said: “${care}”.` : 'Asked about any injury or condition the practice should respect, they had nothing to add.') : null,
    current ? `Sessions on the current skill: ${plural(n(p.sessions.length), 'session', 'sessions')} on ${plural(n(p.days.length), 'day', 'different days')}; marked Hard ${n(ease.hard)}, About right ${n(ease.right)}, Easy ${n(ease.easy)}.` : null,
    p.sessions.length ? `The sessions, newest first: ${[...p.sessions].reverse().slice(0, 12).map((s) => `${s.day} ${s.outcome === 'done' ? 'done' : 'partly done'}${s.ease ? `, ${EASE[s.ease]}` : ''}${s.note ? `, “${s.note}”` : ''}`).join('; ')}.` : null,
    refusals.length ? `Not done lately, and why when said: ${refusals.map((s) => `${s.day}${s.why ? ` (${WHY[s.why] ?? s.why})` : ''}`).join('; ')}. A refusal is not a shortfall.` : null,
    earlier.length ? `Skills before it: ${earlier.slice(0, 6).map((e) => `“${e.name}”, ${plural(n(e.sessions), 'session', 'sessions')}${e.from ? ` from ${e.from}` : ''}${e.to ? ` to ${e.to}` : ''}`).join('; ')}.` : null,
    history.length ? `Proposed before, and what was done with it: ${history.slice(-6).map((h) => `${h.day} ${h.words}: ${h.decision}`).join('; ')}.` : null,
  ]
  const text = lines.filter(Boolean).join('\n')
  // Every number in their own words (a 5k, a lesson's number) is in the briefing too.
  for (const m of text.match(/\d+(?:[.,:]\d+)*/g) ?? []) numbers.add(m.replace(/,/g, ''))
  return text
}

const DECISIONS: Record<string, string> = { used: 'used as it was', edited: 'used after editing', another: 'another asked for', own: 'set aside for their own words', kept: 'kept', adjusted: 'adjusted', progressed: 'moved on', simplified: 'made simpler', earlier: 'an earlier skill made current', wroteNext: 'their own next skill written' }

/** The run's commitments, the same for its briefing and its answer: each ask still standing, its commitment whole, and what its answer is checked against. */
async function coachRun(deps: CoachDeps, t: TaskRow): Promise<{ ok: true; items: Item_[]; access: Access; physical: boolean } | { ok: false; reply: Reply }> {
  const store = deps.store
  const [settings, prefs] = await Promise.all([store.readRecord('settings', '1'), store.readRecord('brainPrefs', 'prefs')])
  const access = accessFor(t.task === 'progress' ? 'progress' : 'skill', gatesFrom(settings), readBrainPrefs(prefs))
  if (!access.allowed('commitments')) return { ok: false, reply: reply(409, { error: 'Claude may not read commitments' }) }
  const faithHidden = access.gates.faithHidden
  const showPrivate = obj(settings).showPrivate === true
  const [asks, aims, skills, offers, outcomes, proposals, names] = await Promise.all([
    Promise.all((t.asks ?? []).map(async (id) => askOf(String(id), await store.readRecord('coachAsks', String(id))))),
    store.readRecords('aims', {}, 1000),
    store.readRecords('skills', {}, 2000),
    store.readRecords('offers', {}, 20000),
    store.readRecords('outcomes', {}, 20000),
    store.readProposals(),
    showPrivate ? Promise.resolve([] as string[]) : privateNames(store),
  ])
  const allAsks = (await store.readRecords('coachAsks', {}, 5000)).map((r) => askOf(r.id, r.body)).filter((a): a is CoachAsk & { id: number } => a !== null)
  const aimBodies = aims.map((r) => obj(r.body))
  const skillBodies = skills.map((r) => obj(r.body))
  const offerRows = offers.map((r) => obj(r.body) as unknown as OfferLike)
  const outcomeRows = outcomes.map((r) => obj(r.body) as unknown as OutcomeLike)
  const items: Item_[] = []
  let anyPhysical = false
  for (const ask of asks) {
    if (!ask || ask.decision || (t.task === 'skill') !== (ask.kind === 'setup')) continue
    const aim = aimBodies.find((a) => a.id === ask.aimId)
    if (!aim || aim.kind !== 'certification' || aim.archivedAt || aim.pausedAt) continue
    const mine = skillBodies.filter((s) => s.aimId === ask.aimId && !s.archivedAt)
    const current = mine.find((s) => s.id === aim.currentSkillId) ?? null
    // An ask made before the commitment was edited is not answered: its answer would be dropped.
    if (revisionOf(aim as Parameters<typeof revisionOf>[0], current as Parameters<typeof revisionOf>[1]) !== ask.revision) continue
    const words = [str(aim.name), str(aim.about), str(aim.method), str(current?.name), str(current?.method), str(current?.how)]
    if (faithHidden && words.some((w) => FAITH_WORDS.test(w))) continue
    if (ask.kind === 'review' && (!current || current.id !== ask.skillId)) continue
    const since = current && typeof current.startedAt === 'string' ? localTime(new Date(current.startedAt), deps.env.TIMEZONE ?? 'UTC').day : null
    const sessions = current ? skillSessions(current.id as number, since, offerRows, outcomeRows) : []
    const earlier = mine
      .filter((s) => s.id !== current?.id)
      .map((s) => ({ name: str(s.name), sessions: practised(skillSessions(s.id as number, null, offerRows, outcomeRows)).sessions.length, from: typeof s.startedAt === 'string' ? s.startedAt.slice(0, 10) : null, to: typeof s.endedAt === 'string' ? s.endedAt.slice(0, 10) : null }))
    const history = allAsks
      .filter((a) => a.aimId === ask.aimId && a.decision)
      .map((a) => {
        const p = proposals.find((x) => x.askId === a.id)
        const words = p?.suggestion ? `“${p.suggestion.skill}”` : p?.review ? `${p.review.verdict}${p.review.change?.skill ? ` to “${p.review.change.skill}”` : ''}` : a.kind === 'review' ? 'a review asked on the phone' : 'a suggestion'
        return { day: a.day, words, decision: DECISIONS[a.decision as string] ?? String(a.decision) }
      })
    const physical = isPhysical(words)
    anyPhysical ||= physical
    // The safety answer given with this ask, else the newest given for this commitment.
    const cared = allAsks.filter((a) => a.aimId === ask.aimId && typeof a.care === 'string').sort((a, b) => (a.at < b.at ? -1 : 1))
    const care = typeof ask.care === 'string' ? ask.care : (cared.pop()?.care ?? null)
    const numbers = new Set<string>()
    const text = commitmentText(ask, aim, mine, sessions, earlier, history, since, physical, care, numbers)
    items.push({ ask, aimId: ask.aimId, text, ctx: { goal: `${str(aim.name)} ${str(aim.about)}`, physical, faithHidden, names, numbers }, currentSkill: str(current?.name), hardRun: ask.hardRun === true })
  }
  return { ok: true, items, access, physical: anyPhysical }
}

/** What Claude is told for a suggestion run and a review run. The rules the validator enforces, said first. */
export function coachInstructions(task: CoachTask): string {
  const common = `Rules, all checked by a validator that refuses the answer:
- Answer each commitment in the briefing by its ask id, as JSON only, in the shape given; nothing before or after it.
- No percentages, levels, points, scores, readiness or mastery: counts in words.
- No verdict on the person and no reason about them stated as a fact. A quiet day is not evidence; a refusal is not a shortfall.
- Nothing that is an in-person social act, dating, flirting or about a particular person: those belong to the Social and Partner paths.
- A physical goal (a handstand, running, yoga, lifting, a sport) always carries a safety line: warm-up, what pain means stop, conditions to check first (for inversions, blood pressure and the eyes), and rest. Say once that it is not medical advice. Its rhythm keeps rest days.
- Every number you write is in the briefing, or is your own minutes, sessions a week or rest days.
- Nothing you propose is applied until they choose it on their phone; the app decides what is due, keeps the rest days, and stores what they choose.
- Plain words, second person, short.`
  if (task === 'skill') {
    return `You suggest the current skill for someone's learning commitment in Life Mirror, as Claude, through their own Worker. They should not have to know the curriculum: you do.

For each commitment, propose ONE current skill: the one thing to work on now, sized so a session can be done and felt. With it: the method (theirs, unless they were not sure; then the simplest that fits the goal), how to practise it in one or two sentences, minutes for a session where that helps, a rhythm (sessions a week, and rest days between for a skill that needs recovery), why it is the right focus now in one sentence, and, where useful, one provisional likely-next skill. Set "physical" true for a physical skill.

${common}`
  }
  return `You review the current skill of someone's learning commitments in Life Mirror, as Claude, through their own Worker. The app found each review due: six different practice days on the skill with a week behind it (or six more since the last review), or three sessions in a row marked Hard.

For each, choose one verdict and say it plainly: keep (the skill still fits; no change), adjust (the same skill, practised differently: method, how, minutes or rhythm), progress (the next skill, named, with how to practise it), or simplify (a simpler skill or a simpler practice). Give one to three pieces of evidence as facts from the briefing ("5 of the last 6 sessions marked Easy"), why in one sentence, and the change in full. Six practice days are when a review is considered, never proof of readiness; Hard is evidence, never proof the skill is wrong. When three Hard sessions brought the review, answer keep, adjust or simplify only. The goal never changes, shrinks or is dropped: simplify changes the skill or its practice.

${common}`
}

const SKILL_ANSWER = { proposals: [{ askId: 'the ask id', skill: 'the one current skill', method: 'how it is learned, or null', how: 'one or two sentences', minutes: 'a whole number, or null', rhythm: { perWeek: 'sessions a week', restDays: 'rest days between: 0, 1 or 2' }, why: 'one sentence', physical: 'true or false', safety: 'for a physical skill, the safety line; else null', likelyNext: 'a provisional next skill, or null' }] }
const REVIEW_ANSWER = { reviews: [{ askId: 'the ask id', verdict: 'keep | adjust | progress | simplify', evidence: ['one to three facts from the briefing'], why: 'one sentence', change: { skill: 'the next or simpler skill, when it changes', method: 'optional', how: 'optional', minutes: 'optional', rhythm: 'optional, { perWeek, restDays } or null', safety: 'for a new physical skill' } }] }

/** GET /claude/briefing for a skill coach run: its commitments whole, the rules, and the answer's shape; every read logged by category, count and size. */
export async function handleCoachBriefing(deps: CoachDeps, url: URL): Promise<Reply> {
  const open = await openCoachTask(deps, url.searchParams.get('task'), url.searchParams.get('day'))
  if (!open.ok) return open.reply
  const t = open.t
  const built = await coachRun(deps, t)
  if (!built.ok) return built.reply
  const { items, access, physical } = built
  if (!items.length) return reply(409, { error: 'no ask of this run still stands' })
  const task = t.task === 'progress' ? 'progress' : 'skill'
  const commitments = items.map((i) => i.text).join('\n\n')
  const sections = [`[commitments] The commitments to ${task === 'skill' ? 'suggest for' : 'review'}\n${commitments}`]
  let seq = 0
  await logRead(deps.store, t.id, seq++, task, t.day, 'commitments', items.map((i) => ({ day: null, text: i.text })), commitments, 'briefing', deps.now, t.dry === true)
  // A physical goal's load: the workouts on the day's sheet, while the day's record may be read.
  if (physical && access.allowed('dayRecord')) {
    const facts = (await deps.store.readFacts(t.day)) ?? (await deps.store.readFacts(addDays(t.day, -1)))
    const load: Item[] = (facts?.sheet.facts ?? []).filter((f) => f.id === 'workout.last' || f.id === 'outside.7d').map((f) => ({ day: facts?.sheet.day ?? null, text: f.text }))
    const text = itemLines(load)
    await logRead(deps.store, t.id, seq++, task, t.day, 'dayRecord', load, text, 'briefing', deps.now, t.dry === true)
    if (load.length) sections.push(`[dayRecord] Workouts, for a physical skill's load\n${text}`)
  }
  if (access.allowed('notes')) {
    const notes = ((await readCategory({ store: deps.store, catalogue: new Map(), a: access }, 'notes', { from: addDays(t.day, -7), to: t.day, limit: 6 })) ?? []) as Item[]
    const text = itemLines(notes)
    await logRead(deps.store, t.id, seq++, task, t.day, 'notes', notes, text, 'briefing', deps.now, t.dry === true)
    if (notes.length) sections.push(`[notes] Check-in notes of the last seven days\n${text}`)
  }
  const briefing = sections.join('\n\n')
  await deps.store.writeTask({ ...t, briefingAt: deps.now.toISOString(), briefingBytes: bytesOf(briefing) })
  return reply(200, {
    task,
    day: t.day,
    askedModel: t.askedModel,
    instructions: coachInstructions(task),
    briefing,
    answer: task === 'skill' ? SKILL_ANSWER : REVIEW_ANSWER,
    post: { path: '/claude/line', body: { task, day: t.day, answer: '<your JSON answer>', askedModel: t.askedModel, writtenModel: '<the exact model id you are running as>', runnerModel: '<the routine’s own model id>', subagentError: null } },
    attemptsLeft: MAX_POSTS - t.posts,
  })
}

const clip = (v: unknown, n: number): string | null => (typeof v === 'string' ? v.slice(0, n) : null)

/** POST /claude/line for a skill coach run: each answer checked against its own commitment; stored as proposals the phone shows, unless the run was a dry one; or refused with the first reason, once retried. */
export async function handleCoachLine(deps: CoachDeps, raw: unknown): Promise<Reply> {
  const o = obj(raw)
  const open = await openCoachTask(deps, o.task, o.day)
  if (!open.ok) return open.reply
  const t = open.t
  const built = await coachRun(deps, t)
  if (!built.ok) return built.reply
  const answer = obj(typeof o.answer === 'string' ? parseOutput(o.answer) : o.answer)
  const list = (Array.isArray(t.task === 'progress' ? answer.reviews : answer.proposals) ? (t.task === 'progress' ? answer.reviews : answer.proposals) : []) as unknown[]
  const passed: { item: Item_; value: SkillSuggestion | ReviewSuggestion }[] = []
  let refusal: string | null = null
  for (const item of built.items) {
    const entry = list.find((e) => Number(obj(e).askId) === item.ask.id)
    if (!entry) continue
    const v = t.task === 'progress' ? checkReview(entry, { ...item.ctx, currentSkill: item.currentSkill, hardRun: item.hardRun }) : checkSuggestion(entry, item.ctx)
    if (!v.ok) {
      refusal = `ask ${item.ask.id}: ${v.reason}`
      break
    }
    passed.push({ item, value: v.value })
  }
  if (!refusal && !passed.length) refusal = 'no answer names an ask of this run'
  const posts = t.posts + 1
  if (refusal) {
    await deps.store.writeTask({ ...t, posts, refusals: [...t.refusals, refusal].slice(-10), ...(posts >= MAX_POSTS ? { status: 'refused' as const, fallbackReason: 'Claude’s answer was refused twice; nothing was suggested, and the commitment works by hand' } : {}) })
    return reply(422, { ok: false, reason: refusal, retry: posts < MAX_POSTS })
  }
  const at = deps.now.toISOString()
  const writtenModel = clip(o.writtenModel, 100) || clip(o.runnerModel, 100) || 'claude'
  if (!t.dry) {
    for (const { item, value } of passed) {
      const row: CoachProposal = { id: proposalIdOf(item.ask.id), askId: item.ask.id, aimId: item.aimId, kind: item.ask.kind, revision: item.ask.revision, day: t.day, at, model: writtenModel, askedModel: t.askedModel, ...(t.task === 'progress' ? { review: value as ReviewSuggestion } : { suggestion: value as SkillSuggestion }) }
      await deps.store.writeProposal(row, at)
    }
  }
  await deps.store.writeTask({ ...t, status: 'written', posts, writer: 'claude', writtenModel, runnerModel: clip(o.runnerModel, 100), subagentError: clip(o.subagentError, 300), writtenAt: at, latencyMs: deps.now.getTime() - Date.parse(t.firedAt ?? t.at) })
  return reply(200, { ok: true, answered: passed.map((p) => p.item.ask.id), ...(t.dry ? { dry: true } : {}) })
}
