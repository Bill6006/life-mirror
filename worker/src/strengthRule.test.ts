import { describe, expect, it } from 'vitest'
import * as prompt from './prompt'

// The forecast follow-ups, item 1 (2026-11-20): Ask is told the strength rule its validator holds, so the first draft
// keeps it. Both tiers, once each, right after the ladder rule; no other task is told it.

describe('Ask is told the strength rule (the forecast follow-ups, item 1)', () => {
  it('in both tiers, once, right after the ladder rule', () => {
    for (const tier of ['ask', 'deep'] as const) {
      const lines = prompt.askInstructions(tier, 450, null).split('\n')
      expect(lines.filter((l) => l === prompt.STRENGTH_RULE), tier).toHaveLength(1)
      expect(lines[lines.indexOf(prompt.STRENGTH_RULE) - 1], tier).toBe(prompt.LADDER_RULE)
    }
  })

  it('names the four phrases, the three words that name research, and "no call yet"', () => {
    for (const w of ['"strong evidence"', '"good evidence"', '"some evidence"', '"thin evidence"', '"research"', '"studies"', '"the library"', '"no call yet"']) {
      expect(prompt.STRENGTH_RULE).toContain(w)
    }
  })
})
