import { BANNED_WORDS, dayGuard, PEOPLE_AROUND_WORDS, speaksOfOutcomes } from '../../src/brainShared'
import { firmnessRefusal, type Firmness } from '../../src/firmness'
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
  /** Today's version of each rep named, by its id: the phone shows the drawn rep's own line. */
  versions: Record<string, string>
  /** How firmly each was said (Pass 2), once How firm's gate is open. */
  firmness?: Record<string, Firmness>
}

type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string }

/** The People row the coach may choose for, from the decision core. */
export function rowOf(core: Partial<Record<CoachCoreKey, unknown>>): { path: string; candidates: string[] } | null {
  const r = core.row as { path?: unknown; candidates?: unknown } | null | undefined
  if (!r || typeof r.path !== 'string' || !Array.isArray(r.candidates)) return null
  return { path: r.path, candidates: r.candidates.filter((c): c is string => typeof c === 'string') }
}

/** One line of today's version, checked: at most twenty-five words that break none of the rules; the reason if not. */
function versionRefusal(version: string, core: Partial<Record<CoachCoreKey, unknown>>, sheet: FactSheet, forDay: string, surface: Surface): string | null {
  if (!version) return 'no version'
  if (wordsOf(version) > COACH_WORDS) return `${wordsOf(version)} words; at most ${COACH_WORDS}`
  for (const w of BANNED_WORDS) if (new RegExp(`\\b${w}\\b`, 'i').test(version)) return `uses the word "${w}"`
  if (speaksOfOutcomes(version)) return 'rates, ranks or compares a person, or counts an outcome as success'
  if (PEOPLE_VERDICTS.test(version)) return 'passes a verdict on a person'
  if (SUCCESS_MEASURES.test(version)) return 'treats a reply, a match or a rejection as a measure'
  if (core.ineligibleReason && PEOPLE_AROUND_WORDS.test(version)) return 'puts someone in person beside him when nobody is around by today’s shape'
  return dayGuard(version, sheet, forDay) ?? surfaceGuard(version, surface)
}

/** The coach's answer, checked: one or two of the row's own candidates, each with its own line of today's version, every line held to the rules. */
export function checkCoach(raw: unknown, core: Partial<Record<CoachCoreKey, unknown>>, sheet: FactSheet, forDay: string, surface: Surface, firmByRep?: Readonly<Record<string, Firmness>> | null): Verdict<CoachAnswer> {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' }
  const o = raw as Record<string, unknown>
  const row = rowOf(core)
  if (!row || !row.candidates.length) return { ok: false, reason: 'the row has nothing to choose' }
  const picks = Array.isArray(o.picks) ? o.picks : null
  if (!picks || picks.length < 1 || picks.length > 2 || picks.some((p) => !p || typeof p !== 'object' || typeof (p as { id?: unknown }).id !== 'string')) return { ok: false, reason: 'picks must name one or two reps, each with its id and version' }
  const ids = picks.map((p) => (p as { id: string }).id)
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'the same rep named twice' }
  for (const id of ids) if (!row.candidates.includes(id)) return { ok: false, reason: `"${id}" is not one of the reps the row may offer now` }
  const versions: Record<string, string> = {}
  const firmness: Record<string, Firmness> = {}
  for (const p of picks as { id: string; version?: unknown; firmness?: unknown }[]) {
    const version = typeof p.version === 'string' ? p.version.trim() : ''
    const why = versionRefusal(version, core, sheet, forDay, surface)
    if (why) return { ok: false, reason: ids.length > 1 ? `${p.id}: ${why}` : why }
    // Pass 2: once How firm's gate is open, each version at the firmness the app set for its rep, and the floor under every firmness.
    if (firmByRep) {
      const want = firmByRep[p.id] ?? 'balanced'
      if (p.firmness !== want) return { ok: false, reason: `${p.id}: say this version at ${want}, and put "${want}" in its firmness` }
      const floor = firmnessRefusal(version)
      if (floor) return { ok: false, reason: ids.length > 1 ? `${p.id}: ${floor}` : floor }
      firmness[p.id] = want
    }
    versions[p.id] = version
  }
  return { ok: true, value: { ids, versions, ...(firmByRep ? { firmness } : {}) } }
}
