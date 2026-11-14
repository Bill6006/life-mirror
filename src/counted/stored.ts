
// The pattern table as it is kept and synced (2026-11-13): one record with a fixed id, built by the phone from the
// whole record and served by the Worker a kind at a time. Types and plain functions only, with nothing of the app
// behind them and no import at all, so the Worker reads the very shape the phone writes. It holds counts, standings and the app's own
// labels: never a note's words, the journal, or anything of a Path's research. A private item's name is in it as it
// is in the private items' own records, in the owner's own database.

/** The one record's id. */
export const PATTERNS_ID = 'table'
/** The shape's own version: a record of another version is read as no table. */
export const PATTERNS_FORMAT = 1
/** A table older than this is not served: the same age a fact sheet may reach. */
export const PATTERNS_MAX_AGE_MS = 48 * 3_600_000

/** The least a comparison needs, as the table's own words say it: the core's minimums, stated here so the Worker need not carry the core. */
export const TABLE_MIN_SIDE = 8
export const TABLE_MIN_OCCURRENCES = 5

/** The level's five bands as the Weekly View names them, Firing to Empty: the order every band count is kept in. */
export const LEVEL_BANDS = ['firing', 'solid', 'gettingBy', 'wornDown', 'empty'] as const
export const LEVEL_BAND_WORDS: readonly string[] = ['Firing', 'Solid', 'Getting by', 'Worn down', 'Empty']

/** A comparison's standing and direction, as the core names them. */
export type StoredStanding = 'tooFew' | 'noPattern' | 'lead' | 'pattern'
export type StoredDirection = 'higher' | 'lower' | 'none'

export type StoredSplit = 'weekday' | 'checkin' | 'shortNight' | 'lowEvening'
const SPLITS: readonly string[] = ['weekday', 'checkin', 'shortNight', 'lowEvening']
const STANDINGS: readonly string[] = ['tooFew', 'noPattern', 'lead', 'pattern']
const DIRECTIONS: readonly string[] = ['higher', 'lower', 'none']

/** One cell of one split of one kind: k of n in the cell, against the rest. */
export interface StoredCell {
  split: StoredSplit
  /** A weekday 0 (Sunday) to 6, a check-in, or "yes" for what came before. */
  cell: string
  k: number
  n: number
  restK: number
  m: number
  standing: StoredStanding
  direction: StoredDirection
}

/** One kind the record counts. */
export interface StoredKind {
  id: string
  /** The app's own words for it; a private item's own name. */
  label: string
  unit: 'day' | 'checkin'
  /** The switch it is read under. */
  category: string
  private: boolean
  /** The first day the record could hold it. */
  since?: string
  /** Its cut-off in words, where it has one. */
  cutoff?: string
  /** The occasions the record can speak for, and how many carried it. */
  known: number
  occurrences: number
  /** How many comparisons were tested; 0 when there were too few to test any. */
  family: number
  /** Every cell looked at, where anything was tested. */
  cells?: StoredCell[]
}

/** The reading out of 100 in one cell: its average, and how its check-ins fell in the five bands; against the rest. */
export interface StoredLevel {
  split: StoredSplit
  cell: string
  n: number
  mean: number
  /** Check-ins in each band, Firing to Empty. */
  bands: number[]
  restN: number
  restMean: number
}

/** A followed pattern's count as it is kept: the cell a "Claude noticed" observation named, counted on what came after the day it was noticed. */
export interface StoredFollowed {
  /** The observation's own mark id: its write-up, its part and its place. */
  id: string
  kind: string
  split: StoredSplit
  cell: string
  noticedOn: string
  k: number
  n: number
  restK: number
  m: number
  standing: StoredStanding
  direction: StoredDirection
  family: number
}

export interface PatternsRecord {
  id: typeof PATTERNS_ID
  format: typeof PATTERNS_FORMAT
  /** The day it was built on: only days before it are counted. */
  builtFor: string
  builtAt: string
  updatedAt: string
  kinds: StoredKind[]
  level: StoredLevel[]
  /** The followed patterns' counts (2026-11-13): there only while one is followed. A record without it reads as it always did. */
  followed?: StoredFollowed[]
}

/** Whether two records hold the same table, whenever each was built: the record is rewritten only when this is false. */
export function samePatterns(a: PatternsRecord | null | undefined, b: PatternsRecord): boolean {
  if (!a) return false
  const body = (r: PatternsRecord) => JSON.stringify({ format: r.format, builtFor: r.builtFor, kinds: r.kinds, level: r.level, followed: r.followed ?? [] })
  return body(a) === body(b)
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

function cellOf(v: unknown): StoredCell | null {
  const c = obj(v)
  if (!c || typeof c.split !== 'string' || !SPLITS.includes(c.split) || typeof c.cell !== 'string' || !isCount(c.k) || !isCount(c.n) || !isCount(c.restK) || !isCount(c.m)) return null
  if (typeof c.standing !== 'string' || !STANDINGS.includes(c.standing) || typeof c.direction !== 'string' || !DIRECTIONS.includes(c.direction)) return null
  if (c.k > c.n || c.restK > c.m) return null
  return { split: c.split as StoredSplit, cell: c.cell, k: c.k, n: c.n, restK: c.restK, m: c.m, standing: c.standing as StoredStanding, direction: c.direction as StoredDirection }
}

function kindOf(v: unknown): StoredKind | null {
  const k = obj(v)
  if (!k || typeof k.id !== 'string' || !k.id || typeof k.label !== 'string' || (k.unit !== 'day' && k.unit !== 'checkin') || typeof k.category !== 'string' || typeof k.private !== 'boolean') return null
  if (!isCount(k.known) || !isCount(k.occurrences) || k.occurrences > k.known || !isCount(k.family)) return null
  const cells = k.cells === undefined ? undefined : Array.isArray(k.cells) ? k.cells.map(cellOf) : null
  if (cells === null || cells?.some((c) => c === null)) return null
  return { id: k.id, label: k.label, unit: k.unit, category: k.category, private: k.private, ...(isDay(k.since) ? { since: k.since } : {}), ...(typeof k.cutoff === 'string' && k.cutoff ? { cutoff: k.cutoff } : {}), known: k.known, occurrences: k.occurrences, family: k.family, ...(cells ? { cells: cells as StoredCell[] } : {}) }
}

function levelOf(v: unknown): StoredLevel | null {
  const l = obj(v)
  if (!l || typeof l.split !== 'string' || !SPLITS.includes(l.split) || typeof l.cell !== 'string' || !isCount(l.n) || !isCount(l.restN) || typeof l.mean !== 'number' || typeof l.restMean !== 'number') return null
  if (!Array.isArray(l.bands) || l.bands.length !== LEVEL_BANDS.length || !l.bands.every(isCount)) return null
  return { split: l.split as StoredSplit, cell: l.cell, n: l.n, mean: l.mean, bands: l.bands as number[], restN: l.restN, restMean: l.restMean }
}

function followedOf(v: unknown): StoredFollowed | null {
  const f = obj(v)
  const c = cellOf(v)
  if (!f || !c || typeof f.id !== 'string' || !f.id || typeof f.kind !== 'string' || !f.kind || !isDay(f.noticedOn) || !isCount(f.family)) return null
  return { id: f.id, kind: f.kind, split: c.split, cell: c.cell, noticedOn: f.noticedOn, k: c.k, n: c.n, restK: c.restK, m: c.m, standing: c.standing, direction: c.direction, family: f.family }
}

/** A stored record read strictly: anything that is not this shape whole is no table, never a table half read. */
export function readPatterns(body: unknown): PatternsRecord | null {
  const r = obj(body)
  if (!r || r.id !== PATTERNS_ID || r.format !== PATTERNS_FORMAT || !isDay(r.builtFor) || typeof r.builtAt !== 'string' || typeof r.updatedAt !== 'string' || !Array.isArray(r.kinds) || !Array.isArray(r.level)) return null
  const kinds = r.kinds.map(kindOf)
  const level = r.level.map(levelOf)
  if (kinds.some((k) => k === null) || level.some((l) => l === null)) return null
  // The followed patterns' counts are optional; where they are there, they read whole or the record is no table.
  const followed = r.followed === undefined ? undefined : Array.isArray(r.followed) ? r.followed.map(followedOf) : null
  if (followed === null || followed?.some((f) => f === null)) return null
  return { id: PATTERNS_ID, format: PATTERNS_FORMAT, builtFor: r.builtFor, builtAt: r.builtAt, updatedAt: r.updatedAt, kinds: kinds as StoredKind[], level: level as StoredLevel[], ...(followed?.length ? { followed: followed as StoredFollowed[] } : {}) }
}
