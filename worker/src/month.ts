import type { Fact } from '../../src/factTypes'
import { DAY_STORES, dayFacts, OUTSIDE_READ, readDayRows, type DayRows, type LookupCtx } from './lookups'
import { bytesOf, newTally } from './retrieval'
import { addDays } from './time'

// A month of the record, read once in full (2026-11-13): each day's lines exactly as the exact-day lookup words
// them, a few days either side marked as outside the month, served in parts of whole days. The Worker, not the run,
// says whether the month is whole: every store read for it is counted against the database's own count, and a read
// that fell short builds nothing. Nothing here is put on the day's sheet, so nothing here reaches a free model.

/** Days served beside the month, before it and after it. */
export const MONTH_MARGIN = 3
/** A part holds whole days, up to about this many bytes of lines. */
export const MONTH_PART_BYTES = 32 * 1024
/** The most parts a month may have; a month that needs more is not read, and says so. */
export const MONTH_PARTS_MOST = 16
/** How many rows of one store the month's one read asks for. */
export const MONTH_READ = 4000

/** Every kind of record a month's read covers, in the words the briefing says them. */
export const MONTH_COVERED: readonly string[] = [
  'the day’s own row: where it was spent, a day unwell, a day among people, church',
  'each check-in’s readings, chips, caffeine and necessities',
  'private items marked, by name only where names may be shown',
  'your own chips, and the note written at a check-in',
  'every move offered, with what was answered',
  'a learning commitment’s sessions',
  'the steps of the Social and Partner Paths; of the Speaking Path and of generated Paths, only what was done',
  'the Paths’ declared stages, dates and milestones',
  'notes kept from a question',
  'finished workouts',
]

/** What a month's read deliberately leaves out, each with why. */
export const MONTH_LEFT_OUT: readonly { what: string; why: string }[] = [
  { what: 'the journal', why: 'it is never evidence' },
  { what: 'the Brain’s own lines, reviews and coach picks, and earlier write-ups', why: 'a write-up is built from the month’s raw record alone' },
  { what: 'past questions and their answers', why: 'no lookup reads them' },
  { what: 'the log of changes to a Path', why: 'no lookup reads it' },
  { what: 'the Partner Path’s monthly check', why: 'no lookup reads it' },
  { what: 'voice recordings', why: 'they stay on the phone' },
  { what: 'places and the weather', why: 'they are never sent beyond the day’s sheet' },
]

const MONTH_RE = /^\d{4}-\d{2}-01$/

export interface MonthSpan {
  /** The month, YYYY-MM. */
  month: string
  /** Its first and last day. */
  from: string
  to: string
  /** The first and last day served with it. */
  servedFrom: string
  servedTo: string
}

/** The days of the month that begins on a day, with the days served beside it; null unless the day is a month's first. */
export function monthSpan(first: string): MonthSpan | null {
  if (!MONTH_RE.test(first)) return null
  const y = Number(first.slice(0, 4))
  const m = Number(first.slice(5, 7))
  if (m < 1 || m > 12) return null
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { month: first.slice(0, 7), from: first, to, servedFrom: addDays(first, -MONTH_MARGIN), servedTo: addDays(to, MONTH_MARGIN) }
}

export interface MonthPart {
  /** Counted from one. */
  part: number
  /** The days it holds, in order. */
  days: string[]
  /** Those of its days that are outside the month. */
  outside: string[]
  lines: number
  bytes: number
  facts: Fact[]
}

export interface MonthBuilt {
  ok: true
  span: MonthSpan
  parts: MonthPart[]
  /** How many rows of each store the month's lines were built from, each equal to the database's own count. */
  counts: Record<string, number>
  /** The lines of the month's own days. */
  lines: number
  /** A fingerprint of the month's own lines: a change in the record changes it. */
  fingerprint: string
  /** Each note's line, by its id, with the record the note is in: an event noticed in a note is stored against that record. */
  notes: Record<string, NoteSource>
}

/** The record a note's line came from: a check-in's note, or a note kept from a question. */
export interface NoteSource {
  store: 'checkins' | 'notes'
  id: string
  day: string
  block?: string
}

export type MonthBuild = MonthBuilt | { ok: false; reason: string }

/** The rows of a day's store, by the store's name. */
const rowsOf = (rows: DayRows, store: (typeof DAY_STORES)[number]): readonly unknown[] => (store === 'pathMarks' ? rows.marks : rows[store])

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const CHECKIN_NOTE = /at the (morning|afternoon|evening) check-in you wrote: “([\s\S]*)”$/
const KEPT_NOTE = /you kept a note: “([\s\S]*)”$/

/** The record a note's line came from, found among that day's own rows by the note's words and its check-in; null for a line that is no note. */
export function noteSourceOf(f: Fact, day: string, rows: DayRows): NoteSource | null {
  if (f.values.category !== 'notes') return null
  const at = CHECKIN_NOTE.exec(f.text)
  if (at) {
    const row = rows.checkins.find((r) => r.day === day && rec(r.body).block === at[1] && String(rec(rec(r.body).extras).note ?? '').trim() === at[2])
    return row ? { store: 'checkins', id: row.id, day, block: at[1] } : null
  }
  const kept = KEPT_NOTE.exec(f.text)
  if (kept) {
    const row = rows.notes.find((r) => r.day === day && String(rec(r.body).text ?? '').trim() === kept[1])
    return row ? { store: 'notes', id: row.id, day } : null
  }
  return null
}

const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const enc = new TextEncoder()

/** A fingerprint of lines: their ids and words, in order. */
export async function fingerprintOf(facts: readonly Fact[]): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(facts.map((f) => `${f.id}\t${f.text}`).join('\n'))))
}

/** Whole days into parts, in order: a part is closed before the day that would take it past the size; a day larger than a part has one of its own. */
export function partsOf(days: readonly { day: string; inside: boolean; facts: Fact[] }[], most = MONTH_PART_BYTES): MonthPart[] {
  const parts: MonthPart[] = []
  let open: MonthPart | null = null
  for (const d of days) {
    if (!d.facts.length) continue
    const bytes = d.facts.reduce((n, f) => n + bytesOf(f.id) + bytesOf(f.text) + 4, 0)
    if (!open || (open.bytes + bytes > most && open.lines > 0)) {
      open = { part: parts.length + 1, days: [], outside: [], lines: 0, bytes: 0, facts: [] }
      parts.push(open)
    }
    open.days.push(d.day)
    if (!d.inside) open.outside.push(d.day)
    open.lines += d.facts.length
    open.bytes += bytes
    open.facts.push(...d.facts)
  }
  return parts
}

/**
 * A month's lines, whole or not at all. Each store is read once for the month and the days beside it, and its rows
 * counted against the database's own count for the same days: a read that fell short builds nothing.
 */
export async function buildMonth(x: LookupCtx, first: string): Promise<MonthBuild> {
  const span = monthSpan(first)
  if (!span) return { ok: false, reason: `${first} is not the first day of a month` }
  // The third day after the month must itself be over: the month is read from its fourth day after it ends.
  if (span.servedTo >= x.day) return { ok: false, reason: `the month ${span.month} is read once ${MONTH_MARGIN} days have passed after it` }
  const range = { from: span.servedFrom, to: span.servedTo }
  const rows = await readDayRows(x, range, newTally(), MONTH_READ)
  const counts: Record<string, number> = {}
  for (const store of DAY_STORES) {
    const held = await x.store.countRecords(store, range)
    const read = rowsOf(rows, store).length
    if (read !== held) return { ok: false, reason: `the month ${span.month} was not read whole: ${read} of ${held} rows of ${store}` }
    counts[store] = read
  }
  if (rows.outside.length >= OUTSIDE_READ) return { ok: false, reason: `the month ${span.month} was not read whole: the workouts outran one read` }
  const days: { day: string; inside: boolean; facts: Fact[] }[] = []
  const notes: Record<string, NoteSource> = {}
  for (let d = span.servedFrom; d <= span.servedTo; d = addDays(d, 1)) {
    const inside = d >= span.from && d <= span.to
    // A line's day is in its id, so whether it is inside the month is read from there: nothing is added to what a line says.
    const facts = dayFacts(x, d, rows)
    days.push({ day: d, inside, facts })
    for (const f of facts) {
      const source = noteSourceOf(f, d, rows)
      if (source) notes[f.id] = source
    }
  }
  const parts = partsOf(days)
  if (parts.length > MONTH_PARTS_MOST) return { ok: false, reason: `the month ${span.month} needs ${parts.length} parts, more than the ${MONTH_PARTS_MOST} a read may have` }
  const own = days.filter((d) => d.inside).flatMap((d) => d.facts)
  return { ok: true, span, parts, counts, lines: own.length, fingerprint: await fingerprintOf(own), notes }
}
