import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addAim, addSkill, adoptOrphanSubjects, alignLadders, allIntentions, markRungByStep, moveSkill, nameAim, planAim, resumeAim, setLadder, studyAims } from './aimFlow'
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

  it('changes the six proofs on the card: the commitment and its skills take the ladder, the marks stay, the step takes the new words', async () => {
    await addAim('certification', null, 'Networking')
    await addSkill('Subnetting', 'Networking')
    await moveSkill(1, 1)
    await setLadder(1, 'language')
    const [aim] = await studyAims()
    expect(aim.ladder).toBe('language')
    expect((await db.skills.get(1))?.ladder).toBe('language')
    expect(currentRung(await db.rungMarks.toArray(), 1)).toBe(1)
    expect(stepFor(aim, await db.skills.toArray(), await db.rungMarks.toArray(), [aim]).name).toBe('Networking · Subnetting · say it')
  })
})

describe('one tap says when', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('records the cue for today, a later tap replaces it, and Resume keeps the plan', async () => {
    await addAim('certification', null, 'French', 'language')
    const [aim] = await studyAims()
    await planAim(aim, 'afterPickup', '17:30', new Date(2026, 8, 7, 9, 0))
    await planAim(aim, 'afterBedtime', '20:00', new Date(2026, 8, 7, 9, 1))
    const plan = planFor(await allIntentions(), aim.id as number, '2026-09-07')
    expect(plan).toMatchObject({ cue: 'afterBedtime', time: '20:00', offerId: null })
    const offer = await resumeAim(aim, stepFor(aim, [], [], [aim]), 'step', new Date(2026, 8, 7, 20, 10))
    expect(offer.minutes).toBe(stepFor(aim, [], [], [aim]).minutes)
    expect((await allIntentions()).find((i) => i.id === plan?.id)?.offerId).toBe(offer.id)
    expect(cueCounts(await allIntentions(), aim.id as number)).toEqual([{ cue: 'afterBedtime', n: 1, started: 1 }])
  })

  it('says what Done did to the skill', async () => {
    await addAim('certification', null, 'French', 'language')
    await addSkill('Ten words', 'French')
    expect(await markRungByStep(1, 1, '2026-09-07T20:00:00Z')).toMatchObject({ from: 0, to: 1, skill: { name: 'Ten words', ladder: 'language' } })
    expect(await markRungByStep(1, 1, '2026-09-07T20:30:00Z')).toMatchObject({ from: 1, to: 1 })
    expect(await markRungByStep(9, 1, '2026-09-07T20:30:00Z')).toBeNull()
    expect(await db.rungMarks.count()).toBe(1)
  })
})
