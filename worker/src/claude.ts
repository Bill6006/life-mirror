import { isUsageFact } from '../../src/useShared'
import { isWriterModel, lackedOf, readBrainPrefs, validateReview, type BrainOutput, type ReviewOutput } from '../../src/brainShared'
import { coachCore, lineBriefing, type CoachCoreKey, type LineBriefing, type Said } from './briefing'
import { lineCheck, saidLately } from './checks'
import { checkCoach, rowOf } from './coachCheck'
import { surfaceGuard, type Surface } from './surface'
import type { Env } from './env'
import { loadLibrary, retrieve } from './library'
import { claudeBriefingText, claudeInstructions, coachBriefingText, parseOutput } from './prompt'
import { coachFirmness, DEFAULT_FIRMNESS, HOW_FIRM, type Firmness, type FirmnessPref } from '../../src/firmness'
import { accessFor, bytesOf, CONTEXT_BYTES, CONTEXT_CALLS, contextFor, gatesFrom, loadCatalogue, logUsageOnSheet, parseContextQuery, partnerBearsOn, privateNames, READABLE, readCategory, readOnDemand, sheetForClaude, type Access, type Catalogue } from './retrieval'
import { addDays } from './time'
import type { FactSheet } from '../../src/factTypes'
import type { BriefRow, Store, TaskRow } from './turso'

// Claude writes the line; the Worker stays in charge (Parts 30 and 31). When a line or the Sunday
// review is due, the Worker marks the day's task and then fires the owner's routine, with no
// personal text: the task, the day and the writer model alias. The run fetches its briefing from
// here, writes, and posts the result back, through Anthropic's agent proxy, which adds the bridge
// key to its requests for this host, so the key never reaches Claude. The Worker checks what comes
// back with the same validator, day guard and repeat check as any line, plus the surface rules for
// what Claude may have read, allows one corrected retry, and stores it with who wrote it. A failed
// fire, two refusals, or no valid line within the time, and the free model chain writes; failing
// that, the phone's own line stands. Claude never holds a database credential and never writes
// the record.

export const FIRE_BETA = 'experimental-cc-routine-2026-04-01'
export type ClaudeTask = 'line' | 'review' | 'coach' | 'skill' | 'progress'
/** A line may be posted twice: the first, and one corrected retry after a refusal. */
export const MAX_POSTS = 2
/** No valid line within this many minutes, and the free chain writes (the plan's twenty). */
export const TIMEOUT_MINUTES = 20
const MAX_FACTS_AGE_MS = 48 * 3_600_000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export type ClaudeEnv = Pick<Env, 'CLAUDE_WRITER' | 'CLAUDE_FIRE_URL' | 'CLAUDE_FIRE_TOKEN' | 'CLAUDE_TIMEOUT_MINUTES' | 'LIBRARY_URL' | 'CATALOGUE_URL'> & Partial<Pick<Env, 'TIMEZONE'>>

const enc = new TextEncoder()

/** The bearer key, compared in constant time over its length; false when either side is missing. */
export function bearerOk(header: string | null, key: string | undefined): boolean {
  if (!key || !header || !header.startsWith('Bearer ')) return false
  const a = enc.encode(header.slice(7))
  const b = enc.encode(key)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Claude writes only when switched on here and the routine can be fired; otherwise the free chain writes, as before Part 30. */
export function claudeOn(env: Pick<Env, 'CLAUDE_WRITER' | 'CLAUDE_FIRE_URL' | 'CLAUDE_FIRE_TOKEN'>): boolean {
  return env.CLAUDE_WRITER === 'on' && Boolean(env.CLAUDE_FIRE_URL && env.CLAUDE_FIRE_TOKEN)
}

export function timeoutMinutes(env: Pick<Env, 'CLAUDE_TIMEOUT_MINUTES'>): number {
  const n = Number(env.CLAUDE_TIMEOUT_MINUTES)
  return Number.isFinite(n) && n > 0 ? n : TIMEOUT_MINUTES
}

export const taskIdOf = (task: ClaudeTask, day: string): string => `task:${day}:${task}`
export const rowIdOf = (task: ClaudeTask, day: string): string => `${day}:${task === 'line' ? 'brief' : task}`

/** The fire's only text: the task, the day and the model alias. Nothing personal. */
export function fireText(task: ClaudeTask, day: string, model: string): string {
  return `Life Mirror bridge: task=${task} day=${day} model=${model}. Read CLAUDE.md in this repository and do exactly what it says, then stop.`
}

export interface FireOutcome {
  ok: boolean
  status: number
  sessionUrl: string | null
  retryAfter: string | null
  error: string | null
}

const clip = (v: unknown, n: number): string | null => (typeof v === 'string' ? v.slice(0, n) : null)

/** Fires the routine once. There is no idempotency key: a second call is a second run. */
export async function fire(env: Pick<Env, 'CLAUDE_FIRE_URL' | 'CLAUDE_FIRE_TOKEN'>, text: string, fetcher: typeof fetch = fetch): Promise<FireOutcome> {
  if (!env.CLAUDE_FIRE_URL || !env.CLAUDE_FIRE_TOKEN) return { ok: false, status: 0, sessionUrl: null, retryAfter: null, error: 'no fire URL or token' }
  try {
    const r = await fetcher(env.CLAUDE_FIRE_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CLAUDE_FIRE_TOKEN}`, 'anthropic-beta': FIRE_BETA, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    const body = ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
    const ok = r.status >= 200 && r.status < 300
    return { ok, status: r.status, sessionUrl: clip(body.claude_code_session_url, 200), retryAfter: r.headers.get('retry-after'), error: ok ? null : (clip((body.error as { message?: unknown } | undefined)?.message, 300) ?? clip(body.message, 300) ?? `status ${r.status}`) }
  } catch (e) {
    return { ok: false, status: 0, sessionUrl: null, retryAfter: null, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }
  }
}

/** Why a failed fire sends the task to the free chain at once, in words for the bridge row. */
export function fireFailure(f: FireOutcome): string {
  if (f.status === 429) return `the routine is limited (429${f.retryAfter ? `, retry after ${f.retryAfter}` : ''})`
  if (f.status === 400) return `the routine refused the fire (400: ${f.error ?? 'no reason'})`
  if (f.status >= 500) return `the routine's server erred (${f.status})`
  if (f.status === 0) return `the fire did not reach the routine (${f.error ?? 'no answer'})`
  return `the fire failed (${f.status}: ${f.error ?? 'no reason'})`
}

/** Marks the day's task, then fires. The mark comes first because the fire call has no idempotency key: a crash after it can never fire twice. */
export async function startTask(env: ClaudeEnv, store: Store, now: Date, task: ClaudeTask, day: string, trigger: TaskRow['trigger'], factsDay: string, forced: boolean, fetcher?: typeof fetch, extra: Partial<TaskRow> = {}): Promise<TaskRow> {
  const [prefs, prev] = await Promise.all([store.readRecord('brainPrefs', 'prefs').then(readBrainPrefs), store.readTask(taskIdOf(task, day))])
  const at = now.toISOString()
  // How many times this day's task was fired: a forced run over a scheduled one counts again, and the gate reads it.
  const fires = (prev ? (prev.fires ?? 1) : 0) + 1
  const row: TaskRow = { id: taskIdOf(task, day), kind: 'task', task, day, at, status: 'firing', trigger, factsDay, askedModel: prefs.writerModel, ...(forced ? { forced: true } : {}), fires, contextCalls: 0, contextBytes: 0, posts: 0, refusals: [], ...extra }
  await store.writeTask(row)
  const f = await fire(env, fireText(task, day, prefs.writerModel), fetcher)
  const next: TaskRow = f.ok ? { ...row, status: 'fired', firedAt: at, fireStatus: f.status, sessionUrl: f.sessionUrl } : { ...row, status: 'fallback', fireStatus: f.status, retryAfter: f.retryAfter, error: f.error, fallbackReason: fireFailure(f) }
  await store.writeTask(next)
  return next
}

/** Why the free chain writes now for a task, or null while Claude may still write. */
export function fallbackReason(t: TaskRow, now: Date, minutes: number): string | null {
  if (t.status === 'written') return null
  if (t.status === 'fallback') return t.fallbackReason ?? 'the fire failed'
  if (t.status === 'refused') return 'Claude’s line was refused twice'
  return now.getTime() - Date.parse(t.firedAt ?? t.at) >= minutes * 60_000 ? `no valid line from Claude within ${minutes} minutes` : null
}

export { DATING_ABSENCE, DATING_WORDS, surfaceGuard, type Surface } from './surface'

export interface Deps {
  env: ClaudeEnv
  store: Store
  now: Date
  fetcher?: typeof fetch
  /** For the tests: How firm's gate (Pass 2); the deployed Worker reads the shared constant. */
  howFirm?: 'gated' | 'open'
}

/** How firm for a run from the prefs row already read (Pass 2): the setting once the gate is open, Adaptive until one is chosen; null while it is closed. */
function firmOf(deps: Deps, prefs: unknown): FirmnessPref | null {
  return (deps.howFirm ?? HOW_FIRM) === 'open' ? (readBrainPrefs(prefs).firmness ?? DEFAULT_FIRMNESS) : null
}

export interface Reply {
  status: number
  body: unknown
}

const reply = (status: number, body: unknown): Reply => ({ status, body })

/** The task a request is for: the day's own, still open, its line not yet stored (unless started by hand), with a post left. */
async function openTask(deps: Deps, task: unknown, day: unknown): Promise<{ ok: true; t: TaskRow } | { ok: false; reply: Reply }> {
  if (task !== 'line' && task !== 'review' && task !== 'coach') return { ok: false, reply: reply(400, { error: 'task must be line, review or coach' }) }
  if (typeof day !== 'string' || !DAY_RE.test(day)) return { ok: false, reply: reply(400, { error: 'day must be YYYY-MM-DD' }) }
  const t = await deps.store.readTask(taskIdOf(task, day))
  if (!t || (t.status !== 'fired' && t.status !== 'firing')) return { ok: false, reply: reply(409, { error: `no ${task} task is open for ${day}` }) }
  const written = task === 'coach' ? await deps.store.hasCoach(rowIdOf(task, day)) : await deps.store.hasBrief(rowIdOf(task, day))
  if (!t.forced && written) return { ok: false, reply: reply(409, { error: `the ${task} for ${day} is written already` }) }
  if (t.posts >= MAX_POSTS) return { ok: false, reply: reply(409, { error: 'no attempts left' }) }
  return { ok: true, t }
}

interface Run {
  t: TaskRow
  b: LineBriefing
  access: Access
  catalogue: Catalogue
  /** Everything said lately, for the repeat check, whatever Claude may read. */
  said: Said[]
}

/** The briefing for a task, built the same way for its GET and its POST, so a line is checked against exactly what was served. */
async function buildRun(deps: Deps, t: TaskRow): Promise<{ ok: true; run: Run } | { ok: false; reply: Reply }> {
  const facts = await deps.store.readFacts(t.factsDay)
  if (!facts) return { ok: false, reply: reply(409, { error: `the sheet for ${t.factsDay} is missing` }) }
  if (deps.now.getTime() - Date.parse(facts.updatedAt) > MAX_FACTS_AGE_MS) return { ok: false, reply: reply(409, { error: `the sheet for ${t.factsDay} is stale (${facts.updatedAt})` }) }
  const [settings, prefs, catalogue, library] = await Promise.all([deps.store.readRecord('settings', '1'), deps.store.readRecord('brainPrefs', 'prefs'), loadCatalogue(deps.env.CATALOGUE_URL, deps.fetcher), loadLibrary(deps.env.LIBRARY_URL, deps.fetcher)])
  const access = accessFor(t.task === 'review' ? 'review' : 'line', gatesFrom(settings), readBrainPrefs(prefs))
  const sheet = sheetForClaude(facts.sheet, access)
  const said = await saidLately(deps.store, facts.sheet)
  const task = t.task === 'review' ? 'review' : 'line'
  const built = lineBriefing({ task, writer: 'claude', sheet, forDay: t.day, cards: retrieve(library, sheet, task === 'review' ? 16 : 12), said: access.allowed('brainHistory') ? said : [], writerModel: isWriterModel(t.askedModel) ? t.askedModel : 'opus', gates: access.gates, firm: firmOf(deps, prefs) })
  if (!built.ok) return { ok: false, reply: reply(409, { error: built.reason }) }
  return { ok: true, run: { t, b: built.briefing, access, catalogue, said } }
}

interface CoachRun {
  core: Partial<Record<CoachCoreKey, unknown>>
  row: { path: string; candidates: string[] }
  sheet: FactSheet
  access: Access
  catalogue: Catalogue
  /** How firm (Pass 2): the setting, and the firmness the app sets for each rep; null while the gate is closed. */
  firm: FirmnessPref | null
  firmByRep: Record<string, Firmness> | null
}

/**
 * The coach's run (Part 32), the same for its GET and its POST: the decision core by allowlist from
 * today's coach block, the row it may choose for, the sheet for the day guard, and what the coach
 * task may read under the owner's switches and the governing rules.
 */
async function coachRun(deps: Deps, t: TaskRow): Promise<{ ok: true; run: CoachRun } | { ok: false; reply: Reply }> {
  const facts = await deps.store.readFacts(t.factsDay)
  if (!facts?.coach) return { ok: false, reply: reply(409, { error: `no coach block for ${t.factsDay}` }) }
  if (deps.now.getTime() - Date.parse(facts.updatedAt) > MAX_FACTS_AGE_MS) return { ok: false, reply: reply(409, { error: `the sheet for ${t.factsDay} is stale (${facts.updatedAt})` }) }
  const core = coachCore(facts.coach)
  if (core.day !== t.day) return { ok: false, reply: reply(409, { error: `the coach block is for ${String(core.day)}, not ${t.day}` }) }
  const row = rowOf(core)
  if (!row || !row.candidates.length) return { ok: false, reply: reply(409, { error: 'the row has nothing to choose' }) }
  const [settings, prefs, catalogue] = await Promise.all([deps.store.readRecord('settings', '1'), deps.store.readRecord('brainPrefs', 'prefs'), loadCatalogue(deps.env.CATALOGUE_URL, deps.fetcher)])
  const firm = firmOf(deps, prefs)
  const per = (Array.isArray(core.perRep) ? core.perRep : []) as { path: string; id: string; last: (string | null)[] }[]
  const firmByRep = firm ? Object.fromEntries(row.candidates.map((id) => [id, coachFirmness(firm, row.path, (per.find((r) => r.path === row.path && r.id === id)?.last ?? []).filter((x): x is string => typeof x === 'string'))])) : null
  return { ok: true, run: { core, row, sheet: facts.sheet, access: accessFor('coach', gatesFrom(settings), readBrainPrefs(prefs)), catalogue, firm, firmByRep } }
}

async function coachBriefing(deps: Deps, t: TaskRow): Promise<Reply> {
  const built = await coachRun(deps, t)
  if (!built.ok) return built.reply
  const { core, row, sheet, access, catalogue, firm, firmByRep } = built.run
  const ctx = await contextFor(deps.store, catalogue, access, t.day, t.id, deps.now, new Set(), row.path === 'partner' ? 'partner' : 'social', t.dry === true)
  const text = coachBriefingText(core, new Map([...catalogue].map(([id, m]) => [id, m.name])), ctx.text, sheet.showPrivate === true, firmByRep)
  await deps.store.writeTask({ ...t, briefingAt: deps.now.toISOString(), briefingBytes: bytesOf(text) })
  return reply(200, {
    task: t.task,
    day: t.day,
    askedModel: t.askedModel,
    instructions: claudeInstructions('coach', firm),
    briefing: text,
    core,
    answer: { picks: [{ id: 'an id from ELIGIBLE NOW', version: 'one line of today’s version of that rep, at most 25 words', ...(firm ? { firmness: 'the firmness HOW FIRM, BY REP names for that rep' } : {}) }] },
    post: { path: '/claude/line', body: { task: t.task, day: t.day, answer: '<your JSON answer>', askedModel: t.askedModel, writtenModel: '<the exact model id you are running as>', runnerModel: '<the routine’s own model id>', subagentError: null } },
    context: { path: '/claude/context', params: 'task, day, category, from, to, path, stage, tag, q, limit', categories: READABLE.filter((c) => access.allowed(c)), maxCalls: CONTEXT_CALLS, maxBytes: CONTEXT_BYTES, used: { calls: t.contextCalls, bytes: t.contextBytes } },
    attemptsLeft: MAX_POSTS - t.posts,
  })
}

/** The coach's answer: checked; stored where the phone reads it, unless the run was a dry one by hand; or refused with its reason. */
async function coachLine(deps: Deps, t: TaskRow, o: Record<string, unknown>): Promise<Reply> {
  const built = await coachRun(deps, t)
  if (!built.ok) return built.reply
  const { core, row, sheet } = built.run
  const answer = typeof o.answer === 'string' ? parseOutput(o.answer) : o.answer
  const names = sheet.showPrivate === true ? [] : await privateNames(deps.store)
  const verdict = checkCoach(answer, core, sheet, t.day, { names, bears: row.path === 'partner' || core.dateDay === true, usage: built.run.access.allowed('usage') }, built.run.firmByRep)
  const posts = t.posts + 1
  if (!verdict.ok) {
    await deps.store.writeTask({ ...t, posts, refusals: [...t.refusals, verdict.reason].slice(-10), ...(posts >= MAX_POSTS ? { status: 'refused' as const } : {}) })
    return reply(422, { ok: false, reason: verdict.reason, retry: posts < MAX_POSTS })
  }
  const at = deps.now.toISOString()
  const writtenModel = clip(o.writtenModel, 100) || clip(o.runnerModel, 100) || 'claude'
  const runnerModel = clip(o.runnerModel, 100)
  if (!t.dry) await deps.store.writeCoach({ id: rowIdOf('coach', t.day), day: t.day, block: String(core.block ?? ''), path: row.path, ids: verdict.value.ids, versions: verdict.value.versions, ...(verdict.value.firmness ? { firmness: verdict.value.firmness } : {}), model: writtenModel, askedModel: t.askedModel, runnerModel, at }, at)
  await deps.store.writeTask({ ...t, status: 'written', posts, writer: 'claude', writtenModel, runnerModel, subagentError: clip(o.subagentError, 300), writtenAt: at, latencyMs: deps.now.getTime() - Date.parse(t.firedAt ?? t.at) })
  return reply(200, { ok: true, ...(t.dry ? { dry: true } : {}) })
}

/** GET /claude/briefing?task=&day= : the day's briefing, its rules and the shape of the answer, served only to the keyed run. */
export async function handleBriefing(deps: Deps, url: URL): Promise<Reply> {
  const open = await openTask(deps, url.searchParams.get('task'), url.searchParams.get('day'))
  if (!open.ok) return open.reply
  if (open.t.task === 'coach') return coachBriefing(deps, open.t)
  const built = await buildRun(deps, open.t)
  if (!built.ok) return built.reply
  const { t, b, access, catalogue } = built.run
  const onSheet = new Set(b.sheet.facts.filter((f) => f.id.startsWith('note.')).map((f) => f.id))
  const ctx = await contextFor(deps.store, catalogue, access, t.day, t.id, deps.now, onSheet)
  // Follow-up F1: the usage facts the sheet carried, logged by count and size; none while the gate is closed.
  await logUsageOnSheet(deps.store, t.id, t.task === 'review' ? 'review' : 'line', t.day, b.sheet, deps.now, t.dry === true)
  const text = claudeBriefingText({ ...b, context: ctx.text })
  await deps.store.writeTask({ ...t, briefingAt: deps.now.toISOString(), briefingBytes: bytesOf(text) })
  // Pass 2: How firm's field only once its gate is open.
  const firmField = b.firm ? { firmness: 'supportive, balanced or hardCoach, as HOW FIRM says' } : {}
  const answer =
    t.task === 'line'
      ? { mode: 'one of the modes named in the instructions', text: 'the line', ...firmField, factIds: ['ids from FACTS'], cardIds: ['ids from CARDS'], action: null, lacked: ['ids from the instructions’ list, or none'] }
      : { held: 'what held', didNot: 'what did not', change: 'one change', ...firmField, factIds: ['ids from FACTS'], cardIds: ['ids from CARDS'], lacked: ['ids from the instructions’ list, or none'] }
  return reply(200, {
    task: t.task,
    day: t.day,
    askedModel: t.askedModel,
    instructions: claudeInstructions(t.task as 'line' | 'review', b.firm),
    briefing: text,
    answer,
    post: { path: '/claude/line', body: { task: t.task, day: t.day, answer: '<your JSON answer>', askedModel: t.askedModel, writtenModel: '<the exact model id you are running as>', runnerModel: '<the routine’s own model id>', subagentError: null } },
    context: { path: '/claude/context', params: 'task, day, category, from, to, path, stage, tag, q, limit', categories: READABLE.filter((c) => access.allowed(c)), maxCalls: CONTEXT_CALLS, maxBytes: CONTEXT_BYTES, used: { calls: t.contextCalls, bytes: t.contextBytes } },
    attemptsLeft: MAX_POSTS - t.posts,
  })
}

/** GET /claude/context : one filtered, capped read of the record for the open task, after the one check; logged, never its content. */
export async function handleContext(deps: Deps, url: URL): Promise<Reply> {
  const open = await openTask(deps, url.searchParams.get('task'), url.searchParams.get('day'))
  if (!open.ok) return open.reply
  const t = open.t
  const q = parseContextQuery(url, t.day)
  if (!q.ok) return reply(400, { error: q.reason })
  const [settings, prefs] = await Promise.all([deps.store.readRecord('settings', '1'), deps.store.readRecord('brainPrefs', 'prefs')])
  const access = accessFor(t.task, gatesFrom(settings), readBrainPrefs(prefs))
  if (!access.allowed(q.category)) return reply(403, { error: `the ${t.task} task may not read ${q.category}` })
  if (!READABLE.includes(q.category)) return reply(403, { error: `${q.category} is not served here` })
  if (t.contextCalls >= CONTEXT_CALLS) return reply(429, { error: `at most ${CONTEXT_CALLS} reads a run` })
  if (t.contextBytes >= CONTEXT_BYTES) return reply(429, { error: `at most ${CONTEXT_BYTES / 1024} KB a run` })
  const catalogue = await loadCatalogue(deps.env.CATALOGUE_URL, deps.fetcher)
  const r = await readOnDemand(deps.store, catalogue, access, q.category, q.q, t.day, t.id, 100 + t.contextCalls, deps.now, CONTEXT_BYTES - t.contextBytes, t.dry === true, deps.env.TIMEZONE)
  if (!r) return reply(403, { error: `${q.category} is not served here` })
  await deps.store.writeTask({ ...t, contextCalls: t.contextCalls + 1, contextBytes: t.contextBytes + bytesOf(r.text) })
  return reply(200, { category: q.category, items: r.items, truncated: r.truncated })
}

type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string }

/** A line Claude wrote: the checks every line passes, then the surface rules. */
export function checkClaudeLine(b: LineBriefing, said: readonly Said[], raw: unknown, s: Surface): Verdict<BrainOutput> {
  const v = lineCheck(b, said)(raw)
  if (!v.ok) return v
  const g = surfaceGuard(v.value.text, s)
  return g ? { ok: false, reason: g } : v
}

/** A review Claude wrote: the review validator and the day guard, then the surface rules on each part. */
export function checkClaudeReview(b: LineBriefing, raw: unknown, s: Surface): Verdict<ReviewOutput> {
  const v = validateReview(raw, b.sheet, b.cards, b.forDay, b.firm ? { pref: b.firm } : undefined)
  if (!v.ok) return v
  for (const part of [v.value.held, v.value.didNot, v.value.change]) {
    const g = surfaceGuard(part, s)
    if (g) return { ok: false, reason: g }
  }
  return v
}

/** POST /claude/line : the run's answer, checked like any line; stored with who wrote it, or refused with its reason and whether one retry is left. */
export async function handleLine(deps: Deps, raw: unknown): Promise<Reply> {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const open = await openTask(deps, o.task, o.day)
  if (!open.ok) return open.reply
  if (open.t.task === 'coach') return coachLine(deps, open.t, o)
  const built = await buildRun(deps, open.t)
  if (!built.ok) return built.reply
  const { t, b, access, catalogue, said } = built.run
  const answer = typeof o.answer === 'string' ? parseOutput(o.answer) : o.answer
  const names = b.sheet.showPrivate === true ? [] : await privateNames(deps.store)
  const bears =
    t.task === 'line'
      ? await partnerBearsOn(deps.store, t.day, access)
      : access.allowed('partnerPath') && ((await readCategory({ store: deps.store, catalogue, a: access }, 'partnerPath', { from: addDays(t.day, -7), to: t.day, limit: 1, doneOnly: true })) ?? []).length > 0
  const surface = { names, bears, usage: b.sheet.facts.some((f) => isUsageFact(f.id)) }
  const verdict = t.task === 'line' ? checkClaudeLine(b, said, answer, surface) : checkClaudeReview(b, answer, surface)
  const posts = t.posts + 1
  if (!verdict.ok) {
    const refusals = [...t.refusals, verdict.reason].slice(-10)
    await deps.store.writeTask({ ...t, posts, refusals, ...(posts >= MAX_POSTS ? { status: 'refused' as const } : {}) })
    return reply(422, { ok: false, reason: verdict.reason, retry: posts < MAX_POSTS })
  }
  const at = deps.now.toISOString()
  const writtenModel = clip(o.writtenModel, 100) || clip(o.runnerModel, 100) || 'claude'
  const runnerModel = clip(o.runnerModel, 100)
  const latencyMs = deps.now.getTime() - Date.parse(t.firedAt ?? t.at)
  // Part 34: what Claude said it lacked, known ids only; never a reason to refuse.
  const lacked = lackedOf(answer && typeof answer === 'object' ? (answer as Record<string, unknown>).lacked : undefined)
  const firmness = (verdict.value as { firmness?: Firmness }).firmness
  const common = { day: t.day, model: writtenModel, at, factsDay: b.factsDay, forDay: t.day, trigger: t.trigger, shape: b.shape, refusals: t.refusals, calls: posts, latencyMs, writer: 'claude' as const, askedModel: t.askedModel, runnerModel, ...(lacked.length ? { lacked } : {}), ...(firmness ? { firmness, ...(b.firm === 'adaptive' ? { adaptive: true as const } : {}) } : {}) }
  let row: BriefRow
  if (t.task === 'line') {
    const v = verdict.value as BrainOutput
    row = { id: rowIdOf('line', t.day), kind: 'brief', text: v.text, mode: v.mode, factIds: v.factIds, cardIds: v.cardIds, action: v.action, candidates: 1, ...common }
  } else {
    const v = verdict.value as ReviewOutput
    row = { id: rowIdOf('review', t.day), kind: 'review', text: `${v.held} ${v.didNot} ${v.change}`, mode: 'strategy', factIds: v.factIds, cardIds: v.cardIds, action: null, parts: { held: v.held, didNot: v.didNot, change: v.change }, ...common }
  }
  await deps.store.writeBrief(row, at)
  await deps.store.writeTask({ ...t, status: 'written', posts, writer: 'claude', writtenModel, runnerModel, subagentError: clip(o.subagentError, 300), writtenAt: at, latencyMs })
  return reply(200, { ok: true })
}
