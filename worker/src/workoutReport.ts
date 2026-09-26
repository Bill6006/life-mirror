import type { FactSheet } from '../../src/factTypes'
import { outsideDayOf } from '../../src/outsideRow'

// The final checklist, item 4: is the other app's session still reaching this app as Part 35 reads
// it? The latest finished workouts in the database, read through the phone's own row reader, and
// the workout facts on the newest sheet. Dates, the fields each session holds, and counts: never a
// title, a rating's value or anything else in the owner's words.

export interface WorkoutRow {
  id: string
  body: string | null
}

/** The sheet's facts the workout comparisons stand on (Part 35). */
const WORKOUT_FACT = /^(workout\.last|outside\.7d|assoc\.workouts|assoc\.eveningWorkout|assoc\.eveningWorkout\.sleep|assoc\.hardWorkout)$/

export function workoutReport(rows: readonly WorkoutRow[], sheet: FactSheet | null) {
  const read = rows.filter((r) => r.body).map((r) => outsideDayOf(r.body as string))
  const sessions = read.filter((d): d is NonNullable<typeof d> => d !== null).sort((a, b) => (a.at < b.at ? 1 : -1))
  return {
    rowsRead: rows.length,
    unreadable: read.filter((d) => d === null).length,
    latest: sessions[0]?.day ?? null,
    sessions: sessions.slice(0, 10).map((d) => ({
      day: d.day,
      minutes: d.minutes !== null,
      startedAt: d.startedAt !== undefined,
      type: d.title !== undefined,
      endedEarly: d.endedEarly !== undefined,
      workingSets: d.workingSets ?? null,
      effort: d.effort !== undefined,
      energyAfter: d.energyAfter !== undefined,
      reserve: d.avgRir !== undefined,
      imported: d.imported === true,
    })),
    sheet: sheet?.day ?? null,
    facts: (sheet?.facts ?? []).filter((f) => WORKOUT_FACT.test(f.id)).map((f) => ({ id: f.id, n: f.n ?? null, tier: f.tier ?? null, fields: Object.keys(f.values).sort() })),
  }
}
