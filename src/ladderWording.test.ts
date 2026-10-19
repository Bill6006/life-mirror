import { describe, expect, it } from 'vitest'
import { ladderWordingRefusal, validateOutput } from './brainShared'
import type { Fact, FactSheet } from './factTypes'

// Stage R5: the evidence-wording check held to the ladder (requirement 8: "The ladder governs the Brain's words, how
// strongly a move is put, and what may be called reliable."). A line citing a test speaks of its effect no more firmly
// than its rung allows; a line citing no test is judged as before.

const ladder = (level: string, direction: string | null, id = 'ladder.walk-ten.stress'): Fact => ({ id, tags: [], text: 'Test: …', values: { level, direction } })
const sheet = (...facts: Fact[]) => ({ facts })
const said = (text: string, f: Fact) => ladderWordingRefusal(text, [f.id], sheet(f))

describe('the wording held to the ladder', () => {
  it('reads only cited tests: a line citing none is judged as before', () => {
    const f = ladder('none', null)
    expect(ladderWordingRefusal('A walk helps your stress.', ['week.today'], sheet(f))).toBeNull()
    expect(ladderWordingRefusal('A walk reliably helps.', [], sheet(f))).toBeNull()
  })

  it('no call yet: no effect is claimed, though the test may be named', () => {
    const f = ladder('none', null)
    expect(said('A walk helps your stress.', f)).toMatch(/no call yet/)
    expect(said('Your walks are still being tested against your stress.', f)).toBeNull()
  })

  it('an early sign: said as an early sign, or hedged', () => {
    const f = ladder('early', 'helps')
    expect(said('A walk helps your stress.', f)).toMatch(/as settled/)
    expect(said('There is an early sign that a walk helps your stress.', f)).toBeNull()
    expect(said('A walk may help your stress.', f)).toBeNull()
    expect(said('A walk seems to help your stress.', f)).toBeNull()
  })

  it('likely: said as likely, or hedged', () => {
    const f = ladder('likely', 'helps')
    expect(said('A walk helps your stress.', f)).toMatch(/as settled/)
    expect(said('A walk likely helps your stress.', f)).toBeNull()
  })

  it('only an established call may be called reliable or proven', () => {
    expect(said('A walk reliably helps your stress.', ladder('likely', 'helps'))).toMatch(/reliabl/)
    expect(said('A walk is proven to help your stress.', ladder('early', 'helps'))).toMatch(/proven/)
    expect(said('A walk reliably helps your stress.', ladder('established', 'helps'))).toBeNull()
    expect(said('A walk helps your stress.', ladder('established', 'helps'))).toBeNull()
  })

  it('a call that hurts or makes little difference is never said to help; saying it does not is honest', () => {
    expect(said('A walk helps your stress.', ladder('established', 'little'))).toMatch(/does not say it helps/)
    expect(said('A walk may help your stress.', ladder('likely', 'hurts'))).toMatch(/does not say it helps/)
    expect(said('A walk makes little difference to your stress.', ladder('established', 'little'))).toBeNull()
    expect(said('A walk does not seem to help your stress.', ladder('likely', 'little'))).toBeNull()
    expect(said('A walk has not helped your stress so far.', ladder('early', 'hurts'))).toBeNull()
  })

  it('with several tests cited, the strongest call that helps is the one that counts', () => {
    const early = ladder('early', 'helps', 'ladder.walk-ten.mood')
    const established = ladder('established', 'helps')
    expect(ladderWordingRefusal('A walk helps your stress.', [early.id, established.id], sheet(early, established))).toBeNull()
  })
})

describe('every line the Brain writes is held to it', () => {
  it('a line citing an early sign as settled is refused, and the same line said as an early sign passes', () => {
    const f = { id: 'ladder.walk-ten.stress', tags: ['monitoring'], text: 'Test: A ten-minute walk, now, for Stress over the next block: Early sign: helps.', values: { level: 'early', direction: 'helps' } } as Fact
    const sheet = { day: '2026-09-25', builtAt: '2026-09-25T08:00:00.000Z', facts: [f], said: [], shortlist: [], showPrivate: false } as unknown as FactSheet
    expect(validateOutput({ mode: 'observation', text: 'A short walk helps your stress.', factIds: [f.id], cardIds: [] }, sheet, [])).toMatchObject({ ok: false, reason: expect.stringContaining('as settled') })
    expect(validateOutput({ mode: 'observation', text: 'There is an early sign that a short walk helps your stress.', factIds: [f.id], cardIds: [] }, sheet, []).ok).toBe(true)
  })
})
