import { BLOCKS, type Block } from './blocks'

// The reminder rules the phone and the Worker share (stage 1, item b): which check-ins a day holds,
// quiet hours, and the reminders before you choose any. Pure, with no browser types, so the Worker
// reads your settings by the very rules the phone keeps.

export type Frequency = 'three' | 'two' | 'one'

export const DEFAULT_FREQUENCY: Frequency = 'three'
export const DEFAULT_QUIET = { quietStart: '22:00', quietEnd: '07:00' } as const
/** Off until you turn them on. */
export const DEFAULT_REMINDERS: { enabled: boolean; times: Readonly<Record<Block, string>> } = { enabled: false, times: { morning: '07:30', afternoon: '13:00', evening: '19:30' } }

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

/** True inside quiet hours, including spans that cross midnight. Equal start and end means none. */
export function inQuietHours(hhmm: string, s: { quietStart: string; quietEnd: string }): boolean {
  const t = minutesOf(hhmm)
  const a = minutesOf(s.quietStart)
  const b = minutesOf(s.quietEnd)
  if (a === b) return false
  return a < b ? t >= a && t < b : t >= a || t < b
}
