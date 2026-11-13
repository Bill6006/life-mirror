import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The comparisons' guard, completed (Phase 3, 2026-11-12). The chance behind a standing is new math, and it is asked
// of the core in five places: where the evidence is read, where the sheet's family is gathered, in best days, in the
// sixteen pairs and for your own chips. Each runs under one guard (counted/fault.ts): if the core throws, the sheet
// is still built, the surface says the comparison could not be worked out, and the failure rides the sheet by its
// error's name alone. The core's three entry points are made to throw here on demand.
const state = vi.hoisted(() => ({ compare: false, ratesBy: false, standings: false as false | 'all' | 'own' | 'empty' }))
vi.mock('./counted/compare', async (original) => {
  const real = await original<typeof import('./counted/compare')>()
  const fail = () => {
    throw new RangeError('a stand-in failure that names 2026-09-29')
  }
  return {
    ...real,
    compare: (...args: Parameters<typeof real.compare>) => (state.compare ? fail() : real.compare(...args)),
    ratesBy: (...args: Parameters<typeof real.ratesBy>) => (state.ratesBy ? fail() : real.ratesBy(...args)),
    standings: (...args: Parameters<typeof real.standings>) => (state.standings === 'all' || (state.standings === 'own' && args[0].some((c) => c.id.startsWith('own.'))) || (state.standings === 'empty' && args[0].length === 0) ? fail() : real.standings(...args)),
  }
})

import { coolingLineWords } from './associationWords'
import { comesBeforeGuarded } from './beforeDays'
import { addDays } from './blocks'
import { evidenceWithStandings, factSheet } from './brainFlow'
import { chipAnswerFrom, ownChipAnswerFrom } from './checkinAnswers'
import { comparisonFaults, resetComparisonFaults } from './counted/fault'
import { db, getSettings, updateSettings, type CheckIn } from './db'
import { evidence } from './evidenceFlow'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { ownChipsOf, withOwnChipAdded } from './settings'
import { bestDays } from './weekly'

const FAILED = 'the comparison could not be worked out on this phone just now'

function ci(day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn {
  const answers: Answers = Object.fromEntries(blockReadings(block).map((id) => [id, 3]))
  for (const id of Object.keys(answers) as ReadingId[]) {
    if (['stress', 'overwhelm', 'irritation'].includes(id)) answers[id] = (6 - p) as Position
    else if (['mood', 'energy', 'focus'].includes(id)) answers[id] = p
  }
  return { day, block, answers, startedAt: '', completedAt: `${day}T21:00:00.000Z`, updatedAt: '', activeMs: 30_000, extras }
}

const eight = (back: number) => [3, 4, 6, 10].includes((back - 1) % 14)

/**
 * Four weeks before a day: mornings, and evenings that started the same; something rattled on eight of them in no
 * rhythm, the mornings after those low. Each test stands on a day of its own, so no chance kept from another answers it.
 */
function fourWeeks(today: string, extras: (back: number) => CheckIn['extras'] | undefined = (back) => (eight(back) ? { coolingOff: true } : undefined)): CheckIn[] {
  const rows: CheckIn[] = []
  for (let back = 29; back >= 2; back--) {
    const day = addDays(today, -back)
    rows.push(ci(day, 'evening', 3, extras(back)), ci(addDays(day, 1), 'morning', eight(back) ? 2 : 4))
  }
  return rows
}

describe('the comparisons’ guard, wherever the core is asked', () => {
  beforeEach(async () => {
    Object.assign(state, { compare: false, ratesBy: false, standings: false })
    resetComparisonFaults()
    await db.delete()
    await db.open()
  })

  it('says every comparison as usual while nothing fails: the probe that could say yes', async () => {
    const day = '2026-09-30'
    await db.checkins.bulkAdd(fourWeeks(day))
    const ev = await evidence(day)
    expect(ev.failed).toBeUndefined()
    expect(typeof ev.coolingOff?.association.compared?.p).toBe('number')
    const read = await evidenceWithStandings(day)
    expect(read.stood?.get('assoc.coolingOff')).toMatchObject({ standing: 'pattern', direction: 'lower' })
    expect(read.family).not.toBeNull()
    expect(read.own).not.toBeNull()
    expect(coolingLineWords(read.ev.coolingOff!.association, read.ev.coolingOff!.duration, read.stood)).toContain('Like for like, 50 points lower: a steady pattern.')
    const sheet = await factSheet(day, new Date(2026, 8, 30, 8, 0))
    expect(sheet.facts.some((f) => f.id === 'assoc.coolingOff')).toBe(true)
    expect(sheet.facts.some((f) => f.id === 'weekly.best')).toBe(true)
    expect(sheet.assocFault).toBeUndefined()
    expect(comesBeforeGuarded(await db.checkins.toArray(), day)).toHaveLength(16)
    expect(bestDays(await db.checkins.toArray(), [], [], [], day).failed).toBeUndefined()
    expect(comparisonFaults()).toBeNull()
  })

  it('reads the evidence again with no chance asked when the chance throws, builds the sheet without association facts, and says so on every line', async () => {
    const day = '2026-10-07'
    await db.checkins.bulkAdd(fourWeeks(day))
    state.compare = true
    const ev = await evidence(day)
    // The record's own numbers are still read: only the chance is not, so nothing stands and nothing is called too few.
    expect(ev.failed).toBe(true)
    expect(ev.coolingOff?.association).toMatchObject({ times: 8, withEvent: { n: 8 }, without: { n: 20 }, diff: -50 })
    expect(ev.coolingOff?.association.compared?.p).toBeNull()
    expect(comparisonFaults()).toEqual({ count: 1, first: day, last: day, name: 'RangeError' })
    const sheet = await factSheet(day, new Date(2026, 9, 7, 8, 0))
    expect(sheet.facts.length).toBeGreaterThan(5)
    expect(sheet.facts.filter((f) => f.id.startsWith('assoc.'))).toEqual([])
    expect(sheet.assocFault).toMatchObject({ first: day, last: day, name: 'RangeError' })
    expect(JSON.stringify(sheet.assocFault)).not.toContain('stand-in')
    const read = await evidenceWithStandings(day)
    expect(read).toMatchObject({ stood: null, family: null, own: null })
    expect(coolingLineWords(read.ev.coolingOff!.association, read.ev.coolingOff!.duration, read.stood)).toMatch(new RegExp(`^8 evenings marked: ${FAILED}\\. Cooling off ran `))
    expect(chipAnswerFrom(read, 'coolingOff')).toBe('The comparison could not be worked out on this phone just now.')
    expect(ownChipAnswerFrom(read, 'a')).toBe('The comparison could not be worked out on this phone just now.')
  })

  it('says the comparisons failed, never too few, when only the evidence’s own arithmetic threw', async () => {
    // The passive cards' family is read where the evidence is, and nowhere in the sheet's own gathering: with no card, its
    // standings are asked of an empty list, which alone is made to throw here. The sheet's gathering would still succeed,
    // on an evidence read with no chance, and would call every comparison too few.
    const day = '2026-11-04'
    await db.checkins.bulkAdd(fourWeeks(day))
    state.standings = 'empty'
    const read = await evidenceWithStandings(day)
    expect(read.ev.failed).toBe(true)
    expect(read).toMatchObject({ stood: null, family: null, own: null })
    expect(coolingLineWords(read.ev.coolingOff!.association, read.ev.coolingOff!.duration, read.stood)).toMatch(new RegExp(`^8 evenings marked: ${FAILED}\\. `))
    const sheet = await factSheet(day, new Date(2026, 10, 4, 8, 0))
    expect(sheet.facts.filter((f) => f.id.startsWith('assoc.'))).toEqual([])
    expect(sheet.assocFault).toMatchObject({ first: day, name: 'RangeError' })
  })

  it('leaves best days saying it failed, and its facts off the sheet, when its comparison throws', async () => {
    const day = '2026-10-14'
    await db.checkins.bulkAdd(fourWeeks(day))
    state.ratesBy = true
    const rows = await db.checkins.toArray()
    expect(bestDays(rows, [], [], [], day)).toMatchObject({ failed: true, silent: false, controlled: [], uncontrolled: [] })
    expect(comparisonFaults()).toMatchObject({ count: 1, name: 'RangeError' })
    const sheet = await factSheet(day, new Date(2026, 9, 14, 8, 0))
    expect(sheet.facts.some((f) => f.id.startsWith('weekly.best'))).toBe(false)
    // The rest of the sheet stands: the comparisons that did not fail are said.
    expect(sheet.facts.some((f) => f.id === 'assoc.coolingOff')).toBe(true)
    expect(sheet.assocFault).toMatchObject({ name: 'RangeError' })
  })

  it('leaves the sixteen pairs saying they failed when their standings throw', async () => {
    const day = '2026-10-21'
    const rows = fourWeeks(day)
    state.standings = 'all'
    expect(comesBeforeGuarded(rows, day)).toBeNull()
    expect(comparisonFaults()).toEqual({ count: 1, first: day, last: day, name: 'RangeError' })
  })

  it('keeps the sheet’s family when only your own chips fail', async () => {
    const day = '2026-10-28'
    await updateSettings((s) => withOwnChipAdded(s, 'Stand-in'))
    const [chip] = ownChipsOf(await getSettings())
    await db.checkins.bulkAdd(fourWeeks(day, (back) => ({ chipsShown: { [`own:${chip.id}`]: true as const }, ...(eight(back) ? { coolingOff: true as const, own: { [chip.id]: true as const } } : {}) })))
    state.standings = 'own'
    const read = await evidenceWithStandings(day)
    expect(read.own).toBeNull()
    expect(read.stood?.get('assoc.coolingOff')).toMatchObject({ standing: 'pattern' })
    expect(ownChipAnswerFrom(read, chip.id)).toBe('The comparison could not be worked out on this phone just now.')
    expect(chipAnswerFrom(read, 'coolingOff')).toContain('Like for like, 50 points lower: a steady pattern.')
    expect(comparisonFaults()).toEqual({ count: 1, first: day, last: day, name: 'RangeError' })
  })
})
