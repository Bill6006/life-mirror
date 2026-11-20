import { describe, expect, it } from 'vitest'
import type { Fact, FactSheet } from '../../src/factTypes'
import { accessFor, factCategories, gatesFrom, sheetForClaude } from './retrieval'

// The forecast follow-ups, item 3 (2026-11-20): today's forecast for a block on the day's sheet says what moved it, so
// it is read under the Brain switch of every condition that did, as a stored forecast's moved fact is (2026-11-14).
// Stand-in facts only.

const f = (kinds?: string, tags: string[] = ['forecast', 'morning']): Fact => ({ id: 'forecast.morning', tags, text: "Today's morning is forecast at 60, 52 to 68.", values: { block: 'morning', point: 60, lo: 52, hi: 68, ...(kinds ? { kinds } : {}) } })

describe('today’s forecast, read under every switch of what moved it (the forecast follow-ups, item 3)', () => {
  it('is the day’s record where nothing moved it, as before', () => {
    expect(factCategories(f(), new Map())).toEqual(['dayRecord'])
  })

  it('is read under the switch of every condition that moved it, and closed for one the layer does not name', () => {
    expect(factCategories(f('dayRecord'), new Map())).toEqual(['dayRecord'])
    expect(factCategories(f('dayRecord|privateItems'), new Map())).toEqual(['dayRecord', 'privateItems'])
    expect(factCategories(f('privateItems|notes'), new Map())).toEqual(['dayRecord', 'privateItems', 'notes'])
    expect(factCategories(f('dayRecord|faith', ['forecast', 'morning', 'faith']), new Map())).toEqual(['dayRecord', 'faith'])
    expect(factCategories(f('dayRecord|everything'), new Map())).toEqual(['dayRecord', 'closed'])
  })

  it('leaves the sheet the day’s line reads while one of those switches is off', () => {
    const sheet = { version: 1, day: '2026-11-20', builtAt: '2026-11-20T08:00:00.000Z', hour: 8, days: 120, facts: [f('dayRecord|privateItems')], said: [], shortlist: [], showPrivate: false } as unknown as FactSheet
    const read = (switches: Record<string, boolean>) => sheetForClaude(sheet, accessFor('line', gatesFrom({ hideFaith: false, privateInSelection: true }), { writerModel: 'opus', switches } as never)).facts.map((x) => x.id)
    expect(read({})).toContain('forecast.morning')
    expect(read({ privateItems: false })).not.toContain('forecast.morning')
    expect(read({ dayRecord: false })).not.toContain('forecast.morning')
  })
})
