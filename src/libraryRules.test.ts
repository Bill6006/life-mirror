import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { library } from './library'
import { CERTAINTIES, certaintyOf, COMPARATORS, DESIGNS, DISTANCES, HETEROGENEITY, ORIGINS, planningShare, REASON_WORDS, type Gradable } from './libraryRules'
import { blockedMethods, methods } from './methods'

// The evidence pipeline's grading rule and method library (P3, 2026-11-06): a certainty from a card's
// fields by rule, never by a model, with its plain reasons; a planning share of a published effect; the
// closed lists the app and the check script read alike; and every method resting on admitted cards.

const base: Gradable = { design: 'meta', origin: 'direct', replication: 'replicated', k: 30, n: 1355, heterogeneity: 'moderate' }

describe('a card’s certainty, by rule', () => {
  it('starts from its design, and goes down one level for each reason against, saying the reasons', () => {
    expect(certaintyOf(base)).toEqual({ certainty: 'high', reasons: [] })
    expect(certaintyOf({ ...base, heterogeneity: 'high' })).toEqual({ certainty: 'moderate', reasons: [REASON_WORDS.heterogeneity] })
    expect(certaintyOf({ ...base, origin: 'indirect', mismatch: 'clinical samples' })).toEqual({ certainty: 'moderate', reasons: [`${REASON_WORDS.indirect}: clinical samples`] })
    expect(certaintyOf({ ...base, publicationBias: true, heterogeneity: 'high', origin: 'indirect', mismatch: 'students' })?.certainty).toBe('veryLow')
    expect(certaintyOf({ ...base, design: 'quasi', k: 4 })).toEqual({ certainty: 'low', reasons: [] })
    expect(certaintyOf({ ...base, design: 'expert' })?.certainty).toBe('veryLow')
  })

  it('never puts a single study above low, and a finding that failed to replicate at very low', () => {
    expect(certaintyOf({ design: 'rct', origin: 'direct', replication: 'untested', n: 400 })).toEqual({ certainty: 'low', reasons: [REASON_WORDS.single] })
    expect(certaintyOf({ ...base, replication: 'failed' })?.certainty).toBe('veryLow')
    expect(certaintyOf({ design: 'rct', origin: 'direct', replication: 'untested', n: 40 })?.reasons).toEqual([REASON_WORDS.single, REASON_WORDS.small])
  })

  it('grades only direct and indirect claims, and nothing without its fields', () => {
    for (const origin of ['mechanism', 'expert', 'inference', 'judgment'] as const) expect(certaintyOf({ ...base, origin })).toBeNull()
    expect(certaintyOf({ replication: 'replicated' })).toBeNull()
  })

  it('says at most three reasons, the most telling first', () => {
    const many = certaintyOf({ design: 'rct', origin: 'indirect', mismatch: 'children', replication: 'mixed', publicationBias: true, heterogeneity: 'high', singleLab: true, n: 30, biasRisk: 'high' })
    expect(many?.reasons).toHaveLength(3)
    expect(many?.reasons[0]).toBe(REASON_WORDS.single)
    expect(many?.certainty).toBe('veryLow')
  })
})

describe('how much of a published effect to plan on', () => {
  it('is a tenth to three tenths with publication bias, most where others repeated it, otherwise a quarter or more to a half', () => {
    expect(planningShare({ ...base, publicationBias: true })).toEqual([0.1, 0.3])
    expect(planningShare(base)).toEqual([0.6, 0.9])
    expect(planningShare({ ...base, replication: 'untested' })).toEqual([0.3, 0.5])
    expect(planningShare({ design: 'rct', origin: 'direct', replication: 'untested' })).toEqual([0.25, 0.5])
    expect(planningShare({ ...base, singleLab: true })).toEqual([0.3, 0.5])
  })
})

describe('the closed lists', () => {
  it('are the same for the app and for the check script', () => {
    const f = JSON.parse(readFileSync(new URL('./libraryFields.json', import.meta.url), 'utf8')) as Record<string, string[]>
    expect(f.origin).toEqual([...ORIGINS])
    expect(f.design).toEqual([...DESIGNS])
    expect(f.outcomeDistance).toEqual([...DISTANCES])
    expect(f.comparator).toEqual([...COMPARATORS])
    expect(f.heterogeneity).toEqual([...HETEROGENEITY])
    expect(CERTAINTIES).toEqual(['veryLow', 'low', 'moderate', 'high'])
  })
})

describe('the method library', () => {
  const cards = new Map(library.map((c) => [c.id, c]))
  it('rests every method on admitted cards, and every blocked one on a card that rules it out', () => {
    expect(new Set(methods.map((m) => m.id)).size).toBe(methods.length)
    for (const m of methods) {
      expect(m.cards.length, m.id).toBeGreaterThan(0)
      for (const id of m.cards) expect(cards.get(id)?.status, `${m.id}: ${id}`).toBe('admitted')
    }
    for (const b of blockedMethods) {
      const c = cards.get(b.card)
      expect(c?.status === 'disputed' || c?.replication === 'failed', `${b.id}: ${b.card}`).toBe(true)
      expect(methods.some((m) => m.id === b.id), b.id).toBe(false)
    }
  })
})
