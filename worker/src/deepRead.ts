import { isWriteUpFact } from '../../src/brainShared'
import type { PatternsRecord } from '../../src/counted/stored'
import { cellWords, whenWords } from '../../src/counted/words'
import type { Fact } from '../../src/factTypes'
import type { NoteMark } from '../../src/noteEvents/shared'
import { shownWriteUps, type ShownMonth, type ShownObservation } from '../../src/writeups/join'
import { writeUpOf, WRITEUPS_STORE, type WriteUp } from '../../src/writeups/shared'
import type { Category } from './briefing'
import { mayRead, saidIn, shownLabel, type LookupCtx } from './lookups'
import { MONTH_PARTS_MOST } from './month'
import { obj, privateNames, WRITEUP_HEAD, type DeepLookup } from './retrieval'

// "Coach me on everything" covers everything (2026-11-14): what the deep tier reads beyond the day's sheet and
// ordinary Ask's lookups. Every monthly write-up it may read, under the phone's own rule for what of a write-up is
// shown, applied here at the moment of serving; and the month under way, raw, in parts. A write-up's "you recorded"
// is the record of its month; its "Claude noticed" is a guess, said as one in the fact's own words. Nothing here is
// put on the day's sheet, so nothing here reaches a free model; and ordinary Ask is served none of it.

/** Reads beside the write-ups and the parts of the month under way: spare ones, for a read asked again. */
export const DEEP_SPARE_READS = 4
/** The most reads of the write-ups and of the month under way a run may make: it grows with the months that have a write-up. */
export const deepReadsMost = (months: number): number => months + MONTH_PARTS_MOST + DEEP_SPARE_READS
/** How many times one read may fail before the run is told to go on without it: asked, then asked once more. */
export const DEEP_READ_TRIES = 2
/** How many of an observation's days its fact names before it says how many more there are. */
export const DAYS_NAMED = 8

/** What "Coach me on everything" is told it may ask for beyond ordinary Ask's lookups. */
export const DEEP_LOOKUP_HELP: Readonly<Record<DeepLookup, string>> = {
  writeups: 'lookup=writeups (optional month=YYYY-MM): the monthly write-ups you may read, each month’s newest reading: what was recorded, what Claude noticed, and a noticed guess counted since. It does not count against maxCalls or maxBytes',
  monthSoFar: 'lookup=monthSoFar&part=<n>: the month under way, day by day up to today, every line with its id, in parts of whole days; start at part=1, and each reply says how many parts there are. It does not count against maxCalls or maxBytes',
}

export type DeepQuery = { lookup: 'writeups'; month?: string } | { lookup: 'monthSoFar'; part: number }

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** A query for one of the deep tier's own lookups, read from the URL, or why it is refused. */
export function parseDeepQuery(url: URL): { ok: true; query: DeepQuery } | { ok: false; reason: string } {
  const lookup = url.searchParams.get('lookup')
  if (lookup !== 'writeups' && lookup !== 'monthSoFar') return { ok: false, reason: `lookup "${lookup ?? ''}" is not one of the deep tier’s own` }
  if (url.searchParams.has('category')) return { ok: false, reason: 'ask for a category or a lookup, never both' }
  const own = lookup === 'writeups' ? 'month' : 'part'
  for (const k of url.searchParams.keys()) if (k !== 'task' && k !== 'day' && k !== 'lookup' && k !== own) return { ok: false, reason: `unknown parameter "${k}" for the lookup ${lookup}` }
  if (lookup === 'writeups') {
    const month = url.searchParams.get('month')
    if (month !== null && !MONTH_RE.test(month)) return { ok: false, reason: 'month must be a month, YYYY-MM' }
    return { ok: true, query: { lookup, ...(month ? { month } : {}) } }
  }
  const part = Number(url.searchParams.get('part') ?? '1')
  if (!Number.isInteger(part) || part < 1 || part > MONTH_PARTS_MOST) return { ok: false, reason: `part must be a whole number from 1 to ${MONTH_PARTS_MOST}` }
  return { ok: true, query: { lookup, part } }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** A month's own name, and its name with its year: "October", "October 2026". */
export const monthWord = (month: string): string => MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month
export const monthName = (month: string): string => `${monthWord(month)} ${month.slice(0, 4)}`

export interface ShownNow {
  months: ShownMonth[]
  /** Each write-up as the Worker wrote it, by its id: an observation's faith tag is read from here. */
  raw: Map<string, WriteUp>
}

/**
 * What of the monthly write-ups may be read now: the phone's own rule (the join the phone shows them by), fed from the
 * cloud copy at this moment. A write-up written at or before the forget moment is gone; an observation is there only
 * while every day it cites still holds a record, every kind of record it drew on may be read by this run, faith is
 * readable where it drew on faith, and it names no private item whose name may not be shown. Nothing is kept from an
 * earlier serving.
 */
export async function shownNow(x: Pick<LookupCtx, 'store' | 'a' | 'showPrivate'>): Promise<ShownNow> {
  const [rows, marks, held, names] = await Promise.all([x.store.readBrainRows<unknown>(WRITEUPS_STORE, 500), x.store.readRecords('noteMarks', {}, 2000), x.store.heldDays(), x.showPrivate ? Promise.resolve([] as string[]) : privateNames(x.store)])
  const writeups = rows.flatMap((r) => {
    const w = writeUpOf(r.id, r.body)
    return w ? [w] : []
  })
  const noteMarks: NoteMark[] = marks.flatMap((m) => {
    const b = obj(m.body)
    return (b.kind === 'wrong' || b.kind === 'forget') && typeof b.at === 'string' ? [{ id: m.id, kind: b.kind, at: b.at, updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : b.at }] : []
  })
  const months = shownWriteUps({
    writeups,
    marks: noteMarks,
    days: new Set(held),
    // The one check, as for every read: a kind the layer does not name is closed by it.
    kindOn: (kind) => x.a.allowed(kind as Category),
    faithShown: x.a.allowed('faith'),
    hiddenNames: names,
  })
  return { months, raw: new Map(writeups.map((w) => [w.id, w])) }
}

/** An observation's days as its fact names them: the first few, then how many more. */
function daysWords(days: readonly string[]): { words: string; more: number } {
  const named = days.slice(0, DAYS_NAMED)
  const more = days.length - named.length
  return { words: `${named.join(', ')}${more ? `, and ${more} more ${more === 1 ? 'day' : 'days'}` : ''}`, more }
}

/** The words a "Claude noticed" fact opens with: it says in the fact itself that it is a guess, and that nobody tested it. */
export const NOTICED_WORDS = 'Claude noticed (a guess made on reading the month; nobody tested it)'

/** One observation as a fact: its month, which part it is, its words, and the days it came from. Every number its words say is in its values. */
function observationFact(month: string, o: ShownObservation, faith: boolean): Fact {
  const d = daysWords(o.days)
  const kinds = o.kinds.join('|')
  return {
    id: `${WRITEUP_HEAD}.${month}.${o.part}.${o.place}`,
    tags: faith || o.kinds.includes('faith') ? ['faith'] : [],
    text: `${monthName(month)}, ${o.part === 'recorded' ? 'you recorded' : NOTICED_WORDS}: ${o.text} It came from ${o.days.length === 1 ? 'the day' : 'the days'} ${d.words}.`,
    values: { ...saidIn(o.text), days: o.days.length, ...(d.more ? { more: d.more } : {}), year: Number(month.slice(0, 4)), month, part: o.part, kinds, category: o.kinds.includes('partnerPath') ? 'partnerPath' : (o.kinds[0] ?? 'closed') },
  }
}

/**
 * A followed guess counted since (4.6): the pattern table's own count on the days after it was noticed, as the phone
 * last kept it, said in the words a pattern fact is said in and held to a pattern fact's rule. Null while the table
 * holds no count for it, the kind is gone from the table, or nothing has been counted yet.
 */
function sinceFact(x: Pick<LookupCtx, 'showPrivate'>, month: string, o: ShownObservation, table: PatternsRecord, faith: boolean): Fact | null {
  if (!o.followed) return null
  const kept = table.followed?.find((f) => f.id === o.markId)
  const kind = table.kinds.find((k) => k.id === o.followed?.kind)
  const w = kept ? cellWords(kept.split, kept.cell) : null
  if (!kept || !kind || !w || kept.n + kept.m === 0) return null
  const label = shownLabel(kind, x)
  const kinds = [...new Set([kind.category, ...o.kinds])].join('|')
  return {
    id: `${WRITEUP_HEAD}.${month}.noticed.${o.place}.since`,
    tags: faith || o.kinds.includes('faith') ? ['faith'] : [],
    text: `Counted since Claude noticed it on ${kept.noticedOn}, on the days after alone: ${whenWords({ thing: label, where: w.where, elsewhere: w.elsewhere, k: kept.k, n: kept.n, restK: kept.restK, m: kept.m, standing: kept.standing, direction: kept.direction, family: kept.family })}`,
    values: { k: kept.k, n: kept.n, restK: kept.restK, m: kept.m, pct: kept.n ? Math.round((100 * kept.k) / kept.n) : 0, restPct: kept.m ? Math.round((100 * kept.restK) / kept.m) : 0, family: kept.family, standing: kept.standing, direction: kept.direction, ...saidIn(`${label} ${kind.cutoff ?? ''}`), year: Number(month.slice(0, 4)), month, part: 'since', kinds, category: kind.category },
  }
}

/**
 * The write-ups as facts, the oldest month first: each month's newest reading alone, an observation the owner marked
 * wrong left out, and each fact one this run may read. `table` is the pattern table as the phone last built it, or
 * null when none can be read: then no guess is served with its count.
 */
export function writeUpFacts(x: Pick<LookupCtx, 'a' | 'showPrivate'>, now: ShownNow, table: PatternsRecord | null): Fact[] {
  const out: Fact[] = []
  for (const m of [...now.months].sort((a, b) => (a.month < b.month ? -1 : 1))) {
    const raw = now.raw.get(m.newest.id)
    for (const o of [...m.newest.recorded, ...m.newest.noticed]) {
      if (o.wrong) continue
      const faith = raw?.[o.part][o.place - 1]?.faith === true
      out.push(observationFact(m.month, o, faith))
      const since = table ? sinceFact(x, m.month, o, table, faith) : null
      if (since) out.push(since)
    }
  }
  return out.filter((f) => mayRead(f, x.a))
}

export interface DeepMonths {
  /** The months that have a write-up this run may read, oldest first. */
  have: string[]
  /** The month under way: read raw, in parts. */
  underWay: string
  /** Every earlier month that holds records and has no write-up to serve: never read, forgotten, or wholly hidden. */
  lacking: string[]
}

/** Which months have a write-up among the facts, which is under way, and which earlier months that hold records have none. */
export function monthsOf(facts: readonly Fact[], stamps: readonly { month: string; held: number }[], day: string): DeepMonths {
  const underWay = day.slice(0, 7)
  const have = [...new Set(facts.filter((f) => f.values.part === 'recorded' || f.values.part === 'noticed').map((f) => String(f.values.month)))].sort()
  const lacking = stamps.filter((s) => s.held > 0 && s.month < underWay && !have.includes(s.month)).map((s) => s.month).sort()
  return { have, underWay, lacking }
}

/** The months, as the briefing says them. */
export function monthsText(m: DeepMonths): string {
  return [
    'THE MONTHS',
    m.have.length ? `A write-up can be read for: ${m.have.map(monthName).join(', ')} (lookup=writeups).` : 'No month has a write-up that can be read.',
    `The month under way, ${monthName(m.underWay)}, has no write-up yet: its record is read raw (lookup=monthSoFar&part=1).`,
    ...(m.lacking.length ? [`No write-up can be read for: ${m.lacking.map(monthName).join(', ')}. When you cite a write-up, say that you have none for ${m.lacking.length === 1 ? 'this month' : 'each of these months'}, by the month’s name.`] : []),
  ].join('\n')
}

/**
 * Why an answer that cites a write-up does not say which months it lacks, or null. Each lacking month is named by
 * its own name, as a whole word with its capital: the modal "may" is not the month.
 */
export function lackingRefusal(text: string, factIds: readonly string[], lacking: readonly string[]): string | null {
  if (!lacking.length || !factIds.some(isWriteUpFact)) return null
  const missing = lacking.filter((m) => !new RegExp(`\\b${monthWord(m)}\\b`).test(text))
  return missing.length ? `cites a monthly write-up without saying which months have none: say that no write-up could be read for ${missing.map(monthWord).join(', ')}` : null
}
