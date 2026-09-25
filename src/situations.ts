import type { LineAction, Mode } from './brainShared'
import { daysBetween } from './blocks'
import { hasMove, moveById } from './catalogue'
import { copy } from './copy'
import { factById, factsWhere, num, str, type Fact, type FactSheet } from './facts'
import { fill } from './format'
import { deliver, deliverySignals, firmnessFor, type Firmness, type FirmnessPref } from './firmness'
import { admitted, bestGrade, cardById, gradeWeight, gradeWord } from './library'

// The judgment engine on the phone: situations worth speaking to, each a test over the fact
// sheet, linked to claim cards, carrying a mode and a line with slots. Every morning the ones
// that are true are scored by the strength of their facts, the grade of their evidence, novelty
// and how you received them before, and the best one is said. Nothing here is a verdict; the
// mode comes from the situation, never from a tone.

export interface Match {
  factIds: string[]
  /** How much the facts behind it warrant saying it, 0 to 1. */
  strength: number
  vars: Record<string, string>
  /** The one tap that does what the line says, when there is one. */
  action?: LineAction
  /** The cards behind this match, when they depend on what was found rather than on the situation. */
  cardIds?: string[]
}

export interface Situation {
  id: string
  mode: Mode
  cards: readonly string[]
  /** Days before the same situation may be said again. */
  cooldownDays: number
  /** A pattern over days rather than a fact of one day: only these may supply the week's "One change". */
  weekly?: true
  test: (s: FactSheet) => Match | null
}

export interface Choice {
  situationId: string
  mode: Mode
  text: string
  factIds: string[]
  cardIds: string[]
  score: number
  action: LineAction | null
  /** How firmly it is said (Pass 2): set only when a How firm setting is passed, once its gate is open. */
  firmness?: Firmness
}

export interface SaidBefore {
  day: string
  situationId: string | null
}

export interface FeedbackBefore {
  situationId: string | null
  answer: 'useful' | 'knew' | 'not'
  /** For a tap on the brain's own line: the facts that line cited. */
  factIds?: readonly string[]
}

/** Facts nearly any line leans on for its framing: sharing one says nothing about what a line was about. */
const FRAMING = new Set(['record', 'week.today', 'week.tomorrow', 'week.yesterday', 'direction', 'cadence'])

const CUES = ['afterPickup', 'afterBedtime', 'nextCheckIn'] as const
type Cue = (typeof CUES)[number]
const LINES: Record<string, string> = copy.brain.lines
const cueLabel = (cue: Cue) => copy.aims.cues[cue]
const signed = (v: number) => (v > 0 ? `+${v}` : String(v))
const s = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v))

function aims(sheet: FactSheet): Fact[] {
  return factsWhere(sheet, 'aim.')
}

/** A commitment its rhythm leaves alone today: a rest day, or a week whose sessions are in. Nothing nudges it (Part 39). */
function restful(f: Fact): boolean {
  const due = str(f, 'due')
  return due !== 'resting' && due !== 'notDue'
}

function cueOf(f: Fact, cue: Cue): { n: number; started: number } {
  return { n: num(f, `cue_${cue}_n`) ?? 0, started: num(f, `cue_${cue}_started`) ?? 0 }
}

/** The cue with the best record other than this one; failing any record, after her bedtime, or the next check-in when that is the one that stalls. */
function otherCue(f: Fact, cue: Cue): Cue {
  let best: Cue | null = null
  let rate = -1
  for (const c of CUES) {
    if (c === cue) continue
    const r = cueOf(f, c)
    if (r.n && r.started / r.n > rate) {
      best = c
      rate = r.started / r.n
    }
  }
  return best ?? (cue === 'afterBedtime' ? 'nextCheckIn' : 'afterBedtime')
}

const aimIdOf = (f: Fact): number => Number(f.id.split('.')[1])

/** The cue to pin a step to: the one with the best record of being kept, or after her bedtime when none has a record. */
function bestCue(f: Fact): Cue {
  let best: Cue = 'afterBedtime'
  let rate = -1
  for (const c of CUES) {
    const r = cueOf(f, c)
    if (r.n && r.started / r.n > rate) {
      best = c
      rate = r.started / r.n
    }
  }
  return best
}

const assoc = (sheet: FactSheet, id: string, min: number): Fact | null => {
  const f = factById(sheet, id)
  return f && (num(f, 'times') ?? 0) >= min && num(f, 'diff') !== null ? f : null
}

export const SITUATIONS: readonly Situation[] = [
  {
    id: 'stretch',
    mode: 'warning',
    cards: ['behavioural-activation'],
    cooldownDays: 2,
    test: (sheet) => {
      const f = factById(sheet, 'stretch')
      return f ? { factIds: [f.id], strength: 1, vars: { under: s(num(f, 'under')), of: s(num(f, 'of')) } } : null
    },
  },
  {
    id: 'necessities-missed',
    mode: 'warning',
    cards: ['behavioural-activation'],
    cooldownDays: 3,
    test: (sheet) => {
      const f = factById(sheet, 'necessities.3d')
      const n = num(f, 'misses') ?? 0
      return f && n >= 2 ? { factIds: [f.id], strength: 0.8, vars: { n: s(n) } } : null
    },
  },
  {
    id: 'loneliness-high',
    mode: 'recommendation',
    cards: ['weak-ties-and-belonging', 'talking-to-strangers', 'loneliness-and-mortality'],
    cooldownDays: 2,
    test: (sheet) => {
      const f = factById(sheet, 'context.loneliness')
      return f && (num(f, 'position') ?? 0) >= 4 ? { factIds: [f.id], strength: 0.9, vars: { word: s(str(f, 'word')) } } : null
    },
  },
  {
    id: 'cue-switch',
    weekly: true,
    mode: 'strategy',
    cards: ['implementation-intentions', 'habit-formation-time'],
    cooldownDays: 7,
    test: (sheet) => {
      for (const a of aims(sheet)) {
        for (const cue of CUES) {
          const r = cueOf(a, cue)
          if (r.n >= 3 && r.started / r.n <= 0.34) return { factIds: [a.id], strength: 0.9, vars: { cue: cueLabel(cue), started: s(r.started), n: s(r.n), other: cueLabel(otherCue(a, cue)).toLowerCase() }, action: { kind: 'plan', aimId: aimIdOf(a), cue: otherCue(a, cue) } }
        }
      }
      return null
    },
  },
  {
    id: 'first-skill',
    weekly: true,
    mode: 'recommendation',
    cards: [],
    cooldownDays: 3,
    test: (sheet) => {
      // Something to learn with no current skill named: nothing can start until it is (Workstream 6).
      const a = aims(sheet).find((f) => str(f, 'kind') === 'certification' && str(f, 'skill') === null)
      return a ? { factIds: [a.id], strength: 0.9, vars: { name: s(str(a, 'name')) } } : null
    },
  },
  {
    // Next nights shorter or rougher after days with more caffeine reported, like for like; only from two groups of five.
    id: 'caffeine-sleep-shorter',
    weekly: true,
    mode: 'warning',
    cards: ['caffeine-sleep-cutoffs', 'caffeine-half-life'],
    cooldownDays: 10,
    test: (sheet) => {
      const f = factById(sheet, 'assoc.caffeine.bands')
      if (!f || (num(f, 'groups') ?? 0) < 2 || num(f, 'none') === 1) return null
      const minutes = num(f, 'minutes')
      const quality = num(f, 'quality')
      const what =
        minutes !== null && minutes <= -30
          ? fill(copy.caffeine.shorterHours, { minutes: s(Math.abs(minutes)) })
          : quality !== null && quality <= -0.5
            ? fill(copy.caffeine.lowerQuality, { q: s(Math.abs(quality)) })
            : null
      return what ? { factIds: [f.id], strength: 0.8, vars: { what, low: s(str(f, 'low')), high: s(str(f, 'high')), n: s(num(f, 'n')), m: s(num(f, 'm')) } } : null
    },
  },
  {
    id: 'step-stalled',
    weekly: true,
    mode: 'challenge',
    cards: ['self-compassion-after-lapse', 'habit-formation-time'],
    cooldownDays: 5,
    test: (sheet) => {
      const stalled = aims(sheet)
        .filter((f) => num(f, 'faith') !== 1 && restful(f))
        .map((f) => ({ f, d: num(f, 'gapDays') ?? -1 }))
        .filter((x) => x.d >= 7)
        .sort((a, b) => b.d - a.d)[0]
      return stalled ? { factIds: [stalled.f.id], strength: Math.min(1, stalled.d / 14), vars: { name: s(str(stalled.f, 'name')), d: s(stalled.d) }, action: { kind: 'plan', aimId: aimIdOf(stalled.f), cue: bestCue(stalled.f) } } : null
    },
  },
  {
    id: 'nap-read',
    mode: 'observation',
    cards: ['naps-cognition', 'sleep-inertia-after-naps'],
    cooldownDays: 14,
    test: (sheet) => {
      const f = assoc(sheet, 'assoc.napped', 4)
      return f ? { factIds: [f.id], strength: f.tier === 'promising' ? 0.8 : 0.5, vars: { diff: signed(num(f, 'diff') as number), n: s(num(f, 'times')) } } : null
    },
  },
  {
    id: 'workout-evenings',
    mode: 'encouragement',
    cards: ['exercise-depression', 'exercise-and-sleep'],
    cooldownDays: 14,
    test: (sheet) => {
      const f = assoc(sheet, 'assoc.workouts', 3)
      const diff = f ? (num(f, 'diff') as number) : 0
      return f && diff > 0 ? { factIds: [f.id], strength: 0.7, vars: { diff: signed(diff), n: s(num(f, 'times')) } } : null
    },
  },
  {
    id: 'workout-flat',
    mode: 'observation',
    cards: ['exercise-depression'],
    cooldownDays: 21,
    test: (sheet) => {
      const f = assoc(sheet, 'assoc.workouts', 3)
      const diff = f ? (num(f, 'diff') as number) : 1
      return f && diff <= 0 ? { factIds: [f.id], strength: 0.4, vars: { diff: signed(diff), n: s(num(f, 'times')) } } : null
    },
  },
  {
    id: 'social-recovery',
    mode: 'perspective',
    cards: ['acting-extraverted-costs-later'],
    cooldownDays: 14,
    test: (sheet) => {
      const f = assoc(sheet, 'assoc.bigSocial', 3)
      const diff = f ? (num(f, 'diff') as number) : 0
      return f && diff < 0 ? { factIds: [f.id], strength: 0.7, vars: { diff: s(Math.abs(diff)), n: s(num(f, 'times')) } } : null
    },
  },
  {
    id: 'cue-holds',
    mode: 'encouragement',
    cards: ['implementation-intentions', 'monitoring-progress'],
    cooldownDays: 7,
    test: (sheet) => {
      for (const a of aims(sheet)) {
        for (const cue of CUES) {
          const r = cueOf(a, cue)
          if (r.n >= 4 && r.started / r.n >= 0.75) return { factIds: [a.id], strength: 0.6, vars: { cue: cueLabel(cue), started: s(r.started), n: s(r.n) } }
        }
      }
      return null
    },
  },
  {
    id: 'say-when',
    mode: 'recommendation',
    cards: ['implementation-intentions'],
    cooldownDays: 3,
    test: (sheet) => {
      const today = factById(sheet, 'week.today')
      if (!today) return null
      const bedtime = str(today, 'bedtime')
      if (bedtime && sheet.hour >= Number(bedtime.split(':')[0])) return null
      // Never a faith practice (Rule 10), and never on a rest day or a week whose rhythm is met (Part 39).
      const a = aims(sheet).find((f) => str(f, 'plan') === null && num(f, 'open') === 0 && num(f, 'doneToday') !== 1 && restful(f) && num(f, 'faith') !== 1 && (num(f, 'gapDays') ?? 1) >= 1 && (str(f, 'kind') !== 'certification' || str(f, 'skill') !== null))
      return a ? { factIds: [a.id, today.id], strength: 0.6, vars: { name: s(str(a, 'name')), step: s(str(a, 'step')) }, action: { kind: 'plan', aimId: aimIdOf(a), cue: bestCue(a) } } : null
    },
  },
  {
    id: 'afternoon-walk',
    weekly: true,
    mode: 'recommendation',
    cards: ['short-walk-mood', 'post-lunch-dip'],
    cooldownDays: 7,
    test: (sheet) => {
      const f = factById(sheet, 'usual.afternoon')
      const point = num(f, 'point')
      return f && point !== null && point <= 45 && sheet.hour < 12 ? { factIds: [f.id], strength: 0.6, vars: { point: s(point) } } : null
    },
  },
  {
    id: 'partly-honest',
    mode: 'perspective',
    cards: ['small-wins-progress', 'goal-setting-specific'],
    cooldownDays: 14,
    test: (sheet) => {
      const f = factById(sheet, 'offers.7d')
      const n = num(f, 'partly') ?? 0
      return f && n >= 3 ? { factIds: [f.id], strength: 0.6, vars: { n: s(n) } } : null
    },
  },
  {
    id: 'card-long-unclear',
    weekly: true,
    mode: 'challenge',
    cards: ['sunk-cost'],
    cooldownDays: 21,
    test: (sheet) => {
      const c = factsWhere(sheet, 'test.').find((f) => (num(f, 'n') ?? 0) >= 12 && (f.tier === 'little' || f.tier === 'unclear'))
      return c ? { factIds: [c.id], strength: 0.6, vars: { move: s(str(c, 'move')), alt: s(str(c, 'alternative')), n: s(num(c, 'n')) } } : null
    },
  },
  {
    id: 'card-promising',
    mode: 'observation',
    cards: [],
    cooldownDays: 14,
    test: (sheet) => {
      const c = factsWhere(sheet, 'test.').find((f) => f.tier === 'promising' || f.tier === 'holdsUp')
      return c ? { factIds: [c.id], strength: 0.6, vars: { move: s(str(c, 'move')), alt: s(str(c, 'alternative')), tier: c.tier === 'holdsUp' ? 'holds up' : 'promising', n: s(num(c, 'n')) } } : null
    },
  },
  {
    // Fired only by a reported band of 100 mg or more, never by silence; no bedtime is assumed.
    id: 'caffeine-late',
    mode: 'warning',
    cards: ['caffeine-sleep-cutoffs', 'caffeine-six-hours'],
    cooldownDays: 3,
    test: (sheet) => {
      const f = factById(sheet, 'caffeine.late')
      if (!f) return null
      const when = str(f, 'when') === 'today' ? copy.when.today : copy.when.yesterday
      return { factIds: [f.id], strength: 0.6, vars: { when: when.charAt(0).toUpperCase() + when.slice(1), band: s(str(f, 'band')), block: s(str(f, 'block')), time: s(str(f, 'time')), mg: s(num(f, 'mg')), hours: s(num(f, 'hours')) } }
    },
  },
  {
    id: 'church-morning',
    mode: 'perspective',
    cards: ['religious-attendance-and-health', 'acting-extraverted-costs-later'],
    cooldownDays: 7,
    test: (sheet) => {
      const f = factById(sheet, 'lastNight')
      return f && str(f, 'key') === 'churchDay' && num(f, 'with') !== null ? { factIds: [f.id], strength: 0.5, vars: { with: s(num(f, 'with')), without: s(num(f, 'without')), n: s(num(f, 'n')) } } : null
    },
  },
  {
    id: 'steady-moving',
    mode: 'encouragement',
    cards: ['monitoring-progress'],
    cooldownDays: 7,
    test: (sheet) => {
      const f = factById(sheet, 'steady')
      const moved = aims(sheet).find((a) => (num(a, 'gapDays') ?? 99) <= 3)
      return f && (num(f, 'inside') ?? 0) >= 5 && moved ? { factIds: [f.id, moved.id], strength: 0.5, vars: { inside: s(num(f, 'inside')), of: s(num(f, 'of')), name: s(str(moved, 'name')) } } : null
    },
  },
  {
    id: 'fresh-start',
    mode: 'encouragement',
    cards: ['fresh-start-effect'],
    cooldownDays: 7,
    test: (sheet) => {
      const today = factById(sheet, 'week.today')
      const weekday = str(today, 'weekday')
      if (!today || !(weekday === 'Monday' || sheet.day.endsWith('-01'))) return null
      const stalled = aims(sheet)
        .filter((f) => num(f, 'faith') !== 1 && restful(f))
        .map((f) => ({ f, d: num(f, 'gapDays') ?? -1 }))
        .filter((x) => x.d >= 5)
        .sort((a, b) => b.d - a.d)[0]
      return stalled ? { factIds: [today.id, stalled.f.id], strength: 0.5, vars: { weekday: s(weekday), name: s(str(stalled.f, 'name')), d: s(stalled.d) } } : null
    },
  },
  {
    id: 'nothing-holds',
    mode: 'perspective',
    cards: ['micro-breaks'],
    cooldownDays: 21,
    test: (sheet) => {
      const f = factById(sheet, 'nothing')
      const done = num(f, 'done') ?? 0
      const offered = num(f, 'offered') ?? 0
      return f && done >= 3 && done / offered >= 0.5 ? { factIds: [f.id], strength: 0.5, vars: { done: s(done), offered: s(offered) } } : null
    },
  },
  {
    id: 'direction-counts',
    mode: 'perspective',
    cards: ['monitoring-progress'],
    cooldownDays: 30,
    test: (sheet) => {
      const d = factById(sheet, 'direction')
      const b = factById(sheet, 'becoming')
      // A week of record first: counts of nothing under a direction are not worth a line.
      return d && b && sheet.days >= 7 ? { factIds: [d.id, b.id], strength: 0.5, vars: { direction: s(str(d, 'direction')), study: s(num(b, 'study')), conversations: s(num(b, 'conversations')), faith: s(num(b, 'faith')), her: s(num(b, 'her')) } } : null
    },
  },
  {
    id: 'forecast-wide',
    mode: 'perspective',
    cards: [],
    cooldownDays: 14,
    test: (sheet) => {
      const f = factsWhere(sheet, 'forecast.').find((x) => (num(x, 'width') ?? 0) >= 30 && num(x, 'actual') === null)
      return f ? { factIds: [f.id], strength: 0.4, vars: { block: s(str(f, 'block')), lo: s(num(f, 'lo')), hi: s(num(f, 'hi')) } } : null
    },
  },
  {
    // The fixed null wording: no difference showing is never "does not affect".
    id: 'caffeine-sleep-even',
    weekly: true,
    mode: 'observation',
    cards: ['caffeine-diary-understates-sleep'],
    cooldownDays: 21,
    test: (sheet) => {
      const f = factById(sheet, 'assoc.caffeine.bands')
      return f && (num(f, 'groups') ?? 0) >= 2 && num(f, 'none') === 1 ? { factIds: [f.id], strength: 0.4, vars: { low: s(str(f, 'low')), high: s(str(f, 'high')), n: s(num(f, 'n')), m: s(num(f, 'm')) } } : null
    },
  },
  {
    // Two weeks of nothing after two weeks of something: where a commitment is usually let go, and the earliest place it shows.
    id: 'commitment-fading',
    weekly: true,
    mode: 'challenge',
    cards: ['implementation-intentions', 'self-compassion-after-lapse'],
    cooldownDays: 7,
    test: (sheet) => {
      const t = factsWhere(sheet, 'trajectory.')
        .map((f) => ({ f, before: (num(f, 'w3') ?? 0) + (num(f, 'w2') ?? 0), lately: (num(f, 'w1') ?? 0) + (num(f, 'w0') ?? 0) }))
        .filter((x) => x.before >= 2 && x.lately === 0 && (num(x.f, 'ageDays') ?? 0) >= 21 && num(factById(sheet, `aim.${num(x.f, 'aimId')}`), 'faith') !== 1)
        .sort((a, b) => b.before - a.before)[0]
      if (!t) return null
      const aim = factById(sheet, `aim.${num(t.f, 'aimId')}`)
      return { factIds: aim ? [t.f.id, aim.id] : [t.f.id], strength: 0.85, vars: { name: s(str(t.f, 'name')), before: s(t.before) }, ...(aim ? { action: { kind: 'plan' as const, aimId: aimIdOf(aim), cue: bestCue(aim) } } : {}) }
    },
  },
  {
    id: 'commitment-thinning',
    weekly: true,
    mode: 'strategy',
    cards: ['habit-formation-time', 'implementation-intentions'],
    cooldownDays: 7,
    test: (sheet) => {
      const t = factsWhere(sheet, 'trajectory.')
        .filter((f) => (num(f, 'w1') ?? 0) >= 2 && num(f, 'w0') === 0 && (num(f, 'ageDays') ?? 0) >= 14 && num(factById(sheet, `aim.${num(f, 'aimId')}`), 'faith') !== 1)
        .sort((a, b) => (num(b, 'w1') ?? 0) - (num(a, 'w1') ?? 0))[0]
      if (!t) return null
      const aim = factById(sheet, `aim.${num(t, 'aimId')}`)
      return { factIds: aim ? [t.id, aim.id] : [t.id], strength: 0.7, vars: { name: s(str(t, 'name')), before: s(num(t, 'w1')) }, ...(aim ? { action: { kind: 'plan' as const, aimId: aimIdOf(aim), cue: bestCue(aim) } } : {}) }
    },
  },
  {
    // Logging less is the earliest sign of letting the whole record go; a lighter check-in keeps it alive.
    id: 'cadence-dropping',
    weekly: true,
    mode: 'strategy',
    cards: ['monitoring-progress', 'habit-formation-time'],
    cooldownDays: 7,
    test: (sheet) => {
      const f = factById(sheet, 'cadence')
      if (!f || str(f, 'depth') !== 'full' || num(f, 'lowDemand') === 1) return null
      const usual = Math.round(((num(f, 'w2') ?? 0) + (num(f, 'w1') ?? 0)) / 2)
      const now = num(f, 'w0') ?? 0
      return usual >= 6 && now <= usual / 2 ? { factIds: [f.id], strength: 0.85, vars: { usual: s(usual), now: s(now) }, action: { kind: 'depth', value: 'short' } } : null
    },
  },
  {
    id: 'loop-closed',
    mode: 'encouragement',
    cards: ['monitoring-progress'],
    cooldownDays: 3,
    test: (sheet) => {
      const f = factById(sheet, 'followup')
      if (!f || num(f, 'aimId') === null) return null
      const started = num(f, 'started') ?? 0
      const done = num(f, 'done') ?? 0
      const changed = num(f, 'changed') ?? 0
      if (started + done + changed === 0) return null
      const what = [started ? `${started} ${started === 1 ? 'step' : 'steps'} started` : null, done ? `${done} marked done` : null, changed ? `the current skill changed ${changed === 1 ? 'once' : `${changed} times`}` : null].filter(Boolean).join(', ')
      return { factIds: [f.id], strength: 0.55, vars: { name: s(str(f, 'about')), what } }
    },
  },
  {
    id: 'loop-planned',
    mode: 'perspective',
    cards: ['intention-behaviour-gap', 'implementation-intentions'],
    cooldownDays: 4,
    test: (sheet) => {
      const f = factById(sheet, 'followup')
      if (!f || num(f, 'aimId') === null || str(f, 'received') === 'not') return null
      const missed = num(f, 'missed') ?? 0
      if (missed === 0 || (num(f, 'started') ?? 0) + (num(f, 'done') ?? 0) + (num(f, 'changed') ?? 0) > 0) return null
      const aim = factById(sheet, `aim.${num(f, 'aimId')}`)
      if (aim && str(aim, 'plan') !== null) return null
      return { factIds: aim ? [f.id, aim.id] : [f.id], strength: 0.65, vars: { name: s(str(f, 'about')) }, ...(aim ? { action: { kind: 'plan' as const, aimId: aimIdOf(aim), cue: bestCue(aim) } } : {}) }
    },
  },
  {
    id: 'loop-open',
    mode: 'perspective',
    cards: ['intention-behaviour-gap'],
    cooldownDays: 4,
    test: (sheet) => {
      const f = factById(sheet, 'followup')
      if (!f || num(f, 'aimId') === null || str(f, 'received') === 'not') return null
      if ((num(f, 'planned') ?? 0) + (num(f, 'started') ?? 0) + (num(f, 'done') ?? 0) + (num(f, 'changed') ?? 0) > 0) return null
      const aim = factById(sheet, `aim.${num(f, 'aimId')}`)
      return { factIds: aim ? [f.id, aim.id] : [f.id], strength: 0.6, vars: { name: s(str(f, 'about')) }, ...(aim ? { action: { kind: 'plan' as const, aimId: aimIdOf(aim), cue: bestCue(aim) } } : {}) }
    },
  },
  {
    id: 'short-night-today',
    mode: 'perspective',
    cards: ['sleep-loss-mood', 'naps-cognition', 'sleep-inertia-after-naps'],
    cooldownDays: 3,
    test: (sheet) => {
      const f = factById(sheet, 'today.shortSleep')
      return f ? { factIds: [f.id], strength: 0.7, vars: { word: s(str(f, 'word')) } } : null
    },
  },
  {
    id: 'short-sleep-afternoons',
    mode: 'observation',
    cards: ['sleep-loss-mood', 'sleep-regularity'],
    cooldownDays: 14,
    test: (sheet) => {
      const f = assoc(sheet, 'assoc.shortSleep', 4)
      return f ? { factIds: [f.id], strength: f.tier === 'promising' ? 0.8 : 0.55, vars: { diff: signed(num(f, 'diff') as number), n: s(num(f, 'times')) } } : null
    },
  },
  {
    // A quiet day's line: something the library backs and the record has never tested, one tap to set.
    id: 'propose-test',
    weekly: true,
    mode: 'recommendation',
    cards: [],
    cooldownDays: 10,
    test: (sheet) => {
      const f = factById(sheet, 'untested')
      const open = String(f?.values.moves ?? '').split(',').filter(Boolean)
      if (!f || !open.length) return null
      const order = { A: 0, B: 1, C: 2, D: 3 }
      for (const card of admitted().sort((a, b) => order[a.grade] - order[b.grade])) {
        const moveId = (card.moves ?? []).find((m) => open.includes(m) && hasMove(m))
        if (moveId) return { factIds: [f.id], strength: 0.45, vars: { grade: gradeWord(card.grade), move: moveById(moveId).name }, action: { kind: 'test', moveId }, cardIds: [card.id] }
      }
      return null
    },
  },
]

/**
 * How you received a situation before: useful lifts it, knew it and not useful lower it, within
 * bounds. A tap on the brain's own line counts toward every situation resting on one of the same
 * facts, framing aside, so it reaches the phone's ranking too (Part 33).
 */
export function usefulness(id: string, feedback: readonly FeedbackBefore[], citing: readonly string[] = []): number {
  const about = citing.filter((f) => !FRAMING.has(f))
  const own = feedback.filter((f) => f.situationId === id || (f.situationId === null && (f.factIds ?? []).some((x) => about.includes(x))))
  const v = 1 + Math.min(0.3, own.filter((f) => f.answer === 'useful').length * 0.1) - own.filter((f) => f.answer === 'not').length * 0.2 - own.filter((f) => f.answer === 'knew').length * 0.1
  return Math.max(0.3, Math.min(1.3, v))
}

/** Whether a situation may supply the week's "One change": a pattern over days, never a fact of one day. */
export function isWeekScoped(sit: Situation): boolean {
  return sit.weekly === true
}

/**
 * A situation's words at a firmness (Pass 2): its template with each delivery choice resolved,
 * then its facts filled in. With no setting (the gate closed) it is said balanced, the line as it
 * has always read. The setting changes the delivery alone: the facts, the cards, the action and
 * the score come from the same match whatever it is.
 */
function said(sit: Situation, m: Match, cards: readonly string[], sheet: FactSheet, firm: FirmnessPref | null | undefined): { text: string; firmness?: Firmness } {
  if (!firm) return { text: fill(deliver(LINES[sit.id] ?? '', 'balanced'), m.vars) }
  const grades = cards.map((id) => cardById(id)).flatMap((c) => (c && c.status === 'admitted' ? [c.grade] : []))
  const firmness = firmnessFor(firm, deliverySignals(sit.mode, m.factIds, grades, sheet))
  return { text: fill(deliver(LINES[sit.id] ?? '', firmness), m.vars), firmness }
}

/** What one situation says of the sheet now, if it still holds: the same rendering the choice gives it, without cooldown or scoring. */
export function lineFor(sheet: FactSheet, situationId: string, firm?: FirmnessPref | null): Omit<Choice, 'score'> | null {
  const sit = SITUATIONS.find((x) => x.id === situationId)
  const m = sit?.test(sheet)
  if (!sit || !m) return null
  const cards = m.cardIds ?? [...sit.cards]
  return { situationId: sit.id, mode: sit.mode, ...said(sit, m, cards, sheet, firm), factIds: m.factIds, cardIds: cards, action: m.action ?? null }
}

/**
 * Every true situation that is not resting, scored and ranked best first (Part 28): the strength
 * of its facts, the grade of its evidence, novelty, and how it was received before. The phone's
 * line is the first; the sheet carries the first few for a writer to read before the pile.
 */
export function rankLines(sheet: FactSheet, before: readonly SaidBefore[], feedback: readonly FeedbackBefore[], only?: (s: Situation) => boolean, firm?: FirmnessPref | null): Choice[] {
  const out: Choice[] = []
  for (const sit of SITUATIONS) {
    if (only && !only(sit)) continue
    const m = sit.test(sheet)
    if (!m) continue
    const last = before
      .filter((x) => x.situationId === sit.id && x.day < sheet.day)
      .map((x) => x.day)
      .sort()
      .pop()
    const since = last ? daysBetween(last, sheet.day) : null
    if (since !== null && since < sit.cooldownDays) continue
    const novelty = since !== null && since < 30 ? 0.8 : 1
    const cards = m.cardIds ?? [...sit.cards]
    const score = m.strength * gradeWeight(bestGrade(cards)) * novelty * usefulness(sit.id, feedback, m.factIds)
    const words = said(sit, m, cards, sheet, firm)
    out.push({ situationId: sit.id, mode: sit.mode, text: words.text, factIds: m.factIds, cardIds: cards, score, action: m.action ?? null, ...(words.firmness ? { firmness: words.firmness } : {}) })
  }
  // Stable: among equal scores the situation listed first wins, as it always has.
  return out.map((c, i) => ({ c, i })).sort((a, b) => b.c.score - a.c.score || a.i - b.i).map((x) => x.c)
}

/** The one line for the day: the true situation with the highest score, or null when none is true or all are resting. */
export function chooseLine(sheet: FactSheet, before: readonly SaidBefore[], feedback: readonly FeedbackBefore[], only?: (s: Situation) => boolean, firm?: FirmnessPref | null): Choice | null {
  return rankLines(sheet, before, feedback, only, firm)[0] ?? null
}

export interface ReviewParts {
  held: string
  didNot: string
  change: string
}

/**
 * The week from the record alone, for the days the Worker has not written a fuller one: what
 * held (commitments with a step started in the last seven days), what did not (those with none,
 * and the check-ins when they fell), and one change, the strongest strategy, challenge or
 * recommendation the sheet supports, whatever was said lately.
 */
export function phoneReview(sheet: FactSheet, feedback: readonly FeedbackBefore[], firm?: FirmnessPref | null): ReviewParts {
  const c = copy.brain.review
  const t = factsWhere(sheet, 'trajectory.')
  const held = t.filter((f) => (num(f, 'w0') ?? 0) > 0).map((f) => fill(c.heldItem, { name: s(str(f, 'name')), n: s(num(f, 'w0')), done: s(num(f, 'd0')) }))
  // A commitment younger than the week is not set against a week it did not have.
  const quiet = t.filter((f) => (num(f, 'w0') ?? 0) === 0)
  const missed = quiet.map((f) => {
    const d = num(f, 'ageDays') ?? 0
    return fill(d >= 7 ? c.missedItem : d === 0 ? c.newToday : d === 1 ? c.newYesterday : c.newItem, { name: s(str(f, 'name')), d: s(d) })
  })
  const cadence = factById(sheet, 'cadence')
  if (cadence && (num(cadence, 'w0') ?? 0) < (num(cadence, 'w1') ?? 0) / 2) missed.push(fill(c.missedCadence, { now: s(num(cadence, 'w0')), before: s(num(cadence, 'w1')) }))
  // The week's one change comes only from a pattern over days; a fact of one day (a reading at the last check-in, last night) is never the week's change.
  const chosen = chooseLine(sheet, [], feedback, isWeekScoped, firm)
  // Part 41's one line, once its gate is open: a progression review waiting for your answer is the week's change to make.
  const waiting = factsWhere(sheet, 'aim.').find((f) => str(f, 'review') === 'open')
  const change = waiting ? fill(c.reviewWaits, { name: s(str(waiting, 'name')), skill: s(str(waiting, 'skill')) }) : (chosen?.text ?? c.noChange)
  if (!t.length) return { held: c.noCommitments, didNot: missed.length ? missed.join(' ') : c.nothingYet, change }
  return { held: held.length ? held.join(' ') : c.noneHeld, didNot: missed.length ? missed.join(' ') : c.noneMissed, change }
}
