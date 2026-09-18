import { describe, expect, it } from 'vitest'
import type { FactSheet } from '../../src/factTypes'
import type { ClaimCard } from '../../src/libraryTypes'
import cards from '../../src/library.json'
import { cardLines, retrieve } from './library'
import { buildMessages, parseOutput, sheetLines } from './prompt'
import { textOf } from './ai'

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

describe('what the model is asked', () => {
  it('lists the facts by id and the cards by id, names the day, and asks for JSON alone', () => {
    const lines = sheetLines(sheet)
    expect(lines).toContain('[aim.1] French: planned after her bedtime at 20:00. (n=5)')
    expect(lines).toContain('Direction, in the person\'s own words: One line, mine')
    const messages = buildMessages('brief', sheet, retrieve(library, sheet), [{ day: '2026-09-16', text: 'Said before.', feedback: 'useful' }])
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('JSON only')
    expect(messages[0].content).toContain('failed, bad, lazy, behind, weak, slipped again')
    expect(messages[1].content).toContain('[implementation-intentions] grade A')
    expect(messages[1].content).toContain('2026-09-16 (useful): Said before.')
    expect(buildMessages('review', sheet, [], [])[1].content).toContain('weekly review')
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
