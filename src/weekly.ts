import { BLOCKS, daysBetween, type Block } from './blocks'
import { dayCaffeine, HABIT_DAYS, itemDays } from './caffeineRecord'
import { families, hasMove, liveMoves, moveById, OBSERVED_ONLY, PASSIVE } from './catalogue'
import type { CheckIn, DayContext, ForecastScore, Offer, Outcome } from './db'
import { ratesBy, standings, type CellPoint, type Direction, type Standing } from './counted/compare'
import { type CountedInput, type DayFacts, dayFactsOf, type Kind, kindsOf } from './counted/kinds'
import { daysOf } from './counted/occasions'
import { decayAfterStop, type Observation } from './observe'
import { candidatesFor, reachableAnywhere, type Situation, type TodayState } from './offers'
import type { ReadingId } from './readings'
import { INGREDIENT_IDS, INGREDIENTS, readingOf, type Band } from './score'
import type { OwnChip } from './settings'

// The weekly view, pure: the scorecard, best-days, the gap as numbers, what moved this week,
// what lasts and what does not, catalogue health, and the extension prompt the app writes
// for itself. Counts and calculations, every one with what it rests on; nothing here grades.

export const TARGET_HIT_RATE = 0.6
export const BEST_DAYS_MIN = 20
export const BEST_SHARE = 0.1
export const SHORT_SITUATION = 3
export const NEVER_DONE_MIN = 3

function median(values: readonly number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

export interface Scorecard {
  scored: number
  hitRate: number | null
  target: number
  averageMiss: number | null
  /** The learning engine's tests under way, and its calls resolved and held (requirement 15); null when it failed. */
  repair: RepairTrack | null
  gaveBack: number
  checkins: number
  medianAnswerMs: Record<Block, number | null>
}

/** Forecast hit rate against the target, the average miss, the engine's tests and calls, check-ins that gave something back, answering time per block. */
/** The learning repair's own count for the scorecard: its tests with fair draws on both sides, and its calls resolved and held. */
export interface RepairTrack {
  underWay: number
  resolved: number
  held: number
}

export function scorecard(scores: readonly ForecastScore[], checkins: readonly CheckIn[], repair: RepairTrack | null): Scorecard {
  const dayAhead = scores.filter((s) => s.horizon === 1)
  const hits = dayAhead.filter((s) => s.hit).length
  const misses = dayAhead.filter((s) => !s.hit).map((s) => Math.abs(s.error))
  const complete = checkins.filter((c) => c.completedAt !== null)
  const medianAnswerMs = Object.fromEntries(BLOCKS.map((b) => [b, median(complete.filter((c) => c.block === b && c.activeMs > 0).map((c) => c.activeMs))])) as Record<Block, number | null>
  return {
    scored: dayAhead.length,
    hitRate: dayAhead.length ? hits / dayAhead.length : null,
    target: TARGET_HIT_RATE,
    averageMiss: mean(misses),
    repair,
    gaveBack: complete.length,
    checkins: checkins.length,
    medianAnswerMs,
  }
}

/** A day's reading: the mean of its fully logged blocks; null under two blocks. */
export function dayReading(checkins: readonly CheckIn[], day: string): number | null {
  const values = checkins.filter((c) => c.day === day).map((c) => readingOf(c)?.value).filter((v): v is number => v !== undefined)
  return values.length >= 2 ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null
}

export function dayReadings(checkins: readonly CheckIn[], today: string): { day: string; value: number }[] {
  const days = [...new Set(checkins.filter((c) => c.day < today).map((c) => c.day))].sort()
  return days.map((day) => ({ day, value: dayReading(checkins, day) })).filter((d): d is { day: string; value: number } => d.value !== null)
}

export interface Difference {
  label: string
  /** The move a difference is about, when it is one done: what the review's facts file it under (stage 3, group 1). */
  moveId?: string
  /** Over the days the record can speak for it: how many of the best days carried it, and how many of the others. */
  onBest: number
  ofBest: number
  onOthers: number
  ofOthers: number
  /** Where it stands among every condition looked at, by the one standard (2026-11-12), and which way its rate on the best days reads against the others'. */
  standing: Standing
  direction: Direction
}

export interface BestDays {
  days: number
  threshold: number
  silent: boolean
  top: string[]
  /** How many conditions had enough days to be compared: what the correction was made across, and the number said with a lead. */
  family: number
  /** In each list, up to four that stand at a lead, the largest difference first; none until one does. */
  controlled: Difference[]
  uncontrolled: Difference[]
  /** Your own chips (stage 3, item 5), each by its label over the days that showed it: for the weekly view on the phone alone, never the day's sheet. */
  own?: Difference[]
}

/** Every condition best days looked at, before any is picked. */
export interface BestConditions {
  days: number
  top: string[]
  family: number
  controlled: Difference[]
  uncontrolled: Difference[]
  own: Difference[]
}

function share(d: Difference): number {
  return d.onBest / Math.max(1, d.ofBest) - d.onOthers / Math.max(1, d.ofOthers)
}

/** One condition best days looks at: its words, and where the record can speak for it. */
interface Condition {
  key: string
  label: string
  moveId?: string
  known: (d: DayFacts) => boolean
  has: (d: DayFacts) => boolean
}

/**
 * A kind of the counted foundation as a condition of a day, so the rule for where the record can speak is kept in
 * one place. A kind counted at a check-in is known on a day when one of the day's check-ins showed it, and held
 * when one of those carried it.
 */
function conditionOf(kind: Kind, label: string = kind.label): Condition {
  if (kind.unit === 'day') return { key: kind.id, label, known: (d) => kind.known(d), has: (d) => kind.happened(d) }
  return { key: kind.id, label, known: (d) => d.occasions.some((o) => kind.known(o)), has: (d) => d.occasions.some((o) => kind.known(o) && kind.happened(o)) }
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/**
 * The strongest standing best days says. Its check on the simulation's tuning seeds (stress/countedBest.ts,
 * 2026-11-12) showed a steady pattern too often where a thing comes in streaks beside a state that carries over.
 * Until that has an answer of its own, a condition that would stand at a pattern is said as a lead.
 */
const capped = (standing: Standing): Standing => (standing === 'pattern' ? 'lead' : standing)

/**
 * Every condition of best days with its counts and its standing (the one standard, 2026-11-12). The top tenth of
 * days is set against the others, and each condition is one comparison: how often it was recorded on the best days
 * against the other days, by the core's "when" question with one occasion a day, over the days the record can speak
 * for it. A day it cannot speak for is in neither count. Every condition looked at is one family. Null under twenty
 * days.
 */
export function bestConditions(checkins: readonly CheckIn[], offers: readonly Offer[], outcomes: readonly Outcome[], contexts: readonly DayContext[], today: string, outside: ReadonlySet<string> = new Set(), own: readonly OwnChip[] = []): BestConditions | null {
  const readings = dayReadings(checkins, today)
  if (readings.length < BEST_DAYS_MIN) return null
  const sorted = [...readings].sort((a, b) => b.value - a.value)
  const k = Math.max(2, Math.round(sorted.length * BEST_SHARE))
  const top = sorted.slice(0, k).map((d) => d.day)
  const best = new Set(top)

  // The record as it stood before today, read through the kinds list: one rule for where each thing is known.
  const before = <T extends { day: string }>(list: readonly T[]): T[] => list.filter((x) => x.day < today)
  const input: CountedInput = { checkins: before(checkins), contexts: before(contexts), items: [], chips: own, offers: before(offers), outcomes: before(outcomes), workoutDays: [...outside].filter((d) => d < today) }
  const facts = dayFactsOf(input, daysOf(input.checkins))
  const kinds = new Map(kindsOf(input).map((kind) => [kind.id, kind]))
  const kind = (id: string, label?: string): Condition[] => {
    const found = kinds.get(id)
    return found ? [conditionOf(found, label)] : []
  }
  const evening = (d: DayFacts): CheckIn | undefined => d.occasions.find((o) => o.block === 'evening')?.checkin

  const controlled: Condition[] = []
  // A move done at least once, over the days it was offered and answered.
  const done = new Set(input.outcomes.filter((x) => x.outcome === 'done').map((x) => x.offerId))
  const doneMoves = new Set(input.offers.filter((o) => o.id !== undefined && done.has(o.id) && hasMove(o.moveId)).map((o) => o.moveId))
  for (const moveId of doneMoves) controlled.push(...kind(`move.${moveId}`).map((c) => ({ ...c, moveId })))
  // Caffeine from reported bands (Part 22e), over the days the item recorded anything. The old yes/no rows stay until the item has 28 days.
  const legacyCaffeine = itemDays(checkins, today) < HABIT_DAYS
  const caffeine = kind('caffeine.200')
  if (legacyCaffeine) controlled.push({ key: 'caffeine.afterMidday', label: 'caffeine after midday', known: (d) => evening(d) !== undefined, has: (d) => Boolean(evening(d)?.extras?.caffeine) })
  controlled.push(...caffeine)
  controlled.push(...caffeine.map((c): Condition => ({ key: 'caffeine.later100', label: '100 mg or more reported after the morning', known: c.known, has: (d) => dayCaffeine(d.all, d.day).windows.some((w) => w.block !== 'morning' && w.band >= 2) })))
  controlled.push(...kind('chip.dinner'), ...kind('chip.nothingLanded'), ...kind('chip.hardToSeePoint'), ...kind('chip.napped'))
  // Time in nature (item 2 of 4) and the chips of stage 3, item 5: only over the days that showed them (Rule 2).
  controlled.push(...kind('nature', '20+ minutes in nature'), ...kind('sweet'), ...kind('necessity.missed'))
  if (legacyCaffeine) controlled.push({ key: 'caffeine.heavyMorning', label: 'heavy caffeine in the morning', known: (d) => d.checkin('morning') !== undefined, has: (d) => Boolean(d.checkin('morning')?.extras?.heavyCaffeine) })

  const uncontrolled: Condition[] = []
  for (let w = 0; w < 7; w++) uncontrolled.push({ key: `weekday.${w}`, label: WEEKDAY_NAMES[w], known: () => true, has: (d) => d.weekday === w })
  uncontrolled.push(...kind('sleep.long'), ...kind('sleep.sound'))
  // She was away: the other side of a day with her, known wherever that is.
  uncontrolled.push(...kind('context.withHer').map((c): Condition => ({ key: 'context.away', label: 'she was away', known: c.known, has: (d) => c.known(d) && !c.has(d) })))
  uncontrolled.push(...kind('context.studyNight'), ...kind('context.church'), ...kind('context.office'), ...kind('workout'))

  // Your own chips, kept apart from the lists the day's sheet reads.
  const ownChips = own.flatMap((chip) => kind(`own.${chip.id}`))

  const all = [...controlled, ...uncontrolled, ...ownChips]
  const cells = all.map((c) => {
    const points: CellPoint[] = []
    for (const r of readings) {
      const d = facts.get(r.day)
      if (!d || !c.known(d)) continue
      points.push({ day: r.day, cell: best.has(r.day) ? 'best' : 'other', happened: c.has(d) })
    }
    return ratesBy(points, { id: `best.${c.key}`, within: 'stretch', cells: ['best'] })[0]
  })
  const stood = standings(cells)
  const differences = all.map((c, i): Difference => ({ label: c.label, ...(c.moveId ? { moveId: c.moveId } : {}), onBest: cells[i].k, ofBest: cells[i].n, onOthers: cells[i].restK, ofOthers: cells[i].m, standing: capped(stood[i].standing), direction: stood[i].direction }))
  return {
    days: readings.length,
    top,
    family: stood[0]?.family ?? 0,
    controlled: differences.slice(0, controlled.length),
    uncontrolled: differences.slice(controlled.length, controlled.length + uncontrolled.length),
    own: differences.slice(controlled.length + uncontrolled.length),
  }
}

/**
 * Your top tenth of days and what stood apart on them, split into what you control (moves done, the chips, the
 * necessities), your own chips, and what you don't (the weekday, last night's sleep, who was around). Silent under
 * twenty days. Each list shows up to four conditions that stand at a lead, the largest difference first, and none
 * until one does.
 */
export function bestDays(checkins: readonly CheckIn[], offers: readonly Offer[], outcomes: readonly Outcome[], contexts: readonly DayContext[], today: string, outside: ReadonlySet<string> = new Set(), own: readonly OwnChip[] = []): BestDays {
  const all = bestConditions(checkins, offers, outcomes, contexts, today, outside, own)
  if (!all) return { days: dayReadings(checkins, today).length, threshold: BEST_DAYS_MIN, silent: true, top: [], family: 0, controlled: [], uncontrolled: [], own: [] }
  const rank = (d: Difference): number => (d.standing === 'pattern' ? 1 : 0)
  const pick = (list: readonly Difference[]): Difference[] =>
    list
      .filter((d) => d.standing === 'lead' || d.standing === 'pattern')
      .sort((a, b) => rank(b) - rank(a) || Math.abs(share(b)) - Math.abs(share(a)))
      .slice(0, 4)
  return { days: all.days, threshold: BEST_DAYS_MIN, silent: false, top: all.top, family: all.family, controlled: pick(all.controlled), uncontrolled: pick(all.uncontrolled), own: pick(all.own) }
}

export interface Gap {
  days: number
  typical: number | null
  good: number | null
  best: number | null
  /** Share of days at or above good. */
  howOften: number | null
  /** Days since the last good day, or null. */
  lastGoodDaysAgo: number | null
}

/** The gap as numbers: typical (the median day), good (the top quarter's floor), best (the top tenth's mean), how often, how recently. The app aims at it. */
export function gap(checkins: readonly CheckIn[], today: string): Gap {
  const readings = dayReadings(checkins, today)
  if (readings.length < 7) return { days: readings.length, typical: null, good: null, best: null, howOften: null, lastGoodDaysAgo: null }
  const values = readings.map((r) => r.value).sort((a, b) => a - b)
  const typical = median(values) as number
  const good = values[Math.floor(values.length * 0.75)]
  const topK = Math.max(2, Math.round(values.length * BEST_SHARE))
  const best = mean(values.slice(-topK)) as number
  const goodDays = readings.filter((r) => r.value >= good)
  const last = goodDays.length ? goodDays.map((r) => r.day).sort().pop() as string : null
  return { days: readings.length, typical: Math.round(typical), good: Math.round(good), best: Math.round(best), howOften: goodDays.length / readings.length, lastGoodDaysAgo: last ? daysBetween(last, today) : null }
}

export interface Moved {
  reading: ReadingId
  thisWeek: number | null
  lastWeek: number | null
  /** In anchor steps, helpful direction positive; null without both weeks. */
  delta: number | null
}

/** What moved this week: each ingredient's mean position this week against last, helpful direction positive; and the day reading. */
export function movedThisWeek(checkins: readonly CheckIn[], today: string): { reading: { thisWeek: number | null; lastWeek: number | null; delta: number | null }; ingredients: Moved[] } {
  const inWeek = (c: CheckIn, offset: number) => {
    const d = daysBetween(c.day, today)
    return d >= offset && d < offset + 7
  }
  const ingredients: Moved[] = INGREDIENT_IDS.map((id) => {
    const values = (offset: number) => checkins.filter((c) => inWeek(c, offset) && c.answers[id] !== undefined).map((c) => c.answers[id] as number)
    const thisWeek = mean(values(0))
    const lastWeek = mean(values(7))
    const raw = thisWeek !== null && lastWeek !== null ? thisWeek - lastWeek : null
    return { reading: id, thisWeek, lastWeek, delta: raw === null ? null : INGREDIENTS[id] === 'down' ? -raw : raw }
  })
  const readingValues = (offset: number) => checkins.filter((c) => inWeek(c, offset)).map((c) => readingOf(c)?.value).filter((v): v is number => v !== undefined)
  const thisWeek = mean(readingValues(0))
  const lastWeek = mean(readingValues(7))
  return { reading: { thisWeek, lastWeek, delta: thisWeek !== null && lastWeek !== null ? thisWeek - lastWeek : null }, ingredients: ingredients.filter((m) => m.delta !== null).sort((a, b) => Math.abs(b.delta as number) - Math.abs(a.delta as number)) }
}

export interface Lasts {
  decays: { moveId: string; daysHeld: number; runs: number }[]
  byReward: { reward: string; first: { mean: number; n: number } | null; later: { mean: number; n: number } | null }[]
}

/** What lasts and what does not: how long a move's effect held after a run, and each reward's first opportunities against its later ones. */
export function whatLasts(obs: readonly Observation[], checkins: readonly CheckIn[]): Lasts {
  const moveIds = [...new Set(obs.filter((o) => o.arm === 'done').map((o) => o.moveId))]
  const decays: Lasts['decays'] = []
  for (const moveId of moveIds) {
    if (!hasMove(moveId)) continue
    const target = moveById(moveId).targets[0]?.reading
    if (!target) continue
    const d = decayAfterStop(obs, moveId, checkins, target)
    if (d) decays.push({ moveId, daysHeld: d.daysHeld, runs: d.runs })
  }
  const byReward = ['pleasure', 'mastery', 'connection'].map((reward) => {
    const mine = obs.filter((o) => o.arm === 'done' && hasMove(o.moveId) && moveById(o.moveId).tags.reward.includes(reward as 'pleasure')).sort((a, b) => (a.day < b.day ? -1 : 1))
    const perMove = new Map<string, number[]>()
    for (const o of mine) perMove.set(o.moveId, [...(perMove.get(o.moveId) ?? []), o.effect])
    const first: number[] = []
    const later: number[] = []
    for (const effects of perMove.values()) {
      first.push(...effects.slice(0, 3))
      later.push(...effects.slice(3))
    }
    const est = (xs: number[]) => (xs.length >= 3 ? { mean: mean(xs) as number, n: xs.length } : null)
    return { reward, first: est(first), later: est(later) }
  })
  return { decays: decays.sort((a, b) => b.daysHeld - a.daysHeld), byReward }
}

export interface FamilyHealth {
  family: string
  name: string
  live: number
  offered: number
  done: number
  reachable: boolean
  /** The filter that blocked every entry in every recent situation, when unreachable. */
  blocker: string | null
  /** Entries no situation at all admits, whatever the day, with the filter that keeps each out. */
  dead: { id: string; name: string; blocker: string }[]
}

const QUIET: TodayState = { doneToday: [], offeredToday: [], hiddenFamilies: new Set(), doneRungs: new Map(), studyNight: true, withHer: true, churchDay: true, noTimeCeiling: null }

/** The situations of the last fortnight, from the offers made in them. */
export function recentSituations(offers: readonly Offer[], today: string): Situation[] {
  const seen = new Map<string, Situation>()
  for (const o of offers) {
    if (o.kind !== 'block' || daysBetween(o.day, today) > 14 || !o.band) continue
    if (!seen.has(o.situationKey)) seen.set(o.situationKey, { block: o.block, target: o.target as Situation['target'], key: o.situationKey, band: o.band as Band, reading: o.reading, targetPosition: 1 })
  }
  return [...seen.values()]
}

/** Catalogue health: what each family has been offered and done, and which families the filters have made unreachable in the situations seen, with the filter that blocks them. */
export function catalogueHealth(offers: readonly Offer[], outcomes: readonly Outcome[], situations: readonly Situation[], hidden: ReadonlySet<string> = new Set()): FamilyHealth[] {
  const done = new Set(outcomes.filter((x) => x.outcome === 'done').map((x) => x.offerId))
  const state: TodayState = { ...QUIET, hiddenFamilies: hidden }
  // A family with nothing live yet (the Partner path's reps before their Green) has nothing to report.
  return families.filter((f) => liveMoves.some((m) => m.family === f.id)).map((f) => {
    const entries = liveMoves.filter((m) => m.family === f.id)
    const offered = offers.filter((o) => hasMove(o.moveId) && moveById(o.moveId).family === f.id)
    const reasons = new Map<string, number>()
    let reachable = false
    for (const s of situations) {
      const set = candidatesFor(s, state)
      if (entries.some((m) => set.candidates.some((c) => c.id === m.id))) reachable = true
      for (const m of entries) {
        const r = set.excluded.get(m.id)
        if (r) reasons.set(r, (reasons.get(r) ?? 0) + 1)
      }
    }
    const blocker = !reachable && situations.length ? ([...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) : null
    // Dead on paper: an entry the draw is meant to reach that no situation at all admits.
    const dead = entries
      .filter((m) => !PASSIVE.has(m.id) && !OBSERVED_ONLY.has(m.id) && m.family !== 'study')
      .map((m) => ({ m, r: reachableAnywhere(m) }))
      .filter((x) => !x.r.reachable)
      .map((x) => ({ id: x.m.id, name: x.m.name, blocker: x.r.blocker ?? 'target' }))
    return { family: f.id, name: f.name, live: entries.length, offered: offered.length, done: offered.filter((o) => o.id !== undefined && done.has(o.id)).length, reachable: reachable || situations.length === 0, blocker, dead }
  })
}

export interface PromptInputs {
  situations: readonly Situation[]
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  health: readonly FamilyHealth[]
  /** What the engine has settled helps: each move on its reading, at its rung; null while it cannot read the record. */
  held: readonly { moveId: string; target: string; level: 'established' | 'likely' }[] | null
}

/** The extension prompt the app writes for itself: what runs short, what you never take, what the filters block, what held up. Private items are never named or implied. */
export function extensionPromptText(inputs: PromptInputs, template: string): string {
  const short = inputs.situations
    .map((s) => ({ s, n: candidatesFor(s, QUIET).candidates.length }))
    .filter((x) => x.n <= SHORT_SITUATION)
    .map((x) => `${x.s.block}, ${x.s.target} lowest, ${x.s.band}: ${x.n} candidates`)
  const offeredCount = new Map<string, { offered: number; done: number }>()
  const done = new Set(inputs.outcomes.filter((x) => x.outcome === 'done').map((x) => x.offerId))
  for (const o of inputs.offers) {
    if (!hasMove(o.moveId) || o.skippedAt) continue
    const c = offeredCount.get(o.moveId) ?? { offered: 0, done: 0 }
    c.offered++
    if (o.id !== undefined && done.has(o.id)) c.done++
    offeredCount.set(o.moveId, c)
  }
  const neverDone = [...offeredCount.entries()].filter(([, c]) => c.offered >= NEVER_DONE_MIN && c.done === 0).map(([id, c]) => `${moveById(id).name}: offered ${c.offered}, done 0`)
  const unreachable = [
    ...inputs.health.filter((h) => !h.reachable).map((h) => `${h.name}: ${h.blocker ?? 'no situation fits'}`),
    ...inputs.health.flatMap((h) => h.dead.map((d) => `${h.name}: ${d.name} (${d.blocker})`)),
  ]
  const held = (inputs.held ?? []).filter((h) => hasMove(h.moveId)).map((h) => `${moveById(h.moveId).name} on ${h.target}: ${h.level} helps`)
  const list = (xs: string[]) => (xs.length ? xs.join('; ') : 'none yet')
  return template
    .replace('{n}', String(Math.max(3, short.length + unreachable.length)))
    .replace('{situations: block, lowest reading, band, candidates left}', list(short))
    .replace('{moves: name, offered, done}', list(neverDone))
    .replace('{families: name, the filter that blocks them}', list(unreachable))
    .replace('{moves: name, situation, tier}', inputs.held === null ? 'unknown: the learning engine could not read the record' : list(held))
}

