import { describe, expect, it } from 'vitest'
import { BLOCKS } from './blocks'
import { CHARISMA_LADDER, COUNTERS, EFFORTS, extensionPrompt, families, filterTags, INGREDIENT_TAGS, INTENSITIES, isParked, isProposed, LEARNED_TAG_IDS, learnedTags, liveMoves, moves, NEEDS, PASSIVE, proposals, research, REWARD_TAGS, STRENGTHS, WINDOWS } from './catalogue'
import { readings } from './readings'

// The catalogue is content; these checks are what "the builder checks and says so" means in code.
const banned = ['failed', 'bad', 'lazy', 'behind', 'weak', 'slipped again']
const readingIds = new Set(readings.map((r) => r.id))
const familyIds = new Set(families.map((f) => f.id))
const ids = new Set(moves.map((m) => m.id))
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

describe('the catalogue of moves', () => {
  it('has between sixty and a hundred moves across the thirteen families of the plan', () => {
    expect(moves.length).toBeGreaterThanOrEqual(60)
    expect(moves.length).toBeLessThanOrEqual(100)
    expect(families.map((f) => f.id)).toEqual(['ending', 'movement', 'steadying', 'food', 'study', 'house', 'people', 'rest', 'money', 'charisma', 'faith', 'finishing', 'setup'])
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

  it('tags every move with the learned tags the plan names and no others, a cost to assign, and a starting belief read from its source', () => {
    for (const m of moves) {
      for (const t of m.tags.ingredients) expect(INGREDIENT_TAGS, m.id).toContain(t)
      for (const t of m.tags.reward) expect(REWARD_TAGS, m.id).toContain(t)
      expect(INTENSITIES, m.id).toContain(m.tags.intensity)
      expect(EFFORTS, m.id).toContain(m.costToAssign)
      expect(typeof m.prior.effect, m.id).toBe('number')
      expect(m.prior.effect, m.id).toBeGreaterThanOrEqual(0)
      expect(m.prior.effect, m.id).toBeLessThanOrEqual(1)
      expect(m.prior.note.length, m.id).toBeGreaterThan(10)
    }
    expect(learnedTags.map((t) => t.id)).toEqual([...LEARNED_TAG_IDS])
    for (const t of learnedTags) {
      expect(t.source.who.length, t.id).toBeGreaterThan(2)
      expect(STRENGTHS, t.id).toContain(t.source.strength)
      expect(t.prior.note.length, t.id).toBeGreaterThan(5)
    }
    expect(filterTags.map((t) => t.id)).toEqual(['costToAssign', 'startingEffort', 'needs', 'effectWindow'])
  })

  it('carries the Phase 9 proposals as wired at Green: nothing proposed, the parked two never offered, the trade made', () => {
    expect(moves.filter(isProposed).length).toBe(0)
    const parked = moves.filter(isParked).map((m) => m.id)
    expect(parked).toEqual([...proposals.money.park])
    for (const id of parked) expect(liveMoves.some((m) => m.id === id), id).toBe(false)
    expect(liveMoves.length + parked.length).toBe(moves.length)
    for (const id of [...proposals.money.keep, ...proposals.money.park, ...proposals.charisma.ladder, ...proposals.passive]) expect(ids.has(id), id).toBe(true)
    expect(moves.find((m) => m.id === 'cancel-one-thing')?.family).toBe('setup')
    expect(proposals.charisma.ladder.map((id) => moves.find((m) => m.id === id)?.ladder?.rung)).toEqual([1, 2, 3, 4])
    expect(CHARISMA_LADDER).toEqual([...proposals.charisma.ladder])
    expect(PASSIVE.has('recovery-gap')).toBe(true)
    expect(moves.filter((m) => m.setup?.kind === 'lateness').length).toBeGreaterThanOrEqual(1)
    expect(moves.filter((m) => m.setup?.necessity).length).toBeGreaterThanOrEqual(3)
    expect(moves.find((m) => m.id === 'recovery-gap')?.passive).toBe(true)
  })

  it('carries the research behind the layer, read before wiring, and the extension prompt without a private item', () => {
    expect(research.map((r) => r.id)).toEqual(['ba', 'act', 'sdt', 'meaning'])
    for (const r of research) {
      expect(r.sources.length, r.id).toBeGreaterThanOrEqual(3)
      expect(r.contributes.length, r.id).toBeGreaterThanOrEqual(3)
      expect(r.chips.length, r.id).toBeGreaterThan(20)
    }
    expect(extensionPrompt.template).toContain('THE RULES')
    expect(extensionPrompt.template.toLowerCase()).toContain('private item')
    expect(extensionPrompt.template.toLowerCase()).not.toContain('crisis')
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
    const rungs = moves.filter((m) => m.ladder?.id === 'participation').sort((a, b) => (a.ladder?.rung ?? 0) - (b.ladder?.rung ?? 0)).map((m) => m.id)
    expect(rungs).toEqual(CHARISMA_LADDER)
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
    const texts: string[] = []
    for (const m of moves) texts.push(m.name, m.what, m.source.who, m.source.what, m.prior.note, ...m.replaces)
    for (const t of learnedTags) texts.push(t.name, t.what, t.prior.note, t.source.what)
    for (const t of filterTags) texts.push(t.name, t.what)
    for (const r of research) texts.push(r.name, r.chips, ...r.contributes, ...r.sources.map((s) => s.what))
    texts.push(extensionPrompt.intro, extensionPrompt.template, proposals.money.note, proposals.charisma.note, proposals.wiring)
    for (const s of texts) {
      for (const w of banned) expect(s.toLowerCase(), `"${s}" uses "${w}"`).not.toMatch(new RegExp(`\\b${w}\\b`))
    }
  })
})
