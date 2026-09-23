import { addDays, blockIndex, dayKey, daysBetween, type Block } from './blocks'
import { hasMove, isParked, isProposed, moveById, OBSERVED_ONLY, PASSIVE, pathReps, paths, type Effort, type Move, type Path, type PathId, type PathPlace, type SettingKind } from './catalogue'
import { copy } from './copy'
import type { CoachBlock } from './factTypes'
import type { Aim, CheckIn, DayContext, Offer, Outcome, PathMark } from './db'
import { fill } from './format'
import { inPerson, peopleAround } from './people'

// The path commitment (Part 24), the pure part: the stage a path stands on, derived from the
// record and never stored; the reps that fit this block by Part 20's tier 1 alone; the app's pick
// among them and where it is meant to happen; the counts a card shows; and the coach block. A rep
// is done when he did his part: no answer anyone else gives is read, counted or kept here.

/** The key a path's step offers carry. */
export function pathKey(path: PathId): string {
  return `aim:path:${path}`
}

/** The kinds of setting another adult is there in person for. */
export const IN_PERSON_KINDS: readonly SettingKind[] = ['recurring', 'errand', 'group', 'oneToOne']

/**
 * Which rule chose a rep: the smallest after refusals, the one rep that fits, a draw among two or
 * more with each chance kept, or you through Change. 'rotate' (the least recently done) is kept
 * only for steps offered before Part 25 made the pick a draw.
 */
export type PickRule = 'smaller' | 'only' | 'draw' | 'you' | 'rotate'
export type RepAnswer = 'done' | 'partly' | 'no'

/** One rep in a path's record: offered through the path, with what he answered. */
export interface PathEntry {
  offerId: number
  moveId: string
  day: string
  at: string
  setting: SettingKind
  chosenBy: 'app' | 'you'
  rule: PickRule | null
  outcome: RepAnswer | null
  /** The stage the step was offered at, when the offer says. */
  stage: number | null
  /** The block it was offered in. */
  block: Block
  /** Every candidate's chance in its draw, when it was drawn; null for a rule's pick or yours. */
  chances: Record<string, number> | null
}

export function pathById(id: PathId): Path {
  const p = paths.find((x) => x.id === id)
  if (!p) throw new Error(`unknown path: ${id}`)
  return p
}

/** Where a rep sits on a path, or undefined when it is not one of the path's reps. */
export function placeOn(path: PathId, moveId: string): PathPlace | undefined {
  return hasMove(moveId) ? moveById(moveId).path?.[path] : undefined
}

/** Where a rep is meant to happen when its offer did not say: its first kind of setting. */
export function defaultSetting(m: Move): SettingKind {
  return m.settings?.[0] ?? (inPerson(m) ? 'recurring' : 'solo')
}

/**
 * A path's record: every step offered through it, oldest first, with his answer. A rep both paths
 * hold counts once for each. A Social path converted from A person keeps that commitment's steps.
 */
export function pathEntries(path: PathId, offers: readonly Offer[], outcomes: readonly Outcome[], convertedFromPerson = false): PathEntry[] {
  const answer = new Map(outcomes.map((x) => [x.offerId, x.outcome]))
  const out: PathEntry[] = []
  for (const o of offers) {
    if (o.kind !== 'step' || o.skippedAt !== null || o.id === undefined || !hasMove(o.moveId)) continue
    const own = o.paths ? o.paths.includes(path) : convertedFromPerson && path === 'social' && o.situationKey === 'aim:person'
    if (!own) continue
    out.push({ offerId: o.id, moveId: o.moveId, day: o.day, at: o.at, setting: o.setting ?? defaultSetting(moveById(o.moveId)), chosenBy: o.chosenBy ?? 'you', rule: o.rule ?? null, outcome: answer.get(o.id) ?? null, stage: o.stage ?? null, block: o.block, chances: o.rule === 'draw' && o.propensities ? o.propensities : null })
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

export interface StageState {
  /** The stage the path stands on. */
  stage: number
  /** Each stage reached past the first: the day, and whether the rule or your word moved it. A quiet stretch never lowers one. */
  reached: readonly { stage: number; day: string; by: 'rule' | 'declared' }[]
  /** Quiet for the re-entry span: reps from one stage below come back while the stage stands. */
  reentry: boolean
  /** The last day a rep of this path was marked done, or null. */
  lastDone: string | null
}

/** Whether done reps meet the rule: enough of them, enough different ones, in enough kinds of setting. */
export function meetsRule(done: readonly Pick<PathEntry, 'moveId' | 'setting'>[], rule: Pick<Path['rule'], 'reps' | 'distinctReps' | 'settingKinds'>): boolean {
  return done.length >= rule.reps && new Set(done.map((d) => d.moveId)).size >= rule.distinctReps && new Set(done.map((d) => d.setting)).size >= rule.settingKinds
}

/**
 * The stage, from the record alone, so a deleted answer recomputes it (Rule 13). A stage the rule
 * moves is met the first time that, within the rule's weeks, enough of its own stage-moving reps
 * were marked done after it was reached, across enough different reps and kinds of setting. A
 * stage reached stands; a declaration (Part 27) moves the stages the rule does not.
 */
export function stageOf(path: Path, entries: readonly PathEntry[], today: string, declared: { stage: number; day: string } | null = null): StageState {
  const rule = path.rule
  const reached: { stage: number; day: string; by: 'rule' | 'declared' }[] = []
  let stage = 1
  let since: string | null = null
  for (;;) {
    const st = path.stages.find((s) => s.n === stage)
    if (!st || (st.advance ?? 'counts') === 'declared' || stage >= path.stages.length) break
    const done = entries.filter((e) => {
      const place = placeOn(path.id, e.moveId)
      return e.outcome === 'done' && place?.stage === stage && place.advances && e.day <= today && (since === null || e.day >= since)
    })
    let metOn: string | null = null
    for (const end of done) {
      const from = addDays(end.day, -(rule.withinWeeks * 7 - 1))
      if (meetsRule(done.filter((e) => e.day >= from && e.day <= end.day), rule)) {
        metOn = end.day
        break
      }
    }
    if (metOn === null) break
    stage += 1
    since = metOn
    reached.push({ stage, day: metOn, by: 'rule' })
  }
  if (declared && declared.stage > stage) {
    stage = declared.stage
    reached.push({ stage, day: declared.day, by: 'declared' })
  }
  const lastDone = entries.filter((e) => e.outcome === 'done' && e.day <= today).reduce<string | null>((d, e) => (d === null || e.day > d ? e.day : d), null)
  const reentry = stage > 1 && lastDone !== null && daysBetween(lastDone, today) >= rule.reentryAfterQuietWeeks * 7
  return { stage, reached, reentry, lastDone }
}

/** A rep a path can offer: wired, not parked, not a passive or observed item. */
export function offerable(m: Move): boolean {
  return !isProposed(m) && !isParked(m) && !OBSERVED_ONLY.has(m.id) && !PASSIVE.has(m.id)
}

export interface EligibilityInput {
  path: Path
  state: StageState
  /** Part 20's tier 1: whether today's shape puts other adults around in this block. */
  around: boolean
  /** The path's rep yesterday, if any. */
  yesterday: string | null
  /** Reps done or partly done today, from any offer. */
  doneToday: ReadonlySet<string>
  /** Part 27: a declared date day, the Partner path's tier 1 for the reps about his own conduct on a date. */
  dateDay?: boolean
  /** Part 27: the optional online channel is on. */
  online?: boolean
  /** Part 27: the online channel's reps offered in the last seven days. */
  onlineThisWeek?: number
  /** Part 27: the record reads high stress or overwhelm today, so only light reps fit. */
  lightOnly?: boolean
  /** The path's reps you have done or partly done, ever: a rep that waits for others joins the app's picks once they are done. */
  doneEver?: ReadonlySet<string>
  /** The faith family is hidden: a faith talk is neither offered nor listed (Rule 10). */
  faithHidden?: boolean
}

/** Whether a rep that waits for others may join the app's picks: each of them done or partly done. */
export function opensNow(m: Pick<Move, 'path'>, path: PathId, doneEver: ReadonlySet<string> | undefined): boolean {
  const after = m.path?.[path]?.after
  return !after || after.every((id) => doneEver?.has(id) === true)
}

export interface Eligibility {
  /** The stage the reps come from: the path's own, or the one below while re-entering. */
  stage: number
  /** Every rep of that stage, which Change lists whatever the shape says. */
  stageReps: Move[]
  /** The reps that fit this block. */
  eligible: Move[]
  /** Tier 1 kept at least one in-person rep out of this block. */
  nobodyAround: boolean
}

/** The first stage a path moves by declaration alone: on the Partner path, Dating, whose reps are about his own conduct on a date. */
export function dateStageOf(path: Path): number | null {
  return path.stages.find((s) => s.advance === 'declared')?.n ?? null
}

/**
 * The reps that fit now: the stage's (or the re-entry set's), not yesterday's rep, not done today.
 * In person only when tier 1 says someone is around; a rep about your conduct on a date only on a
 * declared date day, which is the Partner path's tier 1; a rep with a partner in the declared
 * stages is not placed by who else is around (the day record does not place a partner). The
 * online channel's reps only while it is on and under its weekly bound; on a day the record reads
 * high stress or overwhelm, light reps alone (Part 27). A rep that waits for others joins the
 * app's picks once they are done, and a faith talk is hidden with the faith family (2026-09-23).
 */
export function eligibility(i: EligibilityInput): Eligibility {
  const stage = i.state.reentry ? i.state.stage - 1 : i.state.stage
  const channel = i.path.channels?.find((c) => c.id === 'online')
  const stageReps = pathReps(i.path.id, stage).filter((m) => offerable(m) && (m.channel !== 'online' || i.online === true) && !(i.faithHidden && m.hiddenWith === 'faith'))
  const declared = new Set(i.path.stages.filter((st) => st.advance === 'declared').map((st) => st.n))
  let nobodyAround = false
  const eligible = stageReps.filter((m) => {
    const place = m.path?.[i.path.id]
    if (place?.onDate) {
      if (!i.dateDay) return false
    } else if (!(place && declared.has(place.stage)) && inPerson(m) && !i.around) {
      nobodyAround = true
      return false
    }
    if (m.channel === 'online' && (i.onlineThisWeek ?? 0) >= (channel?.maxRepsPerWeek ?? 0)) return false
    if (i.lightOnly && m.effort !== 'low') return false
    if (!opensNow(m, i.path.id, i.doneEver)) return false
    return m.id !== i.yesterday && !i.doneToday.has(m.id)
  })
  return { stage, stageReps, eligible, nobodyAround }
}

/**
 * The stage declared on a path (Part 27): the highest stage you declared, and a date declared on
 * any day moves the Partner path to Dating at once. Only declarations made by today count; a
 * deleted one counts for nothing (Rule 13).
 */
export function declaredStage(path: Path, marks: readonly PathMark[], today: string): { stage: number; day: string } | null {
  const dating = dateStageOf(path)
  let best: { stage: number; day: string } | null = null
  for (const m of marks) {
    if (m.path !== path.id) continue
    const on = dayKey(new Date(m.at))
    if (on > today) continue
    const stage = m.kind === 'stage' ? (m.stage ?? 0) : m.kind === 'date' && dating !== null ? dating : 0
    if (stage > (best?.stage ?? 1)) best = { stage, day: on }
  }
  return best
}

/** Whether today is a declared date day on a path. */
export function isDateDay(path: Path, marks: readonly PathMark[], today: string): boolean {
  return marks.some((m) => m.path === path.id && m.kind === 'date' && m.day === today)
}

/** Whether the record reads high stress or overwhelm today: the day's latest answer to either at its two hardest phrases. */
export function lightOnlyDay(checkins: readonly Pick<CheckIn, 'day' | 'block' | 'answers'>[], today: string): boolean {
  const todays = checkins.filter((c) => c.day === today).sort((a, b) => blockIndex(b.block) - blockIndex(a.block))
  const latest = (id: 'stress' | 'overwhelm') => todays.find((c) => c.answers[id] !== undefined)?.answers[id]
  return (latest('stress') ?? 0) >= HARD_POSITION || (latest('overwhelm') ?? 0) >= HARD_POSITION
}

/** Stress and overwhelm at this position or above ("Wound tight", "Crowded") read as a hard day. */
export const HARD_POSITION = 4

/** Answers of No in a row, the latest first; a rep passed over without an answer neither counts nor breaks the run. */
export function refusalsInARow(entries: readonly PathEntry[]): number {
  let n = 0
  for (let k = entries.length - 1; k >= 0; k--) {
    const o = entries[k].outcome
    if (o === null) continue
    if (o !== 'no') break
    n++
  }
  return n
}

/** Where a rep is meant to happen: among its own kinds of setting that fit, the one the path's done reps used least within the rule's weeks. */
export function settingFor(m: Move, path: Path, entries: readonly PathEntry[], today: string): SettingKind {
  const own = m.settings?.length ? m.settings : [defaultSetting(m)]
  const fits = inPerson(m) ? own.filter((k) => IN_PERSON_KINDS.includes(k)) : own
  const kinds = fits.length ? fits : own
  const from = addDays(today, -(path.rule.withinWeeks * 7 - 1))
  const used = new Map<SettingKind, number>()
  for (const e of entries) if (e.outcome === 'done' && e.day >= from && e.day <= today) used.set(e.setting, (used.get(e.setting) ?? 0) + 1)
  return [...kinds].sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0]
}

export interface RepPick {
  moveId: string
  setting: SettingKind
  rule: PickRule
  chosenBy: 'app' | 'you'
  /** The reps it was picked among. */
  candidates: string[]
  /** Each rep's chance of being the pick, summing to one: a draw's chances, or one for the rep a rule or you chose. */
  propensities: Record<string, number>
  /** A draw that leaned toward the reps he completes, after enough draws in the stage. */
  leaning: boolean
  /** Part 27: which of the Partner path's reps the People row's slot rule drew among: its own, or those it shares with Social. */
  turn?: 'own' | 'shared'
}

const EFFORT_ORDER: Record<Effort, number> = { low: 0, medium: 1, high: 2 }

/** Draws in a stage before its chances may lean toward the reps he completes (Part 25). */
export const LEAN_AFTER_DRAWS = 10
/** No rep's chance in a leaning draw goes below or above these, so every rep keeps being drawn and none takes over. */
export const CHANCE_FLOOR = 0.1
export const CHANCE_CEILING = 0.8

/**
 * Chances from weights, summing to one, each within the bounds: every weight is scaled by one
 * factor and held to the floor and the ceiling, the factor found so the chances sum to one. The
 * chances inside the bounds keep the weights' proportions. Holding one side first and sharing the
 * rest can leave a sum the other side makes impossible (five reps, one heavy: 0.8 and four at
 * 0.1 is 1.2); one factor for all never can. The bounds give way only when the number of reps
 * makes them impossible.
 */
export function clipChances(weights: Readonly<Record<string, number>>, floor = CHANCE_FLOOR, ceiling = CHANCE_CEILING): Record<string, number> {
  const ids = Object.keys(weights)
  if (!ids.length) return {}
  const lo = Math.min(floor, 1 / ids.length)
  const hi = Math.max(ceiling, 1 / ids.length)
  const w = ids.map((id) => Math.max(1e-9, weights[id]))
  const held = (scale: number) => w.map((x) => Math.min(hi, Math.max(lo, scale * x)))
  const sum = (ps: readonly number[]) => ps.reduce((a, b) => a + b, 0)
  // The held sum only grows with the factor, from the floor's total (at most one) to the ceiling's (at least one).
  let under = 0
  let over = 1
  while (sum(held(over)) < 1) over *= 2
  for (let k = 0; k < 60; k++) {
    const mid = (under + over) / 2
    if (sum(held(mid)) < 1) under = mid
    else over = mid
  }
  const ps = held(over)
  const total = sum(ps)
  return Object.fromEntries(ids.map((id, k) => [id, ps[k] / total]))
}

/**
 * A draw's chances among the reps that fit (Part 25): equal until the stage has had enough draws,
 * then leaning toward the reps he completes, by each rep's done over its draws in the stage with
 * one of each added so a rep never drawn is not ruled out, and clipped.
 */
export function drawChances(eligible: readonly Move[], entries: readonly PathEntry[], stage: number): { chances: Record<string, number>; leaning: boolean } {
  const ids = eligible.map((m) => m.id)
  const draws = entries.filter((e) => e.rule === 'draw' && e.stage === stage)
  if (ids.length < 2 || draws.length < LEAN_AFTER_DRAWS) return { chances: Object.fromEntries(ids.map((id) => [id, 1 / ids.length])), leaning: false }
  const weights: Record<string, number> = {}
  for (const id of ids) {
    const mine = draws.filter((e) => e.moveId === id)
    weights[id] = (mine.filter((e) => e.outcome === 'done').length + 1) / (mine.length + 2)
  }
  return { chances: clipChances(weights), leaning: true }
}

/**
 * The app's pick (Parts 24 and 25). After the rule's refusals in a row, the smallest version of the
 * stage. One rep that fits is that rep. Two or more are drawn, each chance kept with the offer, so
 * the comparisons read only what chance decided. Then where it is meant to happen: the kind of
 * setting used least lately.
 */
export function pickRep(path: Path, eligible: readonly Move[], entries: readonly PathEntry[], today: string, draw: number, stage = 1): RepPick | null {
  if (!eligible.length) return null
  const candidates = eligible.map((m) => m.id)
  const one = (m: Move, rule: PickRule): RepPick => ({ moveId: m.id, setting: settingFor(m, path, entries, today), rule, chosenBy: 'app', candidates, propensities: { [m.id]: 1 }, leaning: false })
  if (refusalsInARow(entries) >= path.rule.smallerAfterRefusals) {
    const order = new Map(candidates.map((id, k) => [id, k]))
    return one([...eligible].sort((a, b) => EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort] || a.minutes - b.minutes || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))[0], 'smaller')
  }
  if (eligible.length === 1) return one(eligible[0], 'only')
  const { chances, leaning } = drawChances(eligible, entries, stage)
  let at = 0
  let m = eligible[eligible.length - 1]
  for (const rep of eligible) {
    at += chances[rep.id]
    if (draw < at) {
      m = rep
      break
    }
  }
  return { moveId: m.id, setting: settingFor(m, path, entries, today), rule: 'draw', chosenBy: 'app', candidates, propensities: chances, leaning }
}

/** Why this rep, in one line: the rule that chose it, and where, when the rep can happen in more than one kind of setting. */
export function whyThisRep(pick: RepPick): string {
  const c = copy.path.why
  const rule =
    pick.rule === 'smaller'
      ? c.smaller
      : pick.rule === 'only'
        ? c.only
        : pick.rule === 'you'
          ? c.you
          : pick.rule === 'rotate'
            ? c.rotate
            : fill(pick.leaning ? c.leaning : c.draw, { n: String(pick.candidates.length) })
  const kinds = hasMove(pick.moveId) ? (moveById(pick.moveId).settings ?? []) : []
  const said = pick.rule !== 'you' && kinds.length > 1 ? `${rule} ${fill(c.setting, { where: copy.catalogue.paths.settingNames[pick.setting] })}` : rule
  return pick.turn ? `${c.turn[pick.turn]} ${said}` : said
}

/** A number in [0, 1) fixed by its text: the same commitment, day and block draw the same tie until the record changes. */
export function seeded(text: string): number {
  let h = 2166136261
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

export interface RepCount {
  moveId: string
  offered: number
  /** Offers the app drew between two or more reps, with the chances kept. */
  drawn: number
  done: number
  partly: number
  no: number
  /** The last two answers, the latest first. */
  last: RepAnswer[]
  /** The kinds of setting its recent done reps used, the latest first. */
  settings: SettingKind[]
}

/** Counts by rep: offered, drawn, done, partly, no. His own acts only; nothing anyone else answered. */
export function countsByRep(entries: readonly PathEntry[]): RepCount[] {
  const by = new Map<string, RepCount>()
  for (const e of entries) {
    const c = by.get(e.moveId) ?? { moveId: e.moveId, offered: 0, drawn: 0, done: 0, partly: 0, no: 0, last: [], settings: [] }
    c.offered++
    if (e.rule === 'draw') c.drawn++
    if (e.outcome === 'done') c.done++
    else if (e.outcome === 'partly') c.partly++
    else if (e.outcome === 'no') c.no++
    by.set(e.moveId, c)
  }
  for (const c of by.values()) {
    const latest = entries.filter((e) => e.moveId === c.moveId).reverse()
    c.last = latest.map((e) => e.outcome).filter((o): o is RepAnswer => o !== null).slice(0, 2)
    c.settings = [...new Set(latest.filter((e) => e.outcome === 'done').map((e) => e.setting))].slice(0, 3)
  }
  return [...by.values()]
}

/** Reps marked done within the rule's weeks, by kind of setting. */
export function doneBySetting(path: Path, entries: readonly PathEntry[], today: string): Partial<Record<SettingKind, number>> {
  const from = addDays(today, -(path.rule.withinWeeks * 7 - 1))
  const out: Partial<Record<SettingKind, number>> = {}
  for (const e of entries) if (e.outcome === 'done' && e.day >= from && e.day <= today) out[e.setting] = (out[e.setting] ?? 0) + 1
  return out
}

/** A path as it is named to you: "The Social path". */
export function pathName(path: Pick<Path, 'id'>): string {
  return copy.path.names[path.id]
}

/** "Stage 2 of 6 · One step past hello". */
export function stageWords(path: Path, stage: number): string {
  return fill(copy.path.stage, { n: String(stage), of: String(path.stages.length), name: path.stages.find((s) => s.n === stage)?.name ?? '' })
}

export interface PathToday {
  aim: Aim
  path: Path
  entries: PathEntry[]
  state: StageState
  elig: Eligibility
  /** Today's rep: yours through Change, else the app's pick; null when no rep of the stage fits this block. */
  pick: RepPick | null
  around: boolean
  /** Part 27: today is a declared date day on this path. */
  dateDay: boolean
  /** The path's reps you have done or partly done, ever. */
  doneEver: ReadonlySet<string>
  /** The faith family is hidden (Rule 10). */
  faithHidden: boolean
}

export interface PathTodayInput {
  aim: Aim
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  ctx: Pick<DayContext, 'atOffice' | 'churchDay' | 'pickupTime'> | null
  day: string
  block: Block
  /** Part 27: the path's declarations: stages, date days and milestones. */
  marks?: readonly PathMark[]
  /** Part 27: the Partner path's online channel is on. */
  online?: boolean
  /** Part 27: the record reads high stress or overwhelm today. */
  lightOnly?: boolean
  /** The faith family is hidden in Settings (Rule 10). */
  faithHidden?: boolean
}

/** Everything a path's row, card, fact and coach block show for this block, computed one way. */
export function pathToday(i: PathTodayInput): PathToday {
  const path = pathById(i.aim.path as PathId)
  const marks = i.marks ?? []
  const entries = pathEntries(path.id, i.offers, i.outcomes, i.aim.convertedFrom === 'person')
  const state = stageOf(path, entries, i.day, declaredStage(path, marks, i.day))
  const around = peopleAround(i.ctx, i.block)
  const yesterday = entries.filter((e) => e.day === addDays(i.day, -1)).pop()?.moveId ?? null
  const doneToday = new Set(i.outcomes.filter((x) => x.day === i.day && (x.outcome === 'done' || x.outcome === 'partly')).map((x) => x.moveId))
  const dateDay = isDateDay(path, marks, i.day)
  const weekAgo = addDays(i.day, -6)
  const onlineThisWeek = entries.filter((e) => e.day >= weekAgo && e.day <= i.day && hasMove(e.moveId) && moveById(e.moveId).channel === 'online').length
  const doneEver = new Set(entries.filter((e) => e.outcome === 'done' || e.outcome === 'partly').map((e) => e.moveId))
  const faithHidden = i.faithHidden === true
  // Light reps only on a hard day is the Partner path's rule (Part 27).
  const elig = eligibility({ path, state, around, yesterday, doneToday, dateDay, online: i.online === true, onlineThisWeek, lightOnly: path.id === 'partner' && i.lightOnly === true, doneEver, faithHidden })
  const picked = i.aim.pick && i.aim.pick.day === i.day && hasMove(i.aim.pick.moveId) && !doneToday.has(i.aim.pick.moveId) ? moveById(i.aim.pick.moveId) : null
  // Your pick stands whatever the shape says, but never a faith talk while the faith family is hidden.
  const mine = picked && !(faithHidden && picked.hiddenWith === 'faith') ? picked : null
  const pick: RepPick | null = mine
    ? { moveId: mine.id, setting: settingFor(mine, path, entries, i.day), rule: 'you', chosenBy: 'you', candidates: [mine.id], propensities: { [mine.id]: 1 }, leaning: false }
    : pickRep(path, elig.eligible, entries, i.day, seeded(`${i.aim.id ?? 0}|${i.day}|${i.block}`), elig.stage)
  return { aim: i.aim, path, entries, state, elig, pick, around, dateDay, doneEver, faithHidden }
}

/** A rep the Partner path holds and the Social path does not. */
export function partnerOnly(moveId: string): boolean {
  return Boolean(placeOn('partner', moveId)) && !placeOn('social', moveId)
}

/** Days in seven a Partner-only rep may take the People row (Part 27). */
export const PARTNER_ONLY_DAYS = 2

/** The paths on today that hold a rep: it counts once for each. */
export function pathsHolding(moveId: string, on: readonly PathId[]): PathId[] {
  return on.filter((p) => Boolean(placeOn(p, moveId)))
}

export interface PeopleRow {
  view: PathToday
  pick: RepPick | null
  /** The paths the rep counts for. */
  paths: PathId[]
}

/**
 * One People row, whatever paths are on (Part 27). A rep you picked through Change is the row's,
 * the later pick of two. Otherwise a Partner-only rep takes the day when the Partner path is on,
 * one fits, and Partner-only reps took fewer than two of the last seven days; otherwise Social's
 * pick, which counts for both paths when both hold it. With the Partner path alone and its bound
 * reached, the reps it shares with Social.
 */
export function peopleRow(social: PathToday | null, partner: PathToday | null, today: string, draw: number): PeopleRow | null {
  const on = [social, partner].filter((v): v is PathToday => v !== null)
  if (!on.length) return null
  const ids = on.map((v) => v.path.id)
  const row = (view: PathToday, pick: RepPick | null): PeopleRow => ({ view, pick, paths: pick ? pathsHolding(pick.moveId, ids) : [view.path.id] })
  const yours = on.filter((v) => v.pick?.rule === 'you').sort((a, b) => ((a.aim.pick?.at ?? '') < (b.aim.pick?.at ?? '') ? 1 : -1))
  if (yours.length) return row(yours[0], yours[0].pick)
  if (partner) {
    const weekAgo = addDays(today, -6)
    const days = new Set(partner.entries.filter((e) => e.day >= weekAgo && e.day <= today && partnerOnly(e.moveId)).map((e) => e.day))
    const only = partner.elig.eligible.filter((m) => partnerOnly(m.id))
    const turn = (reps: readonly Move[], t: 'own' | 'shared') => {
      const pick = pickRep(partner.path, reps, partner.entries, today, draw, partner.elig.stage)
      return pick ? { ...pick, turn: t } : null
    }
    if (days.size < PARTNER_ONLY_DAYS && only.length) return row(partner, turn(only, 'own'))
    if (!social) return row(partner, turn(partner.elig.eligible.filter((m) => !partnerOnly(m.id)), 'shared'))
  }
  return row(social as PathToday, (social as PathToday).pick)
}

/** Today's shape for a block, in words, from the day record alone (tier 1). */
export function shapeWords(ctx: Pick<DayContext, 'atOffice' | 'churchDay' | 'pickupTime'> | null, block: Block): string {
  const c = copy.path.shape
  if (!ctx) return c.unknown
  const why = ctx.atOffice && block !== 'evening' ? c.office : ctx.churchDay && block === 'morning' ? c.church : ctx.pickupTime && peopleAround(ctx, block) ? c.daycare : null
  return why ? fill(c.around, { why }) : c.nobody
}

/**
 * The coach block (Parts 24 and 32): per path on, the stage, the reps that fit this block with
 * tier 1's reason when in-person reps are out, and per-rep evidence. Built by allowlist from the
 * same computation the row shows; tier 2 is never read here.
 */
export function coachBlock(views: readonly PathToday[], ctx: PathTodayInput['ctx'], day: string, block: Block, dateDay = false): CoachBlock | null {
  if (!views.length) return null
  const out = views.some((v) => v.elig.nobodyAround)
  return {
    eligible: views.map((v) => ({ path: v.path.id, ids: v.elig.eligible.map((m) => m.id) })),
    ineligibleReason: out ? copy.path.shape.outReason : null,
    day,
    block,
    shape: shapeWords(ctx, block),
    stages: views.map((v) => ({ path: v.path.id, stage: v.state.stage, name: v.path.stages.find((s) => s.n === v.state.stage)?.name ?? '', reentry: v.state.reentry })),
    dateDay,
    perRep: views.flatMap((v) => {
      const counts = new Map(countsByRep(v.entries).map((c) => [c.moveId, c]))
      return v.elig.stageReps.map((m) => {
        const c = counts.get(m.id)
        return { path: v.path.id, id: m.id, drawn: c?.drawn ?? 0, done: c?.done ?? 0, partly: c?.partly ?? 0, no: c?.no ?? 0, last: c?.last ?? [], settings: c?.settings ?? [] }
      })
    }),
  }
}
