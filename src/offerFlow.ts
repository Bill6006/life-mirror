import { addDays, blockAt, dayKey, type Block } from './blocks'
import { beliefFor, type Rng } from './bandit'
import { LADDERS, moveById } from './catalogue'
import { db, ensureDayContext, getCheckIn, getSettings, isComplete, type Card, type Offer, type Outcome, type OutcomeWhy, type WinOutcome } from './db'
import { alternativeFor, candidatesFor, chooseFor, NOTHING, pickPassive, pickupCandidates, situationOf, whyNotThat, windowFor, type TodayState } from './offers'
import { minutesOf, type Settings } from './settings'

// The offer flow on the phone. Three records, kept apart: the offer (what was offered), the
// card (what is being tested, written first), and the outcome (what happened).

const PICKUP_WINDOW_MIN = 90

/** Every open offer, oldest first: the next check-in asks about each in turn. */
export async function pendingOffers(): Promise<Offer[]> {
  const open = await db.offers.filter((o) => o.closedAt === null && o.skippedAt === null).toArray()
  return open.sort((a, b) => (a.at < b.at ? -1 : 1))
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
  return { doneToday, offeredToday, hiddenFamilies, doneRungs, studyNight: ctx.studyNight, withHer: ctx.withHer, churchDay: ctx.churchDay }
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
  return db.transaction('rw', [db.checkins, db.settings, db.offers, db.cards, db.outcomes, db.days], async () => {
    const settings = await getSettings()
    if (settings.hideMoves) return null
    const existing = await offerForSlot(day, block)
    if (existing) return existing
    const checkin = await getCheckIn(day, block)
    if (!checkin || !isComplete(checkin)) return null
    const situation = situationOf(checkin)
    if (!situation) return null

    const t = await todayState(day, settings)
    const set = candidatesFor(situation, t)
    const choice = chooseFor(set, (id) => beliefFor(id, situation.key), rng)
    if (!choice) return null
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
    const passive = pickPassive(block, t, passiveHistory.map((o) => ({ moveId: o.passiveId as string, at: o.at })))
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
      skippedAt: null,
      closedAt: null,
    }
    offer.id = await db.offers.add(offer)
    return offer
  })
}

/** Inside the ninety minutes before pickup, on a day she is with you: one short move whose job is arriving with something left. */
export function ensurePickupOffer(now: Date, rng?: Rng): Promise<Offer | null> {
  return db.transaction('rw', [db.settings, db.offers, db.cards, db.outcomes, db.days], async () => {
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

    const t = await todayState(day, settings)
    const set = pickupCandidates(block, t)
    const key = 'pickup:energy'
    const choice = chooseFor(set, (id) => beliefFor(id, key), rng)
    if (!choice) return null
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
      skippedAt: null,
      closedAt: null,
    }
    offer.id = await db.offers.add(offer)
    return offer
  })
}

/** Records the skip and, for a block offer, offers the next candidate for the same slot if any is left. */
export async function skipOffer(offer: Offer): Promise<Offer | null> {
  await db.offers.update(offer.id as number, { skippedAt: new Date().toISOString() })
  return offer.kind === 'block' ? ensureOffer(offer.day, offer.block) : null
}

/** What happened, in one tap, kept apart from what was offered. Null closes the question without an answer. */
export function recordOutcome(offer: Offer, outcome: WinOutcome | null, why: OutcomeWhy | null, passiveOutcome: 'done' | 'no' | null, askedIn: { day: string; block: Block }): Promise<void> {
  return db.transaction('rw', [db.offers, db.outcomes], async () => {
    const now = new Date().toISOString()
    const record: Outcome = { offerId: offer.id as number, moveId: offer.moveId, day: askedIn.day, block: askedIn.block, at: now, outcome, why, passiveOutcome }
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
    moveName: nameOf(offer.moveId, nothingLabel),
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
