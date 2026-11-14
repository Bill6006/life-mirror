import { readBrainPrefs } from '../../src/brainShared'
import { PATTERNS_ID, PATTERNS_MAX_AGE_MS, readPatterns, type PatternsRecord } from '../../src/counted/stored'
import type { Fact } from '../../src/factTypes'
import { NOTE_EVENTS_STORE, noteEventOf, wrongIdOf, type NoteEvent } from '../../src/noteEvents/shared'
import { EVENT_TYPES, eventTypeOf, type EventType } from '../../src/noteEvents/types'
import { WRITEUP_METHOD, writeUpIdOf, writeUpOf, WRITEUPS_STORE, type Followed, type Observation, type WriteUp } from '../../src/writeups/shared'
import { MAX_POSTS, SERVED_STORE, type Deps, type Reply } from './claude'
import { homeDay, LOOKUP_HELP, mayRead, parseLookupQuery, runLookup, type LookupCtx } from './lookups'
import { buildMonth, MONTH_PARTS_MOST, monthSpan, type MonthBuilt, type MonthSpan } from './month'
import { checkMonth, noteWordsOfLine, type CheckedObservation } from './monthCheck'
import { MONTH_ANSWER, monthInstructions, type WrongEvent } from './monthPrompt'
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

/** The month as kept at its first serving, bound to one start of its task. */
export interface KeptMonth {
  taskAt: string
  month: Omit<MonthBuilt, 'ok'>
}

export type MonthDeps = Deps & {
  /** For the tests: the one list of event types; the deployed Worker reads the shared list. */
  types?: readonly EventType[]
}

const reply = (status: number, body: unknown): Reply => ({ status, body })
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** The month task a request is for: open, with a post left. */
async function openMonthTask(deps: MonthDeps, task: unknown, day: unknown): Promise<{ ok: true; t: TaskRow; span: MonthSpan } | { ok: false; reply: Reply }> {
  if (task !== 'month') return { ok: false, reply: reply(400, { error: 'task must be month' }) }
  const span = typeof day === 'string' && DAY_RE.test(day) ? monthSpan(day) : null
  if (typeof day !== 'string' || !span) return { ok: false, reply: reply(400, { error: 'day must be the first day of a month, YYYY-MM-01' }) }
  const t = await deps.store.readTask(monthTaskIdOf(day))
  if (!t || t.task !== 'month' || (t.status !== 'firing' && t.status !== 'fired')) return { ok: false, reply: reply(409, { error: `no month task is open for ${span.month}` }) }
  if (t.posts >= MAX_POSTS) return { ok: false, reply: reply(409, { error: 'no attempts left' }) }
  return { ok: true, t, span }
}

/** The kept copy of a task's month, or null before its briefing was served; a task started again is served afresh. */
export async function keptMonth(store: Store, t: TaskRow): Promise<KeptMonth | null> {
  const row = await store.readBrainRow<KeptMonth>(SERVED_STORE, t.id)
  return row && row.taskAt === t.at && row.month ? row : null
}

/** What the month's read is served under: the owner's switches and the faith rule, as Ask's broad read is. */
async function monthCtx(deps: MonthDeps): Promise<LookupCtx> {
  const [settings, prefs, catalogue] = await Promise.all([deps.store.readRecord('settings', '1'), deps.store.readRecord('brainPrefs', 'prefs'), loadCatalogue(deps.env.CATALOGUE_URL, deps.fetcher)])
  const timeZone = deps.env.TIMEZONE ?? 'UTC'
  return { store: deps.store, catalogue, a: accessFor('deep', gatesFrom(settings), readBrainPrefs(prefs)), day: localTime(deps.now, timeZone).day, now: deps.now, timeZone, showPrivate: obj(settings).showPrivate === true, question: '' }
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
    const built = await buildMonth(await monthCtx(deps), t.day)
    // Not whole, or not ready: nothing is served, and the task ends saying why.
    if (!built.ok) {
      await deps.store.writeTask({ ...t, status: 'fallback', fallbackReason: built.reason })
      return reply(409, { error: built.reason })
    }
    const { ok: _ok, ...month } = built
    kept = { taskAt: t.at, month }
    await deps.store.writeBrainRow(SERVED_STORE, t.id, t.day, kept, at)
  }
  const m = kept.month
  const types = deps.types ?? EVENT_TYPES
  const text = [`MONTH ${span.month}, in ${m.parts.length} ${m.parts.length === 1 ? 'part' : 'parts'}:`, ...m.parts.map((p) => `- part ${p.part}: ${p.days[0]} to ${p.days[p.days.length - 1]}, ${p.lines} lines${p.outside.length ? `; outside the month: ${p.outside.join(', ')}` : ''}`)].join('\n')
  await deps.store.writeTask({ ...t, briefingAt: at, briefingBytes: bytesOf(text), month: { parts: m.parts.length, served: t.month?.served ?? [], other: t.month?.other ?? 0, lines: m.lines, fingerprint: m.fingerprint } })
  return reply(200, {
    task: 'month',
    day: t.day,
    askedModel: t.askedModel,
    instructions: monthInstructions({ month: span.month, parts: m.parts.length, types, wrong: await wrongEvents(deps.store, span, types) }),
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
  const ctx = await monthCtx(deps)
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
  const ctx = await monthCtx(deps)
  const types = deps.types ?? EVENT_TYPES
  // A switch turned off since the month was served takes its lines away here, so an observation resting on one is refused.
  const facts = kept.month.parts.flatMap((p) => p.facts).filter((f) => mayRead(f, ctx.a))
  const names = ctx.showPrivate ? [] : await privateNames(deps.store)
  const bears = ctx.a.allowed('partnerPath') && facts.some((f) => f.values.category === 'partnerPath')
  const verdict = checkMonth(typeof o.answer === 'string' ? safeJson(o.answer) : o.answer, { facts, span, surface: { names, bears }, types })
  if (!verdict.ok) return refuse(verdict.reason)
  // A pattern to follow is checked against the phone's own table, and stored with that cell's counts on this day.
  const table = verdict.value.noticed.some((n) => n.follow) ? await tableNow(deps.store, deps.now) : null
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
    const row: WriteUp = { id: writeUpIdOf(span.month, reading), month: span.month, reading, at, day, method: WRITEUP_METHOD, model: writtenModel, builtFrom: { counts: kept.month.counts, parts: kept.month.parts.length, lines: kept.month.lines, fingerprint: kept.month.fingerprint }, recorded, noticed }
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
