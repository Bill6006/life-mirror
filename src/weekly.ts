import { BLOCKS, daysBetween, type Block } from './blocks'
import { families, hasMove, liveMoves, moveById, OBSERVED_ONLY, PASSIVE } from './catalogue'
import type { CheckIn, DayContext, Declaration, ForecastScore, Offer, Outcome } from './db'
import { decayAfterStop, type Observation } from './learning'
import { candidatesFor, reachableAnywhere, type Situation, type TodayState } from './offers'
import type { ReadingId } from './readings'
import { INGREDIENT_IDS, INGREDIENTS, readingOf, type Band } from './score'
import type { CardStats } from './tiers'

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
  declared: number
  replicated: number
  gaveBack: number
  checkins: number
  medianAnswerMs: Record<Block, number | null>
}

/** Forecast hit rate against the target, the average miss, experiments declared against replicated, check-ins that gave something back, answering time per block. */
export function scorecard(scores: readonly ForecastScore[], checkins: readonly CheckIn[], declarations: readonly Declaration[], stats: readonly CardStats[]): Scorecard {
  const dayAhead = scores.filter((s) => s.horizon === 1)
  const hits = dayAhead.filter((s) => s.hit).length
  const misses = dayAhead.filter((s) => !s.hit).map((s) => Math.abs(s.error))
  const replicated = stats.filter((s) => s.declared && s.replication?.holds).length
  const complete = checkins.filter((c) => c.completedAt !== null)
  const medianAnswerMs = Object.fromEntries(BLOCKS.map((b) => [b, median(complete.filter((c) => c.block === b && c.activeMs > 0).map((c) => c.activeMs))])) as Record<Block, number | null>
  return {
    scored: dayAhead.length,
    hitRate: dayAhead.length ? hits / dayAhead.length : null,
    target: TARGET_HIT_RATE,
    averageMiss: mean(misses),
    declared: declarations.length,
    replicated,
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
  onBest: number
  ofBest: number
  onOthers: number
  ofOthers: number
}

export interface BestDays {
  days: number
  threshold: number
  silent: boolean
  top: string[]
  controlled: Difference[]
  uncontrolled: Difference[]
}

function share(d: Difference): number {
  return d.onBest / Math.max(1, d.ofBest) - d.onOthers / Math.max(1, d.ofOthers)
}

/**
 * Your top tenth of days and what was different, split into what you control (moves done,
 * passive items, the chips, the necessities) and what you don't (the weekday, last night's
 * sleep, who was around). Silent under twenty days, and always says how many it rests on.
 */
export function bestDays(checkins: readonly CheckIn[], offers: readonly Offer[], outcomes: readonly Outcome[], contexts: readonly DayContext[], today: string, outside: ReadonlySet<string> = new Set()): BestDays {
  const readings = dayReadings(checkins, today)
  if (readings.length < BEST_DAYS_MIN) return { days: readings.length, threshold: BEST_DAYS_MIN, silent: true, top: [], controlled: [], uncontrolled: [] }
  const sorted = [...readings].sort((a, b) => b.value - a.value)
  const k = Math.max(2, Math.round(sorted.length * BEST_SHARE))
  const top = sorted.slice(0, k).map((d) => d.day)
  const others = sorted.slice(k).map((d) => d.day)
  const done = new Set(outcomes.filter((x) => x.outcome === 'done').map((x) => x.offerId))
  const byDay = new Map<string, CheckIn[]>()
  for (const c of checkins) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c])

  const count = (label: string, has: (day: string) => boolean): Difference => ({
    label,
    onBest: top.filter(has).length,
    ofBest: top.length,
    onOthers: others.filter(has).length,
    ofOthers: others.length,
  })
  const controlled: Difference[] = []
  const doneMoves = new Map<string, Set<string>>()
  for (const o of offers) {
    if (o.id === undefined || !done.has(o.id) || !hasMove(o.moveId)) continue
    doneMoves.set(o.moveId, new Set([...(doneMoves.get(o.moveId) ?? []), o.day]))
  }
  for (const [moveId, days] of doneMoves) controlled.push(count(moveById(moveId).name, (d) => days.has(d)))
  const evening = (day: string) => byDay.get(day)?.find((c) => c.block === 'evening')
  controlled.push(count('caffeine after midday', (d) => Boolean(evening(d)?.extras?.caffeine)))
  controlled.push(count('a late or heavy dinner', (d) => Boolean(evening(d)?.extras?.dinner)))
  controlled.push(count('nothing landed', (d) => Boolean(evening(d)?.extras?.nothingLanded)))
  controlled.push(count('hard to see the point', (d) => Boolean(evening(d)?.extras?.hardToSeePoint)))
  controlled.push(count('a nap', (d) => Boolean(evening(d)?.extras?.napped)))
  controlled.push(count('a necessity missed', (d) => Object.values(evening(d)?.extras?.necessities ?? {}).some(Boolean)))

  const ctx = new Map(contexts.map((c) => [c.day, c]))
  const morning = (day: string) => byDay.get(day)?.find((c) => c.block === 'morning')
  controlled.push(count('heavy caffeine in the morning', (d) => Boolean(morning(d)?.extras?.heavyCaffeine)))
  const uncontrolled: Difference[] = []
  for (let w = 0; w < 7; w++) uncontrolled.push(count(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][w], (d) => ctx.get(d)?.weekday === w || (!ctx.has(d) && new Date(`${d}T12:00:00`).getDay() === w)))
  uncontrolled.push(count('slept seven hours or more', (d) => (morning(d)?.answers.sleepHours ?? 0) >= 4))
  uncontrolled.push(count('sleep read sound or deep', (d) => (morning(d)?.answers.sleepQuality ?? 0) >= 4))
  uncontrolled.push(count('she was away', (d) => ctx.get(d)?.withHer === false))
  uncontrolled.push(count('a study night', (d) => ctx.get(d)?.studyNight === true))
  uncontrolled.push(count('the church day', (d) => ctx.get(d)?.churchDay === true))
  uncontrolled.push(count('an office day', (d) => ctx.get(d)?.atOffice === true))
  uncontrolled.push(count('a workout day', (d) => outside.has(d)))

  const pick = (list: Difference[]) =>
    list
      .filter((d) => d.onBest + d.onOthers > 0)
      .sort((a, b) => Math.abs(share(b)) - Math.abs(share(a)))
      .slice(0, 4)
  return { days: readings.length, threshold: BEST_DAYS_MIN, silent: false, top, controlled: pick(controlled), uncontrolled: pick(uncontrolled) }
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
  return families.map((f) => {
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
  stats: readonly CardStats[]
  cardMoves: ReadonlyMap<number, { moveId: string; situationKey: string }>
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
  const held = inputs.stats
    .filter((s) => s.tier === 'holdsUp' || s.tier === 'promising')
    .map((s) => {
      const c = inputs.cardMoves.get(s.cardId)
      return c && hasMove(c.moveId) ? `${moveById(c.moveId).name} in ${c.situationKey}: ${s.tier === 'holdsUp' ? 'holds up' : 'promising'}` : null
    })
    .filter((x): x is string => x !== null)
  const list = (xs: string[]) => (xs.length ? xs.join('; ') : 'none yet')
  return template
    .replace('{n}', String(Math.max(3, short.length + unreachable.length)))
    .replace('{situations: block, lowest reading, band, candidates left}', list(short))
    .replace('{moves: name, offered, done}', list(neverDone))
    .replace('{families: name, the filter that blocks them}', list(unreachable))
    .replace('{moves: name, situation, tier}', list(held))
}

