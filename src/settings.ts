import { BLOCKS, blockAt, type Block } from './blocks'
import type { CheckIn } from './db'
import { blockReadings, type ReadingId } from './readings'
import { sunLocal, type Place } from './sun'

// Settings are one record on the phone. Depth and frequency are separate controls; Low-demand
// mode is a preset over both that remembers what it replaced.

export type Depth = 'full' | 'short'
export type Frequency = 'three' | 'two' | 'one'

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
  /** Learned weights for the reading out of 100, applied only once a weight card holds up. */
  weights: Record<string, number> | null
  /** Daylight hours, HH:MM: a move that needs daylight is offered only inside them. Used while no place is set. */
  daylight: { from: string; to: string }
  /** Part 35: where you are, roughly (one decimal of latitude and longitude), typed once; the day's sunrise and sunset then set the daylight hours. Null until set. */
  place: Place | null
  /** One-time setups you said came undone, by the day you said so; each is offered again after that day. */
  setupUndone: Record<string, string>
  /** The Partner path's optional online channel (Part 27): off until you turn it on; off, none of its reps is offered. */
  partnerOnline: boolean
  updatedAt: string
}

const NO_DAY: Record<Weekday, boolean> = { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false }
const WEEKDAYS_ONLY: Record<Weekday, boolean> = { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false }

export const DEFAULT_WEEK: WeekShape = { churchDay: 6, livesWithMe: true, studyNights: NO_DAY, officeDays: NO_DAY, daycareDays: WEEKDAYS_ONLY, pickupTime: null, soloUntil: '20:00' }

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  depth: 'full',
  frequency: 'three',
  quietStart: '22:00',
  quietEnd: '07:00',
  lowDemand: false,
  beforeLowDemand: null,
  hideMoves: false,
  hideFaith: false,
  reminders: { enabled: false, times: { morning: '07:30', afternoon: '13:00', evening: '19:30' } },
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
  daylight: { from: '07:00', to: '19:00' },
  place: null,
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
    weights: stored.weights ?? null,
    daylight: { ...DEFAULT_SETTINGS.daylight, ...(stored.daylight ?? {}) },
    place: placeOf(stored.place),
    setupUndone: stored.setupUndone ?? {},
    partnerOnline: stored.partnerOnline === true,
  }
}

export const SHORT_READINGS: readonly ReadingId[] = ['mood', 'energy', 'stress']

/** The readings a block asks at a given depth, in the block's own order, less any context reading you retired. */
export function askedReadings(block: Block, depth: Depth, retired: readonly string[] = []): readonly ReadingId[] {
  const all = blockReadings(block).filter((id) => !retired.includes(id))
  return depth === 'short' ? all.filter((id) => SHORT_READINGS.includes(id)) : all
}

export function activeBlocks(frequency: Frequency): readonly Block[] {
  switch (frequency) {
    case 'three':
      return BLOCKS
    case 'two':
      return ['morning', 'evening']
    case 'one':
      return ['evening']
  }
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** A stored place, kept only when both numbers are in range; anything else is no place. */
function placeOf(v: unknown): Place | null {
  const p = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  return p && typeof p.lat === 'number' && typeof p.lon === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 ? { lat: p.lat, lon: p.lon } : null
}

/**
 * The daylight hours for a day (Part 35): sunrise to sunset where you are, once a place is set;
 * else, and on a day the sun neither rises nor sets there, the hours you set.
 */
export function daylightFor(settings: Pick<Settings, 'daylight' | 'place'>, day: string): { from: string; to: string } {
  const sun = settings.place ? sunLocal(day, settings.place) : null
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

/** True inside quiet hours, including spans that cross midnight. Equal start and end means none. */
export function inQuietHours(hhmm: string, s: Pick<Settings, 'quietStart' | 'quietEnd'>): boolean {
  const t = minutesOf(hhmm)
  const a = minutesOf(s.quietStart)
  const b = minutesOf(s.quietEnd)
  if (a === b) return false
  return a < b ? t >= a && t < b : t >= a || t < b
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
