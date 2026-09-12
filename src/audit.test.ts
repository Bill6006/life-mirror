import { describe, expect, it } from 'vitest'
import { anchorSwapDue, CHIP_STRETCH, chipRetired, chipStates, readingProposals, SWAP_MIN_ANSWERS } from './audit'
import { addDays } from './blocks'
import type { CheckIn, DayContext } from './db'
import { activeAnchors, anchorFor, readingById, readings, setAnchorSwaps, type Answers, type Position, type ReadingId } from './readings'
import { blockReadings } from './readings'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], answers: Answers, extras?: CheckIn['extras']): CheckIn => ({ day, block, answers, startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000, extras })
const TODAY = '2026-11-30'

describe('the anchor swap guard', () => {
  const mood = readingById('mood')

  it('swaps in the alternate only after the stretch, for the lowest never-tapped phrase, never the middle, once per reading, logged and dated', () => {
    // Forty days of evenings, mood always on the middle or the fourth phrase: the first, second and fifth phrases go untapped.
    const evenings = Array.from({ length: 40 }, (_, i) => ci(addDays(TODAY, -(i + 1)), 'evening', { ...allAt(blockReadings('evening'), 3), mood: (i % 2 === 0 ? 3 : 4) as Position }))
    const due = anchorSwapDue(mood, evenings, [], TODAY)
    expect(due).toMatchObject({ reading: 'mood', position: 1, from: mood.anchors[0], to: (mood.alternates as string[])[0], at: TODAY, answers: 40 })
    expect(due?.stretchDays).toBe(45)
    // Under the answers threshold: nothing.
    expect(anchorSwapDue(mood, evenings.slice(0, SWAP_MIN_ANSWERS - 1), [], TODAY)).toBeNull()
    // A reading already swapped never swaps again.
    const swap = { reading: 'mood', position: 1, from: '', to: '', at: '2026-10-01', answers: 40, stretchDays: 45 }
    expect(anchorSwapDue(mood, evenings, [swap], TODAY)).toBeNull()
    // Every phrase tapped at least once: nothing.
    const spread = evenings.map((c, i) => ({ ...c, answers: { ...c.answers, mood: ((i % 5) + 1) as Position } }))
    expect(anchorSwapDue(mood, spread, [], TODAY)).toBeNull()
    // The middle is never swapped, even when it alone goes untapped.
    const noMiddle = evenings.map((c, i) => ({ ...c, answers: { ...c.answers, mood: ([1, 2, 4, 5][i % 4] as Position) } }))
    expect(anchorSwapDue(mood, noMiddle, [], TODAY)).toBeNull()
    // A band of hours has no alternates and never swaps.
    expect(anchorSwapDue(readingById('sleepHours'), evenings, [], TODAY)).toBeNull()
  })

  it('applies a swap to the phrase the check-in shows, and clears it', () => {
    const before = anchorFor('mood', 1)
    setAnchorSwaps([{ reading: 'mood', position: 1, to: 'Leaden — everything takes lifting' }])
    expect(anchorFor('mood', 1)).toBe('Leaden — everything takes lifting')
    expect(activeAnchors('mood')[0]).toBe('Leaden — everything takes lifting')
    expect(activeAnchors('mood')[2]).toBe(mood.anchors[2])
    setAnchorSwaps([])
    expect(anchorFor('mood', 1)).toBe(before)
  })
})

describe('chips that stop appearing', () => {
  it('stops a chip after thirty logged evenings without a tap, and one tap in Settings brings it back', () => {
    const evenings = Array.from({ length: CHIP_STRETCH }, (_, i) => ci(addDays(TODAY, -(i + 1)), 'evening', allAt(blockReadings('evening'), 3)))
    const states = chipStates(evenings, [], {}, TODAY)
    expect(states).toHaveLength(8)
    expect(chipRetired('nothingLanded', states)).toBe(true)
    expect(states.find((s) => s.id === 'nothingLanded')).toMatchObject({ evenings: 30, lastTap: null, retired: true })
    // One tap in the stretch keeps it.
    const tapped = evenings.map((c, i) => (i === 5 ? { ...c, extras: { nothingLanded: true as const } } : c))
    expect(chipRetired('nothingLanded', chipStates(tapped, [], {}, TODAY))).toBe(false)
    // Brought back today: the count restarts.
    const back = chipStates(evenings, [], { nothingLanded: TODAY }, TODAY)
    expect(back.find((s) => s.id === 'nothingLanded')).toMatchObject({ evenings: 0, retired: false, broughtBack: TODAY })
    // The necessities and the away chip count the same way.
    expect(chipRetired('shower', states)).toBe(true)
    const away: DayContext = { day: evenings[3].day, weekday: 1, withHer: false, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '20:00', changed: true, createdAt: '' }
    expect(chipRetired('away', chipStates(evenings, [away], {}, TODAY))).toBe(false)
    expect(chipStates(evenings.slice(0, 10), [], {}, TODAY).every((s) => !s.retired)).toBe(true)
  })
})

describe('retirement proposals', () => {
  it('proposes only a context reading that meets both conditions, with their numbers, and never decides', () => {
    // Fifty days, morning and evening. Hunger sits on one phrase every time; the next block's reading varies with the day, not with hunger.
    const checkins: CheckIn[] = []
    for (let i = 50; i >= 1; i--) {
      const day = addDays(TODAY, -i)
      const level = ((i % 4) + 1) as Position
      checkins.push(ci(day, 'morning', { ...allAt(blockReadings('morning'), level), hunger: 3, sleepHours: (((i * 7) % 5) + 1) as Position }))
      checkins.push(ci(day, 'evening', { ...allAt(blockReadings('evening'), level), hunger: 3 }))
    }
    const proposals = readingProposals(checkins, [], {}, TODAY)
    const hunger = proposals.find((p) => p.reading === 'hunger')
    expect(hunger).toBeDefined()
    expect(hunger?.distinction.kind).toBe('flat')
    expect(hunger?.distinction.sameShare).toBe(1)
    expect(hunger?.distinction.n).toBe(100)
    expect(Math.abs(hunger?.prediction.r ?? 1)).toBeLessThan(0.1)
    expect(hunger?.prediction.n).toBeGreaterThanOrEqual(40)
    // An ingredient is never proposed, however flat.
    expect(proposals.some((p) => !['hunger', 'sleepHours', 'sleepQuality', 'confidence', 'loneliness', 'socialEnergy'].includes(p.reading))).toBe(false)
    // Retired readings and readings kept for now are left alone.
    expect(readingProposals(checkins, ['hunger'], {}, TODAY).some((p) => p.reading === 'hunger')).toBe(false)
    expect(readingProposals(checkins, [], { hunger: addDays(TODAY, -10) }, TODAY).some((p) => p.reading === 'hunger')).toBe(false)
    expect(readingProposals(checkins, [], { hunger: addDays(TODAY, -70) }, TODAY).some((p) => p.reading === 'hunger')).toBe(true)
    expect(readings.length).toBe(13)
  })
})
