import { CAUSAL_WORDS, numbersRefusals } from '../../src/brainShared'
import type { Fact, FactSheet } from '../../src/factTypes'
import { eventTypeOf, type EventType } from '../../src/noteEvents/types'
import { NOTICED_MOST, OBSERVATION_WORDS, RECORDED_MOST, WRITEUP_BYTES, type Observation } from '../../src/writeups/shared'
import type { MonthSpan } from './month'
import { bytesOf } from './retrieval'
import { surfaceGuard, type Surface } from './surface'

// The check on a month's answer (2026-11-13): an observation that cannot be traced to its days is refused. Each
// observation is its words and the ids of the month's lines it rests on; the Worker, never the run, lists the days
// and the kinds of record, from those lines. Every number an observation says is in a line it cites, or is the count
// of the days or of the lines it cites: the one rule every answer already keeps. A month's read holds no test, so no
// cause is claimed. Every reason is given at once, for the one retry.

/** The most lines one observation may cite. */
export const OBSERVATION_LINES = 40
/** The most events one month's answer may tag, and the longest words one may quote. */
export const EVENTS_MOST = 60
export const QUOTE_MOST = 300
/** Words that claim a cause, beside the shared ones: a month's read holds no test. */
export const MONTH_CAUSE = /\b(because|due to|led to|leads? to|results? in|resulted in|thanks to)\b/i

/** An observation that passed: its words, the lines it cites, and what the Worker lists from them. */
export type CheckedObservation = Omit<Observation, 'followed'> & {
  factIds: string[]
  /** The cell of the pattern table a "Claude noticed" observation asks to be followed in; checked against the table when it is stored. */
  follow?: { kind: string; split: string; cell: string }
}

/** An event that passed: its type as the list names it today, the note's line, and the words quoted from the note. */
export interface CheckedEvent {
  type: string
  factId: string
  day: string
  quote: string
}

export interface MonthChecked {
  recorded: CheckedObservation[]
  noticed: CheckedObservation[]
  events: CheckedEvent[]
}

export interface MonthCheckInput {
  /** Every line the month's parts served, the days beside the month included. */
  facts: readonly Fact[]
  span: MonthSpan
  surface: Surface
  /** The one list of event types. */
  types: readonly EventType[]
}

const DAY_ID = /^day\.(\d{4}-\d{2}-\d{2})\.\d+$/
/** The day a line belongs to, read from its id. */
export const dayOfLine = (id: string): string | null => DAY_ID.exec(id)?.[1] ?? null
/** A note's own words, from its line: a check-in's note, or a note kept from a question. */
const NOTE_LINE = /(?:you wrote|you kept a note): “([\s\S]*)”$/
export const noteWordsOfLine = (f: Fact): string | null => (f.values.category === 'notes' ? (NOTE_LINE.exec(f.text)?.[1] ?? null) : null)

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const wordsIn = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length
const ID_PART = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/

/** One observation, checked: what it becomes, or every reason it is refused. */
function observation(v: unknown, part: 'recorded' | 'noticed', place: number, x: MonthCheckInput, byId: ReadonlyMap<string, Fact>, reasons: string[]): CheckedObservation | null {
  const at = `${part === 'recorded' ? 'you recorded' : 'Claude noticed'} ${place}`
  const why: string[] = []
  const o = rec(v)
  const text = o && typeof o.text === 'string' ? o.text.trim() : ''
  if (!text) why.push('has no words')
  const ids = o && Array.isArray(o.factIds) ? [...new Set(o.factIds.filter((i): i is string => typeof i === 'string'))] : []
  if (!ids.length) why.push('cites no line: an observation lists the lines it came from')
  if (ids.length > OBSERVATION_LINES) why.push(`cites ${ids.length} lines; at most ${OBSERVATION_LINES}`)
  const unknown = ids.filter((i) => !byId.has(i))
  if (unknown.length) why.push(`cites ${unknown.length === 1 ? 'a line' : 'lines'} this month's read did not serve: ${unknown.slice(0, 5).join(', ')}`)
  const cited = ids.flatMap((i) => (byId.has(i) ? [byId.get(i) as Fact] : []))
  const days = [...new Set(cited.flatMap((f) => (dayOfLine(f.id) ? [dayOfLine(f.id) as string] : [])))].sort()
  if (cited.length && !days.some((d) => d >= x.span.from && d <= x.span.to)) why.push(`rests only on days outside ${x.span.month}: cite at least one line inside the month`)
  if (text) {
    const n = wordsIn(text)
    if (n > OBSERVATION_WORDS) why.push(`${n} words; at most ${OBSERVATION_WORDS}`)
    // The one number rule, over the lines cited; beside them, the count of the days and of the lines cited may be said.
    const counted: Fact = { id: 'month.cited', tags: [], text: '', values: { days: days.length, lines: cited.length } }
    const sheet = { facts: [...cited, counted] } as unknown as FactSheet
    why.push(...numbersRefusals(text, sheet, [...cited.map((f) => f.id), counted.id]))
    const cause = CAUSAL_WORDS.exec(text) ?? MONTH_CAUSE.exec(text)
    if (cause) why.push(`says "${cause[0]}": a month's read holds no test, so no cause is claimed; say what went with what`)
    const surface = surfaceGuard(text, x.surface)
    if (surface) why.push(surface)
  }
  let follow: CheckedObservation['follow']
  if (o && o.follow !== undefined && o.follow !== null) {
    const f = rec(o.follow)
    if (part === 'recorded') why.push('asks to be followed: only what Claude noticed is followed')
    else if (!f || typeof f.kind !== 'string' || typeof f.split !== 'string' || typeof f.cell !== 'string' || !ID_PART.test(f.kind) || !ID_PART.test(f.split) || !ID_PART.test(f.cell)) why.push('names a pattern to follow without a kind, a split and a cell from the pattern table')
    else follow = { kind: f.kind, split: f.split, cell: f.cell }
  }
  if (why.length) {
    reasons.push(`${at}: ${why.join('; ')}`)
    return null
  }
  const kinds = [...new Set(cited.map((f) => String(f.values.category ?? '')).filter(Boolean))].sort()
  return { text, days, kinds, ...(cited.some((f) => f.tags.includes('faith')) ? { faith: true as const } : {}), factIds: cited.map((f) => f.id), ...(follow ? { follow } : {}) }
}

/** One event, checked: what it becomes, or every reason it is refused. */
function event(v: unknown, place: number, x: MonthCheckInput, byId: ReadonlyMap<string, Fact>, reasons: string[]): CheckedEvent | null {
  const o = rec(v)
  const why: string[] = []
  const type = o && typeof o.type === 'string' ? eventTypeOf(o.type, x.types) : null
  if (!type) why.push('names a type the list of event types does not hold')
  const line = o && typeof o.factId === 'string' ? byId.get(o.factId) : undefined
  const day = line ? dayOfLine(line.id) : null
  const note = line ? noteWordsOfLine(line) : null
  if (!line || note === null) why.push('does not name the line of a note this month’s read served')
  else if (!day || day < x.span.from || day > x.span.to) why.push(`names a note outside ${x.span.month}`)
  const quote = o && typeof o.quote === 'string' ? o.quote : ''
  if (!quote.trim()) why.push('quotes no words')
  else if (quote.length > QUOTE_MOST) why.push(`quotes ${quote.length} characters; at most ${QUOTE_MOST}`)
  else if (note !== null && !note.includes(quote)) why.push('quotes words the note does not hold exactly as quoted')
  if (why.length || !type || !line || !day) {
    reasons.push(`event ${place}: ${why.join('; ')}`)
    return null
  }
  return { type: type.id, factId: line.id, day, quote }
}

/** A month's answer, checked whole: what is kept, or every reason at once. */
export function checkMonth(raw: unknown, x: MonthCheckInput): { ok: true; value: MonthChecked } | { ok: false; reason: string } {
  const o = rec(raw)
  if (!o) return { ok: false, reason: 'not an object' }
  if (!Array.isArray(o.recorded) || !Array.isArray(o.noticed)) return { ok: false, reason: 'the answer has two parts, "recorded" and "noticed", each a list' }
  const events = o.events === undefined || o.events === null ? [] : o.events
  if (!Array.isArray(events)) return { ok: false, reason: '"events" is a list, or left out' }
  const reasons: string[] = []
  if (o.recorded.length + o.noticed.length === 0) reasons.push('no observation: a write-up says at least one thing')
  if (o.recorded.length > RECORDED_MOST) reasons.push(`${o.recorded.length} observations under "you recorded"; at most ${RECORDED_MOST}`)
  if (o.noticed.length > NOTICED_MOST) reasons.push(`${o.noticed.length} observations under "Claude noticed"; at most ${NOTICED_MOST}`)
  if (events.length > EVENTS_MOST) reasons.push(`${events.length} events; at most ${EVENTS_MOST}`)
  const byId = new Map(x.facts.map((f) => [f.id, f]))
  const recorded = o.recorded.map((v, i) => observation(v, 'recorded', i + 1, x, byId, reasons))
  const noticed = o.noticed.map((v, i) => observation(v, 'noticed', i + 1, x, byId, reasons))
  const tagged = events.map((v, i) => event(v, i + 1, x, byId, reasons))
  const bytes = [...o.recorded, ...o.noticed].reduce((n: number, v) => n + bytesOf(typeof rec(v)?.text === 'string' ? (rec(v)?.text as string) : ''), 0)
  if (bytes > WRITEUP_BYTES) reasons.push(`${bytes} bytes of words in all; at most ${WRITEUP_BYTES}`)
  // The same note tagged twice with one type is one event.
  const seen = new Set<string>()
  const once = (tagged.filter(Boolean) as CheckedEvent[]).filter((e) => (seen.has(`${e.factId}|${e.type}`) ? false : (seen.add(`${e.factId}|${e.type}`), true)))
  if (reasons.length) return { ok: false, reason: reasons.join('; and ') }
  return { ok: true, value: { recorded: recorded as CheckedObservation[], noticed: noticed as CheckedObservation[], events: once } }
}
