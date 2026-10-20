import type { Fact, FactSheet } from './factTypes'
import { allowedFirmness, deliverySignals, firmnessRefusal, isFirmness, isFirmnessPref, isPatternFact, type DeliverySignals, type Firmness, type FirmnessPref } from './firmness'
import type { ClaimCard, Grade } from './libraryTypes'
import { clockTimesWritten, withoutClockTimes } from './format'
import { isUsageFact } from './useShared'

// What the brain may say, checked the same way on the phone and in the Worker: one of the
// modes, grounded in facts named by id, every number taken from those facts, no evidence
// claimed beyond the cited cards' grade, none of Rule 4's verdict words, and short. A line may
// carry one action from a closed set, which the sheet must make possible; the weekly review is
// three short parts held to the same rules.

export type Mode = 'observation' | 'challenge' | 'perspective' | 'strategy' | 'warning' | 'recommendation' | 'encouragement'
export const MODES: readonly Mode[] = ['observation', 'challenge', 'perspective', 'strategy', 'warning', 'recommendation', 'encouragement']

/** Rule 4 of the plan: a reading, never a verdict. The same list the copy test enforces. */
export const BANNED_WORDS: readonly string[] = ['failed', 'bad', 'lazy', 'behind', 'weak', 'slipped again']

export const MAX_WORDS = 60

/**
 * Rating and outcome language (Parts 23, 26 and 27): no path text, and no line that cites a path
 * fact, rates a person or counts an outcome as success. A negation is guard language ("never
 * rated", "not counted"), so it is struck out before the test. The catalogue's lexical test reads
 * these same two lists.
 */
export const OUTCOME_WORDS = /\b(rate|rates|rating|rated|score|scores|scored|scoring|rank|ranks|ranking|ranked|success|successful|succeed|succeeded|win|wins|won|conquest|matches|reply rate|attractive|attractiveness|hot|league|mate value|close the deal|pulled)\b|number of (dates|women|men|people)/i
export const NEGATED_OUTCOME = /\b(never|not|no)\s+(rate|rates|rated|rating|scored|ranked|counted)\b/gi

/** Whether a text rates a person or counts an outcome, once its negations are struck out. */
export function speaksOfOutcomes(text: string): boolean {
  return OUTCOME_WORDS.test(text.replace(NEGATED_OUTCOME, ''))
}

/** A fact about a path: its stage and reps, or the Partner path's date day. */
export function isPathFact(id: string): boolean {
  return id.startsWith('path.') || id.startsWith('partner.')
}

/**
 * The repeat check (Part 28), deterministic: a line sharing at least this share of its content
 * words with a line said on one of the last seven days is a near-repeat. Engineering judgment:
 * an echo with a few words changed is caught; the same subject from a new angle is not.
 */
export const REPEAT_OVERLAP = 0.6
const REPEAT_STOP = new Set(['the', 'and', 'for', 'you', 'your', 'that', 'this', 'with', 'was', 'are', 'but', 'not', 'have', 'has', 'had', 'from', 'its', 'one', 'can', 'will', 'into', 'than', 'then', 'what', 'when', 'where', 'which', 'who', 'about', 'there', 'their', 'they', 'them', 'been', 'were', 'more', 'just', 'still', 'today', 'yesterday', 'tonight', 'now'])

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[’']/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !REPEAT_STOP.has(w)),
  )
}

/** The day of the line this one nearly repeats, or null. The caller passes the lines of the days to check against. */
export function nearRepeat(text: string, recent: readonly { day: string; text: string }[]): string | null {
  const a = contentWords(text)
  if (!a.size) return null
  for (const r of recent) {
    const b = contentWords(r.text)
    if (!b.size) continue
    let shared = 0
    for (const w of a) if (b.has(w)) shared++
    if (shared / (a.size + b.size - shared) >= REPEAT_OVERLAP) return r.day
  }
  return null
}
export const REVIEW_PART_WORDS = 45

/**
 * What Claude may say it lacked for a line or the week's review (Part 34): a fixed list, counted
 * on the phone and nothing more. It never reaches the line and never refuses one; anything off the
 * list is dropped.
 */
export const LACKED = ['longerRecord', 'workoutDetail', 'sleepDetail', 'dayPlans', 'reasons', 'outcomes', 'notes', 'people', 'other'] as const
export type Lacked = (typeof LACKED)[number]
export const MAX_LACKED = 3

/** What each id means, as the writer is told. */
export const LACKED_MEANS: Readonly<Record<Lacked, string>> = {
  longerRecord: 'more days of record than exist yet',
  workoutDetail: 'what a workout was, beyond that the day had one',
  sleepDetail: 'sleep beyond the two sleep readings',
  dayPlans: 'what the day held: plans, events, who was coming',
  reasons: 'why a step or a move was not done',
  outcomes: 'whether a move or a step helped',
  notes: 'your own notes',
  people: 'who was around',
  other: 'something not on this list',
}

/** The ids a writer named, known ones only, each once, at most three; anything else is dropped, never refused. */
export function lackedOf(v: unknown): Lacked[] {
  if (!Array.isArray(v)) return []
  const out: Lacked[] = []
  for (const x of v) if (typeof x === 'string' && (LACKED as readonly string[]).includes(x) && !out.includes(x as Lacked)) out.push(x as Lacked)
  return out.slice(0, MAX_LACKED)
}

export type LineCue = 'afterPickup' | 'afterBedtime' | 'nextCheckIn'
export const LINE_CUES: readonly LineCue[] = ['afterPickup', 'afterBedtime', 'nextCheckIn']

/**
 * The writer model (Part 30): the four values the Agent tool's `model` parameter accepts, read
 * from its own refusal in the bridge proof (Part 29), in the order of the Brain screen's chips,
 * starting on Opus. The phone, the Worker and the routine's instruction file each check a value
 * against this list before using it; `best` is not one.
 */
export const WRITER_MODELS = ['opus', 'fable', 'sonnet', 'haiku'] as const
export type WriterModel = (typeof WRITER_MODELS)[number]

export function isWriterModel(v: unknown): v is WriterModel {
  return typeof v === 'string' && (WRITER_MODELS as readonly string[]).includes(v)
}

/**
 * What Claude may read (Part 30, Rule 21 as amended 2026-09-23), one switch each on the Brain
 * screen, every one on by default and each the owner's to turn off. The retrieval layer's other
 * categories are not switches: the fact sheet's frame, the coach's decision core, and tier 2.
 * `usage` (Follow-up F1) governs how Life Mirror is used: its counts and, for the weekly review
 * alone, a short slice of its events. `location` (Part 43) governs where the day's parts were spent,
 * as kinds of place. `journal` (Let it out, agreed 2026-10-15, adjustment 1) governs the nightly
 * journal: its own switch, apart from the check-in notes, so the most sensitive text has its own control.
 */
export const BRAIN_SWITCHES = ['dayRecord', 'notes', 'journal', 'privateItems', 'commitments', 'socialPath', 'partnerPath', 'reflections', 'monthlyCheck', 'her', 'faith', 'brainHistory', 'usage', 'location'] as const
export type BrainSwitch = (typeof BRAIN_SWITCHES)[number]

/**
 * Follow-up F1 (2026-09-24): whether Claude may be given how Life Mirror is used at all. Gated while
 * the reliability monitoring runs (2026-09-24 to 2026-09-28, then the ten-day check to 2026-10-04):
 * giving it would change the monitored prompts and their size. Collection goes on meanwhile. Opened
 * only at the owner's word once monitoring is complete; the phone and the Worker read this one value.
 */
export const USAGE_TO_CLAUDE: 'gated' | 'open' = 'open'

/**
 * Part 43 (2026-09-24): whether Claude may be given where the day's parts were spent (kinds of place,
 * never coordinates). Gated for the same reason and on the same terms as usage: it would change the
 * monitored prompts. Location Context still records on the phone, for you and for the sun.
 */
export const LOCATION_TO_CLAUDE: 'gated' | 'open' = 'open'

/** Location facts on the sheet: all of them are the location category's, and nothing else is. */
export function isLocationFact(id: string): boolean {
  return id.startsWith('location.')
}

/** Stage 3, group 1: the Brain's memory of its own lines, one fact a line seen in the last 30 days. Claude's alone, never the free chain's. */
export function isMemoryFact(id: string): boolean {
  return id.startsWith('memory.')
}

/** Stage 3, group 1: the weekly view's analyses, for the Sunday review alone. Claude's alone, never the free chain's. */
export function isWeeklyFact(id: string): boolean {
  return id.startsWith('weekly.')
}

/**
 * Stage 3, item 6: the day's weather from Open-Meteo, while its switch is on, and the comparisons of rainy and dry days,
 * sunnier and greyer ones. Values only, never the area. Claude's alone, never the free chain's.
 */
export function isWeatherFact(id: string): boolean {
  return id.startsWith('weather.') || id.startsWith('assoc.weather.')
}

/** The Brain settings, as the phone syncs them in the one row `brainPrefs`. */
export interface BrainPrefsBody {
  writerModel: WriterModel
  /** Only switches turned off are kept; a switch not named is on. */
  switches: Partial<Record<BrainSwitch, false>>
  /** How firm (Pass 2): kept only once chosen; unset reads as Adaptive. Nothing reads it while its gate is closed. */
  firmness?: FirmnessPref
}

/** The Brain settings read the same way on the phone and in the Worker: an unknown or missing model is Opus, a switch is off only when it says so, anything else is dropped. */
export function readBrainPrefs(raw: unknown): BrainPrefsBody {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const s = o.switches && typeof o.switches === 'object' ? (o.switches as Record<string, unknown>) : {}
  const switches: Partial<Record<BrainSwitch, false>> = {}
  for (const k of BRAIN_SWITCHES) if (s[k] === false) switches[k] = false
  return { writerModel: isWriterModel(o.writerModel) ? o.writerModel : 'opus', switches, ...(isFirmnessPref(o.firmness) ? { firmness: o.firmness } : {}) }
}

/**
 * The one tap a line may offer, so advice can be acted on where it is read: pin a commitment's
 * step to a cue today, make the check-in lighter, or set a test the record has never run.
 * Nothing else; the phone checks again at the tap that it is still possible.
 */
/**
 * The one tap a line may offer. A test carries what it tests (item 6): the reading and the part of
 * the day, as the untested fact says that move can be tested; absent only on taps from before.
 */
export type LineAction = { kind: 'plan'; aimId: number; cue: LineCue } | { kind: 'depth'; value: 'short' } | { kind: 'test'; moveId: string; reading?: string; block?: LineBlock }

/** A part of the day, as a test names it. */
export type LineBlock = 'morning' | 'afternoon' | 'evening'

/** What the untested fact says a move can be tested on (item 6): the readings a test can measure among its targets, and the parts of the day it fits. */
export function testsOf(sheet: FactSheet, moveId: string): { readings: string[]; blocks: string[] } | null {
  const spec = sheet.facts.find((f) => f.id === 'untested')?.values[`tests_${moveId}`]
  if (typeof spec !== 'string') return null
  const [readings, blocks] = spec.split('@')
  return { readings: (readings ?? '').split(',').filter(Boolean), blocks: (blocks ?? '').split(',').filter(Boolean) }
}

export interface BrainOutput {
  mode: Mode
  text: string
  factIds: string[]
  cardIds: string[]
  action: LineAction | null
  /** How firmly it was said (Pass 2), once its gate is open. */
  firmness?: Firmness
}

export interface ReviewOutput {
  held: string
  didNot: string
  change: string
  /** One follow-up question from what was written (the journal, agreed 2026-10-15): only where the journal may be read. */
  question?: string
  factIds: string[]
  cardIds: string[]
  firmness?: Firmness
}

/** How firm (Pass 2): the check a writer's answer passes once the gate is open. Absent while it is closed, and nothing is checked. */
export interface FirmCheck {
  pref: FirmnessPref
}

export type Validation = { ok: true; value: BrainOutput } | { ok: false; reason: string }
export type ReviewValidation = { ok: true; value: ReviewOutput } | { ok: false; reason: string }
export type ActionValidation = { ok: true; value: LineAction | null } | { ok: false; reason: string }

const GRADE_ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 }
/** The phrases a grade may be spoken as; a stronger phrase than the cited cards allow is refused. */
export const GRADE_PHRASES: Record<Grade, string> = { A: 'strong evidence', B: 'good evidence', C: 'some evidence', D: 'thin evidence' }
const EVIDENCE_WORDS = /\b(evidence|research|studies|study shows|meta-analys|trials?)\b/i
const CAFFEINE_FREE = /\bcaffeine[- ]free\b|\bno caffeine\b(?! (?:was )?reported)/i
const CAFFEINE_WORDS = /\b(caffeine|coffee|espresso|energy drinks?|pre-workout|\d+ ?mg)\b/i
export const CAUSAL_WORDS = /\bcaus(?:e|es|ed|ing)\b|\bbecause of\b|\baffect(?:s|ed|ing)?\b/i

/**
 * Usage is evidence, never an explanation (Follow-up F1). A line that cites how the app was used may
 * say what was observed, and may offer a reason about the app or the moment only as a possibility
 * to test. A verdict on the person is never said, hedged or not.
 */
export const USAGE_VERDICT = /\b(lazy|laziness|lack(?:s|ed|ing)? (?:of )?(?:motivation|discipline|willpower|interest|commitment)|unmotivated|(?:n['’]t|not) care|not interested|uninterested|can['’]?t be bothered|gave up|given up|giving up)\b/i
/** A reason or a cause given for how the app was used. */
export const USAGE_REASON = /\b(because|since you|as you|due to|so you|why you|avoid(?:s|ed|ing|ance)?|resist(?:s|ed|ing|ance)?|procrastinat\w*|forg[eo]t(?:s|ten|ting)?|ignor(?:e|es|ed|ing)|bored|boring|hate(?:s|d)?|dislike(?:s|d)?|motivation|motivated|caus(?:e|es|ed|ing)|affect(?:s|ed|ing)?|led to|leads to|makes? you)\b/i
/** Words that keep a reason a possibility to test. */
export const USAGE_HEDGE = /\b(may|might|could|perhaps|possibly|maybe|one possibility|a possibility|worth testing|to test|a guess|if so|whether)\b/i

/** Why a text about how the app was used may not be said, or null. */
export function usageRefusal(text: string): string | null {
  if (USAGE_VERDICT.test(text)) return 'passes a verdict on the person from how the app was used; say what was observed'
  if (USAGE_REASON.test(text) && !USAGE_HEDGE.test(text)) return 'gives a reason for how the app was used as a fact; say what was observed, or offer a reason as a possibility to test'
  return null
}

/**
 * A place is context, never a cause (Part 43): a line citing where the day was spent may say what went
 * with it, and a reason only as a possibility; a place said to cause a reading is refused.
 */
export const PLACE_CAUSE = /\b(because (?:of )?(?:you (?:were|are) )?(?:at )?(?:work|home|church|the office|a regular place|away)|(?:work|home|church|the office|being away) (?:makes?|made|causes?|caused|drains?|drained|lifts?|lifted|gives?|gave)|caus(?:e|es|ed|ing)|affect(?:s|ed|ing)?)\b/i

/**
 * The learning repair (the 16 requirements agreed 2026-10-10; the stress test passed by requirement 14's rule, 2026-10-19):
 * its engine draws the moves and makes the calls. Gated while it was built, stage by stage (R1–R5 and R4b); stage R6 opened
 * it, the Worker first, once every stage was verified. Shared with the Worker, whose facts follow it.
 */
export const LEARNING_REPAIR: 'gated' | 'open' = 'open'

/**
 * Ask Life Mirror (agreed 2026-10-11; built from 2026-10-19 in four stages, A1 to A4): the owner's own questions about
 * their record, answered from the same evidence the Brain reads. Gated while it is built; stage A4 opens it, the Worker
 * first, once every stage is verified. Shared with the Worker, which answers no ask while it is closed.
 */
export const ASK: 'gated' | 'open' = 'gated'

/**
 * Pass 4: how big a line says an effect is may not outrun its cards, and the record's own
 * comparisons are never said to have caused what happened. Gated, since it changes what the
 * monitored lines are refused for: it opens with the owner's word after the 2026-10-04 report.
 */
export const EVIDENCE_WORDING: 'gated' | 'open' = 'open'

/** Words that say an effect is large: a cited card whose effect is large must stand under them. */
export const LARGE_WORDS = /\b(greatly|dramatic(?:ally)?|huge(?:ly)?|massive(?:ly)?|vast(?:ly)?|enormous(?:ly)?|far (?:more|less|better|worse|fewer|higher|lower|greater)|much (?:more|less|better|worse|fewer|higher|lower|greater)|a lot (?:more|less|better|worse)|doubl(?:e|es|ed|ing)|tripl(?:e|es|ed|ing)|halv(?:e|es|ed|ing)|twice as|several times|(?<!(?:more|less|most|as) )strongly|a (?:large|big|huge|major|dramatic|powerful|strong) (?:effect|difference|change|gain|drop|boost|improvement|lift|benefit))\b/i
/** Words that say an effect is at least medium: a cited card whose effect is medium or large must stand under them. */
export const MEDIUM_WORDS = /\b(considerabl[ey]|marked(?:ly)?|substantial(?:ly)?|significantly|sizeable|a (?:moderate|medium|sizeable|marked|clear) (?:effect|difference|change|gain|drop|improvement|lift|benefit))\b/i
/**
 * A claim that something in the record caused what happened: a past cause aimed at you, a because about
 * you, a why, or a thing said to be what does it ("is what gets it done", "made the difference", "does the
 * trick", "is the key"; the owner's example at Pass 1B, 2026-10-16).
 */
export const RECORD_CAUSE = /\b(?:(?:made|kept|left|gave|cost|drained|sapped|lifted|raised|lowered|improved|boosted|hurt|harmed|helped|cut|pushed|dragged|ruined|wrecked|fixed|caused|affected|reduced|increased|worsened|spoiled|brought) (?:you|your)\b|because (?:you|your)\b|(?:that|this|which|it)(?:'s|’s| is| was) why\b|is why (?:you|your)\b|(?:led|due|thanks) to (?:you|your)\b|(?:\bis|\bwas|'s|’s) what (?:gets|got|keeps|kept|makes|made|does|did|works|worked|helps|helped|drives|drove|turns|turned)\b|\b(?:makes|made) (?:the|all the) difference\b|\b(?:does|did) the trick\b|(?:\bis|\bwas|'s|’s) the key\b)/i

/** The record's own comparisons, like for like and never randomised: an association, never a cause. The owner's test cards are randomised, and are not among them. */
export function isAssociationFact(id: string): boolean {
  return id.startsWith('assoc.') || id.startsWith('private.')
}

const SIZE_RANK: Record<NonNullable<ClaimCard['size']>, number> = { medium: 1, large: 2 }

/** Why a text's size or cause words outrun its evidence, or null (Pass 4). */
export function evidenceWordingRefusal(text: string, factIds: readonly string[], cards: readonly Pick<ClaimCard, 'size'>[]): string | null {
  const best = cards.reduce((m, c) => Math.max(m, c.size ? SIZE_RANK[c.size] : 0), 0)
  const large = LARGE_WORDS.exec(text)
  if (large && best < SIZE_RANK.large) return `says "${large[0]}", which needs a cited card whose effect is large`
  const medium = MEDIUM_WORDS.exec(text)
  if (medium && best < SIZE_RANK.medium) return `says "${medium[0]}", which needs a cited card whose effect is at least medium`
  if (factIds.some(isAssociationFact)) {
    const cause = RECORD_CAUSE.exec(text)
    if (cause) return `says "${cause[0]}" of an association in the record: it went with what followed, and is never said to have caused it`
  }
  return null
}

/** The learning repair's tests on the evidence ladder (stage R5): facts the phone sends only while the repair is on. */
export function isLadderFact(id: string): boolean {
  return id.startsWith('ladder.')
}

const LADDER_RANK: Record<string, number> = { none: 0, early: 1, likely: 2, established: 3 }

/** Words that call an effect reliable: only an established call may stand under them. */
export const RELIABLE_WORDS = /\b(reliabl[ey]|proven|proved|consistent(?:ly)?|dependabl[ey]|without fail|every time|for sure|definitely|certainly|guaranteed?|always (?:helps|works|lifts|eases|calms))\b/i
/** Words that keep an effect a possibility, as an early sign or a likely call is said. */
export const LADDER_HEDGE = /\b(early sign|signs? (?:of|that)|may|might|could|seems?|looks? like|appears? to|likely|probably|tends? to|so far|for now|leans? toward)\b/i
/** Words that say a move helps the reading it is tested on. Verbs only, so "work" or "a calm evening" never count. */
export const HELP_WORDS = /\b(help(?:s|ed|ing)?|lifts|lifted|eases|eased|calms|calmed|improv(?:e|es|ed)|boost(?:s|ed)?|works|worked)\b/i
/** A help word under a negation within three words: "not yet shown to help", "doesn't seem to work". */
const NEGATED_HELP = /\b(?:not|n['’]t|never|no longer|nor|without)\b(?:\W+\w+){0,3}?\W+(?:help|lift|ease|calm|improve|boost|work)\w*/gi

/**
 * Why a text speaks of a test more firmly than its rung allows, or null (stage R5; requirement 8: "The ladder governs the
 * Brain's words, how strongly a move is put, and what may be called reliable."). It reads only the cited ladder facts: no
 * call yet claims no effect; an early sign or a likely call is said as such, or hedged; only an established call may be
 * called reliable; and a call that hurts or makes little difference is never said to help. Saying it does not help is honest.
 */
export function ladderWordingRefusal(text: string, factIds: readonly string[], sheet: Pick<FactSheet, 'facts'>): string | null {
  const cited = sheet.facts.filter((f) => isLadderFact(f.id) && factIds.includes(f.id))
  if (!cited.length) return null
  const rank = (f: Fact) => LADDER_RANK[String(f.values.level ?? 'none')] ?? 0
  const reliable = RELIABLE_WORDS.exec(text)
  if (reliable && !cited.some((f) => f.values.level === 'established')) return `says "${reliable[0]}" of a test below established: only an established call may be called reliable`
  const help = HELP_WORDS.exec(text.replace(NEGATED_HELP, ' '))
  if (!help) return null
  const called = cited.filter((f) => f.values.level !== 'none' && f.values.direction)
  if (!called.length) return `says "${help[0]}" of a test with no call yet`
  const helping = called.filter((f) => f.values.direction === 'helps')
  if (!helping.length) return `says "${help[0]}" of a test whose call does not say it helps`
  const best = Math.max(...helping.map(rank))
  if (best < LADDER_RANK.established && !LADDER_HEDGE.test(text)) return `says "${help[0]}" as settled of a test at ${best === 1 ? 'an early sign' : 'likely'}: say it as an early sign, or likely`
  return null
}

export function placeRefusal(text: string): string | null {
  return PLACE_CAUSE.test(text) && !USAGE_HEDGE.test(text) ? 'speaks of a place as the cause of a reading; say what went with it' : null
}

/**
 * The weather is context, never a cause (stage 3, item 6): a line citing it may say what went with it, and a reason only
 * as a possibility; the weather said to cause a reading is refused, as a place is.
 */
export const WEATHER_CAUSE = /\b(because (?:of )?(?:the )?(?:rain|weather|grey|gray|clouds?|sun(?:shine)?|heat|cold)|(?:rain|weather|grey|gray|clouds?|sun(?:shine)?|heat|cold) (?:makes?|made|causes?|caused|drains?|drained|lifts?|lifted|gives?|gave|brings?|brought|dampens?|dampened|weighs?|weighed)|caus(?:e|es|ed|ing)|affect(?:s|ed|ing)?)\b/i

export function weatherRefusal(text: string): string | null {
  return WEATHER_CAUSE.test(text) && !USAGE_HEDGE.test(text) ? 'speaks of the weather as the cause of a reading; say what went with it' : null
}

/** Words that speak of using the app itself. */
export const USAGE_TALK = /\b(open(?:ed|s|ing)?|tapp(?:ed|ing)|taps?|skipp(?:ed|ing)|the app|life mirror|screens?|notifications?)\b/i

/** A text given how the app was used without citing it (the coach's version, say), held to the same rule once it speaks of that use. */
export function usageTalkRefusal(text: string): string | null {
  return USAGE_TALK.test(text) ? usageRefusal(text) : null
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Every number in the text, as written: 62, 3.5, 20:00, 1,250. */
export function numbersIn(text: string): string[] {
  return text.match(/\d+(?:[.,:]\d+)*/g) ?? []
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Minutes after midnight as the record writes a time: 21:30. */
const hhmmOf = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Values that hold the Brain's own earlier words, the last line and the last review's change: never grounds for a number (stage 1, item h). */
const EARLIER_WORDS: ReadonlySet<string> = new Set(['text', 'change'])
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g
const CLOCK = /^(\d{1,2}):(\d{2})$/

/**
 * Whether a number as written is one of the cited facts' own (stage 1, item h): a whole number equal
 * to one of their numbers, or a time equal to one of their times (7:30 is 07:30). Never a part of a
 * date, never a digit inside a name or another number, and never the Brain's own earlier words.
 */
export function numberGrounded(token: string, sheet: FactSheet, factIds: readonly string[]): boolean {
  const plain = token.replace(/,/g, '')
  const clock = CLOCK.exec(token)
  for (const f of sheet.facts) {
    if (!factIds.includes(f.id)) continue
    for (const [k, v] of Object.entries(f.values)) {
      if (typeof v === 'number' && (String(v) === plain || String(Math.round(v)) === plain || Math.abs(v).toString() === plain)) return true
      if (!clock || typeof v !== 'string' || EARLIER_WORDS.has(k)) continue
      for (const t of numbersIn(v.replace(ISO_DATE, ' '))) {
        const c = CLOCK.exec(t)
        if (c && Number(c[1]) === Number(clock[1]) && c[2] === clock[2]) return true
      }
    }
    if (f.n !== undefined && String(f.n) === plain) return true
  }
  return false
}

const NUMBER_WORDS: Readonly<Record<string, number>> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const UNIT_WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
/**
 * A count written as a word (stage 1, item h): a number word before a thing the record counts, or
 * before "of"; never "one", and never a window ("the last seven days", "per week").
 */
const COUNT_WORD = new RegExp(
  `(?<!\\b(?:last|past|next|over|per|every|each|within|first)\\s)\\b(${Object.keys(NUMBER_WORDS).join('|')})(?:-(${Object.keys(UNIT_WORDS).join('|')}))?(?=\\s+(?:of\\b|(?:more\\s+)?(?:times?|sessions?|plans?|steps?|check-ins?|moves?|naps?|workouts?|days?|nights?|weeks?|reps?|sittings?|conversations?|evenings?|mornings?|afternoons?)\\b))`,
  'gi',
)

/**
 * The reason a line's numbers are refused, or null (stage 1, item h). A cited name, step or time said
 * as written names, it does not count, so it is set aside first; every number left must be one of the
 * cited facts' own, and so must every count written as a word, which may also stand where a cited
 * fact itself says it in words. The Brain's own earlier words ground nothing.
 */
export function numbersRefusal(text: string, sheet: FactSheet, factIds: readonly string[]): string | null {
  const cited = sheet.facts.filter((f) => factIds.includes(f.id))
  const named = cited.flatMap((f) => Object.entries(f.values).filter((e): e is [string, string] => typeof e[1] === 'string' && !EARLIER_WORDS.has(e[0]) && e[1].trim().length >= 2 && !/^[\d.,:]+$/.test(e[1].trim())).map((e) => e[1].trim()))
  let rest = text
  for (const name of [...new Set(named)].sort((a, b) => b.length - a.length)) rest = rest.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}(?=$|[^\\p{L}\\p{N}])`, 'giu'), '$1 ')
  // Clock times (item 5): each names a minute of the day, 24-hour unless am or pm says so, and must be one the cited facts name; a
  // bare 9:30 in your own words may be either half. The wrong half is refused with the record's own 24-hour time.
  const times = new Set(cited.flatMap((f) => Object.entries(f.values).flatMap(([k, v]) => (typeof v === 'string' && !EARLIER_WORDS.has(k) ? clockTimesWritten(v).flatMap((t) => (t.bare ? [t.minutes, t.minutes + 720] : [t.minutes])) : []))))
  for (const t of clockTimesWritten(rest)) {
    if (times.has(t.minutes)) continue
    const same = [...times].find((m) => m % 720 === t.minutes % 720)
    return same !== undefined ? `the time ${t.written} is not the cited facts' ${hhmmOf(same)}; write clock times as the record does, 24-hour: ${hhmmOf(same)}` : `the time ${t.written} is not in the cited facts`
  }
  rest = withoutClockTimes(rest)
  for (const n of numbersIn(rest)) if (!numberGrounded(n, sheet, factIds)) return `the number ${n} is not in the cited facts`
  // The cited facts' own words, less the Brain's earlier words they quote.
  const own = cited.map((f) => Object.entries(f.values).reduce((t, [k, v]) => (EARLIER_WORDS.has(k) && typeof v === 'string' && v ? t.split(v).join(' ') : t), f.text)).join(' ')
  for (const m of rest.matchAll(COUNT_WORD)) {
    const word = m[0].toLowerCase()
    const value = NUMBER_WORDS[(m[1] ?? '').toLowerCase()] + (m[2] ? UNIT_WORDS[m[2].toLowerCase()] : 0)
    if (!numberGrounded(String(value), sheet, factIds) && !new RegExp(`\\b${escapeRe(word)}\\b`, 'i').test(own)) return `the count “${m[0]}” is not in the cited facts`
  }
  return null
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** The reason a text is refused, or null when it may be said. */
function refusal(text: string, factIds: readonly string[], cardIds: readonly string[], sheet: FactSheet, admitted: ReadonlyMap<string, ClaimCard>, maxWords: number, evidence = false, ownTests = false): string | null {
  if (!text) return 'no text'
  if (words(text) > maxWords) return `${words(text)} words; at most ${maxWords}`
  for (const w of BANNED_WORDS) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) return `uses the word "${w}"`
  // Caffeine (Part 22): an untapped window is none reported, never caffeine-free; and caffeine is an association, never a cause.
  if (CAFFEINE_FREE.test(text)) return 'calls a window caffeine-free; none reported is not none'
  if (CAFFEINE_WORDS.test(text) && CAUSAL_WORDS.test(text)) return 'speaks of caffeine as a cause'
  if (factIds.some(isPathFact) && speaksOfOutcomes(text)) return 'rates a person or counts an outcome, in a line about a path'
  // Follow-up F1: a line citing how the app was used says what was observed; a reason stays a possibility.
  if (factIds.some(isUsageFact)) {
    const why = usageRefusal(text)
    if (why) return why
  }
  // Part 43: a line citing where the day was spent keeps the place as context, never the cause.
  if (factIds.some(isLocationFact)) {
    const why = placeRefusal(text)
    if (why) return why
  }
  // Stage 3, item 6: a line citing the weather keeps it as context, never the cause.
  if (factIds.some(isWeatherFact)) {
    const why = weatherRefusal(text)
    if (why) return why
  }
  // Stage R5: a line citing the learning repair's tests speaks of their effect no more firmly than their rungs allow.
  if (factIds.some(isLadderFact)) {
    const why = ladderWordingRefusal(text, factIds, sheet)
    if (why) return why
  }
  const numbers = numbersRefusal(text, sheet, factIds)
  if (numbers) return numbers
  const best = cardIds.reduce<number>((m, id) => Math.min(m, GRADE_ORDER[(admitted.get(id) as ClaimCard).grade]), 9)
  for (const [grade, phrase] of Object.entries(GRADE_PHRASES) as [Grade, string][]) {
    if (text.toLowerCase().includes(phrase) && GRADE_ORDER[grade] < best) return `says "${phrase}" beyond the cited cards' grade`
  }
  // Follow-up F1: a line citing how the app was used may name the Evidence screen; that name is not a claim.
  const claims = factIds.some(isUsageFact) ? text.replace(/\b[Tt]he Evidence screen\b/g, '') : text
  // Ask Life Mirror (stage A2) alone: an answer citing the owner's own tests may speak of their evidence, and of the research their facts carry beside them.
  if (cardIds.length === 0 && EVIDENCE_WORDS.test(claims) && !(ownTests && factIds.some(isLadderFact))) return 'speaks of evidence without citing a card'
  // Pass 4, once its gate is open: size words within the cards' sizes, and no cause read into the record's own comparisons.
  if (evidence) return evidenceWordingRefusal(text, factIds, cardIds.map((id) => admitted.get(id) as ClaimCard))
  return null
}

/** The citations, checked: at least one fact, every fact on the sheet, every card admitted. */
function citations(o: Record<string, unknown>, sheet: FactSheet, cards: readonly ClaimCard[]): { factIds: string[]; cardIds: string[]; admitted: Map<string, ClaimCard> } | string {
  const factIds = strings(o.factIds)
  const cardIds = strings(o.cardIds)
  if (factIds.length === 0) return 'no fact cited'
  const known = new Set(sheet.facts.map((f) => f.id))
  for (const id of factIds) if (!known.has(id)) return `fact "${id}" is not on the sheet`
  const admitted = new Map(cards.filter((c) => c.status === 'admitted').map((c) => [c.id, c]))
  for (const id of cardIds) if (!admitted.has(id)) return `card "${id}" is not admitted`
  return { factIds, cardIds, admitted }
}

/**
 * An action is allowed only when the sheet makes it possible: the commitment exists, the check-in is
 * at full depth, the move is one the record has never tested; and, once Away from home is open, no
 * plan for a day the sheet says is away from home on a trip, when nothing is due.
 */
/** A fact as a line cited it, kept with the line (stage 1, item l): its id and its words as they stood when the line was written. */
export interface CitedFact {
  id: string
  text: string
}

/** The cited facts' words from the sheet a line was written from, in the order cited; `wording` gives them as the writer read them. */
export function citedFacts(sheet: FactSheet, factIds: readonly string[], wording: (f: Fact) => string = (f) => f.text): CitedFact[] {
  return factIds.map((id) => sheet.facts.find((f) => f.id === id)).filter((f): f is Fact => f !== undefined).map((f) => ({ id: f.id, text: wording(f) }))
}

/** Cited facts as stored: each kept only when it is an id and its words. */
export function citedFactsOf(v: unknown): CitedFact[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is CitedFact => typeof x === 'object' && x !== null && typeof (x as CitedFact).id === 'string' && typeof (x as CitedFact).text === 'string').map((x) => ({ id: x.id, text: x.text }))
}

/**
 * Whether a line may nudge this commitment toward a plan (stage 1, item g): never a faith practice,
 * which is offered and never pushed (Rule 10). The one test every plan line on the phone and the
 * line check on the Worker use.
 */
export function mayNudge(aim: Fact | undefined): boolean {
  return aim !== undefined && aim.values.faith !== 1
}

export function validateAction(raw: unknown, sheet: FactSheet, forDay?: string, line?: { text: string; factIds: readonly string[] }): ActionValidation {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (typeof raw !== 'object') return { ok: false, reason: 'action is not an object' }
  const a = raw as Record<string, unknown>
  if (a.kind === 'plan') {
    if (forDay && shapeFor(sheet, forDay)?.trip) return { ok: false, reason: 'action plan: that day is out of town, traveling, when nothing is due; leave the action out' }
    const aimId = typeof a.aimId === 'number' ? a.aimId : Number(a.aimId)
    const aim = Number.isInteger(aimId) ? sheet.facts.find((f) => f.id === `aim.${aimId}`) : undefined
    if (!aim) return { ok: false, reason: `action plan: no commitment aim.${String(a.aimId)} on the sheet` }
    if (!mayNudge(aim)) return { ok: false, reason: 'action plan: a faith practice is offered, never pushed (Rule 10); leave the action out' }
    if (typeof a.cue !== 'string' || !(LINE_CUES as readonly string[]).includes(a.cue)) return { ok: false, reason: `action plan: cue must be one of ${LINE_CUES.join(', ')}` }
    // A cue the day written for holds (stage 1, item j): after pickup on a daycare day, after her bedtime on a day she is with you.
    const shape = shapeFor(sheet, forDay ?? sheet.day)
    if (a.cue === 'afterPickup' && !shape?.pickup) return { ok: false, reason: 'action plan: that day has no pickup; use a cue it holds' }
    if (a.cue === 'afterBedtime' && !shape?.bedtime) return { ok: false, reason: 'action plan: that day has no bedtime of hers; use a cue it holds' }
    // Held to its line (item 6): a tap pins the step to the moment the line names, when it names one.
    const named = line ? clockTimesWritten(line.text).map((t) => t.minutes) : []
    const cueTime = a.cue === 'afterPickup' ? shape?.pickup : a.cue === 'afterBedtime' ? shape?.bedtime : null
    const minutesOfCue = (t: string | null | undefined) => clockTimesWritten(t ?? '').map((x) => x.minutes)[0]
    if (named.length && cueTime && !named.includes(minutesOfCue(cueTime) as number)) return { ok: false, reason: `action plan: the line names ${named.map(hhmmOf).join(', ')}, and its tap pins the step to ${cueTime}; make them the same moment` }
    if (named.length && a.cue === 'nextCheckIn' && [shape?.pickup, shape?.bedtime].some((t) => t && named.includes(minutesOfCue(t) as number))) return { ok: false, reason: 'action plan: the line names the moment of another cue; pin the step to that cue' }
    return { ok: true, value: { kind: 'plan', aimId, cue: a.cue as LineCue } }
  }
  if (a.kind === 'depth') {
    const cadence = sheet.facts.find((f) => f.id === 'cadence')
    if (a.value !== 'short' || cadence?.values.depth !== 'full') return { ok: false, reason: 'action depth: only to short, and only when the cadence fact says the depth is full' }
    return { ok: true, value: { kind: 'depth', value: 'short' } }
  }
  if (a.kind === 'test') {
    const untested = String(sheet.facts.find((f) => f.id === 'untested')?.values.moves ?? '').split(',')
    if (typeof a.moveId !== 'string' || !untested.includes(a.moveId)) return { ok: false, reason: 'action test: moveId must be one the untested fact lists' }
    // What it tests (item 6): a reading the untested fact says that move can be tested on, which the line itself speaks of and cites, in one of its parts of the day. A line whose subject cannot be tested offers no test.
    const tests = testsOf(sheet, a.moveId)
    if (!tests || typeof a.reading !== 'string' || !tests.readings.includes(a.reading)) return { ok: false, reason: `action test: reading must be one the untested fact says ${a.moveId} can test${tests ? ` (${tests.readings.join(', ')})` : ''}; if the line speaks of another, offer no test` }
    if (typeof a.block !== 'string' || !tests.blocks.includes(a.block)) return { ok: false, reason: `action test: block must be a part of the day ${a.moveId} fits (${tests.blocks.join(', ')})` }
    if (line && !line.factIds.some((id) => id.split('.').includes(a.reading as string))) return { ok: false, reason: `action test: the line does not cite a fact about ${a.reading}; a test measures what the line speaks of, so offer no test` }
    return { ok: true, value: { kind: 'test', moveId: a.moveId, reading: a.reading, block: a.block as LineBlock } }
  }
  return { ok: false, reason: 'action kind must be plan, depth or test' }
}

/** The shape of the day a line is written for, as the sheet knows it: its own day's, or tomorrow's when the sheet was built the day before. Null when the sheet does not know that day. */
export interface DayShape {
  day: string
  weekday: string
  daycare: boolean
  pickup: string | null
  office: boolean
  church: boolean
  studyNight: boolean
  /** Her bedtime that day, HH:MM, or null when she is away or none is set: what an after-bedtime cue and bedtime words need (stage 1, item j). */
  bedtime: string | null
  /** Away from home on a trip (post-window): set only when the sheet says so, which it never does while that gate is closed. */
  trip?: true
}

export function shapeFor(sheet: FactSheet, forDay: string): DayShape | null {
  const f = forDay === sheet.day ? sheet.facts.find((x) => x.id === 'week.today') : sheet.facts.find((x) => x.id === 'week.tomorrow' && x.values.day === forDay)
  if (!f) return null
  const v = f.values
  return { day: forDay, weekday: typeof v.weekday === 'string' ? v.weekday : forDay, daycare: Number(v.daycare) === 1, pickup: typeof v.pickup === 'string' ? v.pickup : null, office: Number(v.office) === 1, church: Number(v.church) === 1, studyNight: Number(v.studyNight) === 1, bedtime: typeof v.bedtime === 'string' ? v.bedtime : null, ...(Number(v.trip) === 1 ? { trip: true as const } : {}) }
}

/** The house's own places: on a trip's day a line may not send you to them (post-window, Away from home). */
export const HOME_WORDS = /\b(?:at home|around the house|the house|your (?:house|home|flat|apartment|kitchen|living room|bathroom|bedroom|windows|counters?|laundry|washing machine))\b/i

/** Words that put another adult in the same place as him: the coach's in-person guard, when the phone says something keeps in-person reps out (Part 32). */
export const PEOPLE_AROUND_WORDS = /\b(?:in person|face to face|people around|someone nearby|talk to someone|say hello to someone|strike up a conversation|a stranger|other parents?)\b/i

/**
 * What a line may speak of only on a day whose shape holds it. Seeing someone in person is not
 * among them since Pass 3 (the owner's word): working from home, or a day at home, leaves going out
 * possible, so the shape is context there, never a bar. The places the shape does place people stay
 * bound to it: the office and colleagues, church, and pickup, daycare and the other parents there.
 */
const SCHEDULE_WORDS: readonly { what: string; re: RegExp; holds: (s: DayShape) => boolean }[] = [
  { what: 'pickup or daycare', re: /\b(?:pickup|pick-up|daycare|drop-?off|other parents?)\b|\bpick(?:ing|ed)?\s+up\s+(?:your|her|the)\s+(?:child|daughter|kid|little one)\b|\bafter\s+pick(?:ing)?\s*up\b/i, holds: (s) => s.daycare },
  { what: 'the office', re: /\b(?:office|at work|colleagues?|co-?workers?)\b/i, holds: (s) => s.office },
  { what: 'church', re: /\b(?:church|congregation)\b/i, holds: (s) => s.church },
  // Her bedtime (stage 1, item j): only on a day she is with you, never your own sleep, which any day holds.
  { what: 'her bedtime', re: /\b(?:her bed-?time|after bed-?time|put(?:ting)? her (?:down|to bed)|tuck(?:ing)? her in)\b/i, holds: (s) => s.bedtime !== null },
  // Study Night is retired as an engine (Workstream 6, D5): no day holds one, so no line may speak of one.
  { what: 'a study night', re: /\bstudy night\b/i, holds: () => false },
]


/**
 * The guard every writer inherits (Part 19): a line may not speak of pickup, daycare, the office,
 * church or a study night on a day whose shape does not hold them (seeing someone in person is
 * context since Pass 3, never barred by the shape), nor, when the
 * sheet does not know that day's shape, speak of them at all; and it may not name a private item
 * while "Show private items by name outside this screen" is off (Rule 11). Lexical, so it catches
 * the words, not every paraphrase; the reason goes back to the writer for its retry.
 */
export function dayGuard(text: string, sheet: FactSheet, forDay: string): string | null {
  const shape = shapeFor(sheet, forDay)
  for (const w of SCHEDULE_WORDS) {
    if (!w.re.test(text)) continue
    if (!shape) return `speaks of ${w.what}, and the sheet does not know the shape of ${forDay}`
    if (!w.holds(shape)) return `speaks of ${w.what}, which ${shape.weekday} ${forDay} does not hold`
  }
  // Away from home (post-window): only a sheet that says the day is a trip's ever bars these words.
  if (shape?.trip && HOME_WORDS.test(text)) return `speaks of home, and ${shape.weekday} ${forDay} is out of town, traveling`
  if (sheet.showPrivate !== true) {
    for (const f of sheet.facts) {
      if (!f.id.startsWith('private.')) continue
      const name = typeof f.values.name === 'string' ? f.values.name.trim() : ''
      if (name && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}($|[^\\p{L}\\p{N}])`, 'iu').test(text)) return 'names a private item while "Show private items by name outside this screen" is off'
    }
  }
  return null
}

/** Whether a text says a real pattern with one of its own counts: Supportive may be gentle about it, never silent. */
function statesPattern(text: string, sheet: FactSheet, factIds: readonly string[]): boolean {
  const pattern = sheet.facts.filter((f) => factIds.includes(f.id) && isPatternFact(f)).map((f) => f.id)
  return numbersIn(text).some((n) => numberGrounded(n, sheet, pattern))
}

const FIRM_NAMES: Record<Firmness, string> = { supportive: 'Supportive', balanced: 'Balanced', hardCoach: 'Hard Coach' }

/** Words that keep a tentative finding tentative: an association stays one, a guess stays a guess. */
const TENTATIVE = /\b(association|associated|linked|went with|goes with|not a cause|not yet a finding|so far|may|might|could|a guess|range|usually)\b/i

/** Why a delivery is not allowed for a line under a setting. */
function firmReason(pref: FirmnessPref, f: Firmness, x: DeliverySignals): string {
  if (pref !== 'adaptive') return `How firm is set to ${FIRM_NAMES[pref]}: say it that way, and put "${pref}" in firmness`
  if (f === 'hardCoach') return 'Hard Coach needs a real pattern over days, or a serious warning on strong evidence; this line rests on something more tentative, so say it Balanced'
  return x.pattern && x.serious ? 'this line rests on a real pattern that matters, and Adaptive never softens one: say it Balanced or Hard Coach' : 'Supportive is for good news or tentative evidence; say this one Balanced'
}

/** The How firm check (Pass 2) on a text already valid: the delivery the setting allows for what it rests on, and the floor under every firmness. */
function firmVerdict(raw: unknown, texts: readonly string[], x: DeliverySignals, firm: FirmCheck, sheet: FactSheet, factIds: readonly string[]): { ok: true; firmness: Firmness } | { ok: false; reason: string } {
  if (!isFirmness(raw)) return { ok: false, reason: 'firmness must be supportive, balanced or hardCoach' }
  if (!allowedFirmness(firm.pref, x).includes(raw)) return { ok: false, reason: firmReason(firm.pref, raw, x) }
  for (const t of texts) {
    const why = firmnessRefusal(t)
    if (why) return { ok: false, reason: why }
  }
  if (raw === 'supportive' && x.pattern && x.serious && !statesPattern(texts.join(' '), sheet, factIds)) return { ok: false, reason: 'Supportive may be gentle about a real pattern, never silent: say it with its count' }
  // Hard Coach is firm about what the evidence shows, never more certain than it: an association or a guess is still said as one.
  if (raw === 'hardCoach' && x.uncertain) {
    const all = texts.join(' ')
    if (CAUSAL_WORDS.test(all.replace(/\bnot a cause\b/gi, '')) || !TENTATIVE.test(all)) return { ok: false, reason: 'Hard Coach is firm about what the evidence shows, never more certain: this rests on an association or a guess, so say it as one, with no cause' }
  }
  return { ok: true, firmness: raw }
}

export function validateOutput(raw: unknown, sheet: FactSheet, cards: readonly ClaimCard[], maxWords = MAX_WORDS, forDay?: string, firm?: FirmCheck, evidence = EVIDENCE_WORDING === 'open'): Validation {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' }
  const o = raw as Record<string, unknown>
  const mode = o.mode
  if (typeof mode !== 'string' || !(MODES as readonly string[]).includes(mode)) return { ok: false, reason: `mode "${String(mode)}" is not one of ${MODES.join(', ')}` }
  const text = typeof o.text === 'string' ? o.text.trim() : ''
  if (!text) return { ok: false, reason: 'no text' }
  if (words(text) > maxWords) return { ok: false, reason: `${words(text)} words; at most ${maxWords}` }
  const cited = citations(o, sheet, cards)
  if (typeof cited === 'string') return { ok: false, reason: cited }
  const why = refusal(text, cited.factIds, cited.cardIds, sheet, cited.admitted, maxWords, evidence)
  if (why) return { ok: false, reason: why }
  const guarded = forDay ? dayGuard(text, sheet, forDay) : null
  if (guarded) return { ok: false, reason: guarded }
  const action = validateAction(o.action, sheet, forDay, { text, factIds: cited.factIds })
  if (!action.ok) return { ok: false, reason: action.reason }
  const value: BrainOutput = { mode: mode as Mode, text, factIds: cited.factIds, cardIds: cited.cardIds, action: action.value }
  // How firm (Pass 2): checked only once its gate is open; every check above is the same at every firmness.
  if (firm) {
    const x = deliverySignals(value.mode, cited.factIds, cited.cardIds.map((id) => (cited.admitted.get(id) as ClaimCard).grade), sheet)
    const f = firmVerdict(o.firmness, [text], x, firm, sheet, cited.factIds)
    if (!f.ok) return { ok: false, reason: f.reason }
    value.firmness = f.firmness
  }
  return { ok: true, value }
}

/** Ask Life Mirror's answer from Claude (stage A2): its words and what it cites. */
export interface AskOutput {
  text: string
  factIds: string[]
  cardIds: string[]
}

/**
 * Ask Life Mirror's answer from Claude (stage A2; the agreed design's point 15), checked as a line is, against the sheet
 * the run read: every number in a cited fact; each of the owner's tests at its rung and in its direction; causal words
 * only where the evidence wording allows them; every citation on that sheet; the Brain's refused words; and the floor
 * under every firmness (nothing aimed at the person, no false comfort, no therapy-speak, no exclamation mark). One
 * allowance a line does not have: an answer citing the owner's own tests (ladder.*) may speak of their evidence, and of
 * the research their facts carry beside them, without a library card.
 */
export function validateAsk(raw: unknown, sheet: FactSheet, cards: readonly ClaimCard[], maxWords: number, evidence = EVIDENCE_WORDING === 'open'): { ok: true; value: AskOutput } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' }
  const o = raw as Record<string, unknown>
  const text = typeof o.text === 'string' ? o.text.trim() : ''
  if (!text) return { ok: false, reason: 'no text' }
  const cited = citations(o, sheet, cards)
  if (typeof cited === 'string') return { ok: false, reason: cited }
  const why = refusal(text, cited.factIds, cited.cardIds, sheet, cited.admitted, maxWords, evidence, true) ?? firmnessRefusal(text)
  if (!why) return { ok: true, value: { text, factIds: cited.factIds, cardIds: cited.cardIds } }
  // Too long, and anything else as well: both said at once, so the one retry can mend both.
  const also = why.endsWith(`at most ${maxWords}`) ? (refusal(text, cited.factIds, cited.cardIds, sheet, cited.admitted, Number.POSITIVE_INFINITY, evidence, true) ?? firmnessRefusal(text)) : null
  return { ok: false, reason: also ? `${why}; and ${also}` : why }
}

/** The review's follow-up question (the journal, agreed 2026-10-15): at most this many words. */
export const REVIEW_QUESTION_WORDS = 25

/**
 * The weekly review: what held, what did not, one change; each part held to the rules of a line. Where the
 * journal may be read, `question` lets one follow-up question stand beside them, held to the same rules; a
 * follow-up question lives here and in Ask, never as a check-in question.
 */
export function validateReview(raw: unknown, sheet: FactSheet, cards: readonly ClaimCard[], forDay?: string, firm?: FirmCheck, evidence = EVIDENCE_WORDING === 'open', opts: { question?: boolean } = {}): ReviewValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' }
  const o = raw as Record<string, unknown>
  const cited = citations(o, sheet, cards)
  if (typeof cited === 'string') return { ok: false, reason: cited }
  const parts: Record<'held' | 'didNot' | 'change', string> = { held: '', didNot: '', change: '' }
  for (const key of ['held', 'didNot', 'change'] as const) {
    const text = typeof o[key] === 'string' ? (o[key] as string).trim() : ''
    const why = refusal(text, cited.factIds, cited.cardIds, sheet, cited.admitted, REVIEW_PART_WORDS, evidence) ?? (forDay ? dayGuard(text, sheet, forDay) : null)
    if (why) return { ok: false, reason: `${key}: ${why}` }
    parts[key] = text
  }
  const asked = opts.question && typeof o.question === 'string' ? o.question.trim() : ''
  if (asked) {
    const why = (asked.endsWith('?') ? null : 'is not a question') ?? refusal(asked, cited.factIds, cited.cardIds, sheet, cited.admitted, REVIEW_QUESTION_WORDS, evidence) ?? (forDay ? dayGuard(asked, sheet, forDay) : null)
    if (why) return { ok: false, reason: `question: ${why}` }
  }
  const value: ReviewOutput = { ...parts, ...(asked ? { question: asked } : {}), factIds: cited.factIds, cardIds: cited.cardIds }
  // How firm (Pass 2): one delivery for the week's three parts, checked only once its gate is open.
  if (firm) {
    const x = deliverySignals('strategy', cited.factIds, cited.cardIds.map((id) => (cited.admitted.get(id) as ClaimCard).grade), sheet)
    const f = firmVerdict(o.firmness, [parts.held, parts.didNot, parts.change, ...(asked ? [asked] : [])], x, firm, sheet, cited.factIds)
    if (!f.ok) return { ok: false, reason: f.reason }
    value.firmness = f.firmness
  }
  return { ok: true, value }
}
