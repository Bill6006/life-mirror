import { db, type HerSkill, type Moment } from './db'
import { herSkillById, herSkillOrder, type HelpLevel, type HerRung } from './her'

// Her skills and moments on the phone. A skill enters the list by your tap, its rung moves by
// your tap, and a count is one more moment; no count ever moves a rung.

export async function liveHerSkills(): Promise<HerSkill[]> {
  const all = await db.herSkills.filter((s) => s.archivedAt === null).toArray()
  return all.sort((a, b) => herSkillOrder(a.skillId) - herSkillOrder(b.skillId))
}

/** Puts a skill from the checklists on the list, at the bottom rung; one already there is left alone, and a removed one comes back at its old rung. */
export function addHerSkill(skillId: string): Promise<void> {
  return db.transaction('rw', db.herSkills, async () => {
    if (!herSkillById(skillId)) return
    const existing = await db.herSkills.get(skillId)
    const now = new Date().toISOString()
    if (existing) {
      if (existing.archivedAt !== null) await db.herSkills.update(skillId, { archivedAt: null })
      return
    }
    await db.herSkills.add({ skillId, rung: 'notIntroduced', addedAt: now, rungAt: now, archivedAt: null })
  })
}

/** Removing a skill keeps its counts; it simply leaves the list. */
export async function removeHerSkill(skillId: string): Promise<void> {
  await db.herSkills.update(skillId, { archivedAt: new Date().toISOString() })
}

/** The one way a rung changes: your tap. */
export async function setHerRung(skillId: string, rung: HerRung): Promise<void> {
  await db.herSkills.update(skillId, { rung, rungAt: new Date().toISOString() })
}

/** One more moment with her today: on its own, or one skill she did and the help she needed. */
export function addMoment(day: string, skillId: string | null, help: HelpLevel | null): Promise<void> {
  return db.transaction('rw', db.moments, async () => {
    await db.moments.add({ day, at: new Date().toISOString(), skillId, help })
  })
}

export function allMoments(): Promise<Moment[]> {
  return db.moments.toArray()
}

/** Everything under Her, for the export. */
export async function herSnapshot(): Promise<{ skills: HerSkill[]; moments: Moment[] }> {
  return { skills: await db.herSkills.toArray(), moments: await db.moments.toArray() }
}
