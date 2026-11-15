import { addDays, BLOCKS } from './blocks'
import { kindsAtPattern, type ChallengerRun, type Condition } from './challenger'
import type { Compared } from './counted/compare'
import { dayStart, occasionsOf, SHORT_NIGHT } from './counted/occasions'
import type { CheckIn, DayContext, Forecast } from './db'
import { errorBand, predict } from './forecast'
import { eventTest, knownTest, LAST_NIGHT_KEYS, lastNightAssociations, type LastNightKey } from './lastNight'
import { readingOf } from './score'

// The challenger's list, read from the real record (2026-11-14). A short night; the evening by its band; then the
// things of last night whose comparison for the next morning stands at a steady pattern. Each condition says its state
// on a day from that day's own record alone, and null where the record cannot say: no answer, no check-in, a thing
// never on screen. The standings are worked out from the days before the day of the run, so nothing logged on that
// day can put a thing on the list or take it off.

export interface ChallengerRecord {
  checkins: readonly CheckIn[]
  contexts: ReadonlyMap<string, DayContext>
  /** The days a workout was finished in the evening. */
  eveningWorkouts: ReadonlySet<string>
  natureMoves: ReadonlySet<string>
  /** Faith is hidden: the church day is no candidate. */
  hideFaith: boolean
}

export const SLEEP_ID = 'sleep.short'
export const EVENING_ID = 'evening.band'
export const nightId = (key: LastNightKey): string => `night.${key}`

/** A short night: the day's own morning check-in answered sleep hours at one of its lowest two anchors. Any answer given counts, complete check-in or not. */
export function sleepCondition(checkins: readonly CheckIn[]): Condition {
  const slept = new Map<string, number>()
  for (const c of checkins) if (c.block === 'morning' && c.answers.sleepHours !== undefined) slept.set(c.day, c.answers.sleepHours)
  return {
    id: SLEEP_ID,
    blocks: BLOCKS,
    stateOn: (day) => {
      const v = slept.get(day)
      return v === undefined ? null : v <= SHORT_NIGHT ? 'short' : 'not'
    },
    moves: () => true,
  }
}

/** The evening by its band: the day's complete evening check-in, where it was completed before the next day began. */
export function eveningCondition(checkins: readonly CheckIn[]): Condition {
  const band = new Map<string, string>()
  for (const o of occasionsOf(checkins)) if (o.block === 'evening' && o.at <= dayStart(addDays(o.day, 1))) band.set(o.day, o.band)
  return { id: EVENING_ID, blocks: BLOCKS, stateOn: (day) => band.get(day) ?? null, moves: () => true }
}

/** One thing of last night as a condition of the next morning: present, absent, or null where the evening was not logged in full or never showed the thing. */
export function nightCondition(key: LastNightKey, r: ChallengerRecord): Condition {
  const isEvent = eventTest(key, r.contexts, r.eveningWorkouts, r.natureMoves)
  const known = knownTest(key, r.natureMoves)
  const evenings = new Map<string, CheckIn>()
  for (const c of r.checkins) if (c.block === 'evening' && readingOf(c) !== null) evenings.set(c.day, c)
  return {
    id: nightId(key),
    blocks: ['morning'],
    stateOn: (day) => {
      const c = evenings.get(day)
      if (!c || (known && !known(c))) return null
      return isEvent(c) ? 'yes' : 'no'
    },
    moves: (state) => state === 'yes',
  }
}

/** The candidates: each thing of last night with its comparison for the next morning, over the days before `today` alone. */
export function nightCandidates(r: ChallengerRecord, today: string): { key: LastNightKey; compared: Compared }[] {
  // An evening's outcome is the morning after it: with only the days before today, yesterday's evening has none yet.
  const before = r.checkins.filter((c) => c.day < today)
  const all = lastNightAssociations({ checkins: before, contexts: r.contexts, eveningWorkouts: r.eveningWorkouts, natureMoves: r.natureMoves }, today)
  return LAST_NIGHT_KEYS.filter((key) => !(r.hideFaith && key === 'churchDay')).flatMap((key) => {
    const compared = all[key].compared
    return compared ? [{ key, compared }] : []
  })
}

/** The list for a run on `today`: the first two, then the candidates that stand at a steady pattern, one family, a few at most. */
export function conditionsFor(r: ChallengerRecord, today: string): Condition[] {
  const family = nightCandidates(r, today)
  const standing = new Set(kindsAtPattern(family.map((f) => f.compared)))
  return [sleepCondition(r.checkins), eveningCondition(r.checkins), ...family.filter((f) => standing.has(f.compared.id)).map((f) => nightCondition(f.key, r))]
}

const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))

/**
 * The rows due, adjusted in place where the record can speak: the base way's point plus the adjustment, in a range
 * taken from the challenger's own back-tested misses. A row no condition can speak for is left exactly as it was. The
 * row keeps the base way's name, and says the points added and the conditions that added them.
 */
export function adjustRows(due: Forecast[], run: ChallengerRun, values: ReadonlyMap<string, number>): void {
  const band = errorBand(run.errors)
  for (const f of due) {
    const a = run.adjustmentFor(f.day, f.block)
    if (a.points === 0) continue
    const p = predict(run.base, values, f.day, f.block)
    if (p === null) continue
    f.point = clamp(p + a.points)
    f.lo = clamp(p + a.points + band.lo)
    f.hi = clamp(p + a.points + band.hi)
    f.adj = Math.round(a.points * 10) / 10
    f.adjBy = a.by
  }
}
