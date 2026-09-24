import { blockAt, type Block } from './blocks'
import type { OutsideDay } from './db'

// The other app's finished workouts, as the record reads them (Parts 33 and 35): when each ended,
// whether it was hard by your own rating or by how close to failure the working sets went, and the
// last one. Zero taps: everything here comes from the rows the other app already writes.

/** The block a session finished in; the small hours count to the evening before. */
export function sessionSlot(o: Pick<OutsideDay, 'at'>): { day: string; block: Block } | null {
  const t = Date.parse(o.at)
  return Number.isFinite(t) ? blockAt(new Date(t)) : null
}

/**
 * The days whose evening carried a workout: a session the other app finished in the evening block
 * (from 17:00, the small hours counting to the evening before), never a morning or afternoon one,
 * so a morning session is not told back as last night's (Part 33).
 */
export function eveningWorkoutDays(rows: readonly Pick<OutsideDay, 'at'>[]): Set<string> {
  const out = new Set<string>()
  for (const r of rows) {
    const slot = sessionSlot(r)
    if (slot?.block === 'evening') out.add(slot.day)
  }
  return out
}

/** The four readings a hard session is set against the next morning (Part 35). */
export const HARD_MEASURES = ['energy', 'mood', 'focus', 'stress'] as const
export type HardMeasure = (typeof HARD_MEASURES)[number]

/** Average reps in reserve at or under this, across the working sets that logged one, is close to failure. */
export const NEAR_FAILURE_RIR = 1

/** A hard session: rated too hard, or its working sets taken close to failure. A session with neither on record is not called hard. */
export function isHard(o: Pick<OutsideDay, 'effort' | 'avgRir'>): boolean {
  return o.effort === 'too-hard' || (typeof o.avgRir === 'number' && o.avgRir <= NEAR_FAILURE_RIR)
}

/** The days that held a hard session. */
export function hardDays(rows: readonly Pick<OutsideDay, 'day' | 'effort' | 'avgRir'>[]): Set<string> {
  return new Set(rows.filter(isHard).map((r) => r.day))
}

/** The latest finished session, or null. */
export function lastWorkout<T extends Pick<OutsideDay, 'at'>>(rows: readonly T[]): T | null {
  return [...rows].filter((r) => Number.isFinite(Date.parse(r.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null
}
