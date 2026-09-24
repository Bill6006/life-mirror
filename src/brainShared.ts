import type { FactSheet } from './factTypes'
import type { ClaimCard, Grade } from './libraryTypes'

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
 */
export const BRAIN_SWITCHES = ['dayRecord', 'notes', 'privateItems', 'commitments', 'socialPath', 'partnerPath', 'reflections', 'monthlyCheck', 'her', 'faith', 'brainHistory'] as const
export type BrainSwitch = (typeof BRAIN_SWITCHES)[number]

/** The Brain settings, as the phone syncs them in the one row `brainPrefs`. */
export interface BrainPrefsBody {
  writerModel: WriterModel
  /** Only switches turned off are kept; a switch not named is on. */
  switches: Partial<Record<BrainSwitch, false>>
}

/** The Brain settings read the same way on the phone and in the Worker: an unknown or missing model is Opus, a switch is off only when it says so, anything else is dropped. */
export function readBrainPrefs(raw: unknown): BrainPrefsBody {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const s = o.switches && typeof o.switches === 'object' ? (o.switches as Record<string, unknown>) : {}
  const switches: Partial<Record<BrainSwitch, false>> = {}
  for (const k of BRAIN_SWITCHES) if (s[k] === false) switches[k] = false
  return { writerModel: isWriterModel(o.writerModel) ? o.writerModel : 'opus', switches }
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
}

export interface ReviewOutput {
  held: string
  didNot: string
  change: string
  factIds: string[]
  cardIds: string[]
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
function refusal(text: string, factIds: readonly string[], cardIds: readonly string[], sheet: FactSheet, admitted: ReadonlyMap<string, ClaimCard>, maxWords: number): string | null {
  if (!text) return 'no text'
  if (words(text) > maxWords) return `${words(text)} words; at most ${maxWords}`
  for (const w of BANNED_WORDS) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) return `uses the word "${w}"`
  // Caffeine (Part 22): an untapped window is none reported, never caffeine-free; and caffeine is an association, never a cause.
  if (CAFFEINE_FREE.test(text)) return 'calls a window caffeine-free; none reported is not none'
  if (CAFFEINE_WORDS.test(text) && CAUSAL_WORDS.test(text)) return 'speaks of caffeine as a cause'
  if (factIds.some(isPathFact) && speaksOfOutcomes(text)) return 'rates a person or counts an outcome, in a line about a path'
  for (const n of numbersIn(text)) if (!numberGrounded(n, sheet, factIds)) return `the number ${n} is not in the cited facts`
  const best = cardIds.reduce<number>((m, id) => Math.min(m, GRADE_ORDER[(admitted.get(id) as ClaimCard).grade]), 9)
  for (const [grade, phrase] of Object.entries(GRADE_PHRASES) as [Grade, string][]) {
    if (text.toLowerCase().includes(phrase) && GRADE_ORDER[grade] < best) return `says "${phrase}" beyond the cited cards' grade`
  }
  if (cardIds.length === 0 && EVIDENCE_WORDS.test(text)) return 'speaks of evidence without citing a card'
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

/** Whether the day's shape puts other adults around in some block of it: the office, the church morning, a daycare day's drop-off and pickup (Part 20's tier 1, at the scale of a day). */
export function peopleAroundThatDay(shape: DayShape): boolean {
  return shape.office || shape.church || shape.daycare
}

/** Words that put another adult in the same place as him: the day guard's people-around class, and the coach's in-person guard (Part 32). */
export const PEOPLE_AROUND_WORDS = /\b(?:in person|face to face|people around|someone nearby|talk to someone|say hello to someone|strike up a conversation|a stranger|other parents?)\b/i

const SCHEDULE_WORDS: readonly { what: string; re: RegExp; holds: (s: DayShape) => boolean }[] = [
  { what: 'pickup or daycare', re: /\b(?:pickup|pick-up|daycare|drop-?off)\b|\bpick(?:ing|ed)?\s+up\s+(?:your|her|the)\s+(?:child|daughter|kid|little one)\b|\bafter\s+pick(?:ing)?\s*up\b/i, holds: (s) => s.daycare },
  { what: 'the office', re: /\b(?:office|at work|colleagues?|co-?workers?)\b/i, holds: (s) => s.office },
  { what: 'church', re: /\b(?:church|congregation)\b/i, holds: (s) => s.church },
  { what: 'a study night', re: /\bstudy night\b/i, holds: (s) => s.studyNight },
  { what: 'people around', re: PEOPLE_AROUND_WORDS, holds: peopleAroundThatDay },
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The guard every writer inherits (Part 19): a line may not speak of pickup, daycare, the office,
 * church, a study night or people around on a day whose shape does not hold them, nor, when the
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

export function validateOutput(raw: unknown, sheet: FactSheet, cards: readonly ClaimCard[], maxWords = MAX_WORDS, forDay?: string): Validation {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' }
  const o = raw as Record<string, unknown>
  const mode = o.mode
  if (typeof mode !== 'string' || !(MODES as readonly string[]).includes(mode)) return { ok: false, reason: `mode "${String(mode)}" is not one of ${MODES.join(', ')}` }
  const text = typeof o.text === 'string' ? o.text.trim() : ''
  if (!text) return { ok: false, reason: 'no text' }
  if (words(text) > maxWords) return { ok: false, reason: `${words(text)} words; at most ${maxWords}` }
  const cited = citations(o, sheet, cards)
  if (typeof cited === 'string') return { ok: false, reason: cited }
  const why = refusal(text, cited.factIds, cited.cardIds, sheet, cited.admitted, maxWords)
  if (why) return { ok: false, reason: why }
  const guarded = forDay ? dayGuard(text, sheet, forDay) : null
  if (guarded) return { ok: false, reason: guarded }
  const action = validateAction(o.action, sheet)
  if (!action.ok) return { ok: false, reason: action.reason }
  return { ok: true, value: { mode: mode as Mode, text, factIds: cited.factIds, cardIds: cited.cardIds, action: action.value } }
}

/** The weekly review: what held, what did not, one change; each part held to the rules of a line. */
export function validateReview(raw: unknown, sheet: FactSheet, cards: readonly ClaimCard[], forDay?: string): ReviewValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' }
  const o = raw as Record<string, unknown>
  const cited = citations(o, sheet, cards)
  if (typeof cited === 'string') return { ok: false, reason: cited }
  const parts: Record<'held' | 'didNot' | 'change', string> = { held: '', didNot: '', change: '' }
  for (const key of ['held', 'didNot', 'change'] as const) {
    const text = typeof o[key] === 'string' ? (o[key] as string).trim() : ''
    const why = refusal(text, cited.factIds, cited.cardIds, sheet, cited.admitted, REVIEW_PART_WORDS) ?? (forDay ? dayGuard(text, sheet, forDay) : null)
    if (why) return { ok: false, reason: `${key}: ${why}` }
    parts[key] = text
  }
  return { ok: true, value: { ...parts, factIds: cited.factIds, cardIds: cited.cardIds } }
}
