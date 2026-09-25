import data from './readings.json'
import type { Block } from './blocks'

// The readings and their anchor phrases live in readings.json so the same source feeds the
// app, the tests, and ANCHORS.md (scripts/anchors-md.mjs).

export type Position = 1 | 2 | 3 | 4 | 5
export type ReadingId = string
export type Answers = Partial<Record<ReadingId, Position>>
export type Unit = 'step' | 'band'

export interface Reading {
  id: ReadingId
  name: string
  prompt: string
  /** One line under the prompt where a reading is easily misread (Part 42): what it does not ask. */
  help?: string
  /** What the reading measures, in the words a writer reads beside its answers (Part 42). */
  meaning?: string
  unit: Unit
  /** Five phrases, least to most of the thing named. */
  anchors: readonly string[]
  /** Phase 9: one pre-written alternate per anchor except the middle, for your veto; null where a reading has none. */
  alternates?: readonly (string | null)[] | null
}

export const readings: readonly Reading[] = data.readings as unknown as readonly Reading[]
export const POSITIONS: readonly Position[] = [1, 2, 3, 4, 5]

const byId = new Map(readings.map((r) => [r.id, r]))

export function readingById(id: ReadingId): Reading {
  const r = byId.get(id)
  if (!r) throw new Error(`unknown reading: ${id}`)
  return r
}

export function blockReadings(block: Block): readonly ReadingId[] {
  return data.blocks[block]
}

const swapped = new Map<string, string>()

/** Phase 12: the anchor swaps in force, loaded from the record at open and after the daily audit. */
export function setAnchorSwaps(list: readonly { reading: string; position: number; to: string }[]): void {
  swapped.clear()
  for (const s of list) swapped.set(`${s.reading}|${s.position}`, s.to)
}

export function anchorFor(id: ReadingId, position: Position): string {
  return swapped.get(`${id}|${position}`) ?? readingById(id).anchors[position - 1]
}

/** The five phrases as the check-in shows them today, swaps applied. */
export function activeAnchors(id: ReadingId): string[] {
  return POSITIONS.map((p) => anchorFor(id, p))
}

/** The word before the dash, or the whole phrase for a band of hours. */
export function headword(anchor: string): string {
  const i = anchor.indexOf(' — ')
  return i === -1 ? anchor : anchor.slice(0, i)
}

export function description(anchor: string): string | null {
  const i = anchor.indexOf(' — ')
  return i === -1 ? null : anchor.slice(i + 3)
}
