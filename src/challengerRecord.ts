import { privateIsLogged, privateShownAt, associationFor } from './associations'
import { addDays, BLOCKS } from './blocks'
import { kindsAtPattern, type ChallengerRun, type Condition } from './challenger'
import { WORTH_POINTS, type Compared } from './counted/compare'
import { NOTICED_MIN } from './counted/kinds'
import { dayStart, occasionsOf, SHORT_NIGHT } from './counted/occasions'
import type { CheckIn, DayContext, Forecast, PrivateItem } from './db'
import { errorBand, predict } from './forecast'
import { eventTest, knownTest, LAST_NIGHT_KEYS, lastNightAssociations, type LastNightKey } from './lastNight'
import type { Noticed } from './noteEvents/join'
import { eventTypes } from './noteEvents/types'
import { readingOf } from './score'

// The challenger's list, read from the real record (2026-11-14). A short night; the evening by its band; then the
// candidates whose comparison for the next morning stands at a steady pattern: the things of last night, each private
// item where it was on screen at the evening check-in, and each type of note event. Each condition says its state on a
// day from that day's own record alone, and null where the record cannot say: no answer, no check-in, a thing never
// on screen, an evening without a note. An evening counts only where it was completed before the next day began: only
// what the record held when the forecast was written. The standings are worked out from the days before the day of
// the run, so nothing logged on that day can put a candidate on the list or take it off.

export interface ChallengerRecord {
  checkins: readonly CheckIn[]
  contexts: ReadonlyMap<string, DayContext>
  /** The days a workout was finished in the evening. */
  eveningWorkouts: ReadonlySet<string>
  natureMoves: ReadonlySet<string>
  /** Faith is hidden: the church day is no candidate. */
  hideFaith: boolean
  /** The private items: each a candidate only while the Brain's switch for private items is on. */
  items?: readonly Pick<PrivateItem, 'id' | 'createdAt'>[]
  /** What was noticed in notes, as the phone's own join stands it: each type a candidate only while the Brain's switch for notes is on. */
  noticed?: readonly Noticed[]
  /** The Brain's switches for private items and for notes, as they stand at the run. Absent, the switch is off here. */
  privateOn?: boolean
  notesOn?: boolean
}

export const SLEEP_ID = 'sleep.short'
export const EVENING_ID = 'evening.band'
export const nightId = (key: LastNightKey): string => `night.${key}`
export const privateId = (itemId: number): string => `private.${itemId}`
export const noticedId = (type: string): string => `noticed.${type}`

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

/** The band the evening before `day` read in, by the evening condition's own rule (its check-in complete, and completed before `day` began); null where that evening is not known (the forecast follow-ups, item 3). */
export function bandBefore(checkins: readonly CheckIn[], day: string): string | null {
  return eveningCondition(checkins).stateOn(addDays(day, -1))
}

/** Each day's evening check-in logged in full, where it was completed before the next day began. */
function eveningsKnown(checkins: readonly CheckIn[]): Map<string, CheckIn> {
  const out = new Map<string, CheckIn>()
  for (const c of checkins) {
    if (c.block !== 'evening' || readingOf(c) === null) continue
    const at = c.completedAt ?? c.updatedAt
    if (at && Date.parse(at) <= Date.parse(dayStart(addDays(c.day, 1)))) out.set(c.day, c)
  }
  return out
}

/** A condition of the next morning read from the evening before: present, absent, or null where that evening says nothing either way. A thing moves only the morning after it was present. */
function eveningThing(id: string, evenings: ReadonlyMap<string, CheckIn>, read: (c: CheckIn, day: string) => 'yes' | 'no' | null): Condition {
  return {
    id,
    blocks: ['morning'],
    stateOn: (day) => {
      const c = evenings.get(day)
      return c ? read(c, day) : null
    },
    moves: (state) => state === 'yes',
  }
}

/** One thing of last night as a condition of the next morning: present, absent, or null where the evening was not logged in full or never showed the thing. */
export function nightCondition(key: LastNightKey, r: ChallengerRecord): Condition {
  const isEvent = eventTest(key, r.contexts, r.eveningWorkouts, r.natureMoves)
  const known = knownTest(key, r.natureMoves)
  return eveningThing(nightId(key), eveningsKnown(r.checkins), (c) => (known && !known(c) ? null : isEvent(c) ? 'yes' : 'no'))
}

/** A private item as a condition of the next morning: marked or not at an evening check-in where it was on screen; anywhere else unknown. */
export function privateCondition(item: Pick<PrivateItem, 'id' | 'createdAt'> & { id: number }, r: ChallengerRecord): Condition {
  const logged = privateIsLogged(item.id)
  return eveningThing(privateId(item.id), eveningsKnown(r.checkins), (c) => (!privateShownAt(item, c) ? null : logged(c) ? 'yes' : 'no'))
}

/** The note of a check-in, or nothing. */
const noteOf = (c: CheckIn): string => (typeof c.extras?.note === 'string' ? c.extras.note.trim() : '')

/** The events of one type that may count: standing under the join, not marked wrong, on a check-in's note. */
const eventsOf = (r: ChallengerRecord, type: string): Noticed[] => (r.noticed ?? []).filter((n) => !n.wrong && n.checkinId !== null && n.type.id === type)

/** Whether an event was identified before a moment. A moment that cannot be read is never before. */
const identifiedBefore = (n: Noticed, moment: string): boolean => Date.parse(n.event.noticedAt) < Date.parse(moment)

/**
 * A type of note event as a condition of the next morning. It is known only at an evening check-in where a note was
 * written; there it is present when an event of the type sits on that note and was identified before the morning's
 * day began, and absent otherwise. An evening with no note is unknown, never "no".
 */
export function noticedCondition(type: string, r: ChallengerRecord): Condition {
  const events = eventsOf(r, type)
  return eveningThing(noticedId(type), eveningsKnown(r.checkins), (c, day) => {
    if (!noteOf(c)) return null
    const start = dayStart(addDays(day, 1))
    return events.some((n) => n.checkinId === c.id && identifiedBefore(n, start)) ? 'yes' : 'no'
  })
}

/** A candidate: its comparison for the next morning, and the condition it becomes when that comparison stands at a steady pattern. */
export interface Candidate {
  compared: Compared
  condition: () => Condition
}

/** The check-ins before the day of the run: an evening's outcome is the morning after it, so with only these, yesterday's evening has none yet. */
const beforeToday = (r: ChallengerRecord, today: string): CheckIn[] => r.checkins.filter((c) => c.day < today)

/** The things of last night, each with the sheet's own comparison for the next morning, over the days before `today` alone. */
export function nightCandidates(r: ChallengerRecord, today: string): { key: LastNightKey; compared: Compared }[] {
  const all = lastNightAssociations({ checkins: beforeToday(r, today), contexts: r.contexts, eveningWorkouts: r.eveningWorkouts, natureMoves: r.natureMoves }, today)
  return LAST_NIGHT_KEYS.filter((key) => !(r.hideFaith && key === 'churchDay')).flatMap((key) => {
    const compared = all[key].compared
    return compared ? [{ key, compared }] : []
  })
}

/** Each private item at the evening check-ins where it was on screen, against the next morning; none while the switch for private items is off. */
export function privateCandidates(r: ChallengerRecord, today: string): Candidate[] {
  if (!r.privateOn) return []
  const before = beforeToday(r, today)
  return (r.items ?? []).flatMap((it) => {
    if (it.id === undefined) return []
    const item = { ...it, id: it.id }
    const compared = associationFor(before, today, privateIsLogged(item.id), (c) => privateShownAt(item, c), { id: privateId(item.id), worth: WORTH_POINTS }).compared
    return compared ? [{ compared, condition: () => privateCondition(item, r) }] : []
  })
}

/**
 * The types of note event with enough standing events to compare, in the one list's order: at least five check-ins
 * hold one, as the pattern table counts, of those identified before `today` began. None while the switch for notes is
 * off.
 */
export function noticedTypes(r: ChallengerRecord, today: string): string[] {
  if (!r.notesOn) return []
  const start = dayStart(today)
  return eventTypes()
    .map((t) => t.id)
    .filter((type) => new Set(eventsOf(r, type).filter((n) => identifiedBefore(n, start)).map((n) => n.checkinId)).size >= NOTICED_MIN)
}

/** Each type of note event at the evening check-ins where a note was written, against the next morning, with the events identified before `today` began. */
export function noticedCandidates(r: ChallengerRecord, today: string): Candidate[] {
  const before = beforeToday(r, today)
  const start = dayStart(today)
  return noticedTypes(r, today).flatMap((type) => {
    const on = new Set(eventsOf(r, type).filter((n) => identifiedBefore(n, start)).map((n) => n.checkinId))
    const compared = associationFor(before, today, (c) => c.id !== undefined && on.has(c.id), (c) => noteOf(c) !== '', { id: noticedId(type), worth: WORTH_POINTS }).compared
    return compared ? [{ compared, condition: () => noticedCondition(type, r) }] : []
  })
}

/** Every candidate of a run, in the list's fixed order: the things of last night, the private items, the types of note event. */
export function candidatesFor(r: ChallengerRecord, today: string): Candidate[] {
  const night = nightCandidates(r, today).map((f): Candidate => ({ compared: f.compared, condition: () => nightCondition(f.key, r) }))
  return [...night, ...privateCandidates(r, today), ...noticedCandidates(r, today)]
}

/** The list for a run on `today`: the first two, then the candidates that stand at a steady pattern, one family, a few at most. */
export function conditionsFor(r: ChallengerRecord, today: string): Condition[] {
  const family = candidatesFor(r, today)
  const standing = new Set(kindsAtPattern(family.map((f) => f.compared)))
  return [sleepCondition(r.checkins), eveningCondition(r.checkins), ...family.filter((f) => standing.has(f.compared.id)).map((f) => f.condition())]
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
