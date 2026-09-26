import type { FactSheet } from './factTypes'
import { allowedFirmness, deliverySignals, firmnessRefusal, isFirmness, isFirmnessPref, isPatternFact, type DeliverySignals, type Firmness, type FirmnessPref } from './firmness'
import type { ClaimCard, Grade } from './libraryTypes'
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
 * as kinds of place.
 */
export const BRAIN_SWITCHES = ['dayRecord', 'notes', 'privateItems', 'commitments', 'socialPath', 'partnerPath', 'reflections', 'monthlyCheck', 'her', 'faith', 'brainHistory', 'usage', 'location'] as const
export type BrainSwitch = (typeof BRAIN_SWITCHES)[number]

/**
 * Follow-up F1 (2026-09-24): whether Claude may be given how Life Mirror is used at all. Gated while
 * the reliability monitoring runs (2026-09-24 to 2026-09-28, then the ten-day check to 2026-10-04):
 * giving it would change the monitored prompts and their size. Collection goes on meanwhile. Opened
 * only at the owner's word once monitoring is complete; the phone and the Worker read this one value.
 */
export const USAGE_TO_CLAUDE: 'gated' | 'open' = 'gated'

/**
 * Part 43 (2026-09-24): whether Claude may be given where the day's parts were spent (kinds of place,
 * never coordinates). Gated for the same reason and on the same terms as usage: it would change the
 * monitored prompts. Location Context still records on the phone, for you and for the sun.
 */
export const LOCATION_TO_CLAUDE: 'gated' | 'open' = 'gated'

/** Location facts on the sheet: all of them are the location category's, and nothing else is. */
export function isLocationFact(id: string): boolean {
  return id.startsWith('location.')
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
export type LineAction = { kind: 'plan'; aimId: number; cue: LineCue } | { kind: 'depth'; value: 'short' } | { kind: 'test'; moveId: string }

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
 * Pass 4: how big a line says an effect is may not outrun its cards, and the record's own
 * comparisons are never said to have caused what happened. Gated, since it changes what the
 * monitored lines are refused for: it opens with the owner's word after the 2026-10-04 report.
 */
export const EVIDENCE_WORDING: 'gated' | 'open' = 'gated'

/** Words that say an effect is large: a cited card whose effect is large must stand under them. */
export const LARGE_WORDS = /\b(greatly|dramatic(?:ally)?|huge(?:ly)?|massive(?:ly)?|vast(?:ly)?|enormous(?:ly)?|far (?:more|less|better|worse|fewer|higher|lower|greater)|much (?:more|less|better|worse|fewer|higher|lower|greater)|a lot (?:more|less|better|worse)|doubl(?:e|es|ed|ing)|tripl(?:e|es|ed|ing)|halv(?:e|es|ed|ing)|twice as|several times|(?<!(?:more|less|most|as) )strongly|a (?:large|big|huge|major|dramatic|powerful|strong) (?:effect|difference|change|gain|drop|boost|improvement|lift|benefit))\b/i
/** Words that say an effect is at least medium: a cited card whose effect is medium or large must stand under them. */
export const MEDIUM_WORDS = /\b(considerabl[ey]|marked(?:ly)?|substantial(?:ly)?|significantly|sizeable|a (?:moderate|medium|sizeable|marked|clear) (?:effect|difference|change|gain|drop|improvement|lift|benefit))\b/i
/** A claim that something in the record caused what happened: a past cause aimed at you, a because about you, or a why. */
export const RECORD_CAUSE = /\b(?:(?:made|kept|left|gave|cost|drained|sapped|lifted|raised|lowered|improved|boosted|hurt|harmed|helped|cut|pushed|dragged|ruined|wrecked|fixed|caused|affected|reduced|increased|worsened|spoiled|brought) (?:you|your)\b|because (?:you|your)\b|(?:that|this|which|it)(?:'s|’s| is| was) why\b|is why (?:you|your)\b|(?:led|due|thanks) to (?:you|your)\b)/i

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

export function placeRefusal(text: string): string | null {
  return PLACE_CAUSE.test(text) && !USAGE_HEDGE.test(text) ? 'speaks of a place as the cause of a reading; say what went with it' : null
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

/** Whether a number as written appears among the cited facts' values, as a number or inside a string such as a time. */
export function numberGrounded(token: string, sheet: FactSheet, factIds: readonly string[]): boolean {
  const plain = token.replace(/,/g, '')
  for (const f of sheet.facts) {
    if (!factIds.includes(f.id)) continue
    for (const v of Object.values(f.values)) {
      if (typeof v === 'number' && (String(v) === plain || String(Math.round(v)) === plain || Math.abs(v).toString() === plain)) return true
      if (typeof v === 'string' && v.includes(token)) return true
    }
    if (f.n !== undefined && String(f.n) === plain) return true
  }
  return false
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** The reason a text is refused, or null when it may be said. */
function refusal(text: string, factIds: readonly string[], cardIds: readonly string[], sheet: FactSheet, admitted: ReadonlyMap<string, ClaimCard>, maxWords: number, evidence = false): string | null {
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
  for (const n of numbersIn(text)) if (!numberGrounded(n, sheet, factIds)) return `the number ${n} is not in the cited facts`
  const best = cardIds.reduce<number>((m, id) => Math.min(m, GRADE_ORDER[(admitted.get(id) as ClaimCard).grade]), 9)
  for (const [grade, phrase] of Object.entries(GRADE_PHRASES) as [Grade, string][]) {
    if (text.toLowerCase().includes(phrase) && GRADE_ORDER[grade] < best) return `says "${phrase}" beyond the cited cards' grade`
  }
  // Follow-up F1: a line citing how the app was used may name the Evidence screen; that name is not a claim.
  const claims = factIds.some(isUsageFact) ? text.replace(/\b[Tt]he Evidence screen\b/g, '') : text
  if (cardIds.length === 0 && EVIDENCE_WORDS.test(claims)) return 'speaks of evidence without citing a card'
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

/** An action is allowed only when the sheet makes it possible: the commitment exists, the check-in is at full depth, the move is one the record has never tested. */
export function validateAction(raw: unknown, sheet: FactSheet): ActionValidation {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (typeof raw !== 'object') return { ok: false, reason: 'action is not an object' }
  const a = raw as Record<string, unknown>
  if (a.kind === 'plan') {
    const aimId = typeof a.aimId === 'number' ? a.aimId : Number(a.aimId)
    if (!Number.isInteger(aimId) || !sheet.facts.some((f) => f.id === `aim.${aimId}`)) return { ok: false, reason: `action plan: no commitment aim.${String(a.aimId)} on the sheet` }
    if (typeof a.cue !== 'string' || !(LINE_CUES as readonly string[]).includes(a.cue)) return { ok: false, reason: `action plan: cue must be one of ${LINE_CUES.join(', ')}` }
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
    return { ok: true, value: { kind: 'test', moveId: a.moveId } }
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
}

export function shapeFor(sheet: FactSheet, forDay: string): DayShape | null {
  const f = forDay === sheet.day ? sheet.facts.find((x) => x.id === 'week.today') : sheet.facts.find((x) => x.id === 'week.tomorrow' && x.values.day === forDay)
  if (!f) return null
  const v = f.values
  return { day: forDay, weekday: typeof v.weekday === 'string' ? v.weekday : forDay, daycare: Number(v.daycare) === 1, pickup: typeof v.pickup === 'string' ? v.pickup : null, office: Number(v.office) === 1, church: Number(v.church) === 1, studyNight: Number(v.studyNight) === 1 }
}

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
  // Study Night is retired as an engine (Workstream 6, D5): no day holds one, so no line may speak of one.
  { what: 'a study night', re: /\bstudy night\b/i, holds: () => false },
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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
  const action = validateAction(o.action, sheet)
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

/** The weekly review: what held, what did not, one change; each part held to the rules of a line. */
export function validateReview(raw: unknown, sheet: FactSheet, cards: readonly ClaimCard[], forDay?: string, firm?: FirmCheck, evidence = EVIDENCE_WORDING === 'open'): ReviewValidation {
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
  const value: ReviewOutput = { ...parts, factIds: cited.factIds, cardIds: cited.cardIds }
  // How firm (Pass 2): one delivery for the week's three parts, checked only once its gate is open.
  if (firm) {
    const x = deliverySignals('strategy', cited.factIds, cited.cardIds.map((id) => (cited.admitted.get(id) as ClaimCard).grade), sheet)
    const f = firmVerdict(o.firmness, [parts.held, parts.didNot, parts.change], x, firm, sheet, cited.factIds)
    if (!f.ok) return { ok: false, reason: f.reason }
    value.firmness = f.firmness
  }
  return { ok: true, value }
}
