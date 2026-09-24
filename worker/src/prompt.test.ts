import { describe, expect, it } from 'vitest'
import type { FactSheet } from '../../src/factTypes'
import type { ClaimCard } from '../../src/libraryTypes'
import cards from '../../src/library.json'
import { cardLines, GUARDED_TAGS, retrieve } from './library'
import { buildMessages, buildReviewMessages, claudeInstructions, parseOutput, rankedLines } from './prompt'
import { textOf } from './ai'
import { lineBriefing, sheetLines, type LineBriefing, type Said } from './briefing'

const library = (cards as ClaimCard[]).filter((c) => c.status === 'admitted')
const sheet: FactSheet = {
  version: 1,
  day: '2026-09-17',
  builtAt: '2026-09-17T23:00:00.000Z',
  hour: 23,
  weeks: 3,
  days: 22,
  direction: 'One line, mine',
  said: [{ day: '2026-09-16', source: 'phone', situationId: 'say-when', text: 'Said before.', feedback: 'useful' }],
  facts: [
    { id: 'aim.1', tags: ['study', 'cue', 'plan'], text: 'French: planned after her bedtime at 20:00.', values: { name: 'French' }, n: 5 },
    { id: 'assoc.napped', tags: ['nap'], text: 'Mornings after a nap read +7, 5 naps.', values: { diff: 7, times: 5 }, n: 5, tier: 'unclear' },
  ],
}

/** The sheet with its day's shape, as the phone writes it; a prompt is built only from a briefing. */
const withDay: FactSheet = { ...sheet, facts: [{ id: 'week.today', tags: ['cue'], text: 'Today is Thursday; not a daycare day; at home; not a study night; her bedtime 20:00; the hour is 23.', values: { weekday: 'Thursday', daycare: 0 } }, ...sheet.facts] }
function brief(s: FactSheet, cardList: ClaimCard[], said: Said[], forDay = s.day, task: 'line' | 'review' = 'line'): LineBriefing {
  const r = lineBriefing({ task, writer: 'free', sheet: s, forDay, cards: cardList, said })
  if (!r.ok) throw new Error(r.reason)
  return r.briefing
}

describe('what the model is asked', () => {
  it('lists the facts by id and the cards by id, names the day, and asks for JSON alone', () => {
    const lines = sheetLines(sheet)
    expect(lines).toContain('[aim.1] French: planned after her bedtime at 20:00. (n=5)')
    expect(lines).toContain('Direction, in the person\'s own words: One line, mine')
    const messages = buildMessages(brief(withDay, retrieve(library, withDay), [{ day: '2026-09-16', text: 'Said before.', feedback: 'useful' }]))
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('JSON only')
    expect(messages[0].content).toContain('failed, bad, lazy, behind, weak, slipped again')
    expect(messages[0].content).toContain('A window where nothing was reported is "no caffeine reported", never caffeine-free')
    expect(messages[1].content).toContain('[implementation-intentions] grade A')
    expect(messages[1].content).toContain('2026-09-16 (useful): Said before.')
    expect(buildReviewMessages(brief(withDay, [], [], withDay.day, 'review'))[1].content).toContain('weekly review')
    expect(buildReviewMessages(brief(withDay, [], [], withDay.day, 'review'))[0].content).toContain('"held"')
    expect(messages[1].content).toContain('THE DAY YOU ARE WRITING FOR, 2026-09-17\nToday is Thursday')
    expect(rankedLines([])).toBe('nothing ranked')
  })

  it('names both days when the sheet was built the day before, and relabels what "today" meant', () => {
    const friday: FactSheet = {
      ...sheet,
      day: '2026-09-18',
      facts: [
        { id: 'week.today', tags: ['cue'], text: 'Today is Friday; a daycare day with pickup at 17:30; at home; not a study night; her bedtime 20:00; the hour is 22.', values: { weekday: 'Friday', daycare: 1, pickup: '17:30' } },
        { id: 'week.tomorrow', tags: ['cue'], text: 'Tomorrow is Saturday; not a daycare day; at home; a church day; not a study night; her bedtime 20:00.', values: { day: '2026-09-19', weekday: 'Saturday', daycare: 0 } },
        { id: 'today.shortSleep', tags: ['sleep'], text: 'Sleep hours read “Under 5 hours” this morning.', values: {} },
      ],
    }
    const lines = sheetLines(friday, '2026-09-19')
    expect(lines).toContain('These facts were built on 2026-09-18')
    expect(lines).toContain('You are writing for 2026-09-19, the day after')
    expect(lines).toContain("[week.today] The facts' own day, 2026-09-18, was Friday; a daycare day with pickup at 17:30")
    expect(lines).toContain('[week.tomorrow] The day you are writing for, 2026-09-19, is Saturday; not a daycare day')
    expect(lines).toContain('[today.shortSleep] On 2026-09-18: Sleep hours read')
    expect(sheetLines(friday)).toContain('[week.today] Today is Friday')
    expect(buildMessages(brief(friday, [], [], '2026-09-19'))[1].content).toContain('One line for 2026-09-19')
  })

  it('retrieves the cards the facts touch, weighted by what stands behind them, strongest grade first', () => {
    const picked = retrieve(library, sheet)
    expect(picked[0].id).toBe('implementation-intentions')
    expect(picked).toHaveLength(12)
    expect(picked.map((c) => c.id)).toContain('naps-cognition')
    expect(retrieve(library, sheet, 3).map((c) => c.id)).toEqual(picked.slice(0, 3).map((c) => c.id))
    expect(picked.every((c) => c.status === 'admitted')).toBe(true)
    expect(retrieve(library, { ...sheet, facts: [] })).toEqual([])
    expect(cardLines(picked.slice(0, 1))).toMatch(/^\[implementation-intentions\] grade A, replicated: /)
  })

  it('brings a Partner card only on a day a fact carries its tag: a dating card on a declared date day, a relationship card never (Part 27)', () => {
    const guarded = (c: ClaimCard) => c.tags.some((t) => GUARDED_TAGS.includes(t))
    expect(library.filter((c) => c.tags.includes('dating')).length).toBeGreaterThan(0)
    expect(library.filter((c) => c.tags.includes('relationship')).length).toBeGreaterThan(0)
    // A day full of the tags Partner cards share (social, stress, conversation, kindness, choice) brings none of them.
    const social: FactSheet = { ...sheet, facts: [...sheet.facts, { id: 'people.seen', tags: ['social', 'conversation', 'kindness', 'choice', 'stress', 'mood', 'gratitude', 'writing', 'parenting', 'faith'], text: 'People around.', values: {}, n: 9 }] }
    const plain = retrieve(library, social, 60)
    expect(plain.length).toBeGreaterThan(12)
    expect(plain.filter(guarded)).toEqual([])
    // A declared date day brings dating cards, and still no card about a relationship.
    const dateDay: FactSheet = { ...social, facts: [...social.facts, { id: 'partner.dateDay', tags: ['dating'], text: 'Today is a declared date day.', values: { dateDay: 1 } }] }
    const onDate = retrieve(library, dateDay, 60)
    expect(onDate.some((c) => c.tags.includes('dating'))).toBe(true)
    expect(onDate.filter((c) => c.tags.includes('relationship'))).toEqual([])
    // A card carrying both needs both.
    const both: ClaimCard = { ...library[0], id: 'both-tags', tags: ['dating', 'relationship'] }
    expect(retrieve([both], dateDay)).toEqual([])
  })

  it('reads the JSON out of whatever surrounds it, and the text out of whichever shape the model family returns', () => {
    expect(parseOutput('Here you go:\n```json\n{"mode":"observation","text":"x","factIds":["aim.1"],"cardIds":[]}\n```')).toEqual({ mode: 'observation', text: 'x', factIds: ['aim.1'], cardIds: [] })
    expect(parseOutput('no json here')).toBeNull()
    expect(parseOutput('{ not json }')).toBeNull()
    expect(textOf({ response: 'a' })).toBe('a')
    expect(textOf('b')).toBe('b')
    expect(textOf({ output: [{ type: 'reasoning', content: [{ text: 'thinking' }] }, { type: 'message', content: [{ type: 'output_text', text: 'c' }] }] })).toBe('c')
    expect(textOf({ choices: [{ message: { content: 'd' } }] })).toBe('d')
    expect(textOf({ result: { response: 'e' } })).toBe('e')
    expect(textOf(null)).toBe('')
  })
})

describe('the review closes its loop (Part 36)', () => {
  it('tells Claude’s review, and not its line, to say what the record shows of last week’s change', () => {
    expect(claudeInstructions('review')).toMatch(/review\.change, say in "held" or "didNot" what the record shows of last week's change/)
    expect(claudeInstructions('line')).not.toMatch(/review\.change/)
  })
})
