import { describe, expect, it } from 'vitest'
import { copy } from './copy'
import { rankLines, SITUATIONS } from './situations'
import { SITUATION_SHEETS } from './situationFixtures'

// Every line the phone's judgment engine can say, recorded before How firm (Pass 2) was written and
// held fixed while its gate is closed: the phone's own lines, and the ranking the Worker reads for
// every monitored prompt, must not move by a byte (the owner's condition, 2026-09-25).

/** A template's balanced delivery: the middle of each ⟨supportive|balanced|hard coach⟩ choice; before Pass 2 there were none. */
const middle = (t: string) => t.replace(/⟨([^|⟩]*)\|([^|⟩]*)\|([^⟩]*)⟩/g, '$2')

describe('the phone’s own lines, held fixed while How firm is gated', () => {
  it('has a fixture for every situation, and each fixture makes its own situation true', () => {
    expect(Object.keys(SITUATION_SHEETS).sort()).toEqual(SITUATIONS.map((s) => s.id).sort())
    for (const s of SITUATIONS) expect(rankLines(SITUATION_SHEETS[s.id](), [], []).some((c) => c.situationId === s.id), s.id).toBe(true)
  })

  it('says every situation exactly as before: its words, mode, citations, action and score', () => {
    const out = Object.fromEntries(
      SITUATIONS.map((s) => {
        const c = rankLines(SITUATION_SHEETS[s.id](), [], []).find((x) => x.situationId === s.id)
        return [s.id, c ? { mode: c.mode, text: c.text, factIds: c.factIds, cardIds: c.cardIds, action: c.action, score: c.score } : null]
      }),
    )
    expect(out).toMatchSnapshot()
  })

  it('keeps every template’s balanced words as they were', () => {
    expect(Object.fromEntries(Object.entries(copy.brain.lines).map(([k, v]) => [k, middle(v)]))).toMatchSnapshot()
  })
})
