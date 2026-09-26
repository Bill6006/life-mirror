import { dayKey } from './blocks'

// The other app's finished workouts as this app reads them, kept apart from the phone's database so
// the Worker's sanity report reads a row the one way the phone does (the final checklist, item 4).

/** The other app of yours that writes to the same database; this app reads its finished workouts and writes none of its rows. */
export const OUTSIDE_APP = 'workout-conductor'
export const OUTSIDE_STORE = 'workouts'

/** One finished session as this app reads it. */
export interface OutsideSession {
  day: string
  /** Minutes the session ran, when the record says. */
  minutes: number | null
  /** When it finished. */
  at: string
  source: 'workout'
  /** Part 35, read from the same row, each only when the row holds it: when it began. */
  startedAt?: string
  /** Its type, as the other app titles it: Push + arms, Lower body and so on. */
  title?: string
  endedEarly?: boolean
  /** Working sets done: warm-ups and sets left undone are not counted. */
  workingSets?: number
  /** Your rating afterwards, when you gave one: the effort, and your energy from 1 to 5. */
  effort?: 'too-easy' | 'right' | 'too-hard'
  energyAfter?: number
  /** Reps in reserve, averaged over the working sets that logged one. */
  avgRir?: number
  /** An older session brought in by the other app's import, not logged live. */
  imported?: boolean
}

/**
 * What an outside workout row says: its local day from the completion time, its minutes, and since
 * Part 35 the detail the other app keeps: when it began, its type, whether it ended early, the
 * working sets done, your rating afterwards and the reps in reserve. Anything a row lacks or holds
 * in another shape is left out, never guessed; a row that cannot be read at all is no session.
 */
export function outsideDayOf(body: string): OutsideSession | null {
  try {
    const r = JSON.parse(body) as Record<string, unknown>
    if (typeof r.completedAt !== 'string' || !r.completedAt) return null
    const at = new Date(r.completedAt)
    if (Number.isNaN(at.getTime())) return null
    const minutes = typeof r.elapsedSeconds === 'number' && r.elapsedSeconds > 0 ? Math.round(r.elapsedSeconds / 60) : null
    const sets = (Array.isArray(r.entries) ? r.entries : []).flatMap((e) => (e && typeof e === 'object' && Array.isArray((e as { sets?: unknown }).sets) ? ((e as { sets: unknown[] }).sets as Record<string, unknown>[]) : []))
    const working = sets.filter((s) => s && s.kind === 'working' && s.completed !== false)
    const rirs = working.map((s) => s.rir).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    const rating = r.rating && typeof r.rating === 'object' ? (r.rating as Record<string, unknown>) : null
    const effort = rating && (rating.effort === 'too-easy' || rating.effort === 'right' || rating.effort === 'too-hard') ? rating.effort : null
    const energy = rating && typeof rating.energyAfter === 'number' && rating.energyAfter >= 1 && rating.energyAfter <= 5 ? rating.energyAfter : null
    return {
      day: dayKey(at),
      minutes,
      at: r.completedAt,
      source: 'workout',
      ...(typeof r.startedAt === 'string' && Number.isFinite(Date.parse(r.startedAt)) ? { startedAt: r.startedAt } : {}),
      ...(typeof r.title === 'string' && r.title.trim() ? { title: r.title.trim().slice(0, 60) } : {}),
      ...(typeof r.endedEarly === 'boolean' ? { endedEarly: r.endedEarly } : {}),
      ...(Array.isArray(r.entries) ? { workingSets: working.length } : {}),
      ...(effort ? { effort } : {}),
      ...(energy !== null ? { energyAfter: energy } : {}),
      ...(rirs.length ? { avgRir: Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 } : {}),
      ...(r.source === 'legacy-import' ? { imported: true } : {}),
    }
  } catch {
    return null
  }
}
