import { readBrainPrefs } from '../../src/brainShared'
import { PATTERNS_ID, PATTERNS_MAX_AGE_MS, readPatterns, type PatternsRecord } from '../../src/counted/stored'
import type { Fact } from '../../src/factTypes'
import { NOTE_EVENTS_STORE, noteEventOf, wrongIdOf, type NoteEvent } from '../../src/noteEvents/shared'
import { EVENT_TYPES, eventTypeOf, type EventType } from '../../src/noteEvents/types'
import { MONTHLY_READ, obsMarkIdOf, WRITEUP_METHOD, writeUpIdOf, writeUpOf, WRITEUPS_STORE, type Followed, type Observation, type WriteUp } from '../../src/writeups/shared'
import { askTaskIds, deepTaskId, handTaskIds } from '../../src/ask/shared'
import { pathTaskIdOf } from '../../src/pathJob'
import { claudeOn, fallbackReason, fire, fireFailure, fireText, MAX_POSTS, SERVED_STORE, timeoutMinutes, type ClaudeEnv, type Deps, type Reply } from './claude'
import { homeDay, LOOKUP_HELP, mayRead, parseLookupQuery, runLookup, type LookupCtx } from './lookups'
import { buildMonth, MONTH_PARTS_MOST, monthSpan, type MonthBuilt, type MonthSpan } from './month'
import { checkMonth, noteWordsOfLine, type CheckedObservation } from './monthCheck'
import { MONTH_ANSWER, monthInstructions, type WrongEvent } from './monthPrompt'
import { MONTH_TRIES_A_DAY, monthToRead, monthToReread, type MonthRun } from './monthSchedule'
import { standInFirst, standInStore } from './monthStandIn'
import { accessFor, bytesOf, gatesFrom, loadCatalogue, obj, privateNames } from './retrieval'
import { localTime } from './time'
import type { Store, TaskRow } from './turso'

// The month's read as a task of the bridge (2026-11-13): its briefing, and the month served part by part. The month's
// lines are built once, when the briefing is first served, and kept in the task's own served row, which the phone
// never asks for; every part is served from that kept copy, so the answer is checked against exactly what was read.
// The task's row records each part served: the Worker, not the run, says whether the whole month was read. The
// month task is served three lookups and nothing else: its own parts, and the pattern table's kinds and cells.

/** The reads a month's run may make beside its parts: the pattern table's kinds and cells, for a pattern to follow. */
export const MONTH_OTHER_READS = 4
/** The most reads a month's run may make in all: every part a month may have, and the others. */
export const MONTH_READS_MOST = MONTH_PARTS_MOST + MONTH_OTHER_READS

/** The id of the task that reads the month beginning on a day. */
export const monthTaskIdOf = (first: string): string => `task:${first}:month`
/** The id of the builder's run by hand on a stand-in month: its own, never the schedule's. */
export const monthHandIdOf = (first: string): string => `task:${first}:month.hand`
/** The longest answer a month's post may carry, in characters. */
export const MONTH_BODY_LIMIT = 60_000

/** The month as kept at its first serving, bound to one start of its task. */
export interface KeptMonth {
  taskAt: string
  /** When the lines were built. */
  builtAt?: string
  month: Omit<MonthBuilt, 'ok'>
}

export type MonthDeps = Deps & {
  /** For the tests: the one list of event types; the deployed Worker reads the shared list. */
  types?: readonly EventType[]
  /** For the tests; the deployed Worker reads the shared gate. */
  gate?: 'gated' | 'open'
}

const reply = (status: number, body: unknown): Reply => ({ status, body })
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** The month task a request is for: open, with a post left. */
async function openMonthTask(deps: MonthDeps, task: unknown, day: unknown): Promise<{ ok: true; t: TaskRow; span: MonthSpan } | { ok: false; reply: Reply }> {
  if (task !== 'month') return { ok: false, reply: reply(400, { error: 'task must be month' }) }
  const span = typeof day === 'string' && DAY_RE.test(day) ? monthSpan(day) : null
  if (typeof day !== 'string' || !span) return { ok: false, reply: reply(400, { error: 'day must be the first day of a month, YYYY-MM-01' }) }
  // The schedule's task for the month, or the builder's run by hand on a stand-in month, which keeps an id of its own.
  const t = (await deps.store.readTasks([monthTaskIdOf(day), monthHandIdOf(day)])).filter((r) => r.task === 'month' && (r.status === 'firing' || r.status === 'fired')).sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  if (!t) return { ok: false, reply: reply(409, { error: `no month task is open for ${span.month}` }) }
  // Closed, only a run by hand is served.
  if ((deps.gate ?? MONTHLY_READ) !== 'open' && t.dry !== true) return { ok: false, reply: reply(403, { error: 'the monthly read is not switched on' }) }
  if (t.posts >= MAX_POSTS) return { ok: false, reply: reply(409, { error: 'no attempts left' }) }
  return { ok: true, t, span }
}

/** The kept copy of a task's month, or null before its briefing was served; a task started again is served afresh. */
export async function keptMonth(store: Store, t: TaskRow): Promise<KeptMonth | null> {
  const row = await store.readBrainRow<KeptMonth>(SERVED_STORE, t.id)
  return row && row.taskAt === t.at && row.month ? row : null
}

/** What the month's read is served under: the owner's switches and the faith rule, as Ask's broad read is. */
async function monthCtx(deps: MonthDeps, t: Pick<TaskRow, 'dry' | 'day'>): Promise<LookupCtx> {
  // A run by hand reads a stand-in month and nothing of the owner's: its record, its settings and its switches are the stand-in's.
  const store = t.dry === true ? standInStore(t.day) : deps.store
  const [settings, prefs, catalogue] = await Promise.all([store.readRecord('settings', '1'), store.readRecord('brainPrefs', 'prefs'), loadCatalogue(deps.env.CATALOGUE_URL, deps.fetcher)])
  const timeZone = deps.env.TIMEZONE ?? 'UTC'
  return { store, catalogue, a: accessFor('deep', gatesFrom(settings), readBrainPrefs(prefs)), day: localTime(deps.now, timeZone).day, now: deps.now, timeZone, showPrivate: obj(settings).showPrivate === true, question: '' }
}

/** The month's events the owner marked wrong, to hand to a read so they are not tagged again. */
export async function wrongEvents(store: Store, span: MonthSpan, types: readonly EventType[] = EVENT_TYPES): Promise<WrongEvent[]> {
  const [rows, marks] = await Promise.all([store.readBrainRows<unknown>(NOTE_EVENTS_STORE, 2000), store.readRecords('noteMarks', {}, 2000)])
  const marked = new Set(marks.filter((m) => obj(m.body).kind === 'wrong').map((m) => m.id))
  return rows
    .flatMap((r) => {
      const e = noteEventOf(r.id, r.body)
      return e && marked.has(wrongIdOf(e.id)) && e.note.day >= span.from && e.note.day <= span.to ? [{ type: eventTypeOf(e.type, types)?.id ?? e.type, day: e.note.day, quote: e.quote }] : []
    })
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

/** What earlier readings of a month said that the owner marked wrong, in their own words, to hand to a read so it is not said again. */
export async function wrongObservations(store: Store, month: string): Promise<string[]> {
  const [rows, marks] = await Promise.all([store.readBrainRows<unknown>(WRITEUPS_STORE, 500), store.readRecords('noteMarks', {}, 2000)])
  const marked = new Set(marks.filter((m) => obj(m.body).kind === 'wrong' && m.id.startsWith('obs:')).map((m) => m.id))
  const out: string[] = []
  for (const w of rows.flatMap((r) => (writeUpOf(r.id, r.body) ? [writeUpOf(r.id, r.body) as WriteUp] : [])).filter((x) => x.month === month).sort((a, b) => a.reading - b.reading)) {
    for (const part of ['recorded', 'noticed'] as const) w[part].forEach((o, i) => marked.has(obsMarkIdOf(w.id, part, i + 1)) && !out.includes(o.text) && out.push(o.text))
  }
  return out
}

/** The parts a month's run has not been served yet. */
export function partsUnread(t: Pick<TaskRow, 'month'>): number[] {
  const m = t.month
  if (!m) return []
  return Array.from({ length: m.parts }, (_, i) => i + 1).filter((p) => !m.served.includes(p))
}

/** GET /claude/briefing?task=month&day=YYYY-MM-01 : the month's rules and the shape of its parts, served only to the keyed run. */
export async function handleMonthBriefing(deps: MonthDeps, url: URL): Promise<Reply> {
  const open = await openMonthTask(deps, url.searchParams.get('task'), url.searchParams.get('day'))
  if (!open.ok) return open.reply
  const { t, span } = open
  const at = deps.now.toISOString()
  let kept = await keptMonth(deps.store, t)
  if (!kept) {
    const built = await buildMonth(await monthCtx(deps, t), t.day)
    // Not whole, or not ready: nothing is served, and the task ends saying why.
    if (!built.ok) {
      await deps.store.writeTask({ ...t, status: 'fallback', fallbackReason: built.reason })
      return reply(409, { error: built.reason })
    }
    const { ok: _ok, ...month } = built
    kept = { taskAt: t.at, builtAt: at, month }
    await deps.store.writeBrainRow(SERVED_STORE, t.id, t.day, kept, at)
  }
  const m = kept.month
  const types = deps.types ?? EVENT_TYPES
  const text = [`MONTH ${span.month}, in ${m.parts.length} ${m.parts.length === 1 ? 'part' : 'parts'}:`, ...m.parts.map((p) => `- part ${p.part}: ${p.days[0]} to ${p.days[p.days.length - 1]}, ${p.lines} lines${p.outside.length ? `; outside the month: ${p.outside.join(', ')}` : ''}`)].join('\n')
  await deps.store.writeTask({ ...t, briefingAt: at, briefingBytes: bytesOf(text), month: { ...t.month, parts: m.parts.length, served: t.month?.served ?? [], other: t.month?.other ?? 0, lines: m.lines, fingerprint: m.fingerprint } })
  return reply(200, {
    task: 'month',
    day: t.day,
    askedModel: t.askedModel,
    instructions: monthInstructions({ month: span.month, parts: m.parts.length, types, wrong: t.dry === true ? [] : await wrongEvents(deps.store, span, types), wrongObservations: t.dry === true ? [] : await wrongObservations(deps.store, span.month) }),
    briefing: text,
    answer: MONTH_ANSWER,
    post: { path: '/claude/line', body: { task: 'month', day: t.day, answer: '<your JSON answer>', askedModel: t.askedModel, writtenModel: '<the exact model id you are running as>', runnerModel: '<the routine’s own model id>', subagentError: null } },
    context: { path: '/claude/context', lookups: [`lookup=month&part=<1 to ${m.parts.length}>: one part of the month, whole days in order, each line with its id`, LOOKUP_HELP.kinds, LOOKUP_HELP.pattern], maxCalls: m.parts.length + MONTH_OTHER_READS, used: { parts: t.month?.served ?? [], other: t.month?.other ?? 0 } },
    attemptsLeft: MAX_POSTS - t.posts,
  })
}

/** What a run is sent of a line: its id and its words. Its values stay with the Worker, for the check. */
const sent = (facts: readonly Fact[]) => facts.map((f) => ({ id: f.id, text: f.text }))

/** GET /claude/context?task=month&day=&lookup= : one part of the month, or the pattern table's kinds or cells; logged by count and size, never content. */
export async function handleMonthContext(deps: MonthDeps, url: URL): Promise<Reply> {
  const open = await openMonthTask(deps, url.searchParams.get('task'), url.searchParams.get('day'))
  if (!open.ok) return open.reply
  const { t } = open
  const lookup = url.searchParams.get('lookup')
  if (lookup !== 'month' && lookup !== 'kinds' && lookup !== 'pattern') return reply(403, { error: 'the month task is served the lookups month, kinds and pattern, and nothing else' })
  const kept = await keptMonth(deps.store, t)
  if (!kept || !t.month) return reply(409, { error: 'fetch the briefing first: the month is built when it is served' })
  const at = deps.now.toISOString()
  const logged = (category: string, count: number, bytes: number) => deps.store.writeRead({ id: `read:${t.id}:${at}:${100 + t.contextCalls}`, day: t.day, at, task: 'month', category, count, bytes, via: 'context', ...(t.dry === true ? { dry: true } : {}) })
  if (lookup === 'month') {
    for (const k of url.searchParams.keys()) if (k !== 'task' && k !== 'day' && k !== 'lookup' && k !== 'part') return reply(400, { error: `unknown parameter "${k}" for the lookup month` })
    const n = Number(url.searchParams.get('part') ?? '')
    const part = Number.isInteger(n) ? kept.month.parts.find((p) => p.part === n) : undefined
    if (!part) return reply(400, { error: `part must be a whole number from 1 to ${kept.month.parts.length}` })
    const facts = sent(part.facts)
    const bytes = bytesOf(JSON.stringify(facts))
    await logged('lookup.month', facts.length, bytes)
    // Each part served is recorded on the task: the Worker, not the run, says whether the whole month was read.
    await deps.store.writeTask({ ...t, contextCalls: t.contextCalls + 1, contextBytes: t.contextBytes + bytes, month: { ...t.month, served: [...new Set([...t.month.served, part.part])].sort((a, b) => a - b) } })
    return reply(200, { lookup: 'month', part: part.part, parts: kept.month.parts.length, days: part.days, outside: part.outside, lines: part.lines, facts })
  }
  if (t.month.other >= MONTH_OTHER_READS) return reply(429, { error: `at most ${MONTH_OTHER_READS} reads beside the month's own parts` })
  const ctx = await monthCtx(deps, t)
  const q = parseLookupQuery(url, ctx.day)
  if (!q.ok) return reply(400, { error: q.reason })
  const r = await runLookup(ctx, q.query)
  const facts = sent(r.facts)
  const bytes = facts.length ? bytesOf(JSON.stringify(facts)) : 0
  await logged(`lookup.${lookup}`, facts.length, bytes)
  await deps.store.writeTask({ ...t, contextCalls: t.contextCalls + 1, contextBytes: t.contextBytes + bytes, month: { ...t.month, other: t.month.other + 1 } })
  return reply(200, { lookup, facts, complete: r.complete, notRead: r.notRead, ...(r.note ? { note: r.note } : {}) })
}

// ─── The post ───────────────────────────────────────────────────────────────────────────────────

const clip = (v: unknown, n: number): string | null => (typeof v === 'string' ? v.slice(0, n) : null)
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** The pattern table as the phone last built it, or null when none can be read now: missing, unreadable or stale. */
async function tableNow(store: Store, now: Date): Promise<PatternsRecord | null> {
  const table = readPatterns(await store.readRecord('patterns', PATTERNS_ID))
  if (!table) return null
  const age = now.getTime() - Date.parse(table.updatedAt)
  return Number.isFinite(age) && age <= PATTERNS_MAX_AGE_MS ? table : null
}

/**
 * The cell a "Claude noticed" observation asks to be followed in, with the table's counts for it on this day; or why
 * it cannot be followed. A kind this run may not read is answered as one the table does not hold.
 */
export function followedOf(follow: NonNullable<CheckedObservation['follow']>, table: PatternsRecord | null, allowed: (category: string) => boolean): Followed | string {
  if (!table) return 'names a pattern to follow, and no pattern table can be read now: leave "follow" out'
  const kind = table.kinds.find((k) => k.id === follow.kind && allowed(k.category))
  const cell = kind?.cells?.find((c) => c.split === follow.split && c.cell === follow.cell)
  if (!kind || !cell) return `names a pattern the table does not hold (${follow.kind}, ${follow.split}, ${follow.cell}): take the three from lookup=kinds and lookup=pattern, or leave "follow" out`
  return { kind: kind.id, split: cell.split, cell: cell.cell, k: cell.k, n: cell.n, restK: cell.restK, m: cell.m }
}

/** The id an event is stored under: its note's record and its type, so a second reading that finds it again writes nothing new. */
export const eventIdOf = (note: { store: string; id: string }, type: string): string => `${note.store}:${note.id}:${type}`

/**
 * POST /claude/line for a month's read: whole, or nothing saved. An answer is refused unless every part was served;
 * then it is checked against the kept copy of the month, every reason at once. A checked answer becomes the month's
 * write-up, a new row beside any earlier reading, and each event is stored against its note's record, unless the
 * owner marked that event wrong. A run by hand stores nothing the phone reads.
 */
export async function handleMonthLine(deps: MonthDeps, raw: unknown): Promise<Reply> {
  const o = obj(raw)
  const open = await openMonthTask(deps, o.task, o.day)
  if (!open.ok) return open.reply
  const { t, span } = open
  const kept = await keptMonth(deps.store, t)
  if (!t.month || !kept) return reply(409, { error: 'fetch the briefing first: the month is built when it is served' })
  const posts = t.posts + 1
  const refuse = async (reason: string): Promise<Reply> => {
    const spent = posts >= MAX_POSTS
    await deps.store.writeTask({ ...t, posts, refusals: [...t.refusals, reason].slice(-10), ...(spent ? { status: 'refused' as const } : {}) })
    return reply(422, { ok: false, reason, retry: !spent })
  }
  // The Worker, not the run, says whether the whole month was read.
  const unread = partsUnread(t)
  if (unread.length) return refuse(`${unread.length === 1 ? 'part' : 'parts'} ${unread.join(', ')} of ${t.month.parts} ${unread.length === 1 ? 'was' : 'were'} not read: read every part, then post again`)
  const ctx = await monthCtx(deps, t)
  const types = deps.types ?? EVENT_TYPES
  // A switch turned off since the month was served takes its lines away here, so an observation resting on one is refused.
  const facts = kept.month.parts.flatMap((p) => p.facts).filter((f) => mayRead(f, ctx.a))
  const names = ctx.showPrivate ? [] : await privateNames(ctx.store)
  const bears = ctx.a.allowed('partnerPath') && facts.some((f) => f.values.category === 'partnerPath')
  const verdict = checkMonth(typeof o.answer === 'string' ? safeJson(o.answer) : o.answer, { facts, span, surface: { names, bears }, types })
  if (!verdict.ok) return refuse(verdict.reason)
  // A pattern to follow is checked against the phone's own table, and stored with that cell's counts on this day.
  const table = verdict.value.noticed.some((n) => n.follow) ? await tableNow(ctx.store, deps.now) : null
  const whys: string[] = []
  const observed = (list: readonly CheckedObservation[], part: 'recorded' | 'noticed'): Observation[] =>
    list.map((c, i) => {
      const followed = c.follow ? followedOf(c.follow, table, (category) => ctx.a.allowed(category as never)) : undefined
      if (typeof followed === 'string') whys.push(`${part === 'recorded' ? 'you recorded' : 'Claude noticed'} ${i + 1}: ${followed}`)
      return { text: c.text, days: c.days, kinds: c.kinds, ...(c.faith ? { faith: true as const } : {}), ...(followed && typeof followed !== 'string' ? { followed } : {}) }
    })
  const recorded = observed(verdict.value.recorded, 'recorded')
  const noticed = observed(verdict.value.noticed, 'noticed')
  if (whys.length) return refuse(whys.join('; and '))

  const at = deps.now.toISOString()
  const writtenModel = clip(o.writtenModel, 100) || clip(o.runnerModel, 100) || 'claude'
  let reading = 0
  let stored = 0
  let dropped = 0
  if (!t.dry) {
    const [rows, marks, events] = await Promise.all([deps.store.readBrainRows<unknown>(WRITEUPS_STORE, 500), deps.store.readRecords('noteMarks', {}, 2000), deps.store.readBrainRows<unknown>(NOTE_EVENTS_STORE, 2000)])
    // A later reading is a new row beside the first, never over it.
    reading = Math.max(0, ...rows.flatMap((r) => (writeUpOf(r.id, r.body)?.month === span.month ? [writeUpOf(r.id, r.body)?.reading ?? 0] : []))) + 1
    const day = homeDay(at, ctx.timeZone) ?? ctx.day
    const row: WriteUp = { id: writeUpIdOf(span.month, reading), month: span.month, reading, at, day, method: WRITEUP_METHOD, model: writtenModel, builtFrom: { counts: kept.month.counts, parts: kept.month.parts.length, lines: kept.month.lines, fingerprint: kept.month.fingerprint, builtAt: kept.builtAt ?? t.at }, recorded, noticed }
    await deps.store.writeBrainRow(WRITEUPS_STORE, row.id, day, row, at)
    const wrong = new Set(marks.filter((m) => obj(m.body).kind === 'wrong').map((m) => m.id))
    const known = new Map(events.flatMap((r) => (noteEventOf(r.id, r.body) ? [[r.id, noteEventOf(r.id, r.body) as NoteEvent] as const] : [])))
    const lines = new Map(kept.month.parts.flatMap((p) => p.facts).map((f) => [f.id, f]))
    for (const e of verdict.value.events) {
      const note = kept.month.notes[e.factId]
      if (!note) continue
      const id = eventIdOf(note, e.type)
      // An event the owner marked wrong does not return, whatever the run found.
      if (wrong.has(wrongIdOf(id))) {
        dropped++
        continue
      }
      // Found again: the first stands while its note still holds its quoted words; a quote the note has lost is replaced.
      const before = known.get(id)
      const words = noteWordsOfLine(lines.get(e.factId) as Fact) ?? ''
      if (before && words.includes(before.quote)) continue
      await deps.store.writeBrainRow(NOTE_EVENTS_STORE, id, note.day, { type: e.type, note, quote: e.quote, noticedAt: at, method: `month-${WRITEUP_METHOD}` }, at)
      stored++
    }
  }
  await deps.store.writeTask({ ...t, status: 'written', posts, writer: 'claude', writtenModel, runnerModel: clip(o.runnerModel, 100), subagentError: clip(o.subagentError, 300), writtenAt: at, latencyMs: deps.now.getTime() - Date.parse(t.firedAt ?? t.at), month: { ...t.month, ...(t.dry ? {} : { reading }), events: stored, dropped } })
  return reply(200, { ok: true, ...(t.dry ? { dry: true } : {}) })
}

// ─── The schedule ───────────────────────────────────────────────────────────────────────────────

export type MonthsEnv = ClaudeEnv & { TIMEZONE: string }

export interface MonthsOptions {
  /** By hand with the run key: one run on a stand-in month, past the gate and the switch; nothing of the owner's is read, nothing stored where the phone reads. */
  dry?: boolean
  /** By hand with the run key: what the schedule would do now, and nothing done. */
  plan?: boolean
  fireFetcher?: typeof fetch
  /** For the tests: what fetches the catalogue when a month is built to see whether its lines changed. */
  fetcher?: typeof fetch
  /** For the tests; the deployed Worker reads the shared gate. */
  gate?: 'gated' | 'open'
}

export interface MonthsResult {
  ran: boolean
  reason: string
  day?: string
  task?: string
  /** A plan's view: whether the read is switched on, the months that hold records, those that have a write-up, and a month that would be read again with why. Never a word of any. */
  switchedOn?: boolean
  months?: string[]
  written?: string[]
  reread?: string
}

/** The store and the row of the Worker's own that hold whether the monthly read runs: set by hand with the run key, once the app that shows a write-up is verified live. */
export const SWITCHES_STORE = 'switches'
export const MONTH_SWITCH_ID = 'monthlyRead'

/** Whether the monthly read is switched on: off until it is set, so a deploy alone starts nothing. */
export async function monthSwitchOn(store: Store): Promise<boolean> {
  return (await store.readBrainRow<{ on?: unknown }>(SWITCHES_STORE, MONTH_SWITCH_ID))?.on === true
}

/** Sets the switch, with when. */
export async function setMonthSwitch(store: Store, on: boolean, now: Date): Promise<void> {
  const at = now.toISOString()
  await store.writeBrainRow(SWITCHES_STORE, MONTH_SWITCH_ID, at.slice(0, 10), { on, at }, at)
}

/** A run of the routine under way: the Brain's own of the day, an answer to a question, or a Path being drafted or read. One run at a time. */
async function busyNow(store: Store, day: string, now: Date, minutes: number): Promise<boolean> {
  const ids = [...['line', 'coach', 'review', 'progress'].map((k) => `task:${day}:${k}`), ...askTaskIds(day), deepTaskId(day), ...handTaskIds(day), pathTaskIdOf(day, 'path'), pathTaskIdOf(day, 'pathRead')]
  return (await store.readTasks(ids)).some((t) => (t.status === 'firing' || t.status === 'fired') && !fallbackReason(t, now, minutes))
}

/** Marks a month's run, then fires the routine with no personal text: the task, the month's first day and the model alias. The mark comes first, since a fire has no idempotency key. */
async function startMonth(env: MonthsEnv, store: Store, now: Date, first: string, id: string, dry: boolean, opts: MonthsOptions): Promise<MonthsResult> {
  const [prefsRow, prev] = await Promise.all([store.readRecord('brainPrefs', 'prefs'), store.readTask(id)])
  const prefs = readBrainPrefs(prefsRow)
  const at = now.toISOString()
  const today = localTime(now, env.TIMEZONE).day
  // How many times this month was tried today: a read that failed is tried again, three tries a day at most.
  const tries = { day: today, n: prev?.month?.tries?.day === today ? prev.month.tries.n + 1 : 1 }
  const row: TaskRow = { id, kind: 'task', task: 'month', day: first, at, status: 'firing', trigger: dry ? 'forced' : 'ask', factsDay: first, askedModel: prefs.writerModel, ...(dry ? { forced: true, dry: true } : {}), fires: (prev ? (prev.fires ?? 1) : 0) + 1, contextCalls: 0, contextBytes: 0, posts: 0, refusals: [], month: { parts: 0, served: [], other: 0, lines: 0, fingerprint: '', tries } }
  await store.writeTask(row)
  const f = await fire(env, fireText('month', first, prefs.writerModel), opts.fireFetcher)
  if (f.ok) {
    await store.writeTask({ ...row, status: 'fired', firedAt: at, fireStatus: f.status, sessionUrl: f.sessionUrl })
    return { ran: true, reason: 'Claude is reading the month', day: first, task: id }
  }
  const why = fireFailure(f)
  await store.writeTask({ ...row, status: 'fallback', fireStatus: f.status, retryAfter: f.retryAfter, error: f.error, fallbackReason: why })
  return { ran: false, reason: why, day: first, task: id }
}

/**
 * The monthly read's job, on the quarter-hour. Closed, or switched off, it starts nothing. Open: the oldest month that
 * holds records, has had its days after it pass and has no write-up is read, one at a time, two a day at most, never
 * between 9:00 and 11:30, never while another run of the routine is under way. A run that passed its time is let go and
 * counted as a failed try. By hand: one run on a stand-in month, or the plan alone.
 */
export async function runMonths(env: MonthsEnv, store: Store, now: Date, opts: MonthsOptions = {}): Promise<MonthsResult> {
  if ((opts.gate ?? MONTHLY_READ) !== 'open' && !opts.dry) return { ran: false, reason: 'gated' }
  if (!claudeOn(env)) return { ran: false, reason: 'Claude is off' }
  const local = localTime(now, env.TIMEZONE)
  const today = local.day
  if (opts.dry) {
    // The builder's run: a stand-in month, an id of its own, counting against nothing.
    const first = standInFirst(today)
    return startMonth(env, store, now, first, monthHandIdOf(first), true, opts)
  }
  const [switchedOn, prefs] = await Promise.all([monthSwitchOn(store), store.readRecord('brainPrefs', 'prefs')])
  if (!opts.plan) {
    if (!switchedOn) return { ran: false, reason: 'the monthly read is not switched on yet' }
    if (readBrainPrefs(prefs).monthlyRead === false) return { ran: false, reason: 'the monthly read is switched off in Settings' }
  }
  const stamps = await store.monthStamps()
  const months = stamps.filter((s) => s.held > 0).map((s) => s.month)
  const minutes = timeoutMinutes(env)
  const runs: MonthRun[] = []
  for (const t of await store.readTasks(months.map((m) => monthTaskIdOf(`${m}-01`)))) {
    const month = t.day.slice(0, 7)
    if (t.status === 'firing' || t.status === 'fired') {
      const why = fallbackReason(t, now, minutes)
      if (!why) {
        runs.push({ month, status: 'open' })
        continue
      }
      // Past its time: let go, and counted with the day's failed tries below.
      if (!opts.plan) await store.writeTask({ ...t, status: 'fallback', fallbackReason: why })
    }
    if (t.status === 'written') {
      if (t.writtenAt && localTime(new Date(t.writtenAt), env.TIMEZONE).day === today) runs.push({ month, status: 'written' })
      continue
    }
    if (t.month?.tries?.day === today) for (let i = 0; i < t.month.tries.n; i++) runs.push({ month, status: 'failed' })
  }
  const writeUps = (await store.readBrainRows<unknown>(WRITEUPS_STORE, 500)).flatMap((r) => (writeUpOf(r.id, r.body) ? [writeUpOf(r.id, r.body) as WriteUp] : []))
  const written = [...new Set(writeUps.map((w) => w.month))].sort()
  const decision = monthToRead({ today, hhmm: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`, months, written, runs, busy: await busyNow(store, today, now, minutes) })
  // No first read is owed and nothing stands in the way: a month whose record changed, or whose write-up an older method wrote, is read again.
  const again = 'first' in decision || decision.reason !== 'no month is waiting to be read' ? null : await rereadOf(store, now, stamps, writeUps, runs)
  if (opts.plan) return { ran: false, reason: 'first' in decision ? `would read ${decision.first.slice(0, 7)}` : decision.reason, day: today, switchedOn, months, written, ...(again ? { reread: `${again.month} (${again.why === 'method' ? 'an older method wrote it' : 'its record changed'})` } : {}) }
  if ('first' in decision) return startMonth(env, store, now, decision.first, monthTaskIdOf(decision.first), false, opts)
  if (!again) return { ran: false, reason: decision.reason, day: today }
  const first = `${again.month}-01`
  if (again.why === 'changed') {
    // A change may leave the month's lines as they were (a row synced again, a day beside the month): the lines are built and compared before a run is spent.
    const built = await buildMonth(await monthCtx({ env, store, now, ...(opts.fetcher ? { fetcher: opts.fetcher } : {}) }, { day: first }), first)
    if (!built.ok) return { ran: false, reason: built.reason, day: first }
    if (built.fingerprint === again.fingerprint) {
      await store.writeBrainRow(MONTH_CHECKS_STORE, again.month, today, { changed: again.changed, at: now.toISOString() }, now.toISOString())
      return { ran: false, reason: `the record of ${again.month} changed and its lines did not`, day: first }
    }
  }
  return startMonth(env, store, now, first, monthTaskIdOf(first), false, opts)
}

/** The Worker's own store of changes already looked at: a month's change stamp that left its lines as they were. */
export const MONTH_CHECKS_STORE = 'monthChecks'

/**
 * The month to read again, if any, with its newest write-up's fingerprint and the change that puts it up. A month
 * whose newest write-up was forgotten is not read again by itself; nor one whose tries of the day are used.
 */
async function rereadOf(store: Store, now: Date, stamps: readonly { month: string; changed: string }[], writeUps: readonly WriteUp[], runs: readonly MonthRun[]): Promise<{ month: string; why: 'method' | 'changed'; fingerprint: string; changed: string | null } | null> {
  const [forget, checks] = await Promise.all([store.readRecord('noteMarks', 'forget'), store.readBrainRows<{ changed?: unknown }>(MONTH_CHECKS_STORE, 200)])
  const forgot = obj(forget).kind === 'forget' && typeof obj(forget).at === 'string' ? Date.parse(String(obj(forget).at)) : Number.NaN
  const newest = new Map<string, WriteUp>()
  for (const w of writeUps) if ((newest.get(w.month)?.reading ?? 0) < w.reading) newest.set(w.month, w)
  const states = [...newest.values()]
    .filter((w) => !(Date.parse(w.at) <= forgot))
    .filter((w) => runs.filter((r) => r.month === w.month && r.status === 'failed').length < MONTH_TRIES_A_DAY)
    .map((w) => ({ month: w.month, builtAt: w.builtFrom.builtAt ?? w.at, method: w.method, changed: stamps.find((s) => s.month === w.month)?.changed || null, checked: (typeof checks.find((c) => c.id === w.month)?.body.changed === 'string' ? String(checks.find((c) => c.id === w.month)?.body.changed) : null) as string | null }))
  const pick = monthToReread({ now, method: WRITEUP_METHOD, months: states })
  if (!pick) return null
  const w = newest.get(pick.month) as WriteUp
  return { ...pick, fingerprint: w.builtFrom.fingerprint, changed: states.find((s) => s.month === pick.month)?.changed ?? null }
}
