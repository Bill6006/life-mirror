import type { Block } from '../blocks'
import type { CheckIn, DayContext, Extras, Offer, Outcome } from '../db'
import type { Answers, Position } from '../readings'
import type { CountedInput } from './kinds'

// Stand-in records for the counted foundation's tests. Imported by tests alone.

const SIX = ['mood', 'energy', 'focus', 'stress', 'overwhelm', 'irritation']
const HOUR: Record<Block, number> = { morning: 8, afternoon: 13, evening: 20 }

/** Day n counted from Thursday 2026-01-01, as it is filed. */
export const day = (n: number): string => {
  const d = new Date(2026, 0, 1 + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A moment by the test machine's own clock, so every rule about the day's start holds in any zone. */
export const at = (n: number, hour: number, minute = 0): string => new Date(2026, 0, 1 + n, hour, minute).toISOString()

/** A complete check-in whose six readings all sit at one level: level 1 reads 0 out of 100, 2 reads 25, 3 reads 50, 4 reads 75 and 5 reads 100. */
export function checkin(n: number, block: Block, over: { level?: number; extras?: Extras; answers?: Answers; completed?: string | null; asked?: string[] } = {}): CheckIn {
  const level = (over.level ?? 3) as Position
  // The three readings where lower is better are answered the other way round, so the reading out of 100 follows `level`.
  const answers: Answers = { mood: level, energy: level, focus: level, stress: (6 - level) as Position, overwhelm: (6 - level) as Position, irritation: (6 - level) as Position, ...(over.answers ?? {}) }
  const completed = over.completed === undefined ? at(n, HOUR[block]) : over.completed
  return { day: day(n), block, asked: over.asked ?? [...SIX, ...Object.keys(over.answers ?? {}).filter((k) => !SIX.includes(k))], startedAt: at(n, HOUR[block] - 1), completedAt: completed, updatedAt: completed ?? at(n, HOUR[block]), answers, activeMs: 1000, ...(over.extras ? { extras: over.extras } : {}) }
}

export const context = (n: number, over: Partial<DayContext> = {}): DayContext => ({ day: day(n), weekday: new Date(2026, 0, 1 + n).getDay(), withHer: true, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '08:00', ...over }) as DayContext

export const offer = (id: number, n: number, moveId: string, over: Partial<Offer> = {}): Offer => ({ id, kind: 'block', day: day(n), block: 'morning', moveId, ...over }) as Offer

export const outcome = (offerId: number, n: number, moveId: string, result: Outcome['outcome']): Outcome => ({ offerId, moveId, day: day(n), block: 'morning', at: at(n, 12), outcome: result, why: null, passiveOutcome: null }) as Outcome

export const input = (over: Partial<CountedInput> = {}): CountedInput => ({ checkins: [], contexts: [], items: [], chips: [], offers: [], outcomes: [], workoutDays: [], ...over })
