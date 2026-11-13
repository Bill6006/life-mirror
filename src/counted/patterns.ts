import { PATTERNS_FORMAT, PATTERNS_ID, type PatternsRecord, type StoredKind } from './stored'
import type { PatternTable } from './table'

// From the table as it is built to the record as it is kept (2026-11-13): the phone's side of the stored shape.

/** The table as it is kept: every kind with its counts, its cells where anything was tested, and the level's averages. */
export function storedPatterns(table: PatternTable, now: string): PatternsRecord {
  const base = (k: PatternTable['untested'][number]): Omit<StoredKind, 'family' | 'cells'> => ({ id: k.kind, label: k.label, unit: k.unit, category: k.category, private: k.private, ...(k.since ? { since: k.since } : {}), ...(k.cutoff ? { cutoff: k.cutoff } : {}), known: k.known, occurrences: k.occurrences })
  const tested = new Map(table.kinds.map((k) => [k.kind, k]))
  const kinds: StoredKind[] = table.order.map((id): StoredKind => {
    const t = tested.get(id)
    if (t) return { ...base(t), family: t.family, cells: t.cells.map((c) => ({ split: c.split, cell: c.cell, k: c.k, n: c.n, restK: c.restK, m: c.m, standing: c.standing, direction: c.direction })) }
    return { ...base(table.untested.find((u) => u.kind === id) as PatternTable['untested'][number]), family: 0 }
  })
  return { id: PATTERNS_ID, format: PATTERNS_FORMAT, builtFor: table.builtFor, builtAt: now, updatedAt: now, kinds, level: table.level.map((l) => ({ ...l, bands: [...l.bands] })) }
}
