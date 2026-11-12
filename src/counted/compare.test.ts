import { describe, expect, it } from 'vitest'
import { ALPHA, compare, difference, MIN_OCCURRENCES, MIN_SIDE, permutationP, ratesBy, scaledDifference, SHUFFLES, standings, STRETCH_DAYS, stretchesOf, WORTH_POINTS, WORTH_RATE, WORTH_STEPS, type CellPoint, type Compared, type Point } from './compare'

// The comparison core, on hand-worked cases (the counted foundation, 2026-11-12; in shadow). Every number a rule
// rests on is stated here as a literal, so a change to the rule's constant turns a test red.

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10)
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
const WEEKDAYS = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']

describe('the numbers the standard rests on', () => {
  it('are eight a side, five occurrences, ten points, 0.4 of a step, fifteen points between rates, 0.05, 2,000 shuffles and 14-day stretches', () => {
    expect([MIN_SIDE, MIN_OCCURRENCES, WORTH_POINTS, WORTH_STEPS, WORTH_RATE, ALPHA, SHUFFLES, STRETCH_DAYS]).toEqual([8, 5, 10, 0.4, 0.15, 0.05, 2000, 14])
  })

  it('counts stretches in whole fortnights from the earliest occasion', () => {
    expect(stretchesOf(['2026-01-15', '2026-01-01', '2026-01-14', '2026-02-01'])).toEqual([1, 0, 0, 2])
    expect(stretchesOf([])).toEqual([])
  })
})

describe('the chance check', () => {
  const measure = (outcomes: number[]) => (flags: readonly boolean[]) => [mean(outcomes.filter((_, i) => flags[i])) - mean(outcomes.filter((_, i) => !flags[i]))]

  it('gives the share of arrangements at least as far from zero as the real one, in either direction', () => {
    // Four occasions, two with: of the six arrangements, two differ by ten (one each way) and four by nothing. One in three.
    const p = permutationP([true, true, false, false], [[0, 1, 2, 3]], measure([10, 10, 0, 0]), 7, 20_000, Infinity)[0]
    expect(p).toBeGreaterThan(0.32)
    expect(p).toBeLessThan(0.347)
  })

  it('shuffles only inside a stretch: a difference that is all one fortnight against another is no evidence', () => {
    // The first eight occasions without and low, the last eight with and high, in two strata: no shuffle can move a label.
    const flags = [...Array(8).fill(false), ...Array(8).fill(true)]
    const outcomes = [...Array(8).fill(0), ...Array(8).fill(10)]
    expect(permutationP(flags, [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15]], measure(outcomes), 7)).toEqual([1])
    // In one stratum the same sixteen are far past chance: 2 arrangements in 12,870.
    expect(permutationP(flags, [flags.map((_, i) => i)], measure(outcomes), 7)[0]).toBeLessThan(0.002)
  })

  it('is the same every time for the same seed', () => {
    const flags = [true, false, true, false, true, false, true, false, false, false]
    const outcomes = [5, 3, 6, 2, 7, 4, 5, 5, 1, 6]
    const strata = [flags.map((_, i) => i)]
    expect(permutationP(flags, strata, measure(outcomes), 42)).toEqual(permutationP(flags, strata, measure(outcomes), 42))
  })

  it('stops early only when the chance is already past 0.05, so the standing is a full run’s', () => {
    const flags = [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false]
    const outcomes = [5, 3, 6, 2, 7, 4, 5, 5, 1, 6, 4, 4, 3, 7, 6, 2]
    const strata = [flags.map((_, i) => i)]
    let measured = 0
    const counted = (f: readonly boolean[]) => {
      measured++
      return measure(outcomes)(f)
    }
    const early = permutationP(flags, strata, counted, 9)[0]
    const full = permutationP(flags, strata, measure(outcomes), 9, 2000, Infinity)[0]
    expect(full).toBeGreaterThan(0.05)
    expect(early).toBeGreaterThan(0.05)
    // Not before a hundred shuffles have reached the real difference: the real arrangement, then at least a hundred more.
    expect(measured).toBeGreaterThanOrEqual(101)
    expect(measured).toBeLessThan(2001)
    // Stopped at the hundredth: 101 over the shuffles so far plus one, never under 101 in 2,001.
    expect(early).toBeGreaterThanOrEqual(101 / 2001)
  })
})

describe('with against without', () => {
  /**
   * Sixteen evenings over two fortnights, eight with the thing and eight without, each side at one level. In each
   * fortnight the evenings with it are the 1st, 2nd, 4th and 8th days, and those without the 3rd, 6th, 10th and 13th:
   * in order, with with without with without with without without. Turned round, only the arrangement as it fell
   * sets all four against all four, so the two fortnights together do so once in sixty-four.
   */
  const WITH_DAYS = [0, 1, 3, 7, 14, 15, 17, 21]
  const WITHOUT_DAYS = [2, 5, 9, 12, 16, 19, 23, 26]
  const sides = (withLevel: number, withoutLevel: number, n = 8, m = 8): Point[] => [
    ...WITH_DAYS.slice(0, n).map((d) => ({ day: day(d), event: true, outcome: withLevel })),
    ...WITHOUT_DAYS.slice(0, m).map((d) => ({ day: day(d), event: false, outcome: withoutLevel })),
  ]

  it('compares nothing under eight usable occasions on either side', () => {
    expect(compare(sides(70, 50, 7, 8), { id: 'x', worth: 10 })).toMatchObject({ n: 7, m: 8, enough: false, p: null, diff: 20 })
    expect(compare(sides(70, 50, 8, 7), { id: 'x', worth: 10 })).toMatchObject({ enough: false, p: null })
    const tested = compare(sides(70, 50), { id: 'x', worth: 10 })
    expect(tested).toMatchObject({ n: 8, m: 8, enough: true, diff: 20 })
    // One arrangement in sixty-four: 0.0156.
    expect(tested.p).toBeGreaterThan(0.008)
    expect(tested.p).toBeLessThan(0.03)
    expect(standings([compare(sides(70, 50, 7, 8), { id: 'x', worth: 10 })])[0]).toMatchObject({ standing: 'tooFew', family: 0 })
  })

  it('never gives a chance of nothing: the least 2,000 arrangements can say is one in 2,001', () => {
    // Four fortnights, the thing on the 1st, 2nd, 4th and 8th day of each and twenty points higher there: one
    // arrangement in 38,416 matches the real one, and none of these 2,000 does.
    const points: Point[] = Array.from({ length: 56 }, (_, d) => ({ day: day(d), event: [0, 1, 3, 7].includes(d % 14), outcome: [0, 1, 3, 7].includes(d % 14) ? 70 : 50 }))
    expect(compare(points, { id: 'x', worth: 10 })).toMatchObject({ n: 16, m: 40, diff: 20, p: 1 / 2001 })
  })

  it('turns a fortnight’s labels round, so a streak stays a streak: two streaks on two good weeks are two coincidences, not fourteen', () => {
    // Two fortnights. In each, the first week had the thing every evening and read 60; the second week never, and read 40.
    const points: Point[] = Array.from({ length: 28 }, (_, d) => ({ day: day(d), event: d % 14 < 7, outcome: d % 14 < 7 ? 60 : 40 }))
    const c = compare(points, { id: 'x', worth: 10 })
    expect(c).toMatchObject({ n: 14, m: 14, diff: 20 })
    // Turned round, a fortnight shows the whole difference in two places of fourteen (as it fell, and seven days on,
    // the other way up), so both fortnights agree in 2 arrangements of 196: 0.0102. Dealt out afresh, the same
    // twenty-eight evenings would read as fourteen separate coincidences: about one in twenty million.
    expect(c.p).toBeGreaterThan(0.005)
    expect(c.p).toBeLessThan(0.02)
  })

  it('turns in the order of the days, however the occasions were listed', () => {
    // Listed with every evening with the thing first, then every evening without; and the same sixteen listed day by day.
    const listed = sides(70, 50)
    const byDay = [...listed].sort((a, b) => a.day.localeCompare(b.day))
    expect(compare(listed, { id: 'x', worth: 10 }).p).toBe(compare(byDay, { id: 'x', worth: 10 }).p)
  })

  it('ranks an arrangement by its difference against its own spread, so one that leans on a single evening counts for less', () => {
    const band = (name: string, withThing: number[], without: number[], from: number): Point[] => [...withThing.map((outcome, i) => ({ day: day(from + i), event: true, outcome, band: name })), ...without.map((outcome, i) => ({ day: day(from + 10 + i), event: false, outcome, band: name }))]
    // Ten points in each band: one evening against five in band a, three against three in band b.
    const spreadOut = [...band('a', [60], [50, 50, 50, 50, 50], 0), ...band('b', [40, 40, 40], [30, 30, 30], 20)]
    expect(difference(spreadOut)).toBe(10)
    // (1 x 10 + 3 x 10) over the root of 1 x (1/1 + 1/5) + 9 x (1/3 + 1/3): 40 over the root of 7.2.
    expect(scaledDifference(spreadOut)).toBeCloseTo(40 / Math.sqrt(7.2), 10)
    // The same ten points resting on band a's one evening alone: 10 over the root of 1.2, and so ranked lower.
    const leaning = [...band('a', [60], [50, 50, 50, 50, 50], 0), ...band('b', [], [30, 30, 30, 40, 40, 40], 20)]
    expect(difference(leaning)).toBe(10)
    expect(scaledDifference(leaning)).toBeCloseTo(10 / Math.sqrt(1.2), 10)
    // Without bands: the two means' difference over the root of one over each side's count.
    expect(scaledDifference([{ day: day(0), event: true, outcome: 60 }, { day: day(1), event: true, outcome: 60 }, ...[2, 3, 4, 5].map((d) => ({ day: day(d), event: false, outcome: 50 }))])).toBeCloseTo(10 / Math.sqrt(0.75), 10)
  })

  it('calls a difference a pattern only at a size worth saying: ten points, not nine', () => {
    expect(standings([compare(sides(59, 50), { id: 'x', worth: 10 })])[0]).toMatchObject({ standing: 'noPattern', direction: 'higher' })
    expect(standings([compare(sides(60, 50), { id: 'x', worth: 10 })])[0]).toMatchObject({ standing: 'pattern', direction: 'higher', family: 1 })
    // Lower is said as lower, and is as much a pattern.
    expect(standings([compare(sides(40, 50), { id: 'x', worth: 10 })])[0]).toMatchObject({ standing: 'pattern', direction: 'lower' })
  })

  it('never reads one fortnight against another as a pattern', () => {
    // Eight evenings without, then, a fortnight later, eight with and twenty points higher.
    const points: Point[] = [...Array.from({ length: 8 }, (_, i) => ({ day: day(i), event: false, outcome: 40 })), ...Array.from({ length: 8 }, (_, i) => ({ day: day(14 + i), event: true, outcome: 60 }))]
    const c = compare(points, { id: 'x', worth: 10 })
    expect(c).toMatchObject({ enough: true, diff: 20, p: 1 })
    expect(standings([c])[0].standing).toBe('noPattern')
  })

  it('takes the difference like for like where the occasions carry a starting band', () => {
    const points: Point[] = [
      // Band a: with 60 and 70, without 50: fifteen higher, on the smaller side's one.
      { day: day(0), event: true, outcome: 60, band: 'a' },
      { day: day(1), event: true, outcome: 70, band: 'a' },
      { day: day(2), event: false, outcome: 50, band: 'a' },
      // Band b: with 40, without 30 and 50: no difference.
      { day: day(3), event: true, outcome: 40, band: 'b' },
      { day: day(4), event: false, outcome: 30, band: 'b' },
      { day: day(5), event: false, outcome: 50, band: 'b' },
      { day: day(5), event: false, outcome: 40, band: 'b' },
      // Band c holds one side alone, and is left out.
      { day: day(6), event: true, outcome: 99, band: 'c' },
    ]
    expect(difference(points)).toBe(7.5)
    // No band shared: nothing to compare.
    expect(difference([{ day: day(0), event: true, outcome: 60, band: 'a' }, { day: day(1), event: false, outcome: 50, band: 'b' }])).toBeNull()
    // Without bands, the two means.
    expect(difference([{ day: day(0), event: true, outcome: 60 }, { day: day(1), event: false, outcome: 50 }, { day: day(2), event: false, outcome: 40 }])).toBe(15)
  })

  it('gives the same chance every time it is drawn', () => {
    const points = sides(55, 50).map((p, i) => ({ ...p, outcome: p.outcome + (i % 5) * 3 }))
    expect(compare(points, { id: 'chip.dinner', worth: 10 })).toEqual(compare(points, { id: 'chip.dinner', worth: 10 }))
  })
})

describe('when is it most likely', () => {
  /** A thing recorded once a day for `days` days from a Thursday, happening on the weekdays named. */
  const byWeekday = (days: number, on: (weekday: string, n: number) => boolean): CellPoint[] => Array.from({ length: days }, (_, n) => ({ day: day(n), cell: WEEKDAYS[n % 7], happened: on(WEEKDAYS[n % 7], n) }))

  it('says each cell as k of n against the rest, and tests none under eight in the cell', () => {
    // Four weeks: eight occurrences in all, enough of those, and only four occasions in each weekday's cell.
    const four = ratesBy(byWeekday(28, (w) => w === 'Mon' || w === 'Tue'), { id: 'x', within: 'stretch', cells: WEEKDAYS })
    const monday = four.find((c) => c.cell === 'Mon')
    expect(monday).toMatchObject({ k: 4, n: 4, restK: 4, m: 24, enough: false, p: null })
    expect(monday?.diff).toBeCloseTo(1 - 4 / 24, 10)
    expect(four.every((c) => !c.enough)).toBe(true)
  })

  it('finds a thing that happens on one weekday alone, and no other weekday beside it', () => {
    const cells = ratesBy(byWeekday(56, (w) => w === 'Mon'), { id: 'x', within: 'stretch', cells: WEEKDAYS })
    const stood = standings(cells)
    expect(cells.find((c) => c.cell === 'Mon')).toMatchObject({ k: 8, n: 8, restK: 0, m: 48, diff: 1, enough: true })
    expect(stood.map((s) => s.standing)).toEqual(['noPattern', 'noPattern', 'noPattern', 'noPattern', 'pattern', 'noPattern', 'noPattern'])
    expect(stood[4]).toMatchObject({ direction: 'higher', family: 7 })
  })

  it('tests nothing for a thing that happened fewer than five times in all', () => {
    const cells = ratesBy(byWeekday(56, (w, n) => w === 'Mon' && n < 28), { id: 'x', within: 'stretch', cells: WEEKDAYS })
    expect(cells.find((c) => c.cell === 'Mon')).toMatchObject({ k: 4, n: 8 })
    expect(cells.every((c) => !c.enough && c.p === null)).toBe(true)
  })

  it('shuffles the check-ins of a day among themselves: an evening habit is found', () => {
    const points: CellPoint[] = Array.from({ length: 30 }, (_, n) => ['morning', 'afternoon', 'evening'].map((cell) => ({ day: day(n), cell, happened: cell === 'evening' && n < 20 }))).flat()
    const cells = ratesBy(points, { id: 'x', within: 'day', cells: ['morning', 'afternoon', 'evening'] })
    expect(cells[2]).toMatchObject({ k: 20, n: 30, restK: 0, m: 60 })
    expect(standings(cells)[2]).toMatchObject({ standing: 'pattern', direction: 'higher', family: 3 })
  })

  it('and a day’s own doing can never pass for a check-in’s', () => {
    // Twenty days answered only in the evening, the thing there each time; twenty days answered morning and afternoon, never there.
    const points: CellPoint[] = [
      ...Array.from({ length: 20 }, (_, n) => ({ day: day(n), cell: 'evening', happened: true })),
      ...Array.from({ length: 20 }, (_, n) => [{ day: day(20 + n), cell: 'morning', happened: false }, { day: day(20 + n), cell: 'afternoon', happened: false }]).flat(),
    ]
    const cells = ratesBy(points, { id: 'x', within: 'day', cells: ['morning', 'afternoon', 'evening'] })
    expect(cells[2]).toMatchObject({ k: 20, n: 20, diff: 1, enough: true, p: 1 })
    expect(standings(cells).map((s) => s.standing)).toEqual(['noPattern', 'noPattern', 'noPattern'])
  })

  /** Eight weeks from a Thursday, three check-ins a day; the thing at all three check-ins of the days numbered here. */
  const threeADay = (onDays: readonly number[]): CellPoint[] => Array.from({ length: 56 }, (_, n) => [0, 1, 2].map(() => ({ day: day(n), cell: WEEKDAYS[n % 7], happened: onDays.includes(n) }))).flat()

  it('moves whole days together: a thing that repeats within its day cannot pass for a weekday’s', () => {
    // Four days carried it, one in each fortnight: two Mondays (days 4 and 32), a Wednesday (20) and a Thursday (42).
    // By check-ins that reads 6 of 24 on Mondays against 6 of 144, which single check-ins shuffled about would call
    // rare (about 4 in 1,000). By days it is two Mondays of four days: each fortnight's one day falls on one of its
    // two Mondays with chance 2 in 14, and two or more of the four do so with chance 0.10.
    const cells = ratesBy(threeADay([4, 20, 32, 42]), { id: 'x', within: 'stretch', cells: WEEKDAYS })
    const monday = cells[4]
    expect(monday).toMatchObject({ cell: 'Mon', k: 6, n: 24, restK: 6, m: 144, enough: true })
    expect(monday.p).toBeGreaterThan(0.07)
    expect(monday.p).toBeLessThan(0.14)
    expect(standings(cells)[4].standing).toBe('noPattern')
  })

  it('refuses a day that carries two cells where whole days change places', () => {
    const points = threeADay([4, 20, 32, 42])
    points[1] = { ...points[1], cell: 'Mon' }
    expect(() => ratesBy(points, { id: 'x', within: 'stretch', cells: WEEKDAYS })).toThrow('one cell for each day')
  })
})

describe('the standings of a family', () => {
  const tested = (id: string, p: number, diff: number): Compared => ({ id, n: 20, m: 20, diff, enough: true, p, worth: 10 })

  it('corrects across the family by Holm: what clears chance alone is a lead, and after the correction a pattern', () => {
    // 0.01 times three is 0.03; 0.03 times two is 0.06; 0.04 keeps the 0.06 before it.
    const stood = standings([tested('a', 0.01, 12), tested('b', 0.04, 12), tested('c', 0.03, -12), { id: 'd', n: 3, m: 20, diff: 30, enough: false, p: null, worth: 10 }])
    expect(stood.map((s) => s.standing)).toEqual(['pattern', 'lead', 'lead', 'tooFew'])
    expect(stood.map((s) => s.direction)).toEqual(['higher', 'higher', 'lower', 'higher'])
    expect(stood.map((s) => s.family)).toEqual([3, 3, 3, 3])
    expect(stood[0].adjusted).toBeCloseTo(0.03, 10)
    expect(stood[1].adjusted).toBeCloseTo(0.06, 10)
    expect(stood[3].adjusted).toBeNull()
  })

  it('keeps a comparison too small to say in the family’s count: its size was seen, so it still pays for the correction', () => {
    const stood = standings([tested('small', 0.001, 2), tested('a', 0.02, 12)])
    // Alone, 0.02 would be a pattern; beside one more tested comparison it is 0.02 times one after 0.001 times two: still under 0.05.
    expect(stood.map((s) => s.standing)).toEqual(['noPattern', 'pattern'])
    // Beside three more, 0.02 is corrected past 0.05: a lead.
    const wide = standings([tested('small', 0.9, 2), tested('s2', 0.8, 1), tested('s3', 0.7, 3), tested('a', 0.02, 12)])
    expect(wide[3]).toMatchObject({ standing: 'lead', family: 4 })
    expect(wide[3].adjusted).toBeCloseTo(0.08, 10)
  })

  it('says no pattern for a chance over 0.05 whatever the size, and names no direction for no difference', () => {
    expect(standings([tested('a', 0.051, 40)])[0].standing).toBe('noPattern')
    expect(standings([tested('a', 0.05, 40)])[0].standing).toBe('pattern')
    expect(standings([tested('a', 0.5, 0)])[0].direction).toBe('none')
  })
})
