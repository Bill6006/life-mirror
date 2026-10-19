import { blockAt, type Block } from './blocks'
import type { CheckIn } from './db'
import type { AwayRange } from './postWindow'
import { blockReadings, type ReadingId } from './readings'
import { activeBlocks, DEFAULT_FREQUENCY, DEFAULT_QUIET, DEFAULT_REMINDERS, inQuietHours, minutesOf, type Frequency } from './reminderRules'
import { sunLocal, type Place } from './sun'

// Settings are one record on the phone. Depth and frequency are separate controls; Low-demand
// mode is a preset over both that remembers what it replaced.

export type Depth = 'full' | 'short'
// Shared with the Worker, which reads your copied settings by the same rules (stage 1, item b).
export { activeBlocks, inQuietHours, minutesOf, type Frequency }

export interface PushState {
  /** The browser's push address, the one thing that ever leaves the phone. */
  subscription: PushSubscriptionJSON | null
  subscribedAt: string | null
  /** The browser rotated the address; it must be copied and pasted again. */
  changed: boolean
}

/** 0 is Sunday, as Date.getDay() counts. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** The shape of the week, set once and known from day one, no learning needed. Nothing here leaves the phone. */
export interface WeekShape {
  churchDay: Weekday | null
  /** The constant: she lives with you. The exception is one chip inside the check-in. */
  livesWithMe: boolean
  /**
   * Preferred study days (Workstream 6, D5; kept under its older name). A preference only: on these
   * days, in the part of the day below, what is already due to learn comes first on Now. It never makes
   * anything due and never picks a subject; learning can happen at any time of day.
   */
  studyNights: Record<Weekday, boolean>
  /** The part of those days the preference holds for; any time when unset. */
  studyPart?: 'any' | 'morning' | 'afternoon' | 'evening'
  /** Days at the office rather than at home; the exception is one chip inside the check-in. Quiet is not to be had there. */
  officeDays: Record<Weekday, boolean>
  /** Days she is at daycare: the pickup, and the daycare day it implies, hold on these. */
  daycareDays: Record<Weekday, boolean>
  /** Daycare pickup, HH:MM, or null when there is none. */
  pickupTime: string | null
  /** Solo-parenting hours run from pickup until this time. */
  soloUntil: string
}

/** The cloud copy: the token you pasted once and this phone's id. Never exported, never synced, never logged. */
export interface CloudSettings {
  token: string | null
  /** Generated once on this phone; empty until the first sync sets it. */
  deviceId: string
  /** When the token was saved on this phone: the mark that tells a loss from never having had one. */
  tokenSavedAt: string | null
}

export interface Settings {
  id: 1
  depth: Depth
  frequency: Frequency
  /** HH:MM, local. Reminders never fire between these. */
  quietStart: string
  quietEnd: string
  lowDemand: boolean
  beforeLowDemand: { depth: Depth; frequency: Frequency } | null
  /** Set by Low-demand mode; the move slot stays hidden while true. */
  hideMoves: boolean
  /** Faith is offered, never pushed: the whole family hides with one tap. */
  hideFaith: boolean
  reminders: { enabled: boolean; times: Record<Block, string> }
  extras: { minimumWin: boolean; caffeine: boolean; dinner: boolean; privateLog: boolean; faith: boolean }
  /** Show private items by name outside the Private screen. */
  showPrivate: boolean
  /** Rule 11: private items are used to pick moves only when you turn this on. A fresh install has it off. */
  privateInSelection: boolean
  /** Reminders already shown, keyed day:block, so each block gets at most one. */
  reminded: Record<string, true>
  push: PushState
  lastExportAt: string | null
  week: WeekShape
  /** Your direction sentence: one line, yours, on this phone only. Null until written. */
  direction: string | null
  /** The one-time ask happened, whether or not a line was written. Never asked again. */
  directionAskedAt: string | null
  cloud: CloudSettings
  /** Phase 12: context readings you retired on a proposal; never an ingredient. */
  retiredReadings: string[]
  /** A proposal you kept for now, by the day you decided; it rests sixty days. */
  readingDecisions: Record<string, string>
  /** Chips brought back, by the day you did; the count of untapped evenings restarts there. */
  chipsBack: Record<string, string>
  /** Workstream 6: the day you brought back the question on how a learning session went, after it stopped appearing unused; null until then. */
  easeBack: string | null
  /** Stage 3, item 5: when you brought back the expectancy tap after a People rep, after it stopped appearing unused; null until then. */
  expectancyBack: string | null
  /** Learned weights for the reading out of 100, applied only once a weight card holds up. */
  weights: Record<string, number> | null
  /** Daylight hours, HH:MM: a move that needs daylight is offered only inside them. Used while no place is set. */
  daylight: { from: string; to: string }
  /** Part 35: where you are, roughly (one decimal of latitude and longitude), typed once; the day's sunrise and sunset then set the daylight hours. Null until set. */
  place: Place | null
  /**
   * Part 43: Location Context, on this phone alone (never synced): whether it is on, and the area you
   * were last in to a tenth of a degree, read while Life Mirror was open, which sets the daylight
   * hours ahead of the place you typed. Off until you turn it on.
   */
  location: { on: boolean; area: (Place & { at: string }) | null }
  /**
   * Stage 3, item 6: Weather for your area, on this phone alone (never synced): while on, once a day while Life Mirror
   * is open, Open-Meteo is asked for yesterday's and today's weather at the area the sun's times use, to one decimal.
   * Off on a fresh install and until you turn it on, after its words are shown; off, nothing is asked and nothing changes.
   */
  weather: { on: boolean }
  /** One-time setups you said came undone, by the day you said so; each is offered again after that day. */
  setupUndone: Record<string, string>
  /** The Partner path's optional online channel (Part 27): off until you turn it on; off, none of its reps is offered. */
  partnerOnline: boolean
  /** Away from home (post-window, gated): the trip you set, first and last day. Absent until one is set, and never set while the gate is closed. */
  away?: AwayRange
  /** Your own chips (stage 3, item 5): short labels you typed, each asked as one tap at the evening check-in. A removed one keeps its record. Absent until the first. */
  ownChips?: OwnChip[]
  /** The learning repair (stage R4b): the passive items you set a test of, each with the day it began. Absent until the first. */
  repairPassiveTests?: { moveId: string; since: string }[]
  updatedAt: string
}

const NO_DAY: Record<Weekday, boolean> = { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false }
const WEEKDAYS_ONLY: Record<Weekday, boolean> = { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false }

export const DEFAULT_WEEK: WeekShape = { churchDay: 6, livesWithMe: true, studyNights: NO_DAY, officeDays: NO_DAY, daycareDays: WEEKDAYS_ONLY, pickupTime: null, soloUntil: '20:00' }

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  depth: 'full',
  frequency: DEFAULT_FREQUENCY,
  quietStart: DEFAULT_QUIET.quietStart,
  quietEnd: DEFAULT_QUIET.quietEnd,
  lowDemand: false,
  beforeLowDemand: null,
  hideMoves: false,
  hideFaith: false,
  reminders: { enabled: DEFAULT_REMINDERS.enabled, times: { ...DEFAULT_REMINDERS.times } },
  extras: { minimumWin: true, caffeine: true, dinner: true, privateLog: true, faith: true },
  showPrivate: false,
  privateInSelection: false,
  reminded: {},
  push: { subscription: null, subscribedAt: null, changed: false },
  lastExportAt: null,
  week: DEFAULT_WEEK,
  direction: null,
  directionAskedAt: null,
  cloud: { token: null, deviceId: '', tokenSavedAt: null },
  retiredReadings: [],
  readingDecisions: {},
  chipsBack: {},
  easeBack: null,
  expectancyBack: null,
  daylight: { from: '07:00', to: '19:00' },
  place: null,
  location: { on: false, area: null },
  weather: { on: false },
  setupUndone: {},
  weights: null,
  partnerOnline: false,
  updatedAt: '',
}

/** A stored record from an earlier phase may lack newer fields; fill them from the defaults. */
export function withDefaults(stored: Partial<Settings> | undefined): Settings {
  if (!stored) return DEFAULT_SETTINGS
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    reminders: { ...DEFAULT_SETTINGS.reminders, ...(stored.reminders ?? {}), times: { ...DEFAULT_SETTINGS.reminders.times, ...(stored.reminders?.times ?? {}) } },
    extras: { ...DEFAULT_SETTINGS.extras, ...(stored.extras ?? {}) },
    push: { ...DEFAULT_SETTINGS.push, ...(stored.push ?? {}) },
    week: {
      ...DEFAULT_WEEK,
      ...(stored.week ?? {}),
      livesWithMe: stored.week?.livesWithMe ?? DEFAULT_WEEK.livesWithMe,
      studyNights: { ...DEFAULT_WEEK.studyNights, ...(stored.week?.studyNights ?? {}) },
      officeDays: { ...DEFAULT_WEEK.officeDays, ...(stored.week?.officeDays ?? {}) },
      daycareDays: { ...DEFAULT_WEEK.daycareDays, ...(stored.week?.daycareDays ?? {}) },
    },
    reminded: stored.reminded ?? {},
    cloud: { ...DEFAULT_SETTINGS.cloud, ...(stored.cloud ?? {}) },
    retiredReadings: stored.retiredReadings ?? [],
    readingDecisions: stored.readingDecisions ?? {},
    chipsBack: stored.chipsBack ?? {},
    easeBack: typeof stored.easeBack === 'string' ? stored.easeBack : null,
    expectancyBack: typeof stored.expectancyBack === 'string' ? stored.expectancyBack : null,
    weights: stored.weights ?? null,
    daylight: { ...DEFAULT_SETTINGS.daylight, ...(stored.daylight ?? {}) },
    place: placeOf(stored.place),
    location: locationOf(stored.location),
    weather: { on: stored.weather?.on === true },
    setupUndone: stored.setupUndone ?? {},
    partnerOnline: stored.partnerOnline === true,
  }
}

/** One of your own chips (stage 3, item 5): its label is your own words, and no model reads it yet. */
export interface OwnChip {
  id: string
  label: string
  createdAt: string
  /** When you removed it: it stops being asked, and its taps stay on the record. */
  removedAt: string | null
}

/** At most three of your own chips at once (Rule 17), each a short label. */
export const OWN_CHIPS_MAX = 3
export const OWN_CHIP_LABEL_MAX = 40

/** Your own chips as stored, every one that reads whole, removed ones included; the stored list itself is never rewritten here. */
export function allOwnChips(s: Pick<Settings, 'ownChips'>): OwnChip[] {
  if (!Array.isArray(s.ownChips)) return []
  return s.ownChips.filter((c): c is OwnChip => Boolean(c) && typeof c.id === 'string' && c.id !== '' && typeof c.label === 'string' && c.label.trim() !== '' && typeof c.createdAt === 'string' && (c.removedAt === null || typeof c.removedAt === 'string'))
}

/** Your own chips still asked: not removed. */
export function ownChipsOf(s: Pick<Settings, 'ownChips'>): OwnChip[] {
  return allOwnChips(s).filter((c) => c.removedAt === null)
}

/** The settings with one more of your chips, trimmed to its length; unchanged while three are asked or the label is empty. Stored entries are kept as they are. */
export function withOwnChipAdded<S extends Pick<Settings, 'ownChips'>>(s: S, label: string, now: Date = new Date()): S {
  const text = label.trim().slice(0, OWN_CHIP_LABEL_MAX).trim()
  if (!text || ownChipsOf(s).length >= OWN_CHIPS_MAX) return s
  const id = `${now.getTime().toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36)}`
  return { ...s, ownChips: [...(Array.isArray(s.ownChips) ? s.ownChips : []), { id, label: text, createdAt: now.toISOString(), removedAt: null }] }
}

/** The settings with one of your chips removed: it stops being asked, and it and its taps stay on the record. */
export function withOwnChipRemoved<S extends Pick<Settings, 'ownChips'>>(s: S, id: string, now: Date = new Date()): S {
  if (!Array.isArray(s.ownChips)) return s
  return { ...s, ownChips: s.ownChips.map((c) => (c && c.id === id && c.removedAt === null ? { ...c, removedAt: now.toISOString() } : c)) }
}

export const SHORT_READINGS: readonly ReadingId[] = ['mood', 'energy', 'stress']

/** The two sleep readings: the morning's, about the night before. */
export const SLEEP_READINGS: readonly ReadingId[] = ['sleepHours', 'sleepQuality']

/**
 * Motivation and Confidence, asked in turn, one each morning, day by day (stage 3, item 5): the one a day asks.
 * The other is not asked that morning, never missing or skipped.
 */
export function turnOf(day: string): 'motivation' | 'confidence' {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000) % 2 === 0 ? 'motivation' : 'confidence'
}

/** What a day's readings depend on beyond the block (stage 3, item 5): the day, and its morning check-in, or null when there is none. */
export interface AskedDay {
  day: string
  morning: Pick<CheckIn, 'answers'> | null
}

/**
 * The readings a block asks at a given depth, in the block's own order, less any context reading you retired.
 * Given the day (stage 3, item 5), at full depth: the morning asks Motivation or Confidence in turn, and an
 * afternoon after a morning that left a sleep reading unanswered asks it first, late, about the night before.
 * Short depth, low-demand mode's included, asks its three readings alone.
 */
export function askedReadings(block: Block, depth: Depth, retired: readonly string[] = [], at?: AskedDay): readonly ReadingId[] {
  const all = blockReadings(block).filter((id) => !retired.includes(id))
  if (depth === 'short') return all.filter((id) => SHORT_READINGS.includes(id))
  if (!at) return all
  if (block === 'morning') {
    const notToday = turnOf(at.day) === 'motivation' ? 'confidence' : 'motivation'
    return all.filter((id) => id !== notToday)
  }
  if (block === 'afternoon') return [...SLEEP_READINGS.filter((id) => !retired.includes(id) && at.morning?.answers[id] === undefined), ...all]
  return all
}

/** A stored place, kept only when both numbers are in range; anything else is no place. */
function placeOf(v: unknown): Place | null {
  const p = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  return p && typeof p.lat === 'number' && typeof p.lon === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 ? { lat: p.lat, lon: p.lon } : null
}

/** Location Context as stored: on only when it says so; an area only when both numbers are in range. */
function locationOf(v: unknown): Settings['location'] {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  const area = placeOf(o.area)
  const at = o.area && typeof (o.area as Record<string, unknown>).at === 'string' ? ((o.area as Record<string, unknown>).at as string) : ''
  return { on: o.on === true, area: area && at ? { ...area, at } : null }
}

/**
 * Where the sun is reckoned from (Part 43): the area Location Context last read, while it is on;
 * else the place you typed (Part 35); else none, and the hours you set stand.
 */
export function sunPlace(settings: Pick<Settings, 'place'> & Partial<Pick<Settings, 'location'>>): { place: Place; from: 'auto' | 'typed' } | null {
  const auto = settings.location?.on ? settings.location.area : null
  if (auto) return { place: { lat: auto.lat, lon: auto.lon }, from: 'auto' }
  return settings.place ? { place: settings.place, from: 'typed' } : null
}

/**
 * The daylight hours for a day (Part 35): sunrise to sunset where you are, from Location Context's
 * area or the place you typed; else, and on a day the sun neither rises nor sets there, the hours you set.
 */
export function daylightFor(settings: Pick<Settings, 'daylight' | 'place'> & Partial<Pick<Settings, 'location'>>, day: string): { from: string; to: string } {
  const where = sunPlace(settings)
  const sun = where ? sunLocal(day, where.place) : null
  return sun ? { from: sun.rise, to: sun.set } : settings.daylight
}

/** Whether a moment falls inside the daylight hours; a window that ends before it starts wraps past midnight. */
export function inDaylight(window: { from: string; to: string }, now: Date): boolean {
  const m = now.getHours() * 60 + now.getMinutes()
  const from = minutesOf(window.from)
  const to = minutesOf(window.to)
  return from <= to ? m >= from && m < to : m >= from || m < to
}

export function hhmmOf(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Low-demand on: short depth, evening only, one reminder, no move. Off: what it replaced. */
export function applyLowDemand(s: Settings, on: boolean): Settings {
  if (on === s.lowDemand) return s
  if (on) {
    return { ...s, lowDemand: true, beforeLowDemand: { depth: s.depth, frequency: s.frequency }, depth: 'short', frequency: 'one', hideMoves: true }
  }
  const before = s.beforeLowDemand ?? { depth: DEFAULT_SETTINGS.depth, frequency: DEFAULT_SETTINGS.frequency }
  return { ...s, lowDemand: false, beforeLowDemand: null, depth: before.depth, frequency: before.frequency, hideMoves: false }
}

export function extrasEnabled(s: Settings): boolean {
  return Object.values(s.extras).some(Boolean)
}

export function remindedKey(day: string, block: Block): string {
  return `${day}:${block}`
}

/**
 * The block due a reminder right now, or null. At most one per block, never in quiet hours,
 * never for a block that has already begun, never for a block the frequency does not ask.
 * With `anyTime` the clock check is skipped: the ping's arrival is the time.
 */
export function reminderDue(now: Date, s: Settings, todays: ReadonlyMap<Block, CheckIn>, opts: { anyTime?: boolean } = {}): Block | null {
  if (!s.reminders.enabled) return null
  const { day, block } = blockAt(now)
  if (!activeBlocks(s.frequency).includes(block)) return null
  if (todays.has(block)) return null
  if (s.reminded[remindedKey(day, block)]) return null
  const hhmm = hhmmOf(now)
  if (inQuietHours(hhmm, s)) return null
  if (!opts.anyTime && minutesOf(hhmm) < minutesOf(s.reminders.times[block])) return null
  return block
}

export type PushDecision = { kind: 'remind'; day: string; block: Block } | { kind: 'nothing' } | { kind: 'quiet' }

/**
 * What the worker does with a content-free ping. Remind when a block is due; do nothing when
 * the app is in front (its screen is the prompt); otherwise a silent notice that is taken
 * down at once, because the browser insists every push shows something.
 */
export function pushDecision(now: Date, s: Settings, todays: ReadonlyMap<Block, CheckIn>, appVisible: boolean): PushDecision {
  const block = reminderDue(now, s, todays, { anyTime: true })
  if (block) return { kind: 'remind', day: blockAt(now).day, block }
  return appVisible ? { kind: 'nothing' } : { kind: 'quiet' }
}
