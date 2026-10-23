import { reachedClaude, retryAtOf } from '../coachShared'

// Ask Life Mirror's Claude answers (stage A2, designed 2026-10-19), what the phone and the Worker share: the day's runs
// and their allowance, the answer's shape, and where a question waiting for Claude stands. The Worker writes the runs and
// the answers as the brain's own rows; the phone reads them and never writes them. Nothing here is evidence.

/** Answers a day that reach Claude (the agreed design's point 16). Set from measured runs before the gate opens. */
export const ASK_ANSWERS_A_DAY = 3
/**
 * The deep tier counts as this many answers against the day's allowance, and runs at most once a day: its measured cost over a
 * standard answer's, rounded up (2026-10-21: about 85 s against 57 s).
 */
export const DEEP_COUNTS = 2
/** Runs a turn may take in a day that reach Claude without a checked answer before it says no checked answer came. */
export const ASK_TRIES = 2
/** Days a question waits for Claude before it is let go, said as one no run could answer. */
export const ASK_WAITS_DAYS = 3
/** Turns a thread holds before its box suggests a new thread (point 6). Set from the measured runs. */
export const THREAD_TURNS_MAX = 8
/** Words at most in an answer: a standard one, and the deep tier's. */
export const ASK_WORDS = { ask: 220, deep: 450 } as const

export type AskTask = 'ask' | 'deep'

/** The day's standard runs, in order, by the ids the Worker gives them on the bridge: one for each answer allowed. A fire the routine refused never reached Claude, and its slot is taken again. */
export const askTaskIds = (day: string): string[] => Array.from({ length: ASK_ANSWERS_A_DAY }, (_, i) => `task:${day}:ask${i ? `.${i + 1}` : ''}`)
/** The day's one deep run. */
export const deepTaskId = (day: string): string => `task:${day}:deep`
/**
 * Runs by hand on a stand-in question, the builder's measurements and checks (item 1 of 2026-10-21): ids of their own,
 * never one of the owner's, counting against nothing and never the day's deep.
 */
export const handTaskIds = (day: string): string[] => Array.from({ length: 9 }, (_, i) => `task:${day}:hand.${i + 1}`)
/** Claude's answer to a turn, by the turn. */
export const answerIdOf = (turnId: number): string => `turn:${turnId}`

/** A run of the day as the phone reads it from the bridge: what it was, where it stands, and the turn it carried. */
export interface AskRun {
  id: string
  task: AskTask
  day: string
  at: string
  status: 'firing' | 'fired' | 'written' | 'refused' | 'fallback'
  /** Set when the routine took the fire: the run reached Claude. */
  firedAt?: string
  retryAfter?: string | null
  /** The turns it carried: one. */
  turns: number[]
  /** A run by hand on a stand-in question, left in one of the owner's slots before 2026-10-21: it counts for nothing. */
  dry?: boolean
}

/** Claude's answer to one turn, checked by the Worker; or that no checked answer could be made. */
export interface AskAnswer {
  id: string
  turnId: number
  threadId: number
  day: string
  at: string
  status: 'answered' | 'failed'
  text?: string
  factIds?: string[]
  cardIds?: string[]
  /** The cited facts' words as the run read them, listed under the answer. */
  facts?: { id: string; text: string }[]
  /** The model that wrote it, and the one asked for. */
  model?: string
  askedModel?: string
  /** Why no checked answer came: the checks' last reason, or that no run could answer it. */
  reason?: string
  /**
   * Item 4: the kind of failure, when no checked answer came: the checks held back each draft, runs reached Claude without
   * one, or no run could answer it in time; and the checks' reasons, a draft's at a time, never the drafts. Absent before.
   */
  kind?: 'checks' | 'runs' | 'waited'
  reasons?: string[]
  /** Stage A3: the one test the answer names (move|reading|window), short of established, for "Test it". */
  test?: string
  /** Stage A3: the question states something of the owner's life; "Add this as a note" is offered. */
  noteOffer?: boolean
}

/** A run of the owner's that reached Claude: a run by hand never counts (item 1 of 2026-10-21). */
const counts = (r: Pick<AskRun, 'firedAt'> & { dry?: boolean }): boolean => r.dry !== true && reachedClaude(r)

/** How much of the day's allowance its runs have used: each run of the owner's that reached Claude counts one, the deep tier DEEP_COUNTS. */
export function allowanceUsed(runs: readonly (Pick<AskRun, 'task' | 'firedAt'> & { dry?: boolean })[]): number {
  return runs.filter(counts).reduce((n, r) => n + (r.task === 'deep' ? DEEP_COUNTS : 1), 0)
}

/** Whether a turn of this tier may still run today, by the allowance alone: the deep tier also once a day. */
export function roomFor(task: AskTask, runs: readonly (Pick<AskRun, 'task' | 'firedAt'> & { dry?: boolean })[], allowance: number = ASK_ANSWERS_A_DAY): boolean {
  const used = allowanceUsed(runs)
  if (task === 'deep') return used + DEEP_COUNTS <= allowance && !runs.some((r) => r.task === 'deep' && counts(r))
  return used + 1 <= allowance
}

/** The day's queue as the Worker runs it and the phone says it, one function for both (item 1 of 2026-10-21). */
export interface AskQueue {
  /** The waiting questions today's units will answer, in the order they start. */
  taken: number[]
  /** The waiting questions that wait for tomorrow: their units are not left today. */
  tomorrow: number[]
  /** Units left once the day's runs and the questions taken are counted. */
  left: number
  /** Whether a "Coach me on everything" asked now would fit today. */
  deep: boolean
}

/**
 * The waiting questions, oldest first: each that fits the units left (the deep tier DEEP_COUNTS, once a day) is taken in
 * turn; one that does not waits for tomorrow, and the next is looked at, so a deep question that no longer fits never
 * holds a standard one behind it. A question a run is at already holds its units, counted the moment it is fired. A
 * question past the days a question waits, or out of tries, is let go and takes nothing.
 */
export function askQueue(turns: readonly { id: number; tier: string; day?: string }[], runs: readonly AskRun[], today?: string, allowance: number = ASK_ANSWERS_A_DAY): AskQueue {
  const owner = runs.filter((r) => r.dry !== true)
  const underWay = owner.filter((r) => r.status === 'firing' || r.status === 'fired')
  let used = allowanceUsed(owner) + underWay.filter((r) => !reachedClaude(r)).reduce((n, r) => n + (r.task === 'deep' ? DEEP_COUNTS : 1), 0)
  let deepDone = owner.some((r) => r.task === 'deep' && (reachedClaude(r) || r.status === 'firing'))
  const busy = new Set(underWay.flatMap((r) => r.turns))
  const oldest = today ? addDaysTo(today, -(ASK_WAITS_DAYS - 1)) : null
  const taken: number[] = []
  const tomorrow: number[] = []
  for (const t of turns) {
    if (busy.has(t.id) || triesOf(t.id, owner) >= ASK_TRIES || (oldest !== null && t.day !== undefined && t.day < oldest)) continue
    const deep = t.tier === 'deep'
    const cost = deep ? DEEP_COUNTS : 1
    if (used + cost <= allowance && !(deep && deepDone)) {
      taken.push(t.id)
      used += cost
      if (deep) deepDone = true
    } else tomorrow.push(t.id)
  }
  return { taken, tomorrow, left: Math.max(0, allowance - used), deep: used + DEEP_COUNTS <= allowance && !deepDone }
}

/** A day moved by whole days (the shared calendar's own rule, kept here so the phone and the Worker read the same). */
function addDaysTo(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** The runs of the day that carried a turn and reached Claude with no checked answer: its tries. */
export function triesOf(turnId: number, runs: readonly AskRun[]): number {
  return runs.filter((r) => r.turns.includes(turnId) && reachedClaude(r) && r.status !== 'written').length
}

/**
 * Where a question waiting for Claude stands (point 17), in the order the phone says it:
 * - `cloud`: the phone keeps no cloud copy, so Claude cannot be reached; the quick tier still answers;
 * - `unsent`: the question has not reached the cloud copy yet (offline, or the last sync not through);
 * - `soon`: a run is at it, or the day's queue takes it: it starts within about a minute, or once the Brain's own run under
 *   way ends (item 1 of 2026-10-21: never held for the day's line);
 * - `refused`: the routine refused the last fire, and it is tried again at a time;
 * - `tomorrow`: the day's units will not reach it: the queue's own rule, the Worker's;
 * - `failed`: its runs reached Claude and brought no checked answer.
 */
export type AskWait = { kind: 'cloud' } | { kind: 'unsent' } | { kind: 'soon' } | { kind: 'refused'; retryAt: string } | { kind: 'tomorrow' } | { kind: 'failed' }

export function askWaitOf(turn: { id?: number; tier: string }, runs: readonly AskRun[], o: { cloud: boolean; queued: boolean; reachable: boolean }, queue?: AskQueue): AskWait {
  if (!o.cloud) return { kind: 'cloud' }
  if (o.queued && !o.reachable) return { kind: 'unsent' }
  const id = turn.id
  const task: AskTask = turn.tier === 'deep' ? 'deep' : 'ask'
  const mine = typeof id === 'number' ? runs.filter((r) => r.turns.includes(id)).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)) : []
  const last = mine[0]
  if (last && (last.status === 'firing' || last.status === 'fired')) return { kind: 'soon' }
  if (last && !reachedClaude(last) && last.status === 'fallback') return { kind: 'refused', retryAt: new Date(retryAtOf(last)).toISOString() }
  if (typeof id === 'number' && triesOf(id, runs) >= ASK_TRIES) return { kind: 'failed' }
  if (queue ? typeof id === 'number' && queue.tomorrow.includes(id) : !roomFor(task, runs)) return { kind: 'tomorrow' }
  // Another turn's fire was refused: the next try waits for its time, and this turn after it.
  const refused = runs.find((r) => !reachedClaude(r) && r.status === 'fallback')
  return refused ? { kind: 'refused', retryAt: new Date(retryAtOf(refused)).toISOString() } : { kind: 'soon' }
}
