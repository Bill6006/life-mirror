import { describe, expect, it } from 'vitest'
import { cardFromHypothesis, parseHypothesis } from './hypothesis'

describe('an outside hypothesis', () => {
  it('enters only through the format, with every field checked against the catalogue and the readings', () => {
    expect(parseHypothesis('not json')).toEqual({ ok: false, error: 'notJson' })
    expect(parseHypothesis('{"move": "walk-ten"}')).toEqual({ ok: false, error: 'fields' })
    expect(parseHypothesis('{"move": "no-such", "alternative": "nap-ten", "target": "energy", "context": "afternoon"}')).toEqual({ ok: false, error: 'move' })
    expect(parseHypothesis('{"move": "walk-ten", "alternative": "no-such", "target": "energy", "context": "afternoon"}')).toEqual({ ok: false, error: 'alternative' })
    expect(parseHypothesis('{"move": "walk-ten", "alternative": "nap-ten", "target": "hunger", "context": "afternoon"}')).toEqual({ ok: false, error: 'target' })
    expect(parseHypothesis('{"move": "walk-ten", "alternative": "nap-ten", "target": "energy", "context": "night"}')).toEqual({ ok: false, error: 'context' })
    expect(parseHypothesis('{"move": "walk-ten", "alternative": "walk-ten", "target": "energy", "context": "afternoon"}')).toEqual({ ok: false, error: 'same' })
    const ok = parseHypothesis('{"move": "walk-ten", "alternative": "nothing", "target": "energy", "context": "afternoon"}')
    expect(ok).toEqual({ ok: true, hypothesis: { move: 'walk-ten', alternative: 'nothing', target: 'energy', context: 'afternoon' } })
  })

  it('becomes a card to test, marked imported, and nothing else', () => {
    const parsed = parseHypothesis('{"move": "walk-ten", "alternative": "nap-ten", "target": "energy", "context": "afternoon"}')
    if (!parsed.ok) throw new Error('should parse')
    const card = cardFromHypothesis(parsed.hypothesis, '2026-09-11T20:00:00.000Z')
    expect(card).toEqual({
      createdAt: '2026-09-11T20:00:00.000Z',
      situationKey: 'afternoon:energy',
      block: 'afternoon',
      target: 'energy',
      moveId: 'walk-ten',
      alternativeId: 'nap-ten',
      window: 'nextBlock',
      worthwhile: 1,
      origin: 'import',
    })
    expect(Object.keys(card)).not.toContain('weights')
  })
})
