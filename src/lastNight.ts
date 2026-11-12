import { associationFor, type Association } from './associations'
import { chipShownAt } from './chips'
import { churchIn } from './church'
import { WORTH_POINTS } from './counted/compare'
import type { CheckIn, DayContext } from './db'
import { natureEvening, natureKnown } from './nature'
import { necessitiesMissed } from './necessities'

// What an evening can carry that the record sets the next morning against (the brief's last-night line), kept in
// one place since 2026-11-12: the twelve things, how each is read from an evening, where the record can speak for
// it, and its comparison's id in the sheet's family. Each is one comparison of the morning after, like for like on
// the evening's band. Six are the sheet's own comparisons and carry the sheet's ids; six are said nowhere but in the
// last-night line. All twelve are members of the sheet's family every day, whichever of them last night carried, so
// the line and the sheet give one standing for one thing.

export type LastNightKey = 'dinner' | 'caffeine' | 'coolingOff' | 'bigSocial' | 'napped' | 'nature' | 'sweet' | 'nothingLanded' | 'hardToSeePoint' | 'necessity' | 'churchDay' | 'workout'

export const LAST_NIGHT_KEYS: readonly LastNightKey[] = ['dinner', 'caffeine', 'coolingOff', 'bigSocial', 'napped', 'nature', 'sweet', 'nothingLanded', 'hardToSeePoint', 'necessity', 'churchDay', 'workout']

/** Each thing's comparison in the sheet's family. The sheet's own id where the sheet already says it. */
export const LAST_NIGHT_IDS: Readonly<Record<LastNightKey, string>> = {
  dinner: 'assoc.dinner',
  caffeine: 'assoc.caffeine.evening',
  coolingOff: 'assoc.coolingOff',
  bigSocial: 'assoc.bigSocial',
  napped: 'assoc.napped',
  nature: 'assoc.nature.morning',
  sweet: 'assoc.sweet.evening',
  nothingLanded: 'assoc.nothingLanded',
  hardToSeePoint: 'assoc.hardToSeePoint',
  necessity: 'assoc.necessity',
  churchDay: 'assoc.churchDay',
  workout: 'assoc.eveningWorkout',
}

/** What yesterday's evening carried that the record can set this morning against: its extras and chips, a necessity missed, the church day, a workout finished that evening. */
export function lastNightKeys(evening: CheckIn | undefined, ctx: DayContext | undefined, workout: boolean, natureDay = false): LastNightKey[] {
  const ex = evening?.extras ?? {}
  const keys: LastNightKey[] = []
  if (ex.dinner) keys.push('dinner')
  if (ex.caffeine || ex.caffeineIntake) keys.push('caffeine')
  if (ex.coolingOff) keys.push('coolingOff')
  if (ex.bigSocial) keys.push('bigSocial')
  if (ex.napped) keys.push('napped')
  if (ex.nature || natureDay) keys.push('nature')
  if (ex.sweet) keys.push('sweet')
  if (ex.nothingLanded) keys.push('nothingLanded')
  if (ex.hardToSeePoint) keys.push('hardToSeePoint')
  if (necessitiesMissed(ex).length) keys.push('necessity')
  // Item 3: a day with church on the schedule that evening, the Third Day's included; the schedule, never attendance.
  if (ctx?.churchDay || churchIn(ctx, 'evening')) keys.push('churchDay')
  if (workout) keys.push('workout')
  return keys
}

/** The evening test for a key: what the evening record says, or what its day's context and the evening workouts say. */
export function eventTest(key: LastNightKey, ctxByDay: ReadonlyMap<string, DayContext>, outside: ReadonlySet<string>, natureMoves: ReadonlySet<string>): (c: CheckIn) => boolean {
  switch (key) {
    case 'nature':
      return (c) => natureEvening(c, natureMoves)
    case 'necessity':
      return (c) => necessitiesMissed(c.extras).length > 0
    case 'churchDay':
      return (c) => Boolean(ctxByDay.get(c.day)?.churchDay) || churchIn(ctxByDay.get(c.day), 'evening')
    case 'workout':
      return (c) => outside.has(c.day)
    case 'caffeine':
      return (c) => Boolean(c.extras?.caffeine || c.extras?.caffeineIntake)
    default:
      return (c) => Boolean(c.extras?.[key])
  }
}

/** Where the record can speak for a key either way; undefined where every evening logged can. An evening it cannot speak for enters neither side. */
export function knownTest(key: LastNightKey, natureMoves: ReadonlySet<string>): ((c: CheckIn) => boolean) | undefined {
  // Caffeine is set only against evenings where the item was seen and left: an evening nobody saw it enters neither side (Part 22).
  if (key === 'caffeine') return (c) => Boolean(c.extras?.caffeine || c.extras?.caffeineIntake || c.extras?.caffeineShown)
  // Time in nature (item 2 of 4): from its start, where the chip was shown or a move in nature says the day.
  if (key === 'nature') return (c) => natureKnown(c, natureMoves)
  // A chip from stage 3, item 5, likewise: only evenings that showed it (Rule 2).
  if (key === 'sweet') return (c) => chipShownAt(key, c)
  return undefined
}

/** What the twelve comparisons read. */
export interface NightRecord {
  checkins: readonly CheckIn[]
  contexts: ReadonlyMap<string, DayContext>
  /** The days a workout was finished in the evening. */
  eveningWorkouts: ReadonlySet<string>
  natureMoves: ReadonlySet<string>
}

/** Each of the twelve as its named comparison: the morning after evenings that carried it, against the mornings after evenings that started the same. */
export function lastNightAssociations(r: NightRecord, today: string): Record<LastNightKey, Association> {
  const one = (key: LastNightKey): Association => associationFor(r.checkins, today, eventTest(key, r.contexts, r.eveningWorkouts, r.natureMoves), knownTest(key, r.natureMoves), { id: LAST_NIGHT_IDS[key], worth: WORTH_POINTS })
  return Object.fromEntries(LAST_NIGHT_KEYS.map((key) => [key, one(key)])) as Record<LastNightKey, Association>
}
