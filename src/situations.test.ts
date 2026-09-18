import { describe, expect, it } from 'vitest'
import type { Fact, FactSheet } from './facts'
import { copy } from './copy'
import { chooseLine, phoneReview, SITUATIONS, usefulness } from './situations'

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

describe('what the engine sees early, and the one tap it offers', () => {
  const fading: Fact = { id: 'trajectory.1', tags: [], text: '', values: { name: 'French', aimId: 1, w3: 3, w2: 2, w1: 0, w0: 0, d3: 2, d2: 1, d1: 0, d0: 0, ageDays: 40 }, n: 5 }
  const planned = aim(1, { gapDays: 3, plan: 'afterBedtime' })

  it('offers the tap that does what the line says, on the cue with the best record', () => {
    expect(chooseLine(sheetOf([today, aim(1, {})]), [], [])?.action).toEqual({ kind: 'plan', aimId: 1, cue: 'afterBedtime' })
    const kept = aim(1, { cue_nextCheckIn_n: 3, cue_nextCheckIn_started: 3 })
    expect(chooseLine(sheetOf([today, kept]), [], [])?.action).toEqual({ kind: 'plan', aimId: 1, cue: 'nextCheckIn' })
    expect(chooseLine(sheetOf([today, aim(1, { skills: 0 })]), [], [])?.action).toBeNull()
  })

  it('sees a commitment fading before anything else does, and offers to pin it', () => {
    const c = chooseLine(sheetOf([today, planned, fading]), [], [])
    expect(c?.situationId).toBe('commitment-fading')
    expect(c?.text).toContain('French: 5 sittings in the two weeks before, none in the last two.')
    expect(c?.action).toEqual({ kind: 'plan', aimId: 1, cue: 'afterBedtime' })
    const thinning: Fact = { ...fading, values: { ...fading.values, w3: 0, w2: 0, w1: 3, w0: 0 } }
    expect(chooseLine(sheetOf([today, planned, thinning]), [], [])?.situationId).toBe('commitment-thinning')
    const young: Fact = { ...fading, values: { ...fading.values, ageDays: 10 } }
    expect(chooseLine(sheetOf([today, planned, young]), [], [])).toBeNull()
  })

  it('sees the record itself going quiet and offers a lighter check-in', () => {
    const cadence: Fact = { id: 'cadence', tags: [], text: '', values: { w3: 18, w2: 19, w1: 17, w0: 6, depth: 'full', lowDemand: 0 }, n: 60 }
    const c = chooseLine(sheetOf([cadence]), [], [])
    expect(c?.situationId).toBe('cadence-dropping')
    expect(c?.text).toContain('from about 18 a week to 6')
    expect(c?.action).toEqual({ kind: 'depth', value: 'short' })
    expect(chooseLine(sheetOf([{ ...cadence, values: { ...cadence.values, depth: 'short' } }]), [], [])).toBeNull()
    expect(chooseLine(sheetOf([{ ...cadence, values: { ...cadence.values, w0: 15 } }]), [], [])).toBeNull()
  })

  it('closes the loop on what it said yesterday, either way, and lets Not useful end it', () => {
    const done: Fact = { id: 'followup', tags: [], text: '', values: { day: '2026-09-17', about: 'French', aimId: 1, planned: 1, started: 1, done: 1, moved: 1, received: 'useful', text: 'x' } }
    const closed = chooseLine(sheetOf([aim(1, { plan: 'afterBedtime', gapDays: 0 }), done]), [], [])
    expect(closed?.situationId).toBe('loop-closed')
    expect(closed?.text).toBe('Yesterday’s line was about French; since then the record shows 1 step started, 1 marked done, the ladder moved once. That is the loop closing.')
    const open: Fact = { ...done, values: { ...done.values, planned: 0, started: 0, done: 0, moved: 0, received: 'untapped' } }
    const o = chooseLine(sheetOf([aim(1, { plan: 'afterBedtime', gapDays: 2 }), open]), [], [])
    expect(o?.situationId).toBe('loop-open')
    expect(o?.action).toEqual({ kind: 'plan', aimId: 1, cue: 'afterBedtime' })
    expect(chooseLine(sheetOf([aim(1, { plan: 'afterBedtime', gapDays: 2 }), { ...open, values: { ...open.values, received: 'not' } }]), [], [])).toBeNull()
    // Planned, and the moment passed: said once, and not while today already has its plan.
    const missed: Fact = { ...open, values: { ...open.values, planned: 1, missed: 1 } }
    expect(chooseLine(sheetOf([aim(1, { gapDays: 2 }), missed], 21), [], [])?.situationId).toBe('loop-planned')
    expect(chooseLine(sheetOf([aim(1, { plan: 'afterBedtime', gapDays: 2 }), missed], 21), [], [])).toBeNull()
  })

  it('reads a short night in its own light, and proposes a test the record has never run', () => {
    const short: Fact = { id: 'today.shortSleep', tags: [], text: '', values: { position: 1, word: 'Under 5 hours' } }
    expect(chooseLine(sheetOf([short]), [], [])?.text).toContain('Sleep read “Under 5 hours” this morning.')
    const nights: Fact = { id: 'assoc.shortSleep', tags: [], text: '', values: { diff: -8, with: 48, without: 56, times: 6, bands: 2 }, n: 6, tier: 'unclear' }
    expect(chooseLine(sheetOf([nights]), [], [])?.text).toContain('Afternoons after short nights read -8 against the others, 6 mornings.')
    const untested: Fact = { id: 'untested', tags: [], text: '', values: { moves: 'walk-ten,cyclic-sigh', count: 2 } }
    const p = chooseLine(sheetOf([untested]), [], [])
    expect(p?.situationId).toBe('propose-test')
    expect(p?.action?.kind).toBe('test')
    expect(p?.cardIds).toHaveLength(1)
    expect(p?.text).toContain('your record has never tested it')
  })

  it('reviews the week from the record alone: what held, what did not, one change', () => {
    const held: Fact = { id: 'trajectory.1', tags: [], text: '', values: { name: 'French', aimId: 1, w3: 1, w2: 2, w1: 2, w0: 3, d3: 1, d2: 1, d1: 2, d0: 2, ageDays: 40 }, n: 8 }
    const gone: Fact = { id: 'trajectory.2', tags: [], text: '', values: { name: 'Piano', aimId: 2, w3: 2, w2: 1, w1: 0, w0: 0, d3: 1, d2: 0, d1: 0, d0: 0, ageDays: 40 }, n: 3 }
    const r = phoneReview(sheetOf([held, gone, aim(2, { name: 'Piano', plan: 'afterBedtime', gapDays: 3 })]), [])
    expect(r.held).toBe('French: 3 started, 2 done.')
    expect(r.didNot).toBe('Piano: none in the last seven days.')
    expect(r.change).toContain('Piano: 3 sittings in the two weeks before')
    const quiet = phoneReview(sheetOf([]), [])
    expect(quiet).toEqual({ held: 'No commitment is on the record yet.', didNot: 'Nothing to set against the week yet.', change: 'Nothing the record supports changing; keep the cues that hold.' })
    // A commitment younger than the week is not set against a week it did not have.
    const young: Fact = { ...gone, values: { ...gone.values, w3: 0, w2: 0, ageDays: 2 } }
    expect(phoneReview(sheetOf([young]), [])).toMatchObject({ held: 'No commitment had a step started in the last seven days.', didNot: 'Piano: added 2 days ago, no step started yet.' })
  })
})
