import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { likeForLike, likeForLikeMatched, type Association, type DayPoint, type PrivateAssociation } from './associations'
import { caffeineLineWords, chipAnswerWords, coolingLineWords, eveningWorkoutWords, hardWorkoutWords, lastNightWords, ownChipLine, passiveLineWords, privateInlineWords, privateLineWords, socialLineWords, sweetAnswerWords, workoutLineWords, type Stands } from './associationWords'
import type { Standing } from './counted/compare'
import { addDays } from './blocks'
import { briefForCard, factSheet } from './brainFlow'
import { db, type CheckIn } from './db'
import { factById, type NightStanding } from './facts'
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
/** Where last night's comparison stands in the sheet's family: a lead on nine evenings against forty unless said otherwise. */
const night = (over: Partial<NightStanding> = {}): NightStanding => ({ standing: 'lead', direction: 'higher', family: 28, n: 9, m: 40, diff: 6.2, ...over })

const MATCHING = /started the same|ended the same|like for like/i
const CAUSE = /\b(?:caused|because|made|lifted|helped|led to|thanks to|due to)\b/i
const priv = (a: Association, block: PrivateAssociation['block']): PrivateAssociation => ({ itemId: 1, name: 'A stand-in item', block, association: a, alternativeId: 'walk-ten' })
/** Every comparison on Evidence at one standing in a family of thirty-one: the words are written from the standing they are handed. */
const IDS = ['assoc.coolingOff', 'assoc.bigSocial', 'assoc.heavyCaffeine', 'assoc.workouts', 'assoc.eveningWorkout', 'assoc.eveningWorkout.sleep', 'assoc.hardWorkout.energy', 'assoc.hardWorkout.mood', 'private.1', 'private.1.morning', 'private.1.afternoon']
const at = (standing: Standing): Stands => new Map(IDS.map((id) => [id, { id, standing, direction: 'higher' as const, adjusted: null, family: 31 }]))
const LEAD = at('lead')

/** Every line the record's comparisons are said in, for one association. */
function everyLine(a: Association): string[] {
  return [
    chipAnswerWords(a),
    sweetAnswerWords(a),
    ownChipLine('A stand-in chip', a),
    passiveLineWords(a, 'Stress', 'lead'),
    coolingLineWords(a, { blocks: 2, events: 3 }, LEAD),
    socialLineWords(a, LEAD),
    caffeineLineWords(a, LEAD),
    workoutLineWords(a, LEAD),
    eveningWorkoutWords(a, a, LEAD),
    ...(['morning', 'afternoon', 'evening'] as const).flatMap((b) => [privateLineWords(priv(a, b), 'A ten-minute walk, now', true, LEAD), privateInlineWords(priv(a, b), 'A ten-minute walk, now', true), privateLineWords(priv(a, b), 'A ten-minute walk, now', false, LEAD), privateInlineWords(priv(a, b), 'A ten-minute walk, now', false)]),
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
    expect(socialLineWords(apart, LEAD)).toBe('2 evenings marked; nothing yet to set the mornings after against. The recovery gap rides alongside the next evening’s move, and the evening after your church day.')
    // An evening workout is said like for like only when both its morning and its sleep compare.
    expect(eveningWorkoutWords(matched, apart, LEAD)).not.toMatch(MATCHING)
  })

  it('keeps sparse evidence uncertain: the first time, or no morning after yet, never a comparison', () => {
    expect(chipAnswerWords(likeForLike([]))).toBe('First time recorded.')
    expect(chipAnswerWords(sparse)).toBe('Once before. No readings from the morning after yet.')
    expect(ownChipLine('A stand-in chip', sparse)).toBe('A stand-in chip: 1 evening marked, with no morning after logged yet.')
    for (const line of everyLine(sparse)) expect(line, line).not.toMatch(MATCHING)
  })

  it('says hard sessions against mornings that ended the same only when one measure compared', () => {
    expect(hardWorkoutWords(3, [{ id: 'energy', reading: 'energy', diff: null }, { id: 'mood', reading: 'mood', diff: null }], LEAD)).toBe('3 days with a session rated too hard or taken close to failure; nothing yet to set the next mornings against.')
    expect(hardWorkoutWords(3, [{ id: 'energy', reading: 'energy', diff: -0.4 }, { id: 'mood', reading: 'mood', diff: null }], LEAD)).toBe('3 days with a session rated too hard or taken close to failure. The next morning, against mornings after other days that ended the same: energy -0.4 (a lead, not yet a pattern; 31 looked at), mood not comparable yet, in anchor steps.')
    // A reading that is too few to compare is not said, and with every reading too few nothing is set against anything.
    expect(hardWorkoutWords(3, [{ id: 'energy', reading: 'energy', diff: -0.4 }, { id: 'mood', reading: 'mood', diff: 0.2 }], new Map([['assoc.hardWorkout.energy', { id: 'x', standing: 'tooFew', direction: 'lower', adjusted: null, family: 31 }], ['assoc.hardWorkout.mood', { id: 'y', standing: 'noPattern', direction: 'higher', adjusted: null, family: 31 }]]))).toContain('energy not comparable yet, mood +0.2 (no clear pattern yet), in anchor steps.')
    expect(hardWorkoutWords(3, [{ id: 'energy', reading: 'energy', diff: -0.4 }], at('tooFew'))).toBe('3 days with a session rated too hard or taken close to failure; nothing yet to set the next mornings against.')
  })

  it('says a reading on Evidence only with where the comparison stands, and none while it is too few or the comparisons failed', () => {
    // At a lead, a steady pattern and no clear pattern the line says its reading, the like-for-like difference and the standing's own words.
    expect(socialLineWords(matched, LEAD)).toBe('2 evenings marked. The morning after read 72, against 61 after evenings that started the same. Like for like, 11 points higher: a lead, not yet a pattern; 31 looked at. The recovery gap rides alongside the next evening’s move, and the evening after your church day.')
    expect(workoutLineWords(matched, at('pattern'))).toContain('The evening read 72, against 61 on days that started the same. Like for like, 11 points higher: a steady pattern.')
    expect(caffeineLineWords(matched, at('noPattern'))).toContain('Like for like, 11 points higher: no clear pattern yet.')
    expect(coolingLineWords(matched, { blocks: 2, events: 3 }, LEAD)).toContain('started the same. Like for like, 11 points higher: a lead, not yet a pattern; 31 looked at. Cooling off ran about 2 blocks (3 events).')
    expect(eveningWorkoutWords(matched, matched, LEAD)).toContain('out of 100. Like for like, 11 points higher: a lead, not yet a pattern; 31 looked at. Sleep quality, like for like, 11 points higher: a lead, not yet a pattern; 31 looked at.')
    // Too few to compare, or the comparisons failed: how many, and no reading at all.
    for (const stood of [at('tooFew'), null, new Map()] as Stands[]) {
      expect(socialLineWords(matched, stood)).toBe('2 evenings marked; nothing yet to set the mornings after against. The recovery gap rides alongside the next evening’s move, and the evening after your church day.')
      expect(coolingLineWords(matched, { blocks: 2, events: 3 }, stood)).not.toMatch(/read \d/)
      expect(caffeineLineWords(matched, stood)).toBe('2 mornings marked; nothing yet to set the afternoons after against.')
      expect(workoutLineWords(matched, stood)).not.toMatch(/read \d/)
      expect(eveningWorkoutWords(matched, matched, stood)).not.toMatch(/read \d/)
      expect(privateLineWords(priv(matched, 'evening'), 'A ten-minute walk, now', true, stood)).toBe('A stand-in item: nothing yet to set the mornings after against. An alternative: A ten-minute walk, now.')
    }
    // A passive item's card says its own word; its line says no reading while that word is too few.
    expect(passiveLineWords(matched, 'Stress', 'tooFew')).toBe('2 days it rode alongside and was done; nothing yet to set Stress the next morning against.')
    expect(passiveLineWords(matched, 'Stress', 'lead')).toContain('Stress the next morning read 72, against 61')
  })

  it('says last night’s first time only when it is, a difference only with where it stands, and too few with no reading', () => {
    expect(lastNightWords({ key: 'napped', with: null, without: null, n: 1, matched: false }, night({ standing: 'tooFew', direction: 'none', n: 0, m: 0, diff: null }))).toBe('Last night carried a nap: the first time recorded, so nothing to set this morning against yet.')
    // Four evenings carried it: under eight a side, so the line says how many and no reading (the one standard, 2026-11-12).
    expect(lastNightWords({ key: 'napped', with: 72, without: 61, n: 4, matched: true }, night({ standing: 'tooFew', n: 4, m: 20, diff: 11 }))).toBe('Last night carried a nap: 4 evenings like it so far, too few to compare yet.')
    // With no band shared there is no difference at all: the same words.
    expect(lastNightWords({ key: 'napped', with: 82, without: 42, n: 4, matched: false }, night({ standing: 'tooFew', n: 0, m: 0, diff: null }))).toBe('Last night carried a nap: 4 evenings like it so far, too few to compare yet.')
    expect(lastNightWords({ key: 'napped', with: 72, without: 61, n: 9, matched: true }, night())).toBe('Last night carried a nap. Mornings after evenings like it have read 6 points higher than after evenings that started the same (9 against 40). A lead, not yet a pattern · 28 looked at.')
    expect(lastNightWords({ key: 'napped', with: 50, without: 61, n: 9, matched: true }, night({ standing: 'pattern', direction: 'lower', diff: -11.4 }))).toBe('Last night carried a nap. Mornings after evenings like it have read 11 points lower than after evenings that started the same (9 against 40). A steady pattern.')
    expect(lastNightWords({ key: 'napped', with: 60, without: 61, n: 9, matched: true }, night({ standing: 'noPattern', diff: -1.2 }))).toContain('have read 1 point lower than after evenings that started the same (9 against 40). No clear pattern yet.')
    expect(lastNightWords({ key: 'napped', with: 60, without: 60, n: 9, matched: true }, night({ standing: 'noPattern', diff: 0.3 }))).toBe('Last night carried a nap. Mornings after evenings like it have read the same as after evenings that started the same (9 against 40). No clear pattern yet.')
    // The comparisons failed on this phone: what last night carried, and nothing of a reading.
    expect(lastNightWords({ key: 'napped', with: 72, without: 61, n: 9, matched: true }, null)).toBe('Last night carried a nap.')
  })

  it('names a private item only while the name switch is on, on Evidence and on the move card alike (2026-11-12)', () => {
    for (const a of [matched, apart, sparse]) {
      for (const b of ['morning', 'afternoon', 'evening'] as const) {
        const p = priv(a, b)
        expect(privateLineWords(p, 'A ten-minute walk, now', true, LEAD)).toContain('A stand-in item')
        expect(privateInlineWords(p, 'A ten-minute walk, now', true)).toContain('A stand-in item')
        const line = privateLineWords(p, 'A ten-minute walk, now', false, LEAD)
        const inline = privateInlineWords(p, 'A ten-minute walk, now', false)
        expect(line, line).not.toContain('A stand-in item')
        expect(inline, inline).not.toContain('A stand-in item')
        expect(line.startsWith('A private item'), line).toBe(true)
        expect(inline, inline).toContain('with a private item logged')
      }
    }
    expect(privateLineWords(priv(matched, 'evening'), 'A ten-minute walk, now', false, LEAD)).toBe('A private item: mornings after read 72, against 61 after evenings that started the same (2 and 2). Like for like, 11 points higher: a lead, not yet a pattern; 31 looked at. An alternative: A ten-minute walk, now.')
  })

  it('reads as an association in every line, never a cause', () => {
    for (const a of [matched, apart, sparse]) for (const line of everyLine(a)) expect(line, line).not.toMatch(CAUSE)
    for (const ln of [{ n: 1, matched: false }, { n: 4, matched: false }, { n: 4, matched: true }]) {
      for (const standing of ['tooFew', 'noPattern', 'lead', 'pattern'] as const) expect(lastNightWords({ key: 'napped', with: 70, without: 60, ...ln }, night({ standing }))).not.toMatch(CAUSE)
      expect(lastNightWords({ key: 'napped', with: 70, without: 60, ...ln }, null)).not.toMatch(CAUSE)
    }
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
    const card = await briefForCard('2026-09-15')
    expect(card.night).toMatchObject({ standing: 'tooFew', diff: null })
    expect(lastNightWords(card.lastNight!, card.night)).toBe('Last night carried a nap: 4 evenings like it so far, too few to compare yet.')
    const sheet = await factSheet('2026-09-15', new Date(2026, 8, 15, 8, 0))
    expect(factById(sheet, 'lastNight')?.text).toBe('Last night carried a nap; 4 evenings like it so far, nothing to compare yet.')
    expect(factById(sheet, 'lastNight')?.values).toMatchObject({ key: 'napped', n: 4, with: null, without: null, diff: null, standing: 'tooFew' })
  })

  it('says the comparison once evenings like it and evenings without it started the same', async () => {
    await db.checkins.bulkAdd([...sixEvenings(true), ci('2026-09-14', 'evening', 3, { napped: true })])
    const brief = await briefData('2026-09-15')
    expect(brief.lastNight).toMatchObject({ key: 'napped', n: 4, matched: true })
    // Three evenings with a morning after against three: far under eight a side, so no reading is said where two used to be.
    const card = await briefForCard('2026-09-15')
    expect(card.night).toMatchObject({ standing: 'tooFew', n: 3, m: 3 })
    expect(lastNightWords(card.lastNight!, card.night)).toBe('Last night carried a nap: 4 evenings like it so far, too few to compare yet.')
    const sheet = await factSheet('2026-09-15', new Date(2026, 8, 15, 8, 0))
    expect(factById(sheet, 'lastNight')?.text).toBe('Last night carried a nap. Too few to compare yet: mornings after a nap, 3 with it, 3 without.')
    expect(factById(sheet, 'lastNight')?.values).toMatchObject({ with: null, without: null, diff: null, standing: 'tooFew' })
  })

  it('gives last night’s comparison one standing on the brief, in the sheet’s last-night fact and in the sheet’s own fact for the same thing', async () => {
    // Four weeks of evenings that all started the same, a nap on eight of them in no rhythm and again last night; the mornings after a nap read 75, the others 25.
    const rows: CheckIn[] = []
    for (let back = 29; back >= 2; back--) {
      const day = addDays('2026-09-30', -back)
      const napped = [3, 4, 6, 10].includes((back - 1) % 14)
      rows.push(ci(day, 'evening', 3, napped ? { napped: true } : undefined), ci(addDays(day, 1), 'morning', napped ? 4 : 2))
    }
    await db.checkins.bulkAdd([...rows, ci('2026-09-29', 'evening', 3, { napped: true })])
    const card = await briefForCard('2026-09-30')
    expect(card.lastNight).toMatchObject({ key: 'napped', n: 9 })
    expect(card.night).toEqual({ standing: 'pattern', direction: 'higher', family: 1, n: 8, m: 20, diff: 50 })
    expect(lastNightWords(card.lastNight!, card.night)).toBe('Last night carried a nap. Mornings after evenings like it have read 50 points higher than after evenings that started the same (8 against 20). A steady pattern.')
    const sheet = await factSheet('2026-09-30', new Date(2026, 8, 30, 8, 0))
    const said = 'A steady pattern: mornings after a nap read 50 points higher, the good direction, like for like (8 with it, 20 without).'
    expect(factById(sheet, 'lastNight')?.text).toBe(`Last night carried a nap. ${said}`)
    expect(factById(sheet, 'assoc.napped')?.text).toBe(said)
    // One standing for one thing, wherever it is said.
    expect(factById(sheet, 'lastNight')?.values).toMatchObject({ key: 'napped', n: 9, with: 75, without: 25, diff: 50, standing: 'pattern', direction: 'higher', m: 1 })
    expect(factById(sheet, 'assoc.napped')?.values).toMatchObject({ standing: card.night?.standing, direction: card.night?.direction, m: card.night?.family })
  })
})
