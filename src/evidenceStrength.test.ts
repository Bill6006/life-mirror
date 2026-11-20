import { describe, expect, it } from 'vitest'
import { GRADE_PHRASES, strengthRefusals, validateAsk, validateOutput } from './brainShared'
import type { Fact, FactSheet } from './factTypes'
import type { ClaimCard } from './libraryTypes'

// The forecast follow-ups, item 1 (2026-11-20, at the owner's word): where an Ask answer cites one of the person's own
// tests that has no call yet, a strength phrase ("strong evidence", "good evidence", "some evidence", "thin evidence")
// may stand only in a sentence that names research ("research", "studies" or "the library"), and the answer must then
// also say the test has "no call yet". Traced first, by ids and card grades only: six answers from 21 October to 16
// November said "strong evidence" of a grade-A card in a sentence naming no research, beside a test at no call yet.
// Stand-in facts and cards only.

const ladder = (level: string, id = 'ladder.walk-ten.mood'): Fact => ({ id, tags: [], text: 'Test: …', values: { level, direction: level === 'none' ? null : 'helps' } })
const sheetOf = (...facts: Fact[]) => ({ facts })
const card = (id: string, grade: ClaimCard['grade']): ClaimCard => ({ id, claim: 'A claim long enough to be a claim of its own.', domain: 'mood', tags: ['mood'], grade, replication: 'replicated', effect: 'an effect', population: 'adults', sources: [], caveats: 'none', app: 'a use', reviewed: '2026-09-25', status: 'admitted' })
const BARE = (phrases: string) => `says ${phrases} beside a test with no call yet, in a sentence that names no research: say it of the research ("research", "studies" or "the library")`
const UNSAID = 'says how strong the evidence is beside a test with no call yet, and not that the test has "no call yet": say so'
const FIXED = 'Research gives strong evidence that a short walk goes with better mood for most people. Your own test of it has no call yet, so a few more tries will tell.'
const SEEN = 'There is strong evidence that a short walk goes with better mood. Try a walk after lunch.'

describe('a strength phrase beside a test with no call yet (the forecast follow-ups, item 1)', () => {
  it('lets a strength phrase stand in a sentence that names research, the test said to have no call yet', () => {
    const f = ladder('none')
    expect(strengthRefusals(FIXED, [f.id], sheetOf(f))).toEqual([])
    for (const research of ['Studies give', 'The library gives']) {
      expect(strengthRefusals(`${research} strong evidence that a short walk goes with better mood. Your test has no call yet.`, [f.id], sheetOf(f))).toEqual([])
    }
  })

  it('refuses the answer as it was seen: the strength said in a sentence naming no research, and no word of the test’s call', () => {
    const f = ladder('none')
    expect(strengthRefusals(SEEN, [f.id], sheetOf(f))).toEqual([BARE('"strong evidence"'), UNSAID])
    // Saying "no call yet" elsewhere does not mend the sentence that names no research.
    expect(strengthRefusals(`${SEEN} Your own test of it has no call yet.`, [f.id], sheetOf(f))).toEqual([BARE('"strong evidence"')])
  })

  it('asks the answer to say "no call yet" where the strength is the research’s but the test’s call goes unsaid', () => {
    const f = ladder('none')
    expect(strengthRefusals('Research gives strong evidence that a short walk goes with better mood.', [f.id], sheetOf(f))).toEqual([UNSAID])
  })

  it('holds every grade phrase, each named once however often it is said', () => {
    const f = ladder('none')
    for (const phrase of Object.values(GRADE_PHRASES)) {
      expect(strengthRefusals(`There is ${phrase} for it. Your test has no call yet.`, [f.id], sheetOf(f))).toEqual([BARE(`"${phrase}"`)])
    }
    expect(strengthRefusals('There is strong evidence for it. There is Strong Evidence again. There is thin evidence too. Your test has no call yet.', [f.id], sheetOf(f))).toEqual([BARE('"strong evidence", "thin evidence"')])
  })

  it('binds only beside a cited test with no call yet: a called test, a test not cited, or none at all asks nothing new', () => {
    for (const level of ['early', 'likely', 'established']) {
      const f = ladder(level)
      expect(strengthRefusals(SEEN, [f.id], sheetOf(f)), level).toEqual([])
    }
    const open = ladder('none')
    expect(strengthRefusals(SEEN, ['week.today'], sheetOf(open))).toEqual([])
    expect(strengthRefusals(SEEN, ['week.today'], sheetOf())).toEqual([])
    // A test with no level read is a test with no call yet.
    const unread: Fact = { id: 'ladder.walk-ten.mood', tags: [], text: 'Test: …', values: {} }
    expect(strengthRefusals(SEEN, [unread.id], sheetOf(unread))).toEqual([BARE('"strong evidence"'), UNSAID])
  })

  it('is held by the validator on an Ask answer, ordinary and deep, and binds Ask alone', () => {
    const f = ladder('none')
    const walking = card('walking-mood', 'A')
    const sheet = { version: 1, day: '2026-11-20', builtAt: '2026-11-20T08:00:00.000Z', hour: 8, days: 120, facts: [f], said: [], shortlist: [], showPrivate: false } as unknown as FactSheet
    const ask = (text: string, deep = false) => validateAsk({ text, factIds: [f.id], cardIds: [walking.id], test: null, note: false }, sheet, [walking], 220, true, 'Does walking help my mood?', deep)
    for (const deep of [false, true]) {
      const seen = ask(SEEN, deep)
      expect(seen.ok).toBe(false)
      expect(seen.ok ? '' : seen.reason).toContain(BARE('"strong evidence"'))
      expect(seen.ok ? '' : seen.reason).toContain(UNSAID)
    }
    const fixed = ask(FIXED)
    expect(fixed.ok ? '' : fixed.reason).toBe('')
    expect(fixed.ok).toBe(true)
    // A day's line is held to its own rules, as before: the strength rule is Ask's.
    const line = validateOutput({ mode: 'observation', text: 'There is strong evidence that a short walk goes with better mood.', factIds: [f.id], cardIds: [walking.id] }, sheet, [walking])
    expect(line.ok ? '' : line.reason).toBe('')
    expect(line.ok).toBe(true)
  })
})
