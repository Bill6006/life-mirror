// Words searched for in notes (2026-11-13): whole words only. The Worker's lookup and the answer's checker both read
// these rules, so what the lookup counted and what an answer must name are told by one piece of code. No import: the
// Worker and the phone both take this file.

/** How many words or phrases one search may hold. */
export const NOTE_WORDS_MOST = 5
/** A word's or a phrase's length, in characters. */
export const NOTE_WORD_SHORTEST = 2
export const NOTE_WORD_LONGEST = 40

/** A word or a phrase: letters, digits, spaces, apostrophes and hyphens, beginning and ending on a letter or a digit. */
const WORD = /^[\p{L}\p{N}](?:[\p{L}\p{N} '-]*[\p{L}\p{N}])?$/u

/** One apostrophe for both, and one space for any run of them. */
const plain = (s: string): string => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()

/** The words of a search as it was asked, or why it is refused: one to five, separated by commas, each said once. */
export function parseNoteWords(q: string): { ok: true; words: string[] } | { ok: false; reason: string } {
  const words: string[] = []
  for (const part of q.split(',')) {
    const word = plain(part)
    if (!word) continue
    if (word.length < NOTE_WORD_SHORTEST || word.length > NOTE_WORD_LONGEST) return { ok: false, reason: `each word or phrase is ${NOTE_WORD_SHORTEST} to ${NOTE_WORD_LONGEST} characters` }
    if (!WORD.test(word)) return { ok: false, reason: 'a word or phrase holds letters, digits, spaces, apostrophes and hyphens only' }
    if (!words.some((w) => w.toLowerCase() === word.toLowerCase())) words.push(word)
  }
  if (!words.length) return { ok: false, reason: 'q: the words to search for' }
  if (words.length > NOTE_WORDS_MOST) return { ok: false, reason: `at most ${NOTE_WORDS_MOST} words or phrases in one search` }
  return { ok: true, words }
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether a text holds a word or a phrase whole: no letter or digit stands beside it, letter case aside, and the
 * spaces between a phrase's words may be any, a line break among them. No stems: "yell" is not in "yelled".
 */
export function holdsWords(text: string, words: string): boolean {
  const parts = plain(words).split(' ').filter(Boolean).map(escapeRe)
  if (!parts.length) return false
  return new RegExp(`(?<![\\p{L}\\p{N}])${parts.join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu').test(text.replace(/[‘’]/g, "'"))
}

/**
 * What the database is asked to find first for a word or a phrase: its longest run of plain letters and digits, which
 * the database's own search matches whatever the case. Null when it has none of two characters or more: every note is
 * then read and the reader alone decides.
 */
export function coarseOf(words: string): string | null {
  const runs = plain(words).match(/[A-Za-z0-9]+/g) ?? []
  const longest = runs.reduce((a, b) => (b.length > a.length ? b : a), '')
  return longest.length >= 2 ? longest : null
}
