import { propensities } from '../src/adaptive'
import { BLOCKS, type Block } from '../src/blocks'
import { hasMove, liveMoves, moveById, rungOf } from '../src/catalogue'
import type { Card, CheckIn, Declaration, Offer, Outcome } from '../src/db'
import { FLAT, moveBelief, noTimeCeiling, nothingBelief, observations, priorOf, signFlips, tagBeliefs, WINDOW_PENALTY, type Belief, type Observation } from '../src/learning'
import { alternativeFor, candidatesFor, chooseFor, NOTHING, situationOf, standingSetups, windowFor, type TodayState } from '../src/offers'
import { blockReadings, type ReadingId } from '../src/readings'
import { declarationsDue, evaluateCards, hasItsEight, type CardStats, type Tier } from '../src/tiers'
import type { Rng } from './stats'
import type { Answered, DayContext, Response } from './world'

// Engine A: today's learning engine, replayed. The draw mirrors offerFlow.ensureOffer and the daily
// run mirrors learningFlow.runLearning, calling the committed functions in src/ (learning.ts,
// adaptive.ts, tiers.ts, bandit.ts, offers.ts) and nothing written here in their place. Left out,
// for both engines alike: passive items, pickup offers, path reps and study sessions, which are
// their own experiments; the weight card; the anchor swaps.

const SIGN_FLIP_BONUS = 0.3

/** A call as the metrics read it: one card's tier on a day. */
export interface CallA {
  key: string
  moveId: string
  alternativeId: string
  situationKey: string
  target: ReadingId
  window: string
  tier: Tier
  diff: number | null
  lo: number | null
  hi: number | null
}

export interface OfferMade {
  id: number
  moveId: string
  /** The recorded chance of the move offered, and whether it came by the coin flip. */
  propensity: number
  coinFlip: boolean
  situationKey: string
  target: ReadingId
  candidates: string[]
}

const iso = (day: string, block: Block, minute = 0) => `${day}T${['08', '13', '19'][BLOCKS.indexOf(block)]}:${String(minute).padStart(2, '0')}:00.000Z`

export class EngineA {
  private readonly rng: Rng
  private readonly checkins: CheckIn[] = []
  private readonly offers: Offer[] = []
  private readonly outcomes: Outcome[] = []
  private readonly cards: Card[] = []
  private readonly declarations: Declaration[] = []
  private beliefs = new Map<string, Belief>()
  private obs: Observation[] = []
  private nextId = 1
  /** Offers waiting for their answer at a later check-in. */
  private pending: { offer: Offer; response: Response }[] = []
  /** The last learning run's tiers, by card. */
  lastStats: CardStats[] = []

  /** Trip days, which learning leaves out as learningRecords does (homeDaysOnly). */
  private readonly away: ReadonlySet<string>

  constructor(rng: Rng, away: ReadonlySet<string> = new Set()) {
    this.rng = rng
    this.away = away
  }

  /** The daily learning run, as runLearning does it, on the record as it stands at the start of the day. */
  learn(day: string): CallA[] {
    const home = <T extends { day: string }>(xs: readonly T[]) => (this.away.size ? xs.filter((x) => !this.away.has(x.day)) : xs)
    const obs = observations(home(this.checkins), home(this.offers), home(this.outcomes))
    this.obs = obs
    const tags = tagBeliefs(obs, day)
    const keys = [...new Set(this.offers.map((o) => o.situationKey))]
    const beliefs = new Map<string, Belief>()
    const moveBeliefs = []
    for (const key of keys) {
      for (const m of liveMoves) {
        const b = moveBelief(m, key, obs, tags, day)
        beliefs.set(`${key}|${m.id}`, b.belief)
        moveBeliefs.push(b)
      }
      beliefs.set(`${key}|${NOTHING}`, nothingBelief(key, obs, day).belief)
    }
    this.beliefs = beliefs
    const flips = signFlips(moveBeliefs)
    const stats = evaluateCards(this.cards, obs, this.declarations)
    this.lastStats = stats
    for (const d of declarationsDue(this.cards, stats, this.declarations, day)) this.declarations.push({ ...d, id: this.nextId++ })
    for (const f of flips) {
      if (this.cards.some((c) => c.moveId === f.moveId && c.situationKey === f.hurts)) continue
      const [block, target] = f.hurts.split(':')
      const move = moveById(f.moveId)
      const window = move.targets.find((t) => t.reading === target)?.window ?? 'nextBlock'
      this.cards.push({ id: this.nextId++, createdAt: iso(day, 'morning'), situationKey: f.hurts, block: block as Block, target: target as ReadingId, moveId: f.moveId, alternativeId: NOTHING, window, worthwhile: 1, origin: 'signFlip' })
    }
    return stats.map((s) => {
      const c = this.cards.find((x) => x.id === s.cardId) as Card
      return { key: `${c.situationKey}|${c.moveId}|${c.alternativeId}`, moveId: c.moveId, alternativeId: c.alternativeId, situationKey: c.situationKey, target: c.target, window: c.window, tier: s.tier, diff: s.interval?.diff ?? null, lo: s.interval?.lo ?? null, hi: s.interval?.hi ?? null }
    })
  }

  /** The answers told at a check-in: every pending offer's outcome, unless it was never to be answered. */
  private answerPending(day: string, block: Block): void {
    const still: { offer: Offer; response: Response }[] = []
    for (const p of this.pending) {
      if (!p.response.answered) continue
      const r = p.response
      const outcome = r.did === null ? 'no' : r.did
      this.outcomes.push({ id: this.nextId++, offerId: p.offer.id as number, moveId: p.offer.moveId, day: p.offer.day, block: p.offer.block, at: iso(day, block, 5), outcome, why: r.did === 'no' ? r.why : null, passiveOutcome: null, seen: r.seen })
    }
    this.pending = still
  }

  /** The state a draw reads, as todayState and withLearning build it, from the simulated day. */
  private todayState(day: string, block: Block, c: DayContext): TodayState {
    const offered = this.offers.filter((o) => o.day === day)
    const doneIds = new Set(this.outcomes.filter((x) => x.day === day && (x.outcome === 'done' || x.outcome === 'partly')).map((x) => x.moveId))
    const doneRungs = new Map<string, number>()
    const doneAll = this.outcomes.filter((x) => x.outcome === 'done' || x.outcome === 'partly')
    for (const x of doneAll) {
      const r = rungOf(x.moveId)
      if (r) doneRungs.set(r.ladder[0], Math.max(doneRungs.get(r.ladder[0]) ?? -1, r.index))
    }
    const blockOffers = this.offers.filter((o) => o.block === block)
    const ids = new Set(blockOffers.map((o) => o.id))
    return {
      doneToday: [...doneIds],
      offeredToday: offered.map((o) => o.moveId),
      hiddenFamilies: new Set(),
      doneRungs,
      studyNight: c.studyNight,
      withHer: c.withHer,
      churchDay: c.church,
      noTimeCeiling: noTimeCeiling(blockOffers, this.outcomes.filter((x) => ids.has(x.offerId)), block, day),
      standing: standingSetups(doneAll.filter((x) => x.outcome === 'done').map((x) => ({ moveId: x.moveId, day: x.day })), {}),
      atOffice: c.office,
      daylight: block !== 'evening',
      pickupTime: c.daycare ? '17:30' : null,
      asleep: false,
      peopleAround: { morning: c.office || c.church, afternoon: c.office, evening: false },
      ...(c.away ? { homeOut: true } : {}),
    }
  }

  /** A completed check-in and its draw, as ensureOffer makes them. */
  checkIn(a: Answered, c: DayContext): OfferMade | null {
    this.answerPending(a.day, a.block)
    const checkin: CheckIn = { id: this.nextId++, day: a.day, block: a.block, asked: [...blockReadings(a.block)], startedAt: iso(a.day, a.block), completedAt: iso(a.day, a.block, 2), updatedAt: iso(a.day, a.block, 2), answers: a.answers as CheckIn['answers'], activeMs: 20000 }
    this.checkins.push(checkin)
    const situation = situationOf(checkin)
    if (!situation) return null
    const t = this.todayState(a.day, a.block, c)
    const tested = this.cards.filter((x) => x.situationKey === situation.key && (x.origin === 'signFlip' || x.origin === 'import'))
    const scheduled = new Set<string>()
    if (tested.length) {
      const obs = observations(this.checkins, this.offers, this.outcomes)
      for (const card of tested) {
        if (hasItsEight(card, obs)) continue
        scheduled.add(card.moveId)
        if (card.alternativeId !== NOTHING) scheduled.add(card.alternativeId)
      }
    }
    const drawn = candidatesFor(situation, t)
    const penalised = { ...drawn, candidates: drawn.candidates.map((x) => (x.id === NOTHING ? x : { ...x, bonus: (x.bonus ?? 0) - WINDOW_PENALTY[windowFor(x.id, situation.target)] })) }
    const set = { ...penalised, candidates: penalised.candidates.map((x) => (scheduled.has(x.id) ? { ...x, bonus: (x.bonus ?? 0) + SIGN_FLIP_BONUS } : x)) }
    const belief = (id: string) => this.beliefs.get(`${situation.key}|${id}`) ?? (hasMove(id) ? priorOf(moveById(id)) : FLAT)
    const choice = chooseFor(set, belief, this.rng)
    if (!choice) return null
    const odds = propensities(set.candidates, belief, this.rng)
    const history = this.offers.filter((o) => o.situationKey === situation.key && o.skippedAt === null)
    let cardId: number | null = null
    if (choice.id !== NOTHING) {
      const existing = this.cards.find((x) => x.situationKey === situation.key && x.moveId === choice.id)
      if (existing) cardId = existing.id as number
      else {
        const alternativeId = alternativeFor(choice.id, set, history)
        if (alternativeId) {
          cardId = this.nextId++
          this.cards.push({ id: cardId, createdAt: iso(a.day, a.block), situationKey: situation.key, block: a.block, target: situation.target, moveId: choice.id, alternativeId, window: windowFor(choice.id, situation.target), worthwhile: 1 })
        }
      }
    }
    const offer: Offer = { id: this.nextId++, kind: 'block', day: a.day, block: a.block, at: iso(a.day, a.block, 3), situationKey: situation.key, target: situation.target, stance: '', band: situation.band, reading: situation.reading, moveId: choice.id, cardId, candidates: set.candidates.map((x) => x.id), coinFlip: choice.coinFlip, passiveId: null, whyNot: null, propensity: odds[choice.id], propensities: odds, skippedAt: null, closedAt: null } as Offer
    this.offers.push(offer)
    return { id: offer.id as number, moveId: choice.id, propensity: odds[choice.id], coinFlip: choice.coinFlip, situationKey: situation.key, target: situation.target, candidates: offer.candidates as string[] }
  }

  /** How the offer went, told at the next check-in that is answered. */
  respond(offerId: number, response: Response): void {
    const offer = this.offers.find((o) => o.id === offerId)
    if (offer) this.pending.push({ offer, response })
  }
}
