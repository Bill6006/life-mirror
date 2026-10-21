import { likeForLikeMatched, type Association, type PrivateAssociation } from './associations'
import { copy } from './copy'
import { fill } from './format'
import type { LastNight } from './forecastFlow'

// The words of the record's own comparisons (2026-10-21, the owner's request before Item 3): a line says "started the same",
// "ended the same" or "like for like" only when a band both sides share holds an outcome on each, so the like-for-like
// difference exists. Otherwise it says what the record holds, and that nothing is set against it yet; "the first time
// recorded" only when it is. The strength stays as it is: these are associations, never a cause, capped at Promising.

const pct = (v: number | null) => (v === null ? '—' : String(Math.round(v)))

/** How many times before, said as a sentence starts it: Once, or 3 times (stage 1, item q). */
export const timesBefore = (n: number) => (n === 1 ? copy.extras.timesOnce : fill(copy.extras.timesN, { n: String(n) }))

/** An evening chip's answer at the check-in: the first time, no morning after yet, nothing yet to set it against, or like for like. */
export function chipAnswerWords(a: Association): string {
  if (a.times === 0) return copy.extras.chipFirst
  if (a.withEvent.mean === null) return fill(copy.extras.chipTimesNoNext, { times: timesBefore(a.times) })
  if (!likeForLikeMatched(a)) return fill(copy.extras.chipUnmatched, { times: timesBefore(a.times), mean: pct(a.withEvent.mean), k: String(a.withEvent.n) })
  return fill(copy.extras.chipTimes, { times: timesBefore(a.times), mean: pct(a.withEvent.mean), without: pct(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
}

/** Something sweet's answer: the evenings after afternoons that carried it, like for like only where afternoons started the same. */
export function sweetAnswerWords(a: Association): string {
  if (a.times === 0) return copy.extras.chipFirst
  if (a.withEvent.mean === null) return fill(copy.extras.sweetNoNext, { times: timesBefore(a.times) })
  if (!likeForLikeMatched(a)) return fill(copy.extras.sweetUnmatched, { times: timesBefore(a.times), mean: pct(a.withEvent.mean), k: String(a.withEvent.n) })
  return fill(copy.extras.sweetTimes, { times: timesBefore(a.times), mean: pct(a.withEvent.mean), without: pct(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
}

/** One of your own chips on Evidence. */
export function ownChipLine(label: string, a: Association): string {
  const c = copy.evidence
  const n = a.times === 1 ? c.oneEvening : fill(c.nEvenings, { n: String(a.times) })
  if (a.times === 0) return fill(c.ownNone, { label })
  if (a.withEvent.mean === null) return fill(c.ownNoNext, { label, n })
  if (!likeForLikeMatched(a)) return fill(c.ownUnmatched, { label, n, with: pct(a.withEvent.mean), k: String(a.withEvent.n) })
  return fill(c.ownLine, { label, n, with: pct(a.withEvent.mean), without: pct(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
}

/** A passive item's line on Evidence: the days it rode alongside and was done. */
export function passiveLineWords(a: Association, target: string): string {
  const c = copy.evidence
  if (!likeForLikeMatched(a)) return fill(c.passiveUnmatched, { n: String(a.times), target })
  return fill(c.passiveLine, { n: String(a.times), target, with: pct(a.withEvent.mean), without: pct(a.without.mean), k: String(a.withEvent.n), m: String(a.without.n) })
}

/** Cooling off on Evidence, with how long it ran. */
export function coolingLineWords(a: Association, duration: { blocks: number; events: number } | null): string {
  const c = copy.evidence
  const ran = { blocks: duration ? String(duration.blocks) : '—', events: String(duration?.events ?? 0) }
  if (!likeForLikeMatched(a)) return fill(c.coolingUnmatched, { n: String(a.times), ...ran })
  return fill(c.coolingLine, { n: String(a.times), with: pct(a.withEvent.mean), without: pct(a.without.mean), ...ran })
}

/** Big social days on Evidence. */
export function socialLineWords(a: Association): string {
  const c = copy.evidence
  if (!likeForLikeMatched(a)) return fill(c.socialUnmatched, { n: String(a.times) })
  return fill(c.socialLine, { n: String(a.times), with: pct(a.withEvent.mean), without: pct(a.without.mean) })
}

/** Heavy caffeine mornings, before amounts, on Evidence. */
export function caffeineLineWords(a: Association): string {
  const c = copy.evidence
  if (!likeForLikeMatched(a)) return fill(c.caffeineUnmatched, { n: String(a.times) })
  return fill(c.caffeineLine, { n: String(a.times), with: pct(a.withEvent.mean), without: pct(a.without.mean) })
}

/** Workout days, read from the other app, on Evidence. */
export function workoutLineWords(a: Association): string {
  const c = copy.evidence
  if (!likeForLikeMatched(a)) return fill(c.workoutUnmatched, { n: String(a.times) })
  return fill(c.workoutLine, { n: String(a.times), with: pct(a.withEvent.mean), without: pct(a.without.mean) })
}

/** Evening workouts on Evidence: the morning after and its sleep quality, said only when both compare like for like. */
export function eveningWorkoutWords(morning: Association, sleep: Association): string {
  const c = copy.evidence
  const n = morning.times === 1 ? c.oneEvening : fill(c.nEvenings, { n: String(morning.times) })
  if (!likeForLikeMatched(morning) || !likeForLikeMatched(sleep)) return fill(c.eveningWorkoutUnmatched, { n })
  return fill(c.eveningWorkoutLine, { n, with: pct(morning.withEvent.mean), without: pct(morning.without.mean), sleepWith: pct(sleep.withEvent.mean), sleepWithout: pct(sleep.without.mean) })
}

/** Hard sessions on Evidence: each measure against mornings after other days that ended the same, or not comparable yet; when none compares, nothing yet set against. */
export function hardWorkoutWords(times: number, measures: readonly { reading: string; diff: number | null }[]): string {
  const c = copy.evidence
  const n = times === 1 ? c.oneDay : fill(c.nDays, { n: String(times) })
  if (measures.every((m) => m.diff === null)) return fill(c.hardWorkoutUnmatched, { n })
  const list = measures.map((m) => fill(c.hardWorkoutItem, { reading: m.reading, diff: m.diff === null ? c.notComparable : `${m.diff > 0 ? '+' : ''}${Math.round(m.diff * 10) / 10}` })).join(', ')
  return fill(c.hardWorkoutLine, { n, list })
}

/** A private item on Evidence. */
export function privateLineWords(p: PrivateAssociation, alternative: string): string {
  const c = copy.evidence
  const a = p.association
  if (!likeForLikeMatched(a)) return fill(c.privateUnmatched[p.block], { name: p.name, alternative })
  return fill(c.privateLine[p.block], { name: p.name, with: pct(a.withEvent.mean), without: pct(a.without.mean), n: String(a.withEvent.n), m: String(a.without.n), alternative })
}

/** A private item on the move card at the check-in it is placed in. */
export function privateInlineWords(p: PrivateAssociation, alternative: string): string {
  const c = copy.move
  const a = p.association
  if (!likeForLikeMatched(a)) return fill(c.privateInlineUnmatched[p.block], { name: p.name, alternative })
  return fill(c.privateInline[p.block], { name: p.name, with: pct(a.withEvent.mean), without: pct(a.without.mean), n: String(a.withEvent.n), m: String(a.without.n), alternative })
}

/** The morning's last-night line: like for like only when it is; the first time only when it is; else how many so far, nothing yet set against. */
export function lastNightWords(ln: LastNight): string {
  const c = copy.brief
  const event = c.lastNightEvents[ln.key]
  if (ln.with !== null && ln.without !== null && ln.matched) return fill(c.lastNight, { event, with: pct(ln.with), without: pct(ln.without), n: String(ln.n) })
  return ln.n <= 1 ? fill(c.lastNightFirst, { event, n: String(ln.n) }) : fill(c.lastNightUnmatched, { event, n: String(ln.n) })
}
