// The surface rules for what Claude may have read (Parts 27 and 31; Rule 21: reading is not
// showing). Lexical, so they catch the words, not every paraphrase; a refusal goes back to the
// run with its reason for the one retry.

/** Words that speak of dating or a partner. */
export const DATING_WORDS = /\b(dating|girlfriend|boyfriend|your partner|on a date|a date with|your date|first date|next date|the partner path)\b/i
/** A sentence built on dating that did not happen: never said, on any surface. */
export const DATING_ABSENCE = /\b(no|not|never|without|haven'?t|hasn'?t|didn'?t|isn'?t|wasn'?t|weren'?t|aren'?t|missed|skipped|lack(?:ed|ing)?)\b[^.!?]{0,40}\b(dates?|dating)\b/i

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface Surface {
  /** The private items' names, when their names may not be shown; empty when they may. */
  names: readonly string[]
  /** Whether the Partner path bears on the day (the line) or the week (the review). */
  bears: boolean
}

/** Why a text Claude wrote breaks a surface rule, or null. */
export function surfaceGuard(text: string, s: Surface): string | null {
  for (const name of s.names) if (name && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}($|[^\\p{L}\\p{N}])`, 'iu').test(text)) return 'names a private item while "Show private items by name outside this screen" is off'
  if (DATING_ABSENCE.test(text)) return 'speaks of dating from what did not happen'
  if (DATING_WORDS.test(text) && !s.bears) return 'speaks of dating or a partner when nothing on the Partner path bears on it'
  return null
}
