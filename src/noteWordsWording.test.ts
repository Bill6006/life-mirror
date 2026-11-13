import { describe, expect, it } from 'vitest'
import { evidenceWordingRefusals, isAssociationFact, isNoteWordsFact, noteWordsRefusals, numberCount, patternWordingRefusals } from './brainShared'
import type { Fact, FactSheet } from './factTypes'

// A search of the notes for whole words (2026-11-13), as the answer's checker reads it: counts of notes are a share of
// the notes written, never how often a thing happens, and the answer names the words that were searched.

const WORDS = 'yell|yelled'
const cell = (id: string, standing: string, family = 6): Fact => ({ id, tags: [], text: `${standing}: of the 9 notes that hold “yell” or “yelled”, 6 were written in the evening; of all 84 notes, 30 were written in the evening.`, values: { k: 6, n: 30, restK: 3, m: 54, holding: 9, notes: 84, family, standing, direction: 'higher', split: 'checkin', cell: 'evening', words: WORDS, category: 'notes' } })
const ALL: Fact = { id: 'noteWords.all', tags: [], text: 'Your notes were searched for the whole words “yell” or “yelled”: 9 of the 84 notes written at check-ins hold them.', values: { holding: 9, notes: 84, kept: 0, family: 6, words: WORDS, category: 'notes' } }
const NOTE: Fact = { id: 'noteWords.note.2026-11-07.1', tags: [], text: '2026-11-07: at the evening check-in you wrote: “I yelled at the dog”', values: { words: WORDS, category: 'notes' } }
const PATTERN = cell('noteWords.checkin.evening', 'pattern')
const LEAD = cell('noteWords.weekday.6', 'lead')
const NONE = cell('noteWords.weekday.5', 'noPattern')
const FEW = cell('noteWords.weekday.4', 'tooFew')
const TABLE_PATTERN: Fact = { id: 'pattern.sleep.short.weekday.6', tags: [], text: 'A steady pattern: a short night, 7 of 26 on Saturdays, against 20 of 150 on other days.', values: { k: 7, n: 26, restK: 20, m: 150, family: 9, standing: 'pattern', direction: 'higher', category: 'dayRecord' } }
const TABLE_LEAD: Fact = { ...TABLE_PATTERN, id: 'pattern.sleep.short.weekday.5', values: { ...TABLE_PATTERN.values, standing: 'lead' } }
const SHEET: FactSheet = { version: 1, day: '2026-11-12', builtAt: '2026-11-12T20:00:00.000Z', hour: 20, days: 84, facts: [ALL, NOTE, PATTERN, LEAD, NONE, FEW, TABLE_PATTERN, TABLE_LEAD, { id: 'reading', tags: [], text: 'The last reading was 62.', values: { value: 62 } }] } as unknown as FactSheet
const why = (text: string, ids: string[], all = false) => noteWordsRefusals(text, ids, SHEET, all)

const USUAL = ['most likely', 'most often', 'usually', 'tends to', 'tend to', 'tended to']
const AHEAD = ['more often', 'less often', 'more likely', 'less likely', 'lowest', 'highest']

describe('a search of the notes, as the checker reads it', () => {
  it('knows its facts by their head, and counts them among the record’s associations', () => {
    expect(isNoteWordsFact('noteWords.all')).toBe(true)
    expect(isNoteWordsFact('noteWords.weekday.6')).toBe(true)
    expect(isNoteWordsFact('note.2026-11-07.evening')).toBe(false)
    expect(isNoteWordsFact('pattern.sleep.short.all')).toBe(false)
    expect(isAssociationFact('noteWords.all')).toBe(true)
    // A cause said over a count of notes is refused as over any association.
    expect(evidenceWordingRefusals('The evenings made you yell, because you were tired.', [ALL.id], [])).toHaveLength(1)
    expect(evidenceWordingRefusals('The evenings made you yell, because you were tired.', ['reading'], [])).toHaveLength(0)
  })

  it('asks nothing of an answer that cites no fact of the search', () => {
    for (const word of [...USUAL, ...AHEAD]) expect(why(`It is ${word} in the evening.`, ['reading', TABLE_LEAD.id]), word).toEqual([])
  })

  it('asks the answer to name at least one of the words searched, whole', () => {
    const missing = 'rests on a search of the notes without naming the words searched: name "yell" or "yelled"'
    expect(why('Nine of your 84 notes hold it.', [ALL.id])).toEqual([missing])
    // Cited through a note alone, or a cell alone, the same is asked.
    expect(why('One note of 7 November says so.', [NOTE.id])).toEqual([missing])
    expect(why('A steady pattern: 6 of the 30 evening notes.', [PATTERN.id])).toEqual([missing])
    // One of the words is enough; inside a longer word it is not named.
    expect(why('"Yelled" is in 9 of your 84 notes.', [ALL.id])).toEqual([])
    expect(why('The word yell is in 9 of your 84 notes.', [ALL.id])).toEqual([])
    expect(why('Yelling is in 9 of your 84 notes.', [ALL.id])).toEqual([missing])
  })

  it('refuses each usual-case word at every standing: a count of notes is never how often a thing happens', () => {
    for (const fact of [ALL, NOTE, FEW, NONE, LEAD, PATTERN]) {
      for (const word of USUAL) {
        const got = why(`"Yelled" ${word} shows in evening notes: a lead, with 6 comparisons looked at.`, [fact.id])
        expect(got.filter((r) => r.includes('of a count of notes: it is a share of the notes written')), `${fact.id} ${word}`).toHaveLength(1)
        expect(got.find((r) => r.includes('of a count of notes'))).toContain(`"${word}"`)
      }
    }
    // Only a cited fact of the pattern table that stands as a steady pattern lets them stand, as since Phase 4.
    expect(why('"Yelled" is in 9 notes, and a short night is most likely on Saturdays.', [ALL.id, TABLE_PATTERN.id])).toEqual([])
    expect(why('"Yelled" is in 9 notes, and a short night is most likely on Fridays.', [ALL.id, TABLE_LEAD.id])).toHaveLength(1)
  })

  it('lets one time be put ahead of another under a steady pattern, and at a lead said as a lead with how many were looked at', () => {
    for (const word of AHEAD) expect(why(`Notes holding "yelled" were written ${word} in the evening.`, [PATTERN.id]), word).toEqual([])
    for (const word of AHEAD) expect(why(`A lead: notes holding "yelled" were written ${word} on Saturdays. 6 comparisons were looked at.`, [LEAD.id]), word).toEqual([])
    expect(why('Notes holding "yelled" were written more often on Saturdays. 6 comparisons were looked at.', [LEAD.id])).toEqual(['cites a count of notes that stands at a lead without saying so: say "a lead"'])
    expect(why('A lead: notes holding "yelled" were written more often on Saturdays.', [LEAD.id])).toEqual(['cites a lead without saying how many comparisons were looked at: 6'])
    expect(why('A lead: notes holding "yelled" were written more often on Saturdays. Six comparisons were looked at.', [LEAD.id])).toEqual([])
    // The number is the family's own: 16 or 60 is not 6.
    for (const wrong of ['16 comparisons', '60 comparisons', '6.5 comparisons']) expect(why(`A lead: "yelled", more often on Saturdays. ${wrong} were looked at.`, [LEAD.id]), wrong).toHaveLength(1)
    // A steady pattern cited beside a lead: the strongest standing governs.
    expect(why('Notes holding "yelled" were written more often in the evening.', [PATTERN.id, LEAD.id])).toEqual([])
  })

  it('with no lead cited refuses the words that put one time ahead of another', () => {
    for (const fact of [ALL, NOTE, FEW, NONE]) {
      for (const word of AHEAD) {
        const got = why(`Notes holding "yelled" were written ${word} on Fridays.`, [fact.id])
        expect(got, `${fact.id} ${word}`).toHaveLength(1)
        expect(got[0]).toContain(`"${word}"`)
        expect(got[0]).toContain('of a count of notes with no clear pattern yet')
      }
      // The counts themselves may always be said.
      expect(why('"Yelled" is in 9 of your 84 notes; 6 of them were written in the evening. No clear pattern yet.', [fact.id])).toEqual([])
    }
    // A cited table cell at a lead answers for those words under its own rule, which then asks for its own.
    expect(why('"Yelled" is in 9 notes. A lead: a short night was recorded more often on Fridays; 9 comparisons were looked at.', [ALL.id, TABLE_LEAD.id])).toEqual([])
    expect(patternWordingRefusals('"Yelled" is in some notes. A short night was recorded more often on Fridays.', [ALL.id, TABLE_LEAD.id], SHEET)).toHaveLength(2)
  })

  it('names every offending word at once when asked for all', () => {
    const got = why('It usually and most often shows more often and less likely on Fridays.', [NONE.id], true)
    expect(got).toHaveLength(3)
    expect(got[0]).toContain('without naming the words searched')
    expect(got[1]).toContain('"usually", "most often"')
    expect(got[2]).toContain('"more often", "less likely"')
  })

  it('counts "k of n" once for the voice where a search of the notes is cited, as beside a table fact', () => {
    const text = '"Yelled" is in 9 of the 84 notes; 6 of the 30 evening notes hold it.'
    // Two pairs: two readings, not four numbers.
    expect(numberCount(text, SHEET, [ALL.id, PATTERN.id])).toBe(2)
    expect(numberCount(text, SHEET, ['reading'])).toBe(4)
  })
})
