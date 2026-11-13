import { describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { extensionPrompt, families, moveById } from './catalogue'
import type { CheckIn, DayContext, ForecastScore, Offer, Outcome } from './db'
import type { Situation } from './offers'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { bestConditions, bestDays, catalogueHealth, dayReading, extensionPromptText, gap, movedThisWeek, recentSituations, scorecard } from './weekly'

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
    const sc = scorecard(scores, checkins, null)
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
    expect(b).toMatchObject({ silent: true, days: 12, threshold: 20, top: [], family: 0 })
    expect(bestConditions(daysOf(12, () => 3), [], [], [], TODAY)).toBeNull()
  })

  it('counts each condition only over the days the record can speak for it, split into what you control and what you don’t', () => {
    // Thirty days: every third day reads high. A walk was offered and done on those days, and never offered on the rest.
    const checkins = daysOf(30, (i) => (i % 3 === 0 ? 5 : 3))
    const highDays = [...new Set(checkins.map((c) => c.day))].filter((d) => dayReading(checkins, d) === 100)
    const offers = highDays.map((d, i) => offer(i + 1, d, 'walk-ten'))
    const outcomes = offers.map((o) => done(o.id as number))
    const contexts: DayContext[] = highDays.map((day) => ({ day, weekday: 2, withHer: false, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '20:00', changed: false, createdAt: '' }))
    const all = bestConditions(checkins, offers, outcomes, contexts, TODAY)
    expect(all?.days).toBe(30)
    expect(all?.top).toHaveLength(3)
    // A day the walk was never offered is in neither count: ten days known, where every one of the thirty used to count.
    const walk = all?.controlled.find((d) => d.label === moveById('walk-ten').name)
    expect(walk).toMatchObject({ moveId: 'walk-ten', onBest: 3, ofBest: 3, onOthers: 7, ofOthers: 7 })
    // A day with no context row says nothing about who was around.
    expect(all?.uncontrolled.find((d) => d.label === 'she was away')).toMatchObject({ onBest: 3, ofBest: 3, onOthers: 7, ofOthers: 7 })
    // An evening chip is known wherever the evening was completed, and a weekday on every day.
    expect(all?.controlled.find((d) => d.label === 'a nap')).toMatchObject({ onBest: 0, ofBest: 3, onOthers: 0, ofOthers: 27 })
    expect(all?.uncontrolled.filter((d) => /day$/.test(d.label) && d.ofBest + d.ofOthers === 30)).toHaveLength(7)
  })

  it('counts a chip added in stage 3, item 5, only over the days that showed it (Rule 2)', () => {
    // Thirty days, every third high and the last nine's three highest; Something sweet shown on the last nine evenings
    // only, and tapped on their three high days. Counted over every day, the days without it would be twenty-seven.
    // (Outside a while today was the example until 2026-10-21; time in nature's own count is in nature.test.ts.)
    const checkins = daysOf(30, (i) => (i % 3 === 0 ? (i <= 9 ? 5 : 4) : 3)).map((c) => {
      const i = Math.round((Date.parse(TODAY) - Date.parse(c.day)) / 86_400_000)
      if (c.block !== 'evening' || i > 9) return c
      return { ...c, extras: { chipsShown: { sweet: true as const }, ...(i % 3 === 0 ? { sweet: true as const } : {}) } }
    })
    const sweet = bestConditions(checkins, [], [], [], TODAY)?.controlled.find((d) => d.label === 'something sweet')
    expect(sweet).toMatchObject({ onBest: 3, ofBest: 3, onOthers: 0, ofOthers: 6 })
  })
})

// Best days under the one standard (Phase 3, 2026-11-12). Ninety days whose nine best keep no rhythm and fall on
// no one weekday. A nap was tapped on eight of the nine and on nine of the other eighty-one evenings; a late dinner
// on two of the nine and eighteen of the others, the same rate on both sides.
const BEST = [3, 12, 20, 29, 37, 46, 54, 65, 78]
const NAPS = [3, 12, 20, 29, 37, 46, 54, 65, 8, 17, 26, 35, 44, 53, 62, 71, 86]
const DINNERS = [3, 46, 1, 6, 11, 16, 21, 26, 31, 36, 41, 51, 56, 61, 66, 71, 76, 81, 86, 90]
function ninety(days = 90): CheckIn[] {
  return daysOf(days, (i) => (BEST.includes(i) ? 5 : 3)).map((c) => {
    const i = Math.round((Date.parse(TODAY) - Date.parse(c.day)) / 86_400_000)
    if (c.block !== 'evening') return c
    return { ...c, extras: { ...(NAPS.includes(i) ? { napped: true as const } : {}), ...(DINNERS.includes(i) ? { dinner: true as const } : {}) } }
  })
}

describe('best-days under the one standard', () => {
  it('shows a condition once it stands at a lead among everything compared, with its counts, and says a lead at most', () => {
    const checkins = ninety()
    const b = bestDays(checkins, [], [], [], TODAY)
    expect(b).toMatchObject({ silent: false, days: 90, family: 9 })
    expect(b.top).toHaveLength(9)
    // Eight of nine best days against nine of eighty-one others: past chance even after the family's correction, and still said as a lead.
    expect(b.controlled).toEqual([{ label: 'a nap', onBest: 8, ofBest: 9, onOthers: 9, ofOthers: 81, standing: 'lead', direction: 'higher' }])
    // Nothing outside your control stands out: no weekday holds more than two of the nine.
    expect(b.uncontrolled).toEqual([])
    expect(b.own).toEqual([])
  })

  it('never lists a private item in best days, even one tapped on every evening that carried the nap (the agreed fix 9, stated 2026-11-13)', () => {
    // The same record, with a private item on screen every evening and tapped on exactly the evenings that carried the nap.
    const checkins = ninety().map((c) => (c.block === 'evening' ? { ...c, extras: { ...(c.extras ?? {}), privateShown: { '7': true as const }, ...(c.extras?.napped ? { private: { '7': true as const } } : {}) } } : c))
    expect(checkins.filter((c) => c.extras?.private?.['7']).length).toBeGreaterThan(8)
    const b = bestDays(checkins, [], [], [], TODAY)
    // The probe that can say yes: the nap, tapped on the same evenings, is listed. The private item is no condition at all.
    expect(b.controlled.map((c) => c.label)).toEqual(['a nap'])
    expect(JSON.stringify(b)).not.toContain('private')
  })

  it('keeps a condition with the same rate on both sides, or too few days, off the list, and says where each stands', () => {
    const all = bestConditions(ninety(), [], [], [], TODAY)
    // Two of nine against eighteen of eighty-one: both 22 in 100.
    expect(all?.controlled.find((d) => d.label === 'a late or heavy dinner')).toMatchObject({ onBest: 2, ofBest: 9, onOthers: 18, ofOthers: 81, standing: 'noPattern' })
    // Never tapped: under five occurrences, nothing is tested.
    expect(all?.controlled.find((d) => d.label === 'nothing landed')).toMatchObject({ onBest: 0, ofBest: 9, standing: 'tooFew' })
    // One family: the nap, the dinner and the seven weekdays were tested together, and that is the number a lead says.
    expect(all?.family).toBe(9)
    expect(all?.uncontrolled.filter((d) => d.standing !== 'tooFew')).toHaveLength(7)
  })

  it('says nothing stands out while the top tenth holds fewer than eight days, where the four largest differences used to show', () => {
    // Seventy days: the top tenth is seven, one short of the eight a side the standard needs. The nap is on all seven.
    const b = bestDays(ninety(70), [], [], [], TODAY)
    expect(b.top).toHaveLength(7)
    expect(b).toMatchObject({ silent: false, family: 0, controlled: [], uncontrolled: [] })
    const nap = bestConditions(ninety(70), [], [], [], TODAY)?.controlled.find((d) => d.label === 'a nap')
    expect(nap).toMatchObject({ onBest: 7, ofBest: 7, standing: 'tooFew' })
  })

  it('shows at most four in a list, the largest difference first', () => {
    // Five of your own chips, each tapped on the best days and on fewer and fewer of them; the first on all nine.
    const own = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, label: `chip ${id}`, createdAt: '2026-01-01T00:00:00.000Z', removedAt: null }))
    const checkins = ninety().map((c) => {
      const i = Math.round((Date.parse(TODAY) - Date.parse(c.day)) / 86_400_000)
      if (c.block !== 'evening') return c
      const at = BEST.indexOf(i)
      const tapped = Object.fromEntries(own.filter((_, n) => at >= 0 && at < 9 - n).map((chip) => [chip.id, true as const]))
      return { ...c, extras: { ...c.extras, chipsShown: Object.fromEntries(own.map((chip) => [`own:${chip.id}`, true as const])), own: tapped } }
    })
    const b = bestDays(checkins, [], [], [], TODAY, new Set(), own)
    expect(b.own?.map((d) => [d.label, d.onBest, d.standing])).toEqual([['chip a', 9, 'lead'], ['chip b', 8, 'lead'], ['chip c', 7, 'lead'], ['chip d', 6, 'lead']])
    // Your own chips are in the same family as the rest.
    expect(b.family).toBe(14)
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
    // A family with nothing live (the Partner reps before their Green; the speaking Path's, its row's alone) has no row.
    expect(health).toHaveLength(families.filter((f) => f.id !== 'partner' && f.id !== 'speaking').length)
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
    const text = extensionPromptText({ situations: [situation], offers, outcomes: [], health, held: [] }, extensionPrompt.template)
    expect(text).toContain('THE RULES')
    expect(text).toContain('Five minutes of cyclic sighing: offered 3, done 0')
    expect(text).toContain('Money: target')
    expect(text).not.toContain('{situations')
    expect(text).not.toContain('Item one')
  })
})
