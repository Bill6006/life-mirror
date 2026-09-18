import { GRADE_PHRASES, LINE_CUES, MAX_WORDS, MODES, REVIEW_PART_WORDS } from '../../src/brainShared'
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

const GRADES = Object.entries(GRADE_PHRASES)
  .map(([g, p]) => `${g} "${p}"`)
  .join(', ')

const RULES = `Rules, all checked by a validator that refuses the answer:
- Ground what you say in the facts and cite their ids in factIds: the ids in brackets in FACTS, such as aim.1 or assoc.napped. Every number you write must appear in a cited fact. Do not invent patterns; a fact's n and tier say how much stands under it.
- Cite in cardIds the cards you rely on: only the ids in brackets in CARDS, kebab-case words such as implementation-intentions. A fact id never goes in cardIds, even one that describes a test card. Speak of evidence only with the phrase matching the strongest cited card's grade: ${GRADES}. Never say a finding applies to this person unless a fact shows it.
- Never use the words failed, bad, lazy, behind, weak, slipped again. No score of the person, no streaks, no shame.
- Facts named note.* are the person's own words, typed at a check-in. Read them as context for what is going on in their life and let them change what you say; refer to what they wrote in your own words, quote at most a few of theirs, and never judge them.
- The facts trajectory.* and cadence are the earliest signs of a commitment, or the whole record, being let go. When one of them shows it, speak to that before anything smaller.
- The followup fact says what the record shows since the last line. Close that loop when it matters: say plainly what was done, or name what did not happen and make the next step smaller, never heavier.
- Do not restate what the phone already shows: the readings and their bands, the usual per block, the forecast, last night's comparison, steady or stretch, yesterday's move. Use them as ground for something the person cannot read off the screen.
- Do not repeat what was said recently; if the same thing is still the most useful, say it from a new angle.
- Plain words, second person, no headings, no lists, no emoji.`

const SYSTEM = `You write one line a day for one person's phone. You get the day's fact sheet (each fact has an id in brackets), a set of claim cards from an evidence library (each with an id and a grade), and what was said on recent days with how it landed.

Decide the single most useful thing for this person to hear, understand, reconsider or do right now, and choose one mode: ${MODES.join(', ')}. Sometimes that is an observation, a challenge, a change of strategy, a warning, a recommendation, a perspective, or encouragement. Never comfort by default and never push by default; the facts and the evidence decide.

${RULES}
- Under ${MAX_WORDS} words.
- When the line asks the person to do one of three things, offer it as "action" so one tap does it; otherwise "action" is null. Only these: {"kind":"plan","aimId":N,"cue":"${LINE_CUES.join('|')}"} to pin the step of the commitment in fact aim.N to a moment today; {"kind":"depth","value":"short"} to make the check-in lighter, only when the cadence fact says the depth is full; {"kind":"test","moveId":"<an id given in parentheses in the untested fact>"} to set a test the record has never run. Never offer an action the text does not itself recommend.

Answer with JSON only, nothing before or after: {"mode": "...", "text": "...", "factIds": ["..."], "cardIds": ["..."], "action": null}`

const REVIEW_SYSTEM = `You write the weekly review for one person's phone, on Sunday, from the week as the fact sheet shows it: the trajectories of their commitments over four weeks, the cadence of their check-ins, the record of each cue, the cards being tested, study nights, chips, their own notes, and what was said this week with how it landed.

Three short parts. "held": what held this week, stated as facts. "didNot": what did not, stated as facts, with no verdict on the person. "change": at most one change of strategy for the coming week, the one the facts and the evidence most support; if nothing should change, say what to keep and why.

${RULES}
- Each part under ${REVIEW_PART_WORDS} words. The citations cover all three parts together.

Answer with JSON only, nothing before or after: {"held": "...", "didNot": "...", "change": "...", "factIds": ["..."], "cardIds": ["..."]}`

function userContent(task: string, sheet: FactSheet, cards: readonly ClaimCard[], said: readonly Said[]): string {
  const recent = said.length ? said.map((s) => `${s.day}${s.feedback ? ` (${s.feedback})` : ''}: ${s.text}`).join('\n') : 'nothing yet'
  return `${task}\n\nFACTS (the ids in brackets are what factIds may hold)\n${sheetLines(sheet)}\n\nCARDS (the ids in brackets are what cardIds may hold)\n${cardLines(cards)}\n\nSAID RECENTLY (useful / knew / not is how it landed)\n${recent}\n\nJSON only.`
}

export function buildMessages(sheet: FactSheet, cards: readonly ClaimCard[], said: readonly Said[]): Message[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userContent('Today is an ordinary morning: one line for the day ahead.', sheet, cards, said) },
  ]
}

export function buildReviewMessages(sheet: FactSheet, cards: readonly ClaimCard[], said: readonly Said[]): Message[] {
  return [
    { role: 'system', content: REVIEW_SYSTEM },
    { role: 'user', content: userContent('Today is the weekly review: three parts, for the week that ended and the one that begins.', sheet, cards, said) },
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
