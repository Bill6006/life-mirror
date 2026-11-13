import { describe, expect, it } from 'vitest'
import { allowedFirmness, deliverySignals } from '../../src/firmness'
import type { FactSheet } from '../../src/factTypes'
import { askInstructions, claudeInstructions, firmBlock, lineSystem, reviewSystem } from './prompt'

// The one standard reaches the writers (Phase 3, 2026-11-12). The day's line and the weekly review are told how a
// comparison stands and to say it no stronger; under Adaptive, Supportive is asked only for an association below a
// steady pattern, which is what the shared check allows. Ask's instructions are left exactly as they were.

const RULE =
  "- A comparison in the record says where it stands, in its fact's own words: too few to compare yet, no clear pattern yet, a lead that is not yet a pattern, or a steady pattern. Say it no stronger than that: only a steady pattern is a pattern, a lead is tentative, and too few or no clear pattern is never a finding. It says what went with what, never why."
const ADAPTIVE = 'Supportive for good news, or where it rests only on an association that is not a steady pattern, a forecast, one day set against others or a small count.'

/** A sheet holding one association fact at a standing. */
const sheetAt = (standing: string): FactSheet => ({ day: '2026-11-12', builtAt: '', facts: [{ id: 'assoc.napped', tags: [], text: '', values: { standing } }] }) as unknown as FactSheet

describe('the writers and the one standard', () => {
  it('tells the day’s line and the weekly review how a comparison stands, once in every prompt that carries the shared rules', () => {
    for (const system of [lineSystem(), reviewSystem(), claudeInstructions('line'), claudeInstructions('review'), lineSystem('adaptive'), claudeInstructions('review', 'hardCoach')]) {
      expect(system.split(RULE).length - 1, system.slice(0, 60)).toBe(1)
    }
    // The coach's picks say no comparison and carry no shared rules.
    expect(claudeInstructions('coach')).not.toContain('A comparison in the record')
  })

  it('asks Supportive under Adaptive only for an association that is not a steady pattern, as the shared check allows', () => {
    for (const what of ['line', 'candidates', 'review'] as const) expect(firmBlock('adaptive', what)).toContain(ADAPTIVE)
    // The check both writers answer to: an observation resting on one association.
    const allowed = (standing: string) => allowedFirmness('adaptive', deliverySignals('observation', ['assoc.napped'], [], sheetAt(standing)))
    // Below a steady pattern it is tentative: Supportive may be used, Hard Coach never.
    expect(allowed('lead')).toEqual(['supportive', 'balanced'])
    expect(allowed('noPattern')).toEqual(['supportive', 'balanced'])
    // At a steady pattern it is a pattern: no longer Supportive by default, so the instruction no longer asks for it.
    expect(allowed('pattern')).toEqual(['balanced', 'hardCoach'])
  })

  it('leaves Ask’s instructions as they were: neither line is in them, and its Adaptive line reads as before', () => {
    for (const task of ['ask', 'deep'] as const) {
      for (const firm of [null, 'adaptive', 'supportive'] as const) {
        const said = askInstructions(task, 200, firm)
        expect(said).not.toContain('A comparison in the record says where it stands')
        expect(said).not.toContain('that is not a steady pattern')
      }
    }
    expect(askInstructions('ask', 200, 'adaptive')).toContain('Supportive for good news, or where it rests only on an early sign, an association or a small count.')
  })
})
