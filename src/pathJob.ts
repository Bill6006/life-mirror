import type { Move, Path, PathPlace } from './catalogue'
import type { ClaimCard } from './libraryTypes'
import { normalized } from './pathTriage'

// The generator's jobs (P5 of the AI-generated Paths design, 2026-11-06), the part the phone and the Worker share.
// You ask for a Path on the phone; the Worker, never instantly and never between 9:00 and 11:30, has your own Claude
// routine draft it (no paid API), and a second run that drafted nothing read any new evidence against the abstracts
// the Worker fetched. The shared compiler decides what the Path may contain. The Worker writes how the job stands
// and each compiled version as the brain's own rows; the phone pulls them, checks each version again, and offers it
// only to be read: nothing starts without your tap. A search for evidence never carries your own words.

/**
 * Something you want to improve, asked for as a Path (P5): your words, the intake's answers, its route by the rules,
 * and where the job stands. Synced with your record; its words reach your own Claude through the routine and nothing
 * else, and the search for evidence never carries them.
 */
export interface PathRequest {
  id?: number
  at: string
  goal: string
  why?: string
  where?: string[]
  month?: string
  minutes: number
  offLimits?: string
  route: 'refuse' | 'redirect' | 'existing' | 'notAPath' | 'unclear' | 'fits'
  state: 'triaged' | 'queued' | 'drafting' | 'reading' | 'ready' | 'refused' | 'abstained' | 'failed' | 'withdrawn'
  /** The generated Path it made, when ready. */
  pathId?: string
  /** Every reason, when the compiler refused or abstained. */
  reasons?: string[]
  updatedAt?: string
}

/**
 * One version of a Path the generator made for you (P5), append-only: the compiled Path, its reps and the placements
 * it adds to reps it shares, the new cards it rests on (yours alone, never the public library's), its content hash,
 * how it was made and what the compiler found. Your decisions on it live in pathVersions, as for every Path.
 */
export interface GeneratedPathRow {
  /** The brain row's id: the Worker writes each version, and the phone keeps what it pulls, as Ask's answers. */
  id?: string
  pathId: string
  version: string
  at: string
  hash: string
  requestId?: number
  path: Path
  reps: Move[]
  shared: { move: string; place: PathPlace }[]
  cards: ClaimCard[]
  results: string[]
}

/** The generator's gate: while closed, the Worker reads no request, fires nothing and writes nothing. */
export const PATH_GENERATOR: 'open' | 'gated' = 'open'

/** Where a job stands, as the Worker writes it. */
export type PathJobState = 'drafting' | 'reading' | 'ready' | 'refused' | 'abstained' | 'failed'

/** The Worker's row for one request: where it stands, the Path it made, and every reason when it made none. */
export interface PathJob {
  id: string
  requestId: number
  state: PathJobState
  at: string
  day: string
  pathId?: string
  version?: string
  reasons?: string[]
}

/** The brain stores the phone pulls for the generator: the jobs and the versions. */
export const PATH_JOBS_STORE = 'pathJobs'
export const GENERATED_STORE = 'generated'

export const pathJobIdOf = (requestId: number): string => `job:${requestId}`
export const pathTaskIdOf = (day: string, task: 'path' | 'pathRead'): string => `task:${day}:${task}`
/** A generated version's brain row id. */
export const generatedIdOf = (pathId: string, version: string): string => `${pathId}:${version}`

/** No job fires in the morning hours the daily line needs: 9:00 to 11:30, local. */
export function quietHours(hhmm: string): boolean {
  return hhmm >= '09:00' && hhmm < '11:30'
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const text = (v: unknown, n: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)
const ROUTES: readonly PathRequest['route'][] = ['refuse', 'redirect', 'existing', 'notAPath', 'unclear', 'fits']
const STATES: readonly PathJobState[] = ['drafting', 'reading', 'ready', 'refused', 'abstained', 'failed']

/** A request as the Worker reads the phone's row: whole, or null. The words are clipped as the intake allows them. */
export function requestOf(id: string, body: unknown): (PathRequest & { id: number }) | null {
  const b = obj(typeof body === 'string' ? safeParse(body) : body)
  const n = Number(b?.id ?? id)
  if (!b || !Number.isInteger(n) || typeof b.at !== 'string' || typeof b.goal !== 'string' || !b.goal.trim() || !ROUTES.includes(b.route as PathRequest['route'])) return null
  const minutes = Number(b.minutes)
  const where = Array.isArray(b.where) ? (b.where as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 60)).slice(0, 8) : undefined
  return {
    id: n,
    at: b.at,
    goal: b.goal.trim().slice(0, 200),
    ...(text(b.why, 300) ? { why: text(b.why, 300) } : {}),
    ...(where?.length ? { where } : {}),
    ...(text(b.month, 300) ? { month: text(b.month, 300) } : {}),
    minutes: Number.isFinite(minutes) && minutes >= 15 && minutes <= 600 ? Math.round(minutes) : 90,
    ...(text(b.offLimits, 300) ? { offLimits: text(b.offLimits, 300) } : {}),
    route: b.route as PathRequest['route'],
    state: (typeof b.state === 'string' ? b.state : 'queued') as PathRequest['state'],
    ...(typeof b.updatedAt === 'string' ? { updatedAt: b.updatedAt } : {}),
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** A job row as the phone reads it, or null. */
export function pathJobOf(id: string, body: string): PathJob | null {
  const b = obj(safeParse(body))
  if (!b || typeof b.requestId !== 'number' || !STATES.includes(b.state as PathJobState) || typeof b.at !== 'string' || typeof b.day !== 'string') return null
  const reasons = Array.isArray(b.reasons) ? (b.reasons as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 400)).slice(0, 40) : undefined
  return { id, requestId: b.requestId, state: b.state as PathJobState, at: b.at, day: b.day, ...(typeof b.pathId === 'string' ? { pathId: b.pathId } : {}), ...(typeof b.version === 'string' ? { version: b.version } : {}), ...(reasons?.length ? { reasons } : {}) }
}

/** A generated version as the phone reads it: whole in shape, or null. The phone's compiler checks its content before anything shows it. */
export function generatedRowOf(id: string, body: string): GeneratedPathRow | null {
  const b = obj(safeParse(body))
  if (!b || typeof b.pathId !== 'string' || !/^g-[0-9a-f]{8}$/.test(b.pathId) || typeof b.version !== 'string' || typeof b.at !== 'string' || typeof b.hash !== 'string') return null
  const path = obj(b.path)
  if (!path || path.id !== b.pathId || !Array.isArray(b.reps) || !Array.isArray(b.shared) || !Array.isArray(b.cards)) return null
  // Every rep belongs to this Path alone, and every card is its own: nothing reaches the catalogue's own ids.
  const reps = b.reps as Move[]
  if (reps.some((m) => !m || typeof m.id !== 'string' || !m.id.startsWith(`${b.pathId}-`) || m.family !== b.pathId)) return null
  const cards = b.cards as ClaimCard[]
  if (cards.some((c) => !c || typeof c.id !== 'string' || !c.id.startsWith(`${b.pathId}-`))) return null
  return {
    id,
    pathId: b.pathId,
    version: b.version,
    at: b.at,
    hash: b.hash,
    ...(typeof b.requestId === 'number' ? { requestId: b.requestId } : {}),
    path: path as unknown as Path,
    reps,
    shared: b.shared as { move: string; place: PathPlace }[],
    cards,
    results: Array.isArray(b.results) ? (b.results as unknown[]).filter((x): x is string => typeof x === 'string') : [],
  }
}

/** Words too common to carry anything of yours. */
const COMMON = new Set(['about', 'after', 'again', 'also', 'and', 'around', 'because', 'before', 'being', 'better', 'between', 'both', 'could', 'each', 'every', 'everyday', 'feel', 'from', 'have', 'into', 'just', 'life', 'like', 'make', 'more', 'most', 'much', 'only', 'other', 'over', 'people', 'really', 'should', 'some', 'than', 'that', 'their', 'them', 'then', 'there', 'they', 'thing', 'things', 'this', 'time', 'very', 'want', 'week', 'well', 'when', 'where', 'which', 'while', 'with', 'would', 'your'])

/**
 * Why a search for evidence may not run, or null. A query is generic: it may name the goal's own topic, never a word
 * that appears only in your why, where it should show up, your month or what is off-limits, never a name, and never a
 * number of yours (2026-11-06, the design's §4 item 23: "Search queries are generic and never carry your words or context").
 */
export function queryRefusal(query: string, request: Pick<PathRequest, 'goal' | 'why' | 'where' | 'month' | 'offLimits'>): string | null {
  const q = normalized(query)
  if (q.length < 3 || q.length > 200) return 'a query of three to two hundred characters'
  const words = new Set(q.split(' ').filter((w) => w.length >= 4 && !COMMON.has(w)))
  const goal = new Set(normalized(request.goal).split(' '))
  const personal = [request.why, ...(request.where ?? []), request.month, request.offLimits].filter((x): x is string => Boolean(x)).flatMap((x) => normalized(x).split(' '))
  const hit = personal.find((w) => words.has(w) && !goal.has(w))
  if (hit) return `the query carries a word from your own answers: “${hit}”`
  // A name: a capitalised word inside any of your words, past the first.
  const names = [request.goal, request.why ?? '', request.month ?? '', request.offLimits ?? ''].flatMap((x) => x.split(/\s+/).slice(1)).filter((w) => /^[A-Z][a-z]{2,}/.test(w)).map((w) => normalized(w))
  const named = names.find((w) => words.has(w) || q.split(' ').includes(w))
  if (named) return `the query carries a name from your own words: “${named}”`
  const numbers = [request.goal, request.why ?? '', request.month ?? '', request.offLimits ?? ''].flatMap((x) => x.match(/\d+/g) ?? [])
  const number = numbers.find((n) => q.split(' ').includes(n))
  if (number) return `the query carries a number from your own words: ${number}`
  return null
}

/** FNV-1a over the text, twice with different seeds: a stable fingerprint, in hex. */
export function fingerprintOf(text: string): string {
  const fnv = (seed: number) => {
    let h = seed
    for (let k = 0; k < text.length; k++) {
      h ^= text.charCodeAt(k)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0).toString(16).padStart(8, '0')
  }
  return fnv(2166136261) + fnv(0x811c9dc5 ^ 0x5bd1e995)
}

/** The words a second reader judges, bound to its verdict: a card changed after its reading no longer counts as read. */
export function readOf(card: Pick<ClaimCard, 'claim' | 'effect' | 'population'>): string {
  return fingerprintOf(JSON.stringify([card.claim, card.effect ?? null, card.population ?? null]))
}

/** A generated version's content hash: the Path, its reps, its placements and its cards. */
export function contentHashOf(row: Pick<GeneratedPathRow, 'path' | 'reps' | 'shared' | 'cards'>): string {
  return fingerprintOf(JSON.stringify([row.path, row.reps, row.shared, row.cards]))
}

/** What the phone shows of a request: the job's own state once the Worker has one, else the request's. */
export function requestState(r: Pick<PathRequest, 'state'>, job: Pick<PathJob, 'state'> | undefined): PathRequest['state'] {
  if (r.state === 'withdrawn' || r.state === 'triaged') return r.state
  return job?.state ?? r.state
}
