// The fact sheet's shape alone, and the coach block's, with no imports, so the Worker and the
// validator can share them without pulling the app in.

export interface Fact {
  id: string
  /** The library's concept tags the fact touches, for retrieving claim cards. */
  tags: string[]
  text: string
  values: Record<string, number | string | null>
  n?: number
  tier?: string
}

export interface SaidEntry {
  day: string
  source: 'phone' | 'worker'
  situationId: string | null
  text: string
  feedback: 'useful' | 'knew' | 'not' | null
}

/** One situation the phone's engine found true today, as it ranked them (Part 28): what a writer reads first. */
export interface RankedLine {
  situationId: string
  mode: string
  /** How the phone's engine would say it; a writer may say it better, from the same facts. */
  text: string
  factIds: string[]
  cardIds: string[]
  score: number
}

/**
 * The paths' decision core (Parts 24, 27 and 32): the phone's own computation of what is possible
 * now, written on the facts row beside the sheet. Exactly the keys the Worker's coach contract
 * names (COACH_CORE_KEYS) and nothing else: no tier-2 count, no reading, no note.
 */
export interface CoachBlock {
  /** Per path on, the reps that fit this block by tier 1 alone. */
  eligible: { path: string; ids: string[] }[]
  /** Why in-person reps are out of this block, when tier 1 keeps them out; else null. */
  ineligibleReason: string | null
  day: string
  block: 'morning' | 'afternoon' | 'evening'
  /** Today's shape for this block, in words: who the record says is around. */
  shape: string
  /** Per path on, the stage it stands on, and whether reps from the stage below are back for re-entry. */
  stages: { path: string; stage: number; name: string; reentry: boolean }[]
  /** A declared date day (Part 27). */
  dateDay: boolean
  /** Per rep of each path's current stage: drawn, done, partly and no, its last two answers, and the settings its recent reps used. */
  perRep: { path: string; id: string; drawn: number; done: number; partly: number; no: number; last: (string | null)[]; settings: string[] }[]
}

/** The coach block's keys, in the contract's order: the Worker's COACH_CORE_KEYS must equal these. */
export const COACH_BLOCK_KEYS = ['eligible', 'ineligibleReason', 'day', 'block', 'shape', 'stages', 'dateDay', 'perRep'] as const

export interface FactSheet {
  version: 1
  day: string
  builtAt: string
  /** The local hour the sheet was built in, for what is still ahead today. */
  hour: number
  weeks: number
  days: number
  direction: string | null
  facts: Fact[]
  /** What the brief said on recent days, and how it was received: for novelty and for learning what lands. */
  said: SaidEntry[]
  /** "Show private items by name outside this screen" (Rule 11): off, no writer may print a private item's name on Now. */
  showPrivate?: boolean
  /** The phone engine's true situations, best first (Part 28): a ranked shortlist, not a pile. */
  shortlist?: RankedLine[]
  /** When today's check-ins were completed, by block (Part 28): the Worker writes the day's line once the morning's is in. */
  checkedIn?: Partial<Record<'morning' | 'afternoon' | 'evening', string>>
}
