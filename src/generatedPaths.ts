import { liveQuery } from 'dexie'
import { moves, registerGenerated, type GeneratedEntry } from './catalogue'
import { db, type GeneratedPathRow } from './db'
import { library, registerOwnCards } from './library'
import { checkPath } from './pathCheck'
import { appWordsProblems } from './pathCompile'

// Your generated Paths on the phone (P5, 2026-11-06): the newest version of each in your record, checked again
// by the compiler here before anything shows it (a version that fails is shown nowhere), then joined to the
// catalogue's registry so the engine runs it, and its own cards made findable by the Path's screens alone.

/** The newest version of each generated Path, by its time, then its row. */
export function latestVersions(rows: readonly GeneratedPathRow[]): GeneratedPathRow[] {
  const by = new Map<string, GeneratedPathRow>()
  for (const r of rows) {
    const k = by.get(r.pathId)
    if (!k || r.at > k.at || (r.at === k.at && (r.id ?? '') > (k.id ?? ''))) by.set(r.pathId, r)
  }
  return [...by.values()].sort((a, b) => (a.at < b.at ? -1 : 1))
}

/** Registers each newest version that passes P1's checks run on the phone; returns the ids shown nowhere. */
export function registerRows(rows: readonly GeneratedPathRow[]): string[] {
  registerGenerated([])
  const ok: GeneratedEntry[] = []
  const refused: string[] = []
  const latest = latestVersions(rows)
  for (const r of latest) {
    const withShared = moves.map((m) => {
      const s = r.shared.find((x) => x.move === m.id)
      return s ? { ...m, path: { ...m.path, [r.pathId]: s.place } } : m
    })
    // The start's and the check's words are the app's own, never a row's: a row that differs is shown nowhere.
    if (checkPath(r.path, [...withShared, ...r.reps], [...library, ...r.cards]).length || appWordsProblems(r.path).length) refused.push(r.pathId)
    else ok.push({ path: r.path, reps: r.reps, shared: r.shared })
  }
  registerGenerated(ok)
  registerOwnCards(latest.filter((r) => !refused.includes(r.pathId)).flatMap((r) => r.cards))
  return refused
}

/** Follows the store: registers at once, and again whenever it changes, then tells the app to draw again. */
export function followGenerated(onChange: () => void): () => void {
  const sub = liveQuery(() => db.generatedPaths.toArray()).subscribe({
    next: (rows) => {
      registerRows(rows)
      onChange()
    },
    error: () => undefined,
  })
  return () => sub.unsubscribe()
}
