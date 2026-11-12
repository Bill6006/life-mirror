import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The association pass is wrapped as the engine is (Phase 3, 2026-11-12): if it throws, the sheet is built without
// association facts, the brief's last-night line says no reading, and the failure rides the sheet for the Worker's
// report with its error's name alone. One of the functions the pass calls is made to throw here on demand.
const state = vi.hoisted(() => ({ fail: false }))
vi.mock('./lastNight', async (original) => {
  const real = await original<typeof import('./lastNight')>()
  return {
    ...real,
    lastNightAssociations: (...args: Parameters<typeof real.lastNightAssociations>) => {
      if (state.fail) throw new TypeError('a stand-in failure that names 2026-09-29')
      return real.lastNightAssociations(...args)
    },
  }
})

import { lastNightWords } from './associationWords'
import { addDays } from './blocks'
import { briefForCard, factSheet, resetAssociationFaults } from './brainFlow'
import { db, type CheckIn } from './db'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

const DAY = '2026-09-30'
const NOW = new Date(2026, 8, 30, 8, 0)

function ci(day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn {
  const answers: Answers = Object.fromEntries(blockReadings(block).map((id) => [id, 3]))
  for (const id of Object.keys(answers) as ReadingId[]) {
    if (['stress', 'overwhelm', 'irritation'].includes(id)) answers[id] = (6 - p) as Position
    else if (['mood', 'energy', 'focus'].includes(id)) answers[id] = p
  }
  return { day, block, answers, startedAt: '', completedAt: `${day}T21:00:00.000Z`, updatedAt: '', activeMs: 30_000, extras }
}

describe('when the comparisons cannot be worked out', () => {
  beforeEach(async () => {
    state.fail = false
    resetAssociationFaults()
    await db.delete()
    await db.open()
    // Four weeks of evenings that started the same, a nap on eight of them in no rhythm and again last night.
    const rows: CheckIn[] = []
    for (let back = 29; back >= 2; back--) {
      const day = addDays(DAY, -back)
      const napped = [3, 4, 6, 10].includes((back - 1) % 14)
      rows.push(ci(day, 'evening', 3, napped ? { napped: true } : undefined), ci(addDays(day, 1), 'morning', napped ? 4 : 2))
    }
    await db.checkins.bulkAdd([...rows, ci(addDays(DAY, -1), 'evening', 3, { napped: true })])
  })

  it('says them as usual while nothing fails: the probe that could say yes', async () => {
    const sheet = await factSheet(DAY, NOW)
    expect(sheet.facts.filter((f) => f.id.startsWith('assoc.')).map((f) => f.id)).toEqual(['assoc.napped'])
    expect(sheet.facts.some((f) => f.id === 'lastNight')).toBe(true)
    expect(sheet.assocFault).toBeUndefined()
    expect((await briefForCard(DAY)).night).toMatchObject({ standing: 'pattern' })
  })

  it('builds the sheet without association facts, and the failure rides it by its name alone', async () => {
    state.fail = true
    const sheet = await factSheet(DAY, NOW)
    expect(sheet.facts.filter((f) => f.id.startsWith('assoc.') || f.id === 'lastNight')).toEqual([])
    // The rest of the sheet is there.
    expect(sheet.facts.some((f) => f.id === 'record')).toBe(true)
    expect(sheet.assocFault).toEqual({ count: 1, first: DAY, last: DAY, name: 'TypeError' })
    expect(JSON.stringify(sheet)).not.toContain('stand-in failure')
    // A second failure is counted, and the first day is kept.
    expect((await factSheet(addDays(DAY, 1), new Date(2026, 9, 1, 8, 0))).assocFault).toEqual({ count: 2, first: DAY, last: addDays(DAY, 1), name: 'TypeError' })
  })

  it('leaves the brief’s last-night line with what last night carried and no reading', async () => {
    state.fail = true
    const card = await briefForCard(DAY)
    expect(card.lastNight).toMatchObject({ key: 'napped', n: 9 })
    expect(card.night).toBeNull()
    expect(lastNightWords(card.lastNight!, card.night)).toBe('Last night carried a nap.')
  })
})
