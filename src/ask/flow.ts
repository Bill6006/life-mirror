import { blockAt } from '../blocks'
import { copy } from '../copy'
import { db } from '../db'
import { fill } from '../format'
import { guardRepair } from '../repair/breaker'
import { repairEvidence, type RepairEvidence } from '../repair/evidence'
import { repairOn } from '../repair/gate'
import { evidenceVersion } from './evidence'
import { aboutAnswer, changedAnswer, keysOfLine, knowAnswer, nextAnswer, type Laid, type LastRead } from './quick'
import type { AboutSource, AskStarter, AskThread, AskTurn } from './types'

// Ask Life Mirror on the phone (stage A1, 2026-10-19): threads begun from a starter, from "Ask about this", or from a typed
// question; the quick tier answering at once; a typed question kept waiting for Claude (stage A2); asking again, cancelling
// and deleting. Every thread and turn is the phone's own record, synced and in the export; nothing here is evidence.

/** The longest question kept: a question, not an essay. */
export const QUESTION_MAX = 500

/** The repair's read for today, through its breaker: null when the repair is off, or when it could not read the record. */
export async function askEvidence(now: Date = new Date()): Promise<RepairEvidence | null> {
  if (!repairOn()) return null
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
  const turn = answeredTurn(question, 'about', aboutAnswer(keys, ev, question), ev, now, [...keys])
  return startThread({ day: turn.day, at: turn.at, title: question, from: { kind: 'about', source, keys: [...keys] } }, turn)
}

/** A typed question: in a new thread, or in an open one as a follow-up; kept waiting for Claude. Null for an empty question. */
export async function askTyped(raw: string, threadId: number | null, now: Date = new Date()): Promise<number | null> {
  const question = raw.trim().slice(0, QUESTION_MAX)
  if (!question) return null
  const ev = await askEvidence(now)
  const at = now.toISOString()
  const turn: Omit<AskTurn, 'id' | 'threadId'> = { day: blockAt(now).day, at, question, tier: 'standard', state: 'waiting', kind: 'typed', version: ev ? evidenceVersion(ev) : '', cited: [], updatedAt: at }
  if (threadId === null) return startThread({ day: turn.day, at, title: question, from: { kind: 'typed' } }, turn)
  await db.askTurns.add({ ...turn, threadId })
  return threadId
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
