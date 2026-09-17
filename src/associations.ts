import { addDays, daysBetween } from './blocks'
import { hasMove, moveById } from './catalogue'
import type { CheckIn, Offer, Outcome } from './db'
import { forecast, indexCheckIns, slotKey } from './learning'
import { bandOf, pointsFor, readingOf, type Band } from './score'
import type { Position, ReadingId } from './readings'

// Observational associations, all like-for-like: the mornings after evenings that carried an
// event, against the mornings after evenings that started the same, headroom accounted for by
// matching on the evening's band. Always an association, never a cause; counts, never streaks;
// capped at Promising.

export const LIKE_FOR_LIKE_MIN = 3

export interface DayPoint {
  day: string
  band: Band | null
  event: boolean
  /** What the next morning read, out of 100, or null when not logged. */
  outcome: number | null
}

export interface Association {
  /** Evenings before today that carried the event. */
  times: number
  withEvent: { mean: number | null; n: number }
  without: { mean: number | null; n: number }
  /** With minus without, within matched bands; null when nothing can be compared. */
  diff: number | null
  /** How many matched bands the difference rests on; zero means an unmatched comparison. */
  bands: number
}

function meanOf(values: readonly number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

/** The like-for-like comparison: within each evening band present on both sides, with minus without, weighted by the smaller side. */
export function likeForLike(points: readonly DayPoint[]): Association {
  const withEvent = points.filter((p) => p.event)
  const without = points.filter((p) => !p.event)
  const withValues = withEvent.map((p) => p.outcome).filter((v): v is number => v !== null)
  const withoutValues = without.map((p) => p.outcome).filter((v): v is number => v !== null)
  let diffSum = 0
  let weightSum = 0
  let bands = 0
  for (const band of ['empty', 'wornDown', 'gettingBy', 'solid', 'firing'] as Band[]) {
    const a = withEvent.filter((p) => p.band === band && p.outcome !== null).map((p) => p.outcome as number)
    const b = without.filter((p) => p.band === band && p.outcome !== null).map((p) => p.outcome as number)
    if (!a.length || !b.length) continue
    const w = Math.min(a.length, b.length)
    diffSum += w * ((meanOf(a) as number) - (meanOf(b) as number))
    weightSum += w
    bands++
  }
  const diff = weightSum > 0 ? diffSum / weightSum : null
  return { times: withEvent.length, withEvent: { mean: meanOf(withValues), n: withValues.length }, without: { mean: meanOf(withoutValues), n: withoutValues.length }, diff, bands }
}

/** The evening's band on a day, from its reading out of 100; null when the evening was not logged in full. */
export function eveningBand(byKey: ReadonlyMap<string, CheckIn>, day: string): Band | null {
  const c = byKey.get(slotKey(day, 'evening'))
  const r = c ? readingOf(c) : null
  return r ? bandOf(r.value) : null
}

/** What the morning after read, out of 100. */
export function morningAfter(byKey: ReadonlyMap<string, CheckIn>, day: string): number | null {
  const c = byKey.get(slotKey(addDays(day, 1), 'morning'))
  const r = c ? readingOf(c) : null
  return r ? r.value : null
}

/** Every evening before today as a point: whether it carried the event, its band, and the morning after. */
export function eveningPoints(checkins: readonly CheckIn[], today: string, isEvent: (c: CheckIn) => boolean): DayPoint[] {
  const byKey = indexCheckIns(checkins)
  const evenings = checkins.filter((c) => c.block === 'evening' && c.day < today)
  return evenings.map((c) => ({ day: c.day, band: eveningBand(byKey, c.day), event: isEvent(c), outcome: morningAfter(byKey, c.day) }))
}

export function associationFor(checkins: readonly CheckIn[], today: string, isEvent: (c: CheckIn) => boolean): Association {
  return likeForLike(eveningPoints(checkins, today, isEvent))
}

export type AssociationTier = 'little' | 'unclear' | 'promising'

/**
 * An observational association's standing: Little evidence under three events or with nothing
 * to set against; Promising when the like-for-like difference clears the worthwhile change in
 * the helpful direction; Unclear otherwise. Never above Promising, never a verdict.
 */
export function associationTier(a: Association, worthwhilePoints: number): AssociationTier {
  if (a.times < LIKE_FOR_LIKE_MIN || a.diff === null || a.bands === 0) return 'little'
  return a.diff >= worthwhilePoints ? 'promising' : 'unclear'
}

/**
 * A passive item, like for like: the days it rode alongside and was done, against the days it
 * was not (never assigned, or assigned and declined), matched on the evening's band; the
 * outcome is the card's target reading the next morning, in points. A day it was assigned but
 * never answered is left out: silence is not evidence.
 */
export function passiveAssociation(checkins: readonly CheckIn[], offers: readonly Offer[], outcomes: readonly Outcome[], passiveId: string, target: ReadingId, today: string): Association {
  const byKey = indexCheckIns(checkins)
  const byOffer = new Map(outcomes.map((x) => [x.offerId, x]))
  const state = new Map<string, 'done' | 'no' | 'unanswered'>()
  for (const o of offers) {
    if (o.passiveId !== passiveId || o.id === undefined || o.skippedAt) continue
    const x = byOffer.get(o.id)
    const s = x?.passiveOutcome === 'done' ? 'done' : x?.passiveOutcome === 'no' ? 'no' : 'unanswered'
    const prev = state.get(o.day)
    state.set(o.day, prev === 'done' || s === 'done' ? 'done' : prev === 'no' || s === 'no' ? 'no' : 'unanswered')
  }
  const points: DayPoint[] = []
  for (const c of checkins) {
    if (c.block !== 'evening' || c.day >= today) continue
    const s = state.get(c.day)
    if (s === 'unanswered') continue
    const p = byKey.get(slotKey(addDays(c.day, 1), 'morning'))?.answers[target]
    points.push({ day: c.day, band: eveningBand(byKey, c.day), event: s === 'done', outcome: p === undefined ? null : pointsFor(target, p as Position) })
  }
  return likeForLike(points)
}

/** A named private item: logged on the evening or not. */
export function privateIsLogged(itemId: number): (c: CheckIn) => boolean {
  return (c) => Boolean(c.extras?.private?.[String(itemId)])
}

export interface PrivateAssociation {
  itemId: number
  name: string
  association: Association
  /** A move from the ending or rest families the record can offer in its place: never "don't". */
  alternativeId: string
}

export const PRIVATE_ALTERNATIVES: readonly string[] = ['warm-shower-bath', 'book-page', 'screen-free-half-hour', 'music-on-purpose']

/**
 * Private items in selection, only when you turn that on: like-for-like against evenings that
 * started the same, the window that night's sleep and the next morning; each carries an
 * alternative. Off, this returns nothing at all.
 */
export function privateAssociations(on: boolean, items: readonly { id?: number; name: string }[], checkins: readonly CheckIn[], today: string): PrivateAssociation[] {
  if (!on) return []
  return items
    .filter((it) => it.id !== undefined)
    .map((it, i) => ({
      itemId: it.id as number,
      name: it.name,
      association: associationFor(checkins, today, privateIsLogged(it.id as number)),
      alternativeId: PRIVATE_ALTERNATIVES.filter(hasMove)[i % PRIVATE_ALTERNATIVES.filter(hasMove).length],
    }))
    .filter((a) => a.association.times > 0)
}

/**
 * How long cooling off takes: after an evening marked as a cooling-off event, how many blocks
 * the reading stayed more than five points under its own forecast, up to six. You never log
 * the duration; the readings say it.
 */
export function coolingOffDuration(checkins: readonly CheckIn[], today: string): { blocks: number; events: number } | null {
  const byKey = indexCheckIns(checkins)
  const events = checkins.filter((c) => c.block === 'evening' && c.day < today && c.extras?.coolingOff)
  const lengths: number[] = []
  for (const e of events) {
    let blocks = 0
    const slots: { day: string; block: 'morning' | 'afternoon' | 'evening' }[] = []
    for (let d = 1; d <= 2; d++) for (const b of ['morning', 'afternoon', 'evening'] as const) slots.push({ day: addDays(e.day, d), block: b })
    for (const s of slots) {
      const c = byKey.get(slotKey(s.day, s.block))
      const r = c ? readingOf(c) : null
      if (!r) break
      // The forecast for the reading out of 100: the mean of the six ingredients' forecasts, in points.
      let expected = 0
      let counted = 0
      for (const id of ['mood', 'energy', 'focus', 'stress', 'overwhelm', 'irritation'] as const) {
        const f = forecast(byKey, s.day, s.block, id)
        if (f === null) continue
        const points = (f - 1) * 25
        expected += id === 'stress' || id === 'overwhelm' || id === 'irritation' ? 100 - points : points
        counted++
      }
      if (counted < 6) break
      if (r.value < expected / 6 - 5) blocks++
      else break
    }
    lengths.push(blocks)
  }
  if (!lengths.length) return null
  return { blocks: Math.round((lengths.reduce((s, v) => s + v, 0) / lengths.length) * 10) / 10, events: lengths.length }
}

/** What brings you back: the moves done in the day before a Resume that followed three or more days away from that aim. */
export function whatBringsYouBack(offers: readonly Offer[], outcomes: readonly Outcome[]): { moveId: string; n: number }[] {
  const steps = offers.filter((o) => o.kind === 'step' && !o.skippedAt).sort((a, b) => (a.at < b.at ? -1 : 1))
  const done = new Set(outcomes.filter((x) => x.outcome === 'done').map((x) => x.offerId))
  const counts = new Map<string, number>()
  const lastByAim = new Map<string, string>()
  for (const s of steps) {
    const prev = lastByAim.get(s.situationKey)
    lastByAim.set(s.situationKey, s.day)
    if (!prev || daysBetween(prev, s.day) < 3) continue
    const before = addDays(s.day, -1)
    for (const o of offers) {
      if (o.id === undefined || o.kind === 'step' || o.kind === 'unblock' || !hasMove(o.moveId) || !done.has(o.id)) continue
      if (o.day !== before && o.day !== s.day) continue
      if (o.day === s.day && o.at >= s.at) continue
      counts.set(o.moveId, (counts.get(o.moveId) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([moveId, n]) => ({ moveId, n }))
    .filter((r) => hasMove(r.moveId) && moveById(r.moveId))
    .sort((a, b) => b.n - a.n)
}
