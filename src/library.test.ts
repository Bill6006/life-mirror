import { describe, expect, it } from 'vitest'
import { admitted, bestGrade, cardById, cardsFor, DOMAINS, gradeWeight, gradeWord, library, TAGS } from './library'
import { SITUATIONS } from './situations'

// The evidence library: every card well formed, every situation's cards real and admitted, and
// retrieval strongest grade first. The same rules the check script enforces, so the build fails
// here too.

describe('the evidence library', () => {
  it('holds well-formed cards with unique ids, graded on the scale, tagged from the vocabulary', () => {
    const ids = new Set<string>()
    for (const c of library) {
      expect(c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(ids.has(c.id)).toBe(false)
      ids.add(c.id)
      expect(['A', 'B', 'C', 'D']).toContain(c.grade)
      expect(['replicated', 'mixed', 'failed', 'untested']).toContain(c.replication)
      expect(['admitted', 'draft', 'superseded', 'disputed']).toContain(c.status)
      expect(DOMAINS).toContain(c.domain)
      expect(c.tags.length).toBeGreaterThan(0)
      for (const t of c.tags) expect(TAGS).toContain(t)
      expect(c.sources.length).toBeGreaterThan(0)
      expect(c.claim.length).toBeGreaterThan(40)
      expect(c.app.length).toBeGreaterThan(10)
      expect(c.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      if (c.status === 'admitted' && c.grade !== 'D') expect(c.sources.some((s) => s.doi || (s as { pmid?: string }).pmid)).toBe(true)
    }
    expect(library.length).toBeGreaterThan(60)
    expect(admitted().length).toBeGreaterThan(60)
  })

  it('names nothing personal: no first names, no place, no employer', () => {
    const text = JSON.stringify(library).toLowerCase()
    for (const word of ['tyree', 'bill6006', 'dockery']) expect(text).not.toContain(word)
  })

  it('backs every situation with real, admitted cards', () => {
    for (const s of SITUATIONS) {
      for (const id of s.cards) {
        const c = cardById(id)
        expect(c, `${s.id} cites ${id}`).toBeDefined()
        expect(c?.status).toBe('admitted')
      }
    }
  })

  it('retrieves by tag, strongest grade first, and never a disputed card', () => {
    const cue = cardsFor(['cue'])
    expect(cue[0].id).toBe('implementation-intentions')
    expect(cue.every((c) => c.status === 'admitted')).toBe(true)
    expect(cardsFor(['choice']).some((c) => c.id === 'decision-fatigue-disputed')).toBe(false)
    expect(cardsFor(['no-such-tag'])).toEqual([])
  })

  it('speaks a grade as one phrase and weighs it', () => {
    expect(gradeWord('A')).toBe('strong evidence')
    expect(gradeWord('D')).toBe('thin evidence')
    expect(gradeWeight('A')).toBeGreaterThan(gradeWeight('D'))
    expect(gradeWeight(null)).toBe(0.6)
    expect(bestGrade(['self-compassion-after-lapse', 'implementation-intentions'])).toBe('A')
    expect(bestGrade(['decision-fatigue-disputed'])).toBeNull()
    expect(bestGrade([])).toBeNull()
  })
})

describe('how strongly if-then plans may be spoken of (truth audit, 2026-09-24)', () => {
  // The line "greatly boost follow-through" repeated this card faithfully: it said medium-to-large, from the 2006
  // meta-analysis of 94 tests. The 2025 one, of 642 tests, found the effect reliable but small on behaviour.
  it('says the effect is reliable and small on behaviour, from the 2025 meta-analysis first', () => {
    const card = cardById('implementation-intentions')
    expect(card?.grade).toBe('A')
    expect(card?.claim).toContain('reliably raises')
    expect(card?.claim).toContain('small on average')
    expect(card?.claim).not.toMatch(/medium-to-large|large effect|doubles|greatly|far more/i)
    expect(card?.effect).toContain('d = .27 on behaviour across 301 tests')
    expect(card?.sources[0].doi).toBe('10.1080/10463283.2024.2334563')
    expect(card?.sources.map((s) => s.doi)).toContain('10.1016/S0065-2601(06)38002-1')
  })
})
