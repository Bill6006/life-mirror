// The fact sheet's shape alone, with no imports, so the Worker and the validator can share it
// without pulling the app in.

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
