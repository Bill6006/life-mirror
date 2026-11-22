import { addDays, BLOCKS } from './blocks'
import { fixtureCheckin } from './challengerTesting'
import { seeded } from './counted/compare'
import { weekdayOf } from './counted/occasions'
import type { CheckIn } from './db'
import type { Position } from './readings'

// A stand-in record for the level-plus-weekday way's tests (Stage A, 2026-11-21): two hundred days of three check-ins a
// day, each weekday at its own level (mood, Sunday first, at 4, 1, 2, 3, 3, 4 and 5 of 5, four points out of 100 a
// step), with a seeded wobble, so the way's test of the seven weekdays stands open from the record's fifth week and the
// way is in use from its ninth. With short nights, about a third of the nights are short and the day after reads two
// steps lower at every check-in, which the challenger can read. Seeded, so it is the same on every run. Stand-in answers.

export const RHYTHM_TODAY = '2026-11-23'
/** Mood's position by weekday, Sunday first. */
const BY_WEEKDAY = [4, 1, 2, 3, 3, 4, 5]

/** The days before `today`, oldest first, each check-in complete. */
export function rhythmCheckins(shortNights = false, days = 200, today: string = RHYTHM_TODAY): CheckIn[] {
  const next = seeded(13)
  const nights = Array.from({ length: days }, () => next() < 0.35)
  const rows: CheckIn[] = []
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i - days)
    const after = shortNights && i > 0 && nights[i - 1]
    for (const block of BLOCKS) {
      const r = next()
      const wobble = r < 0.15 ? -1 : r > 0.85 ? 1 : 0
      const mood = Math.max(1, Math.min(5, BY_WEEKDAY[weekdayOf(day)] + wobble - (after ? 2 : 0))) as Position
      rows.push(fixtureCheckin(day, block, mood, shortNights && nights[i] ? 1 : 4))
    }
  }
  return rows
}
