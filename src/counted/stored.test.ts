import { describe, expect, it } from 'vitest'
import { copy } from '../copy'
import { LEVEL_BAND_WORDS, LEVEL_BANDS, PATTERNS_FORMAT, PATTERNS_ID, PATTERNS_MAX_AGE_MS, readPatterns, samePatterns, storedPatterns } from './stored'
import { patternTable } from './table'
import { checkin, day, input } from './testing'

// The pattern table as it is kept and synced (2026-11-13), on a stand-in record.

const A = 300
const saturday = (n: number): boolean => new Date(2026, 0, 1 + n).getDay() === 6
const record = () => input({ checkins: Array.from({ length: 56 }, (_, i) => checkin(A + i, 'evening', { extras: saturday(A + i) ? { dinner: true } : {} })) })
const NOW = '2026-12-23T12:00:00.000Z'
const stored = () => storedPatterns(patternTable(record(), day(A + 56)), NOW)

describe('the pattern table as it is kept', () => {
  it('is one record with a fixed id, holding every kind the record can speak for and the level', () => {
    const r = stored()
    expect(r).toMatchObject({ id: 'table', format: 1, builtFor: day(A + 56), builtAt: NOW, updatedAt: NOW })
    expect(PATTERNS_ID).toBe('table')
    expect(PATTERNS_FORMAT).toBe(1)
    const dinner = r.kinds.find((k) => k.id === 'chip.dinner')
    expect(dinner).toMatchObject({ label: 'a late or heavy dinner', unit: 'day', category: 'dayRecord', private: false, known: 56, occurrences: 8, family: 7 })
    expect(dinner?.cells?.find((c) => c.split === 'weekday' && c.cell === '6')).toEqual({ split: 'weekday', cell: '6', k: 8, n: 8, restK: 0, m: 48, standing: 'pattern', direction: 'higher' })
    // A kind with too few to test anything keeps its counts, and no cells.
    const nap = r.kinds.find((k) => k.id === 'chip.napped')
    expect(nap).toMatchObject({ known: 56, occurrences: 0, family: 0 })
    expect(nap && 'cells' in nap).toBe(false)
    expect(r.level.length).toBeGreaterThan(0)
  })

  it('comes back whole from its stored form, and is refused whole when any part of it is not the shape', () => {
    const r = stored()
    const back = (change: (o: Record<string, unknown>) => void = () => undefined) => {
      const o = JSON.parse(JSON.stringify(r)) as Record<string, unknown>
      change(o)
      return readPatterns(o)
    }
    expect(back()).toEqual(r)
    expect(back((o) => (o.format = 2))).toBeNull()
    expect(back((o) => (o.id = 'other'))).toBeNull()
    expect(back((o) => (o.builtFor = 'yesterday'))).toBeNull()
    expect(back((o) => delete o.level)).toBeNull()
    const kinds = (o: Record<string, unknown>) => o.kinds as Record<string, unknown>[]
    const dinner = (o: Record<string, unknown>) => kinds(o).find((k) => k.id === 'chip.dinner') as Record<string, unknown>
    expect(back((o) => (dinner(o).known = 3))).toBeNull()
    expect(back((o) => ((dinner(o).cells as Record<string, unknown>[])[0].k = 99))).toBeNull()
    expect(back((o) => ((dinner(o).cells as Record<string, unknown>[])[0].standing = 'certain'))).toBeNull()
    expect(back((o) => (dinner(o).private = 'no'))).toBeNull()
    expect(back((o) => ((o.level as Record<string, unknown>[])[0].bands = [1, 2]))).toBeNull()
    expect(readPatterns(null)).toBeNull()
    expect(readPatterns('table')).toBeNull()
  })

  it('is the same table whenever it was built, and another once a count moves', () => {
    const r = stored()
    expect(samePatterns(r, { ...r, builtAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z' })).toBe(true)
    expect(samePatterns(null, r)).toBe(false)
    expect(samePatterns(r, { ...r, builtFor: day(A + 57) })).toBe(false)
    expect(samePatterns(r, { ...r, kinds: r.kinds.map((k) => (k.id === 'chip.dinner' ? { ...k, occurrences: 7 } : k)) })).toBe(false)
  })

  it('goes stale at 48 hours, and names the five bands as the app does, Firing to Empty', () => {
    expect(PATTERNS_MAX_AGE_MS).toBe(172_800_000)
    expect(LEVEL_BANDS).toEqual(['firing', 'solid', 'gettingBy', 'wornDown', 'empty'])
    expect(LEVEL_BAND_WORDS).toEqual(['Firing', 'Solid', 'Getting by', 'Worn down', 'Empty'])
    expect(LEVEL_BANDS.map((b) => copy.bands[b])).toEqual(LEVEL_BAND_WORDS)
  })
})
