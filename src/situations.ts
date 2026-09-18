import type { Mode } from './brainShared'
import { daysBetween } from './blocks'
import { copy } from './copy'
import { factById, factsWhere, num, str, type Fact, type FactSheet } from './facts'
import { fill } from './format'
import { bestGrade, gradeWeight } from './library'

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
}

export interface Situation {
  id: string
  mode: Mode
  cards: readonly string[]
  /** Days before the same situation may be said again. */
  cooldownDays: number
  test: (s: FactSheet) => Match | null
}

export interface Choice {
  situationId: string
  mode: Mode
  text: string
  factIds: string[]
  cardIds: string[]
  score: number
}

export interface SaidBefore {
  day: string
  situationId: string | null
}

export interface FeedbackBefore {
  situationId: string | null
  answer: 'useful' | 'knew' | 'not'
}

const CUES = ['afterPickup', 'afterBedtime', 'nextCheckIn'] as const
type Cue = (typeof CUES)[number]
const LINES: Record<string, string> = copy.brain.lines
const cueLabel = (cue: Cue) => copy.aims.cues[cue]
const signed = (v: number) => (v > 0 ? `+${v}` : String(v))
const s = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v))

function aims(sheet: FactSheet): Fact[] {
  return factsWhere(sheet, 'aim.')
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
    mode: 'strategy',
    cards: ['implementation-intentions', 'habit-formation-time'],
    cooldownDays: 7,
    test: (sheet) => {
      for (const a of aims(sheet)) {
        for (const cue of CUES) {
          const r = cueOf(a, cue)
          if (r.n >= 3 && r.started / r.n <= 0.34) return { factIds: [a.id], strength: 0.9, vars: { cue: cueLabel(cue), started: s(r.started), n: s(r.n), other: cueLabel(otherCue(a, cue)).toLowerCase() } }
        }
      }
      return null
    },
  },
  {
    id: 'first-skill',
    mode: 'recommendation',
    cards: [],
    cooldownDays: 3,
    test: (sheet) => {
      const a = aims(sheet).find((f) => str(f, 'kind') === 'certification' && num(f, 'skills') === 0)
      return a ? { factIds: [a.id], strength: 0.9, vars: { name: s(str(a, 'name')) } } : null
    },
  },
  {
    id: 'study-no-time',
    mode: 'strategy',
    cards: ['implementation-intentions'],
    cooldownDays: 10,
    test: (sheet) => {
      const f = factById(sheet, 'study.nights')
      const n = num(f, 'noTime') ?? 0
      return f && n >= 2 ? { factIds: [f.id], strength: 0.8, vars: { n: s(n) } } : null
    },
  },
  {
    id: 'caffeine-under',
    mode: 'warning',
    cards: ['caffeine-six-hours', 'caffeine-half-life'],
    cooldownDays: 10,
    test: (sheet) => {
      const f = assoc(sheet, 'assoc.heavyCaffeine', 4)
      const diff = f ? (num(f, 'diff') as number) : 0
      return f && diff < 0 ? { factIds: [f.id], strength: 0.8, vars: { diff: s(Math.abs(diff)), n: s(num(f, 'times')) } } : null
    },
  },
  {
    id: 'ladder-flat',
    mode: 'strategy',
    cards: ['testing-effect', 'spacing-effect'],
    cooldownDays: 10,
    test: (sheet) => {
      const a = aims(sheet).find((f) => str(f, 'kind') === 'certification' && (num(f, 'skills') ?? 0) >= 3 && num(f, 'highRungs') === 0)
      return a ? { factIds: [a.id], strength: 0.8, vars: { name: s(str(a, 'name')), k: s(num(a, 'skills')) } } : null
    },
  },
  {
    id: 'step-stalled',
    mode: 'challenge',
    cards: ['self-compassion-after-lapse', 'habit-formation-time'],
    cooldownDays: 5,
    test: (sheet) => {
      const stalled = aims(sheet)
        .map((f) => ({ f, d: num(f, 'gapDays') ?? -1 }))
        .filter((x) => x.d >= 7)
        .sort((a, b) => b.d - a.d)[0]
      return stalled ? { factIds: [stalled.f.id], strength: Math.min(1, stalled.d / 14), vars: { name: s(str(stalled.f, 'name')), d: s(stalled.d) } } : null
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
    id: 'study-tired',
    mode: 'perspective',
    cards: ['distributed-practice-motor', 'spacing-effect', 'ego-depletion-not-replicated'],
    cooldownDays: 10,
    test: (sheet) => {
      const f = factById(sheet, 'study.nights')
      const n = num(f, 'tired') ?? 0
      return f && n >= 2 ? { factIds: [f.id], strength: 0.7, vars: { n: s(n) } } : null
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
      const a = aims(sheet).find((f) => str(f, 'plan') === null && num(f, 'open') === 0 && (num(f, 'gapDays') ?? 1) >= 1 && (str(f, 'kind') !== 'certification' || (num(f, 'skills') ?? 0) > 0))
      return a ? { factIds: [a.id, today.id], strength: 0.6, vars: { name: s(str(a, 'name')), step: s(str(a, 'step')) } } : null
    },
  },
  {
    id: 'afternoon-walk',
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
    id: 'heavy-caffeine-today',
    mode: 'warning',
    cards: ['caffeine-six-hours'],
    cooldownDays: 3,
    test: (sheet) => {
      const f = factById(sheet, 'today.heavyCaffeine')
      return f ? { factIds: [f.id], strength: 0.6, vars: {} } : null
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
    id: 'caffeine-even',
    mode: 'observation',
    cards: ['caffeine-six-hours'],
    cooldownDays: 21,
    test: (sheet) => {
      const f = assoc(sheet, 'assoc.heavyCaffeine', 4)
      const diff = f ? (num(f, 'diff') as number) : -1
      return f && diff >= 0 ? { factIds: [f.id], strength: 0.4, vars: { diff: signed(diff), n: s(num(f, 'times')) } } : null
    },
  },
]

/** How you received a situation before: useful lifts it, knew it and not useful lower it, within bounds. */
export function usefulness(id: string, feedback: readonly FeedbackBefore[]): number {
  const own = feedback.filter((f) => f.situationId === id)
  const v = 1 + Math.min(0.3, own.filter((f) => f.answer === 'useful').length * 0.1) - own.filter((f) => f.answer === 'not').length * 0.2 - own.filter((f) => f.answer === 'knew').length * 0.1
  return Math.max(0.3, Math.min(1.3, v))
}

/** The one line for the day: the true situation with the highest score, or null when none is true or all are resting. */
export function chooseLine(sheet: FactSheet, said: readonly SaidBefore[], feedback: readonly FeedbackBefore[]): Choice | null {
  let best: Choice | null = null
  for (const sit of SITUATIONS) {
    const m = sit.test(sheet)
    if (!m) continue
    const last = said
      .filter((x) => x.situationId === sit.id && x.day < sheet.day)
      .map((x) => x.day)
      .sort()
      .pop()
    const since = last ? daysBetween(last, sheet.day) : null
    if (since !== null && since < sit.cooldownDays) continue
    const novelty = since !== null && since < 30 ? 0.8 : 1
    const score = m.strength * gradeWeight(bestGrade(sit.cards)) * novelty * usefulness(sit.id, feedback)
    if (!best || score > best.score) best = { situationId: sit.id, mode: sit.mode, text: fill(LINES[sit.id] ?? '', m.vars), factIds: m.factIds, cardIds: [...sit.cards], score }
  }
  return best
}
