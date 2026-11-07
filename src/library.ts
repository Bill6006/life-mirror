import { copy } from './copy'
import cards from './library.json'
import vocabulary from './libraryTags.json'

// The evidence library: claim cards, not papers. One testable claim each, with its population,
// its effect, a grade, its sources, what it does not cover, and the app concepts it maps to.
// General knowledge only; nothing about any person. The grade is the literature's; what the
// record says about you is a separate axis and never merges with it.

import type { ClaimCard, Grade } from './libraryTypes'
export type { CardStatus, ClaimCard, Grade, Replication, Source } from './libraryTypes'

export const DOMAINS: readonly string[] = vocabulary.domains
export const TAGS: readonly string[] = vocabulary.tags
export const library: readonly ClaimCard[] = cards as ClaimCard[]

const ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 }

/** The cards the brief may cite: admitted, never a draft, never one superseded or in dispute. */
export function admitted(): ClaimCard[] {
  return library.filter((c) => c.status === 'admitted')
}

/**
 * Cards a generated Path of yours rests on (P5): on this phone only, read by the Path's own screens through
 * pathCardById. The Brain, Ask and the brief never see them: they read the public library alone.
 */
const ownCards: ClaimCard[] = []

export function registerOwnCards(cards: readonly ClaimCard[]): void {
  ownCards.splice(0, ownCards.length, ...cards.filter((c) => !library.some((l) => l.id === c.id)))
}

/** The cards a Path may cite: the public library's and your generated Paths' own (P5); the Brain and Ask read the library alone. */
export function pathCards(): readonly ClaimCard[] {
  return [...library, ...ownCards]
}

/** A card as a Path's screens read it: the public library's, else one of your generated Paths' own. */
export function pathCardById(id: string): ClaimCard | undefined {
  return cardById(id) ?? ownCards.find((c) => c.id === id)
}

export function cardById(id: string): ClaimCard | undefined {
  return library.find((c) => c.id === id)
}

/** Admitted cards sharing any of the tags, strongest grade first, then most recently reviewed. */
export function cardsFor(tags: readonly string[]): ClaimCard[] {
  const want = new Set(tags)
  return admitted()
    .filter((c) => c.tags.some((t) => want.has(t)))
    .sort((a, b) => ORDER[a.grade] - ORDER[b.grade] || (a.reviewed < b.reviewed ? 1 : a.reviewed > b.reviewed ? -1 : 0))
}

/** The one phrase a grade may be spoken as; the validator allows no stronger. */
export function gradeWord(g: Grade): string {
  return copy.brain.grades[g]
}

/** How much a card's grade counts for in choosing what to say: strong evidence outranks thin. */
export function gradeWeight(g: Grade | null): number {
  return g === 'A' ? 1 : g === 'B' ? 0.85 : g === 'C' ? 0.7 : g === 'D' ? 0.55 : 0.6
}

/** The strongest grade among cards, or null with none. */
export function bestGrade(ids: readonly string[]): Grade | null {
  let best: Grade | null = null
  for (const id of ids) {
    const c = cardById(id)
    if (c && c.status === 'admitted' && (best === null || ORDER[c.grade] < ORDER[best])) best = c.grade
  }
  return best
}
