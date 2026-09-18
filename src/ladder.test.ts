import { describe, expect, it } from 'vitest'
import { moveById } from './catalogue'
import type { Aim, RungMark, Skill } from './db'
import { currentRung, ladderCounts, lastMarkDay, nextStep, parseRungId, rungId, rungName, rungStep, sittingOf, skillsOf, smallerRung, TOP_RUNG, groupBySubject, ladderOf, orphanSubjects } from './ladder'
import { dayKey } from './blocks'

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

describe('the proof ladder with more than one subject', () => {
  const skill = (id: number, name: string, order: number, subject?: string): Skill => ({ id, name, order, createdAt: '', archivedAt: null, ...(subject ? { subject } : {}) })

  it('names a step with its subject when the skill has one', () => {
    expect(rungStep(skill(1, 'Subnetting', 1), 1).name).toBe('Subnetting · watch or read it')
    expect(rungStep(skill(2, 'Past tense', 2, 'Language'), 2).name).toBe('Language · Past tense · practise it')
  })

  it('groups skills by subject, the ones without a subject first, in your order within each', () => {
    const groups = groupBySubject([skill(3, 'Verbs', 3, 'Language'), skill(1, 'Subnetting', 1), skill(2, 'Routing', 2, 'Networking'), skill(4, 'Nouns', 4, 'Language')])
    expect(groups.map((g) => g.subject)).toEqual([null, 'Networking', 'Language'])
    expect(groups[2].skills.map((s) => s.name)).toEqual(['Verbs', 'Nouns'])
  })
})

describe('a step’s title beside its subject', () => {
  it('keeps the subject out of the title, so a card can say it once', () => {
    const s = rungStep({ id: 2, name: 'Past tense', order: 2, createdAt: '', archivedAt: null, subject: 'Language' }, 2)
    expect(s.title).toBe('Past tense · practise it')
    expect(s.subject).toBe('Language')
    const plain = rungStep({ id: 1, name: 'Subnetting', order: 1, createdAt: '', archivedAt: null }, 1)
    expect(plain.title).toBe(plain.name)
    expect(plain.subject).toBeUndefined()
  })
})

describe('a subject’s own six proofs', () => {
  const lang = (id: number, name: string, order: number): Skill => ({ id, name, order, createdAt: '', archivedAt: null, subject: 'French', ladder: 'language' })

  it('names a language skill’s rungs and steps in its own words, in ten-minute sittings', () => {
    expect(rungName(1, 'language')).toBe('Heard or read')
    expect(rungName(6, 'language')).toBe('Used with someone')
    expect(rungName(2)).toBe('Practiced')
    const s = rungStep(lang(9, 'Ten words', 1), 2)
    expect(s.name).toBe('French · Ten words · say it')
    expect(s.minutes).toBe(10)
    expect(s.what).toContain('Say it out loud')
    expect(ladderOf(lang(9, 'Ten words', 1))).toBe('language')
    expect(ladderOf({ ladder: undefined })).toBe('technical')
  })

  it('counts each ladder on its own, and a group carries its kind', () => {
    const skills = [lang(9, 'Ten words', 1), { id: 1, name: 'Subnetting', order: 2, createdAt: '', archivedAt: null } as Skill]
    expect(ladderCounts(skills, [], 'language')[0]).toBe(1)
    expect(ladderCounts(skills, [], 'technical')[0]).toBe(1)
    expect(ladderCounts(skills, [])[0]).toBe(2)
    expect(groupBySubject(skills).map((g) => [g.subject, g.kind])).toEqual([
      [null, 'technical'],
      ['French', 'language'],
    ])
  })
})

describe('a skill learned by doing', () => {
  it('climbs its own six proofs in ten-minute sittings', () => {
    expect(rungName(1, 'craft')).toBe('Watched or listened')
    expect(rungName(6, 'craft')).toBe('Done for someone')
    const s = rungStep({ id: 4, name: 'Scale of C', order: 1, createdAt: '', archivedAt: null, subject: 'Piano', ladder: 'craft' }, 3)
    expect(s.name).toBe('Piano · Scale of C · do it with the material')
    expect(s.minutes).toBe(10)
  })
})

describe('the ladder a commitment chose', () => {
  it('carries onto its skills whatever they were filed under, and dates the last mark among them', () => {
    const a: Aim = { id: 1, kind: 'certification', stepMoveId: null, name: 'French', ladder: 'language', createdAt: '', archivedAt: null }
    const filed = [{ id: 1, name: 'Ten words', order: 1, createdAt: '', archivedAt: null, subject: 'French' } as Skill]
    expect(skillsOf(a, filed, [a]).map((s) => ladderOf(s))).toEqual(['language'])
    expect(rungStep(skillsOf(a, filed, [a])[0], 2).name).toBe('French · Ten words · say it')
    expect(rungStep(filed[0], 2).name).toBe('French · Ten words · practise it')
    expect(lastMarkDay(filed, [])).toBeNull()
    const at = new Date(2026, 8, 6, 23, 30).toISOString()
    expect(lastMarkDay(filed, [{ skillId: 1, rung: 1, at, via: 'step' }, { skillId: 2, rung: 3, at: new Date(2026, 8, 9, 8, 0).toISOString(), via: 'tap' }])).toBe(dayKey(new Date(at)))
  })

  it('names each rung as a proof of its own, six per ladder, with a step and a definition each', () => {
    for (const kind of ['technical', 'language', 'craft'] as const) {
      const names = Array.from({ length: 7 }, (_, i) => rungName(i, kind))
      expect(new Set(names).size).toBe(7)
      for (let r = 1; r <= 6; r++) {
        const s = rungStep({ id: 1, name: 'x', order: 1, createdAt: '', archivedAt: null, ladder: kind }, r)
        expect(s.what.length).toBeGreaterThan(20)
        expect(s.title).toContain('x · ')
      }
    }
  })
})

describe('subjects no commitment is named for', () => {
  it('lists each once, and none that a commitment carries', () => {
    const sk = (id: number, subject?: string): Skill => ({ id, name: 'x' + id, order: id, createdAt: '', archivedAt: null, ...(subject ? { subject } : {}) })
    expect(orphanSubjects([sk(1, 'French'), sk(2, 'french'), sk(3), sk(4, 'Piano')], [{ name: 'Piano' }])).toEqual(['French'])
    expect(orphanSubjects([sk(1, 'French')], [{ name: 'French' }])).toEqual([])
  })
})
