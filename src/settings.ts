import { BLOCKS, blockAt, type Block } from './blocks'
import type { CheckIn } from './db'
import { blockReadings, type ReadingId } from './readings'

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

export interface Settings {
  id: 1
  depth: Depth
  frequency: Frequency
  /** HH:MM, local. Reminders never fire between these. */
  quietStart: string
  quietEnd: string
  lowDemand: boolean
  beforeLowDemand: { depth: Depth; frequency: Frequency } | null
  /** Set by Low-demand mode; the move slot (Phase 6) stays hidden while true. */
  hideMoves: boolean
  reminders: { enabled: boolean; times: Record<Block, string> }
  extras: { minimumWin: boolean; caffeine: boolean; dinner: boolean; privateLog: boolean; faith: boolean }
  /** Show private items by name outside the Private screen. */
  showPrivate: boolean
  /** Reminders already shown, keyed day:block, so each block gets at most one. */
  reminded: Record<string, true>
  push: PushState
  lastExportAt: string | null
  updatedAt: string
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  depth: 'full',
  frequency: 'three',
  quietStart: '22:00',
  quietEnd: '07:00',
  lowDemand: false,
  beforeLowDemand: null,
  hideMoves: false,
  reminders: { enabled: false, times: { morning: '07:30', afternoon: '13:00', evening: '19:30' } },
  extras: { minimumWin: true, caffeine: true, dinner: true, privateLog: true, faith: true },
  showPrivate: false,
  reminded: {},
  push: { subscription: null, subscribedAt: null, changed: false },
  lastExportAt: null,
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
    reminded: stored.reminded ?? {},
  }
}

export const SHORT_READINGS: readonly ReadingId[] = ['mood', 'energy', 'stress']

/** The readings a block asks at a given depth, in the block's own order. */
export function askedReadings(block: Block, depth: Depth): readonly ReadingId[] {
  const all = blockReadings(block)
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
