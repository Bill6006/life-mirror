import { describe, expect, it } from 'vitest'
import { moveById } from './catalogue'
import type { CheckIn, Offer, Outcome } from './db'
import {
  combine,
  DECLINED_EFFECT,
  DECLINED_WEIGHT,
  forecast,
  indexCheckIns,
  isThin,
  moveBelief,
  noTimeCeiling,
  observations,
  OBSERVATION_SD,
  priorOf,
  PRIOR_SD,
  recordOf,
  shrink,
  signFlips,
  signedEffect,
  tagBeliefs,
  THIN_WEIGHT,
  windowSlots,
  type Belief,
  type MoveBelief,
} from './learning'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], answers: Answers, activeMs = 30_000): CheckIn => ({
  day,
  block,
  answers,
  startedAt: '',
  completedAt: Object.keys(answers).length ? 'x' : null,
  updatedAt: '',
  activeMs,
})
const offer = (id: number, day: string, block: Offer['block'], moveId: string, target: ReadingId, coinFlip = true): Offer => ({
  id,
  kind: 'block',
  day,
  block,
  at: `${day}T15:00:00.000Z`,
  situationKey: `${block}:${target}`,
  target,
  stance: '',
  band: '',
  reading: 0,
  moveId,
  cardId: null,
  candidates: [moveId],
  coinFlip,
  passiveId: null,
  whyNot: null,
  skippedAt: null,
  closedAt: null,
})
const outcome = (offerId: number, moveId: string, result: Outcome['outcome'], why: Outcome['why'] = null): Outcome => ({ offerId, moveId, day: '', block: 'evening', at: '', outcome: result, why, passiveOutcome: null })

// Three earlier evenings with mood in the middle, so the evening forecast for mood is 3.
const D = '2026-09-10'
const priorEvenings = ['2026-09-07', '2026-09-08', '2026-09-09'].map((d) => ci(d, 'evening', allAt(blockReadings('evening'), 3)))

describe('the forecast and the thin check-in', () => {
  it('expects a reading from at least three earlier answers of that block, recent days weighing more', () => {
    const byKey = indexCheckIns(priorEvenings)
    expect(forecast(byKey, D, 'evening', 'mood')).toBeCloseTo(3, 10)
    expect(forecast(indexCheckIns(priorEvenings.slice(1)), D, 'evening', 'mood')).toBeNull()
    const skewed = [...priorEvenings.slice(0, 2), ci('2026-09-09', 'evening', { ...allAt(blockReadings('evening'), 3), mood: 5 })]
    const f = forecast(indexCheckIns(skewed), D, 'evening', 'mood') as number
    expect(f).toBeGreaterThan(3.5)
    expect(f).toBeLessThan(5)
  })

  it('marks fast identical taps as thin, weighed at a half', () => {
    const thin = ci(D, 'evening', allAt(blockReadings('evening'), 4), 800)
    expect(isThin(thin)).toBe(true)
    expect(isThin(ci(D, 'evening', allAt(blockReadings('evening'), 4), 20_000))).toBe(false)
    expect(isThin(ci(D, 'evening', { ...allAt(blockReadings('evening'), 4), mood: 2 }, 800))).toBe(false)
    expect(THIN_WEIGHT).toBe(0.5)
  })

  it('reads the helpful direction as positive, and the window from the block', () => {
    expect(signedEffect(4, 3, 'mood')).toBe(1)
    expect(signedEffect(2, 3, 'stress')).toBe(1)
    expect(windowSlots(D, 'afternoon', 'nextBlock')).toEqual([{ day: D, block: 'evening' }])
    expect(windowSlots(D, 'evening', 'nextBlock')).toEqual([{ day: '2026-09-11', block: 'morning' }])
    expect(windowSlots(D, 'morning', 'laterToday')).toEqual([
      { day: D, block: 'afternoon' },
      { day: D, block: 'evening' },
    ])
    expect(windowSlots(D, 'afternoon', 'sevenDays')).toHaveLength(21)
  })
})

describe('effects from the record', () => {
  const afternoonOffer = offer(1, D, 'afternoon', 'walk-ten', 'mood')
  const evening = ci(D, 'evening', { ...allAt(blockReadings('evening'), 3), mood: 4 })

  it('is what happened minus what was expected, over the move’s window', () => {
    const obs = observations([...priorEvenings, evening], [afternoonOffer], [outcome(1, 'walk-ten', 'done')])
    expect(obs).toHaveLength(1)
    expect(obs[0]).toMatchObject({ offerId: 1, moveId: 'walk-ten', arm: 'done', weight: 1, coinFlip: true, window: 'nextBlock' })
    expect(obs[0].effect).toBeCloseTo(1, 10)
    expect(obs[0].spill.stress).toBeCloseTo(0, 10)
    expect(obs[0].energy).toBeCloseTo(0, 10)
  })

  it('records nothing before the record can expect anything, nothing for a No, and a light mark for didn’t want to', () => {
    expect(observations([evening], [afternoonOffer], [outcome(1, 'walk-ten', 'done')])).toHaveLength(0)
    expect(observations([...priorEvenings, evening], [afternoonOffer], [outcome(1, 'walk-ten', 'no', 'noTime')])).toHaveLength(0)
    const declined = observations([...priorEvenings, evening], [afternoonOffer], [outcome(1, 'walk-ten', 'no', 'didntWant')])
    expect(declined).toHaveLength(1)
    expect(declined[0]).toMatchObject({ arm: 'declined', effect: DECLINED_EFFECT, weight: DECLINED_WEIGHT })
  })

  it('changes no computed value when an unanswered block is added', () => {
    const before = observations([...priorEvenings, evening], [afternoonOffer], [outcome(1, 'walk-ten', 'done')])
    const withEmpty = observations([...priorEvenings, evening, ci('2026-09-11', 'morning', {})], [afternoonOffer], [outcome(1, 'walk-ten', 'done')])
    expect(withEmpty).toEqual(before)
    const tagsBefore = tagBeliefs(before, '2026-09-11')
    const tagsAfter = tagBeliefs(withEmpty, '2026-09-11')
    expect(tagsAfter).toEqual(tagsBefore)
  })

  it('weighs a thin check-in by its stated weight and nothing else changes', () => {
    const thinEvening = ci(D, 'evening', allAt(blockReadings('evening'), 4), 800)
    const full = observations([...priorEvenings, evening], [afternoonOffer], [outcome(1, 'walk-ten', 'done')])
    const thin = observations([...priorEvenings, thinEvening], [afternoonOffer], [outcome(1, 'walk-ten', 'done')])
    expect(full[0].weight).toBe(1)
    expect(thin[0].weight).toBe(THIN_WEIGHT)
    expect(thin[0].effect).toBeCloseTo(full[0].effect, 10)
    const move = moveById('walk-ten')
    const prior = priorOf(move)
    const fullRecord = recordOf(full, D) as Belief
    const thinRecord = recordOf(thin, D) as Belief
    expect(fullRecord.n).toBe(1)
    expect(thinRecord.n).toBe(THIN_WEIGHT)
    const p0 = 1 / prior.sd ** 2
    expect(combine(prior, fullRecord).mean).toBeCloseTo((p0 * prior.mean + 1 * 1) / (p0 + 1 / OBSERVATION_SD ** 2), 10)
    expect(combine(prior, thinRecord).mean).toBeCloseTo((p0 * prior.mean + THIN_WEIGHT * 1) / (p0 + THIN_WEIGHT / OBSERVATION_SD ** 2), 10)
  })
})

describe('beliefs: research says, your record says', () => {
  it('starts from the Phase 9 prior with a spread set by the source’s strength, and moves by precision', () => {
    const walk = moveById('walk-ten')
    const prior = priorOf(walk)
    expect(prior).toEqual({ mean: walk.prior.effect, sd: PRIOR_SD[walk.source.strength], n: 0 })
    expect(combine(prior, null)).toEqual(prior)
    const moved = combine(prior, { mean: 2, sd: 0.5, n: 4 })
    expect(moved.mean).toBeGreaterThan(prior.mean)
    expect(moved.mean).toBeLessThan(2)
    expect(moved.sd).toBeLessThan(prior.sd)
  })

  it('shrinks a thin tag toward its prior and lets a long record win', () => {
    const prior = { mean: 0.3, sd: 0.5, n: 0 }
    expect(shrink(prior, null)).toEqual(prior)
    const thin = shrink(prior, { mean: 1, sd: 0.5, n: 1 })
    expect(thin.mean).toBeCloseTo(0.3 + (1 / 6) * 0.7, 10)
    const long = shrink(prior, { mean: 1, sd: 0.2, n: 50 })
    expect(long.mean).toBeGreaterThan(0.9)
  })

  it('lends the tags’ record to a move whose own record is thin, and never flips on one day', () => {
    const today = '2026-09-11'
    const obs = [
      { offerId: 1, moveId: 'green-walk', situationKey: 'afternoon:mood', target: 'mood' as const, window: 'nextBlock' as const, day: '2026-09-09', block: 'afternoon' as const, arm: 'done' as const, effect: 2, weight: 1, coinFlip: true, spill: {}, energy: null },
      { offerId: 2, moveId: 'green-walk', situationKey: 'afternoon:mood', target: 'mood' as const, window: 'nextBlock' as const, day: '2026-09-10', block: 'afternoon' as const, arm: 'done' as const, effect: 2, weight: 1, coinFlip: true, spill: {}, energy: null },
    ]
    const tags = tagBeliefs(obs, today)
    const outdoors = tags.find((t) => t.id === 'outdoors')
    expect(outdoors?.record?.n).toBeGreaterThan(1.5)
    const walk = moveBelief(moveById('walk-ten'), 'afternoon:mood', obs, tags, today)
    expect(walk.record).toBeNull()
    expect(walk.belief.mean).toBeGreaterThan(walk.research.mean)
    const oneBadDay = [...obs, { ...obs[0], offerId: 3, moveId: 'walk-ten', day: today, effect: -3 }]
    const after = moveBelief(moveById('walk-ten'), 'afternoon:mood', oneBadDay, tagBeliefs(oneBadDay, today), today)
    expect(after.belief.mean).toBeGreaterThan(-1)
  })

  it('flags a sign flip only with enough record on both sides', () => {
    const b = (situationKey: string, mean: number, n: number): MoveBelief => ({ moveId: 'walk-ten', situationKey, research: { mean: 0.4, sd: 0.3, n: 0 }, record: { mean, sd: 0.3, n }, belief: { mean, sd: 0.3, n } })
    expect(signFlips([b('morning:mood', 0.8, 5), b('evening:mood', -0.8, 5)])).toEqual([{ moveId: 'walk-ten', helps: 'morning:mood', hurts: 'evening:mood' }])
    expect(signFlips([b('morning:mood', 0.8, 5), b('evening:mood', -0.8, 2)])).toEqual([])
    expect(signFlips([b('morning:mood', 0.8, 5), b('evening:mood', 0.1, 9)])).toEqual([])
  })

  it('narrows the block for a week after a "no time", by the shortest move refused', () => {
    const offers = [offer(1, '2026-09-08', 'evening', 'focused-block', 'focus'), offer(2, '2026-09-09', 'evening', 'walk-ten', 'mood'), offer(3, '2026-08-01', 'evening', 'cyclic-sigh', 'stress')]
    const outcomes = [outcome(1, 'focused-block', 'no', 'noTime'), outcome(2, 'walk-ten', 'no', 'noTime'), outcome(3, 'cyclic-sigh', 'no', 'noTime')]
    expect(noTimeCeiling(offers, outcomes, 'evening', '2026-09-11')).toBe(10)
    expect(noTimeCeiling(offers, outcomes, 'morning', '2026-09-11')).toBeNull()
    expect(noTimeCeiling(offers, [outcome(1, 'focused-block', 'no', 'didntWant')], 'evening', '2026-09-11')).toBeNull()
  })
})
