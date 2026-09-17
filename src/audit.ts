import { addDays, BLOCKS } from './blocks'
import type { AnchorSwap, CheckIn, DayContext } from './db'
import { indexCheckIns, slotKey } from './learning'
import { type Position, type Reading, type ReadingId, readings } from './readings'
import { CONTEXT_IDS, readingOf } from './score'
import { pearson, spearman } from './stats'

// The audits, pure. The anchor swap guard: a pre-written alternate swaps in only after a long
// stretch in which a phrase was never tapped, once per reading, never the middle, always logged
// and dated. Chips you never tap stop appearing, and one tap brings one back. Retirement
// proposals for context readings that meet Rule 3 on later data, both conditions with their
// numbers, decided by you, never automatic.

export const SWAP_STRETCH_DAYS = 45
export const SWAP_MIN_ANSWERS = 30
export const CHIP_STRETCH = 30
export const PROPOSAL_MIN = 40
export const DISTINCTION_R = 0.9
export const SAME_SHARE = 0.9
export const PREDICTION_R = 0.1
export const DECISION_DAYS = 60

export interface SwapDue {
  reading: ReadingId
  position: Position
  from: string
  to: string
  at: string
  answers: number
  stretchDays: number
}

/** The one swap a reading may get: the lowest never-tapped phrase, never the middle, after the stretch, when no swap exists for that reading yet. */
export function anchorSwapDue(reading: Reading, checkins: readonly CheckIn[], existing: readonly AnchorSwap[], today: string): SwapDue | null {
  if (reading.unit !== 'step' || !reading.alternates) return null
  if (existing.some((s) => s.reading === reading.id)) return null
  const start = addDays(today, -SWAP_STRETCH_DAYS)
  const answers = checkins.filter((c) => c.day >= start && c.day < today && c.answers[reading.id] !== undefined).map((c) => c.answers[reading.id] as Position)
  if (answers.length < SWAP_MIN_ANSWERS) return null
  for (const position of [1, 2, 4, 5] as Position[]) {
    const to = reading.alternates[position - 1]
    if (!to) continue
    if (answers.some((p) => p === position)) continue
    return { reading: reading.id, position, from: reading.anchors[position - 1], to, at: today, answers: answers.length, stretchDays: SWAP_STRETCH_DAYS }
  }
  return null
}

export type ChipId = 'nothingLanded' | 'hardToSeePoint' | 'coolingOff' | 'bigSocial' | 'napped' | 'shower' | 'teeth' | 'food' | 'away' | 'heavyCaffeine'
export const CHIP_IDS: readonly ChipId[] = ['nothingLanded', 'hardToSeePoint', 'coolingOff', 'bigSocial', 'napped', 'shower', 'teeth', 'food', 'away', 'heavyCaffeine']

export interface ChipState {
  id: ChipId
  /** Evenings logged since the chip was last brought back, or ever. */
  evenings: number
  lastTap: string | null
  retired: boolean
  broughtBack: string | null
}

function tapped(id: ChipId, c: CheckIn, ctx: DayContext | undefined): boolean {
  switch (id) {
    case 'nothingLanded':
    case 'hardToSeePoint':
    case 'coolingOff':
    case 'bigSocial':
    case 'napped':
      return Boolean(c.extras?.[id])
    case 'shower':
    case 'teeth':
    case 'food':
      return Boolean(c.extras?.necessities?.[id])
    case 'away':
      return Boolean(ctx && ctx.changed && !ctx.withHer)
    case 'heavyCaffeine':
      return Boolean(c.extras?.heavyCaffeine)
  }
}

/** Every optional chip's state: a chip untapped across thirty logged evenings has stopped appearing until brought back. */
export function chipStates(checkins: readonly CheckIn[], contexts: readonly DayContext[], chipsBack: Readonly<Record<string, string>>, today: string): ChipState[] {
  const ctx = new Map(contexts.map((c) => [c.day, c]))
  const logged = (block: 'morning' | 'evening') => checkins.filter((c) => c.block === block && c.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1))
  const evenings = logged('evening')
  const mornings = logged('morning')
  return CHIP_IDS.map((id) => {
    const broughtBack = chipsBack[id] ?? null
    // The morning's chip counts mornings; every other chip counts evenings.
    const since = (id === 'heavyCaffeine' ? mornings : evenings).filter((c) => !broughtBack || c.day >= broughtBack)
    const taps = since.filter((c) => tapped(id, c, ctx.get(c.day)))
    const lastTap = taps.length ? taps[taps.length - 1].day : null
    const untapped = lastTap ? since.filter((c) => c.day > lastTap).length : since.length
    return { id, evenings: since.length, lastTap, retired: untapped >= CHIP_STRETCH, broughtBack }
  })
}

export function chipRetired(id: ChipId, states: readonly ChipState[]): boolean {
  return states.find((s) => s.id === id)?.retired ?? false
}

export interface Proposal {
  reading: ReadingId
  distinction: { kind: 'twin' | 'flat'; with: ReadingId | null; r: number | null; sameShare: number | null; n: number }
  prediction: { r: number; n: number }
}

/**
 * Rule 3 on later data, for context readings only (an ingredient is never proposed): no real
 * distinction (it moves with another reading, or sits on one phrase) and no predictive value
 * (it foretells the next block's reading no better than nothing), both with their numbers.
 * Never automatic: a proposal is shown and you decide; "keep it for now" rests it for sixty days.
 */
export function readingProposals(checkins: readonly CheckIn[], retired: readonly string[], decisions: Readonly<Record<string, string>>, today: string): Proposal[] {
  const byKey = indexCheckIns(checkins)
  const out: Proposal[] = []
  for (const id of CONTEXT_IDS) {
    if (retired.includes(id)) continue
    const decided = decisions[id]
    if (decided && addDays(decided, DECISION_DAYS) > today) continue
    const answered = checkins.filter((c) => c.answers[id] !== undefined)
    if (answered.length < PROPOSAL_MIN) continue
    // Prediction: the position against the next block's reading out of 100.
    const xs: number[] = []
    const ys: number[] = []
    for (const c of answered) {
      const i = BLOCKS.indexOf(c.block)
      const next = i < 2 ? byKey.get(slotKey(c.day, BLOCKS[i + 1])) : byKey.get(slotKey(addDays(c.day, 1), 'morning'))
      const value = next ? readingOf(next)?.value : undefined
      if (value === undefined) continue
      xs.push(c.answers[id] as number)
      ys.push(value)
    }
    if (xs.length < PROPOSAL_MIN) continue
    // A reading that never moves has no correlation to compute: that is no predictive value at all.
    const rPred = pearson(xs, ys) ?? 0
    if (Math.abs(rPred) >= PREDICTION_R) continue
    // Distinction: a twin among the other readings, or a flat line.
    let distinction: Proposal['distinction'] | null = null
    const counts = new Map<number, number>()
    for (const c of answered) counts.set(c.answers[id] as number, (counts.get(c.answers[id] as number) ?? 0) + 1)
    const most = Math.max(...counts.values())
    if (most / answered.length >= SAME_SHARE) distinction = { kind: 'flat', with: null, r: null, sameShare: most / answered.length, n: answered.length }
    if (!distinction) {
      for (const other of readings) {
        if (other.id === id) continue
        const shared = answered.filter((c) => c.answers[other.id] !== undefined)
        if (shared.length < PROPOSAL_MIN) continue
        const r = spearman(
          shared.map((c) => c.answers[id] as number),
          shared.map((c) => c.answers[other.id] as number),
        )
        if (r !== null && Math.abs(r) >= DISTINCTION_R) {
          distinction = { kind: 'twin', with: other.id, r: Math.round(r * 100) / 100, sameShare: null, n: shared.length }
          break
        }
      }
    }
    if (!distinction) continue
    out.push({ reading: id, distinction, prediction: { r: Math.round(rPred * 100) / 100, n: xs.length } })
  }
  return out
}
