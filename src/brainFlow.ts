import { activeAims, aimRecords, allIntentions, isOpenAimOffer, liveSkills, planAim, rungMarks } from './aimFlow'
import { aheadToday, cuesFor, keysOf, planFor, sessionsToday, stepFor } from './aims'
import { addDays, blockAt, BLOCKS, blockStart, dayKey, daysBetween, type Block } from './blocks'
import { heldBedtime, heldPickup } from './dayShape'
import type { CoachBlock } from './factTypes'
import { coachRow, pathOn, peopleRowOf } from './pathFlow'
import { coachBlock, lightOnlyDay, pathToday, type PathToday } from './pathStage'
import type { LineAction, LineCue, WriterModel } from './brainShared'
import { copy } from './copy'
import { clockTimesIn, fill } from './format'
import { coachMode, skillCoachOpen, type CoachMode } from './coachFlow'
import { hasMove, moveById } from './catalogue'
import { allCheckIns, allWins, contextFromWeek, db, ensureDayContext, getDayContext, getSettings, privateItems, updateSettings, type Aim, type BrainBrief, type BriefFeedback, type BriefLog, type CheckIn, type DayContext, type Intention, type Offer, type Outcome, type PathMark } from './db'
import { buildFactSheet, type FactSheet } from './facts'
import { briefData, usualFor } from './forecastFlow'
import { cardFromHypothesis, type Hypothesis } from './hypothesis'
import { evidence } from './learningFlow'
import { cardById, type ClaimCard } from './library'
import { INGREDIENTS } from './score'
import { minutesOf, withDefaults } from './settings'
import { lineFor, phoneReview, rankLines, type FeedbackBefore, type ReviewParts } from './situations'

// The brain on the phone: the fact sheet built from the record, written as a row the Worker
// reads; the phone's own line for the day, chosen once and logged; the tap that says how it
// landed; the one tap that does what the line says; why it said it; and the week reviewed. The
// Worker's line, when there is one, is read from the rows it wrote.

export async function factSheet(day: string, now: Date = new Date(), coach: CoachMode = coachMode()): Promise<FactSheet> {
  const [checkins, contexts, brief, ev, aims, skills, marks, records, intentions, wins, outside, items, settings, log, feedback, brainBriefs] = await Promise.all([
    allCheckIns(),
    db.days.toArray(),
    briefData(day),
    evidence(day),
    activeAims(),
    liveSkills(),
    rungMarks(),
    aimRecords(),
    allIntentions(),
    allWins(),
    db.outside.toArray(),
    privateItems(),
    getSettings(),
    db.briefLog.toArray(),
    db.briefFeedback.toArray(),
    db.brainBriefs.toArray(),
  ])
  // Parts 40 and 41: the reviews waiting for an answer, read only while their gate is open; closed, the sheet is as it was.
  const [offers, outcomes, pathMarks, useRows, coachPicks, allAims, asks] = await Promise.all([db.offers.toArray(), db.outcomes.toArray(), db.pathMarks.toArray(), db.useLog.toArray(), db.coachPicks.toArray(), db.aims.toArray(), skillCoachOpen(coach) ? db.coachAsks.toArray() : Promise.resolve([])])
  const reviews = new Map<number, { days: number; reason: 'ordinary' | 'struggle' }>()
  for (const a of asks) {
    const aim = aims.find((x) => x.id === a.aimId)
    if (a.kind === 'review' && !a.decision && aim && a.skillId === aim.currentSkillId) reviews.set(a.aimId, { days: a.days ?? 0, reason: a.reason ?? 'ordinary' })
  }
  const usual = Object.fromEntries(await Promise.all(BLOCKS.map(async (b) => [b, await usualFor(day, b)]))) as Record<Block, { point: number; lo: number; hi: number } | null>
  const tomorrow = addDays(day, 1)
  const tomorrowShape = contexts.find((c) => c.day === tomorrow) ?? contextFromWeek(tomorrow, settings)
  const sheet = buildFactSheet({ day, now, checkins, contexts, brief, evidence: ev, aims, skills, marks, offers, outcomes, nights: records.nights, intentions, wins, outside, items, direction: settings.direction, usual, log, feedback, brainBriefs, depth: settings.depth, lowDemand: settings.lowDemand, tomorrow: tomorrowShape, showPrivate: settings.showPrivate, pathMarks, use: { rows: useRows, coachPicks, allAims }, ...(reviews.size ? { reviews } : {}) })
  // The engine's own ranking rides the sheet (Part 28), so a writer reads what is true today, best first, before the pile.
  const said = log.filter((l) => l.situationId !== null).map((l) => ({ day: l.day, situationId: l.situationId }))
  sheet.shortlist = rankLines(sheet, said, receivedBefore(feedback, brainBriefs))
    .slice(0, SHORTLIST)
    .map((c) => ({ situationId: c.situationId, mode: c.mode, text: c.text, factIds: c.factIds, cardIds: c.cardIds, score: Math.round(c.score * 100) / 100 }))
  return sheet
}

/**
 * How each line was received, for the phone's ranking: a tap on the brain's own line carries the
 * facts that line cited, so it counts toward the phone's lines about the same thing (Part 33).
 */
export function receivedBefore(feedback: readonly BriefFeedback[], briefs: readonly Pick<BrainBrief, 'id' | 'factIds'>[]): FeedbackBefore[] {
  const cited = new Map(briefs.map((b) => [`worker:${b.id}`, b.factIds]))
  return feedback.map((f) => ({ situationId: f.situationId, answer: f.answer, ...(f.situationId === null ? { factIds: cited.get(f.briefKey) ?? [] } : {}) }))
}

/** How many of the engine's true situations the sheet carries, best first. */
const SHORTLIST = 5

/**
 * The paths' coach block for this block (Parts 24 and 32): the same computation their rows show,
 * by allowlist, for the coach briefing alone. Null while no path is on.
 */
export async function coachFor(day: string, now: Date = new Date()): Promise<CoachBlock | null> {
  const record = await pathRecord(day)
  const views = pathViews(record, day, now)
  const { block } = blockAt(now)
  return coachBlock(views, record.ctx, day, block, views.some((v) => v.dateDay), coachRow(views, record.offers.filter(isOpenAimOffer), day, block))
}

/** What the paths are computed from. */
interface PathRecord {
  aims: Aim[]
  offers: Offer[]
  outcomes: Outcome[]
  ctx: DayContext | null
  marks: PathMark[]
  online: boolean
  /** The faith family is hidden: a path's faith talk is neither offered nor listed (Rule 10). */
  faithHidden: boolean
  checkins: CheckIn[]
}

/**
 * Every read the paths need, in one go and straight from the tables: a live query follows native
 * awaits only so far, so what it shows must be read before anything is computed.
 */
async function pathRecord(day: string): Promise<PathRecord> {
  const [aims, offers, outcomes, ctx, marks, settings, checkins] = await Promise.all([
    db.aims.filter((a) => a.archivedAt === null).toArray(),
    db.offers.toArray(),
    db.outcomes.toArray(),
    db.days.get(day),
    db.pathMarks.toArray(),
    db.settings.get(1),
    db.checkins.where('day').equals(day).toArray(),
  ])
  const s = withDefaults(settings)
  return { aims, offers, outcomes, ctx: ctx ?? null, marks, online: s.partnerOnline, faithHidden: s.hideFaith, checkins }
}

/** The paths on in this block, computed the one way their rows are: with their declarations, the online switch, and whether today reads hard. */
function pathViews(r: PathRecord, day: string, now: Date): PathToday[] {
  const { block } = blockAt(now)
  const lightOnly = lightOnlyDay(r.checkins, day)
  return r.aims.filter(pathOn).map((aim) => pathToday({ aim, offers: r.offers, outcomes: r.outcomes, ctx: r.ctx, day, block, marks: r.marks, online: r.online, lightOnly, faithHidden: r.faithHidden }))
}

/**
 * The facts no line may cite today (Part 27). With two paths on, the People row is one path's by
 * the slot rule, and a line naming the other path's step or planning it would compete with the
 * row. The sheet never changes for it, so the free models learn nothing of the Partner path: the
 * phone's own engine chooses no such line, and a Worker line citing one is not shown that day.
 */
export async function offTheRow(day: string, now: Date = new Date()): Promise<Set<string>> {
  return offOf(await pathRecord(day), day, now)
}

function offOf(r: PathRecord, day: string, now: Date): Set<string> {
  const views = pathViews(r, day, now)
  const off = new Set<string>()
  if (views.length < 2) return off
  const row = peopleRowOf(views, r.offers.filter(isOpenAimOffer), day, blockAt(now).block)
  for (const v of views) if (row && v.aim.id !== row.view.aim.id) for (const kind of ['aim', 'path']) off.add(`${kind}.${v.aim.id}`)
  return off
}

/** Whether a line may be shown today: it cites nothing off the People row. */
function onTheRow(line: { factIds: readonly string[] }, off: ReadonlySet<string>): boolean {
  return !line.factIds.some((f) => off.has(f))
}

/** The day's sheet as a record of its own, for the Worker to read, with the coach block beside it; written only when either changed. */
export async function writeFactsRow(day: string, now: Date = new Date()): Promise<boolean> {
  await ensureDayContext(day, await getSettings())
  const sheet = await factSheet(day, now)
  const coach = await coachFor(day, now)
  const existing = await db.facts.get(day)
  const same = (k: 'facts' | 'said' | 'shortlist' | 'checkedIn') => JSON.stringify(existing?.sheet[k] ?? null) === JSON.stringify(sheet[k] ?? null)
  const sameCoach = JSON.stringify(existing?.coach ?? null) === JSON.stringify(coach)
  if (existing && same('facts') && same('said') && same('shortlist') && same('checkedIn') && existing.sheet.showPrivate === sheet.showPrivate && sameCoach) return false
  await db.facts.put({ day, builtAt: sheet.builtAt, updatedAt: now.toISOString(), sheet, ...(coach ? { coach } : {}) })
  return true
}

export interface BriefLine {
  /** What the tap is filed under: the Worker's row, or the phone's log entry. */
  key: string
  source: 'phone' | 'worker'
  text: string
  mode: string
  situationId: string | null
  model: string | null
  factIds: string[]
  cardIds: string[]
  /** The one tap the line offers, when it offers one. */
  action: LineAction | null
  /** The day whose facts the line was written from: today for the phone, usually yesterday for the Worker. */
  factsDay: string
  /** Who wrote a Worker's line (Part 30): Claude, with the model asked for; or the free chain, and why it stood in. */
  writer?: 'claude' | 'free'
  askedModel?: string
  fallback?: string
  /** When the line was written: the Worker's row, or the phone's choice. A clock time its words name counts as a moment it points to only if still ahead then. */
  at?: string
}

/** Who wrote a line or a review, in the words its screen uses (Part 30): Claude with the model asked for and the one that wrote, the free chain and why it stood in for Claude, or the phone. */
export function writtenBy(w: { source: 'phone' | 'worker'; model: string | null; writer?: 'claude' | 'free'; askedModel?: string; fallback?: string }, words: { fromPhone: string; fromWorker: string; fromClaude: string; fromFallback: string }): string {
  if (w.source !== 'worker') return words.fromPhone
  if (w.writer === 'claude') return fill(words.fromClaude, { asked: copy.brainScreen.models[w.askedModel as WriterModel] ?? w.askedModel ?? '', model: w.model ?? '' })
  if (w.fallback) return fill(words.fromFallback, { model: w.model ?? '', why: w.fallback })
  return fill(words.fromWorker, { model: w.model ?? '' })
}

/**
 * Today's line: the Worker's when it wrote one, else the phone's own; null when neither has anything
 * to say. A line that would compete with the People row is not shown (Part 27), nor one whose moment
 * is gone: pinned to pickup at 17:30, it is not the day's line at 22:33 (truth audit, 2026-09-24).
 * Nothing is written in its place: the phone's own line stands only if it is itself still live.
 */
export async function todaysLine(day: string, now: Date = new Date()): Promise<BriefLine | null> {
  // Every read first, in one go, so the live query that shows the line tracks each table it reads.
  const [briefs, log, record, ctx, intentions] = await Promise.all([db.brainBriefs.where('day').equals(day).toArray(), db.briefLog.where('day').equals(day).toArray(), pathRecord(day), getDayContext(day), db.intentions.where('day').equals(day).toArray()])
  const off = offOf(record, day, now)
  const live = (l: { text: string; action?: LineAction | null; at?: string }) => !momentGone(lineMoment({ text: l.text, action: l.action ?? null, at: l.at }, day, ctx, planOf(intentions, l.action ?? null, day)), day, now)
  const worker = briefs.filter((b) => b.kind === 'brief' && onTheRow(b, off) && live(b)).sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  if (worker) return { key: `worker:${worker.id}`, source: 'worker', text: worker.text, mode: worker.mode, situationId: null, model: worker.model, factIds: worker.factIds, cardIds: worker.cardIds, action: worker.action ?? null, factsDay: worker.factsDay ?? addDays(day, -1), at: worker.at, ...(worker.writer ? { writer: worker.writer } : {}), ...(worker.askedModel ? { askedModel: worker.askedModel } : {}), ...(worker.fallback ? { fallback: worker.fallback } : {}) }
  const own = log.filter((l) => l.situationId !== null && !l.withdrawnAt && onTheRow(l, off) && live(l)).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]
  if (!own) return null
  return { key: `phone:${day}:${own.id}`, source: 'phone', text: own.text, mode: own.mode, situationId: own.situationId, model: null, factIds: own.factIds, cardIds: own.cardIds, action: own.action ?? null, factsDay: day, at: own.at }
}

/** Today's plan for the commitment a line's action names, if it names one and a plan was made. */
function planOf(intentions: readonly Intention[], action: LineAction | null, day: string): Intention | null {
  return action?.kind === 'plan' ? planFor(intentions, action.aimId, day) : null
}

/**
 * Chooses the phone's own line for the day and logs it. A line is kept while its situation is
 * still true, so it does not flicker as the day is logged, and kept for the day once its one tap
 * was taken, with what was done under it. Once its facts no longer hold it is withdrawn, not
 * deleted: it was said, so it rests its situation and the next day's follow-up can find it; the
 * next true situation takes its place. A day with nothing to say is logged as such and looked at
 * again when the record changes. A line about a path whose step is not the People row's today is
 * never chosen, and one already said is withdrawn (Part 27). A line whose moment is gone is withdrawn
 * too, and none is chosen whose moment is already gone (truth audit, 2026-09-24).
 */
export async function chooseAndLog(day: string, now: Date = new Date()): Promise<void> {
  const existing = await db.briefLog.where('day').equals(day).toArray()
  await ensureDayContext(day, await getSettings())
  const [sheet, off, ctx, intentions] = await Promise.all([factSheet(day, now), offTheRow(day, now), getDayContext(day), allIntentions()])
  const live = (l: { text: string; action?: LineAction | null; at?: string }) => !momentGone(lineMoment({ text: l.text, action: l.action ?? null, at: l.at }, day, ctx, planOf(intentions, l.action ?? null, day)), day, now)
  const current = existing.find((e) => e.situationId !== null && !e.withdrawnAt)
  if (current && live(current)) {
    const match = lineFor(sheet, current.situationId as string)
    // Kept while its situation holds and it does not compete with the People row (Part 27).
    if (match && onTheRow(match, off)) {
      // Kept while its situation holds, and said as the record now stands: the same row, so a tap stays filed under it.
      // A line already answered, by a tap on it or its one action taken, keeps the words it was answered in.
      const answered = (await feedbackFor(`phone:${day}:${current.id}`)) !== null || (current.action ? (await lineActionState(day, current.action, now))?.state === 'done' : false)
      if (!answered && !sameLine(current, match)) await db.briefLog.update(current.id as number, { text: match.text, factIds: match.factIds, cardIds: match.cardIds, action: match.action ?? undefined })
      return
    }
    if (current.action && onTheRow(current, off) && (await lineActionState(day, current.action, now))?.state === 'done') return
  }
  const said = (await db.briefLog.toArray()).filter((l) => l.situationId !== null).map((l) => ({ day: l.day, situationId: l.situationId }))
  const feedback = receivedBefore(await db.briefFeedback.toArray(), await db.brainBriefs.toArray())
  const choice = rankLines(sheet, said, feedback).find((c) => onTheRow(c, off) && live({ text: c.text, action: c.action ?? null, at: now.toISOString() })) ?? null
  const empty = existing.filter((e) => e.situationId === null)
  if (!choice && !current && empty.length) return
  await db.transaction('rw', db.briefLog, async () => {
    if (current) await db.briefLog.update(current.id as number, { withdrawnAt: now.toISOString() })
    if (choice) {
      for (const e of empty) await db.briefLog.delete(e.id as number)
      await db.briefLog.add({ day, situationId: choice.situationId, mode: choice.mode, text: choice.text, factIds: choice.factIds, cardIds: choice.cardIds, ...(choice.action ? { action: choice.action } : {}), at: now.toISOString() })
    } else if (!empty.length) {
      await db.briefLog.add({ day, situationId: null, mode: 'observation', text: '', factIds: [], cardIds: [], at: now.toISOString() })
    }
  })
}

function sameLine(a: Pick<BriefLog, 'text' | 'factIds' | 'cardIds' | 'action'>, b: { text: string; factIds: string[]; cardIds: string[]; action: LineAction | null }): boolean {
  return a.text === b.text && a.factIds.join('|') === b.factIds.join('|') && a.cardIds.join('|') === b.cardIds.join('|') && JSON.stringify(a.action ?? null) === JSON.stringify(b.action ?? null)
}

export async function feedbackFor(key: string | null): Promise<BriefFeedback | null> {
  if (!key) return null
  return (await db.briefFeedback.where('briefKey').equals(key).first()) ?? null
}

/** One tap under the line: useful, knew it, or not. Recorded once per line; it shapes what is said next. */
/** Marks the phone's own line as on screen, once: only a line that was shown counts as said (Part 33). */
export async function markShown(line: Pick<BriefLine, 'key' | 'source'>, now: Date = new Date()): Promise<void> {
  if (line.source !== 'phone') return
  const id = Number(line.key.split(':')[2])
  if (!Number.isInteger(id)) return
  await db.transaction('rw', db.briefLog, async () => {
    const row = await db.briefLog.get(id)
    if (row && !row.shownAt) await db.briefLog.update(id, { shownAt: now.toISOString() })
  })
}

export async function recordFeedback(day: string, line: BriefLine, answer: 'useful' | 'knew' | 'not', now: Date = new Date()): Promise<void> {
  if (await db.briefFeedback.where('briefKey').equals(line.key).first()) return
  await db.briefFeedback.add({ day, briefKey: line.key, situationId: line.situationId, answer, at: now.toISOString() })
}

/** The test a move would get: itself against nothing extra, on the first reading out of 100 it moves, in the first block it fits. */
export function hypothesisFor(moveId: string): Hypothesis | null {
  if (!hasMove(moveId)) return null
  const move = moveById(moveId)
  const target = move.targets.find((t) => INGREDIENTS[t.reading])?.reading
  const context = move.when[0]
  return target && context ? { move: moveId, alternative: 'nothing', target, context } : null
}

export interface ActionState {
  /** Open: the tap is there. Done: it was taken, or the record already shows what it would do. Gone: no longer possible today. */
  state: 'open' | 'done' | 'gone'
  cue?: LineCue
  /** The clock time a plan names today: its cue's while open, the plan's once made. */
  time?: string
}

/** Whether the line's one tap is still there to take, looked at again at the moment the screen draws. */
export async function lineActionState(day: string, action: LineAction | null, now: Date = new Date()): Promise<ActionState | null> {
  if (!action) return null
  if (action.kind === 'plan') {
    const aim = (await activeAims()).find((a) => a.id === action.aimId)
    if (!aim) return { state: 'gone' }
    const plan = planFor(await allIntentions(), action.aimId, day)
    if (plan) return { state: 'done', time: plan.time }
    // A session started or done today needs no plan: the tap is no longer there (Workstream 6).
    const aims = await activeAims()
    const studyAims = aims.filter((a) => a.kind === 'certification')
    const records = await aimRecords()
    const keys = keysOf(aim, studyAims)
    if (records.offers.some((o) => isOpenAimOffer(o) && keys.includes(o.situationKey)) || sessionsToday(aim, records.offers, records.outcomes, day, await liveSkills(), studyAims).done) return { state: 'gone' }
    const cue = cuesFor(await getDayContext(day), now).find((c) => c.cue === action.cue)
    return cue ? { state: 'open', cue: cue.cue, time: cue.time } : { state: 'gone' }
  }
  if (action.kind === 'depth') {
    const s = await getSettings()
    return s.depth === 'short' ? { state: 'done' } : s.lowDemand ? { state: 'gone' } : { state: 'open' }
  }
  if (!hypothesisFor(action.moveId)) return { state: 'gone' }
  return (await db.cards.filter((c) => c.moveId === action.moveId).count()) > 0 ? { state: 'done' } : { state: 'open' }
}

/** The one tap that does what the line says: a plan for today, a lighter check-in, or a test set. True when something was done. */
export async function applyLineAction(day: string, action: LineAction, now: Date = new Date()): Promise<boolean> {
  const state = await lineActionState(day, action, now)
  if (state?.state !== 'open') return false
  if (action.kind === 'plan') {
    const aims = await activeAims()
    const aim = aims.find((a) => a.id === action.aimId)
    if (!aim || !state.cue || !state.time) return false
    const step = stepFor(aim, await liveSkills(), await rungMarks(), aims.filter((a) => a.kind === 'certification'))
    await planAim(aim, state.cue, state.time, now, step.name)
    return true
  }
  if (action.kind === 'depth') {
    await updateSettings((s) => ({ ...s, depth: 'short' }))
    return true
  }
  const h = hypothesisFor(action.moveId)
  if (!h) return false
  await db.cards.add(cardFromHypothesis(h, now.toISOString()))
  return true
}

/** When a line is meant to be acted on (owner, 2026-09-23). */
export type LineTiming = 'now' | 'laterToday' | 'forToday'

/**
 * When the line is meant to be acted on, as its action establishes it and nothing else; its words
 * are never read for a time. Now: a tap that does what it says on the spot, while it is open. Later
 * today: a step pinned to a cue whose time is still ahead today, before the plan is made and after.
 * For today: a line with no action, and any action taken, gone or past its time.
 */
export function lineTiming(action: LineAction | null, state: ActionState | null | undefined, now: Date = new Date()): LineTiming {
  if (!action || !state) return 'forToday'
  if (action.kind === 'plan') return state.state !== 'gone' && aheadToday(state.time, now) ? 'laterToday' : 'forToday'
  return state.state === 'open' ? 'now' : 'forToday'
}

/**
 * How long the moment a line is pinned to stays live. A step pinned to pickup or her bedtime may take
 * a while to begin; two hours is well past the cue's own reminder and its follow-up forty-five
 * minutes on (truth audit, 2026-09-24).
 */
export const MOMENT_LIVE_MINUTES = 120

/** Minutes from a day's midnight to a moment: past 1,440 in the small hours that still belong to it. */
function minutesInto(day: string, at: Date): number {
  return daysBetween(day, dayKey(at)) * 1440 + at.getHours() * 60 + at.getMinutes()
}

/**
 * The moment of the day a line is pinned to, in minutes after the day's midnight, or null when it
 * names none: the time of its plan once made, else the time its cue names today; and any clock time
 * its words name that was still ahead when it was written. A time already past then was something
 * it saw, not a moment it pointed to. The latest of them.
 */
export function lineMoment(line: { text: string; action: LineAction | null; at?: string }, day: string, ctx: Pick<DayContext, 'withHer' | 'pickupTime' | 'soloUntil'> | null | undefined, plan: { time: string } | null): number | null {
  const moments: number[] = []
  if (line.at) {
    const written = minutesInto(day, new Date(line.at))
    for (const t of clockTimesIn(line.text)) if (t > written) moments.push(t)
  }
  if (line.action?.kind === 'plan') {
    // The next check-in can name no later moment than the evening's.
    const cue = line.action.cue === 'afterPickup' ? heldPickup(ctx) : line.action.cue === 'afterBedtime' ? heldBedtime(ctx) : blockStart.evening
    const t = plan?.time ?? cue
    if (t) moments.push(minutesOf(t))
  }
  return moments.length ? Math.max(...moments) : null
}

/** Whether a line's moment is gone: two hours past it. A line pinned to no moment never is. */
export function momentGone(moment: number | null, day: string, now: Date): boolean {
  return moment !== null && minutesInto(day, now) > moment + MOMENT_LIVE_MINUTES
}

export interface Why {
  facts: { id: string; text: string }[]
  cards: ClaimCard[]
}

/** Why it said this: the facts it cited, as the sheet worded them, and the library's cards with their grades and sources. */
export async function whyFor(line: BriefLine, day: string, now: Date = new Date()): Promise<Why> {
  const rows = await Promise.all([line.factsDay, day, addDays(day, -1)].map((d) => db.facts.get(d)))
  const sheets = rows.map((r) => r?.sheet)
  const facts: { id: string; text: string }[] = []
  let live: FactSheet | null = null
  for (const id of line.factIds) {
    let found = sheets.map((s) => s?.facts.find((f) => f.id === id)).find(Boolean)
    // The phone's own line may be asked about before the day's sheet was written as a row: read the record as it stands.
    if (!found && line.source === 'phone') {
      live ??= await factSheet(day, now)
      found = live.facts.find((f) => f.id === id)
    }
    if (found) facts.push({ id, text: found.text })
  }
  return { facts, cards: line.cardIds.map((id) => cardById(id)).filter((c): c is ClaimCard => c !== undefined) }
}

export interface WeekReview extends ReviewParts {
  source: 'phone' | 'worker'
  model: string | null
  day: string
  writer?: 'claude' | 'free'
  askedModel?: string
  fallback?: string
}

/** The week reviewed: the Worker's three parts when it wrote them in the last week, else the record's own. */
export async function weekReview(day: string, now: Date = new Date()): Promise<WeekReview> {
  const since = addDays(day, -6)
  const worker = (await db.brainBriefs.toArray()).filter((b) => b.kind === 'review' && b.parts && b.day >= since && b.day <= day).sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  if (worker?.parts) return { source: 'worker', model: worker.model, day: worker.day, ...worker.parts, ...(worker.writer ? { writer: worker.writer } : {}), ...(worker.askedModel ? { askedModel: worker.askedModel } : {}), ...(worker.fallback ? { fallback: worker.fallback } : {}) }
  const feedback = receivedBefore(await db.briefFeedback.toArray(), await db.brainBriefs.toArray())
  return { source: 'phone', model: null, day, ...phoneReview(await factSheet(day, now), feedback) }
}

/** What the brain last wrote, for the Cloud screen. */
export async function brainStatus(): Promise<{ day: string; model: string; at: string } | null> {
  const rows = await db.brainBriefs.toArray()
  const latest = rows.sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  return latest ? { day: latest.day, model: latest.model, at: latest.at } : null
}
