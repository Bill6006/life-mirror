import { addDays, BLOCKS } from './blocks'
import { seeded } from './counted/compare'
import type { CheckIn } from './db'
import type { NoteEvent } from './noteEvents/shared'
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

/** A stand-in private item, with a name no record holds. */
export const FIXTURE_ITEM = { id: 41, name: 'Stand-in private item', createdAt: '2026-01-01T00:00:00.000Z' }
/** A type of note event from the one list, and words its stand-in notes hold. */
export const FIXTURE_TYPE = 'raised-voice'
export const FIXTURE_QUOTE = 'raised my voice'

/**
 * A hundred and sixty days in which the stand-in private item, marked at the evening check-in where it is always on screen,
 * lowers the next morning's mood and focus, and a note event of one type, on about four in ten of the evenings with a note,
 * lowers its energy and raises its stress; the two independent. Each event is identified that same evening. The last evening
 * carries both. Check-ins are numbered from 1.
 */
export function fixtureItemAndNotes(days = 160, today: string = FIXTURE_TODAY): { checkins: CheckIn[]; events: NoteEvent[] } {
  const next = seeded(11)
  const last = days - 1
  const item = Array.from({ length: days }, (_, i) => i === last || next() < 0.4)
  const noted = Array.from({ length: days }, (_, i) => i === last || next() < 0.75)
  const event = noted.map((n, i) => n && (i === last || next() < 0.4))
  const checkins: CheckIn[] = []
  const events: NoteEvent[] = []
  let id = 1
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i - days)
    const morning = fixtureCheckin(day, 'morning', (i > 0 && item[i - 1] ? 1 : 5) as Position, 4)
    morning.answers.focus = (i > 0 && item[i - 1] ? 1 : 5) as Position
    morning.answers.energy = (i > 0 && event[i - 1] ? 1 : 5) as Position
    morning.answers.stress = (i > 0 && event[i - 1] ? 5 : 1) as Position
    checkins.push({ ...morning, id: id++ })
    const eid = id++
    const key = String(FIXTURE_ITEM.id)
    const note = noted[i] ? { note: event[i] ? `Today I ${FIXTURE_QUOTE} at work.` : 'A quiet evening.' } : {}
    checkins.push({ ...fixtureCheckin(day, 'evening', 3), id: eid, extras: { privateShown: { [key]: true }, ...(item[i] ? { private: { [key]: true } } : {}), ...note } })
    if (event[i]) events.push({ id: `ev-${eid}`, type: FIXTURE_TYPE, note: { store: 'checkins', id: String(eid), day, block: 'evening' }, quote: FIXTURE_QUOTE, noticedAt: new Date(`${day}T21:00:00`).toISOString(), method: 'stand-in' })
  }
  return { checkins, events }
}
