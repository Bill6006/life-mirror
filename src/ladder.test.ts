import { describe, expect, it } from 'vitest'
import { moveById } from './catalogue'
import type { RungMark, Skill } from './db'
import { currentRung, ladderCounts, nextStep, parseRungId, rungId, rungName, rungStep, sittingOf, smallerRung, TOP_RUNG } from './ladder'

const skill = (id: number, name: string, order = id): Skill => ({ id, name, order, createdAt: '', archivedAt: null })
const mark = (skillId: number, rung: number, at: string, id?: number): RungMark => ({ id, skillId, rung, at, via: 'tap' })

describe('the proof ladder', () => {
  it('stands a skill on its latest mark, and a later lower mark is a correction', () => {
    expect(currentRung([], 1)).toBe(0)
    const marks = [mark(1, 1, '2026-09-01T10:00:00Z'), mark(1, 2, '2026-09-03T10:00:00Z'), mark(2, 4, '2026-09-04T10:00:00Z')]
    expect(currentRung(marks, 1)).toBe(2)
    expect(currentRung(marks, 2)).toBe(4)
    expect(currentRung([...marks, mark(1, 1, '2026-09-05T10:00:00Z')], 1)).toBe(1)
    expect(rungName(0)).toBe('Not started')
    expect(rungName(TOP_RUNG)).toBe('Resume bullet')
  })

  it('offers the next rung of the skill you moved most recently; before any mark, the first skill in your order', () => {
    const skills = [skill(1, 'One'), skill(2, 'Two'), skill(3, 'Three')]
    expect(nextStep([], [])).toBeNull()
    expect(nextStep(skills, [])).toEqual({ skill: skills[0], rung: 1 })
    const marks = [mark(1, 3, '2026-09-01T10:00:00Z'), mark(2, 1, '2026-09-02T10:00:00Z')]
    expect(nextStep(skills, marks)).toEqual({ skill: skills[1], rung: 2 })
    // A skill at the top is finished; the next most recent takes over.
    const done = [...marks, mark(2, TOP_RUNG, '2026-09-03T10:00:00Z')]
    expect(nextStep(skills, done)).toEqual({ skill: skills[0], rung: 4 })
    const allDone = skills.map((s) => mark(s.id as number, TOP_RUNG, '2026-09-04T10:00:00Z'))
    expect(nextStep(skills, allDone)).toBeNull()
    // A removed skill is never the step.
    const removed = [{ ...skills[0], archivedAt: '2026-09-05T10:00:00Z' }, skills[1], skills[2]]
    expect(nextStep(removed, [])).toEqual({ skill: skills[1], rung: 1 })
  })

  it('sizes each rung to one sitting and names it from the skill', () => {
    const s = rungStep(skill(7, 'Subnetting'), 2)
    expect(s).toMatchObject({ id: 'rung:7:2', name: 'Subnetting · practise it', minutes: 25, kind: 'rung' })
    expect(rungStep(skill(7, 'Subnetting'), 6).minutes).toBe(5)
    expect(parseRungId(rungId(7, 2))).toEqual({ skillId: 7, rung: 2 })
    expect(parseRungId('focused-block')).toBeNull()
    expect(parseRungId('rung:7:9')).toBeNull()
  })

  it('counts skills per rung and nothing else', () => {
    const skills = [skill(1, 'One'), skill(2, 'Two'), skill(3, 'Three')]
    const marks = [mark(1, 3, '2026-09-01T10:00:00Z'), mark(2, 3, '2026-09-02T10:00:00Z')]
    const counts = ladderCounts(skills, marks)
    expect(counts).toEqual([1, 0, 0, 2, 0, 0, 0])
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3)
  })

  it('makes the smaller version the same proof in fewer minutes, never an easier rung', () => {
    const s = rungStep(skill(1, 'One'), 3)
    expect(smallerRung(s)).toMatchObject({ id: s.id, minutes: 10 })
    expect(smallerRung(rungStep(skill(1, 'One'), 5))?.minutes).toBe(5)
    expect(smallerRung(rungStep(skill(1, 'One'), 6))).toBeNull()
    expect(smallerRung(sittingOf(moveById('focused-block')))).toBeNull()
  })
})
