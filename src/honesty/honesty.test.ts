import { describe, expect, it } from 'vitest'
import { addDays, type Block } from '../blocks'
import type { AnchorSwap, CheckIn, DayContext, ForecastScore, Offer, Outcome } from '../db'
import { blockReadings } from '../readings'
import { INGREDIENTS } from '../score'
import { checksAsShown, type HonestyChecks } from './checks'
import { holmAdjusted } from './exact'
import { isCluster, readMisses } from './misses'
import { readMissing, relationShows } from './missing'
import { answeredThisMonth, pairKey, togetherFlags, togetherPairs, togetherRequests } from './together'

// The honesty checks (stage R7) on stand-in records: invented days only, never the owner's.

const TODAY = '2026-10-20'

/**
 * A check-in with every reading the block asks, and any answers given over it. A level of 1 or 5 sets each ingredient at
 * its worst or best by its own direction (Stress and the other readings where lower is better the other way round), so
 * the reading out of 100 reads low or high; 3 is the middle. Readings left out leave it incomplete.
 */
function checkin(day: string, block: Block, level: number, over: Record<string, number> = {}, leaveOut: string[] = []): CheckIn {
  const asked = [...blockReadings(block)]
  const at = (id: string) => (INGREDIENTS[id] === 'down' ? 6 - level : level)
  const answers: Record<string, number> = Object.fromEntries(asked.filter((id) => !leaveOut.includes(id)).map((id) => [id, at(id)]))
  Object.assign(answers, over)
  return { day, block, asked, startedAt: `${day}T12:00:00.000Z`, completedAt: leaveOut.length ? null : `${day}T12:01:00.000Z`, updatedAt: `${day}T12:01:00.000Z`, answers: answers as CheckIn['answers'], activeMs: 60_000 }
}

const day = (back: number) => addDays(TODAY, -back)

function context(d: string, over: Partial<DayContext> = {}): DayContext {
  return { day: d, weekday: 1, withHer: false, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '17:00', changed: false, createdAt: 'x', ...over } as DayContext
}

describe('requirement 3: two readings that move together almost always, once a month', () => {
  // Mood and Energy given the same position at every evening check-in, Stress the opposite, Hunger on its own course.
  const evenings = (n: number, start = 0) =>
    Array.from({ length: n }, (_, i) => {
      const level = 1 + ((i * 7 + 3) % 5)
      return checkin(day(start + i), 'evening', 3, { mood: level, energy: level, stress: 6 - level, hunger: 1 + ((i * 3) % 5) })
    })

  it('flags a pair at 0.9 or more either way over twenty shared answers in the last thirty days, never a looser one', () => {
    const pairs = togetherPairs(evenings(25), TODAY)
    const keys = pairs.map((p) => p.key)
    expect(keys).toContain(pairKey('mood', 'energy'))
    expect(keys).toContain(pairKey('mood', 'stress'))
    expect(keys).not.toContain(pairKey('mood', 'hunger'))
    for (const p of pairs) expect(Math.abs(p.rho)).toBeGreaterThanOrEqual(0.9)
    // Nineteen shared answers are not enough; answers older than thirty days are not read.
    expect(togetherPairs(evenings(19), TODAY)).toEqual([])
    expect(togetherPairs(evenings(25, 30), TODAY)).toEqual([])
  })

  it('puts a pair to the owner once a calendar month: answered this month it rests, and the next month it is checked again', () => {
    const all = evenings(25)
    const key = pairKey('mood', 'energy')
    expect(togetherFlags(all, TODAY, {}).map((p) => p.key)).toContain(key)
    expect(togetherFlags(all, TODAY, { [key]: { choice: 'keep', day: '2026-10-02' } }).map((p) => p.key)).not.toContain(key)
    expect(togetherFlags(all, TODAY, { [key]: { choice: 'keep', day: '2026-09-28' } }).map((p) => p.key)).toContain(key)
    expect(answeredThisMonth({ day: '2026-10-31' }, '2026-11-01')).toBe(false)
  })

  it('keeps a request to reword or merge listed, newest first, and a later keep takes its place', () => {
    const answers = { [pairKey('mood', 'energy')]: { choice: 'reword' as const, day: '2026-10-03' }, [pairKey('focus', 'overwhelm')]: { choice: 'merge' as const, day: '2026-10-09' }, [pairKey('irritation', 'stress')]: { choice: 'keep' as const, day: '2026-10-10' } }
    expect(togetherRequests(answers).map((r) => [r.key, r.choice])).toEqual([
      [pairKey('focus', 'overwhelm'), 'merge'],
      [pairKey('mood', 'energy'), 'reword'],
    ])
    expect(togetherRequests({ ...answers, [pairKey('mood', 'energy')]: { choice: 'keep', day: '2026-11-02' } }).map((r) => r.key)).toEqual([pairKey('focus', 'overwhelm')])
  })
})

/** A scored slot made that day: a miss when `hit` is false. */
function score(d: string, block: Block, hit: boolean): ForecastScore {
  return { day: d, block, horizon: 0, model: 'sameBlock', point: 60, lo: 50, hi: 70, actual: hit ? 60 : 30, error: hit ? 0 : -30, hit, scoredOn: d }
}

describe('requirement 12: misses read for where they cluster', () => {
  // Fifty evenings: seven unwell, six of them missed; nine misses on the other forty-three.
  const days = Array.from({ length: 50 }, (_, i) => day(i + 1))
  const unwell = new Set(days.slice(0, 7))
  const missOn = new Set([...days.slice(0, 6), ...days.slice(10, 19)])
  const base = { checkins: [], offers: [], outcomes: [], swaps: [] as AnchorSwap[] }

  it('finds a context where misses cluster: many, at least twice as common, and clear after Holm’s correction', () => {
    const r = readMisses({ ...base, scores: days.map((d) => score(d, 'evening', !missOn.has(d))), contexts: days.map((d) => context(d, { unwell: unwell.has(d) })) }, TODAY)
    expect(r.slots).toBe(50)
    expect(r.misses).toBe(15)
    expect(r.clusters.map((c) => c.cause)).toEqual([{ kind: 'context', context: 'unwell' }])
    expect(r.clusters[0]).toMatchObject({ missesIn: 6, slotsIn: 7, missesOut: 9, slotsOut: 43 })
    expect(r.clusters[0].adjusted).toBeLessThan(0.05)
    // Every candidate with slots on both sides was counted in the correction.
    expect(r.candidates.length).toBeGreaterThanOrEqual(2)
  })

  it('leaves ordinary misses unsaid: spread evenly, or too few where they gather', () => {
    const even = readMisses({ ...base, scores: days.map((d, i) => score(d, 'evening', i % 3 !== 0)), contexts: days.map((d) => context(d, { unwell: unwell.has(d) })) }, TODAY)
    expect(even.clusters).toEqual([])
    // Two misses on two unwell days: twice as common and more, yet under the three a cluster needs.
    const two = new Set(days.slice(0, 2))
    const few = readMisses({ ...base, scores: days.map((d) => score(d, 'evening', !two.has(d))), contexts: days.map((d) => context(d, { unwell: two.has(d) })) }, TODAY)
    expect(few.clusters).toEqual([])
  })

  it('reads one move as the move done at the slot before, and a wording change from the day it was made', () => {
    // The walk done each morning of the first eight days, its afternoons all missed; the rest mostly kept.
    const walkDays = days.slice(0, 8)
    const offers: Offer[] = []
    const outcomes: Outcome[] = []
    walkDays.forEach((d, i) => {
      offers.push({ id: i + 1, kind: 'block', day: d, block: 'morning', at: `${d}T08:00:00.000Z`, situationKey: 'x', target: 'mood', stance: '', band: 'low', reading: 2, moveId: 'walk-ten', cardId: null, candidates: ['walk-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: null } as Offer)
      outcomes.push({ offerId: i + 1, moveId: 'walk-ten', day: d, block: 'morning', at: 'x', outcome: 'done', why: null, passiveOutcome: null })
    })
    // The nap offered on the next eight mornings and answered no each time: no move done, whatever followed.
    const napDays = days.slice(8, 16)
    napDays.forEach((d, i) => {
      offers.push({ id: 100 + i, kind: 'block', day: d, block: 'morning', at: `${d}T08:00:00.000Z`, situationKey: 'x', target: 'mood', stance: '', band: 'low', reading: 2, moveId: 'nap-ten', cardId: null, candidates: ['nap-ten', 'nothing'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'nap-ten': 0.5, nothing: 0.5 }, skippedAt: null, closedAt: null } as Offer)
      outcomes.push({ offerId: 100 + i, moveId: 'nap-ten', day: d, block: 'morning', at: 'x', outcome: 'no', why: null, passiveOutcome: null })
    })
    const scores = days.map((d) => score(d, 'afternoon', !(walkDays.includes(d) || napDays.includes(d) || d === days[30])))
    const moved = readMisses({ ...base, offers, outcomes, scores, contexts: days.map((d) => context(d)) }, TODAY)
    expect(moved.clusters.map((c) => c.cause)).toContainEqual({ kind: 'move', moveId: 'walk-ten' })
    expect(moved.candidates.map((c) => c.cause)).not.toContainEqual({ kind: 'move', moveId: 'nap-ten' })
    // A swap of Mood's wording twelve days ago, every slot since missed.
    const since = day(12)
    const swaps: AnchorSwap[] = [{ reading: 'mood', position: 2, from: 'a', to: 'b', at: since, answers: 30, stretchDays: 14 }]
    const worded = readMisses({ ...base, swaps, scores: days.map((d) => score(d, 'evening', d < since)), contexts: days.map((d) => context(d)) }, TODAY)
    expect(worded.clusters.map((c) => c.cause)).toContainEqual({ kind: 'wording', reading: 'mood', since })
    // Loneliness is no ingredient of the reading out of 100: a change of its words is no cause of a miss there.
    const lonely = readMisses({ ...base, swaps: [{ ...swaps[0], reading: 'loneliness' }], scores: days.map((d) => score(d, 'evening', d < since)), contexts: days.map((d) => context(d)) }, TODAY)
    expect(lonely.candidates.map((c) => c.cause.kind)).not.toContain('wording')
  })

  it('holds a cluster to its three rules, at their edges: three misses, twice the rate elsewhere, and five in a hundred after Holm', () => {
    expect(isCluster({ missesIn: 3, slotsIn: 3, missesOut: 0, slotsOut: 47 }, 0.01)).toBe(true)
    expect(isCluster({ missesIn: 2, slotsIn: 2, missesOut: 0, slotsOut: 48 }, 0.01)).toBe(false)
    // 36 of 51 against 44 of 117: 1.88 times the rate elsewhere, however sure, is no cluster; 2.3 times is.
    expect(isCluster({ missesIn: 36, slotsIn: 51, missesOut: 44, slotsOut: 117 }, 0.0001)).toBe(false)
    expect(isCluster({ missesIn: 40, slotsIn: 51, missesOut: 40, slotsOut: 117 }, 0.0001)).toBe(true)
    expect(isCluster({ missesIn: 6, slotsIn: 7, missesOut: 9, slotsOut: 43 }, 0.05)).toBe(false)
    expect(isCluster({ missesIn: 6, slotsIn: 7, missesOut: 9, slotsOut: 43 }, 0.0499)).toBe(true)
  })

  it('corrects every candidate by Holm across all of them, so one that clears five in a hundred alone need not', () => {
    // Four misses on six unwell days against ten on the other forty-four: one-sided p 0.044, under five in a hundred alone.
    const unwellDays = new Set(days.slice(0, 6))
    const missed = new Set([...days.slice(0, 4), ...days.slice(10, 20)])
    const r = readMisses({ ...base, scores: days.map((d) => score(d, 'evening', !missed.has(d))), contexts: days.map((d) => context(d, { unwell: unwellDays.has(d) })) }, TODAY)
    const unwellOne = r.candidates.find((c) => c.cause.kind === 'context' && c.cause.context === 'unwell')
    expect(unwellOne).toMatchObject({ missesIn: 4, slotsIn: 6, missesOut: 10, slotsOut: 44 })
    expect(unwellOne!.p).toBeCloseTo(0.04440993788819876, 12)
    expect(r.candidates.map((c) => c.adjusted)).toEqual(holmAdjusted(r.candidates.map((c) => c.p)))
    expect(unwellOne!.adjusted).toBeGreaterThan(0.05)
    expect(r.clusters).toEqual([])
  })

  it('reads only the last fifty-six days of slots forecast that day', () => {
    const old = readMisses({ ...base, scores: [score(day(60), 'evening', false), { ...score(day(3), 'evening', false), horizon: 1 }], contexts: [] }, TODAY)
    expect(old.slots).toBe(0)
  })
})

describe('requirement 13: whether missing relates to state', () => {
  // Forty days asked morning and evening. Mornings always logged; on the low mornings the evening is mostly missed.
  const days = Array.from({ length: 40 }, (_, i) => day(i + 1))
  const low = (i: number) => i % 2 === 0

  it('shows a relation when the evening is missed after low readings far more often, and says which way', () => {
    const checkins: CheckIn[] = []
    days.forEach((d, i) => {
      checkins.push(checkin(d, 'morning', low(i) ? 1 : 5))
      const missed = low(i) ? i % 10 !== 0 : false
      if (!missed) checkins.push(checkin(d, 'evening', 3))
    })
    const r = readMissing({ checkins, contexts: days.map((d) => context(d)), frequency: 'two' }, TODAY)
    expect(r.slots).toBe(80)
    expect(r.missed).toBe(16)
    const before = r.relations.find((c) => c.kind === 'missed' && c.split.by === 'before')
    expect(before).toBeDefined()
    expect(before!.missingIn / before!.slotsIn).toBeGreaterThan(before!.missingOut / before!.slotsOut)
  })

  it('shows none while missing is spread evenly, so missing stays missing', () => {
    // Ten mornings and ten evenings missed, the evenings as often after a low morning as after a high one.
    const checkins: CheckIn[] = []
    days.forEach((d, i) => {
      if (i % 8 !== 5 && i % 8 !== 6) checkins.push(checkin(d, 'morning', low(i) ? 1 : 5))
      if (i % 8 !== 1 && i % 8 !== 2) checkins.push(checkin(d, 'evening', 3))
    })
    const r = readMissing({ checkins, contexts: days.map((d) => context(d)), frequency: 'two' }, TODAY)
    expect(r.missed).toBe(20)
    expect(r.comparisons.length).toBeGreaterThan(2)
    expect(r.relations).toEqual([])
  })

  it('reads a check-in left with a reading unanswered as its own kind of missing', () => {
    const checkins: CheckIn[] = []
    days.forEach((d, i) => {
      checkins.push(checkin(d, 'morning', low(i) ? 1 : 5))
      checkins.push(checkin(d, 'evening', 3, {}, low(i) && i % 10 !== 0 ? ['stress'] : []))
    })
    const r = readMissing({ checkins, contexts: days.map((d) => context(d)), frequency: 'two' }, TODAY)
    expect(r.missed).toBe(0)
    expect(r.started).toBe(80)
    expect(r.unanswered).toBe(16)
    expect(r.relations.some((c) => c.kind === 'unanswered' && c.split.by === 'before')).toBe(true)
  })

  it('holds a relation to its two rules, at their edges: clear after Holm, and rates fifteen points apart', () => {
    expect(relationShows({ missingIn: 4, slotsIn: 25, missingOut: 0, slotsOut: 143 }, 0.001)).toBe(true)
    // Twelve points apart, however sure, is no relation.
    expect(relationShows({ missingIn: 3, slotsIn: 25, missingOut: 0, slotsOut: 143 }, 0.001)).toBe(false)
    expect(relationShows({ missingIn: 4, slotsIn: 25, missingOut: 0, slotsOut: 143 }, 0.05)).toBe(false)
    expect(relationShows({ missingIn: 0, slotsIn: 143, missingOut: 4, slotsOut: 25 }, 0.001)).toBe(true)
  })

  it('corrects every comparison of both kinds by Holm across all of them', () => {
    const checkins: CheckIn[] = []
    days.forEach((d, i) => {
      checkins.push(checkin(d, 'morning', low(i) ? 1 : 5))
      if (!(low(i) && i % 10 !== 0)) checkins.push(checkin(d, 'evening', 3))
    })
    const r = readMissing({ checkins, contexts: days.map((d) => context(d)), frequency: 'two' }, TODAY)
    expect(r.comparisons.map((c) => c.kind)).toContain('unanswered')
    expect(r.comparisons.map((c) => c.adjusted)).toEqual(holmAdjusted(r.comparisons.map((c) => c.p)))
    expect(r.comparisons.some((c) => c.adjusted > c.p)).toBe(true)
  })

  it('counts a block only from the first day in the window it was started, so a later change of frequency is no miss', () => {
    const checkins: CheckIn[] = days.map((d) => checkin(d, 'evening', 3))
    // Mornings only for the last ten days.
    for (const d of days.slice(0, 10)) checkins.push(checkin(d, 'morning', 3))
    const r = readMissing({ checkins, contexts: days.map((d) => context(d)), frequency: 'two' }, TODAY)
    expect(r.slots).toBe(50)
    expect(r.missed).toBe(0)
  })
})

describe('the checks as the weekly view shows them', () => {
  it('leaves out a cluster after a faith practice while faith is hidden, and keeps every other', () => {
    const cluster = (cause: HonestyChecks['misses']['clusters'][number]['cause']) => ({ cause, missesIn: 6, slotsIn: 7, missesOut: 9, slotsOut: 43, p: 0.001, adjusted: 0.004, cluster: true })
    const c: HonestyChecks = {
      together: [],
      requests: [],
      misses: { slots: 50, misses: 15, candidates: [], clusters: [cluster({ kind: 'move', moveId: 'five-minutes-prayer' }), cluster({ kind: 'move', moveId: 'walk-ten' }), cluster({ kind: 'context', context: 'unwell' })] },
      missing: { slots: 0, missed: 0, started: 0, unanswered: 0, comparisons: [], relations: [] },
    }
    expect(checksAsShown(c, false)).toBe(c)
    expect(checksAsShown(c, true).misses.clusters.map((x) => x.cause)).toEqual([{ kind: 'move', moveId: 'walk-ten' }, { kind: 'context', context: 'unwell' }])
  })
})
