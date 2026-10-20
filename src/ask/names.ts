// Simple matching of names in a question (Ask Life Mirror, stages A1 and A2): no AI, and nothing the app or the Worker
// reads besides the words themselves. A name matches when one of its own words, three letters or more and not a common
// one, begins a word of the question. Shared by the phone's waiting question and the Worker's packet.

/** Words too common in the catalogue's names to say which move a question means. */
const COMMON = new Set(['the', 'and', 'for', 'now', 'set', 'one', 'two', 'six', 'her', 'his', 'you', 'day', 'new', 'old', 'own', 'try', 'get', 'put', 'see', 'say', 'use', 'way', 'end', 'top', 'big', 'any', 'all', 'out', 'off', 'its', 'has', 'had', 'was', 'are', 'not', 'but', 'can', 'may', 'did', 'how', 'why', 'who', 'with', 'your', 'from', 'into', 'that', 'this', 'than', 'then', 'them', 'they', 'what', 'when', 'some', 'more', 'less', 'once', 'just', 'over', 'after', 'before', 'about', 'minute', 'minutes', 'something', 'someone', 'short', 'long', 'time', 'take', 'make', 'have', 'done', 'today', 'quick', 'small', 'little', 'good', 'well', 'each', 'other', 'every', 'thing', 'things', 'ten', 'five', 'three'])

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Whether one of a name's own words begins a word of the question: its first letters, all but a short ending ("walk" in "walking", "energy" in "energetic"). */
export function named(name: string, question: readonly string[]): boolean {
  const own = words(name).filter((w) => w.length >= 3 && !COMMON.has(w))
  return own.some((w) => {
    const stem = w.slice(0, Math.max(4, w.length - 2))
    return question.some((q) => q.startsWith(stem))
  })
}

/** Whether a name is named in a question, by the same simple matching: shared with the Worker, which puts the facts a question names first (stage A2). */
export function namesIn(question: string): (name: string) => boolean {
  const q = words(question)
  return (name) => q.length > 0 && named(name, q)
}
