import { reachedClaude, retryAtOf } from '../coachShared'

// Ask Life Mirror's Claude answers (stage A2, designed 2026-10-19), what the phone and the Worker share: the day's runs
// and their allowance, the answer's shape, and where a question waiting for Claude stands. The Worker writes the runs and
// the answers as the brain's own rows; the phone reads them and never writes them. Nothing here is evidence.

/** Answers a day that reach Claude (the agreed design's point 16). Set from measured runs before the gate opens. */
export const ASK_ANSWERS_A_DAY = 3
/** The deep tier counts as this many answers against the day's allowance, and runs at most once a day. */
export const DEEP_COUNTS = 3
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
}

/** How much of the day's allowance its runs have used: each run that reached Claude counts one, the deep tier DEEP_COUNTS. */
export function allowanceUsed(runs: readonly Pick<AskRun, 'task' | 'firedAt'>[]): number {
  return runs.filter(reachedClaude).reduce((n, r) => n + (r.task === 'deep' ? DEEP_COUNTS : 1), 0)
}

/** Whether a turn of this tier may still run today, by the allowance alone: the deep tier also once a day. */
export function roomFor(task: AskTask, runs: readonly Pick<AskRun, 'task' | 'firedAt'>[], allowance: number = ASK_ANSWERS_A_DAY): boolean {
  const used = allowanceUsed(runs)
  if (task === 'deep') return used + DEEP_COUNTS <= allowance && !runs.some((r) => r.task === 'deep' && reachedClaude(r))
  return used + 1 <= allowance
}

/** The runs of the day that carried a turn and reached Claude with no checked answer: its tries. */
export function triesOf(turnId: number, runs: readonly AskRun[]): number {
  return runs.filter((r) => r.turns.includes(turnId) && reachedClaude(r) && r.status !== 'written').length
}

/**
 * Where a question waiting for Claude stands (point 17), in the order the phone says it:
 * - `cloud`: the phone keeps no cloud copy, so Claude cannot be reached; the quick tier still answers;
 * - `unsent`: the question has not reached the cloud copy yet (offline, or the last sync not through);
 * - `soon`: a run is at it, or it is next;
 * - `line`: it waits for the day's line, which comes first (D7's rule);
 * - `refused`: the routine refused the last fire, and it is tried again at a time;
 * - `tomorrow`: the day's answers are used;
 * - `failed`: its runs reached Claude and brought no checked answer.
 */
export type AskWait = { kind: 'cloud' } | { kind: 'unsent' } | { kind: 'soon' } | { kind: 'line' } | { kind: 'refused'; retryAt: string } | { kind: 'tomorrow' } | { kind: 'failed' }

export function askWaitOf(turn: { id?: number; tier: string }, runs: readonly AskRun[], o: { cloud: boolean; queued: boolean; reachable: boolean; lineIn: boolean }): AskWait {
  if (!o.cloud) return { kind: 'cloud' }
  if (o.queued && !o.reachable) return { kind: 'unsent' }
  const id = turn.id
  const task: AskTask = turn.tier === 'deep' ? 'deep' : 'ask'
  const mine = typeof id === 'number' ? runs.filter((r) => r.turns.includes(id)).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)) : []
  const last = mine[0]
  if (last && (last.status === 'firing' || last.status === 'fired')) return { kind: 'soon' }
  if (last && !reachedClaude(last) && last.status === 'fallback') return { kind: 'refused', retryAt: new Date(retryAtOf(last)).toISOString() }
  if (typeof id === 'number' && triesOf(id, runs) >= ASK_TRIES) return { kind: 'failed' }
  if (!roomFor(task, runs)) return { kind: 'tomorrow' }
  if (!o.lineIn) return { kind: 'line' }
  // Another turn's fire was refused: the next try waits for its time, and this turn after it.
  const refused = runs.find((r) => !reachedClaude(r) && r.status === 'fallback')
  return refused ? { kind: 'refused', retryAt: new Date(retryAtOf(refused)).toISOString() } : { kind: 'soon' }
}
