import { afterEach, describe, expect, it } from 'vitest'
import { findPath, moves, registerGenerated } from './catalogue'
import type { GeneratedPathRow } from './db'
import { latestVersions, registerRows } from './generatedPaths'
import { library, pathCardById } from './library'
import { compileDossier } from './pathCompile'

// Your generated Paths on the phone (P5, 2026-11-06): the newest version of each, checked again by P1's compiler
// here before anything shows it; a version that fails is shown nowhere; its own cards reach the Path's screens alone.

afterEach(() => registerGenerated([]))

/** A compiled garden Path, as the store would hold its row. */
async function row(at: string, extra: Partial<GeneratedPathRow> = {}): Promise<GeneratedPathRow> {
  const { dossierForTests, PROVENANCE_FOR_TESTS } = await import('./pathCompile.fixture')
  const r = compileDossier(dossierForTests(), { moves, cards: [...library], minutesPerWeek: 90, day: '2026-11-07', provenance: PROVENANCE_FOR_TESTS })
  if (!r.ok) throw new Error(r.reasons.join('; '))
  return { pathId: r.path.id, version: '1', at, hash: 'h', path: r.path, reps: r.reps, shared: r.shared, cards: [], results: [], ...extra }
}

describe('the generated Paths in your record', () => {
  it('show the newest version of each, registered after the phone checks it again', async () => {
    const a = await row('2026-11-07T10:00:00.000Z')
    const b = { ...a, version: '2', at: '2026-11-08T10:00:00.000Z', path: { ...a.path, version: '2', changes: [...(a.path.changes ?? []), { version: '2', day: '2026-11-08', reason: 'editorial' as const, major: false, what: 'Clearer words.' }] } }
    expect(latestVersions([a, b]).map((r) => r.version)).toEqual(['2'])
    expect(registerRows([a, b])).toEqual([])
    expect(findPath(a.pathId)?.version).toBe('2')
  })

  it('show a version that fails the compiler’s checks nowhere, and its cards with it', async () => {
    const a = await row('2026-11-07T10:00:00.000Z')
    const card = { ...library[0], id: 'own-garden-card' }
    const broken = { ...a, path: { ...a.path, version: '9' }, cards: [card] }
    expect(registerRows([broken])).toEqual([a.pathId])
    expect(findPath(a.pathId)).toBeUndefined()
    expect(pathCardById('own-garden-card')).toBeUndefined()
    // Fixed, it shows, and its own card is found by the Path's screens.
    expect(registerRows([{ ...a, cards: [card] }])).toEqual([])
    expect(findPath(a.pathId)?.name).toBe('Garden')
    expect(pathCardById('own-garden-card')?.id).toBe('own-garden-card')
  })

  it('show a Path whose start or private check differs from the app’s own words nowhere', async () => {
    const { appWordsProblems, START_SCREENS } = await import('./pathCompile')
    const a = await row('2026-11-07T10:00:00.000Z')
    const own = { questions: [...START_SCREENS.socialFear.questions], help: START_SCREENS.socialFear.help, opens: 'bed', focus: [] }
    expect(appWordsProblems({ start: own })).toEqual([])
    expect(appWordsProblems({ start: { ...own, help: `${own.help} Call this number.` } })).toEqual(['its start is not one of the app’s own screens, word for word'])
    expect(registerRows([{ ...a, path: { ...a.path, check: { strand: 'bed', name: 'A check', questions: [], help: 'Model-written help.' } } }])).toEqual([a.pathId])
    expect(findPath(a.pathId)).toBeUndefined()
  })

  it('offer a Path that cites its own new cards to be read, as the catalogue’s own Paths are', async () => {
    const { addedPaths } = await import('./pathRead')
    const a = await row('2026-11-07T10:00:00.000Z')
    const card = { ...library[0], id: `${a.pathId}-own-card`, status: 'admitted' as const }
    const citing = { ...a, path: { ...a.path, cards: [...a.path.cards, card.id] }, cards: [card] }
    expect(registerRows([citing])).toEqual([])
    expect(addedPaths().map((p) => p.id)).toContain(a.pathId)
    // The Brain's and Ask's own lookup never finds it.
    const { cardById } = await import('./library')
    expect(cardById(card.id)).toBeUndefined()
  })
})
