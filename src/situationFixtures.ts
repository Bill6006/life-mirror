import { hasMove } from './catalogue'
import type { Fact, FactSheet } from './facts'
import { admitted } from './library'

// Test fixtures, never imported by the app: for each of the judgment engine's situations, the
// smallest fact sheet that makes it true. The firmness tests (Pass 2) render every situation this
// way, in every mode, and hold what it says fixed while only its delivery changes. Generic names.

const DAY = '2026-09-21'

export function sheetOf(facts: Fact[], hour = 8, day = DAY, days = 22): FactSheet {
  return { version: 1, day, builtAt: '', hour, weeks: 3, days, direction: null, said: [], facts }
}

const today = (weekday = 'Friday'): Fact => ({ id: 'week.today', tags: [], text: `Today is ${weekday}.`, values: { weekday, bedtime: '20:00', hour: 8 } })
const aim = (values: Record<string, number | string | null> = {}): Fact => ({ id: 'aim.1', tags: ['study'], text: '', values: { kind: 'certification', name: 'Italian', step: 'Twenty words', skill: 'Twenty words', minutes: 10, gapDays: null, blocked: null, plan: null, planStarted: 0, open: 0, doneToday: 0, skills: 1, ...values } })
const fact = (id: string, values: Record<string, number | string | null>, extra: Partial<Fact> = {}): Fact => ({ id, tags: [], text: '', values, ...extra })

/** A move an admitted card names and the catalogue holds: the propose-test situation needs one. */
function testableMove(): string {
  for (const c of admitted()) for (const m of c.moves ?? []) if (hasMove(m)) return m
  throw new Error('no admitted card names a catalogue move')
}

/** Each situation's smallest true sheet. */
export const SITUATION_SHEETS: Readonly<Record<string, () => FactSheet>> = {
  stretch: () => sheetOf([today(), fact('stretch', { under: 4, of: 6, chips: 1, necessities: 0 }, { n: 6 })]),
  'necessities-missed': () => sheetOf([today(), fact('necessities.3d', { misses: 2 }, { n: 3 })]),
  'loneliness-high': () => sheetOf([today(), fact('context.loneliness', { position: 4, word: 'Lonely' })]),
  'cue-switch': () => sheetOf([today(), aim({ cue_afterPickup_n: 4, cue_afterPickup_started: 1, cue_afterBedtime_n: 2, cue_afterBedtime_started: 2, plan: 'afterPickup' })]),
  'first-skill': () => sheetOf([today(), aim({ skills: 0, skill: null, step: 'No current skill yet' })]),
  'caffeine-sleep-shorter': () => sheetOf([today(), fact('assoc.caffeine.bands', { groups: 2, none: 0, minutes: -40, quality: null, low: 'none', high: '200 mg or more', n: 6, m: 5 })]),
  'step-stalled': () => sheetOf([today(), aim({ gapDays: 9 })]),
  'nap-read': () => sheetOf([today(), fact('assoc.napped', { times: 5, diff: -6 }, { tier: 'promising' })]),
  'workout-evenings': () => sheetOf([today(), fact('assoc.workouts', { times: 4, diff: 7 })]),
  'workout-flat': () => sheetOf([today(), fact('assoc.workouts', { times: 4, diff: -2 })]),
  'social-recovery': () => sheetOf([today(), fact('assoc.bigSocial', { times: 3, diff: -5 })]),
  'cue-holds': () => sheetOf([today(), aim({ cue_afterBedtime_n: 4, cue_afterBedtime_started: 4, plan: 'afterBedtime' })]),
  'say-when': () => sheetOf([today(), aim()]),
  'afternoon-walk': () => sheetOf([today(), fact('usual.afternoon', { point: 40 })]),
  'partly-honest': () => sheetOf([today(), fact('offers.7d', { partly: 3 })]),
  'card-long-unclear': () => sheetOf([today(), fact('test.1', { n: 12, move: 'A short walk', alternative: 'nothing extra' }, { tier: 'unclear' })]),
  'card-promising': () => sheetOf([today(), fact('test.2', { n: 8, move: 'A short walk', alternative: 'nothing extra' }, { tier: 'promising' })]),
  'caffeine-late': () => sheetOf([today(), fact('caffeine.late', { when: 'today', band: '200 mg or more', block: 'afternoon', time: '3:10 PM', mg: 400, hours: 6 })]),
  'church-morning': () => sheetOf([today(), fact('lastNight', { key: 'churchDay', with: 48, without: 60, n: 4 })]),
  'steady-moving': () => sheetOf([today(), fact('steady', { inside: 5, of: 6 }), aim({ gapDays: 2 })]),
  'fresh-start': () => sheetOf([today('Monday'), aim({ gapDays: 6 })]),
  'nothing-holds': () => sheetOf([today(), fact('nothing', { done: 3, offered: 5 })]),
  'direction-counts': () => sheetOf([today(), fact('direction', { direction: 'One line, mine' }), fact('becoming', { study: 4, conversations: 2, faith: 1, her: 5 })]),
  'forecast-wide': () => sheetOf([today(), fact('forecast.afternoon', { width: 32, actual: null, block: 'afternoon', lo: 30, hi: 62 })]),
  'caffeine-sleep-even': () => sheetOf([today(), fact('assoc.caffeine.bands', { groups: 2, none: 1, low: 'none', high: '200 mg or more', n: 6, m: 5 })]),
  'commitment-fading': () => sheetOf([today(), aim(), fact('trajectory.1', { aimId: 1, name: 'Italian', w3: 2, w2: 1, w1: 0, w0: 0, ageDays: 30 })]),
  'commitment-thinning': () => sheetOf([today(), aim(), fact('trajectory.1', { aimId: 1, name: 'Italian', w3: 1, w2: 2, w1: 3, w0: 0, ageDays: 20 })]),
  'cadence-dropping': () => sheetOf([today(), fact('cadence', { depth: 'full', lowDemand: 0, w2: 12, w1: 12, w0: 4 })]),
  'loop-closed': () => sheetOf([today(), fact('followup', { aimId: 1, about: 'Italian', started: 1, done: 0, changed: 0 })]),
  'loop-planned': () => sheetOf([today(), aim(), fact('followup', { aimId: 1, about: 'Italian', planned: 1, missed: 1, started: 0, done: 0, changed: 0 })]),
  'loop-open': () => sheetOf([today(), aim(), fact('followup', { aimId: 1, about: 'Italian', planned: 0, started: 0, done: 0, changed: 0 })]),
  'short-night-today': () => sheetOf([today(), fact('today.shortSleep', { word: 'Short' })]),
  'short-sleep-afternoons': () => sheetOf([today(), fact('assoc.shortSleep', { times: 4, diff: -5 })]),
  'propose-test': () => sheetOf([today(), fact('untested', { moves: testableMove() })]),
}
