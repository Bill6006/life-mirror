import { describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { extensionPrompt, families, moveById } from './catalogue'
import type { CheckIn, DayContext, ForecastScore, Offer, Outcome } from './db'
import type { Situation } from './offers'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { bestDays, catalogueHealth, dayReading, extensionPromptText, gap, movedThisWeek, recentSituations, scorecard } from './weekly'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], p: Position, activeMs = 30_000, extras?: CheckIn['extras']): CheckIn => ({ day, block, answers: allAt(blockReadings(block), p), startedAt: '', completedAt: 'x', updatedAt: '', activeMs, extras })
const TODAY = '2026-09-30'

/** A day at a level out of 100: the up ingredients at one position, the down ingredients mirrored. */
function level(c: CheckIn, p: Position): CheckIn {
  const answers = { ...c.answers }
  for (const id of ['stress', 'overwhelm', 'irritation'] as const) if (answers[id] !== undefined) answers[id] = (6 - p) as Position
  for (const id of ['mood', 'energy', 'focus'] as const) if (answers[id] !== undefined) answers[id] = p
  return { ...c, answers }
}

function daysOf(n: number, position: (i: number) => Position): CheckIn[] {
  const out: CheckIn[] = []
  for (let i = n; i >= 1; i--) {
    const day = addDays(TODAY, -i)
    out.push(level(ci(day, 'morning', 3), position(i)), level(ci(day, 'evening', 3), position(i)))
  }
  return out
}

const offer = (id: number, day: string, moveId: string, situationKey = 'evening:mood', block: Offer['block'] = 'evening', target: ReadingId = 'mood'): Offer => ({
  id,
  kind: 'block',
  day,
  block,
  at: `${day}T18:00:00.000Z`,
  situationKey,
  target,
  stance: 'Stabilize',
  band: 'gettingBy',
  reading: 50,
  moveId,
  cardId: null,
  candidates: [moveId],
  coinFlip: false,
  passiveId: null,
  whyNot: null,
  skippedAt: null,
  closedAt: null,
})
const done = (offerId: number): Outcome => ({ offerId, moveId: '', day: '', block: 'evening', at: '', outcome: 'done', why: null, passiveOutcome: null })

describe('the scorecard', () => {
  it('scores the day-ahead forecasts against the target, counts what gave back, and takes the median answering time', () => {
    const score = (day: string, hit: boolean, error: number): ForecastScore => ({ day, block: 'evening', horizon: 1, model: 'sameBlock', point: 50, lo: 45, hi: 55, actual: 50 + error, error, hit, scoredOn: TODAY })
    const scores = [score('2026-09-20', true, 2), score('2026-09-21', false, 12), score('2026-09-22', true, -3), { ...score('2026-09-23', false, 30), horizon: 3 }]
    const checkins = [ci('2026-09-20', 'morning', 3, 10_000), ci('2026-09-20', 'evening', 3, 20_000), { ...ci('2026-09-21', 'morning', 3, 5_000), completedAt: null }]
    const sc = scorecard(scores, checkins, [], [])
    expect(sc.scored).toBe(3)
    expect(sc.hitRate).toBeCloseTo(2 / 3, 10)
    expect(sc.target).toBe(0.6)
    expect(sc.averageMiss).toBe(12)
    expect(sc.gaveBack).toBe(2)
    expect(sc.checkins).toBe(3)
    expect(sc.medianAnswerMs.morning).toBe(10_000)
    expect(sc.medianAnswerMs.afternoon).toBeNull()
  })
})

describe('best-days', () => {
  it('stays silent under twenty days and says how many it has', () => {
    const b = bestDays(daysOf(12, () => 3), [], [], [], TODAY)
    expect(b).toMatchObject({ silent: true, days: 12, threshold: 20, top: [] })
  })

  it('names the top tenth above the threshold, with what was different, split into what you control and what you don’t', () => {
    // Thirty days: every third day reads high. A walk was done on those days; the rest never.
    const checkins = daysOf(30, (i) => (i % 3 === 0 ? 5 : 3))
    const highDays = [...new Set(checkins.map((c) => c.day))].filter((d) => dayReading(checkins, d) === 100)
    const offers = highDays.map((d, i) => offer(i + 1, d, 'walk-ten'))
    const outcomes = offers.map((o) => done(o.id as number))
    const contexts: DayContext[] = highDays.map((day) => ({ day, weekday: 2, withHer: false, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: '' }))
    const b = bestDays(checkins, offers, outcomes, contexts, TODAY)
    expect(b.silent).toBe(false)
    expect(b.days).toBe(30)
    expect(b.top).toHaveLength(3)
    const walk = b.controlled.find((d) => d.label === moveById('walk-ten').name)
    expect(walk).toMatchObject({ onBest: 3, ofBest: 3, onOthers: 7, ofOthers: 27 })
    const away = b.uncontrolled.find((d) => d.label === 'she was away')
    expect(away?.onBest).toBe(3)
    expect(b.controlled.length).toBeLessThanOrEqual(4)
  })
})

describe('the gap and what moved', () => {
  it('gives the gap as numbers: typical, good, best, how often and how recently', () => {
    const checkins = daysOf(20, (i) => (i <= 4 ? 4 : i % 5 === 0 ? 5 : 3))
    const g = gap(checkins, TODAY)
    expect(g.days).toBe(20)
    expect(g.typical).toBe(50)
    expect(g.good).toBe(75)
    expect(g.best).toBe(100)
    expect(g.howOften).toBeGreaterThan(0.3)
    expect(g.lastGoodDaysAgo).toBe(1)
    expect(gap(daysOf(3, () => 3), TODAY).typical).toBeNull()
  })

  it('says what moved this week against last, helpful direction positive', () => {
    const checkins = daysOf(13, () => 3).map((c) => (addDays(TODAY, -7) < c.day ? { ...c, answers: { ...c.answers, stress: 4 as Position } } : c))
    const m = movedThisWeek(checkins, TODAY)
    const stress = m.ingredients.find((x) => x.reading === 'stress')
    expect(stress?.delta).toBeCloseTo(-1, 10)
    expect(m.reading.delta).toBeLessThan(0)
    expect(movedThisWeek(daysOf(3, () => 3), TODAY).reading.delta).toBeNull()
  })
})

describe('catalogue health and the extension prompt', () => {
  const situation: Situation = { block: 'evening', target: 'mood', key: 'evening:mood', band: 'gettingBy', reading: 50, targetPosition: 2 }

  it('names an unreachable family with the filter that blocks it', () => {
    const health = catalogueHealth([], [], [situation])
    expect(health).toHaveLength(families.length)
    const money = health.find((h) => h.family === 'money')
    expect(money?.reachable).toBe(false)
    expect(money?.blocker).toBe('target')
    const study = health.find((h) => h.family === 'study')
    expect(study?.reachable).toBe(false)
    expect(study?.blocker).toBe('study')
    expect(health.find((h) => h.family === 'movement')?.reachable).toBe(true)
    expect(catalogueHealth([], [], []).every((h) => h.reachable)).toBe(true)
  })

  it('reads the fortnight’s situations from the offers and counts what each family was offered and did', () => {
    const offers = [offer(1, addDays(TODAY, -2), 'walk-ten'), offer(2, addDays(TODAY, -20), 'nap-ten', 'afternoon:energy', 'afternoon', 'energy')]
    const situations = recentSituations(offers, TODAY)
    expect(situations).toHaveLength(1)
    expect(situations[0].key).toBe('evening:mood')
    const health = catalogueHealth(offers, [done(1)], situations)
    expect(health.find((h) => h.family === 'movement')).toMatchObject({ offered: 1, done: 1 })
  })

  it('writes the extension prompt from the record and never names a private item', () => {
    const offers = [1, 2, 3].map((i) => offer(i, addDays(TODAY, -i), 'cyclic-sigh', 'evening:stress', 'evening', 'stress'))
    const health = catalogueHealth(offers, [], [situation])
    const text = extensionPromptText({ situations: [situation], offers, outcomes: [], health, stats: [], cardMoves: new Map() }, extensionPrompt.template)
    expect(text).toContain('THE RULES')
    expect(text).toContain('Five minutes of cyclic sighing: offered 3, done 0')
    expect(text).toContain('Money: target')
    expect(text).not.toContain('{situations')
    expect(text).not.toContain('Item one')
  })
})
