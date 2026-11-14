// A month's write-up (2026-11-13): the row the Worker writes once a month has been read in full, and the id of the
// phone's own mark on one of its observations. The Worker's rows are pulled and kept read-only. A later reading of a
// month is a new row beside the first, never over it. No import: the phone and the Worker both take this file.

/** The monthly read's gate: open, the Worker reads a month once its own switch is set; closed, only a run by hand on a stand-in month runs. */
export const MONTHLY_READ: 'gated' | 'open' = 'open'
/** The Worker's store of monthly write-ups. */
export const WRITEUPS_STORE = 'writeups'
/** The version of the rules a write-up is written under. Raised by hand, and only after a real improvement: a raise re-reads the old months. */
export const WRITEUP_METHOD = 1
/** The most observations under "you recorded" and under "Claude noticed". */
export const RECORDED_MOST = 10
export const NOTICED_MOST = 8
/** The most words in one observation, and the most bytes in a write-up's words together. */
export const OBSERVATION_WORDS = 50
export const WRITEUP_BYTES = 4000

/** A "Claude noticed" observation that can be counted: a cell of the pattern table, with its counts on the day it was noticed. */
export interface Followed {
  kind: string
  split: string
  cell: string
  /** The table's counts for that cell on the day the write-up was written: k of n there, restK of m elsewhere. */
  k: number
  n: number
  restK: number
  m: number
}

export interface Observation {
  /** Its words. */
  text: string
  /** The days of the lines it rests on, in order. Listed by the Worker from the lines cited, never by the run. */
  days: string[]
  /** The kinds of record those lines are read under. */
  kinds: string[]
  /** Set when a line it rests on carries faith's tag. */
  faith?: true
  followed?: Followed
}

export interface WriteUp {
  id: string
  /** The month, YYYY-MM. */
  month: string
  /** Which reading of the month this is, from one. */
  reading: number
  /** When it was written, and the day it was written on: a followed pattern counts from the day after. */
  at: string
  day: string
  /** The rules' version and the model that wrote it. */
  method: number
  model: string
  /** What it was built from: each store's count of rows, the parts read, the month's own lines and their fingerprint, and when those lines were built: a record changed after that puts the month up for a re-read. */
  builtFrom: { counts: Record<string, number>; parts: number; lines: number; fingerprint: string; builtAt?: string }
  /** The two labelled parts. */
  recorded: Observation[]
  noticed: Observation[]
}

/** The row's id for a month's reading. */
export const writeUpIdOf = (month: string, reading: number): string => `${month}:${reading}`
/** The mark's id for an observation marked wrong: its write-up, its part and its place in it, from one. */
export const obsMarkIdOf = (writeUpId: string, part: 'recorded' | 'noticed', place: number): string => `obs:${writeUpId}:${part}:${place}`

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const word = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' && v.length <= max ? v : null)
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

function followedOf(v: unknown): Followed | null {
  const o = rec(v)
  if (!o) return null
  const [kind, split, cell] = [word(o.kind, 80), word(o.split, 40), word(o.cell, 40)]
  const [k, n, restK, m] = [count(o.k), count(o.n), count(o.restK), count(o.m)]
  if (!kind || !split || !cell || k === null || n === null || restK === null || m === null || k > n || restK > m) return null
  return { kind, split, cell, k, n, restK, m }
}

function observationOf(v: unknown): Observation | null {
  const o = rec(v)
  if (!o) return null
  const text = word(o.text, 1000)
  const days = Array.isArray(o.days) && o.days.length > 0 && o.days.every((d) => typeof d === 'string' && DAY.test(d)) ? (o.days as string[]) : null
  const kinds = Array.isArray(o.kinds) && o.kinds.length > 0 && o.kinds.every((k) => typeof k === 'string' && k !== '' && k.length <= 40) ? (o.kinds as string[]) : null
  if (!text || !days || !kinds) return null
  // A followed pattern that does not read whole makes the observation unreadable: it is never shown as an uncounted note in its place.
  const followed = o.followed === undefined ? undefined : followedOf(o.followed)
  if (followed === null) return null
  return { text, days, kinds, ...(o.faith === true ? { faith: true as const } : {}), ...(followed ? { followed } : {}) }
}

/** A row of the Worker's as a write-up, or null when it is not one: nothing half-read is shown. */
export function writeUpOf(id: string, body: unknown): WriteUp | null {
  let b: unknown = body
  if (typeof body === 'string') {
    try {
      b = JSON.parse(body)
    } catch {
      return null
    }
  }
  const o = rec(b)
  if (!id || !o) return null
  const month = typeof o.month === 'string' && MONTH.test(o.month) ? o.month : null
  const reading = count(o.reading)
  const at = word(o.at, 40)
  const day = typeof o.day === 'string' && DAY.test(o.day) ? o.day : null
  const method = count(o.method)
  const model = word(o.model, 100)
  const from = rec(o.builtFrom)
  const counts = from ? rec(from.counts) : null
  if (!month || !reading || !at || Number.isNaN(Date.parse(at)) || !day || !method || !model || !from || !counts) return null
  if (id !== writeUpIdOf(month, reading)) return null
  if (!Object.values(counts).every((n) => count(n) !== null)) return null
  const parts = count(from.parts)
  const lines = count(from.lines)
  const fingerprint = typeof from.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(from.fingerprint) ? from.fingerprint : null
  if (!parts || lines === null || !fingerprint) return null
  if (!Array.isArray(o.recorded) || !Array.isArray(o.noticed)) return null
  const recorded = o.recorded.map(observationOf)
  const noticed = o.noticed.map(observationOf)
  if (recorded.some((x) => x === null) || noticed.some((x) => x === null)) return null
  // Only a "Claude noticed" observation is followed: what was recorded is not a hypothesis.
  if (recorded.some((x) => x?.followed)) return null
  const builtAt = typeof from.builtAt === 'string' && !Number.isNaN(Date.parse(from.builtAt)) ? from.builtAt : undefined
  return { id, month, reading, at, day, method, model, builtFrom: { counts: counts as Record<string, number>, parts, lines, fingerprint, ...(builtAt ? { builtAt } : {}) }, recorded: recorded as Observation[], noticed: noticed as Observation[] }
}
