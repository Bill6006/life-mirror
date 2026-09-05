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
    expect(blockReadings('afternoon')).toEqual(['mood', 'irritation', 'energy', 'hunger', 'stress'])
    expect(blockReadings('evening')).toEqual(blockReadings('afternoon'))
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

  it('keeps headwords distinct within a reading and units valid', () => {
    for (const r of readings) {
      expect(['step', 'band']).toContain(r.unit)
      const heads = r.anchors.map((a) => a.split(' — ')[0].toLowerCase())
      expect(new Set(heads).size, r.id).toBe(5)
    }
  })
})
