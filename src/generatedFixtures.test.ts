import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { moves } from './catalogue'
import { library } from './library'
import { compileDossier, type Dossier } from './pathCompile'
import { dossierForTests, PROVENANCE_FOR_TESTS, waitingDossierForTests } from './pathCompile.fixture'
import { contentHashOf, generatedIdOf, type GeneratedPathRow } from './pathJob'

// The browser tests' generated Paths (P5): compiled here by the real compiler, kept in e2e/fixtures, and checked
// against the compiler on every run, so the rows a browser test seeds are exactly what the compiler makes today.
// WRITE_FIXTURES=1 writes them again after a deliberate change.

const FILE = 'e2e/fixtures/generated.json'

function rowOf(d: Dossier, requestId: number, at: string): GeneratedPathRow {
  const r = compileDossier(d, { moves, cards: [...library], minutesPerWeek: 120, day: '2026-11-07', provenance: PROVENANCE_FOR_TESTS })
  if (!r.ok) throw new Error(r.reasons.join('; '))
  const whole = { pathId: r.path.id, version: '1', at, requestId, path: r.path, reps: r.reps, shared: r.shared, cards: [], results: [] }
  return { ...whole, id: generatedIdOf(r.path.id, '1'), hash: contentHashOf(whole) }
}

it('seeds the browser tests with what the compiler makes today', () => {
  const rows = [rowOf(dossierForTests(), 1, '2026-11-07T03:00:00.000Z'), rowOf(waitingDossierForTests(), 2, '2026-11-07T03:05:00.000Z')]
  const want = `${JSON.stringify(rows, null, 1)}\n`
  if (process.env.WRITE_FIXTURES) writeFileSync(FILE, want)
  expect(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(want)
})
