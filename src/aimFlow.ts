import { blockAt } from './blocks'
import { db, type Aim, type AimKind, type Offer, type Outcome, type RungMark, type Skill, type StudyNight } from './db'
import { AIM_KINDS, aimKey, unblockKey } from './aims'
import { currentRung, TOP_RUNG, type Sitting } from './ladder'

// Aims on the phone: the commitments you chose, the skills you typed once, the marks that moved
// them, and the one-tap Resume that records a step as an offer to be asked about next time.

export async function activeAims(): Promise<Aim[]> {
  const all = await db.aims.filter((a) => a.archivedAt === null).toArray()
  return all.sort((a, b) => AIM_KINDS.indexOf(a.kind) - AIM_KINDS.indexOf(b.kind))
}

/** One commitment per kind, with nothing to type. A second of the same kind changes nothing. */
export function addAim(kind: AimKind, stepMoveId: string | null): Promise<void> {
  return db.transaction('rw', db.aims, async () => {
    const existing = await db.aims.filter((a) => a.kind === kind && a.archivedAt === null).first()
    if (existing) return
    await db.aims.add({ kind, stepMoveId, createdAt: new Date().toISOString(), archivedAt: null })
  })
}

export async function setAimStep(id: number, stepMoveId: string): Promise<void> {
  await db.aims.update(id, { stepMoveId })
}

/** Removing a commitment keeps its record; it simply stops being protected. */
export async function removeAim(id: number): Promise<void> {
  await db.aims.update(id, { archivedAt: new Date().toISOString() })
}

export async function liveSkills(): Promise<Skill[]> {
  const all = await db.skills.filter((s) => s.archivedAt === null).toArray()
  return all.sort((a, b) => a.order - b.order)
}

/** A skill typed once, with the subject it belongs to when there is more than one. */
export function addSkill(name: string, subject = ''): Promise<void> {
  return db.transaction('rw', db.skills, async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const all = await db.skills.toArray()
    const order = all.reduce((m, s) => Math.max(m, s.order), 0) + 1
    const s = subject.trim()
    await db.skills.add({ name: trimmed, ...(s ? { subject: s } : {}), order, createdAt: new Date().toISOString(), archivedAt: null })
  })
}

export async function removeSkill(id: number): Promise<void> {
  await db.skills.update(id, { archivedAt: new Date().toISOString() })
}

export function rungMarks(): Promise<RungMark[]> {
  return db.rungMarks.toArray()
}

/** Moves a skill one rung up or back, by your tap alone. Recorded as a mark, never edited. */
export function moveSkill(skillId: number, delta: 1 | -1): Promise<void> {
  return db.transaction('rw', db.rungMarks, async () => {
    const marks = await db.rungMarks.where('skillId').equals(skillId).toArray()
    const rung = Math.max(0, Math.min(TOP_RUNG, currentRung(marks, skillId) + delta))
    if (rung === currentRung(marks, skillId)) return
    await db.rungMarks.add({ skillId, rung, at: new Date().toISOString(), via: 'tap' })
  })
}

/** Done on a rung's step is the tap that moves the skill up; it never moves a skill back. */
export function markRungByStep(skillId: number, rung: number, at: string): Promise<void> {
  return db.transaction('rw', db.rungMarks, async () => {
    const marks = await db.rungMarks.where('skillId').equals(skillId).toArray()
    if (currentRung(marks, skillId) >= rung) return
    await db.rungMarks.add({ skillId, rung, at, via: 'step' })
  })
}

/** Every open step, unblock or started study offer: begun, not yet asked about. */
export async function openAimOffers(): Promise<Offer[]> {
  return db.offers.filter((o) => (o.kind === 'step' || o.kind === 'unblock' || o.kind === 'study') && o.closedAt === null && o.skippedAt === null).toArray()
}

export interface AimRecords {
  offers: Offer[]
  outcomes: Outcome[]
  nights: StudyNight[]
}

/** The records the aims are read from: step, unblock and study offers with their outcomes and the study nights. */
export async function aimRecords(): Promise<AimRecords> {
  const offers = await db.offers.filter((o) => o.kind === 'step' || o.kind === 'unblock' || o.kind === 'study').toArray()
  const ids = new Set(offers.map((o) => o.id as number))
  const outcomes = await db.outcomes.filter((x) => ids.has(x.offerId)).toArray()
  const nights = await db.studyNights.toArray()
  return { offers, outcomes, nights }
}

/**
 * Resume, one tap: records the step (or the unblock move) as an offer, started now, kept apart
 * from what happens. The next check-in asks done / partly / no like any other offer.
 */
export function resumeAim(aim: Aim, sitting: Sitting, kind: 'step' | 'unblock', now: Date = new Date()): Promise<Offer> {
  return db.transaction('rw', db.offers, async () => {
    const { day, block } = blockAt(now)
    const offer: Offer = {
      kind,
      day,
      block,
      at: now.toISOString(),
      situationKey: kind === 'step' ? aimKey(aim.kind) : unblockKey(aim.kind),
      target: aim.kind === 'certification' ? 'focus' : 'mood',
      stance: '',
      band: '',
      reading: 0,
      moveId: sitting.id,
      label: sitting.name,
      cardId: null,
      candidates: [sitting.id],
      coinFlip: false,
      passiveId: null,
      whyNot: null,
      skippedAt: null,
      closedAt: null,
    }
    offer.id = await db.offers.add(offer)
    return offer
  })
}

/** Everything the aims hold, for the export. */
export async function aimsSnapshot(): Promise<{ aims: Aim[]; skills: Skill[]; marks: RungMark[] }> {
  return { aims: await db.aims.toArray(), skills: await db.skills.toArray(), marks: await db.rungMarks.toArray() }
}
