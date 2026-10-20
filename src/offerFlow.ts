import { addDays, blockAt, dayKey, type Block } from './blocks'
import { heldPickup } from './dayShape'
import { peopleAroundByBlock } from './people'
import type { Rng } from './rng'
import { hasMove, LADDERS, moveById, RECOVERY_GAP } from './catalogue'
import {
  db,
  ensureDayContext,
  getCheckIn,
  getSettings,
  isComplete,
  setAside,
  type Card,
  type Ease,
  type Offer,
  type Outcome,
  type OutcomeWhy,
  type StudyNight,
  type WinOutcome,
} from './db'
import { candidatesFor, NOTHING, pickPassive, pickupCandidates, situationOf, standingSetups, whyNotOf, windowFor, type TodayState } from './offers'
import type { ReadingId } from './readings'
import { parseRungId, RUNG_MINUTES } from './ladder'
import { noTimeCeiling } from './observe'
import { pathOn } from './pathFlow'
import { bigSocialToday } from './evidenceFlow'
import { daylightFor, inDaylight, minutesOf, type Settings } from './settings'
import { rainSoon } from './weather'
import { awayOn, homeOnlyOn } from './postWindowFlow'
import { drawContextOf, drawRecordOf, outcomeReasonOf, type DrawBelief } from './provenance'
import { guardRepair } from './repair/breaker'
import { asideFits, clsOf } from './repair/engine'
import { repairEvidence } from './repair/evidence'
import { repairAside, repairDraw, type RepairAside, type RepairDraw } from './repair/flow'
import { PASSIVE_COIN, passiveTestRuns, passiveTestSince, testablePassive } from './repair/passive'
import { REPAIR_ENGINE } from './repair/record'
import { windowOfMove } from './repair/world'

// The offer flow on the phone. Three records, kept apart: the offer (what was offered), the
// card (what is being tested, written first), and the outcome (what happened).

const PICKUP_WINDOW_MIN = 90
/**
 * Every open offer, oldest first: the next check-in asks about each in turn. An outcome logged
 * from the card answers the question before it is asked; only a passive item left unanswered
 * brings the offer back, and then only that is asked.
 */
export async function pendingOffers(): Promise<Offer[]> {
  const open = await db.offers.filter((o) => o.closedAt === null && o.skippedAt === null).toArray()
  const outcomes = new Map((await db.outcomes.toArray()).map((x) => [x.offerId, x]))
  return open
    .filter((o) => {
      const x = outcomes.get(o.id as number)
      return !x || (o.passiveId !== null && x.passiveOutcome === null)
    })
    .sort((a, b) => (a.at < b.at ? -1 : 1))
}

/**
 * A move's card first on screen long enough to be read (requirement 2): recorded on its offer, once.
 * The key is the card's own, its offer's id and the moment it was drawn, so a reused id never takes it.
 */
export async function markOfferSeen(key: string, now: Date = new Date()): Promise<void> {
  const cut = key.indexOf(':')
  const id = Number(key.slice(0, cut))
  const at = key.slice(cut + 1)
  if (cut < 1 || !Number.isInteger(id)) return
  await db.transaction('rw', db.offers, async () => {
    const offer = await db.offers.get(id)
    if (offer && offer.at === at && !offer.seenAt) await db.offers.update(id, { seenAt: now.toISOString() })
  })
}

/** "Not now" on an offer's question: it stays open and is asked once more at the next check-in (stage 1, item i). */
export async function deferOutcome(offer: Offer): Promise<void> {
  await db.offers.update(offer.id as number, { deferredAt: new Date().toISOString() })
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

/**
 * When the Done tap opens on a card: the offer's moment plus the move's span (its stated minutes,
 * or longer when the move takes longer than the sitting, as airing a room does), or a rung's
 * minutes for a step of the proof ladder; null for the null offer.
 */
export function doneAvailableAt(offer: Pick<Offer, 'at' | 'moveId' | 'minutes'>): number | null {
  if (offer.moveId === NOTHING) return null
  const rung = parseRungId(offer.moveId)
  const minutes = rung ? (offer.minutes ?? RUNG_MINUTES[rung.rung]) : hasMove(offer.moveId) ? (moveById(offer.moveId).span ?? moveById(offer.moveId).minutes) : null
  if (minutes === null) return null
  return new Date(offer.at).getTime() + minutes * 60_000
}

/** A commitment's session, started by your tap: a step, an unblock move, or a study night's sitting; never a move the draw offered. */
export function isSession(offer: Pick<Offer, 'kind'>): boolean {
  return offer.kind === 'step' || offer.kind === 'unblock' || offer.kind === 'study'
}

/**
 * Whether the Done tap is open. A session you started stays open until you resolve it, whatever
 * the clock or a check-in boundary says (Workstream 6, D3). A move opens once its minutes have
 * passed and while its block is on; once the block is over, the next check-in is the only way to
 * record it, so a later tap never writes a false time.
 */
export function doneOpen(offer: Pick<Offer, 'kind' | 'at' | 'moveId' | 'day' | 'block' | 'minutes'>, now: Date = new Date()): boolean {
  if (isSession(offer)) return offer.moveId !== NOTHING
  const availableAt = doneAvailableAt(offer)
  if (availableAt === null || now.getTime() < availableAt) return false
  const slot = blockAt(now)
  return slot.day === offer.day && slot.block === offer.block
}

/**
 * Done, tapped on the card at the moment: the outcome as its own record with its own timestamp, in
 * the block the tap fell in. With no passive item left to ask about, the question closes there;
 * else the offer stays open for that one question. It moves nothing else: the retired ladder
 * moves no skill (Workstream 6, D2). True when it wrote the answer.
 */
export function recordDoneNow(offer: Offer, now: Date = new Date(), passiveOutcome: 'done' | 'no' | null = null): Promise<boolean> {
  return db.transaction('rw', [db.outcomes, db.offers], async () => {
    if (!doneOpen(offer, now)) return false
    const existing = await db.outcomes.where('offerId').equals(offer.id as number).first()
    if (existing) return false
    const slot = blockAt(now)
    const at = now.toISOString()
    const seen = Boolean((await db.offers.get(offer.id as number))?.seenAt)
    await db.outcomes.add({ offerId: offer.id as number, moveId: offer.moveId, day: slot.day, block: slot.block, at, outcome: 'done', why: null, passiveOutcome, reason: 'done', seen })
    if (!offer.passiveId || passiveOutcome !== null) await db.offers.update(offer.id as number, { closedAt: at })
    return true
  })
}

/** The passive item's answer, given after the move was recorded from the card: the same record, completed; the question closes. */
export function answerPassive(offer: Offer, passiveOutcome: 'done' | 'no' | null): Promise<void> {
  return db.transaction('rw', [db.outcomes, db.offers], async () => {
    const existing = await db.outcomes.where('offerId').equals(offer.id as number).first()
    if (existing?.id !== undefined) await db.outcomes.update(existing.id, { passiveOutcome })
    await db.offers.update(offer.id as number, { closedAt: new Date().toISOString() })
  })
}

/** Rule 13: an answer can be deleted; the offer's question then opens again for the next check-in. */
export function deleteOutcome(outcome: Outcome): Promise<void> {
  return db.transaction('rw', [db.outcomes, db.offers], async () => {
    if (outcome.id !== undefined) await db.outcomes.delete(outcome.id)
    await db.offers.update(outcome.offerId, { closedAt: null })
  })
}

/** When a one-time setup was made: its latest done day while it stands, or null. */
export async function standingSince(moveId: string): Promise<string | null> {
  const settings = await getSettings()
  const done = (await db.outcomes.where('moveId').equals(moveId).filter((x) => x.outcome === 'done').toArray()).sort((a, b) => (a.day < b.day ? 1 : -1))
  return standingSetups(done, settings.setupUndone).includes(moveId) ? done[0].day : null
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

/**
 * The move before pickup that Now shows: the one drawn in this block; or, while the window before
 * pickup is still open, the day's own from the block before, since the window can cross 17:00 (drawn
 * at 16:30 for a 17:30 pickup, it stays until 17:30). The final checklist, item 2, 2026-09-25.
 */
export async function pickupOfferNow(now: Date): Promise<Offer | null> {
  const { day, block } = blockAt(now)
  const here = await offerForSlot(day, block, 'pickup')
  if (here) return here
  const ctx = await db.days.get(day)
  if (!ctx?.withHer || ctx.pickupTime === null) return null
  const minutes = now.getHours() * 60 + now.getMinutes()
  const pickup = minutesOf(ctx.pickupTime)
  if (minutes < pickup - PICKUP_WINDOW_MIN || minutes >= pickup) return null
  const today = await db.offers.where('day').equals(day).filter((o) => o.kind === 'pickup' && o.skippedAt === null).toArray()
  return today.sort((a, b) => (a.at < b.at ? 1 : -1))[0] ?? null
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

export async function todayState(day: string, settings: Settings, now: Date = new Date()): Promise<TodayState> {
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
  // A one-time setup already made stays out; the office, the daylight hours and, while the weather is on, the forecast rain decide the needs the app can know.
  const standing = standingSetups(await db.outcomes.filter((x) => x.outcome === 'done').toArray(), settings.setupUndone)
  // Part 24: with a path on, its row is the day's one people rep.
  const pathIsOn = (await db.aims.filter(pathOn).count()) > 0
  return { doneToday, offeredToday, hiddenFamilies, doneRungs, studyNight: ctx.studyNight, withHer: ctx.withHer, churchDay: ctx.churchDay, noTimeCeiling: null, standing, atOffice: Boolean(ctx.atOffice), daylight: inDaylight(daylightFor(settings, day), now), pickupTime: heldPickup(ctx), asleep: ctx.withHer && (now.getHours() < 4 || now.getHours() * 60 + now.getMinutes() >= minutesOf(ctx.soloUntil)), peopleAround: peopleAroundByBlock(ctx), pathOn: pathIsOn, ...(awayOn() && ctx.awayFromHome ? { homeOut: true } : {}), ...(settings.weather.on && rainSoon(ctx.weather, day, now) === true ? { rain: true } : {}) }
}

/** Phase 10: "no time" narrows the block for a week; the draw prefers short windows a little. */
/** Today's screening at a block: the no-time ceiling, and (post-window, gated) "Not home" earlier in the block. */
async function screenedToday(t: TodayState, block: Block, day: string): Promise<TodayState> {
  const offers = await db.offers.filter((o) => o.block === block).toArray()
  const ids = new Set(offers.map((o) => o.id as number))
  const outcomes = await db.outcomes.filter((x) => ids.has(x.offerId)).toArray()
  // Post-window, gated: Skip's "Not home" earlier in this block keeps the moves that need the house out of it.
  const notHome = homeOnlyOn() && offers.some((o) => o.day === day && o.skipReason === 'notHome')
  return { ...t, noTimeCeiling: noTimeCeiling(offers, outcomes, block, day), ...(notHome ? { homeOut: true } : {}) }
}

async function mostRecentlyDoneIn(situationKey: string): Promise<string | null> {
  const offers = await db.offers.where('situationKey').equals(situationKey).toArray()
  const ids = new Map(offers.map((o) => [o.id as number, o]))
  const done = (await db.outcomes.filter((x) => ids.has(x.offerId) && (x.outcome === 'done' || x.outcome === 'partly')).toArray()).sort((a, b) => (a.at < b.at ? 1 : -1))
  return done[0]?.moveId ?? null
}

/** A move the new engine drew, as an offer keeps it: the move, every chance, what it drew among and what it knew. */
interface Made {
  moveId: string
  chances: Record<string, number>
  candidates: string[]
  belief: (id: string) => DrawBelief
  fits: string[]
  week: boolean
}

const drawMade = (r: RepairDraw): Made => ({ moveId: r.offer.moveId, chances: r.offer.chances, candidates: r.offer.candidates, belief: r.belief, fits: r.offer.fits, week: r.offer.week })
const asideMade = (r: RepairAside | null): Made | null => (r ? { moveId: r.moveId, chances: r.chances, candidates: r.candidates, belief: r.belief, fits: [], week: false } : null)

/**
 * Makes sure a completed check-in in this slot has its offer. Returns the live offer, or null when nothing fits, moves
 * are hidden, or the new engine failed: then no move is offered, and the failure shows (the owner's requirement of
 * 2026-10-20). Nothing else ever draws.
 */
export function ensureOffer(day: string, block: Block, rng?: Rng): Promise<Offer | null> {
  return db.transaction('rw', [db.checkins, db.settings, db.offers, db.cards, db.outcomes, db.days, db.aims, db.askTurns], async () => {
    const settings = await getSettings()
    if (settings.hideMoves) return null
    const existing = await offerForSlot(day, block)
    if (existing) return existing
    const checkin = await getCheckIn(day, block)
    if (!checkin || !isComplete(checkin)) return null
    const situation = situationOf(checkin)
    if (!situation) return null

    const t = await screenedToday(await todayState(day, settings), block, day)
    // After a skip here, Skip promised another move: the replacement is drawn among real moves alone (D6). A move set aside
    // because the day changed was no skip of yours, so its new draw may still be Nothing extra (stage 3, item 5).
    const replacing = (await db.offers.where('day').equals(day).filter((o) => o.block === block && o.kind === 'block' && o.skippedAt !== null && !setAside(o)).count()) > 0
    const drawn = candidatesFor(situation, t)
    const ids = drawn.candidates.map((c) => c.id)
    const draw = rng ?? Math.random
    // The new engine draws every move (the owner's requirement of 2026-10-20): a check-in's move among the day's own
    // candidates, every chance kept; a replacement after a skip among real moves alone, outside the comparisons. If it
    // fails, no move is offered and the failure shows: nothing else ever draws.
    const made = await guardRepair(day, async () => (replacing ? asideMade(await repairAside(day, situation.target, ids.filter((id) => id !== NOTHING), draw)) : drawMade(await repairDraw(checkin, situation, t, ids, draw))), null)
    if (!made) return null
    const now = new Date().toISOString()

    const passiveHistory = await db.offers.filter((o) => o.passiveId !== null).toArray()
    // The recovery gap rides along only on the evening of a day marked a big social day (today's own chip); otherwise the least-offered passive item does.
    const assigned = block === 'evening' && (await bigSocialToday(day)) && !t.offeredToday.includes(RECOVERY_GAP) ? moveById(RECOVERY_GAP) : null
    // The learning repair (stage R4b): while a test of the item runs, a fair coin decides whether it rides alongside, its chance
    // kept; on the coin's no nothing rides alongside, so the test compares the item with nothing alongside.
    const coin = assigned ? await passiveCoinFor(assigned.id, day, settings, draw) : null
    const passive = coin ? (coin.rode ? assigned : null) : (assigned ?? pickPassive(block, t, passiveHistory.map((o) => ({ moveId: o.passiveId as string, at: o.at }))))
    // A passive item is its own experiment, in the same moment but on another target: its card is written too.
    if (passive) {
      const pKey = `passive:${block}`
      const has = await db.cards.where('situationKey').equals(pKey).filter((c) => c.moveId === passive.id).first()
      if (!has) await db.cards.add({ createdAt: now, situationKey: pKey, block, target: passive.targets[0].reading, moveId: passive.id, alternativeId: NOTHING, window: passive.targets[0].window, worthwhile: 1, origin: 'passive' })
    }
    const whyNot = whyNotOf(await mostRecentlyDoneIn(situation.key), made.moveId, made.chances, drawn.excluded)
    // Requirement 2: what the draw knew, recorded now, since it cannot be rebuilt later.
    const [dayNow, checkinsNow] = await Promise.all([db.days.get(day), db.checkins.toArray()])
    const drawRecord = drawRecordOf({ excluded: drawn.excluded, candidates: made.candidates, belief: made.belief, target: situation.target, window: made.moveId === NOTHING ? null : windowFor(made.moveId, situation.target), context: drawContextOf(dayNow, checkinsNow, day), checkins: checkinsNow, day, block, engine: REPAIR_ENGINE })

    const offer: Offer = {
      kind: 'block',
      day,
      block,
      at: now,
      situationKey: situation.key,
      target: situation.target,
      stance: '',
      band: situation.band,
      reading: situation.reading,
      moveId: made.moveId,
      cardId: null,
      candidates: made.candidates,
      coinFlip: false,
      passiveId: passive?.id ?? null,
      whyNot,
      propensity: made.chances[made.moveId],
      propensities: made.chances,
      skippedAt: null,
      closedAt: null,
      draw: drawRecord,
      ...(made.fits.length ? { fits: made.fits } : {}),
      ...(made.week ? { week: true as const } : {}),
      ...(coin ? { passiveCoin: coin } : {}),
    }
    offer.id = await db.offers.add(offer)
    return offer
  })
}

/**
 * A passive item's fair coin (stage R4b), on a moment its own rule would have it ride alongside: only while a test of the
 * item runs (set, inside its time, not yet established). Null otherwise, and the item rides by its rule.
 */
async function passiveCoinFor(moveId: string, day: string, settings: Settings, rng: Rng): Promise<{ moveId: string; rode: boolean; chance: number } | null> {
  if (!testablePassive(moveId) || passiveTestSince(settings, moveId, day) === null) return null
  const ev = await guardRepair(day, () => repairEvidence(day), null)
  if (!ev || !passiveTestRuns(settings, moveId, day, ev.shown)) return null
  return { moveId, rode: rng() < PASSIVE_COIN, chance: PASSIVE_COIN }
}

/**
 * Today marked a big social day at the evening's chips, or the mark taken back (the final checklist,
 * 2026-09-25). The evening's move is drawn before its chips, so the recovery gap joins it from the
 * moment of the mark, while nothing has been answered about what rides alongside; taken back, it
 * comes off again. Never onto a move it conflicts with. True when the evening's move carries it.
 */
export async function syncRecoveryGap(day: string, marked: boolean, rng: Rng = Math.random): Promise<boolean> {
  return db.transaction('rw', [db.offers, db.outcomes, db.cards, db.settings, db.checkins, db.days, db.askTurns], async () => {
    const evenings = await db.offers.where('day').equals(day).filter((o) => o.kind === 'block' && o.block === 'evening' && o.skippedAt === null).toArray()
    const evening = evenings.sort((a, b) => (a.at < b.at ? 1 : -1))[0]
    if (!evening || evening.id === undefined) return false
    const carries = evening.passiveId === RECOVERY_GAP
    // Once what rides alongside was answered, it stays as it was answered.
    const answered = await db.outcomes.where('offerId').equals(evening.id).first()
    if (answered && answered.passiveOutcome !== null) return carries
    // The learning repair (stage R4b): the mark taken back, the evening is no longer a moment the coin may decide.
    if (!marked && evening.passiveCoin) {
      await db.offers.update(evening.id, { passiveCoin: undefined, ...(carries ? { passiveId: null } : {}) })
      return false
    }
    // A mark made once the coin has decided keeps what it decided.
    if (marked && evening.passiveCoin) return carries
    if (marked && !carries) {
      const gap = moveById(RECOVERY_GAP)
      if (gap.conflicts.includes(evening.moveId)) return false
      // While a test of the gap runs, a fair coin decides whether it joins; on the coin's no nothing rides alongside.
      const coin = await passiveCoinFor(RECOVERY_GAP, day, await getSettings(), rng)
      if (coin) {
        await db.offers.update(evening.id, { passiveCoin: coin, passiveId: coin.rode ? RECOVERY_GAP : null })
        if (!coin.rode) return false
      } else await db.offers.update(evening.id, { passiveId: RECOVERY_GAP })
      const has = await db.cards.where('situationKey').equals('passive:evening').filter((c) => c.moveId === RECOVERY_GAP).first()
      if (!has) await db.cards.add({ createdAt: new Date().toISOString(), situationKey: 'passive:evening', block: 'evening', target: gap.targets[0].reading, moveId: RECOVERY_GAP, alternativeId: NOTHING, window: gap.targets[0].window, worthwhile: 1, origin: 'passive' })
      return true
    }
    if (!marked && carries) {
      await db.offers.update(evening.id, { passiveId: null })
      return false
    }
    return carries
  })
}

/** Inside the ninety minutes before pickup, on a day she is with you: one short move whose job is arriving with something left. */
export function ensurePickupOffer(now: Date, rng?: Rng): Promise<Offer | null> {
  return db.transaction('rw', [db.settings, db.offers, db.cards, db.outcomes, db.days, db.aims, db.checkins, db.askTurns], async () => {
    const settings = await getSettings()
    if (settings.hideMoves) return null
    const day = dayKey(now)
    const ctx = await ensureDayContext(day, settings)
    if (!ctx.withHer || ctx.pickupTime === null) return null
    const minutes = now.getHours() * 60 + now.getMinutes()
    const pickup = minutesOf(ctx.pickupTime)
    if (minutes < pickup - PICKUP_WINDOW_MIN || minutes >= pickup) return null
    const { block } = blockAt(now)
    // The day's live pickup move stands; after a skip, another is drawn from what is left (D6).
    const existing = await db.offers.where('day').equals(day).filter((o) => o.kind === 'pickup' && o.skippedAt === null).first()
    if (existing) return existing

    const t = await screenedToday(await todayState(day, settings), block, day)
    const set = pickupCandidates(block, t)
    const key = 'pickup:energy'
    const draw = rng ?? Math.random
    // The new engine draws the pickup-time move too (the owner's requirement of 2026-10-20), outside the comparisons, every
    // chance kept; no card is made for it. If it fails, no move is offered and the failure shows.
    const made = asideMade(await guardRepair(day, () => repairAside(day, 'energy', set.candidates.map((c) => c.id), draw), null))
    if (!made) return null
    const nowIso = now.toISOString()
    // Requirement 2: what the draw knew, recorded now.
    const checkinsNow = await db.checkins.toArray()
    const drawRecord = drawRecordOf({ excluded: set.excluded, candidates: made.candidates, belief: made.belief, target: 'energy', window: made.moveId === NOTHING ? null : 'nextBlock', context: drawContextOf(ctx, checkinsNow, day), checkins: checkinsNow, day, block, engine: REPAIR_ENGINE })
    const offer: Offer = {
      kind: 'pickup',
      draw: drawRecord,
      day,
      block,
      at: nowIso,
      situationKey: key,
      target: 'energy',
      stance: '',
      band: '',
      reading: 0,
      moveId: made.moveId,
      cardId: null,
      candidates: made.candidates,
      coinFlip: false,
      passiveId: null,
      whyNot: null,
      propensity: made.chances[made.moveId],
      propensities: made.chances,
      skippedAt: null,
      closedAt: null,
    }
    offer.id = await db.offers.add(offer)
    return offer
  })
}

export function studyNightsAll(): Promise<StudyNight[]> {
  return db.studyNights.toArray()
}

/**
 * Records the skip, which completes nothing, and shows another at once where one fits: a move for
 * the same check-in, or another move before pickup while its window is open (D6). "Not home"
 * (post-window, gated) is kept with the skip only while its gate is open; the moves that need the
 * house then wait for the rest of the block.
 */
export async function skipOffer(offer: Offer, reason: 'notHome' | null = null): Promise<Offer | null> {
  const notHome = reason === 'notHome' && homeOnlyOn()
  await db.offers.update(offer.id as number, { skippedAt: new Date().toISOString(), ...(notHome ? { skipReason: 'notHome' as const } : {}) })
  if (offer.kind === 'block') return ensureOffer(offer.day, offer.block)
  if (offer.kind === 'pickup') return ensurePickupOffer(new Date())
  return null
}

/**
 * After a Today, if different chip changes the day (stage 3, item 5): this block's move, while its block is open and
 * nobody has touched it (no answer, no skip, not put off), is set aside, marked "the day changed", and drawn again
 * under the day as it now is. Set aside is the app's change, never your skip: no count of skips or offers shows it,
 * and the learning engine reads it no more than any skipped offer. Each change draws again at most once. Returns
 * the new move, or null when nothing was drawn again.
 */
export function redrawForDay(day: string, block: Block, now: Date = new Date(), rng?: Rng): Promise<Offer | null> {
  return db.transaction('rw', [db.checkins, db.settings, db.offers, db.cards, db.outcomes, db.days, db.aims, db.askTurns], async () => {
    const slot = blockAt(now)
    if (slot.day !== day || slot.block !== block) return null
    const offer = await offerForSlot(day, block)
    if (!offer || offer.id === undefined || offer.closedAt !== null || offer.deferredAt) return null
    if ((await db.outcomes.where('offerId').equals(offer.id).count()) > 0) return null
    await db.offers.update(offer.id, { skippedAt: now.toISOString(), skipReason: 'dayChanged' as const })
    const next = await ensureOffer(day, block, rng)
    if (next?.id === undefined) return null
    await db.offers.update(next.id, { redrawn: true as const })
    return { ...next, redrawn: true as const }
  })
}

/**
 * How many moves Skip could show in this offer's place right now: the same candidate rules as the
 * draw, with this move and everything offered today left out, and never "Nothing today". Zero
 * when a skip could show nothing, so the card says "Skip" alone rather than promise another (D6).
 */
export async function replacementsFor(offer: Offer, now: Date = new Date(), notHome = false): Promise<number> {
  const settings = await getSettings()
  if (settings.hideMoves || offer.skippedAt !== null || offer.closedAt !== null) return 0
  const ctx = await ensureDayContext(offer.day, settings)
  // Asked for "Not home" (post-window, gated): what a skip given that reason could show, the moves that need the house left out.
  const today = await todayState(offer.day, settings, now)
  const t = notHome && homeOnlyOn() ? { ...today, homeOut: true } : today
  // The new engine's own rule for a draw outside the comparisons (asideFits), over the classes offered today.
  const today_ = await db.offers.where('day').equals(offer.day).filter((o) => (o.kind === 'block' || o.kind === 'pickup') && !setAside(o) && o.moveId !== NOTHING).toArray()
  const left = (ids: readonly string[], target: ReadingId) => {
    const offered = new Set(today_.map((o) => clsOf(windowOfMove(o.moveId, target))))
    return ids.filter((id) => id !== NOTHING && id !== offer.moveId && asideFits(clsOf(windowOfMove(id, target)), offered)).length
  }
  if (offer.kind === 'block') {
    const slot = blockAt(now)
    if (slot.day !== offer.day || slot.block !== offer.block) return 0
    const checkin = await getCheckIn(offer.day, offer.block)
    const situation = checkin && isComplete(checkin) ? situationOf(checkin) : null
    return situation ? left(candidatesFor(situation, await screenedToday(t, offer.block, offer.day)).candidates.map((c) => c.id), situation.target) : 0
  }
  if (offer.kind === 'pickup') {
    if (!ctx.withHer || ctx.pickupTime === null || dayKey(now) !== offer.day) return 0
    const minutes = now.getHours() * 60 + now.getMinutes()
    const pickup = minutesOf(ctx.pickupTime)
    if (minutes < pickup - PICKUP_WINDOW_MIN || minutes >= pickup) return 0
    const block = blockAt(now).block
    return left(pickupCandidates(block, await screenedToday(t, block, offer.day)).candidates.map((c) => c.id), 'energy')
  }
  return 0
}

/** What happened, in one tap, kept apart from what was offered. Null closes the question without an answer. */
export function recordOutcome(offer: Offer, outcome: WinOutcome | null, why: OutcomeWhy | null, passiveOutcome: 'done' | 'no' | null, askedIn: { day: string; block: Block }, ease: Ease | null = null): Promise<void> {
  return db.transaction('rw', [db.offers, db.outcomes], async () => {
    const now = new Date().toISOString()
    // Recorded from the card already: only the passive item was left to answer.
    const existing = await db.outcomes.where('offerId').equals(offer.id as number).first()
    if (existing?.id !== undefined) {
      await db.outcomes.update(existing.id, { passiveOutcome })
      await db.offers.update(offer.id as number, { closedAt: now })
      return
    }
    // A learning session's one optional tap on how it went rides with the answer (Workstream 6); nothing moves a rung (D2).
    const seen = Boolean((await db.offers.get(offer.id as number))?.seenAt)
    const record: Outcome = { offerId: offer.id as number, moveId: offer.moveId, day: askedIn.day, block: askedIn.block, at: now, outcome, why, passiveOutcome, ...(ease && outcome !== 'no' && outcome !== null ? { ease } : {}), reason: outcomeReasonOf(outcome, why), seen }
    await db.outcomes.add(record)
    await db.offers.update(offer.id as number, { closedAt: now })
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
