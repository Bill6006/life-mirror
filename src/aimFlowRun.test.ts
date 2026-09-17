import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addAim, addSkill, adoptOrphanSubjects, nameAim, studyAims } from './aimFlow'
import { db } from './db'

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
})
