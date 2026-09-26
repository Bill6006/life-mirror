// The claim card's shape alone, with no imports, shared by the app, the validator and the Worker.

export type Grade = 'A' | 'B' | 'C' | 'D'
export type Replication = 'replicated' | 'mixed' | 'failed' | 'untested'
export type CardStatus = 'admitted' | 'draft' | 'superseded' | 'disputed'

export interface Source {
  cite: string
  /** Null for a book or a chapter without one; the check script verifies every DOI against Crossref. */
  doi: string | null
  /** A PubMed id where a journal predates DOIs. */
  pmid?: string
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
  /** Catalogue moves the claim speaks for, by id: what the brain may propose testing when the record never has. */
  moves?: string[]
  /**
   * The size of the card's main effect when it is medium or large (a standardized difference of about
   * .5 or more, a correlation of about .3 or more, or its equal); absent when small, mixed or
   * unmeasured. Words that say an effect is big need a cited card this size (Pass 4).
   */
  size?: 'medium' | 'large'
  reviewed: string
  status: CardStatus
}
