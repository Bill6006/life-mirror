import { describe, expect, it } from 'vitest'
import type { CheckIn, Offer, Outcome } from './db'
import { DECLINED_EFFECT, DECLINED_WEIGHT, forecast, indexCheckIns, isThin, noTimeCeiling, observations, signedEffect, THIN_WEIGHT, windowSlots } from './observe'
import { NOTHING } from './offers'
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
  })

  it('weighs a thin check-in by its stated weight and nothing else changes', () => {
    const thinEvening = ci(D, 'evening', allAt(blockReadings('evening'), 4), 800)
    const full = observations([...priorEvenings, evening], [afternoonOffer], [outcome(1, 'walk-ten', 'done')])
    const thin = observations([...priorEvenings, thinEvening], [afternoonOffer], [outcome(1, 'walk-ten', 'done')])
    expect(full[0].weight).toBe(1)
    expect(thin[0].weight).toBe(THIN_WEIGHT)
    expect(thin[0].effect).toBeCloseTo(full[0].effect, 10)
  })
})

describe('the no-time ceiling', () => {
  it('narrows the block for a week after a "no time", by the shortest move refused', () => {
    const offers = [offer(1, '2026-09-08', 'evening', 'focused-block', 'focus'), offer(2, '2026-09-09', 'evening', 'walk-ten', 'mood'), offer(3, '2026-08-01', 'evening', 'cyclic-sigh', 'stress')]
    const outcomes = [outcome(1, 'focused-block', 'no', 'noTime'), outcome(2, 'walk-ten', 'no', 'noTime'), outcome(3, 'cyclic-sigh', 'no', 'noTime')]
    expect(noTimeCeiling(offers, outcomes, 'evening', '2026-09-11')).toBe(10)
    expect(noTimeCeiling(offers, outcomes, 'morning', '2026-09-11')).toBeNull()
    expect(noTimeCeiling(offers, [outcome(1, 'focused-block', 'no', 'didntWant')], 'evening', '2026-09-11')).toBeNull()
  })
})

describe('the null offer', () => {
  const nullOffer = offer(3, D, 'afternoon', NOTHING, 'mood')
  const evening = ci(D, 'evening', { ...allAt(blockReadings('evening'), 3), mood: 4 })

  it('kept to, is an effect like any move, read over the next block', () => {
    const obs = observations([...priorEvenings, evening], [nullOffer], [outcome(3, NOTHING, 'done')])
    expect(obs).toHaveLength(1)
    expect(obs[0]).toMatchObject({ moveId: NOTHING, arm: 'done', window: 'nextBlock', situationKey: 'afternoon:mood' })
    expect(obs[0].effect).toBeCloseTo(1, 10)
  })

  it('not wanted, leaves the same light mark a move does; passed over, nothing at all', () => {
    const declined = observations([...priorEvenings, evening], [nullOffer], [outcome(3, NOTHING, 'no', 'didntWant')])
    expect(declined[0]).toMatchObject({ arm: 'declined', effect: DECLINED_EFFECT, window: 'nextBlock' })
    expect(observations([...priorEvenings, evening], [nullOffer], [outcome(3, NOTHING, null)])).toHaveLength(0)
  })

})
