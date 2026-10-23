import { describe, expect, it } from 'vitest'
import { addDays } from '../blocks'
import { repairEvidenceFrom, type TestShown, type TrackLine } from './evidence'
import { actionableFirst, ladderFact, repairFacts, trackFact } from './facts'
import { START, walkRecord } from './fixtures'

// The learning repair for the Brain (stage R5): each test Evidence shows whole becomes a ladder fact, findings the owner
// can act on first (requirement 16), and the track record follows them in requirement 15's words.

const t = (over: Partial<TestShown>): TestShown => ({ key: 'walk-ten|stress|nextBlock', moveId: 'walk-ten', target: 'stress', window: 'nextBlock', level: 'none', direction: null, revised: false, belief: 0.3, theta: null, lo: null, hi: null, offered: 4, heldBack: 5, days: 9, ctx: [], running: false, began: null, itt: null, share: 0.6, ...over })
const line = (over: Partial<TrackLine>): TrackLine => ({ rung: 'early', resolved: 0, held: 0, open: 0, enough: false, tightened: false, tested: 2 / 3, ...over })

describe('the ladder facts', () => {
  it('findings the owner can act on first: calls that help, strongest first; then other calls; then running tests with none', () => {
    const tests = [t({ key: 'a', level: 'none', running: true }), t({ key: 'b', level: 'likely', direction: 'little' }), t({ key: 'c', level: 'early', direction: 'helps' }), t({ key: 'd', level: 'established', direction: 'helps' }), t({ key: 'e', level: 'early', direction: 'hurts' })]
    expect([...tests].sort(actionableFirst).map((x) => x.key)).toEqual(['d', 'c', 'b', 'e', 'a'])
  })

  it('one test: its id, rung, counts, estimate and research, in plain words with the values beside', () => {
    const f = ladderFact(t({ level: 'likely', direction: 'helps', theta: 0.42, lo: 0.1, hi: 0.74, itt: 0.25, share: 0.6, offered: 21, heldBack: 20, days: 14, running: true }))
    expect(f.id).toBe('ladder.walk-ten.stress')
    // Item 4: the call is on the suggestion against nothing extra; the size when done is said as resting on an assumption.
    expect(f.text).toBe("Test: A ten-minute walk, now, for Stress over the next block: Likely: helps, a call on suggesting it against suggesting nothing extra, whatever was then done; offered 21 times and held back 20, each with the reading after it, over 14 days; when suggested, +0.25 steps against nothing extra; when done, an estimate of +0.42 steps (+0.10 to +0.74), the suggestion's effect over the share of times it was done (6 in 10), assuming it works only through doing it; pooled with research, +0.30 steps when done; research alone +0.40; being tested now.")
    expect(f.values).toMatchObject({ moveId: 'walk-ten', level: 'likely', direction: 'helps', revised: 0, running: 1, offered: 21, heldBack: 20, itt: 0.25, share: 6, belief: 0.3, research: 0.4 })
    expect(f.n).toBe(41)
    expect(f.tier).toBe('Likely: helps')
  })

  it('a revised test says so; a test with no estimate yet says none', () => {
    const f = ladderFact(t({ level: 'early', direction: 'little', revised: true }))
    expect(f.text).toContain('Early sign: little difference, revised, a call on suggesting it against suggesting nothing extra')
    expect(f.text).not.toContain('when done, an estimate')
    expect(f.text).not.toContain('when suggested,')
  })

  it('the track record in requirement 15’s words, the simulation’s rates standing until ten of a kind resolve', () => {
    const f = trackFact([line({ resolved: 3, held: 2, open: 1 }), line({ rung: 'likely' }), line({ rung: 'established', resolved: 1, held: 1 })])
    expect(f.id).toBe('track')
    expect(f.text).toBe('The engine’s own track record: of 3 early signs, 2 held (1 still open); no likely call has resolved yet; of 1 established call, 1 held. Until ten of a kind resolve, the rates tested on simulated people stand.'.replace('’', "'"))
    expect(f.values).toMatchObject({ earlyResolved: 3, earlyHeld: 2, earlyOpen: 1, likelyResolved: 0, establishedHeld: 1 })
    const tight = trackFact([line({ resolved: 12, held: 3, enough: true, tightened: true }), line({ rung: 'likely', enough: true }), line({ rung: 'established', enough: true })])
    expect(tight.text).toContain('early signs need stronger evidence for now')
    expect(tight.text).not.toContain('Until ten of a kind resolve')
  })
})

describe('read from the record', () => {
  it('the walk’s test that helps comes first, the track record last', () => {
    const facts = repairFacts(repairEvidenceFrom(walkRecord(14, true), addDays(START, 14)))
    expect(facts[0].id).toBe('ladder.walk-ten.stress')
    expect(facts[0].values.direction).toBe('helps')
    expect(facts[facts.length - 1].id).toBe('track')
    expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length)
  })
})
