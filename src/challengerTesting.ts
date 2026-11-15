import { addDays, BLOCKS } from './blocks'
import { seeded } from './counted/compare'
import type { CheckIn } from './db'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

// A stand-in record for the forecast writer's tests (2026-11-14): seventy days of three check-ins a day in which the
// day after a short night reads lower. Seeded, so it is the same on every run. Stand-in answers only.

export const FIXTURE_TODAY = '2026-09-18'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))

/** One complete check-in with every reading at its middle phrase, mood at the one given, and, in the morning, sleep hours as given. */
export function fixtureCheckin(day: string, block: CheckIn['block'], mood: Position, sleepHours?: Position): CheckIn {
  const at = new Date(`${day}T${block === 'morning' ? '07' : block === 'afternoon' ? '13' : '19'}:30:00`).toISOString()
  const ids = blockReadings(block)
  const answers: Answers = { ...allAt(ids, 3), mood }
  if (block === 'morning' && sleepHours !== undefined && ids.includes('sleepHours')) answers.sleepHours = sleepHours
  return { day, block, asked: [...ids], answers, startedAt: at, completedAt: at, updatedAt: at, activeMs: 30_000 }
}

/** The days before `today`, oldest first: a short night on about a third of them, and the day after one reading lower at every check-in. */
export function fixtureCheckins(days = 70, today: string = FIXTURE_TODAY): CheckIn[] {
  const next = seeded(7)
  const short = Array.from({ length: days }, () => next() < 0.35)
  const rows: CheckIn[] = []
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i - days)
    const after = i > 0 && short[i - 1]
    for (const block of BLOCKS) {
      const wobble = next() < 0.2 ? 1 : 0
      rows.push(fixtureCheckin(day, block, ((after ? 2 : 4) - wobble) as Position, short[i] ? 1 : 4))
    }
  }
  return rows
}

/** Whether the last day of the fixture reported a short night: what today's rows are adjusted by. */
export function fixtureShortLastNight(days = 70): boolean {
  const next = seeded(7)
  return Array.from({ length: days }, () => next() < 0.35)[days - 1]
}
