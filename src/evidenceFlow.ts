import { anchorSwapDue } from './audit'
import { type Standing, standings, type Stood, WORTH_POINTS, WORTH_STEPS } from './counted/compare'
import { guardComparisons } from './counted/fault'
import { chanceIsOff, withoutChance } from './counted/named'
import { awayDays, homeDaysOnly } from './awayFlow'
import { caffeineEvidence, HABIT_DAYS, type CaffeineEvidence } from './caffeineRecord'
import { associationBy, coolingOffDuration, associationFor, dayAssociation, morningAssociation, passiveAssociation, privateAssociations, tierFor, whatBringsYouBack, type Association, type PrivateAssociation } from './associations'
import { hasMove, PASSIVE } from './catalogue'
import { allCheckIns, db, getSettings, privateItems, setAside, updateSettings, type Card, type CheckIn, type Declaration, type Offer, type Outcome, type OutsideDay } from './db'
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
  /** Where it stands among the screen's cards, by the one standard. */
  standing: Standing
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
  /** The comparisons' chance threw on this phone (2026-11-12): the numbers here were then read with none asked, nothing stands past too few, and every line says the comparison could not be worked out. */
  failed?: true
  /** The null offer: how often it was offered, kept to, and skipped. */
  /** Nothing extra drawn, and skipped for a move: nothing is asked of it, so nothing of it is kept or done (Item 4). */
  nothing: { offered: number; skipped: number }
  weeks: number
}

/**
 * The passive items' cards under the one standard (2026-11-12). Each is read like for like, as it always was, and now
 * given its chance; the cards on the screen are one family, so each pays for the others. A card reads one reading the
 * next morning, a scale of steps, so a lead is the most it says (stress/RESULTS-8.md). Its word is the old three:
 * little for too few, promising only for a lead in the good direction, unclear otherwise.
 */
export function passiveEvidence(cards: readonly Card[], checkins: readonly CheckIn[], offers: readonly Offer[], outcomes: readonly Outcome[], today: string): PassiveEvidence[] {
  const rode = cards.filter((c) => c.origin === 'passive').map((card) => ({ card, association: passiveAssociation(checkins, offers, outcomes, card.moveId, card.target, today, { id: `evidence.${card.moveId}`, worth: card.worthwhile * 25 }) }))
  // On the run after a failure no chance is asked, and no card stands past too few.
  const stood = chanceIsOff() ? new Map<string, Stood>() : new Map(standings(rode.flatMap((x) => (x.association.compared ? [x.association.compared] : []))).map((s) => [s.id, s]))
  return rode.map(({ card, association }) => {
    const s = association.compared ? stood.get(association.compared.id) : undefined
    const standing: Standing = !s ? 'tooFew' : s.standing === 'pattern' ? 'lead' : s.standing
    // The target's points already run the good way up, whichever way the reading itself runs.
    return { card, association, standing, tier: tierFor(standing, s && s.direction !== 'none' ? s.direction === 'higher' : null) }
  })
}

/** What the evidence reads from the record. */
export type EvidenceRecord = Awaited<ReturnType<typeof evidenceRecords>> & { settings: Awaited<ReturnType<typeof getSettings>>; items: Awaited<ReturnType<typeof privateItems>>; sessions: OutsideDay[] }

/**
 * Everything the Evidence screen shows, computed from the records at the moment of asking. The comparisons' chance is
 * new math (2026-11-12), so the arithmetic runs under their guard: if it throws, it runs again with no chance asked,
 * as it ran before that day, and the evidence says its comparisons failed.
 */
export async function evidence(today: string): Promise<Evidence> {
  const [records, settings, items, sessions] = await Promise.all([evidenceRecords(), getSettings(), privateItems(), db.outside.toArray()])
  const read = () => evidenceFrom({ ...records, settings, items, sessions }, today)
  return guardComparisons(today, read) ?? { ...withoutChance(read), failed: true }
}

/** The evidence's arithmetic, from a record already read. */
export function evidenceFrom({ checkins, offers, outcomes, cards, declarations, settings, items, sessions }: EvidenceRecord, today: string): Evidence {
  // A passive item is assigned by rotation, never by a coin flip, so it is read like for like and capped at Promising.
  const passives = passiveEvidence(cards, checkins, offers, outcomes, today)
  const weightCards = cards.filter((c) => c.origin === 'weight').map((card) => ({ card, stats: weightStanding(card, checkins, declarations, today).stats }))
  const cooling = associationFor(checkins, today, (c) => Boolean(c.extras?.coolingOff), undefined, { id: 'assoc.coolingOff', worth: WORTH_POINTS })
  const social = associationFor(checkins, today, (c) => Boolean(c.extras?.bigSocial), undefined, { id: 'assoc.bigSocial', worth: WORTH_POINTS })
  const caffeine = morningAssociation(checkins, today, (c) => Boolean(c.extras?.heavyCaffeine), { id: 'assoc.heavyCaffeine', worth: WORTH_POINTS })
  const cafe = caffeineEvidence(checkins, today)
  const outsideDays = new Set(sessions.map((o) => o.day))
  const workouts = dayAssociation(checkins, today, (d) => outsideDays.has(d), undefined, { id: 'assoc.workouts', worth: WORTH_POINTS })
  // Part 35: evening sessions against the night and the morning after; hard sessions against the next morning's four readings.
  const evenings = eveningWorkoutDays(sessions)
  const onEvening = (c: CheckIn) => evenings.has(c.day)
  const eveningMorning = associationFor(checkins, today, onEvening, undefined, { id: 'assoc.eveningWorkout', worth: WORTH_POINTS })
  const eveningSleep = associationBy(checkins, today, onEvening, (m) => (m.answers.sleepQuality === undefined ? null : (m.answers.sleepQuality - 1) * 25), { id: 'assoc.eveningWorkout.sleep', worth: WORTH_POINTS })
  const hard = hardDays(sessions)
  const onHard = (c: CheckIn) => hard.has(c.day)
  const hardMeasures = Object.fromEntries(HARD_MEASURES.map((id) => [id, associationBy(checkins, today, onHard, (m) => m.answers[id] ?? null, { id: `assoc.hardWorkout.${id}`, worth: WORTH_STEPS })])) as Record<HardMeasure, Association>
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

export function outcomesOf(outcomes: readonly Outcome[], offerId: number): Outcome | undefined {
  return outcomes.find((x) => x.offerId === offerId)
}

export type { Declaration }

/** What Now's "how much it knows" line counts (stage 1, item p): the moves done or partly done at least once. */
export async function movesTried(): Promise<number> {
  const outcomes = await db.outcomes.toArray()
  return new Set(outcomes.filter((o: Outcome) => (o.outcome === 'done' || o.outcome === 'partly') && o.moveId !== NOTHING && hasMove(o.moveId)).map((o) => o.moveId)).size
}
