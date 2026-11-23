import { addDays, BLOCKS, type Block } from './blocks'
import { seeded } from './counted/compare'
import { weekdayOf } from './counted/occasions'
import { contextFromWeek, type CheckIn, type DayContext, type IssuedDay } from './db'
import { blockReadings, type Answers, type Position } from './readings'
import { INGREDIENTS } from './score'
import { DEFAULT_SETTINGS, type Settings, type WeekShape, type Weekday } from './settings'

// Stand-in records for Stage C's tests (Stage C-A, 2026-11-22): days of three complete check-ins, each of the six
// readings behind the score at its own position, with a seeded wobble of its own; and the days' records, with the week's
// scheduled kind as it then stood and, where asked, the weather as it came and the forecasts as they were issued. Seeded,
// so each is the same on every run. Stand-in answers and stand-in weather only.

export const KNOWN_TODAY = '2026-11-23'

/** A stand-in record: its check-ins, its days' records, and the week's template as it stands on the last day. */
export interface StandIn {
  checkins: CheckIn[]
  days: DayContext[]
  week: WeekShape
}

export interface StandInOptions {
  days?: number
  today?: string
  seed?: number
  /** Steps a reading moves in its good direction at a check-in, beside the wobble; the day's sunshine less its usual is given. */
  steps?: (day: string, weekday: number, block: Block, reading: string, sunTurn: number) => number
  /** How often a reading's wobble moves it a step, each way: one rate for all six, or each reading's own. */
  wobble?: number | ((reading: string) => number)
  /** Keep the weather as it came and the forecasts as they were issued on every day. */
  weather?: boolean
  /** The office days as the week's template had them on a day; the template on the last day is the record's own. */
  office?: (day: string) => readonly Weekday[]
  /** About a third of the nights short (the morning reports the fewest hours), and the day after two steps lower at every check-in. */
  shortNights?: boolean
}

const SPREAD = 2.5
const CARRY = 0.5
/** How well a forecast follows what came, by days ahead, 0 to 7. */
const SKILL = [0.95, 0.9, 0.85, 0.75, 0.65, 0.5, 0.4, 0.3]

function gauss(next: () => number): number {
  const u = Math.max(1e-12, next())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next())
}

const weekWith = (office: readonly Weekday[]): WeekShape => ({ ...DEFAULT_SETTINGS.week, officeDays: Object.fromEntries(([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((w) => [w, office.includes(w)])) as WeekShape['officeDays'] })

/** The days before `today`, oldest first, each with three complete check-ins and its record; and today's record, with no check-in. */
export function standIn(opts: StandInOptions = {}): StandIn {
  const days = opts.days ?? 200
  const today = opts.today ?? KNOWN_TODAY
  const next = seeded(opts.seed ?? 29)
  const sky = seeded((opts.seed ?? 29) + 1000)
  const wobbleOf = (id: string): number => (typeof opts.wobble === 'function' ? opts.wobble(id) : (opts.wobble ?? 0.2))
  // The sunshine: a usual level of five hours, a turn of its own that carries from day to day, and forecasts issued each day.
  const turn: number[] = []
  let a = SPREAD * gauss(sky)
  for (let i = 0; i < days + 8; i++) {
    turn.push(a)
    a = CARRY * a + Math.sqrt(1 - CARRY * CARRY) * SPREAD * gauss(sky)
  }
  const sunOn = (i: number): number => Math.max(0, 5 + turn[i])
  const nightly = seeded((opts.seed ?? 29) + 2000)
  const short = Array.from({ length: days + 1 }, () => Boolean(opts.shortNights) && nightly() < 0.35)
  const checkins: CheckIn[] = []
  const records: DayContext[] = []
  for (let i = 0; i <= days; i++) {
    const day = addDays(today, i - days)
    const weekday = weekdayOf(day)
    // The day of writing itself: its record, as the phone keeps it once the day's weather is read, and no check-in yet.
    for (const block of i < days ? BLOCKS : []) {
      const at = new Date(`${day}T${block === 'morning' ? '07' : block === 'afternoon' ? '13' : '19'}:30:00`).toISOString()
      const ids = blockReadings(block)
      const answers: Answers = Object.fromEntries(ids.map((id) => [id, 3 as Position]))
      for (const id of Object.keys(INGREDIENTS)) {
        const r = next()
        const wobble = wobbleOf(id)
        const wob = r < wobble ? -1 : r > 1 - wobble ? 1 : 0
        const good = Math.round((opts.steps ? opts.steps(day, weekday, block, id, turn[i]) : 0) + wob - (i > 0 && short[i - 1] ? 2 : 0))
        answers[id] = Math.max(1, Math.min(5, 3 + (INGREDIENTS[id] === 'down' ? -good : good))) as Position
      }
      if (block === 'morning' && short[i]) answers.sleepHours = 1
      checkins.push({ day, block, asked: [...ids], answers, startedAt: at, completedAt: at, updatedAt: at, activeMs: 30_000 })
    }
    const week = weekWith(opts.office ? opts.office(day) : [])
    const settings: Settings = { ...DEFAULT_SETTINGS, week }
    const ctx = contextFromWeek(day, settings, `${day}T06:00:00.000Z`, 'gated')
    if (opts.weather) {
      const issued: IssuedDay[] = SKILL.map((skill, h) => {
        const said = Math.max(0, 5 + skill * turn[i + h] + Math.sqrt(1 - skill * skill) * SPREAD * gauss(sky))
        return { day: addDays(day, h), rain: 1, sun: Math.round(said * 10) / 10, high: 12 }
      })
      ctx.weather = { rain: 1, sun: Math.round(sunOn(i) * 10) / 10, high: 12, at: `${addDays(day, 1)}T07:00:00.000Z` }
      ctx.weatherIssued = { at: `${day}T07:00:00.000Z`, days: issued }
    }
    records.push(ctx)
  }
  return { checkins, days: records, week: weekWith(opts.office ? opts.office(today) : []) }
}

/** Mood by weekday, Sunday first, in steps; energy the other way round at 0.6 of it: a weekday rhythm in two of the six readings alone, which the score itself carries too little of for its own test. */
export const TWO_READINGS = [1, -1, -1, 0, 0, 1, 1]
export const inTwoReadings = (_day: string, weekday: number, _block: Block, reading: string): number => (reading === 'mood' ? TWO_READINGS[weekday] : reading === 'energy' ? -0.6 * TWO_READINGS[weekday] : 0)
/** The wobble for that record: mood and energy steady, the other four readings less so. */
export const twoReadingsWobble = (reading: string): number => (reading === 'mood' || reading === 'energy' ? 0.1 : 0.3)

/** Sunshine that drives the day: each hour above its usual lifts every reading by a fifth of a step. */
export const bySunshine = (perHour = 0.2) => (_day: string, _weekday: number, _block: Block, _reading: string, sunTurn: number): number => perHour * sunTurn

/** Office days a step and a half lower, the weekend a step higher; the office days are Tuesday and Thursday until the day given, Monday and Wednesday from it. */
export function movedOffice(changeDay: string): Pick<StandInOptions, 'office' | 'steps'> {
  const office = (day: string): Weekday[] => (day < changeDay ? [2, 4] : [1, 3])
  return { office, steps: (day, weekday) => (office(day).includes(weekday as Weekday) ? -1.5 : weekday === 6 || weekday === 0 ? 1 : 0) }
}

/** A coin for a check-in's reading, from its day, block and name alone: the same on every run. */
function coin(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return (h % 10000) / 10000
}
type Steps = NonNullable<StandInOptions['steps']>
/** The steps given, laid on that share of the readings at each check-in alone: a weaker pattern of the same kind. */
export const thinned = (share: number, steps: Steps): Steps => (day, weekday, block, reading, sunTurn) => (coin(day + block + reading) < share ? steps(day, weekday, block, reading, sunTurn) : 0)
