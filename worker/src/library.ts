import type { FactSheet } from '../../src/factTypes'
import type { ClaimCard, Grade } from '../../src/libraryTypes'

// The evidence library, read from the public repository as the app ships it: admitted cards
// only. Retrieval is by the concept tags the day's facts carry, weighted by how much stands
// behind each fact, strongest grade first among equals.

const ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 }

export async function loadLibrary(url: string, fetcher: typeof fetch = fetch): Promise<ClaimCard[]> {
  const r = await fetcher(url, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`library: ${r.status}`)
  const cards = (await r.json()) as ClaimCard[]
  return cards.filter((c) => c.status === 'admitted')
}

/**
 * The cards for the day: breadth first, the strongest card for each concept the facts touch,
 * heaviest concept first, so a nap fact brings its nap card even on a day full of study; then
 * depth, the rest by how much of the day they touch. Deterministic, and a shorter list is a
 * prefix of a longer one.
 */
export function retrieve(cards: readonly ClaimCard[], sheet: FactSheet, limit = 12): ClaimCard[] {
  const weight = new Map<string, number>()
  for (const f of sheet.facts) for (const t of f.tags) weight.set(t, (weight.get(t) ?? 0) + 1 + Math.min(3, (f.n ?? 0) / 3))
  const score = (c: ClaimCard) => c.tags.reduce((s, t) => s + (weight.get(t) ?? 0), 0)
  const byId = (a: ClaimCard, b: ClaimCard) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const picked: ClaimCard[] = []
  const take = (c: ClaimCard) => {
    if (picked.length < limit && !picked.includes(c)) picked.push(c)
  }
  const tags = [...weight.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([t]) => t)
  for (const t of tags) {
    const best = cards.filter((c) => c.tags.includes(t)).sort((a, b) => ORDER[a.grade] - ORDER[b.grade] || score(b) - score(a) || byId(a, b))[0]
    if (best) take(best)
  }
  for (const c of [...cards].filter((c) => score(c) > 0).sort((a, b) => score(b) - score(a) || ORDER[a.grade] - ORDER[b.grade] || byId(a, b))) take(c)
  return picked
}

export function cardLines(cards: readonly ClaimCard[]): string {
  return cards.map((c) => `[${c.id}] grade ${c.grade}, ${c.replication}: ${c.claim} Effect: ${c.effect}. Caveats: ${c.caveats} In this app: ${c.app}`).join('\n')
}
