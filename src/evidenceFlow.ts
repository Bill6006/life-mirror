import { anchorSwapDue } from './audit'
import { awayDays, homeDaysOnly } from './awayFlow'
import { caffeineEvidence, HABIT_DAYS, type CaffeineEvidence } from './caffeineRecord'
import { associationBy, associationTier, coolingOffDuration, associationFor, dayAssociation, morningAssociation, passiveAssociation, privateAssociations, whatBringsYouBack, type Association, type PrivateAssociation } from './associations'
import { hasMove, PASSIVE } from './catalogue'
import { allCheckIns, db, getSettings, privateItems, setAside, updateSettings, type Card, type CheckIn, type Declaration, type Outcome } from './db'
import { NOTHING } from './offers'
import { readings, setAnchorSwaps } from './readings'
import { setLearnedWeights } from './score'
import { proposeWeights, weightStanding, type Tier, type WeightStats } from './weights'
import { eveningWorkoutDays, HARD_MEASURES, hardDays, type HardMeasure } from './workouts'

// What the record shows on its own, on the phone. The old engine was retired on 2026-10-20 (the owner's requirement): the
// learning repair alone learns and draws. Once a day the readings' audits run: the anchor swap guard and the weight cards,
// which test the reading out of 100's own weights, never a move. The rest is the observational evidence Evidence and the
// Brain read: events, caffeine, workouts, private items, what brings you back, the passive items' association words and
// "Nothing today"'s counts. Nothing here is typed by hand; every number comes from the records.

/** The daily audits' mark (the key the daily run has always kept, so a run already made today stands). */
const AUDITS_KEY = 'learning'
const WEIGHT_CARD_MIN_DAYS = 28

/** What learning reads: the record, a trip's days left out once Away from home is open. Exported for its test alone. */
export async function evidenceRecords() {
  const [checkins, offers, outcomes, cards, declarations, away] = await Promise.all([allCheckIns(), db.offers.toArray(), db.outcomes.toArray(), db.cards.toArray(), db.declarations.toArray(), awayDays()])
  // Away from home (post-window, gated): a trip's days teach nothing about home and are left out; with the gate closed, none is.
  return { checkins: homeDaysOnly(checkins, away), offers: homeDaysOnly(offers, away), outcomes: homeDaysOnly(outcomes, away), cards, declarations }
}

/**
 * The daily audits: the anchor swap guard, once per reading, never the middle, logged and dated (Phase 12); and the
 * weight cards, declared when their interval clears the worthwhile change, applied once one holds up, and one proposed
 * from learned weights once the record is long enough. Skipped when they already ran today, unless forced.
 */
export async function runAudits(day: string, force = false): Promise<void> {
  const done = await db.derived.get(AUDITS_KEY)
  if (done && done.day === day && !force) return
  const { checkins, cards, declarations } = await evidenceRecords()
  const existingSwaps = await db.anchorSwaps.toArray()
  const swapsDue = readings.map((r) => anchorSwapDue(r, checkins, existingSwaps, day)).filter((s): s is NonNullable<typeof s> => s !== null)
  const weightCards = cards.filter((c) => c.origin === 'weight')
  const weightDue: Declaration[] = []
  let weightsToApply: Record<string, number> | null = null
  for (const w of weightCards) {
    const standing = weightStanding(w, checkins, declarations, day)
    if (standing.due) weightDue.push(standing.due)
    if (standing.holds && w.weights) weightsToApply = w.weights
  }
  const now = new Date().toISOString()
  await db.transaction('rw', [db.cards, db.declarations, db.derived, db.anchorSwaps], async () => {
    if (swapsDue.length) await db.anchorSwaps.bulkAdd(swapsDue)
    if (weightDue.length) await db.declarations.bulkAdd(weightDue)
    // One weight card, once the record is long enough, from learned weights; nothing changes until it holds up.
    const fullDays = new Set(checkins.filter((c) => c.completedAt).map((c) => c.day)).size
    if (fullDays >= WEIGHT_CARD_MIN_DAYS && !cards.some((c) => c.origin === 'weight')) {
      const weights = proposeWeights(checkins)
      if (weights) await db.cards.add({ createdAt: now, situationKey: 'weights', block: 'morning', target: 'mood', moveId: 'weights', alternativeId: 'equal', window: 'nextBlock', worthwhile: 10, origin: 'weight', weights })
    }
    await db.derived.put({ key: AUDITS_KEY, day, count: checkins.length })
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

/** A passive item that rode alongside: its like-for-like association and the word it allows, capped at Promising. */
export interface PassiveEvidence {
  card: Card
  association: Association
  tier: Tier
}

export interface Evidence {
  passives: PassiveEvidence[]
  weightCards: { card: Card; stats: WeightStats }[]
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
  /** Nothing extra drawn, and skipped for a move: nothing is asked of it, so nothing of it is kept or done (Item 4). */
  nothing: { offered: number; skipped: number }
  weeks: number
}

/** Everything the Evidence screen shows, computed from the records at the moment of asking. */
export async function evidence(today: string): Promise<Evidence> {
  const { checkins, offers, outcomes, cards, declarations } = await evidenceRecords()
  const settings = await getSettings()
  const items = await privateItems()
  // A passive item is assigned by rotation, never by a coin flip, so it is read like for like and capped at Promising.
  const passives: PassiveEvidence[] = cards
    .filter((c) => c.origin === 'passive')
    .map((card) => {
      const association = passiveAssociation(checkins, offers, outcomes, card.moveId, card.target, today)
      return { card, association, tier: associationTier(association, card.worthwhile * 25) }
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
  // A Nothing extra the app set aside when the day changed was never offered to you (stage 3, item 5).
  const nulls = offers.filter((o) => o.moveId === NOTHING && !setAside(o))
  const nothing = { offered: nulls.length, skipped: nulls.filter((o) => o.skippedAt !== null).length }
  return {
    passives,
    weightCards,
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

export type { Declaration }

/** What Now's "how much it knows" line counts (stage 1, item p): the moves done or partly done at least once. */
export async function movesTried(): Promise<number> {
  const outcomes = await db.outcomes.toArray()
  return new Set(outcomes.filter((o: Outcome) => (o.outcome === 'done' || o.outcome === 'partly') && o.moveId !== NOTHING && hasMove(o.moveId)).map((o) => o.moveId)).size
}
