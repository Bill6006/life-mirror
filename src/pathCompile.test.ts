import { describe, expect, it } from 'vitest'
import { moves } from './catalogue'
import { library } from './library'
import { compileDossier, partnerCheck, type Dossier, type DossierRep } from './pathCompile'
import { dossierForTests, peopleDossierForTests as people, PROVENANCE_FOR_TESTS } from './pathCompile.fixture'

// The generator's compiler (P5, 2026-11-06): a dossier the model drafted becomes a Path only through the rules. A
// well-formed one compiles into the catalogue's shape, its own and labelled experimental; each broken rule is
// refused, every reason at once; too little evidence abstains. The rules after "round 1" came from the known-answer
// test's comparisons: each names the weakness it closes.

const CTX = { moves, cards: [...library], minutesPerWeek: 90, day: '2026-11-07', provenance: PROVENANCE_FOR_TESTS }

const dossier = dossierForTests

const reasons = (d: Dossier, ctx = CTX) => {
  const r = compileDossier(d, ctx)
  return r.ok ? [] : r.reasons
}

/** The dossier with one rep changed. */
const withRep = (d: Dossier, id: string, patch: Partial<DossierRep>): Dossier => ({ ...d, reps: d.reps.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

describe('a well-formed dossier', () => {
  it('compiles into a Path of its own, labelled experimental, with namespaced reps the engine can run', () => {
    const r = compileDossier(dossier(), CTX)
    expect(r.ok ? [] : r.reasons).toEqual([])
    if (!r.ok) return
    expect(r.path.id).toMatch(/^g-[0-9a-f]{8}$/)
    expect(r.path).toMatchObject({ label: 'experimental', version: '1', traits: { privacy: 'own', sheet: false, coach: false, rowShare: 3 } })
    expect(r.path.builtIn).toBeUndefined()
    expect(r.path.generated?.goalTypes).toEqual(['skill', 'habitOfStarting'])
    expect(r.reps.map((m) => m.id)).toEqual(dossier().reps.map((x) => `${r.path.id}-${x.id}`))
    expect(r.reps.every((m) => m.status === 'path' && m.family === r.path.id && m.path?.[r.path.id]?.strand === 'bed')).toBe(true)
    // The same goal and name compile to the same id, every time.
    const again = compileDossier(dossier(), CTX)
    expect(again.ok && again.path.id).toBe(r.path.id)
  })

  it('carries the harness’s stamp of the run, never the model’s', () => {
    const r = compileDossier({ ...dossier(), provenance: { run: 'mine', model: 'me', promptHash: 'x', retrievedOn: 'y' } } as Dossier, CTX)
    expect(r.ok && r.path.generated?.provenance).toEqual(PROVENANCE_FOR_TESTS)
    expect(reasons(dossier(), { ...CTX, provenance: { ...PROVENANCE_FOR_TESTS, promptHash: '' } })).toContain('the harness stamps the run, the model, the procedure’s hash and the day the evidence was read')
  })

  it('compiles a people dossier that opens on the app’s own social-fear screen, its fear strand opened by a yes', () => {
    const r = compileDossier(people(), CTX)
    expect(r.ok ? [] : r.reasons).toEqual([])
    if (!r.ok) return
    expect(r.path.start?.opens).toBe('nerves')
    expect(r.path.start?.questions.map((q) => q.id)).toEqual(['avoid', 'afraid'])
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
    expect(thin.ok ? [] : thin.reasons).toContain('strand bed: no admitted card stands behind it')
  })

  it('refuse a fixed shape, treatment, a tactic, a missing crutch, a method outside the library and a budget overrun, every reason at once', () => {
    const d = dossier()
    expect(reasons({ ...d, strands: [{ ...d.strands[0], stages: d.strands[0].stages.slice(0, 1) }] })).toContain('strand bed: two to six stages, from the domain, never a fixed number')
    const bad = { ...d, reps: d.reps.map((r, k) => (k === 0 ? { ...r, what: 'A job that works as therapy.', crutch: '' } : k === 1 ? { ...r, cue: 'A trick to get them to agree.' } : k === 2 ? { ...r, method: 'no-such-method' } : r)) }
    const all = reasons(bad)
    expect(all.some((x) => x.startsWith('rep prepare-the-bed: treatment words'))).toBe(true)
    expect(all).toContain('rep prepare-the-bed: the crutch to drop, filled')
    expect(all.some((x) => x.startsWith('rep sow-a-row: a tactic on someone'))).toBe(true)
    expect(all).toContain('rep plant-seedlings: method no-such-method is not in the library')
    expect(reasons(d, { ...CTX, minutesPerWeek: 60 })).toContain('a typical rep of 25 minutes on three days in seven is more than the 60 minutes a week you have')
  })

  it('refuse an exposure strand without the app’s own start, a start screen it does not have, and a cycle of prerequisites', () => {
    const d = dossier()
    expect(reasons({ ...d, strands: [{ ...d.strands[0], kind: 'exposure' }] })).toContain('an exposure strand opens with one of the app’s own start screens')
    expect(reasons({ ...d, start: { screen: 'madeUp' as never, opens: 'bed', focus: [] } })).toContain('the start screen madeUp is not one of the app’s own')
    expect(reasons({ ...d, links: [...d.links, { from: 'tending', to: 'planting', strength: 'soft', basis: 'judgment', cards: [] }] })).toContain('prerequisite links must not form a cycle')
  })

  it('hand P1’s checks the whole Path, its shared placements included', () => {
    const d = dossier()
    expect(reasons({ ...d, shared: [{ move: 'no-such-rep', strand: 'bed', stage: 1, advances: false, guardrail: 'Your part only.' }] })).toContain('shared no-such-rep: no such rep in the catalogue')
    // A done-when that is not your own act fails P1's wording check.
    const r = reasons(withRep(d, 'prepare-the-bed', { doneWhen: 'When the bed looks good.' }))
    expect(r.some((x) => x.includes('doneWhen must begin “Done ”'))).toBe(true)
  })
})

describe('the rules round 1 of the known-answer test added', () => {
  it('a people Path opens on the app’s social-fear screen: the domain decides, not the goal’s wording', () => {
    const { start: _start, ...bare } = people()
    expect(reasons(bare)).toContain('most of its stage-moving reps are done with someone, so it opens on the app’s social-fear screen with an exposure strand a yes opens')
    expect(reasons({ ...people(), start: { screen: 'fear', opens: 'nerves', focus: [{ id: 'asking', words: 'Asking' }] } })).toContain('most of its stage-moving reps are done with someone, so it opens on the app’s social-fear screen with an exposure strand a yes opens')
    // The screen opens an exposure strand, never the skill one, and its focus never names the strand a yes opens.
    expect(reasons({ ...people(), start: { screen: 'socialFear', opens: 'asking', focus: [{ id: 'asking', words: 'Asking' }] } })).toContain('the start opens asking, which must be an exposure strand of the Path')
    expect(reasons({ ...people(), start: { screen: 'socialFear', opens: 'nerves', focus: [{ id: 'nerves', words: 'Nerves' }] } })).toContain('the start’s focus nerves names a strand a yes opens or one that waits')
  })

  it('a gate names the behaviours its stage exists for, from its own strand', () => {
    const d = dossier()
    const gates = d.measurement.gates
    expect(reasons({ ...d, measurement: { ...d.measurement, gates: [{ ...gates[0], requires: undefined }, gates[1]] } })).toContain('gate bed/1: it names the behaviours its stage exists for')
    expect(reasons({ ...d, measurement: { ...d.measurement, gates: [{ ...gates[0], requires: ['made-up'] }, gates[1]] } })).toContain('gate bed/1: it requires made-up, which its strand does not check')
    expect(reasons({ ...d, measurement: { ...d.measurement, gates: [{ ...gates[0], met: 1, requires: ['spaced', 'checked'] }, gates[1]] } })).toContain('gate bed/1: it requires more behaviours than it asks to be met')
  })

  it('a rep asks you to record only what the Path measures, and is done whatever anyone answers', () => {
    expect(reasons(withRep(dossier(), 'sow-a-row', { what: 'Sow a row, then one tap on how it went.' })).some((x) => x.startsWith('rep sow-a-row: it asks you to record what the Path does not measure'))).toBe(true)
    expect(reasons(withRep(dossier(), 'sow-a-row', { what: 'Sow a row and rate it out of ten.' })).some((x) => x.startsWith('rep sow-a-row: it asks you to record what the Path does not measure'))).toBe(true)
    expect(reasons(withRep(people(), 'the-price', { doneWhen: 'Done when they answered your question.' }))).toContain('rep the-price: done by your own act, whatever anyone answers: “Done when they answered your question.”')
    expect(reasons(withRep(people(), 'the-price', { doneWhen: 'Done when you have met.' }))).toContain('rep the-price: done by your own act, whatever anyone answers: “Done when you have met.”')
    // The words that say the opposite pass: whatever they answer, asking someone how their day went.
    expect(reasons(withRep(people(), 'the-price', { doneWhen: 'Done when you have asked once, whatever they answer.' }))).toEqual([])
    expect(reasons(withRep(people(), 'the-price', { what: 'Ask how it went, the thing they told you about last time.' }))).toEqual([])
  })

  it('a rep is feasible: each need given at or before its stage, a plan never moving a stage, a partner only on a strand that waits', () => {
    const p = people()
    expect(reasons(withRep(p, 'a-return', { needs: ['contact'] }))).toContain('rep a-return: it needs a way to reach the person, which no rep at or before it gives')
    // Given at an earlier stage of its strand, it holds.
    expect(reasons(withRep(withRep(p, 'a-return', { needs: ['contact'] }), 'the-hours', { gives: ['contact'] }))).toEqual([])
    // Given only at a later stage, it does not.
    expect(reasons(withRep(withRep(p, 'the-hours', { needs: ['acquaintance'] }), 'a-return', { gives: ['acquaintance'] }))).toContain('rep the-hours: it needs someone talked with before, which no rep at or before it gives')
    expect(reasons(withRep(p, 'a-return', { needs: ['plan'] }))).toContain('rep a-return: it needs someone\'s yes to a plan, so it moves no stage')
    expect(reasons(withRep(p, 'a-return', { needs: ['partner'] }))).toContain('rep a-return: it needs a partner, so it sits on a strand that waits')
    // Its words give it away: a rep with your partner or on a date says it needs one.
    expect(reasons(withRep(p, 'a-return', { what: 'Ask your partner what they would like to do this weekend.' }))).toContain('rep a-return: it is done with a partner or a date, so it says it needs a partner')
    expect(reasons(withRep(p, 'a-return', { what: 'Ask for help with a return at the counter.' }))).toEqual([])
  })

  it('every stage the rule moves keeps its floor with any one of its reps taken away', () => {
    const d = dossier()
    expect(reasons({ ...d, reps: d.reps.filter((r) => r.id !== 'water-deeply') })).toContain('strand bed, stage 1: its floor (3 different reps in 1 kinds of setting) must hold with any one of its 3 stage-moving reps taken away')
    // The last stage moves nowhere, so it needs no spare.
    expect(reasons({ ...d, reps: d.reps.filter((r) => r.id !== 'save-some-seed') })).toEqual([])
  })

  it('an outside check needs an audience, on two or more of its stage’s reps', () => {
    const p = people()
    const handed = { ...p, measurement: { ...p.measurement, strands: p.measurement.strands.map((s) => ({ ...s, handOver: true })) } }
    expect(reasons(withRep(handed, 'the-price', { handOver: true }))).toContain('rep the-price: a hand-over only where there is an audience (a group, in person), never one to one or remote')
    const gated = { ...handed, measurement: { ...handed.measurement, gates: handed.measurement.gates.map((g) => (g.strand === 'asking' && g.stage === 1 ? { ...g, confirmed: 1 } : g)) } }
    expect(reasons(withRep(gated, 'the-price', { handOver: true, settings: ['group'] }))).toContain('gate asking/1: a check from outside the moment needs two or more of its reps that can give one (a recording of yourself, or an audience\'s)')
    expect(reasons(withRep(withRep(gated, 'the-price', { handOver: true, settings: ['group', 'errand'] }), 'the-size', { handOver: true, settings: ['group', 'errand'] }))).toEqual([])
  })

  it('every component is shown by a behaviour or built from its parts, trained by a rep, a hard prerequisite never trained later', () => {
    const d = dossier()
    expect(reasons({ ...d, components: d.components.map((c) => (c.id === 'tending' ? { ...c, shows: [] } : c)) })).toContain('component tending: shown by a behaviour its strand checks, or marked composite')
    expect(reasons({ ...d, components: [...d.components, { id: 'whole-bed', skill: 'A whole bed', basis: 'judgment', cards: [], composite: true }], strands: [{ ...d.strands[0], components: [...d.strands[0].components, 'whole-bed'] }] })).toContain('component whole-bed: a composite is built from its parts, by links into it')
    expect(reasons({ ...d, reps: d.reps.map((r) => ({ ...r, trains: r.trains.filter((c) => c !== 'tending').length ? r.trains.filter((c) => c !== 'tending') : ['planting'] })) })).toContain('component tending: trained by a rep')
    // Tending trained at stage 1, before the planting it needs: refused.
    expect(reasons({ ...d, reps: d.reps.map((r) => (r.stage === 1 ? { ...r, trains: ['tending'] } : r.stage === 2 ? { ...r, trains: ['planting'] } : r)) })).toContain('strand bed: tending is trained at stage 1, before planting, which it needs, at stage 2')
  })

  it('a call or a message moves a stage only on a strand that says calls and messages do', () => {
    const p = people()
    expect(reasons(withRep(p, 'the-price', { with: 'remote', settings: ['remote'] }))).toContain('rep the-price: a call or a message moves no stage of asking, which says calls and messages do not')
    expect(reasons(withRep({ ...p, strands: p.strands.map((s) => (s.id === 'asking' ? { ...s, remote: true } : s)) }, 'the-price', { with: 'remote', settings: ['remote', 'errand'] }))).toEqual([])
  })

  it('a strand that waits is off until you turn it on, pauses only others, and never stands alone', () => {
    const p = people()
    const waits = { ...p, strands: p.strands.map((s) => (s.id === 'asking' ? { ...s, waits: true, pauses: ['asking'] } : s)) }
    expect(reasons(waits)).toEqual(expect.arrayContaining(['strand asking: it pauses asking, which must be another strand that does not wait', 'at least one strand runs from the start: one that neither waits nor is opened by a yes', 'the start’s focus asking names a strand a yes opens or one that waits']))
    expect(reasons({ ...p, strands: p.strands.map((s) => (s.id === 'asking' ? { ...s, pauses: ['nerves'] } : s)) })).toContain('strand asking: only a strand that waits pauses others')
    // A declared stage is a strand that waits: no generated stage is declared.
    const d = dossier()
    expect(reasons({ ...d, strands: [{ ...d.strands[0], stages: d.strands[0].stages.map((st) => (st.n === 3 ? { ...st, advance: 'declared' as const } : st)) }] })).toContain('strand bed, stage 3: a generated stage moves by its rule alone; one that waits on someone else is a strand that waits')
  })

  it('a strand whose reps need a partner carries the app’s own private check, the Partner path’s words, never generated', () => {
    const p = people()
    const together = { id: 'together', kind: 'skill' as const, name: 'Together', what: 'Once you are seeing someone.', components: ['ask-clearly'], waits: true, pauses: ['asking'], stages: p.strands[0].stages.slice(0, 2), rule: p.strands[0].rule }
    const reps: DossierRep[] = ['a', 'b', 'c', 'd'].map((x) => ({ ...p.reps[4], id: `together-${x}`, strand: 'together', stage: 1, needs: ['partner'], settings: ['oneToOne'] }))
    const r = compileDossier({ ...p, strands: [...p.strands, together], reps: [...p.reps, ...reps, { ...reps[0], id: 'together-e', stage: 2 }], decisions: [...p.decisions, { ...p.decisions[0], id: 'together', element: 'strand:together' }] }, CTX)
    expect(r.ok ? [] : r.reasons).toEqual([])
    if (!r.ok) return
    expect(r.path.check).toEqual(partnerCheck('together'))
    expect(r.path.check?.questions.map((q) => q.id)).toEqual(['safety', 'conduct', 'doubt'])
    expect(r.path.strands?.find((s) => s.id === 'together')).toMatchObject({ waits: true, pauses: ['asking'] })
  })

  it('a smaller version that is smaller, and every component a gated strand trains measured by a gate (round 2)', () => {
    const d = dossier()
    expect(reasons({ ...d, reps: d.reps.map((r) => (r.stage === 1 ? { ...r, effort: 'high' as const } : r)) })).toContain('strand bed, stage 1: a stage-moving rep below high effort, so the smaller version after refusals is smaller')
    // The last stage moves nowhere: its reps may all be high effort.
    expect(reasons({ ...d, reps: d.reps.map((r) => (r.stage === 3 ? { ...r, effort: 'high' as const } : r)) })).toEqual([])
    // Tending trained at stage 2 and shown by "checked": a gate that never requires it leaves it unmeasured.
    expect(reasons({ ...d, measurement: { ...d.measurement, gates: d.measurement.gates.map((g) => (g.stage === 2 ? { ...g, requires: ['spaced'] } : g)) } })).toContain('strand bed: component tending is trained before its last stage, and no gate requires a behaviour that shows it')
    expect(reasons({ ...d, decisions: d.decisions.filter((x) => x.element !== 'cap') })).toContain('a decision on cap: why it is as it is')
  })

  it('the minutes, the floors by kind, the attempt cap and the decisions every number needs', () => {
    const d = dossier()
    expect(reasons(withRep(d, 'sow-a-row', { minutes: 95 }))).toEqual(expect.arrayContaining(['rep sow-a-row: one to ninety minutes', 'rep sow-a-row: 95 minutes is more than the 90 minutes a week you have']))
    // A sixty-minute rep fits now, the median carrying the budget.
    expect(reasons(withRep(d, 'sow-a-row', { minutes: 60 }))).toEqual([])
    expect(reasons({ ...d, strands: [{ ...d.strands[0], rule: { ...d.strands[0].rule, reps: 4, distinctReps: 2 } }] })).toContain('strand bed: a skill strand moves a stage on at least 6 reps across 3 different ones')
    expect(reasons({ ...d, measurement: { ...d.measurement, cap: 13 } })).toContain('an attempt cap of four to twelve, not 13')
    expect(reasons({ ...d, decisions: d.decisions.filter((x) => x.element !== 'timeline') })).toContain('a decision on timeline: why it is as it is')
    expect(reasons({ ...d, decisions: d.decisions.filter((x) => x.element !== 'gate:bed') })).toContain('a decision on gate:bed: why it is as it is')
  })
})
