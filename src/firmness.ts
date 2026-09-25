import type { Mode } from './brainShared'
import type { FactSheet } from './factTypes'
import type { Grade } from './libraryTypes'

// How firm (Pass 2, the owner's word 2026-09-25): how directly the Brain says a line, never what
// it says. The mode decides what kind of thing is useful to say; firmness decides how directly it
// is said. Four settings under Settings → Brain: Adaptive (the default), Supportive, Balanced and
// Hard Coach, the last three from the historically approved definitions. The facts, the numbers,
// the evidence phrase, an association's status, eligibility, safety, the recommendation and the
// line's one tap are the same at every firmness; one natural voice underlies all of them.
// Shared by the phone, the Worker's free chain and Claude's runs. Dormant: while the gate is closed
// nothing here reaches a line, a prompt or a check.

/**
 * The gate. Closed while the Claude reliability monitoring runs (2026-09-24 to 2026-09-28, then the
 * ten-day check to 2026-10-04): opening it changes the monitored prompts and the phone's own lines.
 * Opened only at the owner's word; the phone and the Worker read this one value.
 */
export const HOW_FIRM: 'gated' | 'open' = 'gated'

export const FIRMNESS_PREFS = ['adaptive', 'supportive', 'balanced', 'hardCoach'] as const
export type FirmnessPref = (typeof FIRMNESS_PREFS)[number]
/** A delivery actually used for a line: Adaptive always resolves to one of these. */
export type Firmness = Exclude<FirmnessPref, 'adaptive'>
export const FIRMNESSES: readonly Firmness[] = ['supportive', 'balanced', 'hardCoach']
export const DEFAULT_FIRMNESS: FirmnessPref = 'adaptive'

export function isFirmnessPref(v: unknown): v is FirmnessPref {
  return typeof v === 'string' && (FIRMNESS_PREFS as readonly string[]).includes(v)
}

export function isFirmness(v: unknown): v is Firmness {
  return typeof v === 'string' && (FIRMNESSES as readonly string[]).includes(v)
}

// ─── The phone's own lines ──────────────────────────────────────────────────────────────────────

/** A delivery choice inside a line's template: ⟨supportive|balanced|hard coach⟩. Everything outside it is said at every firmness. */
export const CHOICE = /⟨([^|⟩]*)\|([^|⟩]*)\|([^⟩]*)⟩/g

/** A template said at one firmness: each choice resolved, everything else untouched. Balanced is the line as it has always read. */
export function deliver(template: string, f: Firmness): string {
  const i = f === 'supportive' ? 1 : f === 'balanced' ? 2 : 3
  return template.replace(CHOICE, (...m: string[]) => m[i])
}

// ─── What a line rests on, and the firmness it warrants ─────────────────────────────────────────

/** What a line rests on, as far as how firmly it may be said. */
export interface DeliverySignals {
  mode: Mode
  /** The strongest cited evidence: a card graded A or B is strong; C, or a pattern the record itself shows, moderate; otherwise thin. */
  evidence: 'strong' | 'moderate' | 'thin'
  /** A pattern the record shows over days: a stretch, necessities missed, a commitment still for a week or let go, the record going quiet, Partly three times, a test settled over twelve observations. */
  pattern: boolean
  /** Something that matters now: a warning, a stretch, necessities missed, a commitment being let go, the record going quiet. */
  serious: boolean
  /** An association, a forecast, one day set against others, or a test not yet settled: nothing to be firm about. */
  uncertain: boolean
}

const numberOf = (values: Record<string, unknown>, key: string): number | null => (typeof values[key] === 'number' ? (values[key] as number) : null)

type SheetFact = FactSheet['facts'][number]

/** Whether a fact shows a pattern over days, by its own values. */
export function isPatternFact(f: SheetFact): boolean {
  const v = f.values as Record<string, unknown>
  if (f.id === 'stretch' || f.id.startsWith('necessities.')) return true
  if (f.id === 'offers.7d') return (numberOf(v, 'partly') ?? 0) >= 3
  if (f.id === 'cadence') {
    const usual = ((numberOf(v, 'w2') ?? 0) + (numberOf(v, 'w1') ?? 0)) / 2
    return usual >= 6 && (numberOf(v, 'w0') ?? 0) <= usual / 2
  }
  // Two weeks with nothing after two with something: let go, not a quiet week.
  if (f.id.startsWith('trajectory.')) return (numberOf(v, 'w1') ?? 0) === 0 && (numberOf(v, 'w0') ?? 0) === 0 && (numberOf(v, 'w2') ?? 0) + (numberOf(v, 'w3') ?? 0) >= 2
  if (f.id.startsWith('test.')) return (numberOf(v, 'n') ?? 0) >= 12 && f.tier !== 'promising'
  if (f.id.startsWith('aim.')) return (numberOf(v, 'gapDays') ?? 0) >= 7
  return false
}

/** Whether a fact says something that matters now. */
function isSeriousFact(f: SheetFact): boolean {
  if (f.id === 'stretch' || f.id.startsWith('necessities.')) return true
  if (f.id.startsWith('trajectory.') || f.id === 'cadence' || f.id.startsWith('aim.')) return isPatternFact(f)
  return false
}

/** Whether a fact is too tentative to be firm about: an association, a forecast, one day set against others, a test not yet settled. */
function isUncertainFact(f: SheetFact): boolean {
  if (f.id.startsWith('assoc.') || f.id.startsWith('forecast.') || f.id === 'lastNight') return true
  if (f.id.startsWith('test.')) return !isPatternFact(f)
  return false
}

const GRADE_RANK: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 }

/** What a line rests on, read from its mode, the facts it cites and the grades of the cards it cites: the same for the phone's lines and a model's. */
export function deliverySignals(mode: Mode, factIds: readonly string[], grades: readonly Grade[], sheet: FactSheet): DeliverySignals {
  const facts = sheet.facts.filter((f) => factIds.includes(f.id))
  const pattern = facts.some(isPatternFact)
  const best = grades.reduce<number>((m, g) => Math.min(m, GRADE_RANK[g]), 9)
  return {
    mode,
    evidence: best <= 1 ? 'strong' : best === 2 || pattern ? 'moderate' : 'thin',
    pattern,
    serious: mode === 'warning' || facts.some(isSeriousFact),
    uncertain: facts.some(isUncertainFact),
  }
}

/**
 * Adaptive: the firmness a line warrants, chosen from what it rests on and never from a default.
 * Uncertain evidence is never said with Hard Coach certainty; a real pattern that matters is never
 * softened to sound pleasant; good news is said warmly; everything else even-handedly. The facts,
 * the evidence, the recommendation and the action are untouched: only the delivery follows.
 */
export function adaptiveFirmness(x: DeliverySignals): Firmness {
  if (x.uncertain) return x.mode === 'encouragement' ? 'supportive' : 'balanced'
  if (x.pattern && (x.serious || x.mode === 'challenge' || x.mode === 'strategy' || x.mode === 'warning')) return 'hardCoach'
  if (x.serious && x.evidence === 'strong') return 'hardCoach'
  if (x.mode === 'encouragement') return 'supportive'
  return 'balanced'
}

/** The firmness a line is said with under a setting: the setting itself, or under Adaptive the one the line warrants. */
export function firmnessFor(pref: FirmnessPref, x: DeliverySignals): Firmness {
  return pref === 'adaptive' ? adaptiveFirmness(x) : pref
}

/**
 * What a model may use for a line under a setting: the setting itself, or under Adaptive any
 * delivery the line's grounds allow. Hard Coach only on a real pattern or a serious warning on
 * strong evidence, never on anything uncertain; Supportive only for good news or tentative
 * evidence, never for a real pattern that matters; Balanced always.
 */
export function allowedFirmness(pref: FirmnessPref, x: DeliverySignals): readonly Firmness[] {
  if (pref !== 'adaptive') return [pref]
  return FIRMNESSES.filter((f) => {
    if (f === 'hardCoach') return !x.uncertain && (x.pattern || (x.serious && x.evidence === 'strong'))
    if (f === 'supportive') return !(x.pattern && x.serious) && (x.mode === 'encouragement' || x.uncertain)
    return true
  })
}

/**
 * The coach's delivery for one People rep (Part 32's wording). The setting, except that a Partner
 * path rep is never firmer than Balanced, since firmness toward another person is never the app's
 * to add; under Adaptive, Supportive after a No or a Partly on that rep, and Balanced otherwise:
 * the People row is never pushed by default.
 */
export function coachFirmness(pref: FirmnessPref, path: string, lastAnswers: readonly string[]): Firmness {
  if (pref === 'adaptive') return lastAnswers[0] === 'no' || lastAnswers[0] === 'partly' ? 'supportive' : 'balanced'
  if (pref === 'hardCoach' && path === 'partner') return 'balanced'
  return pref
}

// ─── The floor under every firmness ─────────────────────────────────────────────────────────────

/** Never aimed at the person, at any firmness: insult, anger, shame, disappointment, patronising, macho theatre or false reassurance. */
export const FIRM_FLOOR =
  /\b(ashamed|shame on you|shameful|pathetic|embarrassing|disgrace\w*|disappoint(?:ed|ing|ment)|no excuses?|stop making excuses|man up|toughen up|harden up|get your act together|get it together|what(?:'|’)s wrong with you|you always|you never|come on|wake up|grow up|whin(?:e|es|ed|ing)|you should know better|beast mode|crush it|no days off|no pain,? no gain|grind harder|hustle harder|don(?:'|’)t worry|no worries|nothing to worry about|everything will be (?:fine|okay|ok)|you(?:'|’)ve got this|you(?:'|’)re doing great|it(?:'|’)s all good)\b/i

/** Therapy-speak, at any firmness: warmth stays specific. */
export const THERAPY_SPEAK = /\b(hold space|be gentle with yourself|be kind to yourself|self-care|you deserve|you are enough|you(?:'|’)re enough|okay to not be okay|ok to not be ok|honou?r your feelings|validate your feelings|your feelings are valid|sit with (?:it|that|the feelings?)|inner child|healing journey|nervous system|safe space|give yourself grace)\b/i

/** Why a text may not be said at a firmness, or null. Firmness is in the words, never in the volume: no exclamation marks. */
export function firmnessRefusal(text: string): string | null {
  const floor = text.match(FIRM_FLOOR)
  if (floor) return `says "${floor[0]}"; firmness is about the evidence, never the person, and never false comfort`
  const therapy = text.match(THERAPY_SPEAK)
  if (therapy) return `says "${therapy[0]}"; warmth stays specific, never therapy-speak`
  if (text.includes('!')) return 'uses an exclamation mark; firmness is in the words, not the volume'
  return null
}
