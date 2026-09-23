import { BANNED_WORDS, dayGuard, PEOPLE_AROUND_WORDS, speaksOfOutcomes } from '../../src/brainShared'
import type { FactSheet } from '../../src/factTypes'
import type { CoachCoreKey } from './briefing'
import { surfaceGuard, type Surface } from './surface'

// The coach's answer, checked (Part 32): one or two of the People row's own candidates, and one
// line of today's version held to the day guard, the surface rules, and the people guard: no
// rating, ranking, comparison or profile of a person, no verdict on anyone's traits or attachment,
// no reply, match or rejection as a measure, and no one in person when nobody is around.

/** The version's word limit. */
export const COACH_WORDS = 25

/** Verdicts on a person's traits, attachment or worth: never the coach's to give. */
export const PEOPLE_VERDICTS = /\b(attachment|avoidant|anxiously attached|securely attached|narcissis\w*|needy|clingy|toxic|red flags?|green flags?|high[- ]value|low[- ]value|out of your league|wife material|marriage material|a keeper|settle for|her type|his type|your type)\b/i

/** A reply, a match or a rejection as the measure of a rep: the rep is done when he did his part. */
export const SUCCESS_MEASURES = /\b(repl(?:y|ies|ied)|respond(?:s|ed)? back|match(?:es|ed)?|rejection|rejected|turned (?:you )?down|got (?:a|her|his|their) (?:number|yes))\b/i

const wordsOf = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

export interface CoachAnswer {
  ids: string[]
  version: string
}

type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string }

/** The People row the coach may choose for, from the decision core. */
export function rowOf(core: Partial<Record<CoachCoreKey, unknown>>): { path: string; candidates: string[] } | null {
  const r = core.row as { path?: unknown; candidates?: unknown } | null | undefined
  if (!r || typeof r.path !== 'string' || !Array.isArray(r.candidates)) return null
  return { path: r.path, candidates: r.candidates.filter((c): c is string => typeof c === 'string') }
}

/** The coach's answer, checked: one or two of the row's own candidates, and one line of at most twenty-five words that breaks none of the rules. */
export function checkCoach(raw: unknown, core: Partial<Record<CoachCoreKey, unknown>>, sheet: FactSheet, forDay: string, surface: Surface): Verdict<CoachAnswer> {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' }
  const o = raw as Record<string, unknown>
  const row = rowOf(core)
  if (!row || !row.candidates.length) return { ok: false, reason: 'the row has nothing to choose' }
  const ids = Array.isArray(o.ids) ? o.ids : null
  if (!ids || ids.length < 1 || ids.length > 2 || ids.some((id) => typeof id !== 'string')) return { ok: false, reason: 'ids must name one or two reps' }
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'the same rep named twice' }
  for (const id of ids as string[]) if (!row.candidates.includes(id)) return { ok: false, reason: `"${id}" is not one of the reps the row may offer now` }
  const version = typeof o.version === 'string' ? o.version.trim() : ''
  if (!version) return { ok: false, reason: 'no version' }
  if (wordsOf(version) > COACH_WORDS) return { ok: false, reason: `${wordsOf(version)} words; at most ${COACH_WORDS}` }
  for (const w of BANNED_WORDS) if (new RegExp(`\\b${w}\\b`, 'i').test(version)) return { ok: false, reason: `uses the word "${w}"` }
  if (speaksOfOutcomes(version)) return { ok: false, reason: 'rates, ranks or compares a person, or counts an outcome as success' }
  if (PEOPLE_VERDICTS.test(version)) return { ok: false, reason: 'passes a verdict on a person' }
  if (SUCCESS_MEASURES.test(version)) return { ok: false, reason: 'treats a reply, a match or a rejection as a measure' }
  if (core.ineligibleReason && PEOPLE_AROUND_WORDS.test(version)) return { ok: false, reason: 'puts someone in person beside him when nobody is around by today’s shape' }
  const guarded = dayGuard(version, sheet, forDay)
  if (guarded) return { ok: false, reason: guarded }
  const g = surfaceGuard(version, surface)
  if (g) return { ok: false, reason: g }
  return { ok: true, value: { ids: ids as string[], version } }
}
