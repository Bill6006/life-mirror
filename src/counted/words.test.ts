import { describe, expect, it } from 'vitest'
import { CAUSAL_WORDS, RECORD_CAUSE } from '../brainShared'
import type { Direction, Standing } from './compare'
import { STANDING_WORDS, whenWords, withWords } from './words'

// The words for a standing (the counted foundation, 2026-11-12; in shadow).

const STANDINGS: Standing[] = ['tooFew', 'noPattern', 'lead', 'pattern']
const DIRECTIONS: Direction[] = ['higher', 'lower', 'none']
/** The words an association may never borrow: the evidence standard's own list. */
const NEVER = /\b(?:because|cause[sd]?|causing|makes?|made|helps?|helped|hurts?|works?|worked)\b/i

const every = (): string[] => {
  const out: string[] = []
  for (const standing of STANDINGS) {
    for (const direction of DIRECTIONS) {
      out.push(whenWords({ thing: 'something sweet', where: 'on Saturdays', elsewhere: 'on other days', k: 14, n: 26, restK: 30, m: 154, standing, direction, family: 9 }))
      for (const higherIsGood of [true, false, undefined]) for (const likeForLike of [true, false]) out.push(withWords({ thing: 'a late or heavy dinner', after: 'Mornings after', unit: 'points', n: 14, m: 31, diff: direction === 'lower' ? -12.34 : direction === 'none' ? 0 : 12.34, likeForLike, standing, direction, higherIsGood, family: 12 }))
    }
  }
  return out
}

describe('the words for a standing', () => {
  it('are four, and plain', () => {
    expect(STANDING_WORDS).toEqual({ tooFew: 'Too few to compare yet', noPattern: 'No clear pattern yet', lead: 'A lead, not yet a pattern', pattern: 'A steady pattern' })
  })

  it('never say why: no sentence for any standing matches the checker’s causal lists or the standard’s own', () => {
    const sentences = every()
    expect(sentences.length).toBe(84)
    for (const s of sentences) {
      expect(CAUSAL_WORDS.test(s), s).toBe(false)
      expect(RECORD_CAUSE.test(s), s).toBe(false)
      expect(NEVER.test(s), s).toBe(false)
    }
  })

  it('say a "when" answer as k of n against the rest, and the direction', () => {
    const w = { thing: 'something sweet', where: 'on Saturdays', elsewhere: 'on other days', k: 14, n: 26, restK: 30, m: 154, family: 9 }
    expect(whenWords({ ...w, standing: 'pattern', direction: 'higher' })).toBe('A steady pattern: something sweet was recorded more often on Saturdays (14 of 26 on Saturdays, against 30 of 154 on other days).')
    expect(whenWords({ ...w, k: 2, standing: 'pattern', direction: 'lower' })).toContain('less often on Saturdays (2 of 26')
    expect(whenWords({ ...w, standing: 'noPattern', direction: 'higher' })).toBe('No clear pattern yet: something sweet, 14 of 26 on Saturdays, against 30 of 154 on other days.')
    expect(whenWords({ ...w, k: 2, n: 3, standing: 'tooFew', direction: 'higher' })).toBe('Too few to compare yet: something sweet, 2 of 3 on Saturdays, against 30 of 154 on other days.')
  })

  it('say a lead with how many things were looked at, and a pattern without', () => {
    const w = { thing: 'something sweet', where: 'in the evening', elsewhere: 'at the other check-ins', k: 14, n: 26, restK: 30, m: 154, direction: 'higher' as const }
    expect(whenWords({ ...w, standing: 'lead', family: 9 })).toContain('9 comparisons were looked at.')
    expect(whenWords({ ...w, standing: 'lead', family: 1 })).toContain('1 comparison was looked at.')
    expect(whenWords({ ...w, standing: 'pattern', family: 9 })).not.toContain('looked at')
  })

  it('say a difference with its size, its direction, whether that is the good direction, and its counts', () => {
    const w = { thing: 'a late or heavy dinner', after: 'Mornings after', unit: 'points', n: 14, m: 31, likeForLike: true, family: 12 }
    expect(withWords({ ...w, diff: -12.34, standing: 'pattern', direction: 'lower', higherIsGood: true })).toBe('A steady pattern: mornings after a late or heavy dinner read 12.3 points lower, not the good direction, like for like (14 with it, 31 without).')
    expect(withWords({ ...w, diff: 12.34, standing: 'lead', direction: 'higher', higherIsGood: true })).toBe('A lead, not yet a pattern: mornings after a late or heavy dinner read 12.3 points higher, the good direction, like for like (14 with it, 31 without). 12 comparisons were looked at.')
    expect(withWords({ ...w, diff: 3, standing: 'noPattern', direction: 'higher' })).toBe('No clear pattern yet: mornings after a late or heavy dinner read 3 points higher, like for like (14 with it, 31 without).')
    expect(withWords({ ...w, n: 3, diff: 20, standing: 'tooFew', direction: 'higher' })).toBe('Too few to compare yet: mornings after a late or heavy dinner, 3 with it, 31 without.')
    expect(withWords({ ...w, diff: null, standing: 'tooFew', direction: 'none' })).toContain('Too few to compare yet')
  })
})
