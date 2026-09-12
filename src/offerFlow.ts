import { addDays, blockAt, dayKey, parseDay, type Block } from './blocks'
import { propensities } from './adaptive'
import { choose, type Rng } from './bandit'
import { activeAims, liveSkills, markRungByStep, rungMarks } from './aimFlow'
import { hasMove, LADDERS, moveById } from './catalogue'
import {
  db,
  ensureDayContext,
  getCheckIn,
  getSettings,
  isComplete,
  type Card,
  type Offer,
  type Outcome,
  type OutcomeWhy,
  type StudyDecision,
  type StudyNight,
  type StudyReason,
  type WinOutcome,
} from './db'
import { alternativeFor, candidatesFor, chooseFor, NOTHING, pickPassive, pickupCandidates, situationOf, whyNotThat, windowFor, type TodayState } from './offers'
import type { ReadingId } from './readings'
import { nextStep, parseRungId, rungStep, sittingOf, type Sitting } from './ladder'
import { noTimeCeiling, WINDOW_PENALTY } from './learning'
import { beliefsFor, recoveryGapDue } from './learningFlow'
import { minutesOf, type Settings, type Weekday } from './settings'
import { studyVersions, type ReasonCheck } from './studyNight'

// The offer flow on the phone. Three records, kept apart: the offer (what was offered), the
// card (what is being tested, written first), and the outcome (what happened).

const PICKUP_WINDOW_MIN = 90
const SIGN_FLIP_BONUS = 0.3

/** Every open offer, oldest first: the next check-in asks about each in turn. */
export async function pendingOffers(): Promise<Offer[]> {
  const open = await db.offers.filter((o) => o.closedAt === null && o.skippedAt === null).toArray()
  // An outcome logged from the card at the moment answers the question before it is asked.
  const answered = new Set((await db.outcomes.toArray()).map((x) => x.offerId))
  return open.filter((o) => !answered.has(o.id as number)).sort((a, b) => (a.at < b.at ? -1 : 1))
}

/** The outcome logged for an offer, from the card or at the next check-in, or null. */
export function outcomeFor(offerId: number | undefined): Promise<Outcome | null> {
  if (offerId === undefined) return Promise.resolve(null)
  return db.outcomes
    .where('offerId')
    .equals(offerId)
    .first()
    .then((x) => x ?? null)
}

/** When the Done tap opens on a card: the offer's moment plus the move's stated minutes; null for the null offer. */
export function doneAvailableAt(offer: Pick<Offer, 'at' | 'moveId'>): number | null {
  if (offer.moveId === NOTHING || !hasMove(offer.moveId)) return null
  return new Date(offer.at).getTime() + moveById(offer.moveId).minutes * 60_000
}

/**
 * Done, tapped on the card at the moment: the outcome as its own record with its own timestamp, in
 * the block the tap fell in. The offer is not touched; the next check-in sees the record and does not ask.
 */
export function recordDoneNow(offer: Offer, now: Date = new Date()): Promise<void> {
  return db.transaction('rw', db.outcomes, async () => {
    const existing = await db.outcomes.where('offerId').equals(offer.id as number).first()
    if (existing) return
    const slot = blockAt(now)
    await db.outcomes.add({ offerId: offer.id as number, moveId: offer.moveId, day: slot.day, block: slot.block, at: now.toISOString(), outcome: 'done', why: null, passiveOutcome: null })
  })
}

/** The live offer for a slot and kind: the latest one there that was not skipped. */
export async function offerForSlot(day: string, block: Block, kind: 'block' | 'pickup' = 'block'): Promise<Offer | null> {
  const here = await db.offers
    .where('day')
    .equals(day)
    .filter((o) => o.block === block && o.kind === kind && o.skippedAt === null)
    .toArray()
  here.sort((a, b) => (a.at < b.at ? 1 : -1))
  return here[0] ?? null
}

export async function cardById(id: number | null): Promise<Card | null> {
  if (id === null) return null
  return (await db.cards.get(id)) ?? null
}

export interface OfferCounts {
  offered: number
  done: number
  partly: number
  no: number
}

/** How often this move has been offered in this situation, and what happened. */
export async function offerCounts(situationKey: string, moveId: string): Promise<OfferCounts> {
  const offers = await db.offers
    .where('situationKey')
    .equals(situationKey)
    .filter((o) => o.moveId === moveId && o.skippedAt === null)
    .toArray()
  const ids = new Set(offers.map((o) => o.id as number))
  const outcomes = await db.outcomes
    .where('moveId')
    .equals(moveId)
    .filter((x) => ids.has(x.offerId))
    .toArray()
  const count = (v: WinOutcome) => outcomes.filter((x) => x.outcome === v).length
  return { offered: offers.length, done: count('done'), partly: count('partly'), no: count('no') }
}

async function todayState(day: string, settings: Settings): Promise<TodayState> {
  const today = await db.offers.where('day').equals(day).toArray()
  const doneToday = (await db.outcomes.where('day').equals(day).toArray()).filter((x) => x.outcome === 'done' || x.outcome === 'partly').map((x) => x.moveId)
  const offeredToday = today.flatMap((o) => (o.passiveId ? [o.moveId, o.passiveId] : [o.moveId]))
  const since = addDays(day, -14)
  const recent = (await db.outcomes.filter((x) => x.day >= since && (x.outcome === 'done' || x.outcome === 'partly')).toArray()).map((x) => x.moveId)
  const doneRungs = new Map<string, number>()
  for (const ladder of LADDERS) {
    let top = -1
    for (const id of recent) {
      const i = ladder.indexOf(id)
      if (i > top) top = i
    }
    if (top >= 0) doneRungs.set(ladder[0], top)
  }
  const hiddenFamilies = new Set<string>(settings.hideFaith ? ['faith'] : [])
  const ctx = await ensureDayContext(day, settings)
  return { doneToday, offeredToday, hiddenFamilies, doneRungs, studyNight: ctx.studyNight, withHer: ctx.withHer, churchDay: ctx.churchDay, noTimeCeiling: null }
}

/** Phase 10: "no time" narrows the block for a week; the draw prefers short windows a little. */
async function withLearning(t: TodayState, block: Block, day: string): Promise<TodayState> {
  const offers = await db.offers.filter((o) => o.block === block).toArray()
  const ids = new Set(offers.map((o) => o.id as number))
  const outcomes = await db.outcomes.filter((x) => ids.has(x.offerId)).toArray()
  return { ...t, noTimeCeiling: noTimeCeiling(offers, outcomes, block, day) }
}

function withWindowPenalty(set: ReturnType<typeof candidatesFor>, target: ReadingId): ReturnType<typeof candidatesFor> {
  return { ...set, candidates: set.candidates.map((c) => (c.id === NOTHING ? c : { ...c, bonus: (c.bonus ?? 0) - WINDOW_PENALTY[windowFor(c.id, target)] })) }
}

async function mostRecentlyDoneIn(situationKey: string): Promise<string | null> {
  const offers = await db.offers.where('situationKey').equals(situationKey).toArray()
  const ids = new Map(offers.map((o) => [o.id as number, o]))
  const done = (await db.outcomes.filter((x) => ids.has(x.offerId) && (x.outcome === 'done' || x.outcome === 'partly')).toArray()).sort((a, b) => (a.at < b.at ? 1 : -1))
  return done[0]?.moveId ?? null
}

/**
 * Makes sure a completed check-in in this slot has its offer. Writes the test card first,
 * then the offer. Returns the live offer, or null when nothing fits or moves are hidden.
 */
export function ensureOffer(day: string, block: Block, rng?: Rng): Promise<Offer | null> {
  return db.transaction('rw', [db.checkins, db.settings, db.offers, db.cards, db.outcomes, db.days, db.beliefs], async () => {
    const settings = await getSettings()
    if (settings.hideMoves) return null
    const existing = await offerForSlot(day, block)
    if (existing) return existing
    const checkin = await getCheckIn(day, block)
    if (!checkin || !isComplete(checkin)) return null
    const situation = situationOf(checkin)
    if (!situation) return null

    const t = await withLearning(await todayState(day, settings), block, day)
    // Phase 12: a flagged sign flip is tested on purpose, offered a little more often here until its card has its eight.
    const flips = await db.cards.where('situationKey').equals(situation.key).filter((c) => c.origin === 'signFlip').toArray()
    const scheduled = new Set(flips.map((c) => c.moveId))
    const base = withWindowPenalty(candidatesFor(situation, t), situation.target)
    const set = { ...base, candidates: base.candidates.map((c) => (scheduled.has(c.id) ? { ...c, bonus: (c.bonus ?? 0) + SIGN_FLIP_BONUS } : c)) }
    const beliefs = await beliefsFor(situation.key, set.candidates.map((c) => c.id))
    const draw = rng ?? Math.random
    const choice = chooseFor(set, beliefs, draw)
    if (!choice) return null
    const odds = propensities(set.candidates, beliefs, draw)
    const history = await db.offers.where('situationKey').equals(situation.key).filter((o) => o.skippedAt === null).toArray()
    const expected = await mostRecentlyDoneIn(situation.key)
    const now = new Date().toISOString()

    let cardId: number | null = null
    if (choice.id !== NOTHING) {
      const existingCard = await db.cards.where('situationKey').equals(situation.key).filter((c) => c.moveId === choice.id).first()
      if (existingCard) cardId = existingCard.id as number
      else {
        const alternativeId = alternativeFor(choice.id, set, history)
        if (alternativeId) {
          const card: Card = {
            createdAt: now,
            situationKey: situation.key,
            block,
            target: situation.target,
            moveId: choice.id,
            alternativeId,
            window: windowFor(choice.id, situation.target),
            worthwhile: 1,
          }
          cardId = await db.cards.add(card)
        }
      }
    }

    const passiveHistory = await db.offers.filter((o) => o.passiveId !== null).toArray()
    // The recovery gap is assigned the evening after an unplanned big social day; otherwise the least-offered passive item rides along.
    const assigned = block === 'evening' && (await recoveryGapDue(day)) && !t.offeredToday.includes('recovery-gap') ? moveById('recovery-gap') : null
    const passive = assigned ?? pickPassive(block, t, passiveHistory.map((o) => ({ moveId: o.passiveId as string, at: o.at })))
    // A passive item is its own experiment, in the same moment but on another target: its card is written too.
    if (passive) {
      const pKey = `passive:${block}`
      const has = await db.cards.where('situationKey').equals(pKey).filter((c) => c.moveId === passive.id).first()
      if (!has) await db.cards.add({ createdAt: now, situationKey: pKey, block, target: passive.targets[0].reading, moveId: passive.id, alternativeId: NOTHING, window: passive.targets[0].window, worthwhile: 1, origin: 'passive' })
    }
    const whyNot = whyNotThat(expected, choice, set)

    const offer: Offer = {
      kind: 'block',
      day,
      block,
      at: now,
      situationKey: situation.key,
      target: situation.target,
      stance: situation.stance,
      band: situation.band,
      reading: situation.reading,
      moveId: choice.id,
      cardId,
      candidates: set.candidates.map((c) => c.id),
      coinFlip: choice.coinFlip,
      passiveId: passive?.id ?? null,
      whyNot: whyNot ? { moveId: whyNot.moveId, reason: whyNot.reason } : null,
      propensity: odds[choice.id],
      propensities: odds,
      skippedAt: null,
      closedAt: null,
    }
    offer.id = await db.offers.add(offer)
    return offer
  })
}

/** Inside the ninety minutes before pickup, on a day she is with you: one short move whose job is arriving with something left. */
export function ensurePickupOffer(now: Date, rng?: Rng): Promise<Offer | null> {
  return db.transaction('rw', [db.settings, db.offers, db.cards, db.outcomes, db.days, db.beliefs], async () => {
    const settings = await getSettings()
    if (settings.hideMoves) return null
    const day = dayKey(now)
    const ctx = await ensureDayContext(day, settings)
    if (!ctx.withHer || ctx.pickupTime === null) return null
    const minutes = now.getHours() * 60 + now.getMinutes()
    const pickup = minutesOf(ctx.pickupTime)
    if (minutes < pickup - PICKUP_WINDOW_MIN || minutes >= pickup) return null
    const { block } = blockAt(now)
    const existing = await db.offers.where('day').equals(day).filter((o) => o.kind === 'pickup').first()
    if (existing) return existing.skippedAt ? null : existing

    const t = await withLearning(await todayState(day, settings), block, day)
    const set = pickupCandidates(block, t)
    const key = 'pickup:energy'
    const pickupBeliefs = await beliefsFor(key, set.candidates.map((c) => c.id))
    const draw = rng ?? Math.random
    const choice = chooseFor(set, pickupBeliefs, draw)
    if (!choice) return null
    const odds = propensities(set.candidates, pickupBeliefs, draw)
    const history = await db.offers.where('situationKey').equals(key).toArray()
    const nowIso = now.toISOString()
    let cardId: number | null = null
    const existingCard = await db.cards.where('situationKey').equals(key).filter((c) => c.moveId === choice.id).first()
    if (existingCard) cardId = existingCard.id as number
    else {
      const alternativeId = alternativeFor(choice.id, set, history)
      if (alternativeId) {
        cardId = await db.cards.add({ createdAt: nowIso, situationKey: key, block, target: 'energy', moveId: choice.id, alternativeId, window: 'nextBlock', worthwhile: 1 })
      }
    }
    const offer: Offer = {
      kind: 'pickup',
      day,
      block,
      at: nowIso,
      situationKey: key,
      target: 'energy',
      stance: '',
      band: '',
      reading: 0,
      moveId: choice.id,
      cardId,
      candidates: set.candidates.map((c) => c.id),
      coinFlip: choice.coinFlip,
      passiveId: null,
      whyNot: null,
      propensity: odds[choice.id],
      propensities: odds,
      skippedAt: null,
      closedAt: null,
    }
    offer.id = await db.offers.add(offer)
    return offer
  })
}

/**
 * What the study step offers tonight: with the certification among your aims, the proof
 * ladder's next rung, sized to one sitting; otherwise one of the catalogue's study versions not
 * offered today, drawn by the same bandit.
 */
export async function studyOfferSitting(day: string, rng?: Rng): Promise<Sitting | null> {
  const certification = (await activeAims()).find((a) => a.kind === 'certification')
  if (certification) {
    const next = nextStep(await liveSkills(), await rungMarks())
    if (next) return rungStep(next.skill, next.rung)
  }
  const today = await db.offers.where('day').equals(day).toArray()
  const versions = studyVersions(today.map((o) => o.moveId))
  const choice = choose(
    versions.map((m) => ({ id: m.id, effort: m.effort })),
    await beliefsFor('study:evening', versions.map((m) => m.id)),
    rng,
  )
  return choice ? sittingOf(moveById(choice.id)) : null
}

/**
 * Records a study night's decision: the offer (what was offered, skipped when Not now), and
 * the decision with its reason and how it read against tonight's readings.
 */
export function recordStudyNight(
  day: string,
  offered: Sitting,
  decision: StudyDecision,
  reason: StudyReason | null,
  check: ReasonCheck,
  smaller: Sitting | null,
): Promise<void> {
  return db.transaction('rw', [db.offers, db.studyNights], async () => {
    const now = new Date().toISOString()
    const started = decision === 'started' ? offered : decision === 'smaller' ? smaller : null
    const offer: Offer = {
      kind: 'study',
      day,
      block: 'evening',
      at: now,
      situationKey: 'study:evening',
      target: 'focus',
      stance: '',
      band: '',
      reading: 0,
      moveId: started?.id ?? offered.id,
      label: started?.name ?? offered.name,
      cardId: null,
      candidates: [offered.id],
      coinFlip: false,
      passiveId: null,
      whyNot: null,
      skippedAt: started ? null : now,
      closedAt: null,
    }
    const offerId = await db.offers.add(offer)
    const record: StudyNight = {
      day,
      weekday: parseDay(day).getDay() as Weekday,
      offerId,
      offeredMoveId: offered.id,
      decision,
      reason,
      supported: check.supported,
      evidence: check.evidence,
      smallerMoveId: smaller?.id ?? null,
      at: now,
    }
    await db.studyNights.add(record)
  })
}

export function studyNightsAll(): Promise<StudyNight[]> {
  return db.studyNights.toArray()
}

/** Records the skip and, for a block offer, offers the next candidate for the same slot if any is left. */
export async function skipOffer(offer: Offer): Promise<Offer | null> {
  await db.offers.update(offer.id as number, { skippedAt: new Date().toISOString() })
  return offer.kind === 'block' ? ensureOffer(offer.day, offer.block) : null
}

/** What happened, in one tap, kept apart from what was offered. Null closes the question without an answer. */
export function recordOutcome(offer: Offer, outcome: WinOutcome | null, why: OutcomeWhy | null, passiveOutcome: 'done' | 'no' | null, askedIn: { day: string; block: Block }): Promise<void> {
  return db.transaction('rw', [db.offers, db.outcomes, db.rungMarks], async () => {
    const now = new Date().toISOString()
    const record: Outcome = { offerId: offer.id as number, moveId: offer.moveId, day: askedIn.day, block: askedIn.block, at: now, outcome, why, passiveOutcome }
    await db.outcomes.add(record)
    await db.offers.update(offer.id as number, { closedAt: now })
    // Done on a rung's step is your tap that moves the skill up the proof ladder.
    const rung = parseRungId(offer.moveId)
    if (rung && outcome === 'done') await markRungByStep(rung.skillId, rung.rung, now)
  })
}

export interface HistoryEntry {
  offer: Offer
  card: Card | null
  outcome: Outcome | null
  moveName: string
}

export function nameOf(moveId: string, nothingLabel: string): string {
  return moveId === NOTHING ? nothingLabel : moveById(moveId).name
}

/** What an offer was, in words: its label when it carries one (a rung of the ladder), else the move's name. */
export function offerName(offer: Pick<Offer, 'moveId' | 'label'>, nothingLabel: string): string {
  return offer.label ?? nameOf(offer.moveId, nothingLabel)
}

/** Every offer, newest first, with its card and its outcome as separate records. */
export async function offerHistory(nothingLabel: string): Promise<HistoryEntry[]> {
  const offers = await db.offers.toArray()
  offers.sort((a, b) => (a.at < b.at ? 1 : -1))
  const cards = new Map((await db.cards.toArray()).map((c) => [c.id as number, c]))
  const outcomes = await db.outcomes.toArray()
  return offers.map((offer) => ({
    offer,
    card: offer.cardId === null ? null : (cards.get(offer.cardId) ?? null),
    outcome: outcomes.find((x) => x.offerId === offer.id) ?? null,
    moveName: offerName(offer, nothingLabel),
  }))
}

/** Weeks of record, from the first check-in to today, for the honest line on Now. */
export async function weeksOfRecord(today: string): Promise<number> {
  const all = await db.checkins.toArray()
  if (!all.length) return 0
  let first = all[0].day
  for (const c of all) if (c.day < first) first = c.day
  const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(first)) / 86_400_000)) + 1
  return Math.floor(days / 7)
}
