import { describe, expect, it } from 'vitest'
import { BLOCKS } from './blocks'
import { blockReadings, readings } from './readings'
import { INGREDIENTS } from './score'

// Requirement 3 of the learning design agreed 2026-10-10: a construct card for every reading, kept in
// src/readings.json beside its words, and agreeing with what the engine itself holds.

describe('the construct cards', () => {
  it('give every reading all five parts, each said in words', () => {
    for (const r of readings) {
      for (const part of ['measures', 'boundary', 'timeframe', 'good', 'missing'] as const) expect(r.construct[part]?.trim().length, `${r.id} ${part}`).toBeGreaterThan(2)
      expect(['right now', 'today', 'last night'], r.id).toContain(r.construct.timeframe)
    }
  })

  it('say the good direction the score uses for each of the six ingredients', () => {
    for (const [id, dir] of Object.entries(INGREDIENTS)) expect(readings.find((r) => r.id === id)?.construct.good, id).toBe(dir === 'up' ? 'higher' : 'lower')
  })

  it('say where a reading is asked as the blocks ask it, so a missing answer is read rightly', () => {
    for (const r of readings) {
      const asked = BLOCKS.filter((b) => blockReadings(b).includes(r.id))
      const words = r.construct.missing
      if (asked.length === 3) expect(words, r.id).toMatch(/^Asked at every check-in\./)
      else if (asked.join() === 'morning') expect(words, r.id).toMatch(/^Asked at the morning check-in alone\./)
      else expect(words, r.id).toMatch(new RegExp(`^Asked in the ${asked.join(' and the ')}\\.`))
      expect(words, r.id).toMatch(/never read as low or high, and never filled in\.$/)
    }
  })
})
