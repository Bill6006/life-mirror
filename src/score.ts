import { compareSlots, type Block } from './blocks'
import { askedOf, type CheckIn } from './db'
import type { Answers, Position, ReadingId } from './readings'

// The reading out of 100, exactly as the plan's bar states it: the six readings with a clear
// better direction, each anchor mapped to 0/25/50/75/100 (reversed where lower is better),
// combined as an equal-weight mean. Everything here is a calculation; screens show it in the
// calculation register with its ingredient count.

export const INGREDIENTS: Readonly<Record<string, 'up' | 'down'>> = {
  mood: 'up',
  energy: 'up',
  focus: 'up',
  stress: 'down',
  overwhelm: 'down',
  irritation: 'down',
}

export const INGREDIENT_IDS: readonly ReadingId[] = Object.keys(INGREDIENTS)
export const TOTAL_INGREDIENTS = INGREDIENT_IDS.length

/** Shown beside the reading, never inside it. */
export const CONTEXT_IDS: readonly ReadingId[] = ['hunger', 'sleepHours', 'sleepQuality', 'confidence', 'loneliness', 'socialEnergy']

export type Stance = 'Protect' | 'Recover' | 'Stabilize' | 'Build'

export function stanceOf(value: number): Stance {
  if (value < 25) return 'Protect'
  if (value < 50) return 'Recover'
  if (value < 75) return 'Stabilize'
  return 'Build'
}

export function pointsFor(id: ReadingId, position: Position): number {
  const p = (position - 1) * 25
  return INGREDIENTS[id] === 'down' ? 100 - p : p
}

export interface Reading100 {
  value: number
  stance: Stance
  /** Ingredients that went in, out of the six. */
  used: number
  total: number
}

/** Equal-weight mean of the asked ingredients; null while any asked ingredient is unanswered. */
export function readingOutOf100(answers: Answers, asked: readonly ReadingId[]): Reading100 | null {
  const ids = asked.filter((id) => id in INGREDIENTS)
  if (ids.length === 0) return null
  if (ids.some((id) => answers[id] === undefined)) return null
  const sum = ids.reduce((s, id) => s + pointsFor(id, answers[id] as Position), 0)
  const value = Math.round(sum / ids.length)
  return { value, stance: stanceOf(value), used: ids.length, total: TOTAL_INGREDIENTS }
}

export function readingOf(c: CheckIn): Reading100 | null {
  return readingOutOf100(c.answers, askedOf(c))
}

export interface FullReading {
  reading: Reading100
  checkin: CheckIn
}

function newestFirst(all: readonly CheckIn[]): CheckIn[] {
  return [...all].sort((a, b) => compareSlots(b, a))
}

/** The most recent check-in whose asked ingredients are all answered. */
export function latestFullReading(all: readonly CheckIn[]): FullReading | null {
  for (const c of newestFirst(all)) {
    const reading = readingOf(c)
    if (reading) return { reading, checkin: c }
  }
  return null
}

export interface ContextValue {
  id: ReadingId
  position: Position
  checkin: CheckIn
}

/** The latest answer for each context reading, with the check-in it came from. */
export function latestContext(all: readonly CheckIn[]): ContextValue[] {
  const sorted = newestFirst(all)
  return CONTEXT_IDS.flatMap((id) => {
    const c = sorted.find((x) => x.answers[id] !== undefined)
    return c ? [{ id, position: c.answers[id] as Position, checkin: c }] : []
  })
}

/** Today's blocks with their reading, or null where there is none yet. */
export function todayGlance(all: readonly CheckIn[], day: string, blocks: readonly Block[]): { block: Block; reading: Reading100 | null }[] {
  return blocks.map((block) => {
    const c = all.find((x) => x.day === day && x.block === block)
    return { block, reading: c ? readingOf(c) : null }
  })
}
