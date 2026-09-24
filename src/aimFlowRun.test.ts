import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addAim, addLearning, addSkill, adoptOrphanSubjects, alignLadders, allIntentions, nameAim, planAim, resumeAim, setLadder, studyAims } from './aimFlow'
import { cueCounts, planFor, stepFor } from './aims'
import { db } from './db'
import { currentRung } from './ladder'

// A study commitment made before names existed: it adopts the one subject its skills carry, or
// waits to be named on its card; a name typed later attaches those skills.

describe('naming an older study commitment', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('adopts the one orphan subject, with its ladder, and otherwise waits', async () => {
    await db.aims.add({ kind: 'certification', stepMoveId: null, createdAt: '', archivedAt: null })
    await db.skills.add({ name: 'Ten words', subject: 'French', ladder: 'language', order: 1, createdAt: '', archivedAt: null })
    await adoptOrphanSubjects()
    expect((await studyAims())[0]).toMatchObject({ name: 'French', ladder: 'language' })
    await db.skills.add({ name: 'Scales', subject: 'Piano', order: 2, createdAt: '', archivedAt: null })
    await db.aims.add({ kind: 'certification', stepMoveId: null, createdAt: '', archivedAt: null })
    await adoptOrphanSubjects()
    expect((await studyAims()).map((a) => a.name ?? null)).toEqual(['French', 'Piano'])
  })

  it('waits when two subjects are orphaned, and takes a name typed on the card', async () => {
    await db.aims.add({ kind: 'certification', stepMoveId: null, createdAt: '', archivedAt: null })
    await db.skills.bulkAdd([
      { name: 'a', subject: 'French', order: 1, createdAt: '', archivedAt: null },
      { name: 'b', subject: 'Piano', order: 2, createdAt: '', archivedAt: null },
    ])
    await adoptOrphanSubjects()
    expect((await studyAims())[0].name).toBeUndefined()
    await nameAim(1, 'French')
    expect((await studyAims())[0].name).toBe('French')
  })

  it('files a skill added on the card under the commitment’s name and ladder', async () => {
    await addAim('certification', null, 'Piano', 'craft')
    await addSkill('Scale of C', 'Piano')
    expect((await db.skills.toArray())[0]).toMatchObject({ subject: 'Piano', ladder: 'craft' })
  })

  it('names an older commitment and chooses its proofs in the same tap; its skills follow', async () => {
    await db.aims.add({ kind: 'certification', stepMoveId: null, createdAt: '', archivedAt: null })
    await db.skills.add({ name: 'Ten words', subject: 'French', order: 1, createdAt: '', archivedAt: null })
    await nameAim(1, 'French', 'language')
    expect((await studyAims())[0]).toMatchObject({ name: 'French', ladder: 'language' })
    expect((await db.skills.get(1))?.ladder).toBe('language')
  })
})

describe('the ladder a subject climbs', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('aligns every skill to its commitment’s ladder at open; a commitment without one takes the ladder its skills share, else waits', async () => {
    await addAim('certification', null, 'French', 'language')
    // Filed under the subject before the commitment chose: no ladder of its own.
    await db.skills.add({ name: 'Ten words', subject: 'French', order: 1, createdAt: '', archivedAt: null })
    await db.aims.add({ kind: 'certification', stepMoveId: null, name: 'Piano', createdAt: '', archivedAt: null })
    await db.skills.add({ name: 'Scale of C', subject: 'Piano', ladder: 'craft', order: 2, createdAt: '', archivedAt: null })
    await db.aims.add({ kind: 'certification', stepMoveId: null, name: 'Mixed', createdAt: '', archivedAt: null })
    await db.skills.bulkAdd([
      { name: 'a', subject: 'Mixed', ladder: 'craft', order: 3, createdAt: '', archivedAt: null },
      { name: 'b', subject: 'Mixed', ladder: 'language', order: 4, createdAt: '', archivedAt: null },
    ])
    await alignLadders()
    const skills = await db.skills.toArray()
    expect(skills.find((s) => s.name === 'Ten words')?.ladder).toBe('language')
    const aims = await studyAims()
    expect(aims.find((a) => a.name === 'Piano')?.ladder).toBe('craft')
    expect(aims.find((a) => a.name === 'Mixed')?.ladder).toBeUndefined()
    // Running again changes nothing.
    await alignLadders()
    expect(await db.skills.toArray()).toEqual(skills)
  })

  it('keeps an older commitment’s marks when its six proofs are brought into line, and its step is the skill, never a rung (Workstream 6)', async () => {
    await addAim('certification', null, 'Networking')
    await addSkill('Subnetting', 'Networking')
    await db.rungMarks.add({ skillId: 1, rung: 1, at: '2026-09-07T20:00:00.000Z', via: 'tap' })
    await setLadder(1, 'language')
    const [aim] = await studyAims()
    expect(aim.ladder).toBe('language')
    expect((await db.skills.get(1))?.ladder).toBe('language')
    expect(currentRung(await db.rungMarks.toArray(), 1)).toBe(1)
    expect(stepFor(aim, await db.skills.toArray(), await db.rungMarks.toArray(), [aim])).toMatchObject({ id: 'skill:1', name: 'Subnetting', kind: 'skill' })
  })
})

describe('one tap says when', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('records the cue for today, a later tap replaces it, and Start keeps the plan', async () => {
    await addLearning('French', 'Pimsleur', 'Understand spoken French')
    const [aim] = await studyAims()
    await planAim(aim, 'afterPickup', '17:30', new Date(2026, 8, 7, 9, 0))
    await planAim(aim, 'afterBedtime', '20:00', new Date(2026, 8, 7, 9, 1))
    const plan = planFor(await allIntentions(), aim.id as number, '2026-09-07')
    expect(plan).toMatchObject({ cue: 'afterBedtime', time: '20:00', offerId: null })
    const step = stepFor(aim, await db.skills.toArray(), [], [aim])
    expect(step.id).toBe('skill:1')
    const offer = await resumeAim(aim, step, 'step', new Date(2026, 8, 7, 20, 10))
    expect(offer).toMatchObject({ moveId: 'skill:1', label: 'Understand spoken French' })
    expect((await allIntentions()).find((i) => i.id === plan?.id)?.offerId).toBe(offer.id)
    expect(cueCounts(await allIntentions(), aim.id as number)).toEqual([{ cue: 'afterBedtime', n: 1, started: 1 }])
  })
})
