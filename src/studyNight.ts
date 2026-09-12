import { isProposed, moves, type Move } from './catalogue'
import { copy } from './copy'
import type { StudyNight, StudyReason } from './db'
import { fill } from './format'
import { sittingOf, smallerRung, type Sitting } from './ladder'
import { anchorFor, headword, type Answers } from './readings'
import type { Weekday } from './settings'

// Rule 20 of the plan: the skip is never silent. Pure pieces of the study-night step: the
// versions on offer, the smaller one, the check of a reason against tonight's readings, the
// pattern in the reasons, and the plain count of nights kept.

export const STUDY_REASONS: readonly StudyReason[] = ['tired', 'tooMuch', 'noTime', 'didntWant']

/** Study versions that fit an evening and were not offered today. */
export function studyVersions(offeredToday: readonly string[]): Move[] {
  return moves.filter((m) => !isProposed(m) && m.family === 'study' && m.when.includes('evening') && !offeredToday.includes(m.id))
}

/** The smaller version: the study move with the most minutes still under the offered one, or null when there is none. */
export function smallerThan(move: Move): Move | null {
  let best: Move | null = null
  for (const m of moves) {
    if (isProposed(m) || m.family !== 'study' || m.id === move.id || m.minutes >= move.minutes) continue
    if (!best || m.minutes > best.minutes) best = m
  }
  return best
}

/** The smaller version of what the study step offered: a rung in fewer minutes, or the smaller catalogue version. */
export function smallerOf(s: Sitting): Sitting | null {
  if (s.kind === 'rung') return smallerRung(s)
  const m = moves.find((x) => x.id === s.id)
  const smaller = m ? smallerThan(m) : null
  return smaller ? sittingOf(smaller) : null
}

export interface ReasonCheck {
  /** Null when the reason has no reading to check against. */
  supported: boolean | null
  evidence: string | null
}

/** Tired is checked against tonight's energy, too much on against tonight's overwhelm; the other reasons are taken as they are. */
export function checkReason(reason: StudyReason, answers: Answers): ReasonCheck {
  if (reason === 'tired') {
    const p = answers.energy
    if (p === undefined) return { supported: null, evidence: null }
    return { supported: p <= 2, evidence: fill(copy.study.evidence, { reading: 'Energy', phrase: headword(anchorFor('energy', p)) }) }
  }
  if (reason === 'tooMuch') {
    const p = answers.overwhelm
    if (p === undefined) return { supported: null, evidence: null }
    return { supported: p >= 4, evidence: fill(copy.study.evidence, { reading: 'Overwhelm', phrase: headword(anchorFor('overwhelm', p)) }) }
  }
  return { supported: null, evidence: null }
}

function trailingRun(records: readonly StudyNight[], reason: StudyReason): number {
  let n = 0
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].reason !== reason) break
    n++
  }
  return n
}

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

function count(n: number): string {
  return WORDS[n] ?? String(n)
}

export function weekdayName(weekday: Weekday): string {
  return new Date(2026, 0, 4 + weekday, 12).toLocaleDateString(undefined, { weekday: 'long' })
}

/**
 * The pattern in the reasons, said only when it is there: the same reason three or more study
 * nights running on this weekday, or three or more study nights running in general. Tonight's
 * decision is included.
 */
export function reasonPattern(history: readonly StudyNight[], tonight: StudyNight): string | null {
  if (!tonight.reason) return null
  const all = [...history.filter((r) => r.day !== tonight.day), tonight].sort((a, b) => (a.day < b.day ? -1 : 1))
  const reason = copy.study.reasons[tonight.reason].toLowerCase()
  const sameWeekday = all.filter((r) => r.weekday === tonight.weekday)
  const runWeekday = trailingRun(sameWeekday, tonight.reason)
  if (runWeekday >= 3) return fill(copy.study.patternWeekday, { reason, n: count(runWeekday), weekday: `${weekdayName(tonight.weekday)}s` })
  const runAll = trailingRun(all, tonight.reason)
  if (runAll >= 3) return fill(copy.study.patternAll, { reason, n: count(runAll) })
  return null
}

/** Study nights kept, as a plain count: started, in full or in the smaller version, out of all decided. */
export function keptCount(records: readonly StudyNight[]): { kept: number; total: number } {
  const kept = records.filter((r) => r.decision === 'started' || r.decision === 'smaller').length
  return { kept, total: records.length }
}
