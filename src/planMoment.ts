import { addDays, blockAt } from './blocks'
import type { Cue, Intention, Offer } from './db'
import { CUES, latestPlans, type CueCount, type CueOffer } from './aims'
import { minutesOf } from './reminderRules'

// Timing (stage 3, group 2; designed 2026-10-17). A plan keeps its cue's own time; its reminder comes
// at the moment that commitment's steps have actually started after that cue, learned from the
// owner's own record, and never in the middle of a pickup. The Plan when chips come in the order
// the record keeps them.

/** Starts linked to plans at a cue, within the window, before a learned moment replaces the cue's own time. */
export const MOMENT_MIN_STARTS = 3
/** Days of record a learned moment and the chips' order read. */
export const MOMENT_WINDOW_DAYS = 60
/** Minutes after the pickup time before a reminder may come, until the record has its own moment: the builder's allowance for getting home. */
export const PICKUP_ALLOWANCE_MIN = 45

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function hhmmAt(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

/** Minutes after midnight, on the phone's own clock, of an instant. */
function localMinute(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Minutes from a cue's own time to the start its plan led to, over the plans at that cue started on
 * their own day within the window: for one commitment, or pooled over every commitment (aimId null).
 * Null until the record holds enough starts. A plan's time is always its cue's own; the moment it is
 * reminded at is apart, in remindAt.
 */
export function learnedDelay(intentions: readonly Intention[], offers: readonly Offer[], cue: Cue, aimId: number | null, today: string): number | null {
  const since = addDays(today, -MOMENT_WINDOW_DAYS)
  const byId = new Map(offers.map((o) => [o.id as number, o]))
  const delays: number[] = []
  for (const p of latestPlans(intentions)) {
    if (p.cue !== cue || p.day < since || p.day >= today || (aimId !== null && p.aimId !== aimId) || p.offerId === null) continue
    const o = byId.get(p.offerId)
    if (!o || o.day !== p.day) continue
    const delay = localMinute(o.at) - minutesOf(p.time)
    if (delay >= 0) delays.push(delay)
  }
  return delays.length >= MOMENT_MIN_STARTS ? median(delays) : null
}

/**
 * When a plan's reminder comes: the cue's own time plus the learned delay; with none learned, after
 * pickup the pickup time plus the allowance, else the cue's own time. Never before the cue's time,
 * never inside a pickup (from the pickup time to the end of the allowance), and never past the day.
 */
export function planMoment(cue: Cue, cueTime: string, pickup: string | null, delay: number | null): string {
  const at = minutesOf(cueTime)
  let m = at + (delay ?? (cue === 'afterPickup' ? PICKUP_ALLOWANCE_MIN : 0))
  if (pickup !== null) {
    const from = minutesOf(pickup)
    if (m >= from && m < from + PICKUP_ALLOWANCE_MIN) m = from + PICKUP_ALLOWANCE_MIN
  }
  return hhmmAt(Math.min(Math.max(m, at), 23 * 60 + 59))
}

/** The moment for a plan being made now: this commitment's own record first, then every commitment's, then the defaults. */
export function momentFor(intentions: readonly Intention[], offers: readonly Offer[], aimId: number, cue: Cue, cueTime: string, pickup: string | null, now: Date = new Date()): string {
  // The app's own day, as the plan is filed under: the small hours still belong to the evening before.
  const today = blockAt(now).day
  const delay = learnedDelay(intentions, offers, cue, aimId, today) ?? learnedDelay(intentions, offers, cue, null, today)
  return planMoment(cue, cueTime, pickup, delay)
}

/** A commitment's plans per cue within the window, the latest plan of each day alone, and how many led to a start. */
export function keptByCue(intentions: readonly Intention[], aimId: number, today: string): CueCount[] {
  const since = addDays(today, -MOMENT_WINDOW_DAYS)
  const counts = new Map<Cue, CueCount>()
  for (const p of latestPlans(intentions)) {
    if (p.aimId !== aimId || p.day < since || p.day >= today) continue
    const c = counts.get(p.cue) ?? { cue: p.cue, n: 0, started: 0 }
    c.n++
    if (p.offerId !== null) c.started++
    counts.set(p.cue, c)
  }
  return CUES.map((cue) => counts.get(cue)).filter((c): c is CueCount => c !== undefined)
}

/** The Plan when chips, most often kept first for this commitment in the window; ties keep the cues' own order. */
export function chipOrder(cues: readonly CueOffer[], kept: readonly CueCount[]): CueOffer[] {
  const started = (cue: Cue) => kept.find((k) => k.cue === cue)?.started ?? 0
  return [...cues].sort((a, b) => started(b.cue) - started(a.cue) || CUES.indexOf(a.cue) - CUES.indexOf(b.cue))
}
