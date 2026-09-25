import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { activeAims, addAim, addLearning, addSkill, adoptCurrentSkills, editSkill, finishAim, finishedAims, logSession, makeCurrent, pauseAim, reopenAim, resumeAim, setCurrentSkill, setEase, setSessionNote, studyAims } from './aimFlow'
import { currentSkillOf, practiceOn, skillsOfAim, stepFor } from './aims'
import { db, type Aim } from './db'
import { recordOutcome } from './offerFlow'

// Workstream 6, Part 38: one current skill. Something to learn is set up in your words with no
// cadence assumed; its current skill changes only when you change it, the one before kept with its
// sessions; an older study commitment takes, once, the skill its step named; the retired ladder
// moves nothing; and how a session went is one optional tap, kept as evidence.

const T = (h: number, m = 0) => new Date(2026, 8, 20, h, m)

async function learning(): Promise<Aim> {
  const [aim] = await studyAims()
  if (!aim) throw new Error('no learning commitment')
  return aim
}

describe('something to learn', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('is set up in your words: the goal, how you practise it, the one thing to work on now, and what would change the advice; no cadence is assumed', async () => {
    const id = await addLearning('Learn Veltish', 'A phrasebook', 'Understand and respond to spoken Veltish', 'I can read a little', T(9))
    const aim = await learning()
    expect(aim).toMatchObject({ id, kind: 'certification', name: 'Learn Veltish', about: 'I can read a little', currentSkillId: 1 })
    expect(aim).not.toHaveProperty('rhythm')
    const skills = await db.skills.toArray()
    expect(skills).toMatchObject([{ id: 1, name: 'Understand and respond to spoken Veltish', method: 'A phrasebook', aimId: id, source: 'you', startedAt: T(9).toISOString() }])
    expect(skills[0]).not.toHaveProperty('minutes')
    expect(stepFor(aim, skills, [])).toMatchObject({ id: 'skill:1', name: 'Understand and respond to spoken Veltish', method: 'A phrasebook', minutes: 0 })
    // The same goal twice changes nothing; an empty goal adds nothing.
    expect(await addLearning('learn veltish')).toBeNull()
    expect(await addLearning('  ')).toBeNull()
    expect(await activeAims()).toHaveLength(1)
  })

  it('without a skill named, has nothing to start, keeps the method for the skill you name later', async () => {
    await addLearning('Learn ocarina', 'A teacher', '', '', T(9))
    let aim = await learning()
    expect(aim).toMatchObject({ currentSkillId: null, method: 'A teacher' })
    expect(stepFor(aim, [], []).id).toBe('skill:none')
    await setCurrentSkill(aim.id as number, { name: 'Play my current piece smoothly' }, T(10))
    aim = await learning()
    const skills = await db.skills.toArray()
    expect(currentSkillOf(aim, skills, [])).toMatchObject({ name: 'Play my current piece smoothly', method: 'A teacher' })
    expect(aim.method).toBeUndefined()
  })

  it('changes its current skill only when you do: the one it replaces is kept with its sessions, and you can go back to it', async () => {
    await addLearning('Learn Veltish', 'A phrasebook', 'Understand spoken Veltish', '', T(9))
    const aim = await learning()
    const first = stepFor(aim, await db.skills.toArray(), [])
    const s1 = await resumeAim(aim, first, 'step', T(9, 30))
    await recordOutcome(s1, 'done', null, null, { day: '2026-09-20', block: 'morning' }, 'right')
    await setCurrentSkill(aim.id as number, { name: 'Read short stories', method: 'Graded readers', minutes: 20 }, T(12))
    let now = await learning()
    let skills = await db.skills.toArray()
    expect(currentSkillOf(now, skills, [])).toMatchObject({ id: 2, name: 'Read short stories', minutes: 20, startedAt: T(12).toISOString() })
    expect(skills.find((sk) => sk.id === 1)).toMatchObject({ endedAt: T(12).toISOString() })
    expect(skillsOfAim(now, skills).map((sk) => sk.name)).toEqual(['Understand spoken Veltish', 'Read short stories'])
    // Back to the earlier one: current from now, its old sessions still its own.
    await makeCurrent(now.id as number, 1, T(15))
    now = await learning()
    skills = await db.skills.toArray()
    expect(currentSkillOf(now, skills, [])?.id).toBe(1)
    expect(skills.find((sk) => sk.id === 2)).toMatchObject({ endedAt: T(15).toISOString() })
    expect(practiceOn({ ...skills[0], startedAt: undefined }, await db.offers.toArray(), await db.outcomes.toArray())).toMatchObject({ sessions: 1, ease: { right: 1, hard: 0, easy: 0 } })
    // Its words can change; its sessions stay its own.
    await editSkill(1, { name: 'Understand and answer spoken Veltish', method: 'A phrasebook', minutes: 30 })
    expect(await db.skills.get(1)).toMatchObject({ name: 'Understand and answer spoken Veltish', minutes: 30 })
  })

  it('pauses and takes up again, and finishes apart from Remove, reopened by a tap', async () => {
    await addLearning('Learn Veltish', '', 'Understand spoken Veltish', '', T(9))
    const aim = await learning()
    await pauseAim(aim.id as number, true)
    expect((await learning()).pausedAt).toBeTruthy()
    await pauseAim(aim.id as number, false)
    expect((await learning()).pausedAt).toBeNull()
    await finishAim(aim.id as number, T(18))
    expect(await activeAims()).toEqual([])
    expect((await finishedAims()).map((a) => a.finishedAt)).toEqual([T(18).toISOString()])
    await reopenAim(aim.id as number)
    expect((await activeAims()).map((a) => a.id)).toEqual([aim.id])
    expect(await finishedAims()).toEqual([])
  })

  it('keeps how a session went, one optional tap, and one line with it; a No keeps none', async () => {
    await addLearning('Learn Veltish', '', 'Understand spoken Veltish', '', T(9))
    const aim = await learning()
    const step = stepFor(aim, await db.skills.toArray(), [])
    const id = await logSession(aim, step, T(10))
    await setEase(id, 'hard')
    await setSessionNote(id, '  Lost the thread at the numbers  ')
    expect(await db.outcomes.where('offerId').equals(id).first()).toMatchObject({ ease: 'hard', note: 'Lost the thread at the numbers' })
    await setEase(id, 'easy')
    expect((await db.outcomes.where('offerId').equals(id).first())?.ease).toBe('easy')
    const s2 = await resumeAim(aim, step, 'step', T(11))
    await recordOutcome(s2, 'no', 'noTime', null, { day: '2026-09-20', block: 'morning' }, 'hard')
    expect((await db.outcomes.where('offerId').equals(s2.id as number).first())?.ease).toBeUndefined()
  })
})

describe('an older study commitment, adopted once (D2)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('takes the skill its step named as its current skill, files its skills under it, keeps every mark, and changes nothing the second time', async () => {
    await addAim('certification', null, 'Clockwork', 'technical')
    await addSkill('Gear trains', 'Clockwork')
    await addSkill('Escapements', 'Clockwork')
    await db.rungMarks.bulkAdd([
      { skillId: 2, rung: 1, at: '2026-09-10T20:00:00.000Z', via: 'tap' },
      { skillId: 2, rung: 2, at: '2026-09-12T20:00:00.000Z', via: 'step' },
    ])
    await adoptCurrentSkills()
    const aim = await learning()
    const skills = await db.skills.toArray()
    expect(aim.currentSkillId).toBe(2)
    expect(skills.every((sk) => sk.aimId === aim.id)).toBe(true)
    expect(skills.find((sk) => sk.id === 2)?.startedAt).toBe('2026-09-12T20:00:00.000Z')
    expect(await db.rungMarks.count()).toBe(2)
    expect(stepFor(aim, skills, await db.rungMarks.toArray())).toMatchObject({ id: 'skill:2', name: 'Escapements' })
    const before = { aims: await db.aims.toArray(), skills }
    await adoptCurrentSkills()
    expect({ aims: await db.aims.toArray(), skills: await db.skills.toArray() }).toEqual(before)
  })

  it('with no skill yet, adopts none and waits for one to be named', async () => {
    await addAim('certification', null, 'Ocarina', 'craft')
    await adoptCurrentSkills()
    expect((await learning()).currentSkillId).toBeNull()
  })
})
