import { anchorSwapDue } from './audit'
import { caffeineEvidence, HABIT_DAYS, type CaffeineEvidence } from './caffeineRecord'
import { associationBy, associationTier, coolingOffDuration, associationFor, dayAssociation, morningAssociation, passiveAssociation, privateAssociations, whatBringsYouBack, type Association, type PrivateAssociation } from './associations'
import { hasMove, liveMoves, moveById, PASSIVE } from './catalogue'
import { allCheckIns, db, getSettings, privateItems, updateSettings, type BeliefRow, type Card, type CheckIn, type Declaration, type Outcome, type TagBeliefRow } from './db'
import { cardFromHypothesis, parseHypothesis, type Parsed } from './hypothesis'
import { decayAfterStop, energyCost, FLAT, moveBelief, nothingBelief, observations, priorOf, signFlips, spillover, tagBeliefs, type Belief, type MoveBelief, type Observation, type TagBelief } from './learning'
import { NOTHING } from './offers'
import { readings, setAnchorSwaps } from './readings'
import { setLearnedWeights } from './score'
import { declarationsDue, evaluateCards, proposeWeights, weightStanding, type CardStats, type Tier, type WeightStats } from './tiers'
import { eveningWorkoutDays, HARD_MEASURES, hardDays, type HardMeasure } from './workouts'

// The learning engine on the phone. Once a day: every effect in the record, the beliefs the
// bandit draws from, sign flips with cards to test them on purpose, declarations when a card
// clears the bar, and one weight card once the record is long enough. Nothing here is typed
// by hand; every number the screen shows comes from these records.

const LEARNING_KEY = 'learning'
const WEIGHT_CARD_MIN_DAYS = 28

async function records() {
  const [checkins, offers, outcomes, cards, declarations] = await Promise.all([allCheckIns(), db.offers.toArray(), db.outcomes.toArray(), db.cards.toArray(), db.declarations.toArray()])
  return { checkins, offers, outcomes, cards, declarations }
}

/** The situations the beliefs are kept for: every one an offer has been made in, and the two fixed slots. */
function situationsOf(offers: readonly { situationKey: string }[]): string[] {
  return [...new Set([...offers.map((o) => o.situationKey), 'study:evening', 'pickup:energy'])].filter((k) => !k.startsWith('aim:'))
}

/**
 * The daily update. Skipped when it already ran today, unless forced. Beliefs update once a
 * day so that no belief flips on one bad day and every offer that day draws from the same ones.
 */
export async function runLearning(day: string, force = false): Promise<void> {
  const done = await db.derived.get(LEARNING_KEY)
  if (done && done.day === day && !force) return
  const { checkins, offers, outcomes, cards, declarations } = await records()
  const obs = observations(checkins, offers, outcomes)
  const tags = tagBeliefs(obs, day)
  const beliefs: MoveBelief[] = []
  for (const key of situationsOf(offers)) for (const m of liveMoves) beliefs.push(moveBelief(m, key, obs, tags, day))
  // The null offer has a belief per situation too, so the draw can learn to pick it; it never flips signs.
  for (const key of situationsOf(offers)) beliefs.push(nothingBelief(key, obs, day))
  const flips = signFlips(beliefs.filter((b) => b.moveId !== NOTHING))
  const flipped = new Set(flips.map((f) => `${f.moveId}|${f.hurts}`))
  const rows: BeliefRow[] = beliefs.map((b) => ({
    situationKey: b.situationKey,
    moveId: b.moveId,
    mean: b.belief.mean,
    sd: b.belief.sd,
    n: b.belief.n,
    researchMean: b.research.mean,
    researchSd: b.research.sd,
    recordMean: b.record?.mean ?? null,
    recordN: b.record?.n ?? 0,
    signFlip: flipped.has(`${b.moveId}|${b.situationKey}`),
    computedOn: day,
  }))
  const tagRows: TagBeliefRow[] = tags.map((t) => ({ id: t.id, mean: t.belief.mean, sd: t.belief.sd, n: t.belief.n, researchMean: t.research.mean, recordMean: t.record?.mean ?? null, recordN: t.record?.n ?? 0, computedOn: day }))
  const effectCardsOnly = cards.filter((c) => c.origin !== 'weight')
  const stats = evaluateCards(effectCardsOnly, obs, declarations)
  const due = declarationsDue(effectCardsOnly, stats, declarations, day)
  const now = new Date().toISOString()
  // Phase 12: the anchor swap guard, once per reading, never the middle, logged and dated.
  const existingSwaps = await db.anchorSwaps.toArray()
  const swapsDue = readings.map((r) => anchorSwapDue(r, checkins, existingSwaps, day)).filter((s): s is NonNullable<typeof s> => s !== null)
  // Phase 12: weight cards can now be declared; weights apply only once one holds up.
  const weightCards = cards.filter((c) => c.origin === 'weight')
  const weightDue: Declaration[] = []
  let weightsToApply: Record<string, number> | null = null
  for (const w of weightCards) {
    const standing = weightStanding(w, checkins, declarations, day)
    if (standing.due) weightDue.push(standing.due)
    if (standing.holds && w.weights) weightsToApply = w.weights
  }

  await db.transaction('rw', [db.beliefs, db.tagBeliefs, db.cards, db.declarations, db.derived, db.anchorSwaps], async () => {
    if (swapsDue.length) await db.anchorSwaps.bulkAdd(swapsDue)
    if (weightDue.length) await db.declarations.bulkAdd(weightDue)
    await db.beliefs.clear()
    await db.beliefs.bulkPut(rows)
    await db.tagBeliefs.clear()
    await db.tagBeliefs.bulkPut(tagRows)
    // A sign flip is tested on purpose: a card in the situation where the move seems to hurt.
    for (const f of flips) {
      const exists = cards.some((c) => c.moveId === f.moveId && c.situationKey === f.hurts)
      if (exists) continue
      const [block, target] = f.hurts.split(':')
      const move = moveById(f.moveId)
      const window = move.targets.find((t) => t.reading === target)?.window ?? 'nextBlock'
      await db.cards.add({ createdAt: now, situationKey: f.hurts, block: block as Card['block'], target: target as Card['target'], moveId: f.moveId, alternativeId: NOTHING, window, worthwhile: 1, origin: 'signFlip' })
    }
    if (due.length) await db.declarations.bulkAdd(due)
    // One weight card, once the record is long enough, from learned weights; nothing changes until it holds up.
    const fullDays = new Set(checkins.filter((c) => c.completedAt).map((c) => c.day)).size
    if (fullDays >= WEIGHT_CARD_MIN_DAYS && !cards.some((c) => c.origin === 'weight')) {
      const weights = proposeWeights(checkins)
      if (weights) await db.cards.add({ createdAt: now, situationKey: 'weights', block: 'morning', target: 'mood', moveId: 'weights', alternativeId: 'equal', window: 'nextBlock', worthwhile: 10, origin: 'weight', weights })
    }
    await db.derived.put({ key: LEARNING_KEY, day, count: obs.length })
  })
  if (weightsToApply) await updateSettings((s) => (s.weights ? s : { ...s, weights: weightsToApply as Record<string, number> }))
  await loadAudits()
}

/** What the audits have decided, loaded into the readings and the reading out of 100: at open and after each daily run. */
export async function loadAudits(): Promise<void> {
  const [swaps, settings] = await Promise.all([db.anchorSwaps.toArray(), getSettings()])
  setAnchorSwaps(swaps)
  setLearnedWeights(settings.weights)
}

/** The beliefs for one situation, for the draw: today's rows, else research alone; nothing today is flat. */
export async function beliefsFor(situationKey: string, ids: readonly string[]): Promise<(id: string) => Belief> {
  const rows = await db.beliefs.where('[situationKey+moveId]').anyOf(ids.map((id) => [situationKey, id])).toArray()
  const byId = new Map(rows.map((r) => [r.moveId, r]))
  return (id) => {
    const r = byId.get(id)
    if (r) return { mean: r.mean, sd: r.sd, n: r.n }
    return hasMove(id) ? priorOf(moveById(id)) : FLAT
  }
}

export interface CardEvidence {
  card: Card
  stats: CardStats
  belief: MoveBelief | null
  /** A passive item's like-for-like association, capped at Promising; null for every other card. */
  association: Association | null
  spill: { reading: string; mean: number; n: number }[]
  energy: { mean: number; n: number } | null
  decay: { daysHeld: number; runs: number } | null
}

export interface Evidence {
  observations: number
  cards: CardEvidence[]
  weightCards: { card: Card; stats: WeightStats }[]
  tags: TagBelief[]
  privates: PrivateAssociation[]
  coolingOff: { association: Association; duration: { blocks: number; events: number } | null } | null
  bigSocial: Association | null
  /** The morning's old yes/no chip, like for like: kept until the Caffeine item has 28 days of its own record. */
  heavyCaffeine: Association | null
  /** Caffeine by reported band (Part 22): the habit, the comparisons, and how much record the item has. */
  caffeine: CaffeineEvidence
  /** The other app's finished workouts: the evenings of workout days, like for like. */
  workouts: Association | null
  /** Part 35: an evening session against the morning after, its reading out of 100 and its sleep quality (0 to 100 from the five phrases), like for like. */
  eveningWorkout: { morning: Association; sleep: Association } | null
  /** Part 35: a hard session's day against the next morning's energy, mood, focus and stress, each in anchor steps in its own direction, like for like. */
  hardWorkout: { times: number; measures: Record<HardMeasure, Association> } | null
  bringsYouBack: { moveId: string; n: number }[]
  /** The null offer: how often it was offered, kept to, and skipped. */
  nothing: { offered: number; done: number; skipped: number }
  weeks: number
}

/** Everything the Evidence screen shows, computed from the records at the moment of asking. */
/**
 * One card's tier exactly as Evidence shows it (Part 33): every effect card read together, so the
 * correction for testing many at once is the same, and a passive card read like for like. Null
 * for a card that is gone or holds a weight.
 */
export async function tierOfCard(cardId: number, today: string): Promise<Tier | null> {
  const { checkins, offers, outcomes, cards, declarations } = await records()
  const card = cards.find((c) => c.id === cardId)
  if (!card || card.origin === 'weight') return null
  if (card.origin === 'passive') return associationTier(passiveAssociation(checkins, offers, outcomes, card.moveId, card.target, today), card.worthwhile * 25)
  const stats = evaluateCards(
    cards.filter((c) => c.origin !== 'weight'),
    observations(checkins, offers, outcomes),
    declarations,
  )
  return stats.find((s) => s.cardId === cardId)?.tier ?? null
}

export async function evidence(today: string): Promise<Evidence> {
  const { checkins, offers, outcomes, cards, declarations } = await records()
  const settings = await getSettings()
  const items = await privateItems()
  const obs = observations(checkins, offers, outcomes)
  const tags = tagBeliefs(obs, today)
  const effectCards = cards.filter((c) => c.origin !== 'weight')
  const stats = evaluateCards(effectCards, obs, declarations)
  const byId = new Map(effectCards.map((c) => [c.id as number, c]))
  const list: CardEvidence[] = stats.map((s) => {
    const card = byId.get(s.cardId) as Card
    const belief = hasMove(card.moveId) ? moveBelief(moveById(card.moveId), card.situationKey, obs, tags, today) : null
    // A passive item is assigned by rotation, never by a coin flip, so its card is read like for like and capped at Promising.
    const association = card.origin === 'passive' ? passiveAssociation(checkins, offers, outcomes, card.moveId, card.target, today) : null
    return {
      card,
      stats: association ? { ...s, tier: associationTier(association, card.worthwhile * 25) } : s,
      belief,
      association,
      spill: hasMove(card.moveId) ? spillover(obs, card.moveId, card.situationKey, card.target) : [],
      energy: hasMove(card.moveId) ? energyCost(obs, card.moveId) : null,
      decay: hasMove(card.moveId) ? decayAfterStop(obs, card.moveId, checkins, card.target) : null,
    }
  })
  const weightCards = cards.filter((c) => c.origin === 'weight').map((card) => ({ card, stats: weightStanding(card, checkins, declarations, today).stats }))
  const cooling = associationFor(checkins, today, (c) => Boolean(c.extras?.coolingOff))
  const social = associationFor(checkins, today, (c) => Boolean(c.extras?.bigSocial))
  const caffeine = morningAssociation(checkins, today, (c) => Boolean(c.extras?.heavyCaffeine))
  const cafe = caffeineEvidence(checkins, today)
  const sessions = await db.outside.toArray()
  const outsideDays = new Set(sessions.map((o) => o.day))
  const workouts = dayAssociation(checkins, today, (d) => outsideDays.has(d))
  // Part 35: evening sessions against the night and the morning after; hard sessions against the next morning's four readings.
  const evenings = eveningWorkoutDays(sessions)
  const onEvening = (c: CheckIn) => evenings.has(c.day)
  const eveningMorning = associationFor(checkins, today, onEvening)
  const eveningSleep = associationBy(checkins, today, onEvening, (m) => (m.answers.sleepQuality === undefined ? null : (m.answers.sleepQuality - 1) * 25))
  const hard = hardDays(sessions)
  const onHard = (c: CheckIn) => hard.has(c.day)
  const hardMeasures = Object.fromEntries(HARD_MEASURES.map((id) => [id, associationBy(checkins, today, onHard, (m) => m.answers[id] ?? null)])) as Record<HardMeasure, Association>
  const first = checkins.reduce<string | null>((f, c) => (f === null || c.day < f ? c.day : f), null)
  const weeks = first ? Math.floor((Math.max(0, (Date.parse(today) - Date.parse(first)) / 86_400_000) + 1) / 7) : 0
  const nulls = offers.filter((o) => o.moveId === NOTHING)
  const outcomeOf = new Map(outcomes.map((x) => [x.offerId, x]))
  const nothing = { offered: nulls.length, done: nulls.filter((o) => o.id !== undefined && outcomeOf.get(o.id)?.outcome === 'done').length, skipped: nulls.filter((o) => o.skippedAt !== null).length }
  return {
    observations: obs.length,
    cards: list,
    weightCards,
    tags,
    privates: privateAssociations(settings.privateInSelection, items, checkins, today),
    coolingOff: cooling.times > 0 ? { association: cooling, duration: coolingOffDuration(checkins, today) } : null,
    bigSocial: social.times > 0 ? social : null,
    heavyCaffeine: caffeine.times > 0 && cafe.itemDays < HABIT_DAYS ? caffeine : null,
    caffeine: cafe,
    workouts: workouts.times > 0 ? workouts : null,
    eveningWorkout: eveningMorning.times > 0 ? { morning: eveningMorning, sleep: eveningSleep } : null,
    hardWorkout: hardMeasures.energy.times > 0 ? { times: hardMeasures.energy.times, measures: hardMeasures } : null,
    bringsYouBack: whatBringsYouBack(offers, outcomes),
    nothing,
    weeks,
  }
}

/** An outside hypothesis, pasted in: a card to test, never something to believe. Nothing else changes. */
export async function importHypothesis(text: string, now: string = new Date().toISOString()): Promise<Parsed> {
  const parsed = parseHypothesis(text)
  if (parsed.ok) await db.cards.add(cardFromHypothesis(parsed.hypothesis, now))
  return parsed
}

/**
 * The recovery gap is assigned the evening after a big social day: one marked unplanned on the
 * evening chip, or the church day, known from the day's own context and never from a draw.
 */
/**
 * Whether today was marked a big social day: its own evening check-in carries the chip (the final
 * checklist, 2026-09-25). Today's record alone: no other day's chip leaks into it, and no church
 * day is taken for one; on a church day the evening's chips ask instead.
 */
export async function bigSocialToday(day: string): Promise<boolean> {
  if (!PASSIVE.has('recovery-gap')) return false
  const c = await db.checkins.where('[day+block]').equals([day, 'evening']).first()
  return Boolean(c?.extras?.bigSocial)
}

/** Private items in selection, for the evening card: only when you turned that on. */
export async function privateAssociationsToday(today: string): Promise<PrivateAssociation[]> {
  const settings = await getSettings()
  if (!settings.privateInSelection) return []
  const [items, checkins] = await Promise.all([privateItems(), allCheckIns()])
  return privateAssociations(true, items, checkins, today)
}

export function outcomesOf(outcomes: readonly Outcome[], offerId: number): Outcome | undefined {
  return outcomes.find((x) => x.offerId === offerId)
}

export type { Observation, Declaration }
