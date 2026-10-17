import { describe, expect, it } from 'vitest'
import { numbersRefusal } from './brainShared'
import type { FactSheet } from './factTypes'
import type { FamilyHealth, Scorecard } from './weekly'
import { weeklyFacts, type WeeklyAnalyses } from './weeklyFacts'

// The weekly view's analyses as facts for the Sunday review (stage 3, group 1): the view's own numbers
// and words, each with what it rests on; what names a faith practice or a Social path rep in a fact of
// its own, filed by the Worker under that switch; the Partner path's reps never; no tags, so the
// library's cards are drawn as before.

const SCORE: Scorecard = { scored: 20, hitRate: 0.65, target: 0.6, averageMiss: 7.34, declared: 2, replicated: 1, gaveBack: 40, checkins: 42, medianAnswerMs: { morning: 41_200, afternoon: 29_600, evening: null } }
const health = (family: string, name: string, over: Partial<FamilyHealth> = {}): FamilyHealth => ({ family, name, live: 4, offered: 6, done: 2, reachable: true, blocker: null, dead: [], ...over })
const BASE: WeeklyAnalyses = {
  scorecard: SCORE,
  best: { days: 12, threshold: 20, silent: true, top: [], controlled: [], uncontrolled: [] },
  gap: { days: 5, typical: null, good: null, best: null, howOften: null, lastGoodDaysAgo: null },
  moved: { reading: { thisWeek: null, lastWeek: null, delta: null }, ingredients: [] },
  lasts: { decays: [], byReward: [{ reward: 'pleasure', first: null, later: null }] },
  health: [health('movement', 'Movement')],
}
const byId = (w: WeeklyAnalyses) => new Map(weeklyFacts(w).map((f) => [f.id, f]))

describe('the weekly facts', () => {
  it('say the scorecard, the gap and what moved in the view’s numbers', () => {
    const f = byId({
      ...BASE,
      gap: { days: 30, typical: 52, good: 61, best: 74, howOften: 0.3, lastGoodDaysAgo: 2 },
      moved: { reading: { thisWeek: 55.34, lastWeek: 52.01, delta: 3.33 }, ingredients: [{ reading: 'stress', thisWeek: 2.5, lastWeek: 3, delta: 0.5 }, { reading: 'mood', thisWeek: 3, lastWeek: 3.25, delta: -0.25 }, { reading: 'focus', thisWeek: 3, lastWeek: 3.002, delta: -0.002 }] },
    })
    expect(f.get('weekly.scorecard')?.text).toBe('The scorecard, from the weekly view: forecast hit rate 65 percent against a target of 60, over 20 day-ahead forecasts; average miss 7.3 points; experiments declared 2, replicated 1; check-ins that gave something back: 40 of 42; median answering time: morning 41 s, afternoon 30 s, evening none yet.')
    expect(f.get('weekly.gap')?.text).toBe('The gap, from the weekly view, over 30 days with two logged blocks: typical 52 (the median day), good 61 (the top quarter’s floor), best 74 (the top tenth’s average); good days 30 percent of them, the last one 2 days ago.')
    // Each reading in its own direction: Stress down is better, Mood down is worse.
    expect(f.get('weekly.moved')?.text).toBe('What moved this week, from the weekly view, the last seven days against the seven before: the reading 55.3 against 52 (+3.3 points); Stress down 0.5 steps, better; Mood down 0.25 steps, worse; Focus no change.')
  })

  it('say what is not there yet, and what each rests on', () => {
    const f = byId({ ...BASE, scorecard: { ...SCORE, scored: 0, hitRate: null, averageMiss: null } })
    expect(f.get('weekly.scorecard')?.text).toMatch(/^The scorecard, from the weekly view: no day-ahead forecast scored yet; experiments declared 2/)
    expect(f.get('weekly.gap')?.text).toBe('The gap, from the weekly view, appears after seven days with two logged blocks: 5 so far.')
    expect(f.get('weekly.moved')?.text).toBe('What moved this week, from the weekly view, needs two weeks of record.')
    expect(f.get('weekly.best')?.text).toBe('Best-days, from the weekly view, stays silent until twenty days with two logged blocks: 12 so far.')
    expect(f.get('weekly.lasts')?.text).toBe('What lasts, from the weekly view: nothing yet, since it takes three runs of three days. No reward has the record yet to set its first three times against its later ones.')
  })

  it('put a faith practice and a Social path rep in facts of their own, and never a Partner path rep', () => {
    const d = (label: string, moveId: string | undefined, onBest: number) => ({ label, ...(moveId ? { moveId } : {}), onBest, ofBest: 4, onOthers: 3, ofOthers: 36 })
    const f = byId({
      ...BASE,
      best: { days: 40, threshold: 20, silent: false, top: ['a', 'b', 'c', 'd'], controlled: [d('A ten-minute walk, now', 'walk-ten', 3), d('Five minutes of prayer', 'five-minutes-prayer', 2), d('Greet someone by name', 'greet-by-name', 2), d('One low-pressure conversation with a woman', 'low-pressure-conversation', 2), d('a nap', undefined, 1)], uncontrolled: [d('Monday', undefined, 2)] },
      lasts: { decays: [{ moveId: 'walk-ten', daysHeld: 2, runs: 3 }, { moveId: 'one-verse', daysHeld: 3, runs: 4 }, { moveId: 'low-pressure-conversation', daysHeld: 1, runs: 3 }], byReward: [{ reward: 'mastery', first: { mean: 0.42, n: 6 }, later: { mean: 0.1, n: 9 } }] },
      health: [health('movement', 'Movement'), health('faith', 'Faith', { reachable: false, blocker: 'hidden' }), health('partner', 'Partner')],
    })
    expect([...f.keys()]).toEqual(['weekly.scorecard', 'weekly.gap', 'weekly.moved', 'weekly.best', 'weekly.best.faith', 'weekly.best.social', 'weekly.lasts', 'weekly.lasts.faith', 'weekly.health', 'weekly.health.faith'])
    expect(f.get('weekly.best')?.text).toBe('Best-days, from the weekly view: the top tenth of days, 4 of 40, against the others. What you control: A ten-minute walk, now: 3 of 4 best days, 3 of 36 others; a nap: 1 of 4 best days, 3 of 36 others. What you don’t: Monday: 2 of 4 best days, 3 of 36 others.')
    expect(f.get('weekly.best.faith')?.text).toBe('Best-days, from the weekly view, the faith practices among what you control, over the same 4 best days of 40: Five minutes of prayer: 2 of 4 best days, 3 of 36 others.')
    expect(f.get('weekly.best.social')?.text).toBe('Best-days, from the weekly view, the Social path reps among what you control, over the same 4 best days of 40: Greet someone by name: 2 of 4 best days, 3 of 36 others.')
    expect(f.get('weekly.lasts')?.text).toBe('What lasts, from the weekly view: A ten-minute walk, now held about 2 days after a run (3 runs). Each reward’s first three times against its later ones: mastery: the first three +0.42 steps (6), later +0.1 steps (9).')
    expect(f.get('weekly.lasts.faith')?.text).toBe('What lasts, from the weekly view, the faith practices: Read one verse and sit with it held about 3 days after a run (4 runs).')
    expect(f.get('weekly.health')?.text).toBe('Catalogue health, from the weekly view, by family: Movement: 4 live, offered 6, done 2.')
    expect(f.get('weekly.health.faith')?.text).toBe('Catalogue health, from the weekly view, the faith family: Faith: 4 live, offered 6, done 2 (unreachable in the situations seen, since its family is hidden).')
    for (const fact of f.values()) expect(fact.text).not.toMatch(/low-pressure|woman|Partner/)
  })

  it('carry no tags, and every number each says is one the validator can ground in it', () => {
    const facts = weeklyFacts({
      ...BASE,
      gap: { days: 30, typical: 52, good: 61, best: 74, howOften: 0.3, lastGoodDaysAgo: 2 },
      moved: { reading: { thisWeek: 55.34, lastWeek: 52.01, delta: 3.33 }, ingredients: [{ reading: 'stress', thisWeek: 2.5, lastWeek: 3, delta: 0.5 }] },
      best: { days: 40, threshold: 20, silent: false, top: ['a', 'b', 'c', 'd'], controlled: [{ label: 'a nap', onBest: 1, ofBest: 4, onOthers: 3, ofOthers: 36 }], uncontrolled: [{ label: 'Monday', onBest: 2, ofBest: 4, onOthers: 5, ofOthers: 36 }] },
      lasts: { decays: [{ moveId: 'walk-ten', daysHeld: 2, runs: 3 }], byReward: [{ reward: 'mastery', first: { mean: -0.42, n: 6 }, later: null }] },
      health: [health('movement', 'Movement', { dead: [{ id: 'x', name: 'Stretch', blocker: 'parked' }] })],
    })
    const sheet = { facts } as FactSheet
    for (const f of facts) {
      expect(f.tags).toEqual([])
      // A probe that could say no: a number the fact does not hold is refused.
      expect(numbersRefusal(`${f.text} 987654`, sheet, [f.id])).toBe('the number 987654 is not in the cited facts')
      expect(numbersRefusal(f.text, sheet, [f.id])).toBeNull()
    }
  })
})
