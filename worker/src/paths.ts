import { moves as catalogueMoves, paths as cataloguePaths } from '../../src/catalogue'
import type { ClaimCard } from '../../src/libraryTypes'
import methodsJson from '../../src/methods.json'
import { compileDossier, generatedPathIdOf, type Dossier, type Provenance } from '../../src/pathCompile'
import { contentHashOf, GENERATED_STORE, generatedIdOf, PATH_GENERATOR, PATH_JOBS_STORE, pathJobIdOf, pathTaskIdOf, queryRefusal, quietHours, readOf, requestOf, type GeneratedPathRow, type PathJob, type PathRequest } from '../../src/pathJob'
import { triageGoal } from '../../src/pathTriage'
import { claudeOn, fire, fireFailure, fireText, type ClaudeEnv, type Deps, type Reply } from './claude'
import { loadLibrary } from './library'
import { parseOutput } from './prompt'
import { addDays, localTime } from './time'
import type { Store, TaskRow } from './turso'

// The generator in the Worker (P5 of the AI-generated Paths design, 2026-11-06). A request you made on the phone is
// drafted by your own Claude routine (no paid API), never instantly and never between 9:00 and 11:30: the Worker
// marks the job, fires the routine with no personal text, serves the drafting run its briefing (the procedure, your
// request, the library, the methods and the Paths that exist), searches the literature and fetches abstracts for it
// (Europe PMC, free, no key; a query never carries your own words), and compiles what comes back with the same
// compiler the phone runs. New evidence is admitted only by a second run that drafted nothing, its verdict bound to
// the words it read. Each compiled version is written as the brain's own row; nothing starts without your tap. A dry
// run goes the whole way on a stand-in goal and writes nothing where the phone reads.

type Gate = 'open' | 'gated'
export type PathsEnv = ClaudeEnv & { TIMEZONE: string }

/** A drafting run may take hours; a reading run less. Past these, the job fails and says so. */
export const DRAFT_MINUTES = 180
export const READ_MINUTES = 90
/** After a fire the routine refused, an hour before the next, or the routine's own retry-after when later. */
export const FIRE_RETRY_MINUTES = 60
/** Posts a run may make: each compiles, and a refusal comes back with every reason. */
export const PATH_POSTS = 8
/** Searches and abstracts a drafting run may ask for. */
export const PATH_CALLS = 60
const BODY_LIMIT = 300_000

/** The stand-in a dry run drafts for: never your record's. */
export interface StandIn {
  goal: string
  minutes: number
  where?: string[]
}

export interface PathsOptions {
  /** A dry run, by hand with the run key: a stand-in goal, the whole path, nothing written where the phone reads. */
  dry?: StandIn
  force?: boolean
  fireFetcher?: typeof fetch
  gate?: Gate
}

export interface PathsResult {
  ran: boolean
  reason: string
  day?: string
  task?: string
  request?: number
}

/** The stores a run writes: the phone's, or for a dry run stores no phone reads. */
function storesOf(dry: boolean) {
  return dry ? { jobs: 'pathJobsDry', generated: 'generatedDry', drafts: 'pathDraftsDry' } : { jobs: PATH_JOBS_STORE, generated: GENERATED_STORE, drafts: 'pathDrafts' }
}

/** A draft that compiled with new evidence, waiting for its reading. */
interface DraftRow {
  requestId: number
  day: string
  at: string
  dossier: Dossier
  cards: ClaimCard[]
  provenance: Provenance
  minutes: number
  dry?: boolean
  /** Set once a reading run has taken it. */
  readBy?: string
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const reply = (status: number, body: unknown): Reply => ({ status, body })
const clip = (v: unknown, n: number): string | null => (typeof v === 'string' ? v.slice(0, n) : null)
const isTask = (t: TaskRow | null): t is TaskRow => t !== null
const open = (t: TaskRow) => t.status === 'firing' || t.status === 'fired'

async function writeJob(store: Store, job: PathJob, dry: boolean, now: string): Promise<void> {
  await store.writeBrainRow(storesOf(dry).jobs, job.id, job.day, job, now)
}

/** The requests waiting for a draft: queued, routed as a Path by the rules again, without a job yet; oldest first. */
async function queued(store: Store): Promise<(PathRequest & { id: number })[]> {
  const [rows, jobs] = await Promise.all([store.readRecords('pathRequests', {}, 500), store.readBrainRows<PathJob>(PATH_JOBS_STORE, 1000)])
  const started = new Set(jobs.map((j) => j.body.requestId))
  return rows
    .map((r) => requestOf(r.id, r.body))
    .filter((r): r is PathRequest & { id: number } => r !== null && r.state === 'queued' && !started.has(r.id))
    .sort((a, b) => (a.at < b.at ? -1 : 1))
}

/** The routine's own retry-after on a refused fire, in milliseconds since the epoch: seconds after the fire, or a date. */
function retryAfterMs(t: TaskRow): number {
  const ra = t.retryAfter?.trim()
  if (!ra) return 0
  const seconds = Number(ra)
  return Number.isFinite(seconds) ? Date.parse(t.at) + seconds * 1000 : Date.parse(ra) || 0
}

/** Marks the run, then fires the routine with no personal text: the task, the day and the model alias. */
async function startRun(env: PathsEnv, store: Store, now: Date, task: 'path' | 'pathRead', day: string, request: number, opts: PathsOptions): Promise<PathsResult> {
  const id = pathTaskIdOf(day, task)
  const prev = await store.readTask(id)
  const at = now.toISOString()
  const row: TaskRow = { id, kind: 'task', task, day, at, status: 'firing', trigger: opts.force ? 'forced' : 'ask', factsDay: day, askedModel: 'opus', fires: (prev?.fires ?? 0) + 1, contextCalls: 0, contextBytes: 0, posts: 0, refusals: [], request, ...(opts.dry ? { dry: true, standIn: opts.dry } : {}) }
  await store.writeTask(row)
  const f = await fire(env, fireText(task, day, 'opus'), opts.fireFetcher)
  if (f.ok) {
    await store.writeTask({ ...row, status: 'fired', firedAt: at, fireStatus: f.status, sessionUrl: f.sessionUrl })
    return { ran: true, reason: task === 'path' ? 'Claude is drafting a Path' : 'Claude is reading the new evidence', day, task: id, request }
  }
  const why = fireFailure(f)
  await store.writeTask({ ...row, status: 'fallback', fireStatus: f.status, retryAfter: f.retryAfter, error: f.error, fallbackReason: `${why}; the request waits` })
  return { ran: false, reason: why, day, task: id, request }
}

/**
 * The generator's job, on the quarter-hour tick. Closed, it reads nothing. Open: a run under way is waited for, or
 * its job failed once past its time; then, outside 9:00 to 11:30, a draft waiting for its reading starts the day's
 * reading run, else the oldest queued request starts the day's drafting run. One of each a day at most.
 */
export async function runPaths(env: PathsEnv, store: Store, now: Date, opts: PathsOptions = {}): Promise<PathsResult> {
  if ((opts.gate ?? PATH_GENERATOR) !== 'open') return { ran: false, reason: 'gated' }
  if (!claudeOn(env)) return { ran: false, reason: 'Claude is off' }
  const lt = localTime(now, env.TIMEZONE)
  const day = lt.day
  // Yesterday's runs too: a run fired late in the evening is waited for, or let go, past midnight.
  const all = (await Promise.all([day, addDays(day, -1)].flatMap((d) => [pathTaskIdOf(d, 'path'), pathTaskIdOf(d, 'pathRead')]).map((id) => store.readTask(id)))).filter(isTask)
  const runs = all.filter((t) => t.day === day)
  for (const t of all.filter(open)) {
    const limit = t.task === 'path' ? DRAFT_MINUTES : READ_MINUTES
    if (now.getTime() - Date.parse(t.firedAt ?? t.at) < limit * 60_000) return { ran: false, reason: 'waiting for Claude', day, task: t.id }
    const why = `no answer within ${limit} minutes`
    await store.writeTask({ ...t, status: 'fallback', fallbackReason: why })
    if (typeof t.request === 'number' && !t.dry) await writeJob(store, { id: pathJobIdOf(t.request), requestId: t.request, state: 'failed', at: now.toISOString(), day, reasons: [why] }, false, now.toISOString())
    return { ran: false, reason: why, day, task: t.id }
  }
  const hhmm = `${String(lt.hour).padStart(2, '0')}:${String(lt.minute).padStart(2, '0')}`
  if (quietHours(hhmm) && !opts.force) return { ran: false, reason: 'quiet hours: 9:00 to 11:30 keep the window for the day’s line', day }
  const dry = Boolean(opts.dry)
  // A fire the routine refused is tried again only after its wait, never every quarter hour (P5).
  const refused = runs.filter((t) => t.status === 'fallback' && !t.firedAt).map((t) => ({ ...t, at: t.at }))
  const waitUntil = Math.max(0, ...refused.map((t) => Math.max(Date.parse(t.at) + FIRE_RETRY_MINUTES * 60_000, retryAfterMs(t))))
  if (!opts.force && now.getTime() < waitUntil) return { ran: false, reason: `the routine refused the last fire; it is tried again at ${new Date(waitUntil).toISOString()}`, day }
  // A draft waiting for its reading goes first: it is the nearer of the two to being yours to read.
  const drafts = await store.readBrainRows<DraftRow>(storesOf(dry).drafts, 50)
  const waiting = drafts.find((d) => !d.body.readBy)
  if (waiting) {
    if (runs.some((t) => t.task === 'pathRead' && t.status !== 'fallback')) return { ran: false, reason: 'today’s reading run is used; the draft waits for tomorrow', day }
    return startRun(env, store, now, 'pathRead', day, waiting.body.requestId, opts)
  }
  if (runs.some((t) => t.task === 'path' && t.status !== 'fallback')) return { ran: false, reason: 'today’s drafting run is used; the rest wait for tomorrow', day }
  if (dry) return startRun(env, store, now, 'path', day, 0, opts)
  const next = (await queued(store))[0]
  if (!next) return { ran: false, reason: 'nothing asked', day }
  // The rules again, on the Worker: a request they do not route as a Path is never drafted.
  const rules = triageGoal(next.goal, [next.why ?? '', next.offLimits ?? ''])
  if (rules.route !== 'fits' && !(rules.route === 'redirect' && rules.practice)) {
    await writeJob(store, { id: pathJobIdOf(next.id), requestId: next.id, state: 'refused', at: now.toISOString(), day, reasons: [`the goal routes as ${rules.route}${rules.to ? ` (${rules.to})` : ''} by the rules, so no Path is made`] }, false, now.toISOString())
    return { ran: false, reason: 'the rules route it elsewhere', day, request: next.id }
  }
  const started = await startRun(env, store, now, 'path', day, next.id, opts)
  if (started.ran) await writeJob(store, { id: pathJobIdOf(next.id), requestId: next.id, state: 'drafting', at: now.toISOString(), day }, false, now.toISOString())
  return started
}

// ─── The briefing, the reads and the answers ───────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
export type PathsDeps = Deps & { env: PathsEnv; gate?: Gate; fetcher?: typeof fetch }

/** The run a request is for: the day's run of this task, still open, with a post left. Refused while the gate is closed. */
async function openRun(deps: PathsDeps, task: unknown, day: unknown): Promise<{ ok: true; t: TaskRow } | { ok: false; reply: Reply }> {
  if ((deps.gate ?? PATH_GENERATOR) !== 'open') return { ok: false, reply: reply(403, { error: 'the generator is not switched on' }) }
  if (task !== 'path' && task !== 'pathRead') return { ok: false, reply: reply(400, { error: 'task must be path or pathRead' }) }
  if (typeof day !== 'string' || !DAY_RE.test(day)) return { ok: false, reply: reply(400, { error: 'day must be YYYY-MM-DD' }) }
  const t = await deps.store.readTask(pathTaskIdOf(day, task))
  if (!t || !open(t)) return { ok: false, reply: reply(409, { error: `no ${task} run is open for ${day}` }) }
  if (t.posts >= PATH_POSTS) return { ok: false, reply: reply(409, { error: 'no attempts left' }) }
  return { ok: true, t }
}

/** The request a run drafts for: your row, or a dry run's stand-in. */
async function requestFor(deps: PathsDeps, t: TaskRow): Promise<(Pick<PathRequest, 'goal' | 'why' | 'where' | 'month' | 'minutes' | 'offLimits'> & { id: number }) | null> {
  if (t.dry && t.standIn) return { id: 0, goal: t.standIn.goal, minutes: t.standIn.minutes, ...(t.standIn.where ? { where: t.standIn.where } : {}) }
  if (typeof t.request !== 'number') return null
  return requestOf(String(t.request), await deps.store.readRecord('pathRequests', String(t.request)))
}

/** A file of the public repository, from GitHub main, as the library is read. */
async function repoFile(env: PathsEnv, path: string, fetcher: typeof fetch = fetch): Promise<string> {
  const url = env.LIBRARY_URL.replace(/src\/library\.json$/, path)
  const r = await fetcher(url)
  if (!r.ok) throw new Error(`could not read ${path} (${r.status})`)
  return r.text()
}

/** SHA-256 in hex, its first sixteen characters: the span hash the library's own script writes. */
export async function hashOf(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

/** An abstract tidied the one way every check reads it: tags out, entities decoded, white space single. */
export function tidy(text: string): string {
  return String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const sourceKey = (source: string) => source.replace(/[^a-z0-9.]+/gi, '_').toLowerCase()
const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'

/** An abstract by DOI or PubMed id, through Europe PMC, cached in the brain's own rows: never the phone's. */
async function abstractOfEpmc(deps: PathsDeps, source: string): Promise<string | null> {
  const key = sourceKey(source)
  const kept = await deps.store.readBrainRow<{ text: string }>('abstracts', key)
  if (kept?.text) return kept.text
  const q = source.startsWith('10.') ? `DOI:"${source}"` : /^\d+$/.test(source) ? `EXT_ID:${source} AND SRC:MED` : null
  if (!q) return null
  const r = await (deps.fetcher ?? fetch)(`${EPMC}?query=${encodeURIComponent(q)}&resultType=core&format=json&pageSize=1`)
  if (!r.ok) return null
  const body = obj(await r.json())
  const list = obj(body.resultList).result
  const first = Array.isArray(list) ? obj(list[0]) : {}
  const text = typeof first.abstractText === 'string' ? tidy(first.abstractText) : null
  if (text) await deps.store.writeBrainRow('abstracts', key, deps.now.toISOString().slice(0, 10), { source, via: 'europepmc', text }, deps.now.toISOString())
  return text
}

/** The library as the briefing lists it: each card's id, claim, grade, tags and status; a card read whole by its id. */
function libraryIndex(cards: readonly ClaimCard[]) {
  return cards.filter((c) => c.status === 'admitted' || c.status === 'disputed').map((c) => ({ id: c.id, claim: c.claim, grade: c.grade, tags: c.tags, status: c.status }))
}

/** The Paths that exist, for a goal they already cover: their names and their reps' ids, names and settings. */
function existingPaths() {
  return cataloguePaths.map((p) => ({ id: p.id, name: p.name, what: p.what, reps: catalogueMoves.filter((m) => m.path?.[p.id]).map((m) => ({ id: m.id, name: m.name, settings: m.settings ?? [], with: m.with ?? null, minutes: m.minutes })) }))
}

export function pathInstructions(task: 'path' | 'pathRead'): string {
  if (task === 'path')
    return `You draft a Path for someone's own practice app, as Claude, through their own Worker. You draft; a deterministic compiler decides what the finished Path may contain, and they start it only after reading it on one screen.

Follow the procedure in the briefing exactly, and write one dossier in the shape its guide gives. Cite only cards from the library listed here, or new cards you draft from abstracts you fetched through this Worker. Search with generic words about the topic: a query that carries their own answers (their why, where, month, what is off-limits), a name or a number of theirs is refused. Read a card whole, or an abstract, through /claude/context; find a passage's place with category=locate, and put that reference in a new card's spans: never type out the passage.

Post the dossier with any new cards to /claude/line. Each post compiles; a refusal comes back with every reason at once: fix them all and post again. An abstention is an answer: when the goal is too vague or the evidence too thin, say so in triage, with what would be needed.`
  return `You read new evidence for a Path someone's own Claude drafted, as a second reader who drafted none of it. For each card: does its passage, as fetched, support the claim, the effect and the population as written? Answer supports, partly, or doesNot, with one sentence why. A card is admitted only on supports. Answer each card by its id with the read value given beside it, as JSON only.`
}

const PATH_ANSWER = { dossier: 'the dossier, in the guide’s shape', cards: ['new cards you drafted, each in the library card’s shape with spans by reference; or none'] }
const READ_ANSWER = { verdicts: [{ id: 'the card id', read: 'the read value given with it', verdict: 'supports | partly | doesNot', why: 'one sentence' }] }

/** GET /claude/briefing for a drafting or a reading run. */
export async function handlePathBriefing(deps: PathsDeps, url: URL): Promise<Reply> {
  const o = await openRun(deps, url.searchParams.get('task'), url.searchParams.get('day'))
  if (!o.ok) return o.reply
  const t = o.t
  if (t.task === 'pathRead') {
    const draft = await deps.store.readBrainRow<DraftRow>(storesOf(t.dry === true).drafts, `draft:${t.request}`)
    if (!draft) return reply(409, { error: 'no draft waits for this reading' })
    const cards = await Promise.all(
      draft.cards.map(async (c) => ({
        id: c.id,
        read: readOf(c),
        claim: c.claim,
        effect: c.effect,
        population: c.population,
        caveats: c.caveats,
        passages: await Promise.all((c.spans ?? []).map(async (s) => ({ field: s.field, source: s.source, text: ((await abstractOfEpmc(deps, s.source)) ?? '').slice(s.at, s.at + s.length) }))),
      })),
    )
    await deps.store.writeTask({ ...t, briefingAt: deps.now.toISOString() })
    return reply(200, { task: 'pathRead', day: t.day, instructions: pathInstructions('pathRead'), cards, answer: READ_ANSWER, post: { path: '/claude/line', body: { task: 'pathRead', day: t.day, answer: '<your JSON answer>', writtenModel: '<the exact model id you are running as>' } }, attemptsLeft: PATH_POSTS - t.posts })
  }
  const request = await requestFor(deps, t)
  if (!request) return reply(409, { error: 'the request this run drafts for is not there' })
  const [procedure, guide, library] = await Promise.all([repoFile(deps.env, 'generator/PROCEDURE.md', deps.fetcher), repoFile(deps.env, 'generator/DOSSIER.md', deps.fetcher), loadLibrary(deps.env.LIBRARY_URL, deps.fetcher)])
  const procedureHash = await hashOf(procedure)
  await deps.store.writeTask({ ...t, briefingAt: deps.now.toISOString(), procedureHash })
  return reply(200, {
    task: 'path',
    day: t.day,
    instructions: pathInstructions('path'),
    procedure,
    guide,
    request: { goal: request.goal, why: request.why ?? null, where: request.where ?? [], month: request.month ?? null, minutesPerWeek: request.minutes, offLimits: request.offLimits ?? null },
    library: libraryIndex(library),
    methods: methodsJson,
    paths: existingPaths(),
    context: { card: '/claude/context?task=path&day=<day>&category=card&id=<card id>', search: '/claude/context?task=path&day=<day>&category=search&q=<generic words>', abstract: '/claude/context?task=path&day=<day>&category=abstract&source=<DOI or PubMed id>', locate: '/claude/context?task=path&day=<day>&category=locate&source=<DOI or PubMed id>&passage=<words as they stand>' },
    answer: PATH_ANSWER,
    post: { path: '/claude/line', body: { task: 'path', day: t.day, answer: '<your JSON answer>', writtenModel: '<the exact model id you are running as>' } },
    attemptsLeft: PATH_POSTS - t.posts,
  })
}

/** GET /claude/context for a drafting run: a card whole, a search, an abstract, or a passage's place. Each counts against the run's calls. */
export async function handlePathContext(deps: PathsDeps, url: URL): Promise<Reply> {
  const o = await openRun(deps, url.searchParams.get('task'), url.searchParams.get('day'))
  if (!o.ok) return o.reply
  const t = o.t
  if (t.task !== 'path') return reply(400, { error: 'only a drafting run reads here' })
  if (t.contextCalls >= PATH_CALLS) return reply(429, { error: 'no reads left in this run' })
  const category = url.searchParams.get('category')
  const count = async (bytes: number) => deps.store.writeTask({ ...t, contextCalls: t.contextCalls + 1, contextBytes: t.contextBytes + bytes })
  if (category === 'card') {
    const id = url.searchParams.get('id') ?? ''
    const card = (await loadLibrary(deps.env.LIBRARY_URL, deps.fetcher)).find((c) => c.id === id && (c.status === 'admitted' || c.status === 'disputed'))
    await count(card ? JSON.stringify(card).length : 0)
    return card ? reply(200, { card }) : reply(404, { error: `no card ${id} in the library` })
  }
  if (category === 'search') {
    const q = url.searchParams.get('q') ?? ''
    const request = await requestFor(deps, t)
    const why = request ? queryRefusal(q, request) : 'the request is not there'
    if (why) {
      await deps.store.writeTask({ ...t, contextCalls: t.contextCalls + 1, refusals: [...t.refusals, `search: ${why}`].slice(-10) })
      return reply(422, { error: why })
    }
    const r = await (deps.fetcher ?? fetch)(`${EPMC}?query=${encodeURIComponent(q)}&resultType=lite&format=json&pageSize=15`)
    if (!r.ok) return reply(502, { error: `the search could not run (${r.status})` })
    const list = obj(obj(await r.json()).resultList).result
    const hits = (Array.isArray(list) ? list : []).map((h) => obj(h)).map((h) => ({ source: typeof h.doi === 'string' ? h.doi : (h.pmid ?? null), title: clip(h.title, 300), authors: clip(h.authorString, 200), journal: clip(h.journalTitle, 120), year: clip(h.pubYear, 4) }))
    await count(JSON.stringify(hits).length)
    return reply(200, { hits })
  }
  if (category === 'abstract' || category === 'locate') {
    const source = url.searchParams.get('source') ?? ''
    const text = await abstractOfEpmc(deps, source)
    if (!text) {
      await count(0)
      return reply(404, { error: `no abstract for ${source}` })
    }
    if (category === 'abstract') {
      await count(text.length)
      return reply(200, { source, via: 'europepmc', text })
    }
    const passage = tidy(url.searchParams.get('passage') ?? '')
    const at = passage ? text.indexOf(passage) : -1
    await count(passage.length)
    if (at < 0) return reply(404, { error: 'the passage does not stand in the abstract as fetched' })
    return reply(200, { source, via: 'europepmc', at, length: passage.length, hash: await hashOf(passage) })
  }
  return reply(400, { error: 'category must be card, search, abstract or locate' })
}

const CARD_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const GRADES = ['A', 'B', 'C', 'D']
const REPLICATION = ['replicated', 'mixed', 'failed', 'untested']
const ORIGINS = ['direct', 'indirect', 'mechanism', 'expert', 'inference', 'judgment']

/** Every reason a drafted card cannot stand, all at once: its shape, and each span at its place in an abstract this Worker fetched, every number of its effect inside one. */
export async function draftedCardProblems(deps: PathsDeps, raw: unknown): Promise<string[]> {
  const c = obj(raw)
  const id = typeof c.id === 'string' ? c.id : '(no id)'
  const out: string[] = []
  const say = (why: string) => out.push(`card ${id}: ${why}`)
  if (!CARD_ID.test(id)) say('an id in kebab case')
  for (const f of ['claim', 'effect', 'population', 'caveats', 'domain'] as const) if (typeof c[f] !== 'string' || !(c[f] as string).trim()) say(`its ${f}, filled`)
  if (!GRADES.includes(c.grade as string)) say('a grade from A to D')
  if (!REPLICATION.includes(c.replication as string)) say('replication from the list')
  if (!ORIGINS.includes(c.origin as string)) say('an origin from the list')
  const sources = Array.isArray(c.sources) ? (c.sources as unknown[]).map(obj) : []
  if (!sources.length || sources.some((s) => typeof s.cite !== 'string' || !(typeof s.doi === 'string' || typeof s.pmid === 'string'))) say('each source cited, with its DOI or PubMed id')
  const spans = Array.isArray(c.spans) ? (c.spans as unknown[]).map(obj) : []
  if (!spans.some((s) => s.field === 'claim') || !spans.some((s) => s.field === 'effect')) say('spans for its claim and its effect')
  const passages: string[] = []
  for (const s of spans) {
    const source = String(s.source ?? '')
    if (!sources.some((x) => x.doi === source || x.pmid === source)) say(`a span on ${source}, which it does not cite`)
    const kept = await deps.store.readBrainRow<{ text: string }>('abstracts', sourceKey(source))
    if (!kept?.text) {
      say(`a span on ${source}, whose abstract this Worker never fetched`)
      continue
    }
    const at = Number(s.at)
    const length = Number(s.length)
    const passage = Number.isInteger(at) && Number.isInteger(length) && at >= 0 && length > 0 ? kept.text.slice(at, at + length) : ''
    if (!passage || (await hashOf(passage)) !== s.hash) say(`a span on ${source} that is not at its place in the abstract`)
    else passages.push(passage)
  }
  for (const n of String(c.effect ?? '').match(/\d+(?:\.\d+)?/g) ?? []) if (!passages.some((p) => p.includes(n))) say(`the number ${n} in its effect stands in no passage it spans`)
  return out
}

/** A run's provenance, stamped here: never written by the model. */
function provenanceOf(t: TaskRow, written: string): Provenance {
  return { run: t.id, model: written, promptHash: t.procedureHash ?? 'unknown', retrievedOn: t.day }
}

/** The dossier and cards with new card ids namespaced under the Path's own id, every citation of them renamed. */
function namespaced(d: Dossier, cards: ClaimCard[], pathId: string): { dossier: Dossier; cards: ClaimCard[] } {
  const rename = new Map(cards.map((c) => [c.id, `${pathId}-${c.id}`]))
  const ids = (xs: readonly string[]) => xs.map((x) => rename.get(x) ?? x)
  return {
    dossier: { ...d, cards: ids(d.cards), components: d.components.map((c) => ({ ...c, cards: ids(c.cards) })), links: d.links.map((l) => ({ ...l, cards: ids(l.cards) })), decisions: d.decisions.map((x) => ({ ...x, cards: ids(x.cards) })) },
    cards: cards.map((c) => ({ ...c, id: rename.get(c.id) as string, tags: [pathId], app: 'A generated Path’s own card: it reaches no reader off the phone.', moves: [] })),
  }
}

/** The next version of a generated Path: one past the newest it has, its change recorded. */
async function versioned(store: Store, row: Omit<GeneratedPathRow, 'id' | 'version' | 'hash'>, generated: string, day: string): Promise<GeneratedPathRow> {
  const prev = (await store.readBrainRows<GeneratedPathRow>(generated, 500)).filter((r) => r.body.pathId === row.pathId).map((r) => Number(r.body.version))
  const version = String(prev.length ? Math.max(...prev) + 1 : 1)
  const path = version === '1' ? row.path : { ...row.path, version, changes: [...(row.path.changes ?? []).map((c) => ({ ...c, version: '1' })), { version, day, reason: 'design' as const, major: true, what: 'Generated again from your request.' }] }
  const whole = { ...row, path, version }
  return { ...whole, id: generatedIdOf(row.pathId, version), hash: contentHashOf(whole) }
}

/** POST /claude/line for a drafting run (a dossier and its new cards) or a reading run (its verdicts). */
export async function handlePathLine(deps: PathsDeps, raw: unknown): Promise<Reply> {
  const o = obj(raw)
  const run = await openRun(deps, o.task, o.day)
  if (!run.ok) return run.reply
  const t = run.t
  const dry = t.dry === true
  const stores = storesOf(dry)
  const at = deps.now.toISOString()
  const written = clip(o.writtenModel, 100) || 'claude'
  const answer = obj(typeof o.answer === 'string' ? parseOutput(o.answer) : o.answer)
  const posts = t.posts + 1
  const refuse = async (reasons: string[]): Promise<Reply> => {
    const last = posts >= PATH_POSTS
    await deps.store.writeTask({ ...t, posts, refusals: [...t.refusals, reasons[0] ?? 'refused'].slice(-10), ...(last ? { status: 'refused' as const, fallbackReason: 'the draft was refused at every attempt' } : {}) })
    if (last && typeof t.request === 'number') await writeJob(deps.store, { id: pathJobIdOf(t.request), requestId: t.request, state: 'refused', at, day: t.day, reasons: reasons.slice(0, 40) }, dry, at)
    return reply(422, { ok: false, reasons, retry: !last })
  }
  const library = await loadLibrary(deps.env.LIBRARY_URL, deps.fetcher)
  const end = async (state: PathJob['state'], extra: Partial<PathJob>) => {
    await deps.store.writeTask({ ...t, status: 'written', posts, writer: 'claude', writtenModel: written, writtenAt: at, latencyMs: deps.now.getTime() - Date.parse(t.firedAt ?? t.at) })
    if (typeof t.request === 'number') await writeJob(deps.store, { id: pathJobIdOf(t.request), requestId: t.request, state, at, day: t.day, ...extra }, dry, at)
  }

  if (t.task === 'path') {
    const request = await requestFor(deps, t)
    if (!request) return reply(409, { error: 'the request this run drafts for is not there' })
    const d = obj(answer.dossier) as unknown as Dossier
    const abstaining = obj(obj(d).triage).route === 'abstain'
    if (!d || typeof d.goal !== 'string' || (!abstaining && !Array.isArray(d.strands))) return refuse(['the answer holds no dossier in the guide’s shape'])
    // The goal is the request's, word for word: a run never drafts for another.
    if (d.goal !== request.goal) return refuse(['the dossier’s goal is not the request’s, word for word'])
    // An abstention is an answer: the job ends there, with why and what would be needed, never retried as a refusal.
    if (abstaining) {
      const r = compileDossier(d, { moves: catalogueMoves, cards: library, minutesPerWeek: request.minutes, day: t.day, provenance: provenanceOf(t, written) })
      if (!r.ok && r.abstain) {
        await end('abstained', { reasons: r.reasons.slice(0, 40) })
        return reply(200, { ok: true, abstained: true, reasons: r.reasons })
      }
      return refuse(r.ok ? ['an abstention that compiled'] : r.reasons)
    }
    const rawCards = Array.isArray(answer.cards) ? (answer.cards as unknown[]) : []
    const cardReasons = (await Promise.all(rawCards.map((c) => draftedCardProblems(deps, c)))).flat()
    const taken = rawCards.map((c) => String(obj(c).id)).filter((id) => library.some((x) => x.id === id))
    for (const id of taken) cardReasons.push(`card ${id}: an id the library already holds`)
    if (cardReasons.length) return refuse(cardReasons)
    const pathId = generatedPathIdOf(d.goal, String(d.name ?? ''))
    const drafted = rawCards.map((c) => ({ ...(obj(c) as unknown as ClaimCard), status: 'draft' as const, reviewed: t.day, drafted: { by: written, run: t.id } }))
    const { dossier, cards } = namespaced(d, drafted, pathId)
    const provenance = provenanceOf(t, written)
    // New cards count as admitted here only to see the whole compile; a reading run admits them, or they go.
    const compiled = compileDossier(dossier, { moves: catalogueMoves, cards: [...library, ...cards.map((c) => ({ ...c, status: 'admitted' as const }))], minutesPerWeek: request.minutes, day: t.day, provenance })
    if (!compiled.ok && !compiled.abstain) return refuse(compiled.reasons)
    if (!compiled.ok) {
      await end('abstained', { reasons: compiled.reasons.slice(0, 40) })
      return reply(200, { ok: true, abstained: true, reasons: compiled.reasons })
    }
    if (cards.length) {
      const draft: DraftRow = { requestId: request.id, day: t.day, at, dossier, cards, provenance, minutes: request.minutes, ...(dry ? { dry: true } : {}) }
      await deps.store.writeBrainRow(stores.drafts, `draft:${request.id}`, t.day, draft, at)
      await end('reading', { pathId })
      return reply(200, { ok: true, reading: cards.map((c) => c.id), ...(dry ? { dry: true } : {}) })
    }
    const row = await versioned(deps.store, { pathId, at, requestId: request.id, path: compiled.path, reps: compiled.reps, shared: compiled.shared, cards: [], results: [] }, stores.generated, t.day)
    await deps.store.writeBrainRow(stores.generated, row.id as string, t.day, row, at)
    await end('ready', { pathId, version: row.version })
    return reply(200, { ok: true, pathId, version: row.version, ...(dry ? { dry: true } : {}) })
  }

  // The reading run: each verdict bound to the words it was served; only "supports" admits a card.
  const draft = await deps.store.readBrainRow<DraftRow>(stores.drafts, `draft:${t.request}`)
  if (!draft) return reply(409, { error: 'no draft waits for this reading' })
  const verdicts = (Array.isArray(answer.verdicts) ? answer.verdicts : []).map(obj)
  const reasons: string[] = []
  const admitted: ClaimCard[] = []
  const dropped: string[] = []
  for (const c of draft.cards) {
    const v = verdicts.find((x) => x.id === c.id)
    if (!v) {
      reasons.push(`card ${c.id}: no verdict`)
      continue
    }
    if (v.read !== readOf(c)) {
      reasons.push(`card ${c.id}: the verdict is for other words than those served`)
      continue
    }
    if (!['supports', 'partly', 'doesNot'].includes(String(v.verdict))) {
      reasons.push(`card ${c.id}: a verdict of supports, partly or doesNot`)
      continue
    }
    if (v.verdict === 'supports') admitted.push({ ...c, status: 'admitted', support: { reader: written, run: t.id, verdict: 'supports', why: String(v.why ?? '').slice(0, 300), at } } as ClaimCard)
    else dropped.push(c.id)
  }
  if (reasons.length) return refuse(reasons)
  // Unsupported cards go, and every citation of them; the rest compiles again, or the job abstains with why.
  const keep = (xs: readonly string[]) => xs.filter((x) => !dropped.includes(x))
  const d = draft.dossier
  const dossier: Dossier = { ...d, cards: keep(d.cards), components: d.components.map((c) => ({ ...c, cards: keep(c.cards) })), links: d.links.map((l) => ({ ...l, cards: keep(l.cards) })), decisions: d.decisions.map((x) => ({ ...x, cards: keep(x.cards) })) }
  const compiled = compileDossier(dossier, { moves: catalogueMoves, cards: [...library, ...admitted], minutesPerWeek: draft.minutes, day: draft.day, provenance: draft.provenance })
  await deps.store.writeBrainRow(stores.drafts, `draft:${t.request}`, draft.day, { ...draft, readBy: t.id }, at)
  if (!compiled.ok) {
    const why = [...dropped.map((id) => `card ${id}: its reader did not find it supported, so it was left out`), ...compiled.reasons].slice(0, 40)
    await end(compiled.abstain ? 'abstained' : 'refused', { reasons: why })
    return reply(200, { ok: true, [compiled.abstain ? 'abstained' : 'refused']: true, reasons: why })
  }
  const pathId = compiled.path.id
  const row = await versioned(deps.store, { pathId, at, requestId: draft.requestId, path: compiled.path, reps: compiled.reps, shared: compiled.shared, cards: admitted, results: dropped.map((id) => `card ${id}: left out, its reader did not find it supported`) }, stores.generated, draft.day)
  await deps.store.writeBrainRow(stores.generated, row.id as string, draft.day, row, at)
  await end('ready', { pathId, version: row.version })
  return reply(200, { ok: true, pathId, version: row.version, admitted: admitted.map((c) => c.id), dropped, ...(dry ? { dry: true } : {}) })
}

/** The body limit for a post: a dossier is long; every other line keeps its own. */
export const PATH_BODY_LIMIT = BODY_LIMIT
