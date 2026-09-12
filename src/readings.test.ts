import { describe, expect, it } from 'vitest'
import { blockReadings, readings } from './readings'

// Rule 4: a reading, never a verdict. Rule 3: no near-duplicates.
const banned = ['failed', 'bad', 'lazy', 'behind', 'weak', 'slipped again']
const allAnchors = readings.flatMap((r) => r.anchors)

describe('readings and anchors', () => {
  it('has thirteen readings with five anchors each: sixty-five distinct phrases', () => {
    expect(readings).toHaveLength(13)
    for (const r of readings) expect(r.anchors, r.id).toHaveLength(5)
    expect(allAnchors).toHaveLength(65)
    expect(new Set(allAnchors.map((a) => a.toLowerCase())).size).toBe(65)
  })

  it("asks the plan's readings in each block", () => {
    expect(blockReadings('morning')).toEqual([
      'mood',
      'irritation',
      'stress',
      'overwhelm',
      'motivation',
      'confidence',
      'focus',
      'loneliness',
      'socialEnergy',
      'energy',
      'hunger',
      'sleepHours',
      'sleepQuality',
    ])
    expect(blockReadings('afternoon')).toEqual(['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm'])
    expect(blockReadings('evening')).toEqual(['mood', 'irritation', 'energy', 'hunger', 'stress', 'focus', 'overwhelm', 'loneliness'])
    for (const block of ['morning', 'afternoon', 'evening'] as const) {
      for (const ingredient of ['mood', 'energy', 'focus', 'stress', 'overwhelm', 'irritation']) expect(blockReadings(block), `${block} feeds ${ingredient}`).toContain(ingredient)
    }
    const ids = new Set(readings.map((r) => r.id))
    for (const block of ['morning', 'afternoon', 'evening'] as const) {
      for (const id of blockReadings(block)) expect(ids.has(id), id).toBe(true)
    }
  })

  it('describes a state in every anchor rather than naming a grade', () => {
    for (const r of readings) {
      for (const a of r.anchors) {
        if (r.unit === 'band') {
          expect(a, a).toMatch(/hours$/)
          continue
        }
        expect(a, a).toContain(' — ')
        expect(a.split(/\s+/).length, a).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('uses no verdict words in any name, prompt or anchor', () => {
    const strings = [...allAnchors, ...readings.flatMap((r) => [r.name, r.prompt])]
    for (const s of strings) {
      for (const w of banned) expect(s.toLowerCase(), `"${s}" uses "${w}"`).not.toMatch(new RegExp(`\\b${w}\\b`))
    }
  })

  it('carries one pre-written alternate per anchor except the middle, distinct, in the same voice, for the veto', () => {
    const withAlternates = readings.filter((r) => r.unit !== 'band')
    expect(withAlternates.length).toBe(12)
    let count = 0
    for (const r of withAlternates) {
      const alts = r.alternates
      expect(alts, r.id).toBeTruthy()
      expect(alts!.length, r.id).toBe(5)
      expect(alts![2], r.id).toBeNull()
      for (const i of [0, 1, 3, 4]) {
        const a = alts![i]
        expect(typeof a, `${r.id} ${i}`).toBe('string')
        const alt = a as string
        count++
        expect(alt.split(/\s+/).length, alt).toBeGreaterThanOrEqual(3)
        expect(alt.includes(' — '), alt).toBe(true)
        expect(r.anchors.includes(alt), alt).toBe(false)
        expect(alt.split(' — ')[0].toLowerCase(), alt).not.toBe(r.anchors[i].split(' — ')[0].toLowerCase())
        for (const w of banned) expect(alt.toLowerCase(), `"${alt}" uses "${w}"`).not.toMatch(new RegExp(`\\b${w}\\b`))
      }
    }
    expect(count).toBe(48)
    expect(readings.find((r) => r.unit === 'band')?.alternates ?? null).toBeNull()
  })

  it('keeps headwords distinct within a reading and units valid', () => {
    for (const r of readings) {
      expect(['step', 'band']).toContain(r.unit)
      const heads = r.anchors.map((a) => a.split(' — ')[0].toLowerCase())
      expect(new Set(heads).size, r.id).toBe(5)
    }
  })
})
