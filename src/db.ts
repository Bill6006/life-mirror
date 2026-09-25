import type { BrainPrefsBody, Lacked, LineAction } from './brainShared'
import type { CoachAsk, CoachProposal } from './coachShared'
import type { PathId, SettingKind } from './catalogue'
import type { CoachBlock } from './factTypes'
import type { FactSheet } from './facts'
import type { PickRule } from './pathStage'
import Dexie, { type Table } from 'dexie'
import type { HelpLevel, HerRung } from './her'
import { blockIndex, compareSlots, parseDay, type Block, type Slot } from './blocks'
import { installOutbox, markSilent, type CloudMeta, type CloudRowState, type OutboxRow } from './cloudOutbox'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { remindedKey, sunPlace, withDefaults, type Settings, type Weekday } from './settings'
import { sunLocal } from './sun'
import type { UseKind } from './useShared'
import type { Area, PlaceKind, Where } from './location'

// Everything lives in IndexedDB on the phone. Nothing here talks to a network.

export type WinOutcome = 'done' | 'partly' | 'no'
export type ExtraKey = 'caffeine' | 'dinner' | 'closeToGod' | 'nothingLanded' | 'hardToSeePoint' | 'coolingOff' | 'bigSocial' | 'heavyCaffeine' | 'napped'
export type NecessityKey = 'shower' | 'teeth' | 'food'
export type Necessities = Partial<Record<NecessityKey, true>>

/** Caffeine for one check-in window (Part 21): 1 under 100 mg, 2 100–199, 3 200–299, 4 300 or more. */
export type CaffeineBand = 1 | 2 | 3 | 4
export const CAFFEINE_BANDS: readonly CaffeineBand[] = [1, 2, 3, 4]

export interface Extras {
  /** Before 2026-09-23: "Caffeine after midday", a yes on the evening. Read now as some caffeine, amount unknown. */
  caffeine?: true
  /**
   * Caffeine reported for this check-in's window: its band, when it was tapped, and when the window
   * began (the previous check-in's completion that day, or null for the day's first: since waking).
   */
  caffeineIntake?: { band: CaffeineBand; at: string; since: string | null }
  /** The Caffeine item was on screen for this window on its own day. Untapped, that means none reported, never a confirmed zero. */
  caffeineShown?: true
  dinner?: true
  closeToGod?: true
  /** The two evening chips, answered at once from the record. */
  nothingLanded?: true
  hardToSeePoint?: true
  /** Phase 10: a cooling-off event, whose duration the readings say; and an unplanned big social event. */
  coolingOff?: true
  bigSocial?: true
  /** Before 2026-09-23: "Heavy caffeine this morning" on the morning check-in. Read now as some caffeine, amount unknown. */
  heavyCaffeine?: true
  /** Napped today: the one daytime sleep the record cannot otherwise see, on the evening check-in. */
  napped?: true
  /** Phase 11: the necessities signal. A tap marks a miss; silence is not evidence. Never offered as a move, never celebrated. */
  necessities?: Necessities
  /** One optional line for anything the app has no question for. Kept for the export. */
  note?: string
  /** Private items logged, keyed by item id. Names live only in privateItems. */
  private?: Record<string, true>
}

/** Each day's context, written from the week's shape when the day begins; changing today never rewrites the past. */
export interface DayContext {
  day: string
  weekday: Weekday
  withHer: boolean
  studyNight: boolean
  churchDay: boolean
  /** At the office rather than at home, from the week's office days; the exception is one chip inside the check-in. Older days lack it and read as home. */
  atOffice?: boolean
  pickupTime: string | null
  soloUntil: string
  /** Part 35: the day's sunrise and sunset where you are, HH:MM, when a place was set as the day began: its light, kept for the record. */
  light?: { rise: string; set: string }
  /**
   * Part 43: where each part of the day was spent, as Life Mirror saw it while it was open: kinds of
   * place only (Home, Work, Church, a regular place, out nearby, away in a different area), never a
   * coordinate, an address or a time of arrival. Absent while Location Context is off.
   */
  where?: Partial<Record<Block, Where[]>>
  /** Set when you changed today by hand. */
  changed: boolean
  createdAt: string
}

/**
 * Part 43: a place you named, recognised again by keyed fingerprints of the map cells around it,
 * made with this phone's own key; kept on this phone alone. `none` is a place you said not to note:
 * never asked about again. `area` is its area to a tenth of a degree, for telling away from out.
 */
export interface KnownPlace {
  id?: number
  kind: PlaceKind | 'none'
  /** Your own word for a regular place, if you gave one; never shown to Claude. */
  label?: string
  cells: string[]
  area?: Area
  learnedAt: string
}

/**
 * Part 43: a place seen again and again but not yet named: its cell block's fingerprints, how many
 * different days it was seen, and in which parts of them. No time, no coordinate. Forgotten when
 * unseen for three weeks; asked about once, after three days.
 */
export interface PlaceCandidate {
  id?: number
  cells: string[]
  area?: Area
  firstDay: string
  lastDay: string
  days: number
  morning: number
  afternoon: number
  evening: number
  office: number
  church: number
  /** After "Not now": not asked again before this day. */
  askAfter?: string
}

/** Part 43: this phone's own values for place recognition: the fingerprint key, the area for the sun, the day a place was last asked about. */
export interface PlaceMeta {
  key: 'secret' | 'area' | 'askedOn'
  value: string
}

export interface CheckIn {
  id?: number
  day: string
  block: Block
  /** The readings this check-in asked, fixed when it began. Older records mean the block's full set. */
  asked?: ReadingId[]
  /** When the check-in was first opened. */
  startedAt: string
  /** When the last asked reading was answered; null while any is missing. */
  completedAt: string | null
  updatedAt: string
  answers: Answers
  /** Time spent tapping, in ms; pauses longer than a minute are not counted. */
  activeMs: number
  extras?: Extras
}

export interface Win {
  id?: number
  /** The day the win is for. */
  forDay: string
  /** The day it was written, the evening before. */
  setOn: string
  text: string
  outcome: WinOutcome | null
  answeredAt: string | null
  updatedAt: string
}

export interface PrivateItem {
  id?: number
  name: string
  createdAt: string
  archived: 0 | 1
}

export type OfferKind = 'block' | 'pickup' | 'study' | 'step' | 'unblock'
export type OutcomeWhy = 'noTime' | 'didntWant'
export type StudyReason = 'tired' | 'tooMuch' | 'noTime' | 'didntWant'
export type StudyDecision = 'started' | 'smaller' | 'notNow'

/** A study night's decision: what was offered, what you chose, the reason if any, and how it read against tonight's readings. */
export interface StudyNight {
  id?: number
  day: string
  weekday: Weekday
  offerId: number | null
  offeredMoveId: string
  decision: StudyDecision
  reason: StudyReason | null
  /** Null when the reason has no reading to check against. */
  supported: boolean | null
  evidence: string | null
  smallerMoveId: string | null
  at: string
}

/** What was OFFERED: one move for one situation, at one moment. Never the same record as what happened. */
export interface Offer {
  id?: number
  kind: OfferKind
  day: string
  block: Block
  at: string
  situationKey: string
  target: ReadingId
  /** Empty since 2026-09-17; older offers carry one of the four stance words the design pass replaced with the bands. */
  stance: string
  band: string
  reading: number
  /** A catalogue id, "nothing" for the null offer, a session of a learning commitment's skill ("skill:id", Workstream 6), or, before the ladder was retired, a rung of the proof ladder ("rung:skill:rung"). */
  moveId: string
  /** What was offered, in words, when the id alone cannot say (a rung of the ladder). */
  label?: string
  /** The sitting's minutes when the offer is a rung of the ladder, so the Done tap opens on that ladder's clock. */
  minutes?: number
  cardId: number | null
  /** The candidate set the draw was made from. */
  candidates: string[]
  /** One offer in five is a pure coin flip across the candidates, and says so. */
  coinFlip: boolean
  /** A passive item riding alongside, or null. */
  passiveId: string | null
  whyNot: { moveId: string; reason: string } | null
  /** Phase 12: the probability this move had of being offered, and every candidate's, at the draw. */
  propensity?: number
  propensities?: Record<string, number>
  /** A path's step (Part 24): who chose the rep, the paths it counts for, where it was meant to happen, the rule that picked it and the stage it was offered at. */
  chosenBy?: 'app' | 'you' | 'coach'
  paths?: PathId[]
  setting?: SettingKind
  rule?: PickRule
  stage?: number
  /** Recorded after the fact with "Did it already": a session done away from the app, started and done at the same moment. */
  logged?: boolean
  skippedAt: string | null
  /** Set once the outcome has been asked, answered or not. */
  closedAt: string | null
}

/** A test card, written before any comparison and never edited. A change is a new card. */
export interface Card {
  id?: number
  createdAt: string
  situationKey: string
  block: Block
  target: ReadingId
  moveId: string
  alternativeId: string
  window: string
  /** Worthwhile change, in anchor steps on the target reading. */
  worthwhile: number
  /** Where the card came from: the app's own draw, an imported hypothesis, a sign flip to test on purpose, a passive item, or a weight card. */
  origin?: 'app' | 'import' | 'signFlip' | 'passive' | 'weight'
  /** A weight card's proposed weights for the six ingredients. */
  weights?: Record<string, number>
}

/** A dated declaration: the card's interval when it first lay wholly beyond the worthwhile change, frozen. Later data replicates it or not. */
export interface Declaration {
  id?: number
  cardId: number
  at: string
  diff: number
  lo: number
  hi: number
  p: number
  level: number
  nDone: number
  nAlternative: number
  /** Which estimator produced the claim: the adaptive weights over all the data, the coin-flip slice, or the weight card's pairs. */
  estimator?: 'adaptive' | 'coinFlip' | 'weights'
}

/** An anchor swap: a pre-written alternate that took a phrase's place after a long unused stretch, once per reading, never the middle. Logged and dated. */
export interface AnchorSwap {
  id?: number
  reading: ReadingId
  position: number
  from: string
  to: string
  at: string
  answers: number
  stretchDays: number
}

/** A belief the bandit draws from, recomputed once a day: research says, your record says, and the two combined. */
export interface BeliefRow {
  situationKey: string
  moveId: string
  mean: number
  sd: number
  n: number
  researchMean: number
  researchSd: number
  recordMean: number | null
  recordN: number
  signFlip: boolean
  computedOn: string
}

export interface TagBeliefRow {
  id: string
  mean: number
  sd: number
  n: number
  researchMean: number
  recordMean: number | null
  recordN: number
  computedOn: string
}

/** A forecast, saved before its slot is logged and never rewritten: one per day, block and horizon. */
export interface Forecast {
  id?: number
  day: string
  block: Block
  /** Days ahead when made: 0 is today's shape, 1 to 7 the week ahead. */
  horizon: number
  madeOn: string
  model: string
  point: number
  lo: number
  hi: number
  /** "If you did nothing extra": an assumption the app has never verified. */
  whatIf: number | null
}

/** A forecast scored once its slot was logged; a slot never logged is never scored. */
export interface ForecastScore {
  id?: number
  day: string
  block: Block
  horizon: number
  model: string
  point: number
  lo: number
  hi: number
  actual: number
  error: number
  hit: boolean
  scoredOn: string
}

/** Bookkeeping the app derives and can recompute; never synced. */
export interface Derived {
  key: string
  day: string
  count: number
}

/**
 * A day another app of yours wrote a finished workout for, read from the shared cloud copy. Never
 * a move, never a count: a fact the record can set against the others. Read from the cloud again
 * after a wipe or on a fresh install; never synced from here.
 */
export interface OutsideDay {
  /** The other app's record id. */
  id: string
  day: string
  /** Minutes the session ran, when the record says. */
  minutes: number | null
  /** When it finished. */
  at: string
  source: 'workout'
  /** Part 35, read from the same row, each only when the row holds it: when it began. */
  startedAt?: string
  /** Its type, as the other app titles it: Push + arms, Lower body and so on. */
  title?: string
  endedEarly?: boolean
  /** Working sets done: warm-ups and sets left undone are not counted. */
  workingSets?: number
  /** Your rating afterwards, when you gave one: the effort, and your energy from 1 to 5. */
  effort?: 'too-easy' | 'right' | 'too-hard'
  energyAfter?: number
  /** Reps in reserve, averaged over the working sets that logged one. */
  avgRir?: number
  /** An older session brought in by the other app's import, not logged live. */
  imported?: boolean
}

/** What HAPPENED: the one-tap answer at the next check-in. Null means the question was passed over. */
export interface Outcome {
  id?: number
  offerId: number
  moveId: string
  day: string
  block: Block
  at: string
  outcome: WinOutcome | null
  /** The optional second tap after a No, never required, never asked twice. */
  why: OutcomeWhy | null
  /** Whether the passive item riding alongside happened, when there was one. */
  passiveOutcome: 'done' | 'no' | null
  /** How a learning session went, one optional tap after it (Workstream 6): evidence for a review, never a grade. */
  ease?: Ease
  /** One optional line about the session, in your words. */
  note?: string
}

/** How a session went, in your own sense of it: harder than it should be, about right, or easy now. */
export type Ease = 'hard' | 'right' | 'easy'

export type AimKind = 'certification' | 'person' | 'practice' | 'path'

/** A commitment you chose, with nothing to type: its kind, and for a person or a practice the catalogue move that is its step. */
export interface Aim {
  id?: number
  kind: AimKind
  /** Null for a study commitment, whose step comes from its ladder, and for a path, whose step is picked each block. */
  stepMoveId: string | null
  /** A study commitment's subject, typed once: the certification, the language, the instrument. Its skills carry the same name. */
  name?: string
  /** A study commitment's six proofs, chosen once. */
  ladder?: LadderKind
  /** A path commitment (Part 24): which path. */
  path?: PathId
  /** A path, or a learning commitment, paused by you: no row on Now and no step, its record kept. */
  pausedAt?: string | null
  /** A learning commitment's current skill (Workstream 6): the one thing it works on now, until you change it. Null: none named yet. */
  currentSkillId?: number | null
  /** What you said would change the advice when you added it: what you can already do, what matters most, anything to avoid. */
  about?: string
  /** How you said you learn or practise it, held here until a skill is named, then that skill's. */
  method?: string
  /** A learning commitment you finished: dated, distinct from Remove, and reopened by a tap. */
  finishedAt?: string | null
  /** Part 39: how often you practise it (sessions a week, rest days between); absent, it is flexible and never due by a count. Set by you, never assumed. */
  rhythm?: { perWeek: number; restDays: number } | null
  /** Part 39: fixed days (0 is Sunday); when any are set they alone decide the days it is due. */
  schedule?: number[]
  /** A Social path converted from A person, which keeps that commitment's whole record. */
  convertedFrom?: 'person'
  convertedAt?: string
  /** Today's rep, picked by you through Change: offered whatever the day's shape says. With two paths on, the later pick is the row's. */
  pick?: { day: string; moveId: string; at?: string }
  createdAt: string
  archivedAt: string | null
}

/** A skill on the proof ladder, typed once on this phone. */
/** Which six proofs a skill climbs: the technical ladder, the language one, or the one for a skill learned by doing. */
export type LadderKind = 'technical' | 'language' | 'craft'

export interface Skill {
  id?: number
  name: string
  /** The subject the skill belongs to, typed once: a certification, a language. Empty when there is only the one. */
  subject?: string
  /** The ladder its subject chose once; absent means technical. Kept as history since the ladder was retired (Workstream 6, D2). */
  ladder?: LadderKind
  /** The learning commitment it belongs to (Workstream 6); older skills are matched by their subject until adopted. */
  aimId?: number
  /** How it is practised: a class, an app, a book, a teacher. */
  method?: string
  /** How to practise it, in a line or two. */
  how?: string
  /** A session's minutes, when you know them; never assumed. */
  minutes?: number
  /** Who named it: you, or a suggestion you accepted. */
  source?: 'you' | 'claude'
  /** For a physical skill taken from a suggestion (Part 40): what to watch for, and rest. Not medical advice. */
  safety?: string
  /** A suggestion's provisional next skill, kept with the one you took. */
  likelyNext?: string
  /** When it last became the commitment's current skill, and when it stopped being current. */
  startedAt?: string
  endedAt?: string
  order: number
  createdAt: string
  archivedAt: string | null
}

/** One tap that moved a skill to a rung: by Done on its step, or by hand on the ladder. A lower rung later is a correction. */
export interface RungMark {
  id?: number
  skillId: number
  rung: number
  at: string
  via: 'tap' | 'step'
}

/** A cue tapped for a step today: when you mean to do it. After pickup, after her bedtime, at the next check-in. */
export type Cue = 'afterPickup' | 'afterBedtime' | 'nextCheckIn'

/** One plan, one tap: the cue for a commitment's step on one day; kept once the step is started. */
export interface Intention {
  id?: number
  aimId: number
  day: string
  cue: Cue
  /** The clock time the cue named that day, HH:MM, as the week's shape had it. */
  time: string
  setAt: string
  /** The offer that started the step, once it was; null until then. */
  offerId: number | null
  /** The step's name when the plan was made, for a reminder that carries it. */
  step?: string
}

/** The day's fact sheet as a record of its own: what the brain may speak from, written by the phone and read by the Worker. */
export interface FactsRow {
  day: string
  builtAt: string
  updatedAt: string
  sheet: FactSheet
  /**
   * The paths' decision core for the coach (Parts 24 and 32), beside the sheet and never inside
   * it, so no line briefing can read it. Absent while no path is on.
   */
  coach?: CoachBlock
}

/** The phone's own line for a day, chosen once by the situation engine; a null situation means it had nothing to say. */
export interface BriefLog {
  id?: number
  day: string
  situationId: string | null
  mode: string
  text: string
  factIds: string[]
  cardIds: string[]
  /** The one tap the line offers, when it offers one. */
  action?: LineAction
  at: string
  /** Set when the line's facts stopped holding and it left the screen. It was still said: its cooldown counts, and the next day's follow-up can find it. */
  withdrawnAt?: string
  /** Set the first time the line was on screen. A line logged while the brain's own line stood was never shown, so it was never said (Part 33). */
  shownAt?: string
}

/**
 * How the app is used (Part 34; Follow-up F1): counts and times only, no content. Life Mirror opened,
 * a screen opened, a check-in opened or left before its end, the line's one tap taken or its Why
 * opened, a notification opened, a rep picked through Change. Nothing outside the app, no keystroke,
 * nothing typed. Kept on this phone and, with the cloud copy on, in your own database (F1); Claude
 * may be given counts of it under Settings → Brain, never an explanation of why.
 */
export type { UseKind } from './useShared'

export interface UseRow {
  id?: number
  day: string
  at: string
  kind: UseKind
  /** Which one: the screen, the block, the action or the notification; a fixed id, never content. */
  what?: string
}

/** One tap under a line: how it landed. Filed once per line. */
export interface BriefFeedback {
  id?: number
  day: string
  briefKey: string
  situationId: string | null
  answer: 'useful' | 'knew' | 'not'
  at: string
}

/** A line the Worker wrote, read from its rows in the cloud copy; never written from here. */
export interface BrainBrief {
  id: string
  day: string
  kind: 'brief' | 'review'
  text: string
  mode: string
  factIds: string[]
  cardIds: string[]
  model: string
  at: string
  /** The one tap the line offers, when it offers one. */
  action?: LineAction | null
  /** The day whose facts the line was written from, for showing why it said what it said. */
  factsDay?: string
  /** The day the Worker wrote the line for. */
  forDay?: string
  /** The weekly review's three parts, on a row of kind review. */
  parts?: { held: string; didNot: string; change: string }
  /** Who wrote it (Part 30): Claude through your routine, or the free model chain. Absent on lines written before Part 30. */
  writer?: 'claude' | 'free'
  /** For Claude's line: the model alias asked for; `model` is the id that actually wrote it. */
  askedModel?: string
  /** For the free chain standing in for Claude: why it did. */
  fallback?: string
  /** What Claude said it lacked for this line or review (Part 34): ids from a fixed list, counted only. */
  lacked?: Lacked[]
}

/** The Brain settings (Part 30): which model writes, and what Claude may read. One row, synced, so the Worker reads it at every request. */
export interface BrainPrefs extends BrainPrefsBody {
  id: 'prefs'
  updatedAt: string
}

/**
 * The coach's pick for a day (Part 32), read from the brain's rows and never written from here: up
 * to two of the People row's own candidates, and one line of today's version. Used only while every
 * rep it names is still one the row may offer.
 */
export interface CoachPick {
  id: string
  day: string
  block: Block
  path: PathId
  ids: string[]
  /** Today's version of each rep named, by its id: the drawn rep's own line shows under it. */
  versions: Record<string, string>
  model: string
  at: string
}

/** One read by Claude through the retrieval layer, pulled from the brain's rows: its task, category, count and size, never content. */
export interface BrainRead {
  id: string
  day: string
  at: string
  task: 'line' | 'review' | 'coach' | 'skill' | 'progress'
  category: string
  count: number
  bytes: number
  via: 'briefing' | 'context'
  /** Read by a coach run made by hand to test the path: shown as a test run. */
  dry?: boolean
}

/**
 * A declaration on a path (Part 27), dated and undone by deleting it (Rule 13): a stage you say you
 * have reached, a date with its day and nothing else, or a milestone with its details. No name, no
 * place, and nothing about anyone's answer.
 */
export interface PathMark {
  id?: number
  path: PathId
  kind: 'stage' | 'date' | 'milestone'
  /** The day it is for: a date's own day; a stage's or a milestone's, the day it was declared. */
  day: string
  /** For a stage: the stage declared. */
  stage?: number
  /** For a milestone: its details, as you wrote them. */
  note?: string
  at: string
}

export type ReflectionKind = 'values' | 'decide' | 'reflection' | 'monthly'
/** The steps a decide-don't-slide note is written before; introducing a partner to your child is one (2026-09-23). */
export type PartnerStep = 'exclusive' | 'families' | 'child' | 'movingIn' | 'engagement'
export const PARTNER_STEPS: readonly PartnerStep[] = ['exclusive', 'families', 'child', 'movingIn', 'engagement']
/** The values note's three parts, and the monthly reflection's three (2026-09-23); the catalogue names and prompts each. */
export type ValuesPart = 'nonNegotiables' | 'preferences' | 'partnerIWantToBe'
export type MonthlyPart = 'understood' | 'disagreement' | 'ownPart'
export const VALUES_PARTS: readonly ValuesPart[] = ['nonNegotiables', 'preferences', 'partnerIWantToBe']
export const MONTHLY_PARTS: readonly MonthlyPart[] = ['understood', 'disagreement', 'ownPart']

/**
 * A private note on a path (Part 27), typed and read by you: your values in three parts, a
 * decide-don't-slide note before a step, a reflection on a date, an experience or a person, or a
 * part of the monthly reflection. Kept whole in the record; exported only when ticked.
 */
export interface Reflection {
  id?: number
  path: PathId
  kind: ReflectionKind
  /** For a decide-don't-slide note: the step it is written before. */
  step?: PartnerStep
  /** For the values note or the monthly reflection: which of its parts. A values note written before the parts has none. */
  part?: ValuesPart | MonthlyPart
  day: string
  text: string
  createdAt: string
  updatedAt: string
}

/**
 * The monthly private check (Part 27): three questions about your own safety, your own conduct and
 * a doubt you keep setting aside, yes or no, once a month. A yes to the first or second shows the
 * app's own fixed help inside the check; nothing here rates anyone.
 */
export interface MonthlyCheck {
  id?: number
  /** YYYY-MM: one check a month, answered again in place. */
  month: string
  day: string
  answers: { safety: boolean | null; conduct: boolean | null; doubt: boolean | null }
  at: string
}

/** A skill from the checklists you chose to watch (Phase F). Its rung moves only by your tap; no count moves it. */
export interface HerSkill {
  skillId: string
  rung: HerRung
  addedAt: string
  rungAt: string
  archivedAt: string | null
}

/** One moment with her, dated: on its own, or one skill she did and how much help she needed. */
export interface Moment {
  id?: number
  day: string
  at: string
  skillId: string | null
  help: HelpLevel | null
}

class LifeMirrorDB extends Dexie {
  herSkills!: Table<HerSkill, string>
  moments!: Table<Moment, number>
  declarations!: Table<Declaration, number>
  forecasts!: Table<Forecast, number>
  forecastScores!: Table<ForecastScore, number>
  anchorSwaps!: Table<AnchorSwap, number>
  beliefs!: Table<BeliefRow, [string, string]>
  tagBeliefs!: Table<TagBeliefRow, string>
  derived!: Table<Derived, string>
  outbox!: Table<OutboxRow, number>
  cloudRows!: Table<CloudRowState, [string, string]>
  cloudMeta!: Table<CloudMeta, string>
  checkins!: Table<CheckIn, number>
  settings!: Table<Settings, number>
  wins!: Table<Win, number>
  privateItems!: Table<PrivateItem, number>
  offers!: Table<Offer, number>
  cards!: Table<Card, number>
  outcomes!: Table<Outcome, number>
  days!: Table<DayContext, string>
  outside!: Table<OutsideDay, string>
  studyNights!: Table<StudyNight, number>
  aims!: Table<Aim, number>
  skills!: Table<Skill, number>
  rungMarks!: Table<RungMark, number>
  intentions!: Table<Intention, number>
  facts!: Table<FactsRow, string>
  briefLog!: Table<BriefLog, number>
  briefFeedback!: Table<BriefFeedback, number>
  brainBriefs!: Table<BrainBrief, string>
  brainPrefs!: Table<BrainPrefs, string>
  brainReads!: Table<BrainRead, string>
  coachPicks!: Table<CoachPick, string>
  pathMarks!: Table<PathMark, number>
  reflections!: Table<Reflection, number>
  monthlyChecks!: Table<MonthlyCheck, number>
  useLog!: Table<UseRow, number>
  places!: Table<KnownPlace, number>
  placeCandidates!: Table<PlaceCandidate, number>
  placeMeta!: Table<PlaceMeta, string>
  coachAsks!: Table<CoachAsk, number>
  coachProposals!: Table<CoachProposal, string>
  constructor() {
    // Every write is flushed to disk before it counts. The browser's default lets a write sit
    // acknowledged but unflushed, the one way a committed record can still be gone after the
    // process is killed; the records here are small and rare enough that the cost is nothing.
    super('life-mirror', { chromeTransactionDurability: 'strict' })
    this.version(1).stores({ checkins: '++id, &[day+block], day, completedAt' })
    this.version(2).stores({
      checkins: '++id, &[day+block], day, completedAt',
      settings: 'id',
      wins: '++id, &forDay',
      privateItems: '++id, archived',
    })
    this.version(3).stores({
      checkins: '++id, &[day+block], day, completedAt',
      settings: 'id',
      wins: '++id, &forDay',
      privateItems: '++id, archived',
      offers: '++id, day, situationKey, moveId, closedAt',
      cards: '++id, situationKey, moveId',
      outcomes: '++id, offerId, day, moveId',
      days: 'day',
      studyNights: '++id, day',
    })
    this.version(4).stores({
      checkins: '++id, &[day+block], day, completedAt',
      settings: 'id',
      wins: '++id, &forDay',
      privateItems: '++id, archived',
      offers: '++id, day, situationKey, moveId, closedAt',
      cards: '++id, situationKey, moveId',
      outcomes: '++id, offerId, day, moveId',
      days: 'day',
      studyNights: '++id, day',
      aims: '++id, kind',
      skills: '++id, order',
      rungMarks: '++id, skillId, at',
    })
    // Phase 8: the outbox every change is queued to, what the cloud copy knows of each row, and the sync state.
    this.version(5).stores({
      checkins: '++id, &[day+block], day, completedAt',
      settings: 'id',
      wins: '++id, &forDay',
      privateItems: '++id, archived',
      offers: '++id, day, situationKey, moveId, closedAt',
      cards: '++id, situationKey, moveId',
      outcomes: '++id, offerId, day, moveId',
      days: 'day',
      studyNights: '++id, day',
      aims: '++id, kind',
      skills: '++id, order',
      rungMarks: '++id, skillId, at',
      outbox: '++id, [store+key]',
      cloudRows: '[store+key]',
      cloudMeta: 'key',
    })
    // Phase 10: declarations are records; beliefs and tag beliefs are derived once a day.
    this.version(6).stores({
      checkins: '++id, &[day+block], day, completedAt',
      settings: 'id',
      wins: '++id, &forDay',
      privateItems: '++id, archived',
      offers: '++id, day, situationKey, moveId, closedAt',
      cards: '++id, situationKey, moveId',
      outcomes: '++id, offerId, day, moveId',
      days: 'day',
      studyNights: '++id, day',
      aims: '++id, kind',
      skills: '++id, order',
      rungMarks: '++id, skillId, at',
      outbox: '++id, [store+key]',
      cloudRows: '[store+key]',
      cloudMeta: 'key',
      declarations: '++id, cardId',
      beliefs: '[situationKey+moveId], moveId',
      tagBeliefs: 'id',
      derived: 'key',
    })
    // Phase 11: forecasts and their scores are records, never rewritten.
    this.version(7).stores({
      checkins: '++id, &[day+block], day, completedAt',
      settings: 'id',
      wins: '++id, &forDay',
      privateItems: '++id, archived',
      offers: '++id, day, situationKey, moveId, closedAt',
      cards: '++id, situationKey, moveId',
      outcomes: '++id, offerId, day, moveId',
      days: 'day',
      studyNights: '++id, day',
      aims: '++id, kind',
      skills: '++id, order',
      rungMarks: '++id, skillId, at',
      outbox: '++id, [store+key]',
      cloudRows: '[store+key]',
      cloudMeta: 'key',
      declarations: '++id, cardId',
      beliefs: '[situationKey+moveId], moveId',
      tagBeliefs: 'id',
      derived: 'key',
      forecasts: '++id, &[day+block+horizon], day',
      forecastScores: '++id, &[day+block+horizon], day',
    })
    // Phase 12: anchor swaps are records, logged and dated.
    this.version(8).stores({
      checkins: '++id, &[day+block], day, completedAt',
      settings: 'id',
      wins: '++id, &forDay',
      privateItems: '++id, archived',
      offers: '++id, day, situationKey, moveId, closedAt',
      cards: '++id, situationKey, moveId',
      outcomes: '++id, offerId, day, moveId',
      days: 'day',
      studyNights: '++id, day',
      aims: '++id, kind',
      skills: '++id, order',
      rungMarks: '++id, skillId, at',
      outbox: '++id, [store+key]',
      cloudRows: '[store+key]',
      cloudMeta: 'key',
      declarations: '++id, cardId',
      beliefs: '[situationKey+moveId], moveId',
      tagBeliefs: 'id',
      derived: 'key',
      forecasts: '++id, &[day+block+horizon], day',
      forecastScores: '++id, &[day+block+horizon], day',
      anchorSwaps: '++id, reading',
    })
    // Phase F: her skills, keyed by the checklist id, and the moments with her.
    this.version(9).stores({
      checkins: '++id, &[day+block], day, completedAt',
      settings: 'id',
      wins: '++id, &forDay',
      privateItems: '++id, archived',
      offers: '++id, day, situationKey, moveId, closedAt',
      cards: '++id, situationKey, moveId',
      outcomes: '++id, offerId, day, moveId',
      days: 'day',
      studyNights: '++id, day',
      aims: '++id, kind',
      skills: '++id, order',
      rungMarks: '++id, skillId, at',
      outbox: '++id, [store+key]',
      cloudRows: '[store+key]',
      cloudMeta: 'key',
      declarations: '++id, cardId',
      beliefs: '[situationKey+moveId], moveId',
      tagBeliefs: 'id',
      derived: 'key',
      forecasts: '++id, &[day+block+horizon], day',
      forecastScores: '++id, &[day+block+horizon], day',
      anchorSwaps: '++id, reading',
      herSkills: 'skillId',
      moments: '++id, day, skillId',
    })
    // Outside days: the other app's finished workouts, read from the cloud copy and never synced from here.
    this.version(10).stores({
      outside: 'id, day',
    })
    // A cue tapped for a step: when you mean to do it today; kept when the step is started.
    this.version(11).stores({
      intentions: '++id, aimId, day',
    })
    // The brain: the day's facts as a record, the phone's own lines and the taps under them, and the Worker's lines read from the cloud copy.
    this.version(12).stores({
      facts: 'day',
      briefLog: '++id, day',
      briefFeedback: '++id, day, briefKey',
      brainBriefs: 'id, day',
    })
    // Part 27: the Partner path's own record: declarations, private notes, and the monthly check.
    this.version(13).stores({
      pathMarks: '++id, path, kind, day',
      reflections: '++id, path, kind, day',
      monthlyChecks: '++id, &month',
    })
    // Part 30: the Brain settings, synced; and what Claude read, pulled from the brain's own rows and never synced from here.
    this.version(14).stores({
      brainPrefs: 'id',
      brainReads: 'id, day',
    })
    // Part 32: the coach's pick for the day, pulled from the brain's own rows and never synced from here.
    this.version(15).stores({
      coachPicks: 'id, day',
    })
    // Part 34: how the app is used; synced with the record since Follow-up F1.
    this.version(16).stores({
      useLog: '++id, day, kind',
    })
    // Part 43: places you named and places being learned, and this phone's key for them: on this phone alone, never synced.
    this.version(17).stores({
      places: '++id, kind',
      placeCandidates: '++id, lastDay',
      placeMeta: 'key',
    })
    // Parts 40 and 41: what you asked the skill coach, synced; what it proposed, read from the brain's rows. Empty while their gate is closed.
    this.version(18).stores({
      coachAsks: '++id, aimId, kind, day',
      coachProposals: 'id, aimId, askId',
    })
    installOutbox(this)
  }
}

export const db = new LifeMirrorDB()

export function askedOf(c: Pick<CheckIn, 'block' | 'asked'>): readonly ReadingId[] {
  return c.asked ?? blockReadings(c.block)
}

export function isComplete(c: Pick<CheckIn, 'block' | 'asked' | 'answers'>): boolean {
  return askedOf(c).every((id) => c.answers[id] !== undefined)
}

export function answeredCount(c: Pick<CheckIn, 'block' | 'asked' | 'answers'>): number {
  return askedOf(c).filter((id) => c.answers[id] !== undefined).length
}

/** The check-in for a slot, or null when none has been started. */
export async function getCheckIn(day: string, block: Block): Promise<CheckIn | null> {
  return (await db.checkins.where('[day+block]').equals([day, block]).first()) ?? null
}

function newCheckIn(slot: Slot, asked: readonly ReadingId[], now: string): CheckIn {
  return { day: slot.day, block: slot.block, asked: [...asked], startedAt: now, completedAt: null, updatedAt: now, answers: {}, activeMs: 0 }
}

export function saveAnswer(slot: Slot, asked: readonly ReadingId[], readingId: ReadingId, position: Position, activeMsDelta: number): Promise<CheckIn> {
  return db.transaction('rw', db.checkins, async () => {
    const now = new Date().toISOString()
    const rec = (await getCheckIn(slot.day, slot.block)) ?? newCheckIn(slot, asked, now)
    rec.answers = { ...rec.answers, [readingId]: position }
    rec.activeMs += Math.max(0, Math.round(activeMsDelta))
    rec.updatedAt = now
    if (isComplete(rec)) rec.completedAt ??= now
    rec.id = await db.checkins.put(rec)
    return rec
  })
}

export function clearAnswer(slot: Slot, readingId: ReadingId): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const rec = await getCheckIn(slot.day, slot.block)
    if (!rec) return
    const answers = { ...rec.answers }
    delete answers[readingId]
    await db.checkins.put({ ...rec, answers, completedAt: null, updatedAt: new Date().toISOString() })
  })
}

export function deleteCheckIn(id: number): Promise<void> {
  return db.checkins.delete(id)
}

/** Every check-in, newest slot first. */
export async function allCheckIns(): Promise<CheckIn[]> {
  const all = await db.checkins.toArray()
  return all.sort((a, b) => compareSlots(b, a))
}

/** The most recent completed check-in in a slot before the given one, or null. */
export async function previousCompleted(day: string, block: Block): Promise<CheckIn | null> {
  const all = await db.checkins.filter((c) => c.completedAt !== null).toArray()
  const before = all.filter((c) => compareSlots(c, { day, block }) < 0).sort((a, b) => compareSlots(b, a))
  return before[0] ?? null
}

// Evening extras: recorded on the evening check-in, one tap each, only when tapped.

export function setExtra(slot: Slot, asked: readonly ReadingId[], key: ExtraKey, on: boolean): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const now = new Date().toISOString()
    const rec = (await getCheckIn(slot.day, slot.block)) ?? newCheckIn(slot, asked, now)
    const extras: Extras = { ...(rec.extras ?? {}) }
    if (on) extras[key] = true
    else delete extras[key]
    rec.extras = extras
    rec.updatedAt = now
    rec.id = await db.checkins.put(rec)
  })
}

/**
 * Caffeine for a check-in's window (Part 21): the band, when it was tapped, and when the window
 * began. Tapping the same band again clears it (Rule 13). Nothing is ever written as zero.
 */
export function setCaffeine(slot: Slot, asked: readonly ReadingId[], band: CaffeineBand | null, now: Date = new Date()): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const at = now.toISOString()
    const rec = (await getCheckIn(slot.day, slot.block)) ?? newCheckIn(slot, asked, at)
    const extras: Extras = { ...(rec.extras ?? {}) }
    if (band === null) delete extras.caffeineIntake
    else {
      const earlier = (await db.checkins.where('day').equals(slot.day).toArray())
        .filter((c) => c.completedAt && blockIndex(c.block) < blockIndex(slot.block))
        .sort((a, b) => blockIndex(b.block) - blockIndex(a.block))[0]
      extras.caffeineIntake = { band, at, since: earlier?.completedAt ?? null }
    }
    extras.caffeineShown = true
    rec.extras = extras
    rec.updatedAt = at
    rec.id = await db.checkins.put(rec)
  })
}

/** The Caffeine item was on screen for this check-in: written once, on the check-in's own day, and only to a check-in that exists. */
export function markCaffeineShown(slot: Slot): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const rec = await getCheckIn(slot.day, slot.block)
    if (!rec || rec.extras?.caffeineShown) return
    rec.extras = { ...(rec.extras ?? {}), caffeineShown: true }
    rec.updatedAt = new Date().toISOString()
    await db.checkins.put(rec)
  })
}

/** The one optional line at the end of the evening; an empty line removes it. */
export function setNote(slot: Slot, asked: readonly ReadingId[], text: string): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const now = new Date().toISOString()
    const rec = (await getCheckIn(slot.day, slot.block)) ?? newCheckIn(slot, asked, now)
    const extras: Extras = { ...(rec.extras ?? {}) }
    const trimmed = text.trim()
    if (trimmed) extras.note = trimmed
    else delete extras.note
    rec.extras = extras
    rec.updatedAt = now
    rec.id = await db.checkins.put(rec)
  })
}

/** The necessities signal: a tap marks a miss for the day; a second tap takes it back. */
export function setNecessity(slot: Slot, asked: readonly ReadingId[], key: NecessityKey, missed: boolean): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const now = new Date().toISOString()
    const rec = (await getCheckIn(slot.day, slot.block)) ?? newCheckIn(slot, asked, now)
    const necessities: Necessities = { ...(rec.extras?.necessities ?? {}) }
    if (missed) necessities[key] = true
    else delete necessities[key]
    rec.extras = { ...(rec.extras ?? {}), necessities }
    rec.updatedAt = now
    rec.id = await db.checkins.put(rec)
  })
}

export function setPrivateLogged(slot: Slot, asked: readonly ReadingId[], itemId: number, on: boolean): Promise<void> {
  return db.transaction('rw', db.checkins, async () => {
    const now = new Date().toISOString()
    const rec = (await getCheckIn(slot.day, slot.block)) ?? newCheckIn(slot, asked, now)
    const logged: Record<string, true> = { ...(rec.extras?.private ?? {}) }
    if (on) logged[String(itemId)] = true
    else delete logged[String(itemId)]
    rec.extras = { ...(rec.extras ?? {}), private: logged }
    rec.updatedAt = now
    rec.id = await db.checkins.put(rec)
  })
}

// Settings

export async function getSettings(): Promise<Settings> {
  return withDefaults(await db.settings.get(1))
}

export function updateSettings(change: (s: Settings) => Settings): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const next: Settings = { ...change(await getSettings()), id: 1, updatedAt: new Date().toISOString() }
    await db.settings.put(next)
    return next
  })
}

export function markReminded(day: string, block: Block): Promise<Settings> {
  return updateSettings((s) => {
    const kept = Object.fromEntries(Object.entries(s.reminded).filter(([k]) => k.startsWith(day)))
    return { ...s, reminded: { ...kept, [remindedKey(day, block)]: true as const } }
  })
}

// Each day's context, from the week's shape

export async function getDayContext(day: string): Promise<DayContext | null> {
  return (await db.days.get(day)) ?? null
}

/** A day's context from the week's shape in Settings: pure, written nowhere. The one function that shapes a day. */
export function contextFromWeek(day: string, settings: Settings, createdAt: string = new Date().toISOString()): DayContext {
  const weekday = parseDay(day).getDay() as Weekday
  const w = settings.week
  const where = sunPlace(settings)
  const light = where ? sunLocal(day, where.place) : null
  return {
    day,
    weekday,
    withHer: w.livesWithMe,
    studyNight: w.studyNights[weekday],
    churchDay: w.churchDay === weekday,
    atOffice: w.officeDays[weekday],
    // The pickup, and the daycare day it implies, hold on the daycare days you set.
    pickupTime: w.daycareDays[weekday] ? w.pickupTime : null,
    soloUntil: w.soloUntil,
    ...(light ? { light } : {}),
    changed: false,
    createdAt,
  }
}

/** Writes today's context from the week's shape the first time the day is seen; later shape edits never touch it. */
export function ensureDayContext(day: string, settings: Settings): Promise<DayContext> {
  return db.transaction('rw', db.days, async () => {
    const existing = await db.days.get(day)
    if (existing) return existing
    const ctx = contextFromWeek(day, settings)
    await db.days.put(ctx)
    return ctx
  })
}

/** Changes today alone. */
export function setDayContext(day: string, patch: Partial<Pick<DayContext, 'withHer' | 'studyNight' | 'churchDay' | 'atOffice'>>): Promise<void> {
  return db.transaction('rw', db.days, async () => {
    const existing = await db.days.get(day)
    if (!existing) return
    await db.days.put({ ...existing, ...patch, changed: true })
  })
}

// Tomorrow's minimum win

export async function winFor(day: string): Promise<Win | null> {
  return (await db.wins.where('forDay').equals(day).first()) ?? null
}

/** Sets the one line for a day; an empty line removes it. */
export function setWin(forDay: string, setOn: string, text: string): Promise<void> {
  return db.transaction('rw', db.wins, async () => {
    const now = new Date().toISOString()
    const existing = await winFor(forDay)
    const trimmed = text.trim()
    if (!trimmed) {
      if (existing?.id !== undefined) await db.wins.delete(existing.id)
      return
    }
    if (existing) await db.wins.put({ ...existing, text: trimmed, updatedAt: now })
    else await db.wins.add({ forDay, setOn, text: trimmed, outcome: null, answeredAt: null, updatedAt: now })
  })
}

export function allWins(): Promise<Win[]> {
  return db.wins.toArray()
}

export function answerWin(forDay: string, outcome: WinOutcome | null): Promise<void> {
  return db.transaction('rw', db.wins, async () => {
    const existing = await winFor(forDay)
    if (!existing) return
    const now = new Date().toISOString()
    await db.wins.put({ ...existing, outcome, answeredAt: outcome ? now : null, updatedAt: now })
  })
}

// Private items: named here, measured like anything else, shown nowhere else unless chosen.

export function privateItems(): Promise<PrivateItem[]> {
  return db.privateItems.where('archived').equals(0).toArray()
}

export async function addPrivateItem(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.privateItems.add({ name: trimmed, createdAt: new Date().toISOString(), archived: 0 })
}

export async function archivePrivateItem(id: number): Promise<void> {
  await db.privateItems.update(id, { archived: 1 })
}

/** Everything on this phone, gone; the cloud copy's rows are deleted first by the Data screen. Nothing comes back. */
export function wipeEverything(): Promise<void> {
  return db.transaction('rw', [db.checkins, db.wins, db.privateItems, db.settings, db.offers, db.cards, db.outcomes, db.days, db.studyNights, db.aims, db.skills, db.rungMarks, db.intentions, db.facts, db.briefLog, db.briefFeedback, db.brainBriefs, db.outbox, db.cloudRows, db.outside, db.cloudMeta, db.declarations, db.beliefs, db.tagBeliefs, db.derived, db.forecasts, db.forecastScores, db.anchorSwaps, db.herSkills, db.moments, db.pathMarks, db.reflections, db.monthlyChecks, db.brainPrefs, db.brainReads, db.coachPicks, db.useLog, db.places, db.placeCandidates, db.placeMeta], async () => {
    // The wipe writes nothing to the outbox: the cloud rows are deleted directly, before this runs.
    markSilent()
    await Promise.all([
      db.outbox.clear(),
      db.cloudRows.clear(),
      db.cloudMeta.clear(),
      db.declarations.clear(),
      db.forecasts.clear(),
      db.forecastScores.clear(),
      db.anchorSwaps.clear(),
      db.beliefs.clear(),
      db.tagBeliefs.clear(),
      db.derived.clear(),
      db.outside.clear(),
      db.checkins.clear(),
      db.wins.clear(),
      db.privateItems.clear(),
      db.settings.clear(),
      db.offers.clear(),
      db.cards.clear(),
      db.outcomes.clear(),
      db.days.clear(),
      db.studyNights.clear(),
      db.aims.clear(),
      db.skills.clear(),
      db.rungMarks.clear(),
      db.intentions.clear(),
      db.facts.clear(),
      db.briefLog.clear(),
      db.briefFeedback.clear(),
      db.brainBriefs.clear(),
      db.herSkills.clear(),
      db.moments.clear(),
      db.pathMarks.clear(),
      db.reflections.clear(),
      db.monthlyChecks.clear(),
      db.brainPrefs.clear(),
      db.brainReads.clear(),
      db.coachPicks.clear(),
      db.useLog.clear(),
      db.places.clear(),
      db.placeCandidates.clear(),
      db.placeMeta.clear(),
    ])
  })
}
