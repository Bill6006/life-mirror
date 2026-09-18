import type { FactSheet } from './factTypes'
import type { ClaimCard, Grade } from './libraryTypes'

// What the brain may say, checked the same way on the phone and in the Worker: one of the
// modes, grounded in facts named by id, every number taken from those facts, no evidence
// claimed beyond the cited cards' grade, none of Rule 4's verdict words, and short.

export type Mode = 'observation' | 'challenge' | 'perspective' | 'strategy' | 'warning' | 'recommendation' | 'encouragement'
export const MODES: readonly Mode[] = ['observation', 'challenge', 'perspective', 'strategy', 'warning', 'recommendation', 'encouragement']

/** Rule 4 of the plan: a reading, never a verdict. The same list the copy test enforces. */
export const BANNED_WORDS: readonly string[] = ['failed', 'bad', 'lazy', 'behind', 'weak', 'slipped again']

export const MAX_WORDS = 60

export interface BrainOutput {
  mode: Mode
  text: string
  factIds: string[]
  cardIds: string[]
}

export type Validation = { ok: true; value: BrainOutput } | { ok: false; reason: string }

const GRADE_ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 }
/** The phrases a grade may be spoken as; a stronger phrase than the cited cards allow is refused. */
export const GRADE_PHRASES: Record<Grade, string> = { A: 'strong evidence', B: 'good evidence', C: 'some evidence', D: 'thin evidence' }
const EVIDENCE_WORDS = /\b(evidence|research|studies|study shows|meta-analys|trials?)\b/i

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Every number in the text, as written: 62, 3.5, 20:00, 1,250. */
export function numbersIn(text: string): string[] {
  return text.match(/\d+(?:[.,:]\d+)*/g) ?? []
}

/** Whether a number as written appears among the cited facts' values, as a number or inside a string such as a time. */
export function numberGrounded(token: string, sheet: FactSheet, factIds: readonly string[]): boolean {
  const plain = token.replace(/,/g, '')
  for (const f of sheet.facts) {
    if (!factIds.includes(f.id)) continue
    for (const v of Object.values(f.values)) {
      if (typeof v === 'number' && (String(v) === plain || String(Math.round(v)) === plain || Math.abs(v).toString() === plain)) return true
      if (typeof v === 'string' && v.includes(token)) return true
    }
    if (f.n !== undefined && String(f.n) === plain) return true
  }
  return false
}

export function validateOutput(raw: unknown, sheet: FactSheet, cards: readonly ClaimCard[], maxWords = MAX_WORDS): Validation {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' }
  const o = raw as Record<string, unknown>
  const mode = o.mode
  if (typeof mode !== 'string' || !(MODES as readonly string[]).includes(mode)) return { ok: false, reason: `mode "${String(mode)}" is not one of ${MODES.join(', ')}` }
  const text = typeof o.text === 'string' ? o.text.trim() : ''
  if (!text) return { ok: false, reason: 'no text' }
  if (words(text) > maxWords) return { ok: false, reason: `${words(text)} words; at most ${maxWords}` }
  const factIds = Array.isArray(o.factIds) ? o.factIds.filter((x): x is string => typeof x === 'string') : []
  const cardIds = Array.isArray(o.cardIds) ? o.cardIds.filter((x): x is string => typeof x === 'string') : []
  if (factIds.length === 0) return { ok: false, reason: 'no fact cited' }
  const known = new Set(sheet.facts.map((f) => f.id))
  for (const id of factIds) if (!known.has(id)) return { ok: false, reason: `fact "${id}" is not on the sheet` }
  const admitted = new Map(cards.filter((c) => c.status === 'admitted').map((c) => [c.id, c]))
  for (const id of cardIds) if (!admitted.has(id)) return { ok: false, reason: `card "${id}" is not admitted` }
  for (const w of BANNED_WORDS) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) return { ok: false, reason: `uses the word "${w}"` }
  for (const n of numbersIn(text)) if (!numberGrounded(n, sheet, factIds)) return { ok: false, reason: `the number ${n} is not in the cited facts` }
  const best = cardIds.reduce<number>((m, id) => Math.min(m, GRADE_ORDER[(admitted.get(id) as ClaimCard).grade]), 9)
  for (const [grade, phrase] of Object.entries(GRADE_PHRASES) as [Grade, string][]) {
    if (text.toLowerCase().includes(phrase) && GRADE_ORDER[grade] < best) return { ok: false, reason: `says "${phrase}" beyond the cited cards' grade` }
  }
  if (cardIds.length === 0 && EVIDENCE_WORDS.test(text)) return { ok: false, reason: 'speaks of evidence without citing a card' }
  return { ok: true, value: { mode: mode as Mode, text, factIds, cardIds } }
}
