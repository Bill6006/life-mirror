import data from './catalogue.json'
import type { Block } from './blocks'
import type { ReadingId } from './readings'

// The catalogue of moves lives in catalogue.json so the same source feeds the app, the tests,
// and CATALOGUE.md (scripts/catalogue-md.mjs). Phase 9 added the tags, the starting beliefs,
// the setup family and the proposed entries: content to read and veto, wired at Green.

export type Strength = 'strong' | 'moderate' | 'weak' | 'practice'
export type Effort = 'low' | 'medium' | 'high'
export type Need = 'outdoors' | 'kit' | 'anotherPerson' | 'freeHour' | 'daylight' | 'quiet'
export type Window = 'nextBlock' | 'laterToday' | 'evening' | 'nextMorning' | 'sevenDays'
export type Counter = 'study' | 'conversations' | 'timeWithHer' | 'faith' | 'finishing'
export type Ingredient = 'outdoors' | 'withPeople' | 'short' | 'lowEffort'
export type Reward = 'pleasure' | 'mastery' | 'connection'
export type Intensity = 'low' | 'medium' | 'high'
export type Necessity = 'food' | 'teeth' | 'shower'

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

/** The learned tags: the app will estimate their effects from your record. No more than these. */
export interface Tags {
  ingredients: readonly Ingredient[]
  reward: readonly Reward[]
  intensity: Intensity
}

/** A starting belief: the expected change on the first target, in anchor steps, and how it was read from the source. */
export interface Prior {
  effect: number
  note: string
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
  tags: Tags
  /** A filter tag: what being given this move costs you. */
  costToAssign: Effort
  prior: Prior
  /** Proposed and not yet wired: read and veto. None remain since the Phase 9 Green. */
  status?: 'proposed'
  /** Parked at the Phase 9 Green: shown in the catalogue, never offered. */
  parked?: boolean
  ladder?: { id: string; rung: number }
  setup?: { kind: string; necessity?: Necessity }
  /** Proposed as a passive item, riding alongside a move. */
  passive?: boolean
}

export interface LearnedTag {
  id: string
  kind: 'ingredient' | 'reward' | 'intensity'
  name: string
  what: string
  prior: Prior
  source: Source
}

export interface FilterTag {
  id: string
  name: string
  what: string
}

export interface Research {
  id: string
  name: string
  sources: readonly Source[]
  contributes: readonly string[]
  chips: string
}

export interface ExtensionPrompt {
  intro: string
  template: string
}

export interface Proposals {
  money: { keep: readonly string[]; park: readonly string[]; move: readonly { id: string; to: string }[]; note: string }
  charisma: { ladder: readonly string[]; note: string }
  passive: readonly string[]
  wiring: string
  /** Entries parked after the Phase 9 Green, by the owner's veto. */
  parkedLater: { ids: readonly string[]; note: string }
}

interface CatalogueData {
  families: Family[]
  moves: Move[]
  learnedTags: LearnedTag[]
  filterTags: FilterTag[]
  research: Research[]
  extensionPrompt: ExtensionPrompt
  proposals: Proposals
}

const catalogue = data as unknown as CatalogueData

export const families: readonly Family[] = catalogue.families
/** Every entry, proposed ones included: what the catalogue screen and the document show. */
export const moves: readonly Move[] = catalogue.moves
export const learnedTags: readonly LearnedTag[] = catalogue.learnedTags
export const filterTags: readonly FilterTag[] = catalogue.filterTags
export const research: readonly Research[] = catalogue.research
export const extensionPrompt: ExtensionPrompt = catalogue.extensionPrompt
export const proposals: Proposals = catalogue.proposals

export function isProposed(m: Move): boolean {
  return m.status === 'proposed'
}

export function isParked(m: Move): boolean {
  return m.parked === true
}

/** The entries the app may offer: everything neither proposed nor parked. Selection reads only this. */
export const liveMoves: readonly Move[] = moves.filter((m) => !isProposed(m) && !isParked(m))

const byId = new Map(moves.map((m) => [m.id, m]))

export function moveById(id: string): Move {
  const m = byId.get(id)
  if (!m) throw new Error(`unknown move: ${id}`)
  return m
}

/** Whether an id names a catalogue move; a rung of the ladder or "nothing" does not. */
export function hasMove(id: string): boolean {
  return byId.has(id)
}

export function movesInFamily(familyId: string): Move[] {
  return moves.filter((m) => m.family === familyId)
}

export const STRENGTHS: readonly Strength[] = ['strong', 'moderate', 'weak', 'practice']
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high']
export const NEEDS: readonly Need[] = ['outdoors', 'kit', 'anotherPerson', 'freeHour', 'daylight', 'quiet']
export const WINDOWS: readonly Window[] = ['nextBlock', 'laterToday', 'evening', 'nextMorning', 'sevenDays']
export const COUNTERS: readonly Counter[] = ['study', 'conversations', 'timeWithHer', 'faith', 'finishing']
export const INGREDIENT_TAGS: readonly Ingredient[] = ['outdoors', 'withPeople', 'short', 'lowEffort']
export const REWARD_TAGS: readonly Reward[] = ['pleasure', 'mastery', 'connection']
export const INTENSITIES: readonly Intensity[] = ['low', 'medium', 'high']
/** The plan names these learned tags and no others. */
export const LEARNED_TAG_IDS: readonly string[] = [...INGREDIENT_TAGS, ...REWARD_TAGS, 'intensity']

/** The charisma ladder, in order: audience to participant, since the Phase 9 Green. The four earlier reps stay as reps. */
export const CHARISMA_LADDER: readonly string[] = ['ask-one-question', 'say-one-full-thought', 'tell-one-short-story', 'start-a-topic']
export const CHARISMA_REPS: readonly string[] = ['eye-contact-stranger', 'ten-seconds-past', 'say-the-thing', 'low-pressure-conversation']

/** Ladders: rungs in order. The harder rung is offered when the readings say you can take it. */
export const LADDERS: readonly (readonly string[])[] = [CHARISMA_LADDER]

export function rungOf(id: string): { ladder: readonly string[]; index: number } | null {
  for (const ladder of LADDERS) {
    const index = ladder.indexOf(id)
    if (index !== -1) return { ladder, index }
  }
  return null
}

/**
 * Rule 16: randomise the version, never whether. Only sleep is not a move: bedtime itself is
 * observed, never offered. Study, faith, church and time with her remain offerable; the week's
 * shape decides whether they happen and the draw decides only the version.
 */
export const OBSERVED_ONLY: ReadonlySet<string> = new Set(['early-night', 'fixed-lights-out'])

/** Passive items: decisions that ride alongside the active move in the same block. */
export const PASSIVE: ReadonlySet<string> = new Set(['caffeine-cutoff', 'phone-out-of-bedroom', 'dim-lights-hour', 'dinner-early-light', 'no-alcohol-tonight', 'no-spend-day', 'recovery-gap', 'warm-shower-bath'])

/** "Nothing today": the null offer, a candidate the bandit can learn to pick. Never a catalogue move; named here so the learning engine can see it. */
export const NOTHING = 'nothing'
