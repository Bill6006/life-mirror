import { addDays, blockAt, parseDay, type Block } from './blocks'
import { hasMove, moveById } from './catalogue'
import type { Aim } from './db'
import type { Settings, Weekday } from './settings'

// Workstream 6, Part 39: when a commitment is due. Its own rhythm (sessions a week, with rest days
// between for a skill that needs recovery) or its own fixed days decide it, never a draw (Rule 16)
// and never the time of day: a session can happen whenever it suits. Nothing is assumed: with no
// rhythm and no fixed days a commitment is open, there whenever you want it, and never due. A
// preferred study time only orders what is already due. A faith practice is never due by a count
// of days (Rule 10), only by its fixed days or your plan.

/** How often you practise it: sessions a week, and days of rest between them for a skill that needs recovery. */
export interface Rhythm {
  perWeek: number
  restDays: number
}

export const MAX_PER_WEEK = 7
export const MAX_REST_DAYS = 2

/** A rhythm as stored, kept only when it makes sense; anything else reads as none (flexible). */
export function rhythmOf(v: unknown): Rhythm | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const perWeek = Number(r.perWeek)
  const restDays = Number(r.restDays ?? 0)
  if (!Number.isInteger(perWeek) || perWeek < 1 || perWeek > MAX_PER_WEEK) return null
  if (!Number.isInteger(restDays) || restDays < 0 || restDays > MAX_REST_DAYS) return null
  return { perWeek, restDays }
}

/** Fixed days as stored, each weekday once, in order; anything else is left out. */
export function scheduleOf(v: unknown): Weekday[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
}

/** A practice whose step is a faith practice: never due by a count of days, never gap-counted (Rule 10). */
export function isFaithPractice(aim: Pick<Aim, 'kind' | 'stepMoveId'>): boolean {
  if (aim.kind !== 'practice' || !aim.stepMoveId || !hasMove(aim.stepMoveId)) return false
  const m = moveById(aim.stepMoveId)
  return m.family === 'faith' || m.hiddenWith === 'faith'
}

export type DueState = 'paused' | 'started' | 'done' | 'partly' | 'planned' | 'due' | 'resting' | 'notDue' | 'open'

export interface Due {
  state: DueState
  /** What decided it: its fixed days, its rhythm or your plan; null for the rest. */
  by: 'schedule' | 'rhythm' | 'plan' | null
  /** Days practised in the seven before today, when its rhythm counts them. */
  week?: number
  /** Sessions its rhythm still asks for this week, while it is due by rhythm. */
  behind?: number
  /** The next of its fixed days, when they leave today out. */
  next?: Weekday
}

export interface DueInput {
  rhythm: Rhythm | null
  schedule: readonly Weekday[]
  paused: boolean
  /** A session is started and not yet resolved. */
  started: boolean
  doneToday: boolean
  partlyToday: boolean
  /** A plan for today, not yet started: your own word that today holds it. */
  planned: boolean
  faith: boolean
  /** The days it was practised (done or partly), by the day each session began. */
  practiceDays: readonly string[]
  today: string
}

function nextFixed(schedule: readonly Weekday[], weekday: Weekday): Weekday {
  for (let k = 1; k <= 7; k++) {
    const d = ((weekday + k) % 7) as Weekday
    if (schedule.includes(d)) return d
  }
  return schedule[0]
}

/**
 * Whether a commitment is due today, and why. In order: paused; a session started, done or partly
 * done today; your plan for today; its fixed days, which alone decide when it has them; its rhythm,
 * counted in days practised over the seven before today, with its rest days kept after a session;
 * otherwise open. Silence is not a missed session (Rule 2): an unlogged day only leaves it due.
 */
export function dueOf(i: DueInput): Due {
  if (i.paused) return { state: 'paused', by: null }
  if (i.started) return { state: 'started', by: null }
  if (i.doneToday) return { state: 'done', by: null }
  if (i.partlyToday) return { state: 'partly', by: null }
  if (i.planned) return { state: 'planned', by: 'plan' }
  const weekday = parseDay(i.today).getDay() as Weekday
  if (i.schedule.length) return i.schedule.includes(weekday) ? { state: 'due', by: 'schedule' } : { state: 'notDue', by: 'schedule', next: nextFixed(i.schedule, weekday) }
  if (!i.rhythm || i.faith) return { state: 'open', by: null }
  const days = [...new Set(i.practiceDays)].filter((d) => d < i.today)
  const week = days.filter((d) => d >= addDays(i.today, -6)).length
  const last = days.sort().pop() ?? null
  if (last !== null && i.rhythm.restDays > 0 && last >= addDays(i.today, -i.rhythm.restDays)) return { state: 'resting', by: 'rhythm', week }
  return week < i.rhythm.perWeek ? { state: 'due', by: 'rhythm', week, behind: i.rhythm.perWeek - week } : { state: 'notDue', by: 'rhythm', week }
}

/** Where a row sits on Now: what you started first, then your plan, then what is due, then Partly, open, done today, and last what rests or is not due. */
export function rankOf(d: Pick<Due, 'state'>): number {
  switch (d.state) {
    case 'started':
      return 0
    case 'planned':
      return 1
    case 'due':
      return 2
    case 'partly':
      return 3
    case 'open':
      return 4
    case 'done':
      return 5
    default:
      return 6
  }
}

/** Whether a row's Start is the pill or a quiet tap: a rest day or a week whose rhythm is met still lets you start, without asking. */
export function quiet(d: Pick<Due, 'state'>): boolean {
  return d.state === 'resting' || d.state === 'notDue'
}

/** The preferred study time, if you set one: days, and a part of the day or any time. A preference only; it never makes anything due. */
export function inStudyTime(settings: Pick<Settings, 'week'>, now: Date): boolean {
  const { day, block } = blockAt(now)
  const weekday = parseDay(day).getDay() as Weekday
  if (!settings.week.studyNights[weekday]) return false
  const part = settings.week.studyPart ?? 'any'
  return part === 'any' || part === (block as Block)
}
