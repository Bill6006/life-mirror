import { churchWords } from '../../src/church'
import { MIN_OCCURRENCES, MIN_SIDE, ratesBy, standings, type CellPoint, type CellRate } from '../../src/counted/compare'
import { LEFT_OUT } from '../../src/counted/leftOut'
import { LEVEL_BAND_WORDS, PATTERNS_ID, PATTERNS_MAX_AGE_MS, readPatterns, TABLE_MIN_OCCURRENCES, TABLE_MIN_SIDE, type PatternsRecord, type StoredKind } from '../../src/counted/stored'
import { cellWords, kindWords, levelWords, noteShareWords, SPLIT_WORDS, whenWords } from '../../src/counted/words'
import type { Fact } from '../../src/factTypes'
import { coarseOf, holdsWords, parseNoteWords } from '../../src/noteWords'
import { outsideDayOf } from '../../src/outsideRow'
import { GENERATED_STORE, type GeneratedPathRow } from '../../src/pathJob'
import { AWAY_FROM_HOME } from '../../src/postWindow'
import { readingById } from '../../src/readings'
import { permitted } from './briefing'
import { CAFFEINE, EXTRAS, factCategories, FAITH_WORDS, isFaithMove, LOOKUPS, newTally, obj, OUTCOMES, recordsOf, rowsNotRead, str, type Access, type Catalogue, type Lookup, type ReadTally } from './retrieval'
import { addDays, localTime } from './time'
import type { RecordRow, Store } from './turso'

// The lookups (2026-11-13): what an Ask run may ask of the record beyond the day's sheet, each answered with facts. A
// fact has an id, its words, and every number its words say in its values, so the one checker that holds an answer
// to the sheet holds it to these as well. Every fact says the category it is read under, and is dropped unless the
// run may read that category: the same check, the same switches, as every other read. Nothing here is put on the
// sheet, so nothing here reaches a free model. The Worker counts nothing over the raw record: the pattern table is
// built on the phone and served here a kind at a time; the other lookups list what was recorded, as it was worded.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
/** How far back a lookup over a range of days reaches: what a category read reaches today. */
const REACH_DAYS = 366
/** A forecast may be asked for up to this many days ahead of the task's day. */
const FORECAST_AHEAD = 7

/** Each lookup's own parameters; any other is refused. */
export const LOOKUP_PARAMS: Readonly<Record<Lookup, readonly string[]>> = { kinds: ['q'], pattern: ['kind'], day: ['date'], moves: ['from', 'to', 'limit'], workouts: ['from', 'to'], pathSteps: ['from', 'to'], lines: ['from', 'to'], forecasts: ['date'], noteWords: ['q', 'from', 'to'] }

export type LookupQuery =
  | { lookup: 'kinds'; q?: string }
  | { lookup: 'pattern'; kind: string }
  | { lookup: 'day' | 'forecasts'; date: string }
  | { lookup: 'moves' | 'workouts' | 'pathSteps' | 'lines'; from: string; to: string; limit: number }
  | { lookup: 'noteWords'; words: string[]; from: string; to: string }

/** What a run is told it may ask for, one line a lookup: the briefing's `context.lookups`. */
export const LOOKUP_HELP: Readonly<Record<Lookup, string>> = {
  kinds: 'lookup=kinds (optional q, a keyword): what the record counts, each with its id; and what it deliberately does not count',
  pattern: 'lookup=pattern&kind=<an id from kinds>: when that thing was recorded, by the weekday, the check-in and what came before, as "k of n" with each comparison’s standing; kind=level gives the reading out of 100 as averages',
  day: 'lookup=day&date=YYYY-MM-DD: everything recorded that day, in the order of its clock times',
  moves: 'lookup=moves&from=&to= (optional limit): ordinary moves offered, day by day, with what was answered',
  workouts: 'lookup=workouts&from=&to=: each finished workout and its date',
  pathSteps: 'lookup=pathSteps&from=&to=: steps of the Speaking Path and of generated Paths that were done',
  lines: 'lookup=lines&from=&to=: the Brain’s own past lines and weekly reviews',
  forecasts: 'lookup=forecasts&date=YYYY-MM-DD: the forecasts stored for that day, how each scored, and how often a forecast’s range has held',
  noteWords: 'lookup=noteWords&q=<one to five words or phrases, separated by commas> (optional from=&to=): how many notes hold those whole words, when those notes were written set beside when notes are written at all, and each note that holds them',
}

/** A lookup query read from the URL, or why it is refused. */
export function parseLookupQuery(url: URL, day: string): { ok: true; query: LookupQuery } | { ok: false; reason: string } {
  const name = url.searchParams.get('lookup') ?? ''
  if (!(LOOKUPS as readonly string[]).includes(name)) return { ok: false, reason: `lookup "${name}" is not one the layer names` }
  const lookup = name as Lookup
  if (url.searchParams.has('category')) return { ok: false, reason: 'ask for a category or a lookup, never both' }
  for (const k of url.searchParams.keys()) if (k !== 'task' && k !== 'day' && k !== 'lookup' && !LOOKUP_PARAMS[lookup].includes(k)) return { ok: false, reason: `unknown parameter "${k}" for the lookup ${lookup}` }
  if (lookup === 'kinds') {
    const q = url.searchParams.get('q') ?? undefined
    if (q !== undefined && q.length > 60) return { ok: false, reason: 'q is at most 60 characters' }
    return { ok: true, query: { lookup, ...(q?.trim() ? { q: q.trim() } : {}) } }
  }
  if (lookup === 'pattern') {
    const kind = url.searchParams.get('kind') ?? ''
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(kind)) return { ok: false, reason: 'kind must be an id the lookup kinds gave' }
    return { ok: true, query: { lookup, kind } }
  }
  if (lookup === 'day' || lookup === 'forecasts') {
    const date = url.searchParams.get('date') ?? ''
    if (!DAY_RE.test(date)) return { ok: false, reason: 'date must be a day, YYYY-MM-DD' }
    if (lookup === 'day' && date > day) return { ok: false, reason: 'date may not be after the task’s day' }
    if (lookup === 'forecasts' && date > addDays(day, FORECAST_AHEAD)) return { ok: false, reason: `a forecast reaches ${FORECAST_AHEAD} days ahead at most` }
    return { ok: true, query: { lookup, date } }
  }
  const to = url.searchParams.get('to') ?? day
  // A search of the notes reaches the whole year unless it is told otherwise: "all the times I've noted" is not a month.
  const from = url.searchParams.get('from') ?? addDays(day, lookup === 'noteWords' ? -REACH_DAYS : -30)
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) return { ok: false, reason: 'from and to must be days, from before to' }
  if (to > day) return { ok: false, reason: 'to may not be after the task’s day' }
  if (from < addDays(day, -REACH_DAYS)) return { ok: false, reason: 'from may reach back a year at most' }
  if (lookup === 'noteWords') {
    const words = parseNoteWords(url.searchParams.get('q') ?? '')
    return words.ok ? { ok: true, query: { lookup, words: words.words, from, to } } : { ok: false, reason: words.reason }
  }
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw === null ? 50 : Number(limitRaw)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { ok: false, reason: 'limit must be from 1 to 100' }
  return { ok: true, query: { lookup, from, to, limit } }
}

export interface LookupCtx {
  store: Store
  catalogue: Catalogue
  a: Access
  /** The task's own day. */
  day: string
  now: Date
  timeZone: string
  /** Whether private items' names may be shown. */
  showPrivate: boolean
  /** The question being answered: read only to tell which private item it names, when names may not be shown. */
  question: string
}

export interface LookupReply {
  facts: Fact[]
  /** Whether everything the lookup covers was read and is here. */
  complete: boolean
  /** Rows the database held that a read did not reach. */
  notRead: number
  /** Why nothing, or less, could be served. */
  note?: string
}

const NO_AIMS: ReadonlyMap<string, string> = new Map()
const cap = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`
const pad = (n: number): string => String(n).padStart(2, '0')
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The Brain's own past lines and reviews, for a lookup alone. Ask's sheet and its category reads stay without them, as
 * its design set (the Brain's earlier lines are never evidence); the build agreed on 2026-11-09 names them as a lookup
 * Ask may use, so here they are read under the governing rules and the owner's own switch for the Brain's history.
 */
const linesAllowed = (a: Access): boolean => permitted('line', 'claude', 'brainHistory', a.gates, a.prefs.switches)

/** Whether a run may read a lookup's fact: every category it belongs to, and no faith word while faith may not be read. */
export function mayRead(f: Fact, a: Access): boolean {
  return factCategories(f, NO_AIMS).every((c) => a.allowed(c) || (c === 'brainHistory' && f.id.split('.')[0] === 'lines' && linesAllowed(a))) && (a.allowed('faith') || !FAITH_WORDS.test(f.text))
}

/** A lookup's fact: its category rides in its values, and a faith practice carries faith's tag. */
function fact(id: string, text: string, category: string, values: Record<string, number | string | null> = {}, faith = false): Fact {
  return { id, tags: faith ? ['faith'] : [], text, values: { ...values, category } }
}

/** Every number a label says, so an answer that repeats the label is held to it: "under 40 out of 100" says 40 and 100. */
function saidIn(label: string): Record<string, number> {
  const out: Record<string, number> = {}
  ;(label.match(/\d+/g) ?? []).forEach((n, i) => (out[`said${i + 1}`] = Number(n)))
  return out
}

/** The pattern table as the phone last built it, or why it cannot be served. */
async function tableOf(x: LookupCtx): Promise<{ table: PatternsRecord } | { note: string }> {
  const body = await x.store.readRecord('patterns', PATTERNS_ID)
  if (body === null || body === undefined) return { note: 'no pattern table has been built yet: the phone builds it when the app is next opened' }
  const table = readPatterns(body)
  if (!table) return { note: 'the pattern table could not be read' }
  const age = x.now.getTime() - Date.parse(table.updatedAt)
  if (!Number.isFinite(age) || age > PATTERNS_MAX_AGE_MS) return { note: `the pattern table is stale (${table.updatedAt}): the phone rebuilds it when the app is next opened` }
  return { table }
}

/** A kind's name as this run may say it: a private item's own name only where names may be shown. */
const shownLabel = (k: StoredKind, x: LookupCtx): string => (k.private && !x.showPrivate ? 'a private item' : k.label)

/** Whether the question itself holds a private item's name, as a whole word: the one the person is asking about. */
const namedByQuestion = (k: StoredKind, x: LookupCtx): boolean => k.private && !x.showPrivate && k.label.trim().length > 0 && new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(k.label.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(x.question)

async function kindsLookup(x: LookupCtx, q: { q?: string }): Promise<LookupReply> {
  const needle = q.q?.toLowerCase()
  const left = LEFT_OUT.filter((l) => !needle || l.label.toLowerCase().includes(needle)).map((l) => fact(`kinds.leftOut.${l.id}`, `Not counted: ${l.label}. ${cap(l.reason)}.`, 'factSheet'))
  const t = await tableOf(x)
  if ('note' in t) return { facts: left, complete: false, notRead: 0, note: t.note }
  const facts: Fact[] = []
  for (const k of t.table.kinds) {
    const named = namedByQuestion(k, x)
    const label = shownLabel(k, x)
    // A keyword finds a kind by its words or by its id, so "sleep" finds a short night too.
    if (needle && !label.toLowerCase().includes(needle) && !k.id.toLowerCase().includes(needle) && !named) continue
    const text = `${cap(label)}: counted by the ${k.unit === 'day' ? 'day' : 'check-in'}; recorded at ${k.occurrences} of ${k.known} it can speak for${k.cutoff ? `; cut-off: ${k.cutoff}` : ''}${k.since ? `; counted from ${k.since}` : ''}. Its pattern: lookup=pattern&kind=${k.id}.${named ? ' This is the private item the question names.' : ''}`
    facts.push(fact(`kinds.${k.id}`, text, k.category, { occurrences: k.occurrences, known: k.known, ...saidIn(`${label} ${k.cutoff ?? ''}`) }))
  }
  if (t.table.level.length && (!needle || 'the reading out of 100, the level'.includes(needle))) facts.push(fact('kinds.level', 'The reading out of 100: its average in each cell of the table, with how the check-ins fell across the five bands. Its averages: lookup=pattern&kind=level. An average describes; whether a difference stands is said by the kinds level.low and level.high.', 'dayRecord', { scale: 100 }))
  return { facts: [...facts, ...left], complete: true, notRead: 0 }
}

const STANDING_ORDER = ['tooFew', 'noPattern', 'lead', 'pattern']

async function patternLookup(x: LookupCtx, q: { kind: string }): Promise<LookupReply> {
  const t = await tableOf(x)
  if ('note' in t) return { facts: [], complete: false, notRead: 0, note: t.note }
  const upTo = addDays(t.table.builtFor, -1)
  if (q.kind === 'level') {
    const facts = t.table.level.flatMap((l) => {
      const w = cellWords(l.split, l.cell)
      if (!w || l.n === 0) return []
      const bands = Object.fromEntries(LEVEL_BAND_WORDS.map((_, i) => [`band${i + 1}`, l.bands[i] ?? 0]))
      return [fact(`pattern.level.${l.split}.${l.cell}`, levelWords({ where: w.where, elsewhere: w.elsewhere, n: l.n, mean: l.mean, bands: l.bands, bandNames: LEVEL_BAND_WORDS, restN: l.restN, restMean: l.restMean }), 'dayRecord', { mean: Math.round(l.mean), n: l.n, restMean: Math.round(l.restMean), restN: l.restN, scale: 100, low: 40, high: 80, ...bands })]
    })
    return { facts, complete: true, notRead: 0, ...(facts.length ? {} : { note: 'no check-in has been counted yet' }) }
  }
  const k = t.table.kinds.find((kind) => kind.id === q.kind)
  // An id the table does not hold and one this run may not read are answered alike, so a refusal tells nothing.
  const none = `no kind "${q.kind}" that this run may read: lookup=kinds lists the ids`
  if (!k) return { facts: [], complete: true, notRead: 0, note: none }
  const label = shownLabel(k, x)
  const cells = (k.cells ?? []).flatMap((c) => {
    const w = cellWords(c.split, c.cell)
    return w && c.n > 0 ? [{ c, w }] : []
  })
  const best = k.family > 0 && cells.length ? STANDING_ORDER[Math.max(...cells.map(({ c }) => STANDING_ORDER.indexOf(c.standing)))] : null
  const said = saidIn(`${label} ${k.cutoff ?? ''}`)
  const whole = fact(
    `pattern.${k.id}.all`,
    kindWords({ label, unit: k.unit, known: k.known, occurrences: k.occurrences, family: k.family, splits: [...new Set(cells.map(({ c }) => SPLIT_WORDS[c.split]))], ...(k.cutoff ? { cutoff: k.cutoff } : {}), ...(k.since ? { since: k.since } : {}), upTo, best: best as never, minSide: TABLE_MIN_SIDE, minOccurrences: TABLE_MIN_OCCURRENCES }),
    k.category,
    { occurrences: k.occurrences, known: k.known, family: k.family, ...(k.family === 0 ? { minSide: TABLE_MIN_SIDE, minOccurrences: TABLE_MIN_OCCURRENCES } : {}), ...said },
  )
  const each = cells.map(({ c, w }) =>
    fact(`pattern.${k.id}.${c.split}.${c.cell}`, whenWords({ thing: label, where: w.where, elsewhere: w.elsewhere, k: c.k, n: c.n, restK: c.restK, m: c.m, standing: c.standing, direction: c.direction, family: k.family }), k.category, {
      k: c.k,
      n: c.n,
      restK: c.restK,
      m: c.m,
      pct: c.n ? Math.round((100 * c.k) / c.n) : 0,
      restPct: c.m ? Math.round((100 * c.restK) / c.m) : 0,
      family: k.family,
      standing: c.standing,
      direction: c.direction,
      ...said,
    }),
  )
  const facts = [whole, ...each].filter((f) => mayRead(f, x.a))
  return { facts, complete: true, notRead: 0, ...(facts.length ? {} : { note: none }) }
}

/** A clock time in the home zone, with the calendar day named when it is not the day the record is filed under, and home time said for a day away. */
function timeWords(at: string, filed: string, zone: string, traveling: boolean): { clock: string; words: string } | null {
  const ms = Date.parse(at)
  if (!Number.isFinite(ms)) return null
  const t = localTime(new Date(ms), zone)
  const clock = `${pad(t.hour)}:${pad(t.minute)}`
  return { clock, words: `${clock}${t.day !== filed ? ` (on ${t.day} by the calendar; filed under ${filed})` : ''}${traveling ? ' (home time: logged while traveling)' : ''}` }
}

/** The day a moment is filed under, in the home zone: the app's day begins at four in the morning. */
export function homeDay(at: string, zone: string): string | null {
  const ms = Date.parse(at)
  if (!Number.isFinite(ms)) return null
  const t = localTime(new Date(ms), zone)
  return t.hour < 4 ? addDays(t.day, -1) : t.day
}

interface DayLine {
  /** When it happened, for the order; null for what belongs to the whole day. */
  at: string | null
  text: string
  category: string
  faith?: boolean
  values?: Record<string, number | string | null>
}

const NECESSITY: Readonly<Record<string, string>> = { shower: 'a shower missed', teeth: 'teeth not brushed', food: 'a meal missed' }

/** A move as the day's lines name it: the catalogue's name, a generated step's own name, or the offer's label. */
function moveName(x: LookupCtx, b: Record<string, unknown>, generated: ReadonlyMap<string, string>): string {
  const id = str(b.moveId)
  return x.catalogue.get(id)?.name ?? generated.get(id) ?? (str(b.label) || 'a step')
}

/** The names of generated Paths' steps and of the Paths themselves: the name each was shown under, and nothing else of a Path's version. */
async function generatedNames(store: Store): Promise<{ steps: Map<string, string>; paths: Map<string, string> }> {
  const steps = new Map<string, string>()
  const paths = new Map<string, string>()
  for (const r of await store.readBrainRows<GeneratedPathRow>(GENERATED_STORE, 500)) {
    const row = obj(r.body)
    for (const rep of Array.isArray(row.reps) ? row.reps : []) {
      const m = obj(rep)
      if (str(m.id) && str(m.name) && !steps.has(str(m.id))) steps.set(str(m.id), str(m.name))
    }
    const name = str(obj(row.path).name)
    if (str(row.pathId) && name && !paths.has(str(row.pathId))) paths.set(str(row.pathId), name)
  }
  return { steps, paths }
}

const PATH_NAMES: Readonly<Record<string, string>> = { social: 'the Social Path', partner: 'the Partner Path', speaking: 'the Speaking Path' }
const pathCategoryOf = (path: string): string => (path === 'social' ? 'socialPath' : path === 'partner' ? 'partnerPath' : 'commitments')

/** The day's offers with their answers, as lines: an ordinary move, or a Path's step under that Path's own switch. */
function offerLines(x: LookupCtx, offers: readonly { body: unknown }[], outcomes: readonly { body: unknown }[], generated: { steps: ReadonlyMap<string, string>; paths: ReadonlyMap<string, string> }, time: (at: string) => { clock: string; words: string } | null): DayLine[] {
  const answer = new Map<number, { outcome: string; at: string }>()
  for (const o of outcomes) {
    const b = obj(o.body)
    if (typeof b.offerId === 'number' && typeof b.outcome === 'string') answer.set(b.offerId, { outcome: b.outcome, at: str(b.at) })
  }
  const out: DayLine[] = []
  for (const o of offers) {
    const b = obj(o.body)
    const id = str(b.moveId)
    if (b.skippedAt || !id || id === 'nothing') continue
    const said = typeof b.id === 'number' ? answer.get(b.id) : undefined
    const paths = (Array.isArray(b.paths) ? b.paths : []).filter((p): p is string => typeof p === 'string')
    const name = moveName(x, b, generated.steps)
    const faith = isFaithMove(x.catalogue, id)
    const answered = said ? `, ${OUTCOMES[said.outcome] ?? said.outcome}${time(said.at) ? ` at ${time(said.at)?.clock}` : ''}` : ', not answered'
    const values = { ...(said && time(said.at) ? { answeredAt: time(said.at)?.clock ?? null } : {}) }
    if (!paths.length) {
      // A session of a learning commitment's skill is the commitments' own; every other offer on no Path is an ordinary move.
      out.push({ at: str(b.at), text: `${name} offered${answered}`, category: id.startsWith('skill:') ? 'commitments' : 'dayRecord', faith, values })
      continue
    }
    for (const path of paths) {
      const own = path === 'social' || path === 'partner'
      // A Speaking or generated Path's step is listed only once it was done: what you did, never what the Path holds.
      if (!own && said?.outcome !== 'done' && said?.outcome !== 'partly') continue
      const on = PATH_NAMES[path] ?? (generated.paths.get(path) ? `your Path “${generated.paths.get(path)}”` : 'a Path of yours')
      out.push({ at: str(b.at), text: `a step on ${on}: ${name}${answered}`, category: pathCategoryOf(path), faith, values })
    }
  }
  return out
}

/** The rows the lines of a day are built from (2026-11-13): read once for a range of days, so a month is read in one pass and never a day at a time. */
export interface DayRows {
  days: RecordRow[]
  checkins: RecordRow[]
  offers: RecordRow[]
  outcomes: RecordRow[]
  items: RecordRow[]
  settings: unknown
  notes: RecordRow[]
  marks: RecordRow[]
  outside: { id: string; body: string | null }[]
  generated: { steps: Map<string, string>; paths: Map<string, string> }
}

/** The stores read by their days for a day's lines: the month's read counts each against the database's own count. */
export const DAY_STORES = ['days', 'checkins', 'offers', 'outcomes', 'notes', 'pathMarks'] as const
/** How many finished workouts one read reaches; at that many the read says it is not whole. */
export const OUTSIDE_READ = 1000

/** Reads everything the lines of the days in a range are built from, each store through one read. */
export async function readDayRows(x: Pick<LookupCtx, 'store'>, range: { from: string; to: string }, tally: ReadTally, limit = 500): Promise<DayRows> {
  const read = { store: x.store, tally }
  const [days, checkins, offers, outcomes, items, settings, notes, marks, outside, generated] = await Promise.all([
    recordsOf(read, 'days', range, limit),
    recordsOf(read, 'checkins', range, limit),
    recordsOf(read, 'offers', range, limit),
    recordsOf(read, 'outcomes', range, limit),
    recordsOf(read, 'privateItems'),
    x.store.readRecord('settings', '1'),
    recordsOf(read, 'notes', range, limit),
    recordsOf(read, 'pathMarks', range, limit),
    x.store.readOutsideWorkouts(OUTSIDE_READ),
    generatedNames(x.store),
  ])
  return { days, checkins, offers, outcomes, items, settings, notes, marks, outside, generated }
}

/** One day's lines as facts, in the order of their clock times, from rows already read: that day's rows alone are used. */
export function dayFacts(x: LookupCtx, D: string, rows: DayRows): Fact[] {
  const of = (list: readonly RecordRow[]): RecordRow[] => list.filter((r) => r.day === D)
  const [days, checkins, offers, outcomes, notes, marks] = [of(rows.days), of(rows.checkins), of(rows.offers), of(rows.outcomes), of(rows.notes), of(rows.marks)]
  const { items, settings, outside, generated } = rows
  const dayRow = obj(days[0]?.body)
  const traveling = AWAY_FROM_HOME === 'open' && dayRow.awayFromHome === true
  const time = (at: string) => timeWords(at, D, x.timeZone, traveling)
  const lines: DayLine[] = []

  if (days.length) {
    const parts = [traveling ? 'out of town, traveling' : dayRow.atOffice ? 'at the office' : 'at home', dayRow.pickupTime && dayRow.withHer !== false ? `a daycare day, pickup at ${str(dayRow.pickupTime)}` : null, dayRow.studyNight ? 'a preferred study day' : null, dayRow.unwell ? 'a day unwell' : null, dayRow.amongPeople ? 'a day out among people' : null].filter(Boolean)
    lines.push({ at: null, text: `the day: ${parts.join('; ')}`, category: 'dayRecord', values: dayRow.pickupTime ? { pickup: str(dayRow.pickupTime) } : {} })
    if (typeof dayRow.withHer === 'boolean') lines.push({ at: null, text: dayRow.withHer ? 'a day with her' : 'she was away', category: 'her' })
    const church = churchWords(dayRow as never)
    if (church) lines.push({ at: null, text: church, category: 'faith', faith: true })
  }

  const names = new Map(items.map((r) => [String(obj(r.body).id ?? r.id), str(obj(r.body).name)]))
  const chips = new Map((Array.isArray(obj(settings).ownChips) ? (obj(settings).ownChips as unknown[]) : []).map((c) => [str(obj(c).id), str(obj(c).label)]))
  for (const c of checkins) {
    const b = obj(c.body)
    const at = str(b.completedAt) || str(b.updatedAt) || str(b.startedAt)
    const block = str(b.block)
    const answers = obj(b.answers)
    const readings = Object.entries(answers).flatMap(([id, pos]) => {
      try {
        const r = readingById(id)
        return typeof pos === 'number' ? [`${r.name.toLowerCase()} “${r.anchors[pos - 1] ?? pos}”`] : []
      } catch {
        return []
      }
    })
    const ex = obj(b.extras)
    const also = Object.keys(EXTRAS)
      .filter((k) => ex[k] === true)
      .map((k) => EXTRAS[k])
    if (ex.sweet === true) also.push('something sweet')
    if (ex.nature === true) also.push('20 minutes or more in nature')
    if (ex.outside === true) also.push('outside a while (the old chip)')
    if (ex.caffeine === true) also.push('caffeine after midday (the old chip)')
    const band = obj(ex.caffeineIntake).band
    if (typeof band === 'number' && CAFFEINE[band]) also.push(`caffeine ${CAFFEINE[band]}`)
    // The necessities as the app reads them (necessities.ts): a shower or a meal tapped as missed; teeth from an explicit tap alone.
    const necessities = obj(ex.necessities)
    if (necessities.shower) also.push(NECESSITY.shower)
    if (necessities.food) also.push(NECESSITY.food)
    const teeth = typeof ex.teethBrushed === 'number' ? ex.teethBrushed : necessities.teeth ? 0 : null
    if (teeth !== null) also.push(teeth === 0 ? NECESSITY.teeth : `teeth brushed ${teeth === 1 ? 'once' : 'twice or more'}`)
    lines.push({ at, text: `the ${block} check-in${b.completedAt ? '' : ' (not completed)'}: ${readings.join(', ') || 'no readings'}${also.length ? `; also ${also.join(', ')}` : ''}`, category: 'dayRecord' })
    if (ex.closeToGod === true) lines.push({ at, text: `at the ${block} check-in: felt close to God`, category: 'faith', faith: true })
    for (const id of Object.keys(obj(ex.private))) lines.push({ at, text: `at the ${block} check-in: ${x.showPrivate && names.get(id) ? names.get(id) : 'a private item'} marked`, category: 'privateItems' })
    for (const id of Object.keys(obj(ex.own))) lines.push({ at, text: `at the ${block} check-in you marked your own chip “${chips.get(id) || 'a chip since removed'}”`, category: 'notes' })
    const note = str(ex.note).trim()
    if (note) lines.push({ at, text: `at the ${block} check-in you wrote: “${note}”`, category: 'notes' })
  }

  lines.push(...offerLines(x, offers, outcomes, generated, time))
  for (const n of notes) {
    const b = obj(n.body)
    const text = str(b.text).trim()
    if (text) lines.push({ at: str(b.at) || null, text: `you kept a note: “${text}”`, category: 'notes' })
  }
  for (const m of marks) {
    const b = obj(m.body)
    const path = str(b.path)
    const what = b.kind === 'stage' ? `declared stage ${String(b.stage)}` : b.kind === 'date' ? 'a date, declared for this day' : b.kind === 'milestone' ? `a milestone: ${str(b.note)}` : null
    if (what && (path === 'social' || path === 'partner')) lines.push({ at: str(b.at) || null, text: `on ${PATH_NAMES[path]}: ${what}`, category: pathCategoryOf(path) })
  }
  for (const w of outside) {
    const s = w.body ? outsideDayOf(w.body) : null
    if (s && homeDay(s.at, x.timeZone) === D) lines.push({ at: s.at, text: `a workout finished${s.title ? `: ${s.title}` : ''}${s.minutes ? `, ${s.minutes} minutes` : ''}`, category: 'dayRecord', values: s.minutes ? { minutes: s.minutes } : {} })
  }

  // What belongs to the whole day first, then everything by its clock time.
  const stamp = (l: DayLine): number => (l.at && Number.isFinite(Date.parse(l.at)) ? Date.parse(l.at) : Number.NEGATIVE_INFINITY)
  const ordered = lines.map((l, i) => ({ l, i })).sort((a, b) => stamp(a.l) - stamp(b.l) || a.i - b.i)
  const facts: Fact[] = []
  for (const { l } of ordered) {
    const t = l.at ? time(l.at) : null
    const made = fact('day', `${D}${t ? `, ${t.words}` : ''}: ${l.text}`, l.category, { ...(t ? { at: t.clock } : {}), ...(l.values ?? {}) }, l.faith === true)
    // Numbered after the check, so a line this run may not read leaves no gap to count.
    if (mayRead(made, x.a)) facts.push({ ...made, id: `day.${D}.${facts.length + 1}` })
  }
  return facts
}

async function dayLookup(x: LookupCtx, q: { date: string }, tally: ReadTally): Promise<LookupReply> {
  const D = q.date
  const rows = await readDayRows(x, { from: D, to: D }, tally)
  const facts = dayFacts(x, D, rows)
  const whole = rows.outside.length < OUTSIDE_READ
  return { facts, complete: whole, notRead: 0, ...(facts.length ? {} : { note: `nothing this run may read is recorded for ${D}` }) }
}

/** Offers and their answers over a range, newest day first. */
async function offersIn(x: LookupCtx, q: { from: string; to: string }, tally: ReadTally) {
  const read = { store: x.store, tally }
  const [offers, outcomes] = await Promise.all([recordsOf(read, 'offers', { from: q.from, to: q.to }, 2000), recordsOf(read, 'outcomes', { from: q.from, to: q.to }, 2000)])
  const answer = new Map<number, string>()
  for (const o of outcomes) {
    const b = obj(o.body)
    if (typeof b.offerId === 'number' && typeof b.outcome === 'string') answer.set(b.offerId, b.outcome)
  }
  return { offers: offers.map((o) => ({ day: o.day ?? '', b: obj(o.body) })).filter((o) => o.day && !o.b.skippedAt), answer }
}

/** Facts numbered within each day, in the order given. */
function numbered(head: string, rows: readonly { day: string; text: string; category: string; faith?: boolean; values?: Record<string, number | string | null> }[], a: Access): Fact[] {
  const perDay = new Map<string, number>()
  const out: Fact[] = []
  for (const r of rows) {
    const made = fact(head, `${r.day}: ${r.text}`, r.category, r.values ?? {}, r.faith === true)
    if (!mayRead(made, a)) continue
    const n = (perDay.get(r.day) ?? 0) + 1
    perDay.set(r.day, n)
    out.push({ ...made, id: `${head}.${r.day}.${n}` })
  }
  return out
}

async function movesLookup(x: LookupCtx, q: { from: string; to: string; limit: number }, tally: ReadTally): Promise<LookupReply> {
  const { offers, answer } = await offersIn(x, q, tally)
  const rows = offers
    .filter((o) => !(Array.isArray(o.b.paths) && o.b.paths.length) && x.catalogue.has(str(o.b.moveId)))
    .map((o) => {
      const said = typeof o.b.id === 'number' ? answer.get(o.b.id) : undefined
      return { day: o.day, text: `${x.catalogue.get(str(o.b.moveId))?.name ?? ''} offered${said ? `, ${OUTCOMES[said] ?? said}` : ', not answered'}`, category: 'dayRecord', faith: isFaithMove(x.catalogue, str(o.b.moveId)) }
    })
  const facts = numbered('moves', rows, x.a)
  return { facts: facts.slice(0, q.limit), complete: facts.length <= q.limit, notRead: 0 }
}

async function pathStepsLookup(x: LookupCtx, q: { from: string; to: string; limit: number }, tally: ReadTally): Promise<LookupReply> {
  const [{ offers, answer }, generated] = await Promise.all([offersIn(x, q, tally), generatedNames(x.store)])
  const rows = offers.flatMap((o) => {
    const said = typeof o.b.id === 'number' ? answer.get(o.b.id) : undefined
    if (said !== 'done' && said !== 'partly') return []
    const paths = (Array.isArray(o.b.paths) ? o.b.paths : []).filter((p): p is string => typeof p === 'string' && p !== 'social' && p !== 'partner')
    return paths.map((path) => ({ day: o.day, text: `a step on ${PATH_NAMES[path] ?? (generated.paths.get(path) ? `your Path “${generated.paths.get(path)}”` : 'a Path of yours')}: ${moveName(x, o.b, generated.steps)}, ${OUTCOMES[said] ?? said}`, category: 'commitments', faith: isFaithMove(x.catalogue, str(o.b.moveId)) }))
  })
  const facts = numbered('pathSteps', rows, x.a)
  return { facts: facts.slice(0, q.limit), complete: facts.length <= q.limit, notRead: 0 }
}

async function workoutsLookup(x: LookupCtx, q: { from: string; to: string; limit: number }): Promise<LookupReply> {
  const outside = await x.store.readOutsideWorkouts(1000)
  // A workout's day is read in the home zone here: the other app's row holds a moment, and the Worker's own clock is not the phone's.
  const sessions = outside.flatMap((w) => {
    const s = w.body ? outsideDayOf(w.body) : null
    const day = s ? homeDay(s.at, x.timeZone) : null
    return s && day && day >= q.from && day <= q.to ? [{ ...s, day }] : []
  })
  sessions.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.at < b.at ? 1 : -1))
  const rows = sessions.map((s) => ({ day: s.day, text: `a workout finished${s.title ? `: ${s.title}` : ''}${s.minutes ? `, ${s.minutes} minutes` : ''}`, category: 'dayRecord', values: (s.minutes ? { minutes: s.minutes } : {}) as Record<string, number | string | null> }))
  return { facts: numbered('workouts', rows, x.a), complete: outside.length < 1000, notRead: 0 }
}

async function linesLookup(x: LookupCtx, q: { from: string; to: string; limit: number }, tally: ReadTally): Promise<LookupReply> {
  const [briefs, log] = await Promise.all([x.store.readBriefs(400), recordsOf({ store: x.store, tally }, 'briefLog', { from: q.from, to: q.to })])
  const rows: { day: string; text: string; category: string }[] = []
  for (const b of briefs) {
    if (b.day < q.from || b.day > q.to) continue
    if (b.kind === 'review' && b.parts) rows.push({ day: b.day, text: `the weekly review said: what held: “${b.parts.held}”; what did not: “${b.parts.didNot}”; one change: “${b.parts.change}”`, category: 'brainHistory' })
    else rows.push({ day: b.day, text: `the line said “${b.text}”`, category: 'brainHistory' })
  }
  for (const r of log) {
    const b = obj(r.body)
    if (r.day && str(b.text) && !b.withdrawnAt) rows.push({ day: r.day, text: `the phone said “${str(b.text)}”`, category: 'brainHistory' })
  }
  rows.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
  // Earlier words ground no number: a line's own numbers were held to the facts of its own day, never to today's.
  return { facts: numbered('lines', rows, x.a), complete: briefs.length < 400, notRead: 0 }
}

async function forecastLookup(x: LookupCtx, q: { date: string }, tally: ReadTally): Promise<LookupReply> {
  const read = { store: x.store, tally }
  const [made, scored, all] = await Promise.all([recordsOf(read, 'forecasts', { from: q.date, to: q.date }), recordsOf(read, 'forecastScores', { from: q.date, to: q.date }), recordsOf(read, 'forecastScores', {}, 2000)])
  const key = (b: Record<string, unknown>) => `${str(b.block)}|${String(b.horizon)}|${str(b.model)}`
  const score = new Map(scored.map((r) => [key(obj(r.body)), obj(r.body)]))
  const order = ['morning', 'afternoon', 'evening']
  const rows = made
    .map((r) => obj(r.body))
    .filter((b) => typeof b.point === 'number' && typeof b.lo === 'number' && typeof b.hi === 'number')
    .sort((a, b) => order.indexOf(str(a.block)) - order.indexOf(str(b.block)) || Number(a.horizon) - Number(b.horizon))
  const facts: Fact[] = rows.map((b) => {
    const s = score.get(key(b))
    const ahead = Number(b.horizon) === 0 ? 'the same day' : `${Number(b.horizon)} ${Number(b.horizon) === 1 ? 'day' : 'days'} ahead`
    const read100 = s && typeof s.actual === 'number' ? ` It then read ${Math.round(s.actual)}: ${s.hit === true ? 'inside' : 'outside'} the range.` : ''
    return fact(`forecasts.${q.date}.${str(b.block)}.${Number(b.horizon)}`, `A forecast for the ${str(b.block)} of ${q.date}, made on ${str(b.madeOn)} (${ahead}): expect about ${Math.round(Number(b.point))} out of 100, in a range of ${Math.round(Number(b.lo))} to ${Math.round(Number(b.hi))}.${read100} A forecast is a prediction, never a finding.`, 'dayRecord', { point: Math.round(Number(b.point)), lo: Math.round(Number(b.lo)), hi: Math.round(Number(b.hi)), horizon: Number(b.horizon), scale: 100, ...(s && typeof s.actual === 'number' ? { actual: Math.round(s.actual) } : {}) })
  })
  const scores = all.map((r) => obj(r.body)).filter((b) => typeof b.hit === 'boolean')
  if (scores.length) {
    const hits = scores.filter((b) => b.hit === true).length
    facts.push(fact('forecasts.scorecard', `Of ${scores.length} forecasts scored so far, the range held for ${hits} (${Math.round((100 * hits) / scores.length)} in 100).`, 'dayRecord', { scored: scores.length, hits, pct: Math.round((100 * hits) / scores.length), scale: 100 }))
  }
  const kept = facts.filter((f) => mayRead(f, x.a))
  return { facts: kept, complete: true, notRead: 0, ...(rows.length ? {} : { note: `no forecast is stored for ${q.date}` }) }
}

/** How many rows a page of the notes' search asks for, and how many pages it reads before it says it stopped short. */
export const NOTE_PAGE = 200
export const NOTE_PAGES = 10
/** How many check-ins with a note one search counts among: more than three a day for a year. */
export const NOTE_MOMENTS = 2000
/** How many of the notes that hold the words are served as facts, the newest first. */
export const NOTES_SERVED = 30
/** How many notes a count names by day and check-in before it says how many more there are. */
const NOTES_NAMED = 12
const BLOCK_ORDER = ['morning', 'afternoon', 'evening']
/** The weekday a day is filed under, 0 Sunday to 6 Saturday, by the calendar alone. */
const weekdayOfDay = (day: string): number => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))).getUTCDay()

/**
 * The notes searched for whole words (2026-11-13): how many notes hold them, and when those notes were written, set
 * beside when notes are written at all. The database finds the candidates, the reader confirms each on the note's own
 * words, and the read goes on page by page until it is whole or says it is not. Each check-in note is one occasion of
 * the comparison core, which the Worker runs here on this small table and nowhere else. The journal is never read.
 */
async function noteWordsLookup(x: LookupCtx, q: { words: string[]; from: string; to: string }, tally: ReadTally): Promise<LookupReply> {
  const faith = x.a.allowed('faith')
  if (!faith && q.words.some((w) => FAITH_WORDS.test(w))) return { facts: [], complete: true, notRead: 0, note: 'these words are not searched while faith is hidden' }
  const said = q.words.map((w) => `“${w}”`).join(' or ')
  const holds = (text: string): boolean => q.words.some((w) => holdsWords(text, w))
  const moments = await x.store.noteMoments({ from: q.from, to: q.to }, NOTE_MOMENTS + 1)
  let complete = moments.length <= NOTE_MOMENTS
  const counted = moments.slice(0, NOTE_MOMENTS)
  // The candidates: each word's plainest run of letters, asked of the database; with none, every check-in that has a note.
  const tokens = [...new Set(q.words.map((w) => coarseOf(w) ?? '"note":"'))]
  const found = new Map<string, { day: string; block: string; note: string }>()
  for (const like of tokens) {
    let to = q.to
    for (let page = 0; ; page++) {
      const rows = await x.store.readRecords('checkins', { from: q.from, to, like }, NOTE_PAGE + 1)
      for (const r of rows.slice(0, NOTE_PAGE)) {
        const b = obj(r.body)
        const note = str(obj(b.extras).note).trim()
        if (r.day && note && holds(note) && (faith || !FAITH_WORDS.test(note))) found.set(r.id, { day: r.day, block: str(b.block), note })
      }
      if (rows.length <= NOTE_PAGE) break
      // More rows than the page: go on from the oldest day read, that day again, a note already kept kept once.
      const oldest = rows[NOTE_PAGE - 1].day ?? ''
      if (page + 1 >= NOTE_PAGES || !oldest || oldest === to) {
        complete = false
        tally.cuts.push({ store: 'checkins', range: { from: q.from, to, like }, limit: NOTE_PAGE })
        break
      }
      to = oldest
    }
  }
  const kept: { day: string; text: string }[] = []
  for (const like of [...new Set(q.words.map((w) => coarseOf(w) ?? ''))]) {
    for (const r of await recordsOf({ store: x.store, tally }, 'notes', { from: q.from, to: q.to, ...(like ? { like } : {}) }, NOTE_PAGE)) {
      const text = str(obj(r.body).text).trim()
      if (r.day && text && holds(text) && (faith || !FAITH_WORDS.test(text)) && !kept.some((k) => k.day === r.day && k.text === text)) kept.push({ day: r.day, text })
    }
  }
  const holding = counted.filter((m) => found.has(m.id))
  const K = holding.length
  const N = counted.length
  const splits: { split: string; within: 'stretch' | 'day'; cells: string[]; points: CellPoint[] }[] = [
    { split: 'weekday', within: 'stretch', cells: ['0', '1', '2', '3', '4', '5', '6'], points: counted.map((m) => ({ day: m.day, cell: String(weekdayOfDay(m.day)), happened: found.has(m.id) })) },
    { split: 'checkin', within: 'day', cells: BLOCK_ORDER, points: counted.filter((m) => BLOCK_ORDER.includes(m.block)).map((m) => ({ day: m.day, cell: m.block, happened: found.has(m.id) })) },
  ]
  const id = `noteWords|${q.words.join('|').toLowerCase()}|${q.from}|${q.to}`
  const rates: { split: string; rate: CellRate }[] = splits.flatMap((s) => ratesBy(s.points, { id: `${id}|${s.split}`, within: s.within, cells: s.cells }).map((rate) => ({ split: s.split, rate })))
  const stood = standings(rates.map((c) => c.rate))
  const family = stood[0]?.family ?? 0
  const words = q.words.join('|')
  /** A count's notes, named by day and check-in: the count linked to its notes in the fact itself. */
  const named = (rows: readonly { day: string; block: string }[]): string => {
    if (!rows.length) return ''
    const first = rows.slice(0, NOTES_NAMED).map((r) => `${r.day} ${r.block}`).join(', ')
    return ` The notes: ${first}${rows.length > NOTES_NAMED ? `, and ${rows.length - NOTES_NAMED} more` : ''}.`
  }
  const tried = family === 0 ? `Too few to compare when they were written: a comparison needs at least ${MIN_OCCURRENCES} notes holding the words, and ${MIN_SIDE} notes on each side.` : `${family} ${family === 1 ? 'comparison of when they were written was' : 'comparisons of when they were written were'} looked at.`
  const facts: Fact[] = [
    fact(
      'noteWords.all',
      `Your notes from ${q.from} to ${q.to} were searched for the whole ${q.words.length === 1 ? 'word' : 'words'} ${said}: ${K} of the ${N} notes written at check-ins hold ${q.words.length === 1 ? 'it' : 'them'}${kept.length ? `, and ${kept.length} of the notes you kept from a question` : ''}. This counts notes, a share of the times you wrote one, never how often the thing happened: a note shows when it was written, not when the thing happened. ${K ? tried : ''}${named(holding)}`.trim(),
      'notes',
      { holding: K, notes: N, kept: kept.length, family, words, ...(family === 0 ? { minSide: MIN_SIDE, minOccurrences: MIN_OCCURRENCES } : {}), ...(holding.length > NOTES_NAMED ? { more: holding.length - NOTES_NAMED } : {}) },
    ),
  ]
  if (K) {
    rates.forEach(({ split, rate: c }, i) => {
      const w = cellWords(split, c.cell)
      if (!w || c.n === 0) return
      const s = stood[i]
      const mine = holding.filter((m) => (split === 'weekday' ? String(weekdayOfDay(m.day)) : m.block) === c.cell)
      facts.push(
        fact(`noteWords.${split}.${c.cell}`, `${noteShareWords({ words: said, where: w.where, elsewhere: w.elsewhere, k: c.k, n: c.n, restK: c.restK, m: c.m, standing: s.standing, direction: s.direction, family: s.family })}${named(mine)}`, 'notes', {
          k: c.k,
          n: c.n,
          restK: c.restK,
          m: c.m,
          holding: c.k + c.restK,
          notes: c.n + c.m,
          family: s.family,
          standing: s.standing,
          direction: s.direction,
          split,
          cell: c.cell,
          words,
          ...(mine.length > NOTES_NAMED ? { more: mine.length - NOTES_NAMED } : {}),
        }),
      )
    })
  }
  // Each note that holds the words, the newest first, in the words the notes category already uses.
  const listed = [...found.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : BLOCK_ORDER.indexOf(b.block) - BLOCK_ORDER.indexOf(a.block)))
  const noteFacts = numbered(
    'noteWords.note',
    listed.slice(0, NOTES_SERVED).map((r) => ({ day: r.day, text: `at the ${r.block} check-in you wrote: “${r.note}”`, category: 'notes', faith: FAITH_WORDS.test(r.note), values: { words, ...saidIn(r.note) } })),
    x.a,
  )
  const keptFacts = numbered(
    'noteWords.kept',
    kept.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)).slice(0, NOTES_SERVED).map((r) => ({ day: r.day, text: `you kept a note: “${r.text}”`, category: 'notes', faith: FAITH_WORDS.test(r.text), values: { words, ...saidIn(r.text) } })),
    x.a,
  )
  const cut = listed.length > NOTES_SERVED || kept.length > NOTES_SERVED
  return { facts: [...facts, ...noteFacts, ...keptFacts], complete: complete && !cut, notRead: 0, ...(!complete ? { note: 'the search stopped before every note was read' } : cut ? { note: `the newest ${NOTES_SERVED} of the notes that hold the words are listed; every one is counted` } : {}) }
}

function answer(x: LookupCtx, q: LookupQuery, tally: ReadTally): Promise<LookupReply> {
  if (q.lookup === 'noteWords') return noteWordsLookup(x, q, tally)
  if (q.lookup === 'kinds') return kindsLookup(x, q)
  if (q.lookup === 'pattern') return patternLookup(x, q)
  if ('date' in q) return q.lookup === 'day' ? dayLookup(x, q, tally) : forecastLookup(x, q, tally)
  if (q.lookup === 'moves') return movesLookup(x, q, tally)
  if (q.lookup === 'workouts') return workoutsLookup(x, q)
  if (q.lookup === 'pathSteps') return pathStepsLookup(x, q, tally)
  return linesLookup(x, q, tally)
}

/** One lookup, after its query was parsed: its facts, each one this run may read, and whether the read was whole. */
export async function runLookup(x: LookupCtx, q: LookupQuery): Promise<LookupReply> {
  const tally = newTally()
  const made = await answer(x, q, tally)
  const facts = made.facts.filter((f) => mayRead(f, x.a))
  const notRead = await rowsNotRead(x.store, tally)
  return { facts, complete: made.complete && notRead === 0, notRead, ...(made.note ? { note: made.note } : {}) }
}
