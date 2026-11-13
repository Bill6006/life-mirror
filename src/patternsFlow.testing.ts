import { patternsForExport } from './export'

// For tests alone: the pattern table as the export holds it, read back in one shape.

interface ExportedKind {
  id: string
  label: string
  countedBy: string
  known: number
  occurrences: number
  family: number
}

export function patternsFromExport(stored: unknown, includePrivate: boolean, partner: boolean): { kinds: ExportedKind[]; level: unknown[] } {
  const out = patternsForExport(stored, includePrivate, partner).patternTable as { kinds: ExportedKind[]; level: unknown[] } | undefined
  return out ?? { kinds: [], level: [] }
}
