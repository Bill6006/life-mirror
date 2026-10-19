import { addDays } from '../blocks'
import { DISTINCTION_R } from '../audit'
import type { CheckIn } from '../db'
import { readings, type ReadingId } from '../readings'
import type { Settings, TogetherChoice } from '../settings'
import { movesTogether, type Pair } from '../stats'

// Requirement 3's monthly check (stage R7), in its words: "A monthly check flags two readings that move together almost
// always, and the owner decides whether to reword, merge or keep them." It reads the last thirty days of check-ins: for
// each pair of readings asked together often enough, the rank correlation of their answers, as the readings audit takes
// it. "Almost always" is the audit's own bar for a reading with no distinction of its own, so one rule decides both. It
// says how two readings moved, never why, and it changes nothing until the owner answers.

/** The days the check reads, ending today. */
export const TOGETHER_DAYS = 30

/** Shared answers a pair needs in those days: about three weeks of a pair asked only in the morning. */
export const TOGETHER_MIN = 20

/** The pair's key: its two ids in order, joined, so a pair has one key whichever way it is named. */
export function pairKey(a: ReadingId, b: ReadingId): string {
  return [a, b].sort().join('+')
}

export interface TogetherFlag extends Pair {
  key: string
}

/** Whether an answer was given in the calendar month of `today`: then the pair stays answered until the month turns. */
export function answeredThisMonth(answer: { day: string } | undefined, today: string): boolean {
  return answer !== undefined && answer.day.slice(0, 7) === today.slice(0, 7)
}

/** The pairs that moved together almost always over the last thirty days, strongest first. */
export function togetherPairs(checkins: readonly CheckIn[], today: string): TogetherFlag[] {
  const since = addDays(today, -(TOGETHER_DAYS - 1))
  const recent = checkins.filter((c) => c.day >= since && c.day <= today)
  return movesTogether(recent, TOGETHER_MIN)
    .filter((p) => Math.abs(p.rho) >= DISTINCTION_R)
    .map((p) => ({ ...p, key: pairKey(p.a, p.b) }))
}

/** The pairs to put to the owner this month: those not yet answered in it. */
export function togetherFlags(checkins: readonly CheckIn[], today: string, answers: Settings['togetherAnswers']): TogetherFlag[] {
  return togetherPairs(checkins, today).filter((p) => !answeredThisMonth(answers?.[p.key], today))
}

/** The owner's standing requests, to reword one of a pair or merge it, newest first: kept until a wording change answers them. */
export function togetherRequests(answers: Settings['togetherAnswers']): { key: string; a: ReadingId; b: ReadingId; choice: Exclude<TogetherChoice, 'keep'>; day: string }[] {
  return Object.entries(answers ?? {})
    .filter((e): e is [string, { choice: Exclude<TogetherChoice, 'keep'>; day: string }] => e[1].choice !== 'keep')
    .map(([key, v]) => {
      // Named in the readings' own order, as the check names the pair.
      const [a, b] = key.split('+').sort((x, y) => readings.findIndex((r) => r.id === x) - readings.findIndex((r) => r.id === y))
      return { key, a, b, choice: v.choice, day: v.day }
    })
    .sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : 0))
}
