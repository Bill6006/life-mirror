import { describe, expect, it } from 'vitest'
import { moves, paths, type Move, type Path } from './catalogue'
import { library as cards } from './library'
import { checkPath, compiledPaths, type PathProblemCode } from './pathCheck'
import { addedPaths } from './pathRead'

// The compiler's checks (P1): every Path in the catalogue passes them, and each check, given a Path
// that breaks it, says so, every reason at once.

const social = paths.find((p) => p.id === 'social') as Path

/** A small Path the catalogue could add, well formed: two strands, two reps a counted stage, a guardrail on each in-person rep. */
function fixture(): { path: Path; reps: Move[] } {
  const base = moves.find((m) => m.id === 'one-sentence-past-hello') as Move
  const stage = (n: number) => ({ n, name: `Stage ${n}`, what: 'What belongs here.', notProgress: 'Counting anyone else’s answer.' })
  const path: Path = {
    ...social, id: 'trial', name: 'Trial', builtIn: undefined, version: '1', changes: [{ version: '1', day: '2026-11-06', reason: 'design', major: true, what: 'The first version.' }],
    traits: { sheet: false, coach: false, privacy: 'own', rowShare: 3, icon: 'social' }, cards: [], excluded: [],
    rule: { ...social.rule, reps: 2, distinctReps: 2, settingKinds: 1 },
    strands: [{ id: 'talk', name: 'Talk', what: 'Talking.', stages: [stage(1), stage(2)] }, { id: 'speak', name: 'Speak', what: 'Speaking.', stages: [stage(1), stage(2)] }],
    decisions: [{ id: 'structure', element: 'structure', decision: 'Two strands.', basis: 'Design judgment.', origin: 'judgment', cards: [], uncertainty: 'Untested.', change: 'Your record.' }],
    measurement: { strands: [{ strand: 'speak', record: true, behaviours: [{ id: 'a', words: 'A clear opening', theirs: 'A clear opening' }, { id: 'b', words: 'One example', theirs: 'One example' }] }], gates: [{ strand: 'speak', stage: 1, met: 2, weeks: 2, confirmed: 1, kinds: 1 }], cap: 8, maintenance: { at: [30, 90], every: 180 } },
    start: { questions: [{ id: 'q', text: 'Do you often avoid it?' }], help: 'Help exists.', opens: 'speak', focus: [{ id: 'both', words: 'Both' }] },
  }
  const rep = (id: string, strand: string, n: number): Move => ({ ...base, id, status: 'path', method: 'real-rep', guardrail: 'One try, then leave it.', path: { trial: { strand, stage: n, advances: true } } })
  return { path, reps: [rep('t-a1', 'talk', 1), rep('t-a2', 'talk', 1), rep('t-a3', 'talk', 2), rep('t-b1', 'speak', 1), rep('t-b2', 'speak', 1), rep('t-b3', 'speak', 2)] }
}

const codes = (path: Path, reps: readonly Move[]) => [...new Set(checkPath(path, [...moves, ...reps], cards).map((p) => p.code))].sort()

describe('the compiler’s checks', () => {
  it('pass every Path in the catalogue as it stands', () => {
    for (const p of paths) expect(checkPath(p, moves, cards), p.id).toEqual([])
  })

  it('leave the phone only the Paths that pass them: a broken one is shown and offered nowhere', () => {
    const good = fixture()
    const broken = fixture()
    broken.path = { ...broken.path, id: 'trial', version: '2' }
    expect(compiledPaths([good.path], [...moves, ...good.reps], cards).map((p) => p.id)).toEqual(['trial'])
    expect(compiledPaths([broken.path], [...moves, ...broken.reps], cards)).toEqual([])
    expect(addedPaths().map((p) => p.id)).toEqual(['speaking'])
    // What the add sheet offers: the Paths the catalogue adds, built in ones aside, each passing every check.
    expect(addedPaths([social, good.path, broken.path], [...moves, ...good.reps], cards).map((p) => p.id)).toEqual(['trial'])
  })

  it('pass a well-formed Path the catalogue could add', () => {
    const { path, reps } = fixture()
    expect(checkPath(path, [...moves, ...reps], cards)).toEqual([])
    // A guardrail the Path adds to a rep it shares, held on its placement, is that rep's guardrail on this Path (P4).
    const shared = reps.map((m, k) => (k === 4 ? { ...m, guardrail: undefined, path: { trial: { ...m.path!.trial!, guardrail: 'One try, then leave it.' } } } : m))
    expect(checkPath(path, [...moves, ...shared], cards)).toEqual([])
  })

  it('refuse each broken rule, and every reason at once', () => {
    const cases: [string, (f: ReturnType<typeof fixture>) => void, PathProblemCode][] = [
      ['a rep on a strand the Path lacks', (f) => { f.reps[0] = { ...f.reps[0], path: { trial: { strand: 'sing', stage: 1, advances: true } } } }, 'structure'],
      ['a rep on a stage the strand lacks', (f) => { f.reps[0] = { ...f.reps[0], path: { trial: { strand: 'talk', stage: 5, advances: true } } } }, 'structure'],
      ['stages out of order', (f) => { f.path = { ...f.path, strands: [{ ...f.path.strands![0], stages: [...f.path.strands![0].stages].reverse() }, f.path.strands![1]] } }, 'structure'],
      ['a counted stage one rep short of its rule', (f) => { f.reps.splice(1, 1) }, 'reachable'],
      ['rating words in a rep', (f) => { f.reps[3] = { ...f.reps[3], what: 'Rate how well it went.' } }, 'wording'],
      ['a done-when not your own act', (f) => { f.reps[3] = { ...f.reps[3], doneWhen: 'When they laugh.' } }, 'wording'],
      ['an in-person rep without a guardrail', (f) => { f.reps[4] = { ...f.reps[4], guardrail: undefined } }, 'guardrail'],
      ['a rep recorded alone without a guardrail', (f) => { f.reps[3] = { ...f.reps[3], with: undefined, record: true, guardrail: undefined } }, 'guardrail'],
      ['a card the library does not hold', (f) => { f.path = { ...f.path, cards: ['no-such-card'] } }, 'cards'],
      ['a disputed card with nothing excluded', (f) => { f.path = { ...f.path, cards: ['power-posing-disputed'] } }, 'cards'],
      ['a Path of its own on the sheet', (f) => { f.path = { ...f.path, traits: { ...f.path.traits, sheet: true } } }, 'traits'],
      ['a new Path saying it is built in', (f) => { f.path = { ...f.path, builtIn: true } }, 'traits'],
      ['a share of nine days in seven', (f) => { f.path = { ...f.path, traits: { ...f.path.traits, rowShare: 9 } } }, 'traits'],
      ['no change record for its version', (f) => { f.path = { ...f.path, version: '2' } }, 'version'],
      ['a rep only it holds offered by the day’s draw', (f) => { f.reps[5] = { ...f.reps[5], status: undefined } }, 'status'],
      ['a rep naming no method', (f) => { f.reps[0] = { ...f.reps[0], method: undefined } }, 'method'],
      ['a rep built from a blocked method', (f) => { f.reps[0] = { ...f.reps[0], method: 'power-posing' } }, 'method'],
      ['a rep built from a method the library lacks', (f) => { f.reps[0] = { ...f.reps[0], method: 'no-such-method' } }, 'method'],
      ['a decision with an origin outside the list', (f) => { f.path = { ...f.path, decisions: [{ ...f.path.decisions![0], origin: 'hunch' as never }] } }, 'decisions'],
      ['a decision citing a card the Path does not', (f) => { f.path = { ...f.path, decisions: [f.path.decisions![0], { ...f.path.decisions![0], id: 'd2', origin: 'direct', cards: ['liking-gap'] }] } }, 'decisions'],
      ['no decision on its structure', (f) => { f.path = { ...f.path, decisions: [] } }, 'decisions'],
      ['a gate on a strand it lacks', (f) => { f.path = { ...f.path, measurement: { ...f.path.measurement!, gates: [{ ...f.path.measurement!.gates[0], strand: 'sing' }] } } }, 'measurement'],
      ['a gate asking for more behaviours than its strand has', (f) => { f.path = { ...f.path, measurement: { ...f.path.measurement!, gates: [{ ...f.path.measurement!.gates[0], met: 5 }] } } }, 'measurement'],
      ['a recorded rep with someone else there', (f) => { f.reps[3] = { ...f.reps[3], record: true } }, 'measurement'],
      ['a handed-over rep on a strand that hands nothing over', (f) => { f.reps[3] = { ...f.reps[3], handOver: true } }, 'measurement'],
      ['a start opening a strand it lacks', (f) => { f.path = { ...f.path, start: { ...f.path.start!, opens: 'sing' } } }, 'structure'],
      ['rating words in a behaviour', (f) => { f.path = { ...f.path, measurement: { ...f.path.measurement!, strands: [{ ...f.path.measurement!.strands[0], behaviours: [{ id: 'a', words: 'Rate the opening', theirs: 'Rate it' }, f.path.measurement!.strands[0].behaviours[1]] }] } } }, 'wording'],
    ]
    for (const [name, breakIt, code] of cases) {
      const f = fixture()
      breakIt(f)
      expect(codes(f.path, f.reps), name).toContain(code)
    }
    // Two rules broken, two reasons, from one pass.
    const f = fixture()
    f.reps[4] = { ...f.reps[4], guardrail: undefined, what: 'Score it.' }
    expect(codes(f.path, f.reps)).toEqual(['guardrail', 'wording'])
  })
})
