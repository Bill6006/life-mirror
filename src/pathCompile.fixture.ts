import type { Dossier, DossierRep, Provenance } from './pathCompile'

// A well-formed dossier for tests (P5): a weeknight cooking goal, one skill strand, three stages, solo reps.

/** The harness's stamp for a test run. */
export const PROVENANCE_FOR_TESTS: Provenance = { run: 'test', model: 'opus', promptHash: '0000000000000000', retrievedOn: '2026-11-07' }

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
    ],
    cards: ['skill-decay'],
    counted: 'Jobs done in the bed, by job and by the behaviours checked.',
    neverCounted: ['how big anything grew'],
    excluded: [],
    settingKinds: { solo: 'In the garden, on your own.' },
  }
}
