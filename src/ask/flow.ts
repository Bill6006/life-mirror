import { blockAt } from '../blocks'
import { writeFactsRow } from '../brainFlow'
import { reachedClaude } from '../coachShared'
import { copy } from '../copy'
import { db, getSettings } from '../db'
import { fill } from '../format'
import { guardRepair } from '../repair/breaker'
import { repairEvidence, type RepairEvidence, type TestShown } from '../repair/evidence'
import { citeOf, evidenceVersion, testsOf } from './evidence'
import { testsNamed } from './match'
import { allowanceUsed, answerIdOf, ASK_ANSWERS_A_DAY, askTaskIds, askWaitOf, deepTaskId, roomFor, type AskAnswer, type AskRun, type AskWait } from './shared'
import { aboutAnswer, changedAnswer, keysOfLine, knowAnswer, liftable, nextAnswer, type Laid, type LastRead } from './quick'
import type { AboutSource, AskStarter, AskThread, AskTurn, KeptNote } from './types'

// Ask Life Mirror on the phone (stage A1, 2026-10-19): threads begun from a starter, from "Ask about this", or from a typed
// question; the quick tier answering at once; a typed question kept waiting for Claude (stage A2); asking again, cancelling
// and deleting. Every thread and turn is the phone's own record, synced and in the export; nothing here is evidence.

/** The longest question kept: a question, not an essay. */
export const QUESTION_MAX = 500

/** The engine's read for today, through its breaker: null when it could not read the record. */
export async function askEvidence(now: Date = new Date()): Promise<RepairEvidence | null> {
  const today = blockAt(now).day
  return guardRepair(today, () => repairEvidence(today), null)
}

/** The read a new "What do you know" or "What's changed" compares against: the newest answered one of either. */
export async function lastRead(): Promise<LastRead | null> {
  const turns = await db.askTurns.toArray()
  const reads = turns.filter((t) => t.state === 'answered' && (t.kind === 'know' || t.kind === 'changed')).sort((a, b) => (a.at < b.at ? 1 : -1))
  const t = reads[0]
  return t ? { day: t.day, cited: t.cited, version: t.version } : null
}

async function startThread(thread: Omit<AskThread, 'id'>, turn: Omit<AskTurn, 'id' | 'threadId'>): Promise<number> {
  return db.transaction('rw', db.askThreads, db.askTurns, async () => {
    const id = (await db.askThreads.add(thread)) as number
    await db.askTurns.add({ ...turn, threadId: id })
    return id
  })
}

function answeredTurn(question: string, kind: AskTurn['kind'], laid: Laid, ev: RepairEvidence, now: Date, keys?: string[]): Omit<AskTurn, 'id' | 'threadId'> {
  const at = now.toISOString()
  return { day: blockAt(now).day, at, question, tier: 'quick', state: 'answered', kind, ...(keys ? { keys } : {}), version: evidenceVersion(ev), quick: laid.answer, cited: laid.cited, updatedAt: at }
}

/** A starter's answer, from the read and the last read. */
function starterLaid(starter: Exclude<AskStarter, 'deep'>, ev: RepairEvidence, last: LastRead | null): Laid {
  if (starter === 'next') return nextAnswer(ev)
  if (starter === 'changed' && last) return changedAnswer(ev, last)
  return knowAnswer(ev, last)
}

/** A starter: a new thread, answered at once by the quick tier. Null when the record could not be read. */
export async function askStarter(starter: Exclude<AskStarter, 'deep'>, now: Date = new Date()): Promise<number | null> {
  const ev = await askEvidence(now)
  if (!ev) return null
  const question = copy.askMirror.starters[starter]
  const turn = answeredTurn(question, starter, starterLaid(starter, ev, await lastRead()), ev, now)
  return startThread({ day: turn.day, at: turn.at, title: question, from: { kind: 'starter', starter } }, turn)
}

/** What "Ask about this" asks, in words: the test's own name, or the day's line. */
export function aboutQuestion(keys: readonly string[], source: AboutSource, nameOf: (key: string) => string): string {
  const w = copy.askMirror
  if (source === 'brain') return fill(w.aboutTitle, { what: w.aboutLine })
  return fill(w.aboutTitle, { what: keys.length ? nameOf(keys[0]) : w.aboutLine })
}

/** What "Ask about this" attaches: a test's own key from Evidence, or a line's fact ids from the Brain card. */
export type AboutRef = { keys: readonly string[] } | { factIds: readonly string[] }

/** "Ask about this": a new thread with the findings attached, answered at once. Null when the record could not be read. */
export async function askAbout(ref: AboutRef, source: AboutSource, question: string, now: Date = new Date()): Promise<number | null> {
  const ev = await askEvidence(now)
  if (!ev) return null
  const keys = 'keys' in ref ? [...ref.keys] : keysOfLine(ref.factIds, ev)
  const turn = { ...answeredTurn(question, 'about', aboutAnswer(keys, ev, question), ev, now, [...keys]), ...askedMarks(keys.length === 1 ? keys : [], ev, now) }
  return startThread({ day: turn.day, at: turn.at, title: question, from: { kind: 'about', source, keys: [...keys] } }, turn)
}

/** How a question for Claude is asked: `sheet: false` leaves the day's sheet as it is (the unit tests, which have none to write). */
export interface AskOptions {
  sheet?: boolean
}

/**
 * The day's sheet written again as a question for Claude is asked (stage A2), so its run reads the evidence as it stood
 * then. Never in the way of the question: a sheet that cannot be built leaves the question waiting as it is.
 */
async function sheetNow(now: Date, opts: AskOptions): Promise<void> {
  if (opts.sheet === false) return
  try {
    await writeFactsRow(blockAt(now).day, now)
  } catch {
    // The run reads the sheet the phone wrote last.
  }
}

/** A typed question: in a new thread, or in an open one as a follow-up; kept waiting for Claude. Null for an empty question. */
export async function askTyped(raw: string, threadId: number | null, now: Date = new Date(), opts: AskOptions = {}): Promise<number | null> {
  const question = raw.trim().slice(0, QUESTION_MAX)
  if (!question) return null
  const ev = await askEvidence(now)
  const at = now.toISOString()
  const named = ev ? testsNamed(question, ev) : []
  const turn: Omit<AskTurn, 'id' | 'threadId'> = { day: blockAt(now).day, at, question, tier: 'standard', state: 'waiting', kind: 'typed', version: ev ? evidenceVersion(ev) : '', cited: [], updatedAt: at, ...(ev ? askedMarks(named.length === 1 ? [named[0].key] : [], ev, now) : {}) }
  const id = threadId === null ? await startThread({ day: turn.day, at, title: question, from: { kind: 'typed' } }, turn) : (await db.askTurns.add({ ...turn, threadId }), threadId)
  await sheetNow(now, opts)
  return id
}

/**
 * The asked mark a question leaves (stage A3, point 14): the one test it names by both its move and its reading, or the
 * one "Ask about this" attaches, when that test is not established. Keys and days alone.
 */
function askedMarks(keys: readonly string[], ev: Pick<RepairEvidence, 'shown' | 'quiet'>, now: Date): Pick<AskTurn, 'asked'> {
  const tests = testsOf(ev)
  const open = keys.filter((k) => tests.has(k) && tests.get(k)?.level !== 'established')
  // A test over seven days never waits in the queue: asking about it lifts nothing, so it is not marked.
  const queued = open.filter((k) => liftable(tests.get(k) as TestShown))
  return queued.length ? { asked: queued.map((key) => ({ key, day: blockAt(now).day })) } : {}
}

/** The one test a turn asks about, for "Test it" (point 13): the answer's own, the one "Ask about this" attached, or the one its words name; never an established one. */
export function testOfTurn(t: Pick<AskTurn, 'kind' | 'keys' | 'question'>, answer: Pick<AskAnswer, 'test'> | undefined, ev: Pick<RepairEvidence, 'shown' | 'quiet'>) {
  const tests = testsOf(ev)
  const named = t.kind === 'typed' ? testsNamed(t.question, ev) : []
  const key = answer?.test ?? (t.kind === 'about' && (t.keys ?? []).length === 1 ? (t.keys ?? [])[0] : named.length === 1 ? named[0].key : undefined)
  const test = key ? tests.get(key) : undefined
  return test && test.level !== 'established' ? test : null
}

/** "Test it sooner" (point 14): the owner's tap, an asked mark on the turn for that test, today. Nothing recorded changes. */
export async function askSooner(turnId: number, key: string, now: Date = new Date()): Promise<void> {
  const day = blockAt(now).day
  await db.transaction('rw', db.askTurns, async () => {
    const t = await db.askTurns.get(turnId)
    if (!t || (t.asked ?? []).some((m) => m.key === key && m.day === day)) return
    await db.askTurns.put({ ...t, asked: [...(t.asked ?? []), { key, day }], updatedAt: now.toISOString() })
  })
}

/** A note kept from Ask, removed at the owner's tap: from this phone, and from the cloud copy by its tombstone. */
export async function removeNote(id: number): Promise<void> {
  await db.notes.delete(id)
}

/** "Add this as a note" (point 12): the owner's own words, kept as a note of today, from Ask. Null for nothing to keep. */
export async function keepNote(turnId: number, raw: string, now: Date = new Date()): Promise<number | null> {
  const text = raw.trim().slice(0, QUESTION_MAX)
  if (!text) return null
  const at = now.toISOString()
  const note: KeptNote = { day: blockAt(now).day, text, from: 'ask', turnId, createdAt: at, updatedAt: at }
  return (await db.notes.add(note)) as number
}

/** "Explain this to me" (point 4): a standard question in the same thread, its packet the quick answer above it. */
export function askExplain(threadId: number, now: Date = new Date(), opts: AskOptions = {}): Promise<number | null> {
  return askTyped(copy.askMirror.explainQuestion, threadId, now, opts)
}

/** "Coach me on everything" (point 3): the deep tier, in a new thread, waiting for its one run of the day. */
export async function askDeep(now: Date = new Date(), opts: AskOptions = {}): Promise<number> {
  const ev = await askEvidence(now)
  const at = now.toISOString()
  const question = copy.askMirror.starters.deep
  const turn: Omit<AskTurn, 'id' | 'threadId'> = { day: blockAt(now).day, at, question, tier: 'deep', state: 'waiting', kind: 'deep', version: ev ? evidenceVersion(ev) : '', cited: [], updatedAt: at }
  const id = await startThread({ day: turn.day, at, title: question, from: { kind: 'starter', starter: 'deep' } }, turn)
  await sheetNow(now, opts)
  return id
}

/** The findings an answer cited, from its fact ids (`ladder.<move>.<reading>`), as the phone's read holds them now. */
export function citationsOf(factIds: readonly string[], ev: Pick<RepairEvidence, 'shown' | 'quiet'>) {
  const tests = [...ev.shown, ...ev.quiet]
  return factIds.flatMap((id) => {
    const m = /^ladder\.(.+)\.([a-zA-Z]+)$/.exec(id)
    const t = m ? tests.find((x) => x.moveId === m[1] && x.target === m[2]) : undefined
    return t ? [citeOf(t)] : []
  })
}

/**
 * Claude's answers that came for questions still waiting on this phone (stage A2): each turn marked answered in the
 * phone's own record, with the findings its answer cited as the read holds them now, so its marker can say later what
 * changed. Returns how many were marked.
 */
export async function settleAskTurns(now: Date = new Date()): Promise<number> {
  const answers = await db.askAnswers.toArray()
  if (!answers.length) return 0
  const by = new Map(answers.map((a) => [a.turnId, a]))
  const due = (await db.askTurns.toArray()).filter((t) => t.state === 'waiting' && by.has(t.id as number))
  if (!due.length) return 0
  const ev = await askEvidence(now)
  for (const t of due) {
    const a = by.get(t.id as number) as AskAnswer
    const cited = ev && a.status === 'answered' ? citationsOf(a.factIds ?? [], ev) : []
    await db.transaction('rw', db.askTurns, async () => {
      const cur = await db.askTurns.get(t.id as number)
      if (cur && cur.state === 'waiting') await db.askTurns.put({ ...cur, state: 'answered', cited, ...(ev ? { version: evidenceVersion(ev) } : {}), updatedAt: now.toISOString() })
    })
  }
  return due.length
}

/** Where each question waiting for Claude stands now (point 17), by turn. */
export async function askWaits(now: Date = new Date()): Promise<Map<number, AskWait>> {
  const day = blockAt(now).day
  const [turns, runs, settings, queuedRows, sync, line] = await Promise.all([db.askTurns.toArray(), db.askRuns.where('day').equals(day).toArray(), getSettings(), db.outbox.filter((r) => r.store === 'askTurns').toArray(), db.cloudMeta.get('state'), db.brainBriefs.get(`${day}:brief`)])
  const queued = new Set(queuedRows.map((r) => r.key))
  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  const o = { cloud: Boolean(settings.cloud.token), reachable: online && !sync?.lastError, lineIn: Boolean(line) }
  const out = new Map<number, AskWait>()
  for (const t of turns) if (t.state === 'waiting' && t.tier !== 'quick' && typeof t.id === 'number') out.set(t.id, askWaitOf(t, runs, { ...o, queued: queued.has(String(t.id)) }))
  return out
}

/** The day's allowance as the main screen shows it: answers left, and whether the deep tier fits today. Null without a cloud copy, when Claude cannot be asked. */
export async function askAllowance(now: Date = new Date()): Promise<{ left: number; of: number; deep: boolean } | null> {
  const [runs, settings] = await Promise.all([db.askRuns.where('day').equals(blockAt(now).day).toArray(), getSettings()])
  if (!settings.cloud.token) return null
  return { left: Math.max(0, ASK_ANSWERS_A_DAY - allowanceUsed(runs)), of: ASK_ANSWERS_A_DAY, deep: roomFor('deep', runs) }
}

/** The brain's rows a waiting question looks at, by key: each waiting turn's answer, and the day's runs. */
export function askWaitingKeys(waiting: readonly number[], day: string): { store: string; id: string }[] {
  if (!waiting.length) return []
  return [...waiting.map((id) => ({ store: 'askAnswers', id: answerIdOf(id) })), ...[...askTaskIds(day), deepTaskId(day)].map((id) => ({ store: 'bridge', id }))]
}

/** Whether any question of a thread reached Claude: Claude's answer came, or a run that reached Claude carried it. A question let go unanswered never did. */
export function reachedAny(turnIds: readonly number[], answers: readonly Pick<AskAnswer, 'turnId' | 'status'>[], runs: readonly AskRun[]): boolean {
  return turnIds.some((id) => answers.some((a) => a.turnId === id && a.status === 'answered') || runs.some((r) => r.turns.includes(id) && reachedClaude(r)))
}

/** "Ask again with today's evidence": the same question as a new turn in the same thread; a quick one answered at once, a typed one waiting. */
export async function askAgain(turnId: number, now: Date = new Date()): Promise<boolean> {
  const old = await db.askTurns.get(turnId)
  if (!old) return false
  if (old.kind === 'typed') return (await askTyped(old.question, old.threadId, now)) !== null
  const ev = await askEvidence(now)
  if (!ev) return false
  const laid = old.kind === 'about' ? aboutAnswer(old.keys ?? [], ev, old.question) : starterLaid(old.kind === 'deep' ? 'know' : old.kind, ev, await lastRead())
  await db.askTurns.add({ ...answeredTurn(old.question, old.kind, laid, ev, now, old.kind === 'about' ? old.keys ?? [] : undefined), threadId: old.threadId })
  return true
}

/** Cancels a question still waiting for Claude. */
export async function cancelTurn(turnId: number, now: Date = new Date()): Promise<void> {
  await db.transaction('rw', db.askTurns, async () => {
    const t = await db.askTurns.get(turnId)
    if (t && t.state === 'waiting') await db.askTurns.put({ ...t, state: 'cancelled', updatedAt: now.toISOString() })
  })
}

/** Deletes a thread and its turns, after the owner's confirmation on screen: tombstones in the cloud copy, as any deletion. */
export async function deleteThread(threadId: number): Promise<void> {
  await db.transaction('rw', db.askThreads, db.askTurns, async () => {
    await db.askTurns.where('threadId').equals(threadId).delete()
    await db.askThreads.delete(threadId)
  })
}

/** A thread with its turns, oldest first. */
export interface ThreadWhole {
  thread: AskThread
  turns: AskTurn[]
}

/** Every thread, newest first, each with its turns, oldest first. */
export async function allThreads(): Promise<ThreadWhole[]> {
  const [threads, turns] = await Promise.all([db.askThreads.toArray(), db.askTurns.toArray()])
  const by = new Map<number, AskTurn[]>()
  for (const t of turns) (by.get(t.threadId) ?? by.set(t.threadId, []).get(t.threadId) ?? []).push(t)
  return threads
    .map((thread) => ({ thread, turns: (by.get(thread.id as number) ?? []).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : (a.id as number) - (b.id as number))) }))
    .sort((a, b) => (a.thread.at < b.thread.at ? 1 : a.thread.at > b.thread.at ? -1 : (b.thread.id as number) - (a.thread.id as number)))
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/** The threads whose questions or answers hold every word searched for, on the phone. */
export function searchThreads(all: readonly ThreadWhole[], query: string): ThreadWhole[] {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return [...all]
  return all.filter(({ thread, turns }) => {
    const text = fold([thread.title, ...turns.flatMap((t) => [t.question, ...(t.quick?.sections ?? []).flatMap((s) => [s.title ?? '', ...s.lines])])].join(' '))
    return terms.every((w) => text.includes(w))
  })
}
