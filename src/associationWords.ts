import { likeForLikeMatched, type Association, type PrivateAssociation } from './associations'
import { copy } from './copy'
import type { Standing, Stood } from './counted/compare'
import { standingInline, standingLine } from './counted/words'
import type { NightStanding } from './facts'
import { fill } from './format'
import type { LastNight } from './forecastFlow'
import type { NatureAssociations } from './nature'

// The words of the record's own comparisons, in one module since 2026-10-21. Under the one standard (2026-11-12) a
// line says a comparison's readings only where the comparison stands past too few in its family, and then with the
// like-for-like difference, the number its standing is about, and the standing's own words. Otherwise it says how
// many, and why no reading is said: too few to compare yet, or the comparison could not be worked out on this phone.
// These are associations, never a cause.

const pct = (v: number | null) => (v === null ? '—' : String(Math.round(v)))

/** Where each comparison stands in its family, by its id; null when the comparisons could not be worked out. */
export type Stands = ReadonlyMap<string, Stood> | null

/**
 * What a line may say of a comparison (the one standard, 2026-11-12): its reading only once the comparison is matched
 * and stands past too few; then the like-for-like difference, the number its standing is about, with the standing's
 * own words. Null: no reading is said.
 */
function standingClause(stood: Stands, id: string, a: Association, unit: 'points' | 'steps' = 'points', template: string = copy.evidence.standingClause): string | null {
  const s = stood?.get(id)
  if (!s || s.standing === 'tooFew' || !likeForLikeMatched(a) || a.diff === null) return null
  const size = unit === 'points' ? Math.round(Math.abs(a.diff)) : Math.round(Math.abs(a.diff) * 10) / 10
  const diff = size === 0 ? copy.evidence.standingSame : fill(copy.evidence.standingDiff, { size: `${size} ${size === 1 ? unit.slice(0, -1) : unit}`, dir: a.diff > 0 ? copy.evidence.higher : copy.evidence.lower })
  return fill(template, { diff, standing: standingInline(s) })
}

/**
 * Why a line says no reading: the comparisons could not be worked out on this phone (no family, or the comparison is
 * not in it), or there are too few to compare. No occasion on a side in a band both share is one kind of too few, and
 * a few matched occasions on each side is the other; one sentence is true of both.
 */
function whyUnsaid(stood: Stands, id: string): string {
  return stood === null || !stood.has(id) ? copy.evidence.unsaid.failed : copy.evidence.unsaid.tooFew
}

/** A comparison's own id in its family, where its caller named it. */
const idOf = (a: Association): string => a.compared?.id ?? ''

/** How many times before, said as a sentence starts it: Once, or 3 times (stage 1, item q). */
export const timesBefore = (n: number) => (n === 1 ? copy.extras.timesOnce : fill(copy.extras.timesN, { n: String(n) }))

/** An evening chip's answer at the check-in: the first time, no morning after yet, too few to compare, or the mornings after like for like with where the comparison stands. */
export function chipAnswerWords(a: Association, stood: Stands): string {
  const c = copy.extras
  if (a.times === 0) return c.chipFirst
  if (a.withEvent.mean === null) return fill(c.chipTimesNoNext, { times: timesBefore(a.times) })
  const standing = standingClause(stood, idOf(a), a)
  if (standing === null) return fill(c.chipUnmatched, { times: timesBefore(a.times), why: whyUnsaid(stood, idOf(a)) })
  return fill(c.chipTimes, { times: timesBefore(a.times), mean: pct(a.withEvent.mean), without: pct(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n), standing })
}

/** Something sweet's answer on an afternoon: the evenings after afternoons that carried it, like for like, with where the comparison stands. */
export function sweetAnswerWords(a: Association, stood: Stands): string {
  const c = copy.extras
  if (a.times === 0) return c.chipFirst
  if (a.withEvent.mean === null) return fill(c.sweetNoNext, { times: timesBefore(a.times) })
  const standing = standingClause(stood, idOf(a), a)
  if (standing === null) return fill(c.sweetUnmatched, { times: timesBefore(a.times), why: whyUnsaid(stood, idOf(a)) })
  return fill(c.sweetTimes, { times: timesBefore(a.times), mean: pct(a.withEvent.mean), without: pct(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n), standing })
}

/**
 * Time in nature's answer at the check-in: the evenings of its days, then the mornings after, each like for like on
 * the band before it and each said only where its own comparison stands past too few, as the sheet's facts say them.
 */
export function natureAnswerWords(n: NatureAssociations, stood: Stands): string {
  const c = copy.extras
  const times = Math.max(n.evening.times, n.morning.times)
  if (times === 0) return c.chipFirst
  const read = (a: Association) => ({ mean: pct(a.withEvent.mean), without: pct(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
  const e = n.evening
  const evening = standingClause(stood, idOf(e), e)
  const first =
    e.withEvent.mean === null
      ? fill(c.natureNoEvening, { times: timesBefore(times) })
      : evening === null
        ? fill(c.natureEveningUnmatched, { times: timesBefore(times), why: whyUnsaid(stood, idOf(e)) })
        : fill(c.natureEvening, { times: timesBefore(times), ...read(e), standing: evening })
  const m = n.morning
  const morning = standingClause(stood, idOf(m), m)
  return morning === null ? first : `${first} ${fill(c.natureMorning, { ...read(m), standing: morning })}`
}

/** One of your own chips on Evidence: its comparison is said only where it stands past too few among your own chips, their own family. */
export function ownChipLine(label: string, a: Association, stood: Stands, id: string): string {
  const c = copy.evidence
  const n = a.times === 1 ? c.oneEvening : fill(c.nEvenings, { n: String(a.times) })
  if (a.times === 0) return fill(c.ownNone, { label })
  if (a.withEvent.mean === null) return fill(c.ownNoNext, { label, n })
  const standing = standingClause(stood, `own.${id}`, a)
  if (standing === null) return fill(c.ownUnmatched, { label, n, why: whyUnsaid(stood, `own.${id}`) })
  return fill(c.ownLine, { label, n, with: pct(a.withEvent.mean), without: pct(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n), standing })
}

/** A passive item's line on Evidence: the days it rode alongside and was done. Its card says where it stands; too few, or the comparisons failed, says no reading. */
export function passiveLineWords(a: Association, target: string, standing: Standing, failed = false): string {
  const c = copy.evidence
  if (failed || !likeForLikeMatched(a) || standing === 'tooFew') return fill(c.passiveUnmatched, { n: String(a.times), why: failed ? c.unsaid.failed : c.unsaid.tooFew })
  return fill(c.passiveLine, { n: String(a.times), target, with: pct(a.withEvent.mean), without: pct(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
}

/** Cooling off on Evidence, with how long it ran. */
export function coolingLineWords(a: Association, duration: { blocks: number; events: number } | null, stood: Stands): string {
  const c = copy.evidence
  const count = (n: number, one: string, many: string) => (n === 1 ? one : fill(many, { n: String(n) }))
  const ran = { blocks: duration ? count(duration.blocks, c.oneBlock, c.nBlocks) : fill(c.nBlocks, { n: '—' }), events: count(duration?.events ?? 0, c.oneEvent, c.nEvents) }
  const standing = standingClause(stood, 'assoc.coolingOff', a)
  if (standing === null) return fill(c.coolingUnmatched, { n: String(a.times), why: whyUnsaid(stood, 'assoc.coolingOff'), ...ran })
  return fill(c.coolingLine, { n: String(a.times), with: pct(a.withEvent.mean), without: pct(a.without.mean), standing, ...ran })
}

/** Big social days on Evidence. */
export function socialLineWords(a: Association, stood: Stands): string {
  const c = copy.evidence
  const standing = standingClause(stood, 'assoc.bigSocial', a)
  if (standing === null) return fill(c.socialUnmatched, { n: String(a.times), why: whyUnsaid(stood, 'assoc.bigSocial') })
  return fill(c.socialLine, { n: String(a.times), with: pct(a.withEvent.mean), without: pct(a.without.mean), standing })
}

/** Heavy caffeine mornings, before amounts, on Evidence. */
export function caffeineLineWords(a: Association, stood: Stands): string {
  const c = copy.evidence
  const standing = standingClause(stood, 'assoc.heavyCaffeine', a)
  if (standing === null) return fill(c.caffeineUnmatched, { n: String(a.times), why: whyUnsaid(stood, 'assoc.heavyCaffeine') })
  return fill(c.caffeineLine, { n: String(a.times), with: pct(a.withEvent.mean), without: pct(a.without.mean), standing })
}

/** Workout days, read from the other app, on Evidence. */
export function workoutLineWords(a: Association, stood: Stands): string {
  const c = copy.evidence
  const standing = standingClause(stood, 'assoc.workouts', a)
  if (standing === null) return fill(c.workoutUnmatched, { n: String(a.times), why: whyUnsaid(stood, 'assoc.workouts') })
  return fill(c.workoutLine, { n: String(a.times), with: pct(a.withEvent.mean), without: pct(a.without.mean), standing })
}

/** Evening workouts on Evidence: the morning after and its sleep quality, said only when both stand past too few. */
export function eveningWorkoutWords(morning: Association, sleep: Association, stood: Stands): string {
  const c = copy.evidence
  const n = morning.times === 1 ? c.oneEvening : fill(c.nEvenings, { n: String(morning.times) })
  const [standing, slept] = [standingClause(stood, 'assoc.eveningWorkout', morning), standingClause(stood, 'assoc.eveningWorkout.sleep', sleep, 'points', c.standingSleep)]
  if (standing === null || slept === null) return fill(c.eveningWorkoutUnmatched, { n, why: whyUnsaid(stood, 'assoc.eveningWorkout') })
  return fill(c.eveningWorkoutLine, { n, with: pct(morning.withEvent.mean), without: pct(morning.without.mean), sleepWith: pct(sleep.withEvent.mean), sleepWithout: pct(sleep.without.mean), standing: `${standing}${slept}` })
}

/** Hard sessions on Evidence: each measure against mornings after other days that ended the same, or not comparable yet; when none stands past too few, no reading. */
export function hardWorkoutWords(times: number, measures: readonly { id: string; reading: string; diff: number | null }[], stood: Stands): string {
  const c = copy.evidence
  const n = times === 1 ? c.oneDay : fill(c.nDays, { n: String(times) })
  // A reading is said only where it stands past too few, with its standing beside it (the one standard, 2026-11-12).
  const at = (m: { id: string; diff: number | null }) => (m.diff === null ? undefined : stood?.get(`assoc.hardWorkout.${m.id}`))
  const speaks = (m: { id: string; diff: number | null }) => at(m) !== undefined && at(m)?.standing !== 'tooFew'
  if (!measures.some(speaks)) return fill(c.hardWorkoutUnmatched, { n, why: stood === null ? c.unsaid.failed : c.unsaid.tooFew })
  const list = measures.map((m) => fill(c.hardWorkoutItem, { reading: m.reading, diff: !speaks(m) || m.diff === null ? c.notComparable : `${m.diff > 0 ? '+' : ''}${Math.round(m.diff * 10) / 10} (${standingInline(at(m) as Stood)})` })).join(', ')
  return fill(c.hardWorkoutLine, { n, list })
}

/** A private item's comparison in the sheet's family, at the check-in it is placed in. */
const privateId = (p: PrivateAssociation): string => (p.block === 'evening' ? `private.${p.itemId}` : `private.${p.itemId}.${p.block}`)

/**
 * A private item on Evidence. `named`: "Show private items by name outside this screen" is on (Rule 11); off, the
 * line says "a private item" and never its name (2026-11-12). Every caller says which.
 */
export function privateLineWords(p: PrivateAssociation, alternative: string, named: boolean, stood: Stands): string {
  const c = copy.evidence
  const a = p.association
  const name = named ? p.name : c.privateUnnamed
  const standing = standingClause(stood, privateId(p), a)
  if (standing === null) return fill(c.privateUnmatched[p.block], { name, alternative, why: whyUnsaid(stood, privateId(p)) })
  return fill(c.privateLine[p.block], { name, with: pct(a.withEvent.mean), without: pct(a.without.mean), n: String(a.withEvent.n), m: String(a.without.n), alternative, standing })
}

/** A private item on the move card at the check-in it is placed in, as on Evidence: named only while the name switch is on, its readings said only with where the comparison stands. */
export function privateInlineWords(p: PrivateAssociation, alternative: string, named: boolean, stood: Stands): string {
  const c = copy.move
  const a = p.association
  const name = named ? p.name : c.privateUnnamed
  const standing = standingClause(stood, privateId(p), a)
  if (standing === null) return fill(c.privateInlineUnmatched[p.block], { name, alternative, why: whyUnsaid(stood, privateId(p)) })
  return fill(c.privateInline[p.block], { name, with: pct(a.withEvent.mean), without: pct(a.without.mean), n: String(a.withEvent.n), m: String(a.without.n), alternative, standing })
}

/**
 * The morning's last-night line (the one standard, 2026-11-12). What last night carried; then, once there is enough
 * to compare, how the mornings after evenings like it have read against the mornings after evenings that started the
 * same: the like-for-like difference, the number its standing is about, with the evenings on both sides and the
 * standing in the standard's own words. Too few, or the comparisons failed: how many evenings like it, and no reading.
 */
export function lastNightWords(ln: LastNight, night: NightStanding | null): string {
  const c = copy.brief
  const event = c.lastNightEvents[ln.key]
  // The comparisons failed on this phone: what it carried, and nothing of a reading.
  if (!night) return fill(c.lastNightOnly, { event })
  if (night.standing === 'tooFew' || night.diff === null) return ln.n <= 1 ? fill(c.lastNightFirst, { event, n: String(ln.n) }) : fill(c.lastNightTooFew, { event, n: String(ln.n) })
  const points = Math.round(Math.abs(night.diff))
  const said = { event, n: String(night.n), m: String(night.m), standing: standingLine(night) }
  return points === 0 ? fill(c.lastNightSame, said) : fill(c.lastNight, { ...said, points: `${points} ${points === 1 ? 'point' : 'points'}`, dir: night.diff > 0 ? c.higher : c.lower })
}
