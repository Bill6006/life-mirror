import { describe, expect, it } from 'vitest'
import { associationTier, type DayPoint, likeForLike } from './associations'
import { assocFact, hardFact, sheetStandings, weatherFacts } from './facts'
import type { HardMeasure } from './workouts'

// The sheet's associations under the one standard (Phase 3, 2026-11-12): each fact is written from its standing among
// every association the sheet carries. The two records of the phase's acceptance are here: a chip tapped three times,
// which used to read Promising, and a strong difference the wrong way, which used to read Unclear.

const day = (n: number): string => new Date(Date.UTC(2031, 0, 6 + n)).toISOString().slice(0, 10)
/** Evenings over whole fortnights, all in one band: with the thing on each fortnight's 1st, 2nd, 4th and 8th days, without on its 3rd, 6th, 10th and 13th. */
const evenings = (withReads: number, withoutReads: number, fortnights = 4): DayPoint[] =>
  Array.from({ length: fortnights }, (_, f) => [
    ...[0, 1, 3, 7].map((d): DayPoint => ({ day: day(14 * f + d), band: 'gettingBy', event: true, outcome: withReads })),
    ...[2, 5, 9, 12].map((d): DayPoint => ({ day: day(14 * f + d), band: 'gettingBy', event: false, outcome: withoutReads })),
  ]).flat()

describe('an association on the sheet', () => {
  it('says too few to compare yet for a chip tapped three times, where it used to say promising', () => {
    const points: DayPoint[] = [...[0, 1, 3].map((d): DayPoint => ({ day: day(d), band: 'gettingBy', event: true, outcome: 70 })), ...Array.from({ length: 20 }, (_, i): DayPoint => ({ day: day(4 + i), band: 'gettingBy', event: false, outcome: 50 }))]
    const a = likeForLike(points, { id: 'assoc.napped', worth: 10 })
    // As it was read until this phase: three events and twenty points were enough.
    expect(associationTier(a, 10)).toBe('promising')
    const fact = assocFact('assoc.napped', ['nap'], 'a nap', a, 'Mornings after', sheetStandings([a]))
    expect(fact?.text).toBe('Too few to compare yet: mornings after a nap, 3 with it, 20 without.')
    expect(fact?.tier).toBe('little')
    expect(fact?.values).toMatchObject({ standing: 'tooFew', p: null, diff: 20, times: 3 })
  })

  it('says a steady pattern, read lower, for a strong difference the wrong way, where it used to say unclear', () => {
    const a = likeForLike(evenings(30, 60), { id: 'assoc.dinner', worth: 10 })
    expect(associationTier(a, 10)).toBe('unclear')
    const fact = assocFact('assoc.dinner', [], 'a late or heavy dinner', a, 'Mornings after', sheetStandings([a]))
    expect(fact?.text).toBe('A steady pattern: mornings after a late or heavy dinner read 30 points lower, not the good direction, like for like (16 with it, 16 without).')
    // The old field keeps its three values: promising is only ever the good direction.
    expect(fact?.tier).toBe('unclear')
    expect(fact?.values).toMatchObject({ standing: 'pattern', direction: 'lower', helpful: 0, m: 1 })
    expect(fact?.values.p).toBeLessThan(0.05)
  })

  it('keeps promising in the old field for a lead or a pattern in the good direction', () => {
    const a = likeForLike(evenings(80, 50), { id: 'assoc.nature', worth: 10 })
    const fact = assocFact('assoc.nature', [], 'a day in nature', a, 'Evenings of', sheetStandings([a]))
    expect(fact?.tier).toBe('promising')
    expect(fact?.values).toMatchObject({ standing: 'pattern', direction: 'higher', helpful: 1 })
    expect(fact?.text).toContain('A steady pattern: evenings of a day in nature read 30 points higher, the good direction, like for like')
  })

  it('is one of a family: every association the sheet carries pays for the others, and says how many there were', () => {
    const strong = likeForLike(evenings(80, 50), { id: 'assoc.a', worth: 10 })
    const nothing = likeForLike(evenings(50, 50), { id: 'assoc.b', worth: 10 })
    const unnamed = likeForLike(evenings(80, 50))
    const stood = sheetStandings([strong, nothing, null, undefined, unnamed])
    expect([...stood.keys()]).toEqual(['assoc.a', 'assoc.b'])
    expect(assocFact('assoc.a', [], 'a', strong, 'Mornings after', stood)?.values).toMatchObject({ standing: 'pattern', m: 2 })
    expect(assocFact('assoc.b', [], 'b', nothing, 'Mornings after', stood)).toMatchObject({ tier: 'unclear', values: { standing: 'noPattern', m: 2 } })
    // An association nobody named was never given a chance, and is too few whatever its numbers.
    expect(assocFact('assoc.c', [], 'c', unnamed, 'Mornings after', stood)?.values).toMatchObject({ standing: 'tooFew' })
  })

  it('says a lead at most on a scale of steps, until that scale has its own proof', () => {
    const a = likeForLike(evenings(80, 50), { id: 'assoc.eveningWorkout.sleep', worth: 10 })
    const stood = sheetStandings([a])
    expect(stood.get('assoc.eveningWorkout.sleep')?.standing).toBe('lead')
    expect(assocFact('assoc.eveningWorkout.sleep', [], 'an evening workout', a, 'Sleep quality the mornings after', stood)?.text).toContain('A lead, not yet a pattern: sleep quality the mornings after an evening workout read 30 points higher')
  })
})

// The hard session's four readings and the weather's two comparisons, each written from a standing supplied by the
// family (Phase 3, 2026-11-12).
describe('a hard session and the weather on the sheet', () => {
  it('says each of a hard session’s readings with its standing, a lead at most, and too few with no number', () => {
    const named = (id: HardMeasure, points: DayPoint[]) => likeForLike(points, { id: `assoc.hardWorkout.${id}`, worth: 0.4 })
    const few: DayPoint[] = [...[0, 1, 3].map((d): DayPoint => ({ day: day(d), band: 'gettingBy', event: true, outcome: 4 })), ...Array.from({ length: 20 }, (_, i): DayPoint => ({ day: day(4 + i), band: 'gettingBy', event: false, outcome: 2 }))]
    const measures: Record<HardMeasure, ReturnType<typeof likeForLike>> = { energy: named('energy', evenings(4, 2)), mood: named('mood', few), focus: named('focus', evenings(3, 3)), stress: named('stress', evenings(4, 2)) }
    const fact = hardFact({ times: 16, measures }, sheetStandings(Object.values(measures)))
    // Two steps on sixteen mornings a side would stand at a steady pattern; on a scale of steps it is said as a lead.
    expect(fact.text).toContain('16 times: energy +2 steps (a lead, not yet a pattern), mood too few to compare yet, focus 0 steps (no clear pattern yet), stress +2 steps (a lead, not yet a pattern). An association, not a cause.')
    expect(fact.values).toMatchObject({ times: 16, energy: 2, energyStanding: 'lead', energyTier: 'promising', mood: 2, moodStanding: 'tooFew', moodTier: 'little', focusStanding: 'noPattern', focusTier: 'unclear', stressStanding: 'lead' })
    // More stress is not the good direction: the old field stays unclear.
    expect(fact.values.stressTier).toBe('unclear')
  })

  it('says the weather’s two comparisons each with its standing, and the counts alone when there are too few', () => {
    const rain = likeForLike(evenings(40, 60), { id: 'assoc.weather.rain', worth: 10 })
    const sun = likeForLike(evenings(52, 50), { id: 'assoc.weather.sun', worth: 10 })
    const stood = sheetStandings([rain, sun])
    const facts = weatherFacts([], [], day(60), stood, { rain, sun, days: 32, rainy: 16, sunnier: 16, shared: 32 })
    expect(facts.map((f) => f.id)).toEqual(['assoc.weather.rain', 'assoc.weather.sun'])
    expect(facts[0].text).toBe('Evenings of rainy days (1 mm of rain or more) read -20 against evenings of dry days, like for like on the morning’s band, 16 rainy days of 32 with weather (a steady pattern).')
    expect(facts[0].values).toMatchObject({ diff: -20, standing: 'pattern', direction: 'lower', helpful: 0, m: 2 })
    expect(facts[0].tier).toBe('unclear')
    expect(facts[1].text).toContain('read +2 against greyer ones')
    expect(facts[1].text).toContain('(no clear pattern yet).')
    // Without a standing supplied, nothing was tested: the counts, and no difference.
    const bare = weatherFacts([], [], day(60), new Map(), { rain, sun, days: 32, rainy: 16, sunnier: 16, shared: 32 })
    expect(bare[0].text).toBe('Rainy days (1 mm of rain or more): 16 rainy days of 32 with weather; nothing can be compared yet.')
  })
})
