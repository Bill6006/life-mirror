import { privateShownAt } from '../associations'
import { EVENING_READINGS } from '../beforeDays'
import type { Block } from '../blocks'
import { dayCaffeine } from '../caffeineRecord'
import { hasMove, moveById } from '../catalogue'
import { chipShownAt } from '../chips'
import type { CheckIn, DayContext, Offer, Outcome, PrivateItem } from '../db'
import { contextFlags, type HonestyContext } from '../honesty/contexts'
import { NATURE_EVENT, NATURE_SINCE, natureEvening, natureKnown, natureMoveDays } from '../nature'
import { necessitiesMissed, teethOf } from '../necessities'
import { ownShownAt } from '../ownChips'
import { readingById } from '../readings'
import type { OwnChip } from '../settings'
import { type Days, type Occasion, weekdayOf } from './occasions'

// The one list of what the record can count (the counted foundation, 2026-11-12; in shadow: nothing reads it yet).
// A kind is a thing that did or did not happen at a check-in or on a day: a chip, a private item, a short night, a
// move done. Each says where the record can speak for it at all: an occasion where it was never on screen, or a day
// the record holds nothing for, is unknown, never "no", and enters no count. The labels are the app's own words
// wherever a screen already has them.

/** The switch a kind is read under: one of the retrieval layer's own categories. */
export type KindCategory = 'dayRecord' | 'privateItems' | 'notes' | 'faith' | 'her' | 'socialPath' | 'partnerPath'

interface KindBase {
  id: string
  label: string
  category: KindCategory
  /** A private item: never named on the weekly view, and elsewhere only while names are shown. */
  private: boolean
  /** The first day the record could hold it, for the words that say so. Where a kind is known is `known` alone. */
  since?: string
}
export interface CheckinKind extends KindBase {
  unit: 'checkin'
  known(o: Occasion): boolean
  happened(o: Occasion): boolean
}
export interface DayKind extends KindBase {
  unit: 'day'
  known(d: DayFacts): boolean
  happened(d: DayFacts): boolean
}
export type Kind = CheckinKind | DayKind

/** What the record holds that a kind can be read from. */
export interface CountedInput {
  checkins: readonly CheckIn[]
  contexts: readonly DayContext[]
  items: readonly PrivateItem[]
  /** The owner's own chips, each with its label. */
  chips: readonly OwnChip[]
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  /** The days another app wrote a finished workout for. */
  workoutDays: readonly string[]
}

/** One day as the kinds read it. */
export interface DayFacts {
  day: string
  weekday: number
  /** The day's complete check-ins. */
  occasions: readonly Occasion[]
  /** Any check-in of the day, complete or not: an answer given is an answer. */
  checkin(block: Block): CheckIn | undefined
  all: readonly CheckIn[]
  context: DayContext | undefined
  /** Each move offered and answered that day, with whether it was done. */
  moves: ReadonlyMap<string, boolean>
  /** Each Path with a step offered and answered that day, with whether one was done. */
  paths: ReadonlyMap<string, boolean>
  workout: boolean
  /** A move in nature done that day reached the line on its own. */
  natureMove: boolean
}

/** Every day the record holds anything for, as the kinds read it. */
export function dayFactsOf(input: CountedInput, days: Days): Map<string, DayFacts> {
  const contexts = new Map(input.contexts.map((c) => [c.day, c]))
  const answer = new Map(input.outcomes.filter((x) => x.outcome !== null).map((x) => [x.offerId, x.outcome === 'done']))
  const moves = new Map<string, Map<string, boolean>>()
  const paths = new Map<string, Map<string, boolean>>()
  const mark = (into: Map<string, Map<string, boolean>>, day: string, key: string, done: boolean): void => {
    const of = into.get(day) ?? new Map<string, boolean>()
    of.set(key, Boolean(of.get(key)) || done)
    into.set(day, of)
  }
  for (const o of input.offers) {
    const done = o.id === undefined ? undefined : answer.get(o.id)
    if (done === undefined) continue
    if (hasMove(o.moveId)) mark(moves, o.day, o.moveId, done)
    for (const path of o.paths ?? []) mark(paths, o.day, path, done)
  }
  const workouts = new Set(input.workoutDays)
  const nature = natureMoveDays(input.outcomes)
  const every = new Set<string>([...days.checkins.keys(), ...contexts.keys(), ...moves.keys(), ...paths.keys(), ...workouts])
  const out = new Map<string, DayFacts>()
  for (const day of every) {
    const all = days.checkins.get(day) ?? []
    out.set(day, {
      day,
      weekday: weekdayOf(day),
      occasions: days.byDay.get(day) ?? [],
      checkin: (block) => all.find((c) => c.block === block),
      all,
      context: contexts.get(day),
      moves: moves.get(day) ?? new Map(),
      paths: paths.get(day) ?? new Map(),
      workout: workouts.has(day),
      natureMove: nature.has(day),
    })
  }
  return out
}

/** The day's complete evening check-in: where the evening's chips were on screen. */
const evening = (d: DayFacts): CheckIn | undefined => d.occasions.find((o) => o.block === 'evening')?.checkin

/** A chip on the evening check-in, read as the app has always read it: shown wherever that check-in was completed. */
function eveningChip(id: string, label: string, has: (c: CheckIn) => boolean, category: KindCategory = 'dayRecord'): DayKind {
  return { id, label, unit: 'day', category, private: false, known: (d) => evening(d) !== undefined, happened: (d) => has(evening(d) as CheckIn) }
}

const CONTEXTS: readonly { flag: HonestyContext; label: string; category: KindCategory }[] = [
  { flag: 'withHer', label: 'a day with her', category: 'her' },
  { flag: 'office', label: 'an office day', category: 'dayRecord' },
  { flag: 'church', label: 'the church day', category: 'faith' },
  { flag: 'studyNight', label: 'a preferred study day', category: 'dayRecord' },
  { flag: 'unwell', label: 'a day unwell', category: 'dayRecord' },
  { flag: 'amongPeople', label: 'a day out among people', category: 'dayRecord' },
  { flag: 'away', label: 'a day away from home', category: 'dayRecord' },
]

const PATH_KINDS: readonly { path: string; label: string; category: KindCategory }[] = [
  { path: 'social', label: 'a Social Path step done', category: 'socialPath' },
  { path: 'partner', label: 'a Partner Path step done', category: 'partnerPath' },
]

/** Every kind this record can count, in a fixed order. */
export function kindsOf(input: CountedInput): Kind[] {
  const kinds: Kind[] = []
  const sleep = (id: string, label: string, reading: 'sleepHours' | 'sleepQuality', has: (position: number) => boolean): DayKind => ({
    id,
    label,
    unit: 'day',
    category: 'dayRecord',
    private: false,
    known: (d) => d.checkin('morning')?.answers[reading] !== undefined,
    happened: (d) => has(d.checkin('morning')?.answers[reading] as number),
  })
  kinds.push(sleep('sleep.short', 'a short night (under six hours)', 'sleepHours', (p) => p <= 2))
  kinds.push(sleep('sleep.long', 'slept seven hours or more', 'sleepHours', (p) => p >= 4))
  kinds.push(sleep('sleep.sound', 'sleep read sound or deep', 'sleepQuality', (p) => p >= 4))

  for (const reading of EVENING_READINGS) {
    for (const level of ['high', 'low'] as const) {
      kinds.push({
        id: `evening.${reading}.${level}`,
        label: `${readingById(reading).name} at its ${level === 'high' ? 'top two' : 'lowest two'} phrases in the evening`,
        unit: 'day',
        category: 'dayRecord',
        private: false,
        known: (d) => d.checkin('evening')?.answers[reading] !== undefined,
        happened: (d) => (level === 'high' ? (d.checkin('evening')?.answers[reading] as number) >= 4 : (d.checkin('evening')?.answers[reading] as number) <= 2),
      })
    }
  }

  kinds.push(eveningChip('chip.dinner', 'a late or heavy dinner', (c) => Boolean(c.extras?.dinner)))
  kinds.push(eveningChip('chip.nothingLanded', 'nothing landed', (c) => Boolean(c.extras?.nothingLanded)))
  kinds.push(eveningChip('chip.hardToSeePoint', 'hard to see the point', (c) => Boolean(c.extras?.hardToSeePoint)))
  kinds.push(eveningChip('chip.napped', 'a nap', (c) => Boolean(c.extras?.napped)))
  kinds.push(eveningChip('chip.coolingOff', 'a cooling-off event', (c) => Boolean(c.extras?.coolingOff)))
  kinds.push(eveningChip('chip.bigSocial', 'a big social event', (c) => Boolean(c.extras?.bigSocial)))
  kinds.push(eveningChip('chip.closeToGod', 'felt close to God', (c) => Boolean(c.extras?.closeToGod), 'faith'))
  kinds.push(eveningChip('necessity.missed', 'a necessity missed', (c) => necessitiesMissed(c.extras).length > 0))
  // Teeth are counted only from an explicit tap: silence is unknown, never a miss.
  kinds.push({ id: 'teeth.none', label: 'teeth not brushed', unit: 'day', category: 'dayRecord', private: false, known: (d) => evening(d) !== undefined && teethOf(evening(d)?.extras) !== null, happened: (d) => teethOf(evening(d)?.extras) === 0 })
  kinds.push({
    id: 'nature',
    label: NATURE_EVENT,
    unit: 'day',
    category: 'dayRecord',
    private: false,
    since: NATURE_SINCE,
    // From the definition's start: the rule is nature.ts's own, in the moves' days and in what an evening knows.
    known: (d) => d.natureMove || (evening(d) !== undefined && natureKnown(evening(d) as CheckIn, new Set())),
    happened: (d) => d.natureMove || (evening(d) !== undefined && natureEvening(evening(d) as CheckIn, new Set())),
  })
  kinds.push({
    id: 'caffeine.200',
    label: 'at least 200 mg of caffeine reported',
    unit: 'day',
    category: 'dayRecord',
    private: false,
    known: (d) => d.all.some((c) => c.extras?.caffeineIntake || c.extras?.caffeineShown),
    happened: (d) => dayCaffeine(d.all, d.day).floor >= 200,
  })

  for (const { flag, label, category } of CONTEXTS) {
    const read = (d: DayFacts): boolean | null => contextFlags(d.day, d.context, d.checkin('morning'))[flag]
    kinds.push({ id: `context.${flag}`, label, unit: 'day', category, private: false, known: (d) => read(d) !== null, happened: (d) => read(d) === true })
  }

  const firstWorkout = [...input.workoutDays].sort()[0]
  if (firstWorkout) kinds.push({ id: 'workout', label: 'a workout day', unit: 'day', category: 'dayRecord', private: false, since: firstWorkout, known: (d) => d.day >= firstWorkout, happened: (d) => d.workout })

  const answered = new Set(input.outcomes.filter((x) => x.outcome !== null).map((x) => x.offerId))
  const offered = [...new Set(input.offers.filter((o) => o.id !== undefined && answered.has(o.id) && hasMove(o.moveId)).map((o) => o.moveId))].sort()
  for (const moveId of offered) kinds.push({ id: `move.${moveId}`, label: moveById(moveId).name, unit: 'day', category: 'dayRecord', private: false, known: (d) => d.moves.has(moveId), happened: (d) => d.moves.get(moveId) === true })
  for (const { path, label, category } of PATH_KINDS) {
    if (!input.offers.some((o) => o.paths?.includes(path as never))) continue
    kinds.push({ id: `path.${path}`, label, unit: 'day', category, private: false, known: (d) => d.paths.has(path), happened: (d) => d.paths.get(path) === true })
  }

  kinds.push({ id: 'sweet', label: 'something sweet', unit: 'checkin', category: 'dayRecord', private: false, known: (o) => chipShownAt('sweet', o.checkin), happened: (o) => Boolean(o.checkin.extras?.sweet) })
  kinds.push({ id: 'caffeine.any', label: 'caffeine reported', unit: 'checkin', category: 'dayRecord', private: false, known: (o) => Boolean(o.checkin.extras?.caffeineIntake || o.checkin.extras?.caffeineShown), happened: (o) => Boolean(o.checkin.extras?.caffeineIntake) })
  for (const item of input.items) {
    if (item.id === undefined) continue
    const key = String(item.id)
    kinds.push({ id: `private.${key}`, label: item.name, unit: 'checkin', category: 'privateItems', private: true, known: (o) => privateShownAt(item, o.checkin), happened: (o) => Boolean(o.checkin.extras?.private?.[key]) })
  }
  for (const chip of input.chips) kinds.push({ id: `own.${chip.id}`, label: chip.label, unit: 'checkin', category: 'notes', private: false, known: (o) => ownShownAt(chip.id, o.checkin), happened: (o) => Boolean(o.checkin.extras?.own?.[chip.id]) })
  return kinds
}

/**
 * What the record holds that no kind counts, each with why: with the kinds above, the written list of every kind of
 * record, marked covered or deliberately left out.
 */
export const LEFT_OUT: readonly { id: string; label: string; reason: string }[] = [
  { id: 'journal', label: 'the nightly journal', reason: 'never evidence: a statement from it carries no number, level or cause' },
  { id: 'voice', label: 'voice recordings', reason: 'they stay on the phone' },
  { id: 'ask', label: 'past Ask conversations', reason: 'no lookup yet' },
  { id: 'path.changes', label: 'the log of changes to a Path', reason: 'no lookup yet' },
  { id: 'partner.monthly', label: 'the Partner Path monthly check', reason: 'no lookup yet' },
  { id: 'path.other', label: 'steps of the Speaking Path and of generated Paths', reason: 'their lookup opens only what was done, and is decided with it' },
  { id: 'chip.outside', label: 'the old "outside a while today" chip', reason: 'no longer asked; kept as it was recorded and never read as time in nature' },
  { id: 'caffeine.old', label: 'the old caffeine yes-or-no chips', reason: 'amount unknown; replaced by the reported bands' },
  { id: 'notes', label: 'words in notes', reason: 'counted by their own lookup, as words and never as events' },
]
