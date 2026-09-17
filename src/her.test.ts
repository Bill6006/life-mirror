import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { families, moves } from './catalogue'
import { copy } from './copy'
import { db } from './db'
import { HELP_LEVELS, HER_AREAS, HER_RUNGS, HER_SKILLS, herSkillById, momentSummary, skillCounts } from './her'
import { addHerSkill, addMoment, allMoments, liveHerSkills, removeHerSkill, setHerRung } from './herFlow'
import { screen, type Situation, type TodayState } from './offers'

// Phase F: her skills and moments. Counts only; the rung moves by a tap and by nothing else.

describe('the skill list', () => {
  it('carries the CDC checklists for 4 and 5 years, four areas, every id distinct, an example only where the checklist gives one', () => {
    expect(HER_SKILLS.length).toBe(32)
    expect(new Set(HER_SKILLS.map((s) => s.id)).size).toBe(HER_SKILLS.length)
    expect(new Set(HER_SKILLS.map((s) => s.name)).size).toBe(HER_SKILLS.length)
    expect(HER_AREAS.map((a) => a.id)).toEqual(['social', 'language', 'thinking', 'movement'])
    for (const a of HER_AREAS) expect(HER_SKILLS.some((s) => s.area === a.id), a.id).toBe(true)
    for (const s of HER_SKILLS) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/)
      expect([4, 5]).toContain(s.age)
      expect(s.name.length).toBeGreaterThan(5)
      expect(s.example === null || s.example.length > 2).toBe(true)
    }
    expect(HER_SKILLS.filter((s) => s.age === 4)).toHaveLength(17)
    expect(HER_SKILLS.filter((s) => s.age === 5)).toHaveLength(15)
    expect(herSkillById('counts-to-ten')?.area).toBe('thinking')
    expect(herSkillById('not-a-skill')).toBeNull()
  })

  it('has five rungs and three help levels, each with its words, and no percentage anywhere in the copy', () => {
    expect(HER_RUNGS).toHaveLength(5)
    expect(copy.her.rungs).toHaveLength(5)
    expect(copy.her.rungs[0]).toBe('Not introduced')
    expect(copy.her.rungs[4]).toBe('Doing often')
    expect(HELP_LEVELS).toHaveLength(3)
    for (const h of HELP_LEVELS) expect(copy.her.help[h].length).toBeGreaterThan(2)
    const strings: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string') strings.push(v)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(copy.her)
    for (const s of strings) {
      expect(s, s).not.toContain('%')
      expect(s, s).not.toMatch(/\{n\} of \{/)
    }
  })
})

describe('the counts', () => {
  const moments = [
    { day: '2026-09-03', skillId: 'counts-to-ten', help: 'lots' as const },
    { day: '2026-09-05', skillId: 'counts-to-ten', help: 'some' as const },
    { day: '2026-09-09', skillId: 'counts-to-ten', help: 'own' as const },
    { day: '2026-09-09', skillId: 'counts-to-ten', help: 'own' as const },
    { day: '2026-09-01', skillId: null, help: null },
    { day: '2026-09-10', skillId: 'buttons', help: 'some' as const },
  ]

  it('are plain counts per skill with first and last day, and a dated count of every moment', () => {
    expect(skillCounts(moments, 'counts-to-ten')).toEqual({ did: 4, own: 2, some: 1, lots: 1, first: '2026-09-03', last: '2026-09-09' })
    expect(skillCounts(moments, 'buttons')).toEqual({ did: 1, own: 0, some: 1, lots: 0, first: '2026-09-10', last: '2026-09-10' })
    expect(skillCounts(moments, 'hops-on-one-foot')).toEqual({ did: 0, own: 0, some: 0, lots: 0, first: null, last: null })
    expect(momentSummary(moments)).toEqual({ n: 6, first: '2026-09-01', last: '2026-09-10' })
    expect(momentSummary([])).toEqual({ n: 0, first: null, last: null })
  })
})

describe('on the phone', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('adds a skill at the bottom rung, counts moments without moving it, moves it by a tap alone, and keeps counts after removal', async () => {
    await addHerSkill('counts-to-ten')
    await addHerSkill('counts-to-ten')
    await addHerSkill('not-a-skill')
    let list = await liveHerSkills()
    expect(list.map((s) => s.skillId)).toEqual(['counts-to-ten'])
    expect(list[0].rung).toBe('notIntroduced')

    await addMoment('2026-09-10', 'counts-to-ten', 'some')
    await addMoment('2026-09-11', 'counts-to-ten', 'own')
    await addMoment('2026-09-11', null, null)
    list = await liveHerSkills()
    expect(list[0].rung).toBe('notIntroduced')
    const all = await allMoments()
    expect(skillCounts(all, 'counts-to-ten')).toMatchObject({ did: 2, own: 1, some: 1, lots: 0 })
    expect(momentSummary(all)).toMatchObject({ n: 3, first: '2026-09-10', last: '2026-09-11' })

    await setHerRung('counts-to-ten', 'practicingWithDaddy')
    list = await liveHerSkills()
    expect(list[0].rung).toBe('practicingWithDaddy')

    await removeHerSkill('counts-to-ten')
    expect(await liveHerSkills()).toEqual([])
    expect(skillCounts(await allMoments(), 'counts-to-ten').did).toBe(2)
    // Back on the list at the rung it had.
    await addHerSkill('counts-to-ten')
    expect((await liveHerSkills())[0].rung).toBe('practicingWithDaddy')
  })

  it('keeps the list in the checklists’ own order', async () => {
    await addHerSkill('hops-on-one-foot')
    await addHerSkill('pretend-play')
    await addHerSkill('counts-to-ten')
    expect((await liveHerSkills()).map((s) => s.skillId)).toEqual(['pretend-play', 'counts-to-ten', 'hops-on-one-foot'])
  })
})

describe('the fatherhood family', () => {
  const sit: Situation = { block: 'evening', target: 'mood', key: 'evening:mood', band: 'gettingBy', reading: 50, targetPosition: 2 }
  const today = (withHer: boolean): TodayState => ({ doneToday: [], offeredToday: [], hiddenFamilies: new Set(), doneRungs: new Map(), studyNight: false, withHer, churchDay: false, noTimeCeiling: null })

  it('is small, practises a skill together, is offered only on days she is with you, and never merges with time with her', () => {
    expect(families.some((f) => f.id === 'fatherhood')).toBe(true)
    const entries = moves.filter((m) => m.family === 'fatherhood')
    expect(entries.length).toBeGreaterThanOrEqual(3)
    expect(entries.length).toBeLessThanOrEqual(5)
    for (const m of entries) {
      expect(m.needs, m.id).toContain('anotherPerson')
      expect(m.countsToward, m.id).not.toContain('timeWithHer')
      expect(screen(m, sit, today(true)), m.id).toBeNull()
      expect(screen(m, sit, today(false)), m.id).toBe('schedule')
    }
    const her = moves.find((m) => m.id === 'time-with-her')
    expect(her?.family).toBe('people')
    expect(moves.find((m) => m.id === 'practise-one-of-her-skills')?.what.toLowerCase()).toContain('different move')
  })
})
