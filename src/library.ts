import { copy } from './copy'
import cards from './library.json'
import vocabulary from './libraryTags.json'

// The evidence library: claim cards, not papers. One testable claim each, with its population,
// its effect, a grade, its sources, what it does not cover, and the app concepts it maps to.
// General knowledge only; nothing about any person. The grade is the literature's; what the
// record says about you is a separate axis and never merges with it.

export type Grade = 'A' | 'B' | 'C' | 'D'
export type Replication = 'replicated' | 'mixed' | 'failed' | 'untested'
export type CardStatus = 'admitted' | 'draft' | 'superseded' | 'disputed'

export interface Source {
  cite: string
  /** Null for a book or a chapter without one; the check script verifies every DOI against Crossref. */
  doi: string | null
}

export interface ClaimCard {
  id: string
  claim: string
  domain: string
  tags: string[]
  /** A: several meta-analyses or large trials that replicate. B: one meta-analysis or several trials. C: one trial or strong observational work. D: theory, a book, or small studies. */
  grade: Grade
  replication: Replication
  effect: string
  population: string
  sources: Source[]
  caveats: string
  /** What it means for a move, a cue, a chip or a reading in this app. */
  app: string
  reviewed: string
  status: CardStatus
}

export const DOMAINS: readonly string[] = vocabulary.domains
export const TAGS: readonly string[] = vocabulary.tags
export const library: readonly ClaimCard[] = cards as ClaimCard[]

const ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 }

/** The cards the brief may cite: admitted, never a draft, never one superseded or in dispute. */
export function admitted(): ClaimCard[] {
  return library.filter((c) => c.status === 'admitted')
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
