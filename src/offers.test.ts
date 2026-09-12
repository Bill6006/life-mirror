import { describe, expect, it } from 'vitest'
import { choose, COIN_FLIP_RATE, FLAT, seeded, type Candidate } from './bandit'
import { CHARISMA_LADDER, isProposed, moveById, moves, OBSERVED_ONLY, PASSIVE } from './catalogue'
import type { CheckIn } from './db'
import { alternativeFor, candidatesFor, chooseFor, NOTHING, pickPassive, pickupCandidates, screen, situationOf, whyNotThat, type TodayState } from './offers'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { INGREDIENTS } from './score'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const mk = (block: CheckIn['block'], answers: Answers): CheckIn => ({
  day: '2026-09-11',
  block,
  answers,
  startedAt: '',
  completedAt: '2026-09-11T18:00:00.000Z',
  updatedAt: '',
  activeMs: 0,
})
const quiet: TodayState = { doneToday: [], offeredToday: [], hiddenFamilies: new Set(), doneRungs: new Map(), studyNight: false, withHer: true, churchDay: false }
const flat = () => FLAT

describe('the situation', () => {
  it('is the block plus the lowest ingredient with a clear direction, with its band', () => {
    const s = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 4), stress: 5 }))
    // Mood, energy, focus at 75; stress at 0; overwhelm and irritation at 25: a mean of 46, Getting by.
    expect(s).toMatchObject({ block: 'evening', target: 'stress', key: 'evening:stress', band: 'gettingBy', reading: 46 })
    expect(situationOf(mk('afternoon', allAt(blockReadings('afternoon'), 3)))?.target).toBe('mood')
    expect(situationOf(mk('morning', { mood: 2 }))).toBeNull()
  })

  it('never targets a context reading, however low', () => {
    const s = situationOf(mk('morning', { ...allAt(blockReadings('morning'), 4), hunger: 5, loneliness: 5, sleepQuality: 1 }))
    expect(INGREDIENTS[s?.target as string]).toBeDefined()
  })
})

describe('the candidate set', () => {
  const s = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 4), stress: 5 }))!

  it('holds only moves that fit the block and push the target the better way, plus nothing today', () => {
    const { candidates } = candidatesFor(s, quiet)
    expect(candidates.length).toBeGreaterThanOrEqual(3)
    expect(candidates.some((c) => c.id === NOTHING)).toBe(true)
    for (const c of candidates.filter((c) => c.id !== NOTHING)) {
      const m = moveById(c.id)
      expect(m.when).toContain('evening')
      expect(m.targets.some((t) => t.reading === 'stress' && t.direction === 'down')).toBe(true)
    }
  })

  it('never offers a Phase 9 proposal until Green wires it', () => {
    const proposed = moves.filter(isProposed)
    expect(proposed.length).toBeGreaterThan(0)
    for (const m of proposed) expect(screen(m, s, quiet), m.id).toBe('proposed')
    const evening = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 4), mood: 1 }))!
    for (const set of [candidatesFor(s, quiet), candidatesFor(evening, quiet), pickupCandidates('afternoon', quiet)]) {
      for (const c of set.candidates) expect(proposed.some((m) => m.id === c.id), c.id).toBe(false)
    }
  })

  it('never offers bedtime itself, and never a passive item as the move', () => {
    expect([...OBSERVED_ONLY]).toEqual(['early-night', 'fixed-lights-out'])
    for (const id of OBSERVED_ONLY) expect(screen(moveById(id), s, quiet)).toBe('observed')
    for (const id of PASSIVE) expect(screen(moveById(id), s, quiet)).toBe('passive')
    const { candidates } = candidatesFor(s, quiet)
    for (const c of candidates) {
      expect(OBSERVED_ONLY.has(c.id)).toBe(false)
      expect(PASSIVE.has(c.id)).toBe(false)
    }
  })

  it("leaves study to its own evening step, and lets the week decide time with her and church; the draw only picks the version", () => {
    const study = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 4), focus: 1 }))!
    const retrieval = moveById('retrieval-ten')
    const confidenceTarget = { ...study, target: retrieval.targets[0].reading }
    expect(screen(retrieval, confidenceTarget, quiet)).toBe('study')
    expect(screen(retrieval, confidenceTarget, { ...quiet, studyNight: true })).toBe('study')
    const her = moveById('time-with-her')
    const moodTarget = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 4), mood: 1 }))!
    expect(screen(her, moodTarget, { ...quiet, withHer: false })).toBe('schedule')
    expect(screen(her, moodTarget, quiet)).toBeNull()
    const church = moveById('church-early')
    const morningMood = situationOf(mk('morning', { ...allAt(blockReadings('morning'), 4), mood: 1 }))!
    expect(screen(church, morningMood, quiet)).toBe('schedule')
    expect(screen(church, morningMood, { ...quiet, churchDay: true })).toBeNull()
  })

  it('in the Empty band offers only low-effort rest, steadying and ending the day well; Worn down bars high effort', () => {
    const empty = situationOf(mk('evening', { mood: 1, irritation: 5, energy: 1, hunger: 3, stress: 5, focus: 1, overwhelm: 5, loneliness: 3 }))!
    expect(empty.band).toBe('empty')
    for (const c of candidatesFor(empty, quiet).candidates.filter((c) => c.id !== NOTHING)) {
      const m = moveById(c.id)
      expect(['rest', 'steadying', 'ending']).toContain(m.family)
      expect(m.effort).toBe('low')
    }
    const worn = { ...s, band: 'wornDown' as const }
    for (const c of candidatesFor(worn, quiet).candidates.filter((c) => c.id !== NOTHING)) expect(moveById(c.id).effort).not.toBe('high')
  })

  it('leaves out a hidden family, anything offered today, and conflicts with what was done', () => {
    const hidden = { ...quiet, hiddenFamilies: new Set(['faith']) }
    for (const c of candidatesFor(s, hidden).candidates.filter((c) => c.id !== NOTHING)) expect(moveById(c.id).family).not.toBe('faith')
    const first = candidatesFor(s, quiet).candidates.find((c) => c.id !== NOTHING)!
    expect(screen(moveById(first.id), s, { ...quiet, offeredToday: [first.id] })).toBe('offeredToday')
    const conflicting = moveById(first.id).conflicts[0]
    if (conflicting) expect(screen(moveById(first.id), s, { ...quiet, doneToday: [conflicting] })).toBe('conflict')
  })

  it('offers the harder rung only when the band allows it', () => {
    // "Say the thing" is rung three and targets irritation in the evening, an ingredient, so it can be the day's move.
    const rung = moveById(CHARISMA_LADDER[2])
    const evening = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 4), irritation: 5 }))!
    expect(evening.target).toBe('irritation')
    const solid = { ...evening, band: 'solid' as const }
    expect(screen(rung, solid, quiet)).toBe('rung')
    expect(screen(rung, solid, { ...quiet, doneRungs: new Map([[CHARISMA_LADDER[0], 1]]) })).toBeNull()
    expect(screen(rung, { ...solid, band: 'gettingBy' }, { ...quiet, doneRungs: new Map([[CHARISMA_LADDER[0], 1]]) })).toBe('rung')
    expect(screen(rung, { ...solid, band: 'gettingBy' }, { ...quiet, doneRungs: new Map([[CHARISMA_LADDER[0], 2]]) })).toBeNull()
  })
})

describe('the draw', () => {
  const cands: Candidate[] = [
    { id: 'a', effort: 'low' },
    { id: 'b', effort: 'medium' },
    { id: 'c', effort: 'high' },
  ]

  it('is a coin flip about one time in five, and says so', () => {
    const rng = seeded(7)
    let flips = 0
    const n = 4000
    for (let i = 0; i < n; i++) if (choose(cands, flat, rng)!.coinFlip) flips++
    expect(flips / n).toBeGreaterThan(COIN_FLIP_RATE - 0.03)
    expect(flips / n).toBeLessThan(COIN_FLIP_RATE + 0.03)
  })

  it('with flat beliefs favours the lower starting effort but keeps trying the others', () => {
    const rng = seeded(11)
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 4000; i++) {
      const ch = choose(cands, flat, rng)!
      if (!ch.coinFlip) counts[ch.id]++
    }
    expect(counts.a).toBeGreaterThan(counts.b)
    expect(counts.b).toBeGreaterThan(counts.c)
    expect(counts.c).toBeGreaterThan(0)
  })

  it('follows a stronger belief when one exists, and names a runner-up', () => {
    const beliefs = (id: string) => (id === 'c' ? { mean: 4, sd: 0.2, n: 30 } : FLAT)
    const rng = seeded(3)
    let c = 0
    for (let i = 0; i < 500; i++) {
      const ch = choose(cands, beliefs, rng)!
      if (!ch.coinFlip && ch.id === 'c') c++
    }
    expect(c).toBeGreaterThan(380)
    expect(choose(cands, flat, seeded(5))!.runnerUp).not.toBeNull()
    expect(choose([], flat)).toBeNull()
  })

  it('gives two comparable opportunities different candidates over a few draws', () => {
    const s = situationOf(mk('afternoon', allAt(blockReadings('afternoon'), 3)))!
    const set = candidatesFor(s, quiet)
    const rng = seeded(21)
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) seen.add(chooseFor(set, flat, rng)!.id)
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('cards, why not that, passive items and the pickup slot', () => {
  const s = situationOf(mk('afternoon', allAt(blockReadings('afternoon'), 3)))!
  const set = candidatesFor(s, quiet)

  it('names the least-offered other real candidate as the alternative', () => {
    const chosen = set.candidates.find((c) => c.id !== NOTHING)!.id
    const alt = alternativeFor(chosen, set, [])!
    expect(alt).not.toBe(chosen)
    expect(alt).not.toBe(NOTHING)
    expect(alternativeFor(chosen, { candidates: [{ id: chosen, effort: 'low' }, { id: NOTHING, effort: 'low' }], excluded: new Map() }, [])).toBeNull()
  })

  it('explains why the expected move was not offered', () => {
    const chosen = set.candidates[0].id
    const other = set.candidates.find((c) => c.id !== chosen && c.id !== NOTHING)!.id
    const choice = { id: chosen, coinFlip: false, samples: {}, runnerUp: other }
    expect(whyNotThat(other, choice, set)).toEqual({ moveId: other, reason: 'draw' })
    expect(whyNotThat(null, { ...choice, coinFlip: true }, set)).toEqual({ moveId: other, reason: 'coinFlip' })
    const outToday = candidatesFor(s, { ...quiet, offeredToday: [other] })
    const choice2 = { id: chosen, coinFlip: false, samples: {}, runnerUp: null }
    expect(whyNotThat(other, choice2, outToday)).toEqual({ moveId: other, reason: 'offeredToday' })
    expect(whyNotThat(chosen, choice2, set)).toBeNull()
  })

  it('picks a passive item that fits the block and was not offered or done today', () => {
    const p = pickPassive('morning', quiet, [])!
    expect(PASSIVE.has(p.id)).toBe(true)
    expect(p.when).toContain('morning')
    expect(pickPassive('morning', { ...quiet, offeredToday: [p.id] }, [])?.id).not.toBe(p.id)
  })

  it('fills the pickup slot with short, low-effort rest and steadying', () => {
    const { candidates } = pickupCandidates('afternoon', quiet)
    expect(candidates.length).toBeGreaterThanOrEqual(2)
    for (const c of candidates) {
      const m = moveById(c.id)
      expect(m.minutes).toBeLessThanOrEqual(10)
      expect(m.effort).toBe('low')
      expect(['rest', 'steadying', 'food']).toContain(m.family)
    }
    expect(candidates.some((c) => c.id === NOTHING)).toBe(false)
  })
})
