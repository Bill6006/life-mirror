import { blockAt } from './blocks'
import { moveById, type PathId } from './catalogue'
import { db, type Aim, type Offer } from './db'
import { planFor } from './aims'
import { pathKey, type RepPick } from './pathStage'

// The path commitment on the phone (Part 24): added once per path, converted from A person with
// its record kept, paused and resumed, a rep picked by you through Change, and Resume, which
// records the step as an offer saying who chose it, where it was meant to happen and why.

/** A path, once: a second tap, or a path already on the list, changes nothing. */
export function addPathAim(path: PathId): Promise<void> {
  return db.transaction('rw', db.aims, async () => {
    const live = await db.aims.filter((a) => a.archivedAt === null && a.kind === 'path' && a.path === path).toArray()
    if (live.length) return
    await db.aims.add({ kind: 'path', path, stepMoveId: null, pausedAt: null, createdAt: new Date().toISOString(), archivedAt: null })
  })
}

/**
 * A person becomes the Social path: the same commitment, so its plans, its steps and their
 * answers stay its record. Nothing changes when a Social path is already on the list.
 */
export function convertToSocial(aimId: number): Promise<void> {
  return db.transaction('rw', db.aims, async () => {
    const aim = await db.aims.get(aimId)
    if (!aim || aim.kind !== 'person' || aim.archivedAt !== null) return
    const social = await db.aims.filter((a) => a.archivedAt === null && a.kind === 'path' && a.path === 'social').count()
    if (social) return
    await db.aims.update(aimId, { kind: 'path', path: 'social', convertedFrom: 'person', convertedAt: new Date().toISOString(), pausedAt: null })
  })
}

/** Pause, or take up again. A paused path has no row on Now and no step; its record is kept. */
export async function pausePath(aimId: number, paused: boolean): Promise<void> {
  await db.aims.update(aimId, { pausedAt: paused ? new Date().toISOString() : null })
}

/** Your pick through Change: today's rep, offered whatever the shape says, until the day ends or it is done. */
export async function setPathPick(aimId: number, moveId: string, day: string): Promise<void> {
  await db.aims.update(aimId, { pick: { day, moveId } })
}

/** Whether a path is on: on the list and not paused. */
export function pathOn(a: Aim): boolean {
  return a.kind === 'path' && a.archivedAt === null && !a.pausedAt
}

/**
 * Resume on a path, one tap: the rep as a step offer, started now and asked about at the next
 * check-in, carrying who chose it, the paths it counts for, where it was meant to happen, the rule
 * that picked it, the stage, and the reps it was picked among with each one's chance.
 */
export function resumePath(aim: Aim, pick: RepPick, stage: number, now: Date = new Date()): Promise<Offer> {
  return db.transaction('rw', [db.offers, db.intentions], async () => {
    const { day, block } = blockAt(now)
    const move = moveById(pick.moveId)
    const offer: Offer = {
      kind: 'step',
      day,
      block,
      at: now.toISOString(),
      situationKey: pathKey(aim.path as PathId),
      target: 'mood',
      stance: '',
      band: '',
      reading: 0,
      moveId: move.id,
      minutes: move.minutes,
      cardId: null,
      candidates: pick.candidates,
      coinFlip: false,
      passiveId: null,
      whyNot: null,
      propensity: pick.propensities[move.id] ?? 1,
      propensities: pick.propensities,
      chosenBy: pick.chosenBy,
      paths: [aim.path as PathId],
      setting: pick.setting,
      rule: pick.rule,
      stage,
      skippedAt: null,
      closedAt: null,
    }
    offer.id = await db.offers.add(offer)
    // The step was planned for today and is now started: the plan is kept.
    const plan = planFor(await db.intentions.where('day').equals(day).toArray(), aim.id as number, day)
    if (plan && plan.offerId === null) await db.intentions.update(plan.id as number, { offerId: offer.id })
    return offer
  })
}
