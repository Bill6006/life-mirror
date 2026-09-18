import { describe, expect, it } from 'vitest'
import { numberGrounded, numbersIn, validateAction, validateOutput, validateReview } from './brainShared'
import type { FactSheet } from './facts'
import { library } from './library'

// The validator: what the brain says must be grounded in facts by id, every number taken from
// them, no evidence claimed beyond the cited cards' grade, none of the verdict words, and short.

const sheet: FactSheet = {
  version: 1,
  day: '2026-09-18',
  builtAt: '2026-09-18T05:00:00.000Z',
  hour: 5,
  weeks: 3,
  days: 22,
  direction: null,
  said: [],
  facts: [
    { id: 'reading.2026-09-17.evening', tags: ['mood'], text: 'Yesterday evening read 62, Solid.', values: { value: 62, band: 'Solid' } },
    { id: 'aim.1', tags: ['study'], text: 'French: planned after her bedtime at 20:00.', values: { name: 'French', planTime: '20:00', gapDays: 3 } },
    { id: 'assoc.napped', tags: ['nap'], text: 'Mornings after a nap read +7, 5 naps.', values: { diff: 7, times: 5 }, n: 5, tier: 'unclear' },
  ],
}

describe('what the brain may say', () => {
  it('accepts a grounded line', () => {
    const v = validateOutput({ mode: 'observation', text: 'Yesterday evening read 62; French waited 3 days. Some evidence says naps help the afternoon.', factIds: ['reading.2026-09-17.evening', 'aim.1'], cardIds: ['naps-cognition'] }, sheet, library)
    expect(v.ok).toBe(true)
  })

  it('refuses a number not on the cited facts, a fact not on the sheet, and a card not admitted', () => {
    expect(validateOutput({ mode: 'observation', text: 'Yesterday evening read 70.', factIds: ['reading.2026-09-17.evening'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('70') })
    expect(validateOutput({ mode: 'observation', text: 'Fine.', factIds: ['reading.2026-09-99.evening'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('not on the sheet') })
    expect(validateOutput({ mode: 'observation', text: 'Fine.', factIds: ['aim.1'], cardIds: ['decision-fatigue-disputed'] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('not admitted') })
    expect(validateOutput({ mode: 'observation', text: 'Fine.', factIds: [], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: 'no fact cited' })
  })

  it('refuses a grade spoken beyond the cards, evidence without a card, a verdict word, a wrong mode, and a long line', () => {
    expect(validateOutput({ mode: 'observation', text: 'Strong evidence says naps help.', factIds: ['assoc.napped'], cardIds: ['naps-cognition'] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('strong evidence') })
    expect(validateOutput({ mode: 'observation', text: 'Research shows naps help.', factIds: ['assoc.napped'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('without citing') })
    expect(validateOutput({ mode: 'observation', text: 'A weak week.', factIds: ['aim.1'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('weak') })
    expect(validateOutput({ mode: 'sermon', text: 'Fine.', factIds: ['aim.1'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('mode') })
    expect(validateOutput({ mode: 'observation', text: Array.from({ length: 61 }, () => 'word').join(' '), factIds: ['aim.1'], cardIds: [] }, sheet, library)).toMatchObject({ ok: false, reason: expect.stringContaining('61 words') })
  })

  it('grounds a time and a count as written', () => {
    expect(numbersIn('At 20:00, 3 days and +7 on 5 naps')).toEqual(['20:00', '3', '7', '5'])
    expect(numberGrounded('20:00', sheet, ['aim.1'])).toBe(true)
    expect(numberGrounded('5', sheet, ['assoc.napped'])).toBe(true)
    expect(numberGrounded('5', sheet, ['aim.1'])).toBe(false)
  })
})

describe('the one tap a line may offer, and the week in three parts', () => {
  const withMore: FactSheet = {
    ...sheet,
    facts: [...sheet.facts, { id: 'cadence', tags: [], text: '', values: { w3: 18, w2: 19, w1: 17, w0: 6, depth: 'full', lowDemand: 0 } }, { id: 'untested', tags: [], text: '', values: { moves: 'walk-ten,cyclic-sigh', count: 2 } }],
  }

  it('allows an action only when the sheet makes it possible', () => {
    expect(validateAction(null, withMore)).toEqual({ ok: true, value: null })
    expect(validateAction(undefined, withMore)).toEqual({ ok: true, value: null })
    expect(validateAction({ kind: 'plan', aimId: 1, cue: 'afterBedtime' }, withMore)).toEqual({ ok: true, value: { kind: 'plan', aimId: 1, cue: 'afterBedtime' } })
    expect(validateAction({ kind: 'plan', aimId: 9, cue: 'afterBedtime' }, withMore).ok).toBe(false)
    expect(validateAction({ kind: 'plan', aimId: 1, cue: 'atDawn' }, withMore).ok).toBe(false)
    expect(validateAction({ kind: 'depth', value: 'short' }, withMore).ok).toBe(true)
    expect(validateAction({ kind: 'depth', value: 'short' }, sheet).ok).toBe(false)
    expect(validateAction({ kind: 'test', moveId: 'walk-ten' }, withMore).ok).toBe(true)
    expect(validateAction({ kind: 'test', moveId: 'nap-ten' }, withMore).ok).toBe(false)
    expect(validateAction({ kind: 'delete-everything' }, withMore).ok).toBe(false)
    const v = validateOutput({ mode: 'strategy', text: 'French waited 3 days. Pin it to a moment today.', factIds: ['aim.1'], cardIds: [], action: { kind: 'plan', aimId: 1, cue: 'afterBedtime' } }, withMore, library)
    expect(v).toMatchObject({ ok: true, value: { action: { kind: 'plan', aimId: 1 } } })
    expect(validateOutput({ mode: 'strategy', text: 'Pin it.', factIds: ['aim.1'], cardIds: [], action: { kind: 'plan', aimId: 9, cue: 'afterBedtime' } }, withMore, library)).toMatchObject({ ok: false, reason: expect.stringContaining('aim.9') })
  })

  it('holds each part of the review to the rules of a line', () => {
    expect(validateReview({ held: 'French waited 3 days and then moved.', didNot: 'Nothing else stalled.', change: 'Keep the cue at 20:00.', factIds: ['aim.1'], cardIds: [] }, withMore, library).ok).toBe(true)
    expect(validateReview({ held: 'Fine.', didNot: 'A lazy week.', change: 'Fine.', factIds: ['aim.1'], cardIds: [] }, withMore, library)).toMatchObject({ ok: false, reason: expect.stringContaining('didNot') })
    expect(validateReview({ held: 'Fine.', didNot: 'Fine.', change: '', factIds: ['aim.1'], cardIds: [] }, withMore, library)).toMatchObject({ ok: false, reason: 'change: no text' })
    expect(validateReview({ held: 'Read 99.', didNot: 'Fine.', change: 'Fine.', factIds: ['aim.1'], cardIds: [] }, withMore, library)).toMatchObject({ ok: false, reason: expect.stringContaining('99') })
    expect(validateReview({ held: 'Fine.', didNot: 'Fine.', change: 'Fine.', factIds: [], cardIds: [] }, withMore, library)).toMatchObject({ ok: false, reason: 'no fact cited' })
  })
})
