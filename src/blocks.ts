export type Block = 'morning' | 'afternoon' | 'evening'

export const BLOCKS: readonly Block[] = ['morning', 'afternoon', 'evening']

export interface Slot {
  day: string
  block: Block
}

export function blockIndex(block: Block): number {
  return BLOCKS.indexOf(block)
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Noon on the given day, local time, so date arithmetic ignores clock changes. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000)
}

/**
 * Morning runs to 11:59, afternoon to 16:59, evening after. Between midnight and 03:59 the
 * night still belongs to the previous day's evening.
 */
export function blockAt(d: Date): Slot {
  const h = d.getHours()
  if (h < 4) {
    const prev = new Date(d)
    prev.setDate(prev.getDate() - 1)
    return { day: dayKey(prev), block: 'evening' }
  }
  if (h < 12) return { day: dayKey(d), block: 'morning' }
  if (h < 17) return { day: dayKey(d), block: 'afternoon' }
  return { day: dayKey(d), block: 'evening' }
}

/** When each block opens, for rows that still lie ahead. */
export const blockStart: Record<Block, string> = { morning: '04:00', afternoon: '12:00', evening: '17:00' }

/** Orders slots by day, then by block within the day. */
export function compareSlots(a: Slot, b: Slot): number {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1
  return blockIndex(a.block) - blockIndex(b.block)
}
