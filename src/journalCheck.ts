import { addDays, parseDay } from './blocks'
import { CAUSAL_WORDS, RECORD_CAUSE } from './brainShared'

// Let it out's never-evidence rule (agreed 2026-10-15, adjustment 3): enforced by the checks, not by
// wording alone. A statement drawn from the journal names the night it was written, is framed as what
// you wrote, and carries no number, level or cause. A theme is a pattern in what was written, never a
// fact. A writer that draws on an entry says so in its answer ("journal": the nights), and words lifted
// from an entry stand only in such a statement.

/** An entry as the writer was given it. */
export interface ServedEntry {
  day: string
  text: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept?', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Words that put a level on what was written, the way only the engine's evidence may. */
const LEVEL_WORDS = /\b(early signs?|likely|established|holds? up|promising|findings?|proven|proves?|evidence|clearly shows?|shows that)\b/i
/** A number written as a word; "one" is left alone, as "no one" and "one day" are not counts. */
const NUMBER_WORD = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|dozen|twice)\b/i
/** Causes beyond the record's own cause words: a statement of what was written never says why. */
const JOURNAL_CAUSE = /\b(because|due to|led to|leads? to|result(?:s|ed)? in|thanks to|as a result)\b/i
/** How a statement says it is the owner's own words from the journal. */
const FRAMED = /\byou(?:'ve|’ve| have| had|'d|’d)? (?:wrote|written)\b|\byour journal\b|\bin the journal\b|\byou let out\b/i
/** Words of a run the writer lifted whole, case and punctuation aside. */
const LIFTED_RUN = 6
/** How many words of such a run must be more than glue, so a stock phrase ("at the end of the day") lifts nothing. */
const LIFTED_CONTENT = 3
const GLUE = new Set(
  'a an the and or but nor so yet of to in on at for with by from as into onto over under after before about up down out off is was were be been being am are it its this that these those i me my mine you your yours we us our he him his she her they them their there here then than not no do did does done have has had just all any some more most much very too again still really can could would will should may might must get got go went one what when where which who how why if'.split(' '),
)

/** The ways a sentence may name the night an entry was written, from the day the writer wrote for. */
function namesOf(day: string, forDay: string): RegExp[] {
  const d = parseDay(day)
  const month = `(?:${MONTHS[d.getMonth()]}|${SHORT_MONTHS[d.getMonth()]}\\.?)`
  const n = d.getDate()
  const year = `(?:,?\\s+${d.getFullYear()}\\b)?`
  const names = [new RegExp(`\\b${day}\\b`, 'g'), new RegExp(`\\b${month}\\s+${n}(?:st|nd|rd|th)?\\b${year}`, 'gi'), new RegExp(`\\b${n}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${month}(?![a-z])${year}`, 'gi')]
  if (day >= addDays(forDay, -6) && day < forDay) names.push(new RegExp(`\\b${WEEKDAYS[d.getDay()]}\\b`, 'gi'))
  if (day === addDays(forDay, -1)) names.push(/\blast night\b/gi, /\byesterday\b/gi)
  if (day === forDay) names.push(/\btonight\b/gi, /\btoday\b/gi)
  return names
}

const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Whether a text holds a run of LIFTED_RUN words of an entry, in order, with LIFTED_CONTENT of them more than glue. */
function lifts(text: string, entry: string): boolean {
  const t = words(text)
  const e = words(entry)
  if (t.length < LIFTED_RUN || e.length < LIFTED_RUN) return false
  const runs = new Set<string>()
  for (let i = 0; i + LIFTED_RUN <= e.length; i++) {
    const run = e.slice(i, i + LIFTED_RUN)
    if (run.filter((w) => !GLUE.has(w)).length >= LIFTED_CONTENT) runs.add(run.join(' '))
  }
  for (let i = 0; i + LIFTED_RUN <= t.length; i++) if (runs.has(t.slice(i, i + LIFTED_RUN).join(' '))) return true
  return false
}

/** A month cut short ("Oct."): its point ends no sentence. */
const ABBREVIATED = /\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)$/i

/** The sentences of the parts said, a quotation kept whole inside the sentence that quotes it. */
function sentencesOf(texts: readonly string[]): string[] {
  const out: string[] = []
  for (const t of texts) {
    let depth = 0
    let straight = false
    let start = 0
    for (let i = 0; i < t.length; i++) {
      const c = t[i]
      const ends = /\s/.test(t[i + 1] ?? ' ')
      if (c === '“') depth++
      else if (c === '”') {
        depth = Math.max(0, depth - 1)
        if (depth === 0 && /[.!?…]/.test(t[i - 1] ?? '') && ends) {
          out.push(t.slice(start, i + 1))
          start = i + 1
        }
      } else if (c === '"') straight = !straight
      else if (c === '\n' || (/[.!?…]/.test(c) && depth === 0 && !straight && ends && !(c === '.' && ABBREVIATED.test(t.slice(0, i))))) {
        out.push(t.slice(start, i + 1))
        start = i + 1
      }
    }
    out.push(t.slice(start))
  }
  return out.map((s) => s.trim()).filter(Boolean)
}

/**
 * A text with each listed night's dated names set aside, for the checks that read every figure as a count:
 * the date that names a night is the one figure a statement from the journal carries. The journal's own
 * check reads the words as written.
 */
export function withoutNightDates(text: string, nights: readonly string[], forDay: string): string {
  let out = text
  for (const d of nights) for (const r of namesOf(d, forDay)) if (/\d/.test(r.source)) out = out.replace(r, 'then')
  return out
}

/** The nights an answer says it drew on: days only, each once. */
export function journalDaysOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((d): d is string => typeof d === 'string' && DAY_RE.test(d)))]
}

/**
 * The reason a text breaks the journal's rule, or null. `texts` are the parts said (a line, or a review's
 * parts); `declared` the nights the writer says it drew on; `served` the entries it was given; `forDay` the
 * day it wrote for.
 */
export function journalRefusal(texts: string | readonly string[], declared: readonly string[], served: readonly ServedEntry[], forDay: string): string | null {
  const nights = new Set(served.map((e) => e.day))
  for (const d of declared) if (!nights.has(d)) return `journal: the night of ${d} was not among the entries you were given`
  const sentences = sentencesOf(typeof texts === 'string' ? [texts] : texts)
  const named = (s: string, d: string) => namesOf(d, forDay).some((r) => new RegExp(r.source, r.flags.replace('g', '')).test(s))
  // Words lifted from an entry stand only in a statement of what was written, naming that night, listed in "journal".
  for (const e of served) {
    for (const s of sentences) {
      if (!lifts(s, e.text)) continue
      if (!declared.includes(e.day) || !FRAMED.test(s) || !named(s, e.day)) return `draws on the journal of ${e.day} without saying so: list that night in "journal", and quote it only where you name the night and frame it as what was written`
    }
  }
  if (!declared.length) return null
  const framed = sentences.filter((s) => FRAMED.test(s))
  if (!framed.length) return 'a statement from the journal is framed as what was written ("On 14 October you wrote…")'
  for (const d of declared) if (!framed.some((s) => named(s, d))) return `names the night of ${d} where it says what was written`
  for (const s of framed) {
    // The night's own name carries the only figures such a sentence may hold.
    let bare = s
    for (const d of declared) for (const r of namesOf(d, forDay)) bare = bare.replace(r, ' ')
    if (/\d/.test(bare) || NUMBER_WORD.test(bare)) return 'a statement from the journal carries no number'
    if (LEVEL_WORDS.test(bare)) return 'a statement from the journal carries no level of evidence: what was written is never a finding'
    if (CAUSAL_WORDS.test(bare) || RECORD_CAUSE.test(bare) || JOURNAL_CAUSE.test(bare)) return 'a statement from the journal carries no cause'
  }
  return null
}
