import { describe, expect, it } from 'vitest'
import { moveById } from './catalogue'
import type { StudyNight } from './db'
import { checkReason, keptCount, reasonPattern, smallerThan, studyVersions } from './studyNight'

const night = (day: string, weekday: StudyNight['weekday'], reason: StudyNight['reason'], decision: StudyNight['decision'] = 'notNow'): StudyNight => ({
  day,
  weekday,
  offerId: null,
  offeredMoveId: 'focused-block',
  decision,
  reason,
  supported: null,
  evidence: null,
  smallerMoveId: null,
  at: '',
})

describe('the study-night step', () => {
  it('offers study versions that fit an evening and were not offered today', () => {
    const all = studyVersions([])
    expect(all.length).toBeGreaterThanOrEqual(3)
    for (const m of all) {
      expect(m.family).toBe('study')
      expect(m.when).toContain('evening')
    }
    expect(studyVersions(['focused-block']).some((m) => m.id === 'focused-block')).toBe(false)
  })

  it('finds the smaller version: the most minutes still under the offered one', () => {
    // A 25-minute block steps down to the 20-minute practice questions: "twenty minutes instead?"
    expect(smallerThan(moveById('focused-block'))?.minutes).toBe(20)
    expect(smallerThan(moveById('practice-questions'))?.minutes).toBe(10)
    expect(smallerThan(moveById('retrieval-ten'))?.minutes).toBe(5)
    expect(smallerThan(moveById('two-minute-start'))).toBeNull()
  })

  it('checks tired against energy and too much on against overwhelm, and takes the other reasons as they are', () => {
    expect(checkReason('tired', { energy: 1 }).supported).toBe(true)
    expect(checkReason('tired', { energy: 2 }).supported).toBe(true)
    const contradicted = checkReason('tired', { energy: 4 })
    expect(contradicted.supported).toBe(false)
    expect(contradicted.evidence).toBe('Energy reads Charged')
    expect(checkReason('tired', {}).supported).toBeNull()
    expect(checkReason('tooMuch', { overwhelm: 5 }).supported).toBe(true)
    expect(checkReason('tooMuch', { overwhelm: 2 }).supported).toBe(false)
    expect(checkReason('noTime', { energy: 5 })).toEqual({ supported: null, evidence: null })
    expect(checkReason('didntWant', { energy: 5 })).toEqual({ supported: null, evidence: null })
  })

  it('says the pattern only when the same reason has come three times running', () => {
    // 2026-09-01, 09-08 and 09-15 are Tuesdays.
    const history = [night('2026-09-01', 2, 'tired'), night('2026-09-03', 4, 'noTime'), night('2026-09-08', 2, 'tired')]
    expect(reasonPattern(history, night('2026-09-15', 2, 'tired'))).toBe("You've said tired the last three Tuesdays.")
    expect(reasonPattern(history, night('2026-09-15', 2, 'noTime'))).toBeNull()
    expect(reasonPattern(history.slice(0, 1), night('2026-09-08', 2, 'tired'))).toBeNull()
    const run = [night('2026-09-02', 3, 'didntWant'), night('2026-09-04', 5, 'didntWant')]
    expect(reasonPattern(run, night('2026-09-07', 1, 'didntWant'))).toBe("You've said didn't want to the last three study nights.")
    expect(reasonPattern(run, night('2026-09-07', 1, null))).toBeNull()
  })

  it('counts nights kept plainly: started in full or smaller, out of all decided', () => {
    const records = [night('2026-09-01', 2, null, 'started'), night('2026-09-03', 4, 'tired', 'notNow'), night('2026-09-08', 2, 'tired', 'smaller')]
    expect(keptCount(records)).toEqual({ kept: 2, total: 3 })
    expect(keptCount([])).toEqual({ kept: 0, total: 0 })
  })
})
