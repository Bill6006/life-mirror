import { blockAt } from './blocks'
import { db, type Aim, type AimKind, type Cue, type Ease, type Intention, type LadderKind, type Offer, type Outcome, type RungMark, type Skill, type StudyNight } from './db'
import type { CoachAsk, CoachProposal } from './coachShared'
import { AIM_KINDS, keyFor, planFor, unblockKeyFor } from './aims'
import { ladderOf, nextStep, orphanSubjects, skillsOf, type Sitting } from './ladder'
import { rhythmOf, scheduleOf, type Rhythm } from './rhythm'

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
 * A subject's six proofs, as older commitments chose them. Used only to bring a name and its
 * skills into line before adoption (Workstream 6 retired the ladder as an engine, D2).
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
export function planAim(aim: Aim, cue: Cue, time: string, now: Date = new Date(), step = ''): Promise<void> {
  return db.transaction('rw', db.intentions, async () => {
    const { day } = blockAt(now)
    await db.intentions.add({ aimId: aim.id as number, day, cue, time, setAt: now.toISOString(), offerId: null, ...(step ? { step } : {}) })
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

/** Every open step, unblock or started study offer: begun, not yet asked about. */
/** A commitment's step, unblock or study offer, started and not yet answered or skipped. */
export function isOpenAimOffer(o: Offer): boolean {
  return (o.kind === 'step' || o.kind === 'unblock' || o.kind === 'study') && o.closedAt === null && o.skippedAt === null
}

export async function openAimOffers(): Promise<Offer[]> {
  return db.offers.filter(isOpenAimOffer).toArray()
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

/**
 * Did it already: a session done away from the app, recorded as started and done at the same
 * moment (Workstream 6). Today's plan for it counts as kept, so no reminder fires for it. Returns
 * the session, for the one optional tap on how it went.
 */
export function logSession(aim: Aim, sitting: Sitting, now: Date = new Date()): Promise<number> {
  return db.transaction('rw', [db.offers, db.outcomes, db.intentions], async () => {
    const { day, block } = blockAt(now)
    const at = now.toISOString()
    const offer: Offer = {
      kind: 'step',
      day,
      block,
      at,
      situationKey: keyFor(aim),
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
      logged: true,
      skippedAt: null,
      closedAt: at,
    }
    const id = await db.offers.add(offer)
    await db.outcomes.add({ offerId: id, moveId: sitting.id, day, block, at, outcome: 'done', why: null, passiveOutcome: null })
    const plan = planFor(await db.intentions.where('day').equals(day).toArray(), aim.id as number, day)
    if (plan && plan.offerId === null) await db.intentions.update(plan.id as number, { offerId: id })
    return id
  })
}

/** A skill as you describe it: its name, how you practise it, how to do it, and a session's minutes when you know them. */
export interface SkillWords {
  name: string
  method?: string
  how?: string
  minutes?: number | null
}

function tidy(w: SkillWords): Pick<Skill, 'name' | 'method' | 'how' | 'minutes'> {
  const out: Pick<Skill, 'name' | 'method' | 'how' | 'minutes'> = { name: w.name.trim().slice(0, 80) }
  const method = w.method?.trim()
  const how = w.how?.trim()
  if (method) out.method = method.slice(0, 60)
  if (how) out.how = how.slice(0, 240)
  if (typeof w.minutes === 'number' && Number.isFinite(w.minutes) && w.minutes >= 1 && w.minutes <= 240) out.minutes = Math.round(w.minutes)
  return out
}

async function nextOrder(): Promise<number> {
  return (await db.skills.toArray()).reduce((m, s) => Math.max(m, s.order), 0) + 1
}

/**
 * Something to learn (Workstream 6): the goal in your words, how you learn or practise it, the one
 * thing to work on now when you know it, and anything that would change the advice. It exists at
 * once; with no skill named, its card keeps a place for one. No cadence is assigned. A goal already
 * on the list changes nothing. Returns the commitment, or null when nothing was added.
 */
export function addLearning(goal: string, method = '', skill = '', about = '', now: Date = new Date()): Promise<number | null> {
  return db.transaction('rw', [db.aims, db.skills], async () => {
    const name = goal.trim().slice(0, 60)
    if (!name) return null
    const live = await db.aims.filter((a) => a.kind === 'certification' && a.archivedAt === null).toArray()
    if (live.some((a) => (a.name ?? '').trim().toLowerCase() === name.toLowerCase())) return null
    const at = now.toISOString()
    const told = about.trim().slice(0, 240)
    const aimId = (await db.aims.add({ kind: 'certification', stepMoveId: null, name, createdAt: at, archivedAt: null, currentSkillId: null, ...(told ? { about: told } : {}) })) as number
    if (skill.trim()) {
      const id = (await db.skills.add({ ...tidy({ name: skill, method }), aimId, source: 'you', startedAt: at, order: await nextOrder(), createdAt: at, archivedAt: null })) as number
      await db.aims.update(aimId, { currentSkillId: id })
    } else if (method.trim()) {
      // The method waits on the commitment until a skill is named; it becomes that skill's.
      await db.aims.update(aimId, { method: method.trim().slice(0, 60) })
    }
    return aimId
  })
}

/**
 * A new current skill, in your words: the one it replaces stays in the history with its sessions,
 * marked as ended; the new one begins now (Workstream 6). Nothing changes a skill but you.
 */
export function setCurrentSkill(aimId: number, words: SkillWords, now: Date = new Date(), source: 'you' | 'claude' = 'you'): Promise<number | null> {
  return db.transaction('rw', [db.aims, db.skills], async () => {
    const aim = await db.aims.get(aimId)
    if (!aim || aim.kind !== 'certification' || !words.name.trim()) return null
    const at = now.toISOString()
    if (typeof aim.currentSkillId === 'number') await db.skills.update(aim.currentSkillId, { endedAt: at })
    const id = (await db.skills.add({ ...tidy({ method: aim.method, ...words }), aimId, source, startedAt: at, order: await nextOrder(), createdAt: at, archivedAt: null })) as number
    await db.aims.update(aimId, { currentSkillId: id, method: undefined })
    return id
  })
}

/** Changes the words of a skill you named, the current one or an earlier one; its sessions stay its own. */
export function editSkill(skillId: number, words: SkillWords): Promise<void> {
  return db.transaction('rw', db.skills, async () => {
    const skill = await db.skills.get(skillId)
    if (!skill || !words.name.trim()) return
    const t = tidy(words)
    await db.skills.update(skillId, { name: t.name, method: t.method, how: t.how, minutes: t.minutes })
  })
}

/** Back to an earlier skill, or on to one you named before: it becomes current from now; the one it replaces ends now. */
export function makeCurrent(aimId: number, skillId: number, now: Date = new Date()): Promise<void> {
  return db.transaction('rw', [db.aims, db.skills], async () => {
    const aim = await db.aims.get(aimId)
    const skill = await db.skills.get(skillId)
    if (!aim || !skill || skill.archivedAt !== null || aim.currentSkillId === skillId) return
    const at = now.toISOString()
    if (typeof aim.currentSkillId === 'number') await db.skills.update(aim.currentSkillId, { endedAt: at })
    await db.skills.update(skillId, { aimId, startedAt: at, endedAt: undefined })
    await db.aims.update(aimId, { currentSkillId: skillId })
  })
}

/** How often you practise it, set by you: sessions a week and rest days between; null makes it flexible again. Never assumed (Workstream 6, Part 39). */
export async function setRhythm(aimId: number, rhythm: Rhythm | null): Promise<void> {
  await db.aims.update(aimId, { rhythm: rhythm ? rhythmOf(rhythm) : null })
}

/** Fixed days, set by you: when any are set they alone decide when it is due; none leaves that to its rhythm. */
export async function setSchedule(aimId: number, days: readonly number[]): Promise<void> {
  await db.aims.update(aimId, { schedule: scheduleOf(days) })
}

/** Paused: no row on Now and nothing surfaces it, its record kept; taken up again by the same tap. */
export async function pauseAim(aimId: number, paused: boolean): Promise<void> {
  await db.aims.update(aimId, { pausedAt: paused ? new Date().toISOString() : null })
}

/** Finished: the goal is reached, dated and kept; distinct from Remove, and reopened by a tap. */
export async function finishAim(aimId: number, now: Date = new Date()): Promise<void> {
  await db.aims.update(aimId, { finishedAt: now.toISOString(), archivedAt: now.toISOString() })
}

export async function reopenAim(aimId: number): Promise<void> {
  await db.aims.update(aimId, { finishedAt: null, archivedAt: null })
}

export function finishedAims(): Promise<Aim[]> {
  return db.aims.filter((a) => typeof a.finishedAt === 'string' && a.finishedAt !== '').toArray()
}

/** How a session went, one optional tap after it: evidence for a review, never a grade. A second tap replaces the first. */
export async function setEase(offerId: number, ease: Ease | null): Promise<void> {
  const x = await db.outcomes.where('offerId').equals(offerId).first()
  if (x?.id !== undefined) await db.outcomes.update(x.id, { ease: ease ?? undefined })
}

/** One optional line about a session, in your words. */
export async function setSessionNote(offerId: number, note: string): Promise<void> {
  const x = await db.outcomes.where('offerId').equals(offerId).first()
  const text = note.trim().slice(0, 200)
  if (x?.id !== undefined) await db.outcomes.update(x.id, { note: text || undefined })
}

/**
 * Runs at open (Workstream 6, D2): each learning commitment made before the current skill existed
 * takes, as its current skill, the one the retired ladder's step named, and files its skills under
 * itself. Its marks stay as history and move nothing. Changes nothing once each has been adopted.
 */
export function adoptCurrentSkills(): Promise<void> {
  return db.transaction('rw', [db.aims, db.skills, db.rungMarks], async () => {
    const study = await db.aims.filter((a) => a.kind === 'certification' && a.archivedAt === null).toArray()
    const skills = await db.skills.toArray()
    const marks = await db.rungMarks.toArray()
    for (const aim of study) {
      if (aim.currentSkillId !== undefined) continue
      const own = skillsOf(aim, skills, study)
      for (const sk of own) if (sk.aimId === undefined) await db.skills.update(sk.id as number, { aimId: aim.id })
      const current = nextStep(own, marks)?.skill ?? null
      if (current) {
        const moved = marks.filter((m) => m.skillId === current.id).map((m) => m.at).sort().pop()
        await db.skills.update(current.id as number, { startedAt: moved ?? aim.createdAt })
      }
      await db.aims.update(aim.id as number, { currentSkillId: current ? (current.id as number) : null })
    }
  })
}

/** Everything the aims hold, for the export: the skill coach's asks and proposals too (Parts 40 and 41). */
export async function aimsSnapshot(): Promise<{ aims: Aim[]; skills: Skill[]; marks: RungMark[]; intentions: Intention[]; coachAsks: CoachAsk[]; coachProposals: CoachProposal[] }> {
  const [aims, skills, marks, intentions, coachAsks, coachProposals] = await Promise.all([db.aims.toArray(), db.skills.toArray(), db.rungMarks.toArray(), db.intentions.toArray(), db.coachAsks.toArray(), db.coachProposals.toArray()])
  return { aims, skills, marks, intentions, coachAsks, coachProposals }
}
