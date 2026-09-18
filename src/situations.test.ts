import { describe, expect, it } from 'vitest'
import type { Fact, FactSheet } from './facts'
import { copy } from './copy'
import { chooseLine, SITUATIONS, usefulness } from './situations'

// The judgment engine: the true situation with the most behind it is said, a situation rests
// after it was said, and how a line was received lifts or lowers it next time.

function sheetOf(facts: Fact[], hour = 8): FactSheet {
  return { version: 1, day: '2026-09-18', builtAt: '', hour, weeks: 3, days: 22, direction: null, said: [], facts }
}
const today: Fact = { id: 'week.today', tags: [], text: 'Today is Friday.', values: { weekday: 'Friday', bedtime: '20:00', hour: 8 } }
const aim = (id: number, values: Record<string, number | string | null>): Fact => ({ id: `aim.${id}`, tags: ['study'], text: '', values: { kind: 'certification', name: 'French', step: 'Ten words · say it', minutes: 10, gapDays: null, blocked: null, plan: null, planStarted: 0, open: 0, skills: 1, lowRungs: 1, highRungs: 0, top: 0, ...values } })

describe('the judgment engine', () => {
  it('lists distinct situations, each with a line, a mode and a cooldown', () => {
    const ids = SITUATIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThan(20)
    for (const s of SITUATIONS) expect(s.cooldownDays).toBeGreaterThan(0)
    for (const s of SITUATIONS) expect((copy.brain.lines as Record<string, string>)[s.id], s.id).toBeTruthy()
  })

  it('says the first skill is missing, with the commitment’s name', () => {
    const c = chooseLine(sheetOf([today, aim(1, { skills: 0 })]), [], [])
    expect(c?.situationId).toBe('first-skill')
    expect(c?.text).toBe('French has no skill on its ladder yet. Add the first; nothing can move until it does.')
    expect(c?.factIds).toEqual(['aim.1'])
  })

  it('asks for a cue before her bedtime and not after, naming the step', () => {
    const c = chooseLine(sheetOf([today, aim(1, {})]), [], [])
    expect(c?.situationId).toBe('say-when')
    expect(c?.text).toContain('French: the step is Ten words · say it.')
    expect(chooseLine(sheetOf([today, aim(1, {})], 21), [], [])).toBeNull()
  })

  it('ranks a stretch above everything, and rests it for two days once said', () => {
    const stretch: Fact = { id: 'stretch', tags: [], text: '', values: { under: 4, of: 6, chips: 1, necessities: 0 }, n: 6 }
    const facts = [today, aim(1, { skills: 0 }), stretch]
    const c = chooseLine(sheetOf(facts), [], [])
    expect(c?.situationId).toBe('stretch')
    expect(c?.text).toContain('4 of the last 6 blocks')
    expect(chooseLine(sheetOf(facts), [{ day: '2026-09-17', situationId: 'stretch' }], [])?.situationId).toBe('first-skill')
    expect(chooseLine(sheetOf(facts), [{ day: '2026-09-10', situationId: 'stretch' }], [])?.situationId).toBe('stretch')
  })

  it('switches a cue that is not kept to the one with the better record', () => {
    const f = aim(1, { cue_afterPickup_n: 4, cue_afterPickup_started: 1, cue_afterBedtime_n: 2, cue_afterBedtime_started: 2, plan: 'afterPickup' })
    const c = chooseLine(sheetOf([today, f]), [], [])
    expect(c?.situationId).toBe('cue-switch')
    expect(c?.text).toBe('After pickup kept 1 of 4 plans. Plans stall on the cue, not on the will: try after her bedtime.')
  })

  it('lowers a situation that was not useful, and lifts one that was', () => {
    expect(usefulness('x', [])).toBe(1)
    expect(usefulness('x', [{ situationId: 'x', answer: 'not' }, { situationId: 'x', answer: 'not' }])).toBeCloseTo(0.6)
    expect(usefulness('x', [{ situationId: 'x', answer: 'useful' }])).toBeCloseTo(1.1)
    expect(usefulness('x', Array.from({ length: 9 }, () => ({ situationId: 'x', answer: 'not' as const })))).toBe(0.3)
    // A missing first skill outranks the monthly direction line until it was twice not useful; strong evidence behind the other then tips it.
    const facts = [today, aim(1, { skills: 0 }), { id: 'direction', tags: [], text: '', values: { direction: 'One line' } }, { id: 'becoming', tags: [], text: '', values: { study: 0, conversations: 0, faith: 0, her: 0 } }]
    expect(chooseLine(sheetOf(facts), [], [])?.situationId).toBe('first-skill')
    expect(chooseLine(sheetOf(facts), [], [{ situationId: 'first-skill', answer: 'not' }, { situationId: 'first-skill', answer: 'not' }])?.situationId).toBe('direction-counts')
    // Warnings with strong evidence outrank a recommendation with none.
    expect(chooseLine(sheetOf([...facts, { id: 'necessities.3d', tags: [], text: '', values: { misses: 2 }, n: 3 }]), [], [])?.situationId).toBe('necessities-missed')
  })

  it('reads the chips like for like, in words that say which way', () => {
    const nap: Fact = { id: 'assoc.napped', tags: [], text: '', values: { diff: 6, with: 60, without: 54, times: 5, bands: 2 }, n: 5, tier: 'unclear' }
    expect(chooseLine(sheetOf([nap]), [], [])?.text).toContain('read +6 against the mornings without, 5 naps')
    const caffeine: Fact = { id: 'assoc.heavyCaffeine', tags: [], text: '', values: { diff: -9, with: 50, without: 59, times: 4, bands: 2 }, n: 4, tier: 'unclear' }
    expect(chooseLine(sheetOf([caffeine]), [], [])?.situationId).toBe('caffeine-under')
    expect(chooseLine(sheetOf([caffeine]), [], [])?.text).toContain('read 9 under the others, 4 mornings')
  })
})
