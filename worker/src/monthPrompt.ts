import type { EventType } from '../../src/noteEvents/types'
import { NOTICED_MOST, OBSERVATION_WORDS, RECORDED_MOST } from '../../src/writeups/shared'
import { MONTH_COVERED, MONTH_LEFT_OUT, MONTH_MARGIN } from './month'
import { OBSERVATION_LINES, QUOTE_MOST } from './monthCheck'

// What the month's read is told (2026-11-13): the rules its answer is checked by, said once and plainly, so a first
// answer can pass. Nothing here is personal: the month, the number of parts, the list of event types, and the events
// the owner marked wrong, which are the owner's own words handed back so they are not tagged again.

/** An event the owner marked wrong, as a re-read is told of it. */
export interface WrongEvent {
  type: string
  day: string
  quote: string
}

export interface MonthInstructionsInput {
  /** The month, YYYY-MM. */
  month: string
  /** How many parts the month is served in. */
  parts: number
  /** The one list of event types. */
  types: readonly EventType[]
  /** The month's events the owner marked wrong. */
  wrong: readonly WrongEvent[]
  /** What an earlier reading of this month said that the owner marked wrong, in its own words. */
  wrongObservations?: readonly string[]
}

/** The shape of the answer, as the briefing shows it. */
export const MONTH_ANSWER = {
  recorded: [{ text: 'what stood out in what was recorded', factIds: ['ids of the lines it rests on'] }],
  noticed: [{ text: 'a connection you noticed that nobody tested', factIds: ['ids of the lines it rests on'], follow: { kind: 'an id from lookup=kinds', split: 'a split from lookup=pattern', cell: 'a cell of that split' } }],
  events: [{ type: 'a type from EVENT TYPES', factId: 'the id of the note’s line', quote: 'the exact words from that note' }],
} as const

/** The instructions for a month's read. */
export function monthInstructions(x: MonthInstructionsInput): string {
  const types = x.types.length
    ? ['EVENT TYPES, each with what counts as one:', ...x.types.map((t) => `- ${t.id}: ${t.label}. ${t.definition}`)]
    : ['EVENT TYPES: none is listed yet. Write "events": [].']
  const wrong = x.wrong.length ? ['MARKED WRONG by the person, never to be tagged again:', ...x.wrong.map((w) => `- ${w.type} on ${w.day}: “${w.quote}”`)] : []
  const said = x.wrongObservations?.length ? ['OBSERVATIONS MARKED WRONG by the person in an earlier reading of this month, not to be said again in these or other words:', ...x.wrongObservations.map((o) => `- “${o}”`)] : []
  return [
    `You are reading one whole month of one person's own record, ${x.month}, and writing down what stood out. Write to them as "you". Reply with JSON only, in the shape "answer" shows.`,
    `- Read every part before you write: lookup=month&part=1 to lookup=month&part=${x.parts}. A write-up is kept only when every part was read; saying you read them is not enough.`,
    `- Each line has an id in brackets. The ${MONTH_MARGIN} days before the month and the ${MONTH_MARGIN} after are served with it and named as outside it: a line of theirs may be cited beside a line inside the month, never alone.`,
    '- Two lists. "recorded": what stood out in what was recorded. "noticed": connections you noticed that nobody has tested. Each of those is a hypothesis, never a fact.',
    '- No cause, anywhere: a month\'s read holds no test. Say what went with what ("the short nights came before the days you skipped a plan"), never "because", "caused", "led to" or "affected".',
    `- Each observation is its words and "factIds", the ids of every line it rests on, at least one of them inside the month, at most ${OBSERVATION_LINES}. An observation that cites no served line is refused.`,
    '- Write no dates and no weekday counts of your own: the days are listed for the person from the lines you cite. Write "day" for a calendar day, never "date".',
    '- Every number you write must be in a line you cite, or be the count of the days or of the lines you cite. Any other number is refused.',
    `- At most ${RECORDED_MOST} observations under "recorded" and ${NOTICED_MOST} under "noticed", each at most ${OBSERVATION_WORDS} words. Plain words. Leave a list empty rather than fill it.`,
    '- An observation under "noticed" that the record can count may add "follow": the kind, the split and the cell it is about, in the pattern table\'s own ids, which lookup=kinds and lookup=pattern give. It is then counted from the next day on, on what comes after alone. Leave "follow" out where no cell fits; never under "recorded".',
    `- "events": tag a note only where its own words plainly say one of the event types, by that type's definition. Each is the type, the id of the note's line, and "quote": the person's exact words from that note, letter for letter, at most ${QUOTE_MOST} characters. Tag nothing you are unsure of. Where a behaviour recurs in the notes and no type covers it, say so in one observation under "noticed".`,
    '- A private item is named only as its own lines name it. Speak of dating, a date or a partner only where the month\'s lines do, never from what did not happen, never counting or rating anyone.',
    ...types,
    ...wrong,
    ...said,
    `WHAT THIS READ COVERS: ${MONTH_COVERED.join('; ')}.`,
    `WHAT IT LEAVES OUT: ${MONTH_LEFT_OUT.map((l) => `${l.what} (${l.why})`).join('; ')}.`,
  ].join('\n')
}
