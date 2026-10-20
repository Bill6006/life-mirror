import { describe, expect, it } from 'vitest'
import { CHARISMA_LADDER, isParked, moveById, moves, OBSERVED_ONLY, PASSIVE } from './catalogue'
import type { CheckIn } from './db'
import { candidatesFor, NOTHING, pickPassive, pickupCandidates, screen, situationOf, standingSetups, whyNotOf, type TodayState } from './offers'
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
const quiet: TodayState = { doneToday: [], offeredToday: [], hiddenFamilies: new Set(), doneRungs: new Map(), studyNight: false, withHer: true, churchDay: false, noTimeCeiling: null }

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

  it('never offers a parked entry, and after a "no time" keeps anything that long out of the block for a week', () => {
    const parked = moves.filter(isParked)
    expect(parked.length).toBe(3)
    for (const m of parked) expect(screen(m, s, quiet), m.id).toBe('parked')
    const evening = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 4), mood: 1 }))!
    for (const set of [candidatesFor(s, quiet), candidatesFor(evening, quiet), pickupCandidates('afternoon', quiet)]) {
      for (const c of set.candidates) expect(parked.some((m) => m.id === c.id), c.id).toBe(false)
    }
    const narrowed = { ...quiet, noTimeCeiling: 10 }
    for (const c of candidatesFor(s, narrowed).candidates.filter((c) => c.id !== NOTHING)) expect(moveById(c.id).minutes, c.id).toBeLessThan(10)
    const long = moves.find((m) => m.minutes >= 10 && m.when.includes('evening') && m.targets.some((t) => t.reading === 'stress' && t.direction === 'down') && !isParked(m) && !PASSIVE.has(m.id) && !OBSERVED_ONLY.has(m.id) && m.family !== 'study')
    if (long) expect(screen(long, s, narrowed)).toBe('noTime')
  })

  it('never offers bedtime itself, and never a passive item as the move', () => {
    expect([...OBSERVED_ONLY]).toEqual(['early-night', 'fixed-lights-out'])
    for (const id of OBSERVED_ONLY) expect(screen(moveById(id), s, quiet)).toBe('observed')
    for (const id of PASSIVE) if (!isParked(moveById(id))) expect(screen(moveById(id), s, quiet)).toBe('passive')
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
    // Rung three of the participation ladder also targets mood, an ingredient, so it can be the day's move.
    const rung = moveById(CHARISMA_LADDER[2])
    const evening = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 4), mood: 1 }))!
    expect(evening.target).toBe('mood')
    const solid = { ...evening, band: 'solid' as const }
    expect(screen(rung, solid, quiet)).toBe('rung')
    expect(screen(rung, solid, { ...quiet, doneRungs: new Map([[CHARISMA_LADDER[0], 1]]) })).toBeNull()
    expect(screen(rung, { ...solid, band: 'gettingBy' }, { ...quiet, doneRungs: new Map([[CHARISMA_LADDER[0], 1]]) })).toBe('rung')
    expect(screen(rung, { ...solid, band: 'gettingBy' }, { ...quiet, doneRungs: new Map([[CHARISMA_LADDER[0], 2]]) })).toBeNull()
  })
})

describe('cards, why not that, passive items and the pickup slot', () => {
  const s = situationOf(mk('afternoon', allAt(blockReadings('afternoon'), 3)))!
  const set = candidatesFor(s, quiet)

  it('explains why the expected move was not offered: the one done before, else the next most likely, and why not', () => {
    const chosen = set.candidates[0].id
    const reals = set.candidates.filter((c) => c.id !== chosen && c.id !== NOTHING).map((c) => c.id)
    const [other, third] = reals
    const chances = { [chosen]: 0.5, [other]: 0.1, [third]: 0.3, [NOTHING]: 0.1 }
    // The move done before, when another was drawn: the draw chose otherwise.
    expect(whyNotOf(other, chosen, chances, set.excluded)).toEqual({ moveId: other, reason: 'draw' })
    // None done before: the real move the draw gave the most chance after the one drawn, never nothing extra.
    expect(whyNotOf(null, chosen, chances, set.excluded)).toEqual({ moveId: third, reason: 'draw' })
    // Out today: its own reason.
    const outToday = candidatesFor(s, { ...quiet, offeredToday: [other] })
    expect(whyNotOf(other, chosen, chances, outToday.excluded)).toEqual({ moveId: other, reason: 'offeredToday' })
    expect(whyNotOf(chosen, chosen, { [chosen]: 1 }, set.excluded)).toBeNull()
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

describe('the needs the app can know, and a setup already made', () => {
  const afternoon = situationOf(mk('afternoon', { ...allAt(blockReadings('afternoon'), 3), stress: 4 }))!
  const evening = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 3), stress: 4 }))!
  const daylightMove = moves.find((m) => m.needs.includes('daylight') && m.targets.some((t) => t.reading === 'stress' && t.direction === 'down'))
  const quietMove = moves.find((m) => m.needs.includes('quiet') && m.when.includes('afternoon') && m.when.includes('evening') && m.targets.some((t) => t.reading === 'stress' && t.direction === 'down'))
  const setupMove = moves.find((m) => m.setup && m.targets.some((t) => t.reading === 'stress' && t.direction === 'down'))!

  it('keeps a daylight move for daylight hours, and a quiet move for a day at home or for the evening', () => {
    if (daylightMove) {
      expect(screen(daylightMove, afternoon, { ...quiet, daylight: false })).toBe('daylight')
      expect(screen(daylightMove, afternoon, { ...quiet, daylight: true })).toBeNull()
    }
    expect(quietMove).toBeDefined()
    expect(screen(quietMove!, afternoon, { ...quiet, atOffice: true })).toBe('quiet')
    expect(screen(quietMove!, afternoon, { ...quiet, atOffice: false })).toBeNull()
    expect(screen(quietMove!, evening, { ...quiet, atOffice: true })).toBeNull()
  })

  it('offers a one-time setup no more once it stands, and again once you said it came undone', () => {
    expect(screen(setupMove, afternoon, { ...quiet, standing: [setupMove.id] })).toBe('standing')
    expect(screen(setupMove, afternoon, quiet)).toBeNull()
    const done = [{ moveId: setupMove.id, day: '2026-09-01' }, { moveId: 'walk-ten', day: '2026-09-01' }]
    expect(standingSetups(done, {})).toEqual([setupMove.id])
    expect(standingSetups(done, { [setupMove.id]: '2026-09-05' })).toEqual([])
    expect(standingSetups([{ moveId: setupMove.id, day: '2026-09-09' }], { [setupMove.id]: '2026-09-05' })).toEqual([setupMove.id])
  })
})

describe('a daycare day', () => {
  const her = moves.find((m) => m.family === 'fatherhood')!
  const morning = situationOf(mk('morning', { ...allAt(blockReadings('morning'), 3), mood: 2 }))!
  const afternoon = situationOf(mk('afternoon', { ...allAt(blockReadings('afternoon'), 3), mood: 2 }))!
  const evening = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 3), mood: 2 }))!

  it('keeps her moves for the evening when pickup falls after the afternoon, and lets the afternoon through when it does not', () => {
    const daycare = { ...quiet, pickupTime: '17:30' }
    expect(screen(her, morning, daycare)).toBe('daycare')
    expect(screen(her, afternoon, daycare)).toBe('daycare')
    expect(screen(her, evening, daycare)).toBeNull()
    expect(screen(her, afternoon, { ...quiet, pickupTime: '15:00' })).toBeNull()
    expect(screen(her, afternoon, quiet)).toBeNull()
    expect(screen(moveById('walk-ten'), afternoon, daycare)).toBeNull()
  })
})

describe('her bedtime', () => {
  const her = moves.find((m) => m.family === 'fatherhood')!
  const evening = situationOf(mk('evening', { ...allAt(blockReadings('evening'), 3), mood: 2 }))!
  it('keeps her moves back once she is asleep, and lets them through before', () => {
    expect(screen(her, evening, { ...quiet, asleep: true })).toBe('asleep')
    expect(screen(her, evening, { ...quiet, asleep: false })).toBeNull()
    expect(screen(moveById('walk-ten'), evening, { ...quiet, asleep: true })).toBeNull()
  })
})
