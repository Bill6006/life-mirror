import type { Strength, Window } from '../src/catalogue'
import type { ReadingId } from '../src/readings'
import { BASE, type PersonParams, type TrueEffect, type Truth } from './world'

// The simulated people of the stress test, one scenario per row of the frozen criteria's list.
// Every scenario names the tests whose calls the metrics follow; the rest of the catalogue is
// there too, with no effect unless the scenario says so.

export interface Tracked {
  moveId: string
  target: ReadingId
  /** The test's window: the move's own unless named. */
  window?: Window
}

export interface Scenario {
  id: string
  /** What the scenario stresses, in a few words, for the report. */
  about: string
  params: PersonParams
  truth: Truth
  tracked: Tracked[]
  /** Research priors replaced for this scenario: a misleading prior. */
  priors?: Record<string, { effect: number; strength: Strength }>
  /** Extra tests B runs, declared up front (another window than the move's own). */
  declared?: { moveId: string; target: ReadingId; window: Window }[]
}

const with_ = (over: Partial<PersonParams>): PersonParams => ({ ...BASE, ...over, checkin: { ...BASE.checkin, ...(over.checkin ?? {}) } })
const one = (moveId: string, target: ReadingId, eff: TrueEffect): Truth => new Map([[moveId, { [target]: eff }]])
const TEST: Tracked = { moveId: 'walk-ten', target: 'stress' }
const SPARSE = { checkin: { morning: 0.6, afternoon: 0.3, evening: 0.6 } }

export const SCENARIOS: Scenario[] = [
  { id: 'null', about: 'exactly zero effect', params: BASE, truth: new Map(), tracked: [TEST] },
  { id: 'large', about: 'a genuinely large beneficial effect (a full step)', params: BASE, truth: one('walk-ten', 'stress', { e: 1 }), tracked: [TEST] },
  { id: 'large-first', about: 'sensitivity, not judged: a full step on a move research ranks first, so the queue tests it from the start', params: BASE, truth: one('walk-ten', 'stress', { e: 1 }), tracked: [TEST], priors: { 'walk-ten': { effect: 0.6, strength: 'strong' } } },
  { id: 'moderate', about: 'a moderate effect (half a step)', params: BASE, truth: one('walk-ten', 'stress', { e: 0.5 }), tracked: [TEST] },
  { id: 'tiny', about: 'a tiny effect that must not consume endless testing', params: BASE, truth: one('walk-ten', 'stress', { e: 0.1 }), tracked: [TEST] },
  { id: 'harmful', about: 'a harmful effect', params: BASE, truth: one('walk-ten', 'stress', { e: -0.5 }), tracked: [TEST] },
  { id: 'noisy-null', about: 'noisy readings, no effect', params: with_({ noiseSd: 0.9 }), truth: new Map(), tracked: [TEST] },
  { id: 'noisy-large', about: 'noisy readings, a full step', params: with_({ noiseSd: 0.9 }), truth: one('walk-ten', 'stress', { e: 1 }), tracked: [TEST] },
  { id: 'rebound-null', about: 'strong regression toward the mean, no effect', params: with_({ rho: 0.8, stateSd: 0.9 }), truth: new Map(), tracked: [TEST] },
  { id: 'rebound-large', about: 'strong regression toward the mean, a full step', params: with_({ rho: 0.8, stateSd: 0.9 }), truth: one('walk-ten', 'stress', { e: 1 }), tracked: [TEST] },
  { id: 'rhythm-null', about: 'a strong daily rhythm, no move effect', params: with_({ rhythmScale: 3 }), truth: new Map(), tracked: [TEST] },
  { id: 'rhythm-large', about: 'a strong daily rhythm, a full step', params: with_({ rhythmScale: 3 }), truth: one('walk-ten', 'stress', { e: 1 }), tracked: [TEST] },
  { id: 'context-null', about: 'changing context making a false-looking overall association (office days rise from one to four a week at day 60), no effect', params: with_({ officeDays: 1, officeDaysLater: { from: 60, days: 4 } }), truth: new Map(), tracked: [TEST, { moveId: 'cyclic-sigh', target: 'stress' }] },
  { id: 'context-large', about: 'the same changing context, a full step', params: with_({ officeDays: 1, officeDaysLater: { from: 60, days: 4 } }), truth: one('walk-ten', 'stress', { e: 1 }), tracked: [TEST] },
  { id: 'with-her-only', about: 'a move that works only in one real context (with her, half the days)', params: with_({ withHer: 'half' }), truth: one('walk-ten', 'stress', { e: 1, only: 'withHer' }), tracked: [TEST] },
  { id: 'context-same', about: 'no true context difference (with her half the days), a full step', params: with_({ withHer: 'half' }), truth: one('walk-ten', 'stress', { e: 1 }), tracked: [TEST] },
  { id: 'sparse-null', about: 'sparse check-ins, no effect', params: with_(SPARSE), truth: new Map(), tracked: [TEST] },
  { id: 'sparse-large', about: 'sparse check-ins, a full step', params: with_(SPARSE), truth: one('walk-ten', 'stress', { e: 1 }), tracked: [TEST] },
  { id: 'missing-null', about: 'heavy and informative missingness (unseen, unanswered, missed check-ins more often on low days), no effect', params: with_({ ...SPARSE, seen: 0.7, unanswered: 0.3, missOnLowMood: 1, away: [20, 21, 22, 23, 24, 25, 26, 90, 91, 92, 93, 94] }), truth: new Map(), tracked: [TEST] },
  { id: 'missing-large', about: 'the same missingness, a full step', params: with_({ ...SPARSE, seen: 0.7, unanswered: 0.3, missOnLowMood: 1, away: [20, 21, 22, 23, 24, 25, 26, 90, 91, 92, 93, 94] }), truth: one('walk-ten', 'stress', { e: 1 }), tracked: [TEST] },
  { id: 'adherence-null', about: 'imperfect adherence that follows energy, no effect', params: with_({ adherenceOnEnergy: 1 }), truth: new Map(), tracked: [TEST] },
  { id: 'adherence-large', about: 'imperfect adherence that follows energy, a full step', params: with_({ adherenceOnEnergy: 1 }), truth: one('walk-ten', 'stress', { e: 1 }), tracked: [TEST] },
  { id: 'correlated-null', about: 'readings that move together closely, no effect', params: with_({ corr: 0.8 }), truth: new Map(), tracked: [TEST] },
  { id: 'every-checkin-null', about: 'same-day repeated observations, every check-in answered, no effect', params: with_({ checkin: { morning: 1, afternoon: 1, evening: 1 } }), truth: new Map(), tracked: [TEST] },
  {
    id: 'next-morning',
    about: 'a delayed next-morning effect: none at the next check-in',
    params: BASE,
    truth: one('green-walk', 'stress', { e: 1, window: 'nextMorning' }),
    tracked: [{ moveId: 'green-walk', target: 'stress' }, { moveId: 'green-walk', target: 'stress', window: 'nextMorning' }],
    declared: [{ moveId: 'green-walk', target: 'stress', window: 'nextMorning' }],
  },
  { id: 'multi-day', about: 'a multi-day effect with carryover', params: BASE, truth: one('next-week-costs', 'stress', { e: 1, carry: 0.8 }), tracked: [{ moveId: 'next-week-costs', target: 'stress' }] },
  { id: 'change', about: 'a response that changes after several months (a full step that stops on day 120)', params: BASE, truth: one('walk-ten', 'stress', { e: 1, change: { day: 120, e: 0 } }), tracked: [TEST] },
  { id: 'prior-zero', about: 'a misleading research prior (+1, strong) against no effect', params: BASE, truth: new Map(), tracked: [TEST], priors: { 'walk-ten': { effect: 1, strength: 'strong' } } },
  { id: 'prior-harm', about: 'a misleading research prior (+1, strong) against harm (−0.5)', params: BASE, truth: one('walk-ten', 'stress', { e: -0.5 }), tracked: [TEST], priors: { 'walk-ten': { effect: 1, strength: 'strong' } } },
  {
    id: 'pool-split',
    about: 'two moves sharing tags: one a full step, one nothing',
    params: BASE,
    truth: new Map([['cyclic-sigh', { stress: { e: 1 } }]]),
    tracked: [{ moveId: 'cyclic-sigh', target: 'stress' }, { moveId: 'talk-to-yourself-by-name', target: 'stress' }],
  },
  {
    id: 'pool-same',
    about: 'two moves sharing tags, both half a step',
    params: BASE,
    truth: new Map([
      ['cyclic-sigh', { stress: { e: 0.5 } }],
      ['talk-to-yourself-by-name', { stress: { e: 0.5 } }],
    ]),
    tracked: [{ moveId: 'cyclic-sigh', target: 'stress' }, { moveId: 'talk-to-yourself-by-name', target: 'stress' }],
  },
  {
    id: 'mixed',
    about: 'many candidate patterns at once: a realistic catalogue, most moves with no effect and a few real',
    params: BASE,
    truth: new Map<string, Partial<Record<ReadingId, TrueEffect>>>([
      ['walk-ten', { stress: { e: 1 } }],
      ['nap-ten', { energy: { e: 1 } }],
      ['cyclic-sigh', { stress: { e: 0.5 } }],
      ['glass-of-water', { energy: { e: 0.5 } }],
      ['music-on-purpose', { mood: { e: 0.5 } }],
      ['one-surface', { overwhelm: { e: 0.1 } }],
      ['brain-dump', { overwhelm: { e: -0.5 } }],
    ]),
    tracked: [TEST, { moveId: 'nap-ten', target: 'energy' }, { moveId: 'cyclic-sigh', target: 'stress' }, { moveId: 'glass-of-water', target: 'energy' }, { moveId: 'music-on-purpose', target: 'mood' }, { moveId: 'brain-dump', target: 'overwhelm' }],
  },
]

export const scenarioById = (id: string): Scenario => {
  const s = SCENARIOS.find((x) => x.id === id)
  if (!s) throw new Error(`no scenario ${id}`)
  return s
}
