import { afterEach, describe, expect, it } from 'vitest'
import { findPath, moves, registerGenerated } from './catalogue'
import { library } from './library'
import { compileDossier, type Dossier } from './pathCompile'
import { dossierForTests, PROVENANCE_FOR_TESTS, waitingDossierForTests } from './pathCompile.fixture'
import { walkPath } from './pathWalk'

// The walk-through (P5): twelve realistic weeks on the app's own engine, a stand-in doing every rep offered. Every
// stage a criterion guards is reached by such a person, alone and beside another Path; a criterion no one can meet
// is seen as a stage that never moves, as a broken dossier shows.

afterEach(() => registerGenerated([]))

function registered(d: Dossier) {
  const r = compileDossier(d, { moves, cards: [...library], minutesPerWeek: 120, day: '2026-11-07', provenance: PROVENANCE_FOR_TESTS })
  if (!r.ok) throw new Error(r.reasons.join('; '))
  registerGenerated([{ path: r.path, reps: r.reps, shared: r.shared }])
  return findPath(r.path.id) as NonNullable<ReturnType<typeof findPath>>
}

describe('twelve weeks of a compiled Path', () => {
  it('reach every stage of the garden Path, alone and beside another Path', () => {
    const path = registered(dossierForTests())
    const alone = walkPath(path, { start: '2026-11-09', days: 84, share: 'alone' })
    expect(alone.strands.map((s) => [s.strand, s.stage, s.stages])).toEqual([['bed', 3, 3]])
    const beside = walkPath(path, { start: '2026-11-09', days: 84, share: 'beside' })
    expect(beside.strands.map((s) => [s.strand, s.stage])).toEqual([['bed', 3]])
  })

  it('reach the stages of every strand turned on, the one that waits once you turn it on', () => {
    const path = registered(waitingDossierForTests())
    const walked = walkPath(path, { start: '2026-11-09', days: 84, share: 'alone', strands: ['asking', 'nerves'] })
    expect(walked.strands.map((s) => [s.strand, s.stage, s.stages])).toEqual([['asking', 3, 3], ['nerves', 2, 2]])
    const together = walkPath(path, { start: '2026-11-09', days: 84, share: 'alone', strands: ['together'] })
    expect(together.strands.map((s) => [s.strand, s.stage, s.stages])).toEqual([['together', 2, 2]])
  })

  it('show a criterion no one can meet as a stage that never moves', () => {
    // A gate asking for an outside check no rep of its stage can give: compiled by hand past the compiler's own rule.
    const d = dossierForTests()
    const r = compileDossier(d, { moves, cards: [...library], minutesPerWeek: 120, day: '2026-11-07', provenance: PROVENANCE_FOR_TESTS })
    if (!r.ok) throw new Error(r.reasons.join('; '))
    const stuck = { ...r.path, measurement: { ...(r.path.measurement as NonNullable<typeof r.path.measurement>), gates: (r.path.measurement?.gates ?? []).map((g) => (g.stage === 1 ? { ...g, confirmed: 1 } : g)) } }
    registerGenerated([{ path: stuck, reps: r.reps, shared: r.shared }])
    const walked = walkPath(findPath(stuck.id) as never, { start: '2026-11-09', days: 84, share: 'alone' })
    expect(walked.strands.map((s) => [s.strand, s.stage])).toEqual([['bed', 1]])
  })
})
