import data from './catalogue.json'
import type { Block } from './blocks'
import type { ReadingId } from './readings'

// The catalogue of moves lives in catalogue.json so the same source feeds the app, the tests,
// and CATALOGUE.md (scripts/catalogue-md.mjs). Phase 5 only reads it; wiring comes in Phase 6.

export type Strength = 'strong' | 'moderate' | 'weak' | 'practice'
export type Effort = 'low' | 'medium' | 'high'
export type Need = 'outdoors' | 'kit' | 'anotherPerson' | 'freeHour' | 'daylight' | 'quiet'
export type Window = 'nextBlock' | 'evening' | 'nextMorning' | 'sevenDays'
export type Counter = 'study' | 'conversations' | 'timeWithHer' | 'faith' | 'finishing'

export interface Source {
  who: string
  what: string
  year: number
  strength: Strength
}

export interface Target {
  reading: ReadingId
  direction: 'up' | 'down'
  window: Window
}

export interface Family {
  id: string
  name: string
}

export interface Move {
  id: string
  name: string
  family: string
  what: string
  source: Source
  minutes: number
  effort: Effort
  needs: readonly Need[]
  targets: readonly Target[]
  conflicts: readonly string[]
  replaces: readonly string[]
  countsToward: readonly Counter[]
  when: readonly Block[]
}

export const families: readonly Family[] = data.families
export const moves: readonly Move[] = data.moves as unknown as readonly Move[]

const byId = new Map(moves.map((m) => [m.id, m]))

export function moveById(id: string): Move {
  const m = byId.get(id)
  if (!m) throw new Error(`unknown move: ${id}`)
  return m
}

export function movesInFamily(familyId: string): Move[] {
  return moves.filter((m) => m.family === familyId)
}

export const STRENGTHS: readonly Strength[] = ['strong', 'moderate', 'weak', 'practice']
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high']
export const NEEDS: readonly Need[] = ['outdoors', 'kit', 'anotherPerson', 'freeHour', 'daylight', 'quiet']
export const WINDOWS: readonly Window[] = ['nextBlock', 'evening', 'nextMorning', 'sevenDays']
export const COUNTERS: readonly Counter[] = ['study', 'conversations', 'timeWithHer', 'faith', 'finishing']

/** The charisma ladder, in order. */
export const CHARISMA_LADDER: readonly string[] = ['eye-contact-stranger', 'ten-seconds-past', 'say-the-thing', 'low-pressure-conversation']
