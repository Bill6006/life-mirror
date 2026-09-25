import { describe, expect, it } from 'vitest'
import { areaOf, cellBlock, farApart, fingerprints, geohash, guessKind, newSecret } from './location'

// Part 43, the pure part: map cells, the area kept for the sun, and keyed fingerprints that recognise
// a place without keeping where it is.

describe('map cells', () => {
  it('match the published geohash of a known point', () => {
    // The standard worked example: 57.64911, 10.40744 is u4pruydqqvj.
    expect(geohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj')
    expect(geohash(57.64911, 10.40744)).toBe('u4pruyd')
  })

  it('give a block of nine: the point’s own cell first, then the eight around it, all distinct', () => {
    const block = cellBlock(51.50722, -0.1275)
    expect(block).toHaveLength(9)
    expect(block[0]).toBe(geohash(51.50722, -0.1275))
    expect(new Set(block).size).toBe(9)
    // A step of about 150 metres lands in the same block.
    expect(block).toContain(geohash(51.5081, -0.1275))
  })

  it('wrap at the date line and hold at the poles', () => {
    expect(new Set(cellBlock(10, 179.9999)).size).toBe(9)
    expect(cellBlock(89.9999, 0).length).toBeGreaterThan(0)
  })
})

describe('the area kept for the sun', () => {
  it('is the position to a tenth of a degree, and nothing finer', () => {
    expect(areaOf(51.50722, -0.1275)).toEqual({ lat: 51.5, lon: -0.1 })
    expect(areaOf(-33.86785, 151.20732)).toEqual({ lat: -33.9, lon: 151.2 })
    expect(areaOf(0.04, -0.04)).toEqual({ lat: 0, lon: 0 })
  })

  it('tells away (a different area) from nearby', () => {
    expect(farApart({ lat: 51.5, lon: -0.1 }, { lat: 51.6, lon: -0.2 })).toBe(false)
    expect(farApart({ lat: 51.5, lon: -0.1 }, { lat: 52.2, lon: 0.1 })).toBe(true)
  })
})

describe('fingerprints', () => {
  it('are the same for the same cell and key, different under another key, and never carry the cell', async () => {
    const key = newSecret()
    const cell = geohash(51.50722, -0.1275)
    const [a] = await fingerprints(key, [cell])
    const [b] = await fingerprints(key, [cell])
    const [c] = await fingerprints(newSecret(), [cell])
    expect(a).toBe(b)
    expect(c).not.toBe(a)
    expect(a).not.toContain(cell)
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/)
  })
})

describe('what an unnamed place looks like', () => {
  const base = { days: 3, morning: 0, afternoon: 0, evening: 0, office: 0, church: 0 }
  it('guesses Work from office-day hours, Church from church days, Home from mornings and evenings, and nothing from a mix', () => {
    expect(guessKind({ ...base, morning: 2, afternoon: 2, office: 4 })).toBe('work')
    expect(guessKind({ ...base, morning: 3, church: 3 })).toBe('church')
    expect(guessKind({ ...base, morning: 2, evening: 3, afternoon: 1 })).toBe('home')
    expect(guessKind({ ...base, afternoon: 3, evening: 1 })).toBeNull()
    expect(guessKind(base)).toBeNull()
  })
})
