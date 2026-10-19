import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { morningPoints } from './associations'
import { addDays } from './blocks'
import { factSheet } from './brainFlow'
import { askedLate, db, notAskedInTurn, type CheckIn } from './db'
import { factById, type Fact, type FactSheet } from './facts'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { askedReadings } from './settings'
import { chooseLine } from './situations'

// Stage 3, item 5: what a day's check-ins ask. Both Motivation and Confidence every morning since the
// owner's fix of 2026-10-19 (part 4 had them in turn, one each morning; those mornings keep their "Not
// asked"); after a morning that left the sleep readings unanswered, the afternoon asks them first, late,
// and the record, the sheet and the line say so (part 2). The learning engine's comparisons go on reading
// mornings alone.

const DAY = '2026-09-18'
const all = (block: 'morning' | 'afternoon', p: Position, ids: readonly ReadingId[] = blockReadings(block)): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], answers: Answers, asked?: ReadingId[]): CheckIn => ({ day, block, answers, ...(asked ? { asked } : {}), startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000 })

describe('Motivation and Confidence, both every morning (the owner’s fix of 2026-10-19)', () => {
  it('asks both every morning, day after day, and the rest of the morning as before: all thirteen', () => {
    for (let k = 0; k < 7; k++) {
      const morning = askedReadings('morning', 'full', [], { day: addDays(DAY, k), morning: null })
      expect(morning.filter((id) => id === 'motivation' || id === 'confidence')).toEqual(blockReadings('morning').filter((id) => id === 'motivation' || id === 'confidence'))
      expect(morning).toEqual(blockReadings('morning'))
      expect(morning).toHaveLength(13)
    }
  })

  it('keeps "Not asked" on a morning from before, which asked one of the two', () => {
    const before = blockReadings('morning').filter((id) => id !== 'confidence') as ReadingId[]
    expect(notAskedInTurn(ci(DAY, 'morning', all('morning', 3, before), before))).toBe('confidence')
    expect(notAskedInTurn(ci(DAY, 'morning', all('morning', 3), [...blockReadings('morning')]))).toBeNull()
  })

  it('leaves short depth, the afternoon and the evening as they were', () => {
    expect(askedReadings('morning', 'short', [], { day: DAY, morning: null })).toEqual(['mood', 'stress', 'energy'].filter((id) => blockReadings('morning').includes(id as ReadingId)))
    expect(askedReadings('evening', 'full', [], { day: DAY, morning: null })).toEqual(blockReadings('evening'))
    expect(askedReadings('morning', 'full', [])).toEqual(blockReadings('morning'))
  })
})

describe('sleep asked late, after a morning without it (stage 3, item 5, part 2)', () => {
  it('asks the two sleep readings first at an afternoon after no morning, and only the one a morning left unanswered', () => {
    expect(askedReadings('afternoon', 'full', [], { day: DAY, morning: null })).toEqual(['sleepHours', 'sleepQuality', ...blockReadings('afternoon')])
    expect(askedReadings('afternoon', 'full', [], { day: DAY, morning: { answers: { sleepHours: 3 } } })).toEqual(['sleepQuality', ...blockReadings('afternoon')])
    expect(askedReadings('afternoon', 'full', [], { day: DAY, morning: { answers: { sleepHours: 3, sleepQuality: 4 } } })).toEqual(blockReadings('afternoon'))
  })

  it('never at short depth, low-demand mode’s included, and never a sleep reading you retired', () => {
    expect(askedReadings('afternoon', 'short', [], { day: DAY, morning: null })).not.toContain('sleepHours')
    expect(askedReadings('afternoon', 'full', ['sleepHours'], { day: DAY, morning: null })).toEqual(['sleepQuality', ...blockReadings('afternoon')])
  })

  it('marks them asked late on the afternoon’s record alone', () => {
    const asked = askedReadings('afternoon', 'full', [], { day: DAY, morning: null }) as ReadingId[]
    expect(askedLate(ci(DAY, 'afternoon', {}, asked))).toEqual(['sleepHours', 'sleepQuality'])
    expect(askedLate(ci(DAY, 'morning', {}, blockReadings('morning') as ReadingId[]))).toEqual([])
    expect(askedLate(ci(DAY, 'afternoon', {}))).toEqual([])
  })

  it('never sets a late answer against the afternoon’s own readings: the comparisons read mornings alone', () => {
    const short = (c: CheckIn) => (c.answers.sleepHours ?? 9) <= 2
    const days = Array.from({ length: 12 }, (_, k) => addDays(DAY, -(k + 1)))
    const late = days.flatMap((d) => [ci(d, 'morning', all('morning', 3, ['mood', 'energy', 'stress'])), ci(d, 'afternoon', { ...all('afternoon', 3), sleepHours: 1 }, ['sleepHours', 'sleepQuality', ...blockReadings('afternoon')])])
    expect(morningPoints(late, DAY, short).filter((p) => p.event)).toHaveLength(0)
    // The probe that could have said yes: the same nights answered in the morning are events.
    const onTime = days.flatMap((d) => [ci(d, 'morning', { ...all('morning', 3, ['mood', 'energy', 'stress']), sleepHours: 1 }), ci(d, 'afternoon', all('afternoon', 3))])
    expect(morningPoints(onTime, DAY, short).filter((p) => p.event)).toHaveLength(12)
  })

  it('has the short-night line say when the night was read, never “this morning” for a late answer', () => {
    const today: Fact = { id: 'week.today', tags: [], text: 'Today is Friday.', values: { weekday: 'Friday', bedtime: '20:00', hour: 14 } }
    const sheet = (late: boolean): FactSheet => ({ version: 1, day: DAY, builtAt: '', hour: 14, weeks: 3, days: 22, direction: null, said: [], facts: [today, { id: 'today.shortSleep', tags: ['sleep'], text: '', values: { position: 1, word: 'Under 5 hours', ...(late ? { late: 1 } : {}) } }] })
    const line = (late: boolean) => chooseLine(sheet(late), [], [])
    expect(line(false)?.situationId).toBe('short-night-today')
    expect(line(false)?.text).toContain('Sleep read “Under 5 hours” this morning.')
    expect(line(true)?.text).toContain('Sleep read “Under 5 hours” when asked late this afternoon.')
    expect(factById(sheet(true), 'today.shortSleep')).toBeDefined()
  })
})

describe('the day’s sheet when the night was read late (stage 3, item 5, part 2)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('carries the afternoon’s late answer as today’s short night, and says it was asked late, wherever it shows', async () => {
    const asked = ['sleepHours', 'sleepQuality', ...blockReadings('afternoon')] as ReadingId[]
    await db.checkins.add(ci(DAY, 'afternoon', { ...all('afternoon', 3), sleepHours: 1, sleepQuality: 2 }, asked))
    const sheet = await factSheet(DAY, new Date(2026, 8, 18, 15, 0))
    const short = factById(sheet, 'today.shortSleep')
    expect(short?.values).toMatchObject({ position: 1, late: 1 })
    expect(short?.text).toBe('Sleep hours read “Under 5 hours”, asked late at this afternoon’s check-in.')
    expect(factById(sheet, 'context.sleepHours')?.text).toContain('(1 of 5), asked late, at the afternoon check-in')
    expect(factById(sheet, 'context.sleepHours')?.values).toMatchObject({ late: 1 })
  })

  it('says nothing late of a night read in the morning', async () => {
    await db.checkins.add(ci(DAY, 'morning', { ...all('morning', 3), sleepHours: 1 }, blockReadings('morning') as ReadingId[]))
    const sheet = await factSheet(DAY, new Date(2026, 8, 18, 10, 0))
    expect(factById(sheet, 'today.shortSleep')?.text).toBe('Sleep hours read “Under 5 hours” this morning.')
    expect(factById(sheet, 'today.shortSleep')?.values).not.toHaveProperty('late')
    expect(factById(sheet, 'context.sleepHours')?.text).not.toContain('asked late')
  })
})

describe('the reading a morning did not ask, in turn, marked “not asked” (the owner’s words; shown since 2026-10-18)', () => {
  it('names the one of Motivation and Confidence a morning left for the next, and nothing for any other check-in', () => {
    expect(notAskedInTurn({ block: 'morning', asked: ['mood', 'motivation'] })).toBe('confidence')
    expect(notAskedInTurn({ block: 'morning', asked: ['mood', 'confidence'] })).toBe('motivation')
    // Both, neither, before the turns (no list kept), a shorter morning, or any other block: nothing marked.
    expect(notAskedInTurn({ block: 'morning', asked: ['motivation', 'confidence'] })).toBeNull()
    expect(notAskedInTurn({ block: 'morning', asked: ['mood', 'energy', 'stress'] })).toBeNull()
    expect(notAskedInTurn({ block: 'morning' })).toBeNull()
    expect(notAskedInTurn({ block: 'afternoon', asked: ['motivation'] })).toBeNull()
    // A reading you retired is never marked as not asked.
    expect(notAskedInTurn({ block: 'morning', asked: ['mood', 'motivation'] }, ['confidence'])).toBeNull()
  })
})
