import type { Direction, Level } from '../repair/ladder'

// Ask Life Mirror's record (stage A1, 2026-10-19). The owner's questions and, for the quick tier, the answers the app laid
// out from the same evidence the Brain reads. Both stores are the phone's own: synced to the owner's database, in the
// export, never read by the learning engine or the Brain (the agreed design's point 12). Claude's answers (stage A2) come
// back as the brain's own rows, as the skill coach's proposals do; the phone never writes them.

/** The starters (point 3): what do you know, what changed, what to test next, and, from stage A2, the deep tier. */
export type AskStarter = 'know' | 'changed' | 'next' | 'deep'

/** How much a question takes (point 9): the app alone, one focused Claude run, or one broad one. */
export type AskTier = 'quick' | 'standard' | 'deep'

/** Where "Ask about this" was tapped. */
export type AboutSource = 'brain' | 'evidence'

/** A conversation. */
export interface AskThread {
  id?: number
  /** The local day it began, so the cloud copy can read it by day. */
  day: string
  /** When it began. */
  at: string
  /** The first question, as asked. */
  title: string
  /** How it began: a starter, a typed question, or "Ask about this" with its findings. */
  from: { kind: 'starter'; starter: AskStarter } | { kind: 'typed' } | { kind: 'about'; source: AboutSource; keys: string[] }
}

/**
 * A finding an answer cited, with requirement 2's provenance: what it said then, so the phone can tell later whether it
 * changed (point 8). Its key is the test's own: move|reading|window.
 */
export interface AskCitation {
  key: string
  level: Level
  direction: Direction
  revised: boolean
  /** The record's own size range when done, in steps, when it gave one. */
  lo: number | null
  hi: number | null
}

/** An answer the app laid out (the quick tier): its sections in order, each a heading or none, and its lines. Words the app wrote, never Claude's. */
export interface QuickAnswer {
  sections: { title: string | null; lines: string[] }[]
}

/** One question in a thread, and, for a quick one, its answer as laid out then. */
export interface AskTurn {
  id?: number
  threadId: number
  /** The local day it was asked. */
  day: string
  at: string
  question: string
  tier: AskTier
  /**
   * Answered; waiting for Claude (stage A2); cancelled by the owner while it waited; or settled with no checked answer
   * (Item 4, 2026-10-23: it had been settled as answered).
   */
  state: 'answered' | 'waiting' | 'cancelled' | 'failed'
  /** What it asked: a starter, "Ask about this", or a typed question. */
  kind: AskStarter | 'about' | 'typed'
  /** The findings "Ask about this" attached. */
  keys?: string[]
  /** The evidence version it was asked on (`evidenceVersion`). */
  version: string
  /** The quick tier's answer, as laid out then. */
  quick?: QuickAnswer
  /** The findings the answer cited. */
  cited: AskCitation[]
  /** When the turn last changed, so its cloud copy keeps the latest. */
  updatedAt: string
  /**
   * Stage A3 (point 14): the tests asked about, each with the day: the one a question names by both its move and its
   * reading, and each "Test it sooner". Only these keys and days reach the learning engine, never the question.
   */
  asked?: { key: string; day: string }[]
}

/** A note kept from Ask (stage A3, point 12): the owner's own words, kept as a note of a day. A note, never a reading or a finding. */
export interface KeptNote {
  id?: number
  day: string
  text: string
  from: 'ask'
  /** The question it was kept from. */
  turnId?: number
  createdAt: string
  updatedAt: string
}
