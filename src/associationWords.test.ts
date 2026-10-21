import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { likeForLike, likeForLikeMatched, type Association, type DayPoint, type PrivateAssociation } from './associations'
import { caffeineLineWords, chipAnswerWords, coolingLineWords, eveningWorkoutWords, hardWorkoutWords, lastNightWords, ownChipLine, passiveLineWords, privateInlineWords, privateLineWords, socialLineWords, sweetAnswerWords, workoutLineWords } from './associationWords'
import { addDays } from './blocks'
import { factSheet } from './brainFlow'
import { db, type CheckIn } from './db'
import { factById } from './facts'
import { briefData } from './forecastFlow'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

// The record's own comparisons, said truthfully (2026-10-21, the owner's request before Item 3): "started the same", "ended
// the same" or "like for like" only when a band both sides share holds an outcome on each; otherwise what the record holds and
// that nothing is set against it yet; sparse stays uncertain; and no line ever reads as a cause.

const point = (day: number, band: DayPoint['band'], event: boolean, outcome: number | null): DayPoint => ({ day: `2026-09-${String(day).padStart(2, '0')}`, band, event, outcome })
/** Both sides observed in one band they share. */
const matched = likeForLike([point(1, 'solid', true, 70), point(2, 'solid', true, 74), point(3, 'solid', false, 60), point(4, 'solid', false, 62)])
/** Both sides observed, in bands they do not share: two averages, and nothing like for like. */
const apart = likeForLike([point(1, 'firing', true, 80), point(2, 'firing', true, 84), point(3, 'empty', false, 40), point(4, 'empty', false, 44)])
/** One evening, no morning after it yet. */
const sparse = likeForLike([point(1, 'solid', true, null)])

const MATCHING = /started the same|ended the same|like for like/i
const CAUSE = /\b(?:caused|because|made|lifted|helped|led to|thanks to|due to)\b/i
const priv = (a: Association, block: PrivateAssociation['block']): PrivateAssociation => ({ itemId: 1, name: 'A stand-in item', block, association: a, alternativeId: 'walk-ten' })

/** Every line the record's comparisons are said in, for one association. */
function everyLine(a: Association): string[] {
  return [
    chipAnswerWords(a),
    sweetAnswerWords(a),
    ownChipLine('A stand-in chip', a),
    passiveLineWords(a, 'Stress'),
    coolingLineWords(a, { blocks: 2, events: 3 }),
    socialLineWords(a),
    caffeineLineWords(a),
    workoutLineWords(a),
    eveningWorkoutWords(a, a),
    ...(['morning', 'afternoon', 'evening'] as const).flatMap((b) => [privateLineWords(priv(a, b), 'A ten-minute walk, now'), privateInlineWords(priv(a, b), 'A ten-minute walk, now')]),
  ]
}

describe('the record’s comparisons, said only when they hold', () => {
  it('knows a comparison like for like only when a band both sides share holds an outcome on each', () => {
    expect(matched).toMatchObject({ bands: 1, diff: 11 })
    expect(likeForLikeMatched(matched)).toBe(true)
    // Two averages are not a comparison: the bands they came from share nothing.
    expect(apart).toMatchObject({ bands: 0, diff: null, withEvent: { mean: 82 }, without: { mean: 42 } })
    expect(likeForLikeMatched(apart)).toBe(false)
    expect(likeForLikeMatched(sparse)).toBe(false)
    expect(likeForLikeMatched(likeForLike([]))).toBe(false)
  })

  it('lets a matched comparison say it, with both sides', () => {
    for (const line of everyLine(matched)) expect(line, line).toMatch(MATCHING)
    expect(chipAnswerWords(matched)).toBe('2 times before. The morning after read 72, against 61 after evenings that started the same (2 and 2).')
    expect(ownChipLine('A stand-in chip', matched)).toBe('A stand-in chip: 2 evenings marked. The morning after read 72, against 61 after evenings that started the same (2 and 2).')
  })

  it('never says it when no band was shared, and never sets the other side’s average against it', () => {
    for (const line of everyLine(apart)) {
      expect(line, line).not.toMatch(MATCHING)
      expect(line, line).toMatch(/nothing yet to set/)
      expect(line, line).not.toContain('42')
    }
    expect(chipAnswerWords(apart)).toBe('2 times before. The morning after read 82 (2); nothing yet to set it against.')
    expect(sweetAnswerWords(apart)).toBe('2 times before. The evening read 82 (2); nothing yet to set it against.')
    expect(socialLineWords(apart)).toBe('2 evenings marked; nothing yet to set the mornings after against. The recovery gap rides alongside the next evening’s move, and the evening after your church day.')
    // An evening workout is said like for like only when both its morning and its sleep compare.
    expect(eveningWorkoutWords(matched, apart)).not.toMatch(MATCHING)
  })

  it('keeps sparse evidence uncertain: the first time, or no morning after yet, never a comparison', () => {
    expect(chipAnswerWords(likeForLike([]))).toBe('First time recorded.')
    expect(chipAnswerWords(sparse)).toBe('Once before. No readings from the morning after yet.')
    expect(ownChipLine('A stand-in chip', sparse)).toBe('A stand-in chip: 1 evening marked, with no morning after logged yet.')
    for (const line of everyLine(sparse)) expect(line, line).not.toMatch(MATCHING)
  })

  it('says hard sessions against mornings that ended the same only when one measure compared', () => {
    expect(hardWorkoutWords(3, [{ reading: 'energy', diff: null }, { reading: 'mood', diff: null }])).toBe('3 days with a session rated too hard or taken close to failure; nothing yet to set the next mornings against.')
    expect(hardWorkoutWords(3, [{ reading: 'energy', diff: -0.4 }, { reading: 'mood', diff: null }])).toBe('3 days with a session rated too hard or taken close to failure. The next morning, against mornings after other days that ended the same: energy -0.4, mood not comparable yet, in anchor steps.')
  })

  it('says last night’s first time only when it is, and like for like only when it is', () => {
    expect(lastNightWords({ key: 'napped', with: null, without: null, n: 1, matched: false })).toBe('Last night carried a nap: the first time recorded, so nothing to set this morning against yet.')
    // Four evenings carried it, with no band shared: never "the first time", never "started the same".
    expect(lastNightWords({ key: 'napped', with: 82, without: 42, n: 4, matched: false })).toBe('Last night carried a nap; 4 evenings like it so far, nothing yet to set this morning against.')
    expect(lastNightWords({ key: 'napped', with: 72, without: 61, n: 4, matched: true })).toBe('Last night carried a nap. Mornings after evenings like it have read 72, against 61 after evenings that started the same (4).')
  })

  it('reads as an association in every line, never a cause', () => {
    for (const a of [matched, apart, sparse]) for (const line of everyLine(a)) expect(line, line).not.toMatch(CAUSE)
    for (const ln of [{ n: 1, matched: false }, { n: 4, matched: false }, { n: 4, matched: true }]) expect(lastNightWords({ key: 'napped', with: 70, without: 60, ...ln })).not.toMatch(CAUSE)
  })
})

describe('last night on the morning brief and the day’s sheet', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  /** A check-in at a level: the readings that read up at p, the ones that read down mirrored. */
  function ci(day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn {
    const answers: Answers = Object.fromEntries(blockReadings(block).map((id) => [id, 3]))
    for (const id of Object.keys(answers) as ReadingId[]) {
      if (['stress', 'overwhelm', 'irritation'].includes(id)) answers[id] = (6 - p) as Position
      else if (['mood', 'energy', 'focus'].includes(id)) answers[id] = p
    }
    return { day, block, answers, startedAt: '', completedAt: `${day}T21:00:00.000Z`, updatedAt: '', activeMs: 30_000, extras }
  }

  /** Six evenings and their mornings after: the napped ones high, the others low, so they share no band unless `level`. */
  function sixEvenings(level: boolean): CheckIn[] {
    return [1, 3, 5, 7, 9, 11].flatMap((d, i) => {
      const day = `2026-09-${String(d).padStart(2, '0')}`
      const napped = i % 2 === 0
      return [ci(day, 'evening', level ? 3 : napped ? 5 : 1, napped ? { napped: true } : undefined), ci(addDays(day, 1), 'morning', napped ? 4 : 2)]
    })
  }

  it('says nothing compared when last night’s evenings shared no band with the others, on the brief and on the sheet alike', async () => {
    await db.checkins.bulkAdd([...sixEvenings(false), ci('2026-09-14', 'evening', 5, { napped: true })])
    const brief = await briefData('2026-09-15')
    expect(brief.lastNight).toMatchObject({ key: 'napped', n: 4, matched: false })
    expect(lastNightWords(brief.lastNight!)).toBe('Last night carried a nap; 4 evenings like it so far, nothing yet to set this morning against.')
    const sheet = await factSheet('2026-09-15', new Date(2026, 8, 15, 8, 0))
    expect(factById(sheet, 'lastNight')?.text).toBe('Last night carried a nap; 4 evenings like it so far, nothing to compare yet.')
  })

  it('says the comparison once evenings like it and evenings without it started the same', async () => {
    await db.checkins.bulkAdd([...sixEvenings(true), ci('2026-09-14', 'evening', 3, { napped: true })])
    const brief = await briefData('2026-09-15')
    expect(brief.lastNight).toMatchObject({ key: 'napped', n: 4, matched: true })
    expect(lastNightWords(brief.lastNight!)).toMatch(/^Last night carried a nap\. Mornings after evenings like it have read \d+, against \d+ after evenings that started the same \(4\)\.$/)
    const sheet = await factSheet('2026-09-15', new Date(2026, 8, 15, 8, 0))
    expect(factById(sheet, 'lastNight')?.text).toMatch(/^Last night carried a nap; the mornings after evenings like it read \d+ against \d+ without, 4 evenings\.$/)
  })
})
