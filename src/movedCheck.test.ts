import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import { CHALLENGER } from './challenger'
import { copy } from './copy'
import { dayAndMonth } from './heldPairs'
import { CHECK_CLEAR, CHECK_LOOKS, CHECK_MIN_DAYS, checkStopsChallenger, lookAt, movedCheck, movedForecasts, readingOf, verdictOf } from './movedCheck'
import { alternating, checkDays, checkPair } from './movedCheckTesting'
import { movedCheckLines } from './weeklyScreen'

// Batch 3 (2026-11-21): the moved forecasts' check, on hand-made rows, by the reading rule frozen before any real result
// was read. Every number of the rule is stated here as a literal, so a change to one of the code's constants is caught by
// a test that does not read it.

const START = '2026-12-01'
const after = (days: number): string => addDays(START, days)
/** The check read on the day after `days` days of stand-in rows. */
const check = (gains: readonly number[], perDay = 4, extra?: { forecasts: ReturnType<typeof checkDays>['forecasts']; scores: ReturnType<typeof checkDays>['scores'] }) => {
  const rows = checkDays(gains, START, perDay)
  const forecasts = [...rows.forecasts, ...(extra?.forecasts ?? [])]
  const scores = [...rows.scores, ...(extra?.scores ?? [])]
  return (today: string) => movedCheck(forecasts, scores, today)
}

describe('the rule’s numbers, as frozen', () => {
  it('reads three looks, at 40, 80 and 120 moved forecasts, each on at least 10 days, deciding early at a clearance of 2.4, the challenger’s own margin', () => {
    expect(CHECK_LOOKS).toEqual([40, 80, 120])
    expect(CHECK_MIN_DAYS).toBe(10)
    expect(CHECK_CLEAR).toBe(2.4)
    expect(CHALLENGER.minClear).toBe(2.4)
  })
})

describe('the moved forecasts it reads', () => {
  it('reads a moved forecast that carries its plain forecast, once scored on a day before today, set beside that plain forecast', () => {
    const { forecast, score } = checkPair(START, 0, 3)
    const [m, ...rest] = movedForecasts([forecast], [score], after(1))
    expect(rest).toEqual([])
    expect(m).toEqual({ day: START, block: 'morning', horizon: 0, scoredOn: START, actual: 50, miss: 1, plainMiss: 4, held: true, plainHeld: true })
    // Scored today: not yet.
    expect(movedForecasts([forecast], [score], START)).toEqual([])
  })

  it('reads no row moved before the plain forecast was kept, none not moved, none with a broken plain forecast, and none not scored', () => {
    const { forecast, score } = checkPair(START, 0, 3)
    const today = after(1)
    expect(movedForecasts([{ ...forecast, plain: undefined }], [score], today)).toEqual([])
    expect(movedForecasts([{ ...forecast, adj: 0 }], [score], today)).toEqual([])
    expect(movedForecasts([{ ...forecast, adj: undefined, adjBy: undefined }], [score], today)).toEqual([])
    expect(movedForecasts([{ ...forecast, plain: { point: Number.NaN, lo: 45, hi: 55 } }], [score], today)).toEqual([])
    expect(movedForecasts([forecast], [], today)).toEqual([])
    expect(movedForecasts([forecast], [{ ...score, horizon: 1 }], today)).toEqual([])
  })

  it('says whether each range held, the moved one and the plain one, from what was logged', () => {
    // The plain point missed by 9, outside its range of 5 either side; the moved one by 1, inside.
    const a = checkPair(START, 0, 8)
    expect(movedForecasts([a.forecast], [a.score], after(1))[0]).toMatchObject({ miss: 1, plainMiss: 9, held: true, plainHeld: false })
    // The moved point missed by 7, outside; the plain one by 1, inside.
    const b = checkPair(START, 0, -6)
    expect(movedForecasts([b.forecast], [b.score], after(1))[0]).toMatchObject({ miss: 7, plainMiss: 1, held: false, plainHeld: true })
    // A range's ends count as held.
    const c = checkPair(START, 0, 4, { width: 1 })
    expect(movedForecasts([c.forecast], [c.score], after(1))[0]).toMatchObject({ miss: 1, plainMiss: 5, held: true, plainHeld: false })
  })

  it('comes in the order the forecasts were scored, then by the day forecast, the check-in and the horizon', () => {
    const rows = [checkPair(after(0), 2, 1, { scoredOn: after(3) }), checkPair(after(1), 3, 1, { scoredOn: after(2) }), checkPair(after(2), 0, 1), checkPair(after(1), 2, 1, { scoredOn: after(2) }), checkPair(after(0), 1, 1), checkPair(after(0), 0, 1)]
    const read = movedForecasts(rows.map((r) => r.forecast), rows.map((r) => r.score), after(5))
    expect(read.map((r) => `${r.scoredOn} ${r.day} ${r.block} ${r.horizon}`)).toEqual([
      `${after(0)} ${after(0)} morning 0`,
      `${after(0)} ${after(0)} afternoon 0`,
      `${after(2)} ${after(1)} morning 1`,
      `${after(2)} ${after(1)} evening 0`,
      `${after(2)} ${after(2)} morning 0`,
      // Forecast first, scored last: it comes last.
      `${after(3)} ${after(0)} evening 0`,
    ])
  })
})

describe('the three looks', () => {
  it('reads none under 40, nor at 40 lying on 9 days; the first look at 40 on 10 days', () => {
    const fewer = checkDays(Array(10).fill(1), START, 4)
    const thirtyNine = movedForecasts(fewer.forecasts.slice(0, 39), fewer.scores.slice(0, 39), after(20))
    expect(thirtyNine).toHaveLength(39)
    expect(lookAt(thirtyNine, 40)).toBeNull()
    // 40 on 9 days: four days of five and five of four.
    const nine = [...checkDays(Array(4).fill(1), START, 5).forecasts, ...checkDays(Array(5).fill(1), after(4), 4).forecasts]
    const nineScores = [...checkDays(Array(4).fill(1), START, 5).scores, ...checkDays(Array(5).fill(1), after(4), 4).scores]
    const onNine = movedForecasts(nine, nineScores, after(20))
    expect(onNine).toHaveLength(40)
    expect(lookAt(onNine, 40)).toBeNull()
    // One more on a tenth day: the look is read, at that day's end.
    const tenth = checkPair(after(9), 0, 1)
    const onTen = movedForecasts([...nine, tenth.forecast], [...nineScores, tenth.score], after(20))
    expect(lookAt(onTen, 40)).toMatchObject({ cut: after(9) })
    expect(lookAt(onTen, 40)?.rows).toHaveLength(41)
    // 40 on 10 days of four.
    const ten = movedForecasts(fewer.forecasts, fewer.scores, after(20))
    expect(lookAt(ten, 40)).toMatchObject({ cut: after(9) })
    expect(lookAt(ten, 40)?.rows).toHaveLength(40)
  })

  it('takes whole scoring days, and none scored later', () => {
    // Nine days of four, then a tenth of six: the tenth day brings 36 to 42, and the look takes all 42.
    const a = checkDays(Array(9).fill(1), START, 4)
    const b = checkDays([1], after(9), 6)
    const c = checkDays([-50, -50], after(10), 4)
    const rows = movedForecasts([...a.forecasts, ...b.forecasts, ...c.forecasts], [...a.scores, ...b.scores, ...c.scores], after(30))
    const look = lookAt(rows, 40)
    expect(look?.cut).toBe(after(9))
    expect(look?.rows).toHaveLength(42)
    expect(look?.rows.every((r) => r.scoredOn <= after(9))).toBe(true)
  })

  it('counts the different days forecast, not the days scored', () => {
    // Ten days forecast, every one scored on a single later day: the look is read.
    const ten = checkDays(Array(10).fill(1), START, 4)
    const late = ten.scores.map((s) => ({ ...s, scoredOn: after(12) }))
    expect(lookAt(movedForecasts(ten.forecasts, late, after(13)), 40)).toMatchObject({ cut: after(12) })
    // Forty on seven days forecast, scored over ten days: not yet.
    const seven = checkDays(Array(7).fill(1), START, 6)
    const spread = seven.scores.slice(0, 40).map((s, i) => ({ ...s, scoredOn: after(10 + (i % 10)) }))
    const rows = movedForecasts(seven.forecasts.slice(0, 40), spread, after(30))
    expect(rows).toHaveLength(40)
    expect(new Set(rows.map((r) => r.scoredOn)).size).toBe(10)
    expect(lookAt(rows, 40)).toBeNull()
  })
})

describe('a look’s reading', () => {
  it('counts, averages the misses, and works out the gain and the clearance as the challenger does: the day gains’ sum over the root of their count times their variance', () => {
    // Day gains alternating 5.5 and −0.5 over ten days: sum 25, variance 90 / 9 = 10, clearance 25 / √(10 × 10) = 2.5.
    const rows = movedForecasts(checkDays(alternating(2.5, 10), START).forecasts, checkDays(alternating(2.5, 10), START).scores, after(10))
    const r = readingOf(rows, 1, after(9))
    expect(r).toMatchObject({ look: 1, cut: after(9), readOn: after(10), n: 40, days: 10, held: 40, plainHeld: 35 })
    expect(r.clear).toBeCloseTo(2.5, 12)
    expect(r.gain).toBeCloseTo(25 / 40, 12)
    expect(r.miss).toBeCloseTo((5 * 1 + 5 * 1.5 + 30 * 1) / 40, 12)
    expect(r.plainMiss).toBeCloseTo((5 * 6.5 + 5 * 1 + 30 * 1) / 40, 12)
  })

  it('has no clearance under two days, nor with no spread between the day gains', () => {
    const one = movedForecasts(checkDays([3], START, 4).forecasts, checkDays([3], START, 4).scores, after(1))
    expect(readingOf(one, 1, START).clear).toBeNull()
    const even = checkDays(Array(10).fill(2), START, 4)
    expect(readingOf(movedForecasts(even.forecasts, even.scores, after(10)), 1, after(9)).clear).toBeNull()
  })
})

describe('the verdict', () => {
  it('reads a look by the frozen rule: 2.4 clear either way decides at the first two looks, the gain alone at the third', () => {
    expect(verdictOf({ look: 1, gain: 0.5, clear: 2.4 })).toBe('keep')
    expect(verdictOf({ look: 1, gain: 0.5, clear: 2.399 })).toBe('watch')
    expect(verdictOf({ look: 2, gain: -0.5, clear: -2.4 })).toBe('off')
    expect(verdictOf({ look: 2, gain: -0.5, clear: -2.399 })).toBe('watch')
    expect(verdictOf({ look: 1, gain: 0.5, clear: null })).toBe('watch')
    expect(verdictOf({ look: 3, gain: 0.001, clear: null })).toBe('keep')
    expect(verdictOf({ look: 3, gain: 0.001, clear: -3 })).toBe('keep')
    expect(verdictOf({ look: 3, gain: 0, clear: 3 })).toBe('off')
    expect(verdictOf({ look: 3, gain: -0.001, clear: null })).toBe('off')
  })

  it('has none before the first look, and says the first look’s count', () => {
    expect(check(alternating(5, 9))(after(9))).toEqual({ scored: 36, reading: null, verdict: null, next: 40 })
    expect(movedCheck([], [], START)).toEqual({ scored: 0, reading: null, verdict: null, next: 40 })
  })

  it('at the first look: keep it at a clearance of 2.4 or more, switch it off at −2.4 or less, and otherwise keep watching for the second', () => {
    const at = (a: number) => check(alternating(a, 10))(after(10))
    expect(at(2.41)).toMatchObject({ verdict: 'keep', next: null, reading: { look: 1, n: 40 } })
    expect(at(2.41).reading?.clear).toBeCloseTo(2.41, 10)
    expect(at(2.39)).toMatchObject({ verdict: 'watch', next: 80, reading: { look: 1 } })
    expect(at(-2.39)).toMatchObject({ verdict: 'watch', next: 80 })
    expect(at(-2.41)).toMatchObject({ verdict: 'off', next: null, reading: { look: 1 } })
  })

  it('at the second look, the same rule over all 80', () => {
    // Watching at the first look (a clearance of 1); over twenty days the clearance is 50 / √(20 × 225 / 19), about 3.25.
    const gains = [...alternating(1, 10), ...alternating(4, 10)]
    expect(check(gains)(after(10))).toMatchObject({ verdict: 'watch', next: 80 })
    const second = check(gains)(after(20))
    expect(second).toMatchObject({ verdict: 'keep', next: null, reading: { look: 2, n: 80, days: 20 } })
    expect(second.reading?.clear).toBeCloseTo(50 / Math.sqrt(20 * (225 / 19)), 10)
    const worse = check([...alternating(-1, 10), ...alternating(-4, 10)])(after(20))
    expect(worse).toMatchObject({ verdict: 'off', reading: { look: 2 } })
  })

  it('at the third look: keep it where the moved forecasts came closer on average, and otherwise switch it off, a tie too', () => {
    const third = (a: number) => check(alternating(a, 30))(after(30))
    expect(check(alternating(0.1, 30))(after(20))).toMatchObject({ verdict: 'watch', next: 120 })
    expect(third(0.1)).toMatchObject({ verdict: 'keep', next: null, reading: { look: 3, n: 120 } })
    expect(third(0.1).reading?.gain).toBeCloseTo(3 / 120, 12)
    expect(third(-0.1)).toMatchObject({ verdict: 'off', reading: { look: 3 } })
    expect(third(0).reading?.gain).toBe(0)
    expect(third(0)).toMatchObject({ verdict: 'off', reading: { look: 3 } })
  })

  it('keeps a final verdict: no later look is read once it says keep it or switch it off', () => {
    const kept = check([...alternating(3, 10), ...Array(30).fill(-40)])(after(40))
    expect(kept).toMatchObject({ verdict: 'keep', reading: { look: 1, n: 40 }, scored: 160 })
    const stopped = check([...alternating(-3, 10), ...Array(30).fill(40)])(after(40))
    expect(stopped).toMatchObject({ verdict: 'off', reading: { look: 1, n: 40 }, scored: 160 })
    expect(checkStopsChallenger(stopped)).toBe(true)
    expect(checkStopsChallenger(kept)).toBe(false)
    expect(checkStopsChallenger(check(alternating(1, 10))(after(10)))).toBe(false)
    expect(checkStopsChallenger(movedCheck([], [], START))).toBe(false)
  })

  it('never changes a reading once made: forecasts scored on the day of reading, or after, are not in it', () => {
    const today = after(10)
    const before = check(alternating(1, 10))(today)
    // Strongly against, scored today and tomorrow: today's reading is as it was, and so is the first look's tomorrow.
    const late = checkDays([-60, -60], after(10), 4)
    const later = check(alternating(1, 10), 4, late)
    expect(later(today)).toEqual(before)
    expect(later(after(12)).reading).toEqual(before.reading)
    expect(later(after(12)).scored).toBe(48)
  })

  it('counts no row moved before the plain forecast was kept', () => {
    const rows = checkDays(Array(10).fill(1), START, 4)
    const old = rows.forecasts.map((f, i) => (i % 4 === 3 ? { ...f, plain: undefined } : f))
    expect(movedCheck(old, rows.scores, after(10))).toMatchObject({ scored: 30, reading: null, verdict: null })
  })
})

describe('the Scorecard’s lines', () => {
  it('until the first look: how many are scored, and when they are first set beside the plain forecast', () => {
    expect(movedCheckLines(movedCheck([], [], START))).toEqual(['Forecasts moved and scored: 0', 'They are set beside the plain forecast once 40 are scored, on at least 10 days.'])
    expect(movedCheckLines(check(alternating(1, 9))(after(9)))[0]).toBe('Forecasts moved and scored: 36')
  })

  it('from a look: the look’s counts and misses in the contract’s shape, the verdict as written down beforehand, and what follows', () => {
    const day = dayAndMonth(after(10))
    expect(movedCheckLines(check(alternating(1, 10), 4, checkDays([1, 1], after(10), 4))(after(12)))).toEqual([
      'Forecasts moved and scored: 40',
      'Range held: 40 of 40 moved, 40 of 40 plain',
      'Average miss: 1.3 moved, 1.5 plain',
      'Read as written down beforehand: keep watching.',
      `Read on ${day}; read again once 80 are scored (48 so far).`,
    ])
    expect(movedCheckLines(check(alternating(2.5, 10))(after(11))).slice(1)).toEqual(['Range held: 40 of 40 moved, 35 of 40 plain', 'Average miss: 1.1 moved, 1.7 plain', 'Read as written down beforehand: keep it.', `Read on ${day}; it is not read again.`])
    expect(movedCheckLines(check(alternating(-2.5, 10))(after(11))).slice(3)).toEqual(['Read as written down beforehand: switch it off.', `Read on ${day}: forecasts written from then on are not moved.`])
  })

  it('names no condition: no private item, no note event', () => {
    const lines = movedCheckLines(check(alternating(-2.5, 10))(after(11))).join(' ')
    expect(lines).not.toMatch(/private|note|sleep|evening/i)
  })
})

describe('the document of the rule (docs/forecast-check.md)', () => {
  const doc = readFileSync(new URL('../docs/forecast-check.md', import.meta.url), 'utf8')

  it('states the code’s numbers, and the frozen rule’s fingerprint', () => {
    expect(doc).toContain(`**Look 1** at ${CHECK_LOOKS[0]} moved forecasts scored, **look 2** at ${CHECK_LOOKS[1]}, **look 3** at ${CHECK_LOOKS[2]}.`)
    expect(doc).toContain(`on at least ${CHECK_MIN_DAYS} different days`)
    expect(doc).toContain(`| 1 and 2 | clearance ${CHECK_CLEAR} or more | clearance −${CHECK_CLEAR} or less |`)
    expect(doc).toContain('| 3 | gain above 0 | gain 0 or below |')
    expect(doc).toContain('520036607665158a0e1eb92f4e015baf6015dbd5d46cfb10f66f37a63158b1c0')
  })

  it('gives the Scorecard’s words exactly as the app says them', () => {
    const m = copy.weekly.movedCheck
    for (const words of [m.scored, m.pending, m.held, m.miss, m.verdict, m.watching, m.kept, m.stopped]) expect(doc).toContain('`' + words + '`')
    for (const verdict of Object.values(m.verdicts)) expect(doc).toContain('`' + verdict + '`')
  })
})
