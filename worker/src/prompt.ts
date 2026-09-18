import { GRADE_PHRASES, MAX_WORDS, MODES } from '../../src/brainShared'
import type { FactSheet } from '../../src/factTypes'
import type { ClaimCard } from '../../src/libraryTypes'
import { cardLines } from './library'

// What the model is asked, and how its answer is read. The facts go in with their ids, the
// cards with theirs; the answer is JSON alone, and the validator on the way back refuses
// anything that is not grounded in them.

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface Said {
  day: string
  text: string
  feedback: string | null
}

export function sheetLines(sheet: FactSheet): string {
  const head = [`Day ${sheet.day}; ${sheet.days} days of record; local hour ${sheet.hour}.`, sheet.direction ? `Direction, in the person's own words: ${sheet.direction}` : null].filter(Boolean)
  const lines = sheet.facts.map((f) => `[${f.id}] ${f.text}${f.n !== undefined ? ` (n=${f.n})` : ''}`)
  return [...head, ...lines].join('\n')
}

const SYSTEM = `You write one line a day for one person's phone. You get the day's fact sheet (each fact has an id in brackets), a set of claim cards from an evidence library (each with an id and a grade), and what was said on recent days with how it landed.

Decide the single most useful thing for this person to hear, understand, reconsider or do right now, and choose one mode: ${MODES.join(', ')}. Sometimes that is an observation, a challenge, a change of strategy, a warning, a recommendation, a perspective, or encouragement. Never comfort by default and never push by default; the facts and the evidence decide.

Rules, all checked by a validator that refuses the line:
- Ground the line in the facts and cite their ids in factIds. Every number you write must appear in a cited fact. Do not invent patterns; a fact's n and tier say how much stands behind it.
- Cite in cardIds the cards you rely on. Speak of evidence only with the phrase matching the strongest cited card's grade: ${Object.entries(GRADE_PHRASES)
  .map(([g, p]) => `${g} "${p}"`)
  .join(', ')}. Never say a finding applies to this person unless a fact shows it.
- Never use the words failed, bad, lazy, behind, weak, slipped again. No score of the person, no streaks, no shame.
- Do not restate what the phone already shows: the readings and their bands, the usual per block, the forecast, last night's comparison, steady or stretch, yesterday's move. Use them as ground for something the person cannot read off the screen.
- Do not repeat what was said recently; if the same thing is still the most useful, say it from a new angle.
- Under ${MAX_WORDS} words. Plain words, second person, no headings, no lists, no emoji.

Answer with JSON only, nothing before or after: {"mode": "...", "text": "...", "factIds": ["..."], "cardIds": ["..."]}`

export function buildMessages(kind: 'brief' | 'review', sheet: FactSheet, cards: readonly ClaimCard[], said: readonly Said[]): Message[] {
  const recent = said.length ? said.map((s) => `${s.day}${s.feedback ? ` (${s.feedback})` : ''}: ${s.text}`).join('\n') : 'nothing yet'
  const task = kind === 'review' ? 'Today is the weekly review: propose at most one change of strategy for the coming week, from the week as the facts show it (commitments, cues, cards, study nights, chips), in the same form.' : 'Today is an ordinary morning: one line for the day ahead.'
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${task}\n\nFACTS\n${sheetLines(sheet)}\n\nCARDS\n${cardLines(cards)}\n\nSAID RECENTLY (useful / knew / not is how it landed)\n${recent}\n\nJSON only.` },
  ]
}

/** The JSON in a model's answer, whatever surrounds it; null when there is none. */
export function parseOutput(text: string): unknown | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}
