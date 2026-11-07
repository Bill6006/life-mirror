import type { Dossier, DossierRep, Provenance } from './pathCompile'

// A well-formed dossier for tests (P5): a weeknight cooking goal, one skill strand, three stages, solo reps.

/** The harness's stamp for a test run. */
export const PROVENANCE_FOR_TESTS: Provenance = { run: 'test', model: 'opus', promptHash: '0000000000000000', retrievedOn: '2026-11-07' }

/** A people dossier: asking shop staff for help, a skill strand and a fear strand a yes on the app's screen opens. */
export function peopleDossierForTests(): Dossier {
  const stage = (n: number, name: string) => ({ n, name, what: `${name}, in a shop.`, notProgress: 'What the staff thought of you.' })
  const rep = (id: string, strand: string, n: number, trains: string[], method: string, extra: Partial<DossierRep> = {}): DossierRep => ({ id, strand, stage: n, advances: true, name: id.replace(/-/g, ' '), what: `Ask ${id.replace(/-/g, ' ')} at a counter.`, doneWhen: 'Done when you have asked once, whatever the answer.', cue: 'The question in one plain sentence.', crutch: 'Rehearsing it until the moment passes.', guardrail: 'One question, and thanks whatever the answer; never when they are busy with someone.', settings: ['errand'], with: 'adult', minutes: 5, effort: 'low', method, trains, ...extra })
  return {
    ...dossierForTests(),
    goal: 'Get comfortable asking shop staff for help',
    triage: { route: 'fits', types: ['skill', 'exposure'], why: 'A small skill, with nerves for some.' },
    name: 'Asking',
    what: 'Asking shop staff for help, from a quick question to a longer one.',
    timeline: 'Weeks, with no fixed end.',
    components: [
      { id: 'open', skill: 'Opening with the question', basis: 'judgment', cards: [], shows: ['opened'] },
      { id: 'ask-clearly', skill: 'Asking in one plain sentence', basis: 'judgment', cards: [], shows: ['asked'] },
      { id: 'stay', skill: 'Staying with the moment', basis: 'judgment', cards: [], shows: ['stayed'] },
    ],
    links: [{ from: 'open', to: 'ask-clearly', strength: 'hard', basis: 'judgment', cards: [] }],
    strands: [
      { id: 'asking', kind: 'skill', name: 'Asking', what: 'A quick question, then a longer one, then somewhere new.', components: ['open', 'ask-clearly'], stages: [stage(1, 'A quick question'), stage(2, 'A longer ask'), stage(3, 'Somewhere new')], rule: { reps: 6, distinctReps: 3, settingKinds: 1, withinWeeks: 6, smallerAfterRefusals: 2, reentryAfterQuietWeeks: 3, note: 'Design judgment.' } },
      { id: 'nerves', kind: 'exposure', name: 'Nerves', what: 'Small tests of what you expect, then bigger ones.', components: ['stay'], stages: [stage(1, 'Small tests'), stage(2, 'Bigger tests')], rule: { reps: 4, distinctReps: 2, settingKinds: 1, withinWeeks: 6, smallerAfterRefusals: 2, reentryAfterQuietWeeks: 3, note: 'Design judgment.' } },
    ],
    reps: [
      rep('the-shelf', 'asking', 1, ['open'], 'real-rep'),
      rep('the-price', 'asking', 1, ['open'], 'real-rep'),
      rep('the-size', 'asking', 1, ['open'], 'real-rep'),
      rep('the-hours', 'asking', 1, ['open'], 'real-rep'),
      rep('a-recommendation', 'asking', 2, ['ask-clearly'], 'real-rep'),
      rep('a-comparison', 'asking', 2, ['ask-clearly'], 'real-rep'),
      rep('an-order', 'asking', 2, ['ask-clearly'], 'real-rep'),
      rep('a-return', 'asking', 2, ['ask-clearly'], 'real-rep'),
      rep('a-new-shop', 'asking', 3, ['ask-clearly'], 'varied-contexts'),
      rep('test-a-small-fear', 'nerves', 1, ['stay'], 'predict-compare'),
      rep('test-another', 'nerves', 1, ['stay'], 'predict-compare'),
      rep('test-a-third', 'nerves', 1, ['stay'], 'graded-exposure'),
      rep('test-a-bigger-one', 'nerves', 2, ['stay'], 'graded-exposure'),
    ],
    measurement: {
      strands: [
        { strand: 'asking', behaviours: [{ id: 'opened', words: 'Opened with the question', theirs: 'Opened with the question' }, { id: 'asked', words: 'Asked in one plain sentence', theirs: 'Asked in one plain sentence' }] },
        { strand: 'nerves', behaviours: [{ id: 'stayed', words: 'Stayed until the answer', theirs: 'Stayed until the answer' }] },
      ],
      gates: [
        { strand: 'asking', stage: 1, met: 1, requires: ['opened'], weeks: 2, confirmed: 0, kinds: 1 },
        { strand: 'asking', stage: 2, met: 1, requires: ['asked'], weeks: 2, confirmed: 0, kinds: 1 },
        { strand: 'nerves', stage: 1, met: 1, requires: ['stayed'], weeks: 2, confirmed: 0, kinds: 1 },
      ],
      cap: 8,
      maintenance: { at: [30, 90], every: 180 },
    },
    start: { screen: 'socialFear', opens: 'nerves', focus: [{ id: 'asking', words: 'Asking for help' }] },
    decisions: [
      ...dossierForTests().decisions.filter((x) => !x.element.includes(':')),
      ...['strand:asking', 'strand:nerves', 'gate:asking', 'gate:nerves', 'start'].map((element) => ({ id: element.replace(':', '-'), element, decision: 'As designed.', basis: 'Design judgment.', origin: 'judgment' as const, cards: [], uncertainty: 'Not tested.', change: 'Your record.' })),
    ],
    counted: 'Questions asked, by rep and by the behaviours checked.',
    neverCounted: ['what anyone answered'],
    settingKinds: { errand: 'A shop, a counter, a queue.' },
  }
}

/** The people dossier with a strand that waits on someone else's yes and pauses the asking: its reps need a partner, so it carries the app's own check. */
export function waitingDossierForTests(): Dossier {
  const p = peopleDossierForTests()
  const together = { id: 'together', kind: 'skill' as const, name: 'Together', what: 'Once you are seeing someone: your own part.', components: ['ask-clearly'], waits: true, pauses: ['asking'], stages: p.strands[0].stages.slice(0, 2), rule: p.strands[0].rule }
  const reps: DossierRep[] = ['a', 'b', 'c', 'd'].map((x) => ({ ...p.reps[4], id: `together-${x}`, strand: 'together', stage: 1, needs: ['partner'], settings: ['oneToOne'] }))
  return { ...p, goal: 'Get comfortable asking for help, at a counter and at home', strands: [...p.strands, together], reps: [...p.reps, ...reps, { ...reps[0], id: 'together-e', stage: 2 }], decisions: [...p.decisions, { ...p.decisions[0], id: 'together', element: 'strand:together' }] }
}

/** A small, well-formed dossier for a garden goal: one skill strand, three stages, solo reps. */
export function dossierForTests(): Dossier {
  const stage = (n: number, name: string) => ({ n, name, what: `${name}, in your own bed.`, notProgress: 'How big anything grew.' })
  const rep = (id: string, n: number, trains: string[], method = 'deliberate-practice'): DossierRep => ({ id, strand: 'bed', stage: n, advances: true, name: id.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase()), what: `${id.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase())}, the way the packet or the guide says.`, doneWhen: 'Done when the job is finished, however the bed looks after.', cue: 'One step at a time, the guide open.', crutch: 'Doing it all in one rushed go.', settings: ['solo'], minutes: 25, effort: 'medium', method, trains })
  return {
    goal: 'Grow vegetables in a small garden bed this summer',
    triage: { route: 'fits', types: ['skill', 'habitOfStarting'], why: 'A practical skill with a weekly cue.' },
    name: 'Garden',
    what: 'Vegetables in a small bed, planted and tended week by week.',
    timeline: 'A summer, crop by crop, with no fixed end.',
    components: [
      { id: 'planting', skill: 'Planting at the right depth and spacing', basis: 'judgment', cards: [], shows: ['spaced'] },
      { id: 'tending', skill: 'Tending the bed each week', basis: 'judgment', cards: [], shows: ['checked'] },
    ],
    links: [{ from: 'planting', to: 'tending', strength: 'hard', basis: 'judgment', cards: [] }],
    contexts: ['how established the bed is'],
    strands: [{ id: 'bed', kind: 'skill', name: 'The bed', what: 'Planting, then tending, then a second crop.', components: ['planting', 'tending'], stages: [stage(1, 'Planting'), stage(2, 'Tending each week'), stage(3, 'A second crop')], rule: { reps: 6, distinctReps: 3, settingKinds: 1, withinWeeks: 6, smallerAfterRefusals: 2, reentryAfterQuietWeeks: 3, note: 'Design judgment: six jobs within six weeks, three different ones, before the next stage.' } }],
    reps: [
      rep('prepare-the-bed', 1, ['planting']),
      rep('sow-a-row', 1, ['planting'], 'spaced-practice'),
      rep('plant-seedlings', 1, ['planting']),
      rep('water-deeply', 1, ['planting'], 'spaced-practice'),
      rep('weed-a-patch', 2, ['tending']),
      rep('check-for-pests', 2, ['tending'], 'spaced-practice'),
      rep('mulch-the-bed', 2, ['tending']),
      rep('thin-the-seedlings', 2, ['tending'], 'spaced-practice'),
      rep('sow-a-second-crop', 3, ['planting', 'tending'], 'varied-contexts'),
      rep('save-some-seed', 3, ['tending'], 'varied-contexts'),
    ],
    shared: [],
    measurement: {
      strands: [{ strand: 'bed', behaviours: [{ id: 'spaced', words: 'Spaced the plants as the packet says', theirs: 'Spaced the plants as the packet says' }, { id: 'checked', words: 'Checked the soil before watering', theirs: 'Checked the soil before watering' }] }],
      gates: [
        { strand: 'bed', stage: 1, met: 1, requires: ['spaced'], weeks: 2, confirmed: 0, kinds: 1 },
        { strand: 'bed', stage: 2, met: 2, requires: ['checked'], weeks: 2, confirmed: 0, kinds: 1 },
      ],
      cap: 8,
      maintenance: { at: [30, 90], every: 180 },
    },
    decisions: [
      { id: 'structure', element: 'structure', decision: 'One skill strand in three stages, by how established the bed is.', basis: 'Practice spread out and varied holds better than massed practice.', origin: 'judgment', cards: ['skill-decay'], uncertainty: 'No trial has tested this order for a garden.', change: 'Your record of which jobs stick.' },
      { id: 'bed-order', element: 'strand:bed', decision: 'Planting first, then tending, then a second crop.', basis: 'Design judgment: a bed is planted before it is tended.', origin: 'judgment', cards: [], uncertainty: 'The order is not tested.', change: 'Your record of where you stall.' },
      { id: 'bed-gate', element: 'gate:bed', decision: 'Each stage’s own behaviour, on two separate weeks.', basis: 'Skills decay without use, so a stage is shown more than once.', origin: 'inference', cards: ['skill-decay'], uncertainty: 'The interval for gardening is not known.', change: 'Your record of what holds.' },
      { id: 'maintenance', element: 'maintenance', decision: 'Checked again about a month and three months after a stage is shown, then about every six.', basis: 'Unpractised skill fades over months.', origin: 'inference', cards: ['skill-decay'], uncertainty: 'The intervals come from other skills.', change: 'Checks you keep passing, or missing.' },
      { id: 'floor', element: 'rule', decision: 'Six jobs across three different ones within six weeks.', basis: 'Design judgment, the app’s floor for a skill.', origin: 'judgment', cards: [], uncertainty: 'The numbers are a guess.', change: 'A stage that comes far too easily or never does.' },
      { id: 'timeline', element: 'timeline', decision: 'A summer, with no fixed end.', basis: 'Design judgment.', origin: 'judgment', cards: [], uncertainty: 'How fast it goes is yours.', change: 'Your record.' },
      { id: 'cap', element: 'cap', decision: 'Eight attempts at a stage before the stage below comes back beside it.', basis: 'Design judgment: enough tries to show a stage, few enough that a stuck stage gets help.', origin: 'judgment', cards: [], uncertainty: 'The number is a guess.', change: 'Stages often stuck at the cap, or never near it.' },
    ],
    cards: ['skill-decay'],
    counted: 'Jobs done in the bed, by job and by the behaviours checked.',
    neverCounted: ['how big anything grew'],
    excluded: [],
    settingKinds: { solo: 'In the garden, on your own.' },
  }
}
