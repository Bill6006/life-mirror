import { blockAt } from './blocks'
import { db, type Aim, type AimKind, type Cue, type Intention, type LadderKind, type Offer, type Outcome, type RungMark, type Skill, type StudyNight } from './db'
import { AIM_KINDS, keyFor, planFor, unblockKeyFor } from './aims'
import { currentRung, ladderOf, orphanSubjects, skillsOf, TOP_RUNG, type RungMove, type Sitting } from './ladder'

// Aims on the phone: the commitments you chose, the skills you typed once, the marks that moved
// them, and the one-tap Resume that records a step as an offer to be asked about next time.

export async function activeAims(): Promise<Aim[]> {
  const all = await db.aims.filter((a) => a.archivedAt === null).toArray()
  return all.sort((a, b) => AIM_KINDS.indexOf(a.kind) - AIM_KINDS.indexOf(b.kind))
}

/**
 * A commitment. A person and a practice, one each, with nothing to type; study as many as you
 * name, one per subject, each choosing its six proofs once. A second of a kind, or a name already
 * on the list, changes nothing.
 */
export function addAim(kind: AimKind, stepMoveId: string | null, name = '', ladder: LadderKind = 'technical'): Promise<void> {
  return db.transaction('rw', db.aims, async () => {
    const live = await db.aims.filter((a) => a.kind === kind && a.archivedAt === null).toArray()
    if (kind === 'certification') {
      const n = name.trim()
      if (!n || live.some((a) => (a.name ?? '').trim().toLowerCase() === n.toLowerCase())) return
      await db.aims.add({ kind, stepMoveId: null, name: n, ladder, createdAt: new Date().toISOString(), archivedAt: null })
      return
    }
    if (live.length) return
    await db.aims.add({ kind, stepMoveId, createdAt: new Date().toISOString(), archivedAt: null })
  })
}

/** The study commitments, in the order they were made. */
export async function studyAims(): Promise<Aim[]> {
  return (await activeAims()).filter((a) => a.kind === 'certification')
}

/** Names a study commitment made before names existed, and chooses its six proofs in the same tap. */
export function nameAim(id: number, name: string, ladder?: LadderKind): Promise<void> {
  const n = name.trim()
  if (!n) return Promise.resolve()
  return db.transaction('rw', [db.aims, db.skills], async () => {
    await db.aims.update(id, { name: n })
    if (ladder) await setLadder(id, ladder)
  })
}

/**
 * A subject's six proofs, changed on its card: the commitment and every skill under its name take
 * the ladder. The marks stay; each rung keeps its number and takes the new words.
 */
export function setLadder(aimId: number, ladder: LadderKind): Promise<void> {
  return db.transaction('rw', [db.aims, db.skills], async () => {
    const aim = await db.aims.get(aimId)
    if (!aim || aim.kind !== 'certification') return
    await db.aims.update(aimId, { ladder })
    const study = await db.aims.filter((a) => a.kind === 'certification' && a.archivedAt === null).toArray()
    const skills = await db.skills.toArray()
    const own = new Set(skillsOf({ ...aim, ladder: undefined }, skills, study).map((s) => s.id as number))
    for (const s of skills) if (own.has(s.id as number) && ladderOf(s) !== ladder) await db.skills.update(s.id as number, { ladder })
  })
}

/**
 * Runs at open: every skill climbs its commitment's ladder. A commitment that never chose one
 * takes the ladder its skills carry when they all carry the same; otherwise it waits for the tap
 * on its card. Changes nothing once everything agrees.
 */
export function alignLadders(): Promise<void> {
  return db.transaction('rw', [db.aims, db.skills], async () => {
    const study = await db.aims.filter((a) => a.kind === 'certification' && a.archivedAt === null).toArray()
    const skills = await db.skills.toArray()
    for (const aim of study) {
      const own = skillsOf({ ...aim, ladder: undefined }, skills, study)
      let ladder = aim.ladder
      if (!ladder) {
        const kinds = new Set(own.filter((s) => s.ladder).map((s) => s.ladder as LadderKind))
        if (kinds.size !== 1) continue
        ladder = [...kinds][0]
        await db.aims.update(aim.id as number, { ladder })
      }
      for (const s of own) if (ladderOf(s) !== ladder) await db.skills.update(s.id as number, { ladder })
    }
  })
}

/** One tap says when: the cue for a commitment's step today. A later tap replaces it; the plan is kept once the step is started. */
export function planAim(aim: Aim, cue: Cue, time: string, now: Date = new Date()): Promise<void> {
  return db.transaction('rw', db.intentions, async () => {
    const { day } = blockAt(now)
    await db.intentions.add({ aimId: aim.id as number, day, cue, time, setAt: now.toISOString(), offerId: null })
  })
}

export function allIntentions(): Promise<Intention[]> {
  return db.intentions.toArray()
}

/**
 * A study commitment made before names existed adopts the one subject its skills carry, when
 * there is exactly one such subject and exactly one such commitment; otherwise it waits to be
 * named on its card. Runs at open; changes nothing once every study commitment has a name.
 */
export function adoptOrphanSubjects(): Promise<void> {
  return db.transaction('rw', [db.aims, db.skills], async () => {
    const study = await db.aims.filter((a) => a.kind === 'certification' && a.archivedAt === null).toArray()
    const unnamed = study.filter((a) => !(a.name ?? '').trim())
    if (unnamed.length !== 1) return
    const skills = await db.skills.toArray()
    const orphans = orphanSubjects(skills, study)
    if (orphans.length !== 1) return
    const subject = orphans[0]
    const under = skills.find((s) => s.archivedAt === null && (s.subject ?? '').trim().toLowerCase() === subject.toLowerCase() && s.ladder)
    await db.aims.update(unnamed[0].id as number, { name: subject, ...(under?.ladder ? { ladder: under.ladder } : {}) })
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

/**
 * A skill typed once, with the subject it belongs to when there is more than one. A subject
 * chooses its ladder once: a skill added under a subject already on the list climbs that
 * subject's ladder, whatever was picked.
 */
export function addSkill(name: string, subject = '', ladder: LadderKind = 'technical'): Promise<void> {
  return db.transaction('rw', [db.skills, db.aims], async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const all = await db.skills.toArray()
    const order = all.reduce((m, s) => Math.max(m, s.order), 0) + 1
    const s = subject.trim()
    // The subject's commitment chose the ladder; failing that, a skill already under the subject; failing that, what was asked.
    const aim = s ? (await db.aims.filter((a) => a.kind === 'certification' && a.archivedAt === null).toArray()).find((a) => (a.name ?? '').trim().toLowerCase() === s.toLowerCase()) : undefined
    const existing = s ? all.find((x) => x.archivedAt === null && (x.subject ?? '').trim().toLowerCase() === s.toLowerCase()) : undefined
    const kind = aim?.ladder ?? (existing ? ladderOf(existing) : ladder)
    await db.skills.add({ name: trimmed, ...(s ? { subject: s } : {}), ...(kind !== 'technical' ? { ladder: kind } : {}), order, createdAt: new Date().toISOString(), archivedAt: null })
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

/** Done on a rung's step is the tap that moves the skill up; it never moves a skill back. Says what it did. */
export function markRungByStep(skillId: number, rung: number, at: string): Promise<RungMove | null> {
  return db.transaction('rw', [db.rungMarks, db.skills], async () => {
    const skill = await db.skills.get(skillId)
    if (!skill) return null
    const marks = await db.rungMarks.where('skillId').equals(skillId).toArray()
    const from = currentRung(marks, skillId)
    if (from >= rung) return { skill, from, to: from }
    await db.rungMarks.add({ skillId, rung, at, via: 'step' })
    return { skill, from, to: rung }
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
  return db.transaction('rw', [db.offers, db.intentions], async () => {
    const { day, block } = blockAt(now)
    const offer: Offer = {
      kind,
      day,
      block,
      at: now.toISOString(),
      situationKey: kind === 'step' ? keyFor(aim) : unblockKeyFor(aim),
      target: aim.kind === 'certification' ? 'focus' : 'mood',
      stance: '',
      band: '',
      reading: 0,
      moveId: sitting.id,
      label: sitting.name,
      minutes: sitting.minutes,
      cardId: null,
      candidates: [sitting.id],
      coinFlip: false,
      passiveId: null,
      whyNot: null,
      skippedAt: null,
      closedAt: null,
    }
    offer.id = await db.offers.add(offer)
    // The step was planned for today and is now started: the plan is kept.
    if (kind === 'step') {
      const plan = planFor(await db.intentions.where('day').equals(day).toArray(), aim.id as number, day)
      if (plan && plan.offerId === null) await db.intentions.update(plan.id as number, { offerId: offer.id })
    }
    return offer
  })
}

/** Everything the aims hold, for the export. */
export async function aimsSnapshot(): Promise<{ aims: Aim[]; skills: Skill[]; marks: RungMark[]; intentions: Intention[] }> {
  return { aims: await db.aims.toArray(), skills: await db.skills.toArray(), marks: await db.rungMarks.toArray(), intentions: await db.intentions.toArray() }
}
