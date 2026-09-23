import { activeAims, aimRecords, allIntentions, isOpenAimOffer, liveSkills, planAim, rungMarks } from './aimFlow'
import { cuesFor, planFor, stepFor } from './aims'
import { addDays, blockAt, BLOCKS, type Block } from './blocks'
import type { CoachBlock } from './factTypes'
import { pathOn, peopleRowOf } from './pathFlow'
import { coachBlock, lightOnlyDay, pathToday, type PathToday } from './pathStage'
import type { LineAction, LineCue } from './brainShared'
import { hasMove, moveById } from './catalogue'
import { allCheckIns, allWins, contextFromWeek, db, ensureDayContext, getDayContext, getSettings, privateItems, updateSettings, type Aim, type BriefFeedback, type BriefLog, type CheckIn, type DayContext, type Offer, type Outcome, type PathMark } from './db'
import { buildFactSheet, type FactSheet } from './facts'
import { briefData, usualFor } from './forecastFlow'
import { cardFromHypothesis, type Hypothesis } from './hypothesis'
import { evidence } from './learningFlow'
import { cardById, type ClaimCard } from './library'
import { INGREDIENTS } from './score'
import { withDefaults } from './settings'
import { lineFor, phoneReview, rankLines, type ReviewParts } from './situations'

// The brain on the phone: the fact sheet built from the record, written as a row the Worker
// reads; the phone's own line for the day, chosen once and logged; the tap that says how it
// landed; the one tap that does what the line says; why it said it; and the week reviewed. The
// Worker's line, when there is one, is read from the rows it wrote.

export async function factSheet(day: string, now: Date = new Date()): Promise<FactSheet> {
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
  const [offers, outcomes, pathMarks] = await Promise.all([db.offers.toArray(), db.outcomes.toArray(), db.pathMarks.toArray()])
  const usual = Object.fromEntries(await Promise.all(BLOCKS.map(async (b) => [b, await usualFor(day, b)]))) as Record<Block, { point: number; lo: number; hi: number } | null>
  const tomorrow = addDays(day, 1)
  const tomorrowShape = contexts.find((c) => c.day === tomorrow) ?? contextFromWeek(tomorrow, settings)
  const sheet = buildFactSheet({ day, now, checkins, contexts, brief, evidence: ev, aims, skills, marks, offers, outcomes, nights: records.nights, intentions, wins, outside, items, direction: settings.direction, usual, log, feedback, brainBriefs, depth: settings.depth, lowDemand: settings.lowDemand, tomorrow: tomorrowShape, showPrivate: settings.showPrivate, pathMarks })
  // The engine's own ranking rides the sheet (Part 28), so a writer reads what is true today, best first, before the pile.
  const said = log.filter((l) => l.situationId !== null).map((l) => ({ day: l.day, situationId: l.situationId }))
  const answers = feedback.map((f) => ({ situationId: f.situationId, answer: f.answer }))
  sheet.shortlist = rankLines(sheet, said, answers)
    .slice(0, SHORTLIST)
    .map((c) => ({ situationId: c.situationId, mode: c.mode, text: c.text, factIds: c.factIds, cardIds: c.cardIds, score: Math.round(c.score * 100) / 100 }))
  return sheet
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
  return coachBlock(views, record.ctx, day, blockAt(now).block, views.some((v) => v.dateDay))
}

/** What the paths are computed from. */
interface PathRecord {
  aims: Aim[]
  offers: Offer[]
  outcomes: Outcome[]
  ctx: DayContext | null
  marks: PathMark[]
  online: boolean
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
  return { aims, offers, outcomes, ctx: ctx ?? null, marks, online: withDefaults(settings).partnerOnline, checkins }
}

/** The paths on in this block, computed the one way their rows are: with their declarations, the online switch, and whether today reads hard. */
function pathViews(r: PathRecord, day: string, now: Date): PathToday[] {
  const { block } = blockAt(now)
  const lightOnly = lightOnlyDay(r.checkins, day)
  return r.aims.filter(pathOn).map((aim) => pathToday({ aim, offers: r.offers, outcomes: r.outcomes, ctx: r.ctx, day, block, marks: r.marks, online: r.online, lightOnly }))
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
}

/**
 * Today's line: the Worker's when it wrote one, else the phone's own; null when neither has anything
 * to say. A line that would compete with the People row is not shown (Part 27).
 */
export async function todaysLine(day: string, now: Date = new Date()): Promise<BriefLine | null> {
  // Every read first, in one go, so the live query that shows the line tracks each table it reads.
  const [briefs, log, record] = await Promise.all([db.brainBriefs.where('day').equals(day).toArray(), db.briefLog.where('day').equals(day).toArray(), pathRecord(day)])
  const off = offOf(record, day, now)
  const worker = briefs.filter((b) => b.kind === 'brief' && onTheRow(b, off)).sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  if (worker) return { key: `worker:${worker.id}`, source: 'worker', text: worker.text, mode: worker.mode, situationId: null, model: worker.model, factIds: worker.factIds, cardIds: worker.cardIds, action: worker.action ?? null, factsDay: worker.factsDay ?? addDays(day, -1) }
  const own = log.filter((l) => l.situationId !== null && !l.withdrawnAt && onTheRow(l, off)).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]
  if (!own) return null
  return { key: `phone:${day}:${own.id}`, source: 'phone', text: own.text, mode: own.mode, situationId: own.situationId, model: null, factIds: own.factIds, cardIds: own.cardIds, action: own.action ?? null, factsDay: day }
}

/**
 * Chooses the phone's own line for the day and logs it. A line is kept while its situation is
 * still true, so it does not flicker as the day is logged, and kept for the day once its one tap
 * was taken, with what was done under it. Once its facts no longer hold it is withdrawn, not
 * deleted: it was said, so it rests its situation and the next day's follow-up can find it; the
 * next true situation takes its place. A day with nothing to say is logged as such and looked at
 * again when the record changes. A line about a path whose step is not the People row's today is
 * never chosen, and one already said is withdrawn (Part 27).
 */
export async function chooseAndLog(day: string, now: Date = new Date()): Promise<void> {
  const existing = await db.briefLog.where('day').equals(day).toArray()
  await ensureDayContext(day, await getSettings())
  const sheet = await factSheet(day, now)
  const off = await offTheRow(day, now)
  const current = existing.find((e) => e.situationId !== null && !e.withdrawnAt)
  if (current) {
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
  const feedback = (await db.briefFeedback.toArray()).map((f) => ({ situationId: f.situationId, answer: f.answer }))
  const choice = rankLines(sheet, said, feedback).find((c) => onTheRow(c, off)) ?? null
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
  time?: string
}

/** Whether the line's one tap is still there to take, looked at again at the moment the screen draws. */
export async function lineActionState(day: string, action: LineAction | null, now: Date = new Date()): Promise<ActionState | null> {
  if (!action) return null
  if (action.kind === 'plan') {
    const aim = (await activeAims()).find((a) => a.id === action.aimId)
    if (!aim) return { state: 'gone' }
    if (planFor(await allIntentions(), action.aimId, day)) return { state: 'done' }
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
}

/** The week reviewed: the Worker's three parts when it wrote them in the last week, else the record's own. */
export async function weekReview(day: string, now: Date = new Date()): Promise<WeekReview> {
  const since = addDays(day, -6)
  const worker = (await db.brainBriefs.toArray()).filter((b) => b.kind === 'review' && b.parts && b.day >= since && b.day <= day).sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  if (worker?.parts) return { source: 'worker', model: worker.model, day: worker.day, ...worker.parts }
  const feedback = (await db.briefFeedback.toArray()).map((f) => ({ situationId: f.situationId, answer: f.answer }))
  return { source: 'phone', model: null, day, ...phoneReview(await factSheet(day, now), feedback) }
}

/** What the brain last wrote, for the Cloud screen. */
export async function brainStatus(): Promise<{ day: string; model: string; at: string } | null> {
  const rows = await db.brainBriefs.toArray()
  const latest = rows.sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  return latest ? { day: latest.day, model: latest.model, at: latest.at } : null
}
