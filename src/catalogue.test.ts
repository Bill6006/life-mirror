import { describe, expect, it } from 'vitest'
import { BLOCKS } from './blocks'
import { CHARISMA_LADDER, COUNTERS, EFFORTS, families, moves, NEEDS, STRENGTHS, WINDOWS } from './catalogue'
import { readings } from './readings'

// The catalogue is content; these checks are what "the builder checks and says so" means in code.
const banned = ['failed', 'bad', 'lazy', 'behind', 'weak', 'slipped again']
const readingIds = new Set(readings.map((r) => r.id))
const familyIds = new Set(families.map((f) => f.id))
const ids = new Set(moves.map((m) => m.id))
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

describe('the catalogue of moves', () => {
  it('has between sixty and ninety moves across the twelve families of the plan', () => {
    expect(moves.length).toBeGreaterThanOrEqual(60)
    expect(moves.length).toBeLessThanOrEqual(90)
    expect(families.map((f) => f.id)).toEqual(['ending', 'movement', 'steadying', 'food', 'study', 'house', 'people', 'rest', 'money', 'charisma', 'faith', 'finishing'])
    for (const f of families) expect(moves.some((m) => m.family === f.id), f.id).toBe(true)
  })

  it('gives every move every field the plan asks for, with valid values', () => {
    for (const m of moves) {
      expect(m.id, m.id).toMatch(/^[a-z0-9-]+$/)
      expect(m.name.length, m.id).toBeGreaterThan(3)
      expect(m.what.length, m.id).toBeGreaterThan(10)
      expect(familyIds.has(m.family), m.id).toBe(true)
      expect(m.source.who.length, m.id).toBeGreaterThan(2)
      expect(m.source.what.length, m.id).toBeGreaterThan(10)
      expect(m.source.year, m.id).toBeGreaterThanOrEqual(1980)
      expect(m.source.year, m.id).toBeLessThanOrEqual(2026)
      expect(STRENGTHS, m.id).toContain(m.source.strength)
      expect(m.minutes, m.id).toBeGreaterThanOrEqual(0)
      expect(m.minutes, m.id).toBeLessThanOrEqual(60)
      expect(EFFORTS, m.id).toContain(m.effort)
      for (const n of m.needs) expect(NEEDS, m.id).toContain(n)
      expect(m.targets.length, m.id).toBeGreaterThan(0)
      for (const t of m.targets) {
        expect(readingIds.has(t.reading), `${m.id} → ${t.reading}`).toBe(true)
        expect(['up', 'down'], m.id).toContain(t.direction)
        expect(WINDOWS, m.id).toContain(t.window)
      }
      for (const k of m.countsToward) expect(COUNTERS, m.id).toContain(k)
      expect(m.when.length, m.id).toBeGreaterThan(0)
      for (const b of m.when) expect(BLOCKS, m.id).toContain(b)
    }
  })

  it('never says the same thing twice: ids, names and descriptions are all distinct', () => {
    expect(ids.size).toBe(moves.length)
    expect(new Set(moves.map((m) => norm(m.name))).size).toBe(moves.length)
    expect(new Set(moves.map((m) => norm(m.what))).size).toBe(moves.length)
  })

  it('declares conflicts both ways, to real moves, never to itself', () => {
    for (const m of moves) {
      for (const other of m.conflicts) {
        expect(other, `${m.id} conflicts with unknown ${other}`).not.toBe(m.id)
        expect(ids.has(other), `${m.id} conflicts with unknown ${other}`).toBe(true)
        const back = moves.find((x) => x.id === other)
        expect(back?.conflicts, `${other} should list ${m.id} back`).toContain(m.id)
      }
    }
  })

  it('carries the charisma ladder in order, the three faith basics, and time with her as its own move', () => {
    const charisma = moves.filter((m) => m.family === 'charisma').map((m) => m.id)
    expect(charisma.slice(0, 4)).toEqual(CHARISMA_LADDER)
    const faith = moves.filter((m) => m.family === 'faith').map((m) => m.id)
    expect(faith).toEqual(expect.arrayContaining(['one-verse', 'five-minutes-prayer', 'one-honest-sentence']))
    const her = moves.find((m) => m.id === 'time-with-her')
    expect(her?.family).toBe('people')
    expect(her?.countsToward).toEqual(['timeWithHer'])
    expect(her?.what.toLowerCase()).toContain('not teaching')
    expect(moves.filter((m) => m.countsToward.includes('timeWithHer'))).toHaveLength(1)
  })

  it('keeps finishing reps to one sitting and every faith move optional in the same block', () => {
    for (const m of moves.filter((m) => m.family === 'finishing')) expect(m.minutes, m.id).toBeLessThanOrEqual(25)
    const basics = ['one-verse', 'five-minutes-prayer', 'one-honest-sentence']
    for (const a of basics) for (const b of basics) if (a !== b) expect(moves.find((m) => m.id === a)?.conflicts, `${a} vs ${b}`).toContain(b)
  })

  it('uses no verdict words anywhere', () => {
    for (const m of moves) {
      for (const s of [m.name, m.what, m.source.who, m.source.what, ...m.replaces]) {
        for (const w of banned) expect(s.toLowerCase(), `"${s}" uses "${w}"`).not.toMatch(new RegExp(`\\b${w}\\b`))
      }
    }
  })
})
