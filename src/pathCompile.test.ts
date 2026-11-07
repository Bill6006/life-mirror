import { describe, expect, it } from 'vitest'
import { moves } from './catalogue'
import { library } from './library'
import { compileDossier, type Dossier } from './pathCompile'

// The generator's compiler (P5, 2026-11-06): a dossier the model drafted becomes a Path only through the rules. A
// well-formed one compiles into the catalogue's shape, its own and labelled experimental; each broken rule is
// refused, every reason at once; too little evidence abstains.

const CTX = { moves, cards: [...library], minutesPerWeek: 90, day: '2026-11-07' }

/** A small, well-formed dossier for a weeknight cooking goal: one skill strand, three stages, solo reps. */
function dossier(): Dossier {
  const stage = (n: number, name: string) => ({ n, name, what: `${name}, on a weeknight.`, notProgress: 'How it tasted to anyone else.' })
  const rep = (id: string, n: number, method = 'deliberate-practice') => ({ id, strand: 'cooking', stage: n, advances: true, name: `Cook ${id.replace(/-/g, ' ')}`, what: `Cook ${id.replace(/-/g, ' ')} from scratch on a weeknight.`, doneWhen: 'Done when it is on the plate, however it turned out.', cue: 'One step at a time, the recipe open.', crutch: 'Ordering in once it gets late.', settings: ['solo' as const], minutes: 25, effort: 'medium' as const, method })
  return {
    goal: 'Get comfortable cooking dinner from scratch on weeknights',
    triage: { route: 'fits', types: ['skill', 'habitOfStarting'], why: 'A practical skill with a weeknight cue.' },
    name: 'Cooking',
    what: 'Dinner from scratch on weeknights, one dish at a time.',
    timeline: 'Weeks, dish by dish, with no fixed end.',
    components: [{ id: 'one-dish', skill: 'One dish start to finish', basis: 'judgment', cards: [] }, { id: 'rotation', skill: 'A rotation of dishes', basis: 'judgment', cards: [] }],
    links: [{ from: 'one-dish', to: 'rotation', strength: 'soft', basis: 'judgment', cards: [] }],
    contexts: ['how familiar the dish is'],
    strands: [{ id: 'cooking', kind: 'skill', name: 'Cooking', what: 'One dish, then a rotation, then something new.', components: ['one-dish', 'rotation'], stages: [stage(1, 'A dish you know'), stage(2, 'Two dishes in turn'), stage(3, 'Something new each week')], rule: { reps: 4, distinctReps: 2, settingKinds: 1, withinWeeks: 4, smallerAfterRefusals: 2, reentryAfterQuietWeeks: 3, note: 'Design judgment: four dinners within four weeks, two different dishes, before the next stage.' } }],
    reps: [rep('pasta', 1), rep('omelette', 1, 'spaced-practice'), rep('stir-fry', 2), rep('soup', 2, 'spaced-practice'), rep('new-dish', 3, 'varied-contexts')],
    shared: [],
    measurement: { strands: [{ strand: 'cooking', behaviours: [{ id: 'picked', words: 'Picked the dish before five', theirs: 'Picked the dish before five' }, { id: 'prepped', words: 'Prepped before the heat', theirs: 'Prepped before the heat' }] }], gates: [{ strand: 'cooking', stage: 1, met: 2, weeks: 2, confirmed: 0, kinds: 1 }, { strand: 'cooking', stage: 2, met: 2, weeks: 2, confirmed: 0, kinds: 1 }], cap: 8, maintenance: { at: [30, 90], every: 180 } },
    decisions: [{ id: 'structure', element: 'structure', decision: 'One skill strand in three stages, by how familiar the dish is.', basis: 'Practice spread out and varied holds better than massed practice.', origin: 'judgment', cards: ['skill-decay'], uncertainty: 'No trial has tested this order for cooking.', change: 'Your record of which dishes stick.' }, { id: 'cooking-gate', element: 'gate:cooking', decision: 'Two behaviours on two separate weeks.', basis: 'Skills decay without use, so a stage is shown more than once.', origin: 'inference', cards: ['skill-decay'], uncertainty: 'The interval for cooking is not known.', change: 'Your record of what holds.' }],
    cards: ['skill-decay'],
    counted: 'Dinners cooked, by dish and by the behaviours checked.',
    neverCounted: ['how it tasted to anyone else'],
    excluded: [],
    settingKinds: { solo: 'At home, on your own.' },
    provenance: { run: 'test', model: 'opus', promptHash: '0000', retrievedOn: '2026-11-07' },
  }
}

const reasons = (d: Dossier, ctx = CTX) => {
  const r = compileDossier(d, ctx)
  return r.ok ? [] : r.reasons
}

describe('a well-formed dossier', () => {
  it('compiles into a Path of its own, labelled experimental, with namespaced reps the engine can run', () => {
    const r = compileDossier(dossier(), CTX)
    expect(r.ok ? [] : r.reasons).toEqual([])
    if (!r.ok) return
    expect(r.path.id).toMatch(/^g-[0-9a-f]{8}$/)
    expect(r.path).toMatchObject({ label: 'experimental', version: '1', traits: { privacy: 'own', sheet: false, coach: false, rowShare: 3 } })
    expect(r.path.builtIn).toBeUndefined()
    expect(r.path.generated?.goalTypes).toEqual(['skill', 'habitOfStarting'])
    expect(r.reps.map((m) => m.id)).toEqual(['pasta', 'omelette', 'stir-fry', 'soup', 'new-dish'].map((x) => `${r.path.id}-${x}`))
    expect(r.reps.every((m) => m.status === 'path' && m.family === r.path.id && m.path?.[r.path.id]?.strand === 'cooking')).toBe(true)
    // The same goal and name compile to the same id, every time.
    const again = compileDossier(dossier(), CTX)
    expect(again.ok && again.path.id).toBe(r.path.id)
  })
})

describe('the rules a dossier cannot pass', () => {
  it('route by the goal’s rules first: a refused, existing or risky goal makes no Path, whatever the model says', () => {
    expect(reasons({ ...dossier(), goal: 'Get my ex to want me back' })).toContain('the goal routes as refuse by the rules, so no Path is made')
    expect(reasons({ ...dossier(), goal: 'Make more friends' })).toContain('the goal routes as existing (social) by the rules, so no Path is made')
    expect(reasons({ ...dossier(), goal: 'Lose 10 pounds in two weeks' })).toContain('the goal routes as redirect by the rules, so no Path is made')
    // A clinical word allows practice only behind the app's own help.
    expect(reasons({ ...dossier(), goal: 'Overcome my social anxiety' })).toContain('a goal with a clinical word opens with the app’s own help first')
  })

  it('abstain when the model does, or when no admitted card stands behind a strand', () => {
    const a = compileDossier({ ...dossier(), triage: { route: 'abstain', types: ['skill'], why: 'too vague to build on' } }, CTX)
    expect(a).toMatchObject({ ok: false, abstain: true })
    const d = dossier()
    const thin = compileDossier({ ...d, decisions: d.decisions.map((x) => ({ ...x, cards: [] })), reps: d.reps.map((r) => ({ ...r, method: 'mental-rehearsal' })) }, { ...CTX, cards: CTX.cards.map((c) => (c.id === 'skill-decay' ? c : { ...c, status: 'draft' as const })) })
    expect(thin.ok ? [] : thin.reasons).toContain('strand cooking: no admitted card stands behind it')
  })

  it('refuse a fixed shape, treatment, a tactic, a missing crutch, a method outside the library and a budget overrun, every reason at once', () => {
    const d = dossier()
    expect(reasons({ ...d, strands: [{ ...d.strands[0], stages: d.strands[0].stages.slice(0, 1) }] })).toContain('strand cooking: two to six stages, from the domain, never a fixed number')
    const bad = { ...d, reps: d.reps.map((r, k) => (k === 0 ? { ...r, what: 'A dinner that works as therapy.', crutch: '' } : k === 1 ? { ...r, cue: 'A trick to get them to agree.' } : k === 2 ? { ...r, method: 'no-such-method' } : r)) }
    const all = reasons(bad)
    expect(all.some((x) => x.startsWith('rep pasta: treatment words'))).toBe(true)
    expect(all).toContain('rep pasta: the crutch to drop, filled')
    expect(all.some((x) => x.startsWith('rep omelette: a tactic on someone'))).toBe(true)
    expect(all).toContain('rep stir-fry: method no-such-method is not in the library')
    expect(reasons(d, { ...CTX, minutesPerWeek: 60 }).some((x) => x.includes('more than the 60 minutes a week you have'))).toBe(true)
  })

  it('refuse an exposure strand without the app’s own start, a start screen it does not have, and a cycle of prerequisites', () => {
    const d = dossier()
    expect(reasons({ ...d, strands: [{ ...d.strands[0], kind: 'exposure' }] })).toContain('an exposure strand opens with one of the app’s own start screens')
    expect(reasons({ ...d, start: { screen: 'madeUp' as never, opens: 'cooking', focus: [] } })).toContain('the start screen madeUp is not one of the app’s own')
    expect(reasons({ ...d, links: [...d.links, { from: 'rotation', to: 'one-dish', strength: 'hard', basis: 'judgment', cards: [] }] })).toContain('prerequisite links must not form a cycle')
  })

  it('hand P1’s checks the whole Path, its shared placements included', () => {
    const d = dossier()
    expect(reasons({ ...d, shared: [{ move: 'no-such-rep', strand: 'cooking', stage: 1, advances: false, guardrail: 'Your part only.' }] })).toContain('shared no-such-rep: no such rep in the catalogue')
    // A done-when that is not your own act fails P1's wording check.
    const r = reasons({ ...d, reps: d.reps.map((x, k) => (k === 0 ? { ...x, doneWhen: 'When they say it was good.' } : x)) })
    expect(r.some((x) => x.includes('doneWhen must begin “Done ”'))).toBe(true)
  })
})

describe('a compiled Path, registered', () => {
  it('runs in the engine like any Path, and leaves the catalogue exactly as it was once it goes', async () => {
    const { families, findPath, moves: all, pathReps, paths, registerGenerated } = await import('./catalogue')
    const { pathToday } = await import('./pathStage')
    const before = { moves: all.length, paths: paths.length, families: families.length, ask: JSON.stringify(all.find((m) => m.id === 'ask-follow-up')) }
    const d = dossier()
    const r = compileDossier({ ...d, shared: [{ move: 'ask-follow-up', strand: 'cooking', stage: 1, advances: false, guardrail: 'Your part only.' }] }, CTX)
    if (!r.ok) throw new Error(r.reasons.join('; '))
    registerGenerated([{ path: r.path, reps: r.reps, shared: r.shared }])
    expect(findPath(r.path.id)?.name).toBe('Cooking')
    expect(pathReps(r.path.id).map((m) => m.id)).toContain('ask-follow-up')
    const aim = { id: 77, kind: 'path' as const, path: r.path.id, stepMoveId: null, createdAt: '2026-11-01T12:00:00.000Z', archivedAt: null }
    const v = pathToday({ aim, offers: [], outcomes: [], ctx: null, day: '2026-11-07', block: 'evening' })
    expect(v.strands.map((s) => [s.strand.id, s.state.stage])).toEqual([['cooking', 1]])
    expect(v.pick?.moveId.startsWith(r.path.id) || v.pick?.moveId === 'ask-follow-up').toBe(true)
    // A catalogue Path's id is never taken over.
    registerGenerated([{ path: { ...r.path, id: 'social' }, reps: [], shared: [] }])
    expect(paths.filter((p) => p.id === 'social')).toHaveLength(1)
    registerGenerated([])
    expect({ moves: all.length, paths: paths.length, families: families.length, ask: JSON.stringify(all.find((m) => m.id === 'ask-follow-up')) }).toEqual(before)
    expect(findPath(r.path.id)).toBeUndefined()
  })
})
