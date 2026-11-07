import type { Replication } from './libraryTypes'

// The evidence pipeline's grading rule (P3 of the AI-generated Paths design, 2026-11-06): one function
// the app and the scripts both read, so a card's certainty is never a model's judgment and never stored.
// GRADE-style, in four levels, from the fields a card records: trials and meta-analyses start high;
// quasi-experiments, single-case and observational work low; expert opinion and theory very low; one
// level down for each reason against, and never above low for a single study. Only direct and indirect
// claims are graded: a mechanism, an expert's view, an inference or a design judgment says what it is.
// The planning range is how much of a published effect to plan on, from the replication record (SCORE
// 2026, Kvarven 2020): design judgment, said as such.

export type Origin = 'direct' | 'indirect' | 'mechanism' | 'expert' | 'inference' | 'judgment'
export type Design = 'meta' | 'rct' | 'quasi' | 'singleCase' | 'observational' | 'expert' | 'theory'
export type Distance = 'knowledge' | 'rolePlay' | 'observed' | 'realLife'
export type Comparator = 'none' | 'waitlist' | 'usual' | 'active' | 'placebo'
export type Heterogeneity = 'low' | 'moderate' | 'high' | 'unknown'
export type Certainty = 'high' | 'moderate' | 'low' | 'veryLow'

export const ORIGINS: readonly Origin[] = ['direct', 'indirect', 'mechanism', 'expert', 'inference', 'judgment']
export const DESIGNS: readonly Design[] = ['meta', 'rct', 'quasi', 'singleCase', 'observational', 'expert', 'theory']
export const DISTANCES: readonly Distance[] = ['knowledge', 'rolePlay', 'observed', 'realLife']
export const COMPARATORS: readonly Comparator[] = ['none', 'waitlist', 'usual', 'active', 'placebo']
export const HETEROGENEITY: readonly Heterogeneity[] = ['low', 'moderate', 'high', 'unknown']
export const CERTAINTIES: readonly Certainty[] = ['veryLow', 'low', 'moderate', 'high']

/** What the rule reads from a card. */
export interface Gradable {
  design?: Design
  origin?: Origin
  /** With an indirect claim: how the studies differ from the person reading it. */
  mismatch?: string
  heterogeneity?: Heterogeneity
  publicationBias?: boolean
  replication: Replication
  /** People studied, in all. */
  n?: number
  /** Studies pooled; one when absent. */
  k?: number
  biasRisk?: 'low' | 'some' | 'high'
  /** One lab's work: a reason down unless independently replicated. */
  singleLab?: boolean
}

export interface Graded {
  certainty: Certainty
  /** Up to three plain reasons it is not higher, the most telling first. */
  reasons: string[]
}

const START: Readonly<Record<Design, number>> = { meta: 3, rct: 3, quasi: 1, singleCase: 1, observational: 1, expert: 0, theory: 0 }

/** The reasons, in plain words, in the order they weigh. */
export const REASON_WORDS = {
  failed: 'it did not hold up when others tried it again',
  single: 'it rests on a single study',
  indirect: 'the people studied differ from you',
  bias: 'signs that unpublished studies would make it smaller',
  heterogeneity: 'results vary widely from study to study',
  mixed: 'tries to repeat it came out mixed',
  lab: 'one lab’s work, not yet repeated by others',
  small: 'a small number of people',
  risk: 'a high risk of bias in how it was done',
} as const

/** The certainty a card's fields give, with its reasons; null for a card without them, or a claim that is not graded. */
export function certaintyOf(c: Gradable): Graded | null {
  if (!c.design || !c.origin) return null
  if (c.origin !== 'direct' && c.origin !== 'indirect') return null
  let level = START[c.design]
  const reasons: string[] = []
  const down = (why: string) => {
    level -= 1
    reasons.push(why)
  }
  if (c.replication === 'failed') {
    level = 0
    reasons.push(REASON_WORDS.failed)
  }
  // Resting on one study is the most telling reason of all, said first; its cap comes last.
  const single = (c.design === 'rct' || c.design === 'quasi' || c.design === 'singleCase' || c.design === 'observational') && (c.k ?? 1) <= 1
  if (single) reasons.push(REASON_WORDS.single)
  if (c.origin === 'indirect') down(c.mismatch ? `${REASON_WORDS.indirect}: ${c.mismatch}` : REASON_WORDS.indirect)
  if (c.publicationBias) down(REASON_WORDS.bias)
  if (c.heterogeneity === 'high') down(REASON_WORDS.heterogeneity)
  if (c.replication === 'mixed') down(REASON_WORDS.mixed)
  if (c.singleLab && c.replication !== 'replicated') down(REASON_WORDS.lab)
  if (c.n !== undefined && c.n < 100 && c.design !== 'singleCase') down(REASON_WORDS.small)
  if (c.biasRisk === 'high') down(REASON_WORDS.risk)
  // A single study is never above low, whatever else it has going for it.
  if (single && level > 1) level = 1
  return { certainty: CERTAINTIES[Math.max(0, Math.min(3, level))], reasons: reasons.slice(0, 3) }
}

/** The fixed words a claim is said in, by its certainty: GRADE's informative statements, never written by a model. */
export const CERTAINTY_WORDS: Readonly<Record<Certainty, { label: string; verb: string }>> = {
  high: { label: 'High certainty', verb: 'does' },
  moderate: { label: 'Moderate certainty', verb: 'probably does' },
  low: { label: 'Low certainty', verb: 'may' },
  veryLow: { label: 'Very low certainty', verb: 'is very uncertain whether it does' },
}

/**
 * How much of a published effect to plan on, as a share of it (design judgment from the replication
 * record): a tenth to three tenths where publication bias shows; most of it where others repeated it;
 * three to five tenths of an unadjusted pooled mean; a quarter to a half of a single study's.
 */
export function planningShare(c: Gradable): [number, number] {
  if (c.publicationBias) return [0.1, 0.3]
  if (c.replication === 'replicated' && !c.singleLab && (c.k ?? 1) > 1) return [0.6, 0.9]
  if (c.design === 'meta') return [0.3, 0.5]
  return [0.25, 0.5]
}
