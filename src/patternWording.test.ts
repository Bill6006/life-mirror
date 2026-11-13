import { describe, expect, it } from 'vitest'
import { AHEAD_WORDS, evidenceWordingRefusals, isAssociationFact, isTableFact, numberCount, patternWordingRefusals, USUAL_WORDS, validateAsk } from './brainShared'
import type { Fact, FactSheet } from './factTypes'

// The counted-pattern wording rule and the count-pair rule (2026-11-13): an answer that cites the pattern table's facts
// says a comparison no more firmly than its standing, and a count behind a rate is one reading for the voice.

const cell = (id: string, standing: string, family = 9): Fact => ({ id, tags: [], text: `${standing}: a short night, 7 of 26 on Saturdays, against 20 of 150 on other days.`, values: { k: 7, n: 26, restK: 20, m: 150, pct: 27, restPct: 13, family, standing, direction: 'higher', category: 'dayRecord' } })
const whole: Fact = { id: 'pattern.sleep.short.all', tags: [], text: 'A short night: recorded at 27 of 176 days.', values: { occurrences: 27, known: 176, family: 9, category: 'dayRecord' } }
const level: Fact = { id: 'pattern.level.weekday.1', tags: [], text: 'Check-ins on Mondays read 52 out of 100 on average.', values: { mean: 52, n: 24, restMean: 61, restN: 150, category: 'dayRecord' } }
const PATTERN = cell('pattern.sleep.short.weekday.6', 'pattern')
const LEAD = cell('pattern.sleep.short.weekday.5', 'lead')
const NONE = cell('pattern.sleep.short.weekday.4', 'noPattern')
const FEW = cell('pattern.sleep.short.weekday.3', 'tooFew')
const SHEET: FactSheet = { version: 1, day: '2026-11-12', builtAt: '2026-11-12T20:00:00.000Z', hour: 20, days: 176, facts: [PATTERN, LEAD, NONE, FEW, whole, level, { id: 'reading', tags: [], text: 'The last reading was 62.', values: { value: 62 } }] } as unknown as FactSheet
const why = (text: string, ids: string[], all = false) => patternWordingRefusals(text, ids, SHEET, all)

const USUAL = ['most likely', 'most often', 'usually', 'tends to', 'tend to', 'tended to']
const AHEAD = ['more often', 'less often', 'more likely', 'less likely', 'lowest', 'highest']

describe('the counted-pattern wording rule', () => {
  it('knows the table’s facts by their head, and counts them among the record’s associations', () => {
    expect(isTableFact('pattern.sleep.short.weekday.6')).toBe(true)
    expect(isTableFact('assoc.nap.energy')).toBe(false)
    expect(isAssociationFact('pattern.sleep.short.weekday.6')).toBe(true)
    // A cause said over a counted pattern is refused as over any association.
    expect(evidenceWordingRefusals('Saturdays cost you sleep, because you stay up.', [PATTERN.id], [])).toHaveLength(1)
    expect(evidenceWordingRefusals('Saturdays cost you sleep, because you stay up.', ['reading'], [])).toHaveLength(0)
  })

  it('asks nothing of an answer that cites no pattern fact', () => {
    for (const word of [...USUAL, ...AHEAD]) expect(why(`A short night is ${word} on Saturdays.`, ['reading']), word).toEqual([])
  })

  it('lets every word stand under a steady pattern', () => {
    for (const word of [...USUAL, ...AHEAD]) expect(why(`A short night is ${word} on Saturdays.`, [PATTERN.id]), word).toEqual([])
    // A lead cited beside a steady pattern: the strongest standing governs.
    expect(why('A short night is most often on Saturdays.', [PATTERN.id, LEAD.id])).toEqual([])
  })

  it('at a lead refuses each usual-case word, and asks for the word lead and how many were looked at', () => {
    for (const word of USUAL) {
      const got = why(`A short night ${word} fall on Fridays: a lead, with 9 comparisons looked at.`, [LEAD.id])
      expect(got, word).toHaveLength(1)
      expect(got[0], word).toContain(`"${word}"`)
      expect(got[0]).toContain('a lead, not yet a pattern')
    }
    // The words that put one time ahead of another are a lead's own.
    for (const word of AHEAD) expect(why(`A lead: a short night was recorded ${word} on Fridays. 9 comparisons were looked at.`, [LEAD.id]), word).toEqual([])
    expect(why('A short night was recorded more often on Fridays. 9 comparisons were looked at.', [LEAD.id])).toEqual(['cites a comparison that stands at a lead without saying so: say "a lead"'])
    expect(why('A lead: a short night was recorded more often on Fridays.', [LEAD.id])).toEqual(['cites a lead without saying how many comparisons were looked at: 9'])
    expect(why('A lead: a short night was recorded more often on Fridays. Nine comparisons were looked at.', [LEAD.id])).toEqual([])
    // The number must be the family's own, as a number of its own: 19 or 90 or 9.5 is not 9.
    for (const wrong of ['19 comparisons', '90 comparisons', '9.5 comparisons', '09:00']) expect(why(`A lead: more often on Fridays. ${wrong} were looked at.`, [LEAD.id]), wrong).toHaveLength(1)
    // A family of twenty-one, written as words or in digits; and twenty alone is not it.
    const wide = { facts: [cell('pattern.sweet.weekday.2', 'lead', 21)] }
    expect(patternWordingRefusals('A lead: more often on Tuesdays. Twenty-one comparisons were looked at.', ['pattern.sweet.weekday.2'], wide)).toEqual([])
    expect(patternWordingRefusals('A lead: more often on Tuesdays. 21 comparisons were looked at.', ['pattern.sweet.weekday.2'], wide)).toEqual([])
    expect(patternWordingRefusals('A lead: more often on Tuesdays. Twenty comparisons were looked at.', ['pattern.sweet.weekday.2'], wide)).toHaveLength(1)
  })

  it('with no lead cited refuses the usual-case words and the words that put one time ahead of another', () => {
    for (const fact of [NONE, FEW, whole, level]) {
      for (const word of USUAL) expect(why(`A short night is ${word} on Thursdays.`, [fact.id]), `${fact.id} ${word}`).toHaveLength(1)
      for (const word of AHEAD) expect(why(`A short night is ${word} on Thursdays.`, [fact.id]), `${fact.id} ${word}`).toHaveLength(1)
      expect(why('No clear pattern yet: 7 of 26 Thursdays, against 20 of 150 other days.', [fact.id]), fact.id).toEqual([])
    }
    // A kind's whole-kind fact and the level's averages carry no standing of their own, whatever else they say.
    expect(why('Mondays are usually your lowest days.', [level.id])).toHaveLength(2)
  })

  it('names every offending word at once when asked for all', () => {
    const got = why('It is usually more often on Thursdays, and most likely less often on Sundays.', [NONE.id], true)
    expect(got).toHaveLength(2)
    expect(got[0]).toContain('"usually", "most likely"')
    expect(got[1]).toContain('"more often", "less often"')
    expect(why('It is usually more often on Thursdays, and most likely less often on Sundays.', [NONE.id])[0]).not.toContain('most likely')
  })

  it('states its two lists as they are', () => {
    expect(USUAL_WORDS.source).toBe('\\b(most likely|most often|usually|tends? to|tended to)\\b')
    expect(AHEAD_WORDS.source).toBe('\\b((?:more|less) (?:often|likely)|lowest|highest)\\b')
  })
})

describe('a count behind a rate', () => {
  it('counts once for the voice where a counted pattern is cited, and as two numbers everywhere else', () => {
    const text = 'It was recorded on 7 of 26 Saturdays, against 20 of the 150 other days; 9 comparisons were looked at.'
    expect(numberCount(text, SHEET, [PATTERN.id])).toBe(3)
    expect(numberCount(text, SHEET, ['reading'])).toBe(5)
    expect(numberCount('7 of 26', SHEET, [whole.id])).toBe(1)
    // Only a pair written as a pair: a lone number, or two with other words between, count as before.
    expect(numberCount('7 Saturdays of the last 26', SHEET, [PATTERN.id])).toBe(2)
  })

  it('lets an answer say one comparison in a paragraph, with both counts, and still holds every number to the cited facts', () => {
    const answer = (text: string, factIds: string[]) => validateAsk({ text, factIds, cardIds: [], test: null, note: false }, SHEET, [], 120, true, 'When am I most likely to sleep short?', false)
    const said = 'Short nights cluster on Saturdays, and that stands as a steady pattern.\n\nIt was recorded on 7 of 26 Saturdays, against 20 of 150 other days.'
    expect(answer(said, [PATTERN.id])).toMatchObject({ ok: true })
    // The same words with no pattern fact cited would list four numbers in a paragraph: the pair rule is the pattern's alone.
    expect(numberCount(said.split('\n\n')[1], SHEET, ['reading'])).toBe(4)
    const wrong = answer(said.replace('7 of 26', '8 of 26'), [PATTERN.id])
    expect(wrong).toMatchObject({ ok: false })
    expect((wrong as { reason: string }).reason).toContain('the number 8 is not in the cited facts')
    // At a lead the same shape of answer is refused until it says so.
    const lead = answer(said, [LEAD.id])
    expect(lead).toMatchObject({ ok: false })
    expect((lead as { reason: string }).reason).toContain('say "a lead"')
  })
})
