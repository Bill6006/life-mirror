import { addDays, BLOCKS, type Block } from './blocks'
import { hasMove, moveById } from './catalogue'
import type { Aim, CheckIn, Intention, Offer, Outcome, Skill } from './db'
import { latestPlans, stepKeysOf, studyOfferBelongs } from './aims'
import { onTheSheet } from './facts'
import type { ReadingId } from './readings'
import { isFaithPractice } from './rhythm'
import { bandOf, INGREDIENT_IDS, INGREDIENTS, readingOf, type Band } from './score'
import { dayReading } from './weekly'

// The owner's record shown back by the month (stage 3, group 4): a month ago today, and a review of the
// last full calendar month. From the record alone, no model: counts and averages, each with what it
// rests on; nothing grades and nothing is set against a target. The Partner path's own steps stay on
// its own screens (Part 27), a faith practice is offered, never counted (Rule 10), and the faith
// family's moves are left out while it is hidden.

/** Days of record a month's average needs before it is said, or set against the month before. */
export const MONTH_MIN_DAYS = 7
/** Answers a reading needs in each month before what moved is said. */
export const MONTH_MIN_ANSWERS = 7

/** The same date a month back, or that month's last day when it has no such date (Mar 31 → Feb 28). */
export function monthAgo(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const back = new Date(y, m - 2, 1, 12)
  const last = new Date(back.getFullYear(), back.getMonth() + 1, 0, 12).getDate()
  return `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** "2026-09": the month a day falls in. */
export function monthOf(day: string): string {
  return day.slice(0, 7)
}

/** The month before one. */
export function monthBefore(month: string): string {
  return monthOf(addDays(`${month}-01`, -1))
}

/** The days of a month, first to last. */
export function daysOfMonth(month: string): string[] {
  const out: string[] = []
  for (let day = `${month}-01`; monthOf(day) === month; day = addDays(day, 1)) out.push(day)
  return out
}

export interface DoneRecords {
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  /** The faith family is hidden in Settings: its moves are left out. */
  hideFaith: boolean
}

/** The moves and steps marked done on a set of days, by name, the Partner path's own and a hidden faith family's left out. */
function doneOn(r: DoneRecords, days: ReadonlySet<string>, kinds?: readonly Offer['kind'][]): { name: string; day: string }[] {
  const done = new Set(r.outcomes.filter((x) => x.outcome === 'done').map((x) => x.offerId))
  return r.offers
    .filter((o) => days.has(o.day) && o.id !== undefined && done.has(o.id) && onTheSheet(o) && !o.skippedAt && (!kinds || kinds.includes(o.kind)))
    .filter((o) => !(r.hideFaith && hasMove(o.moveId) && (moveById(o.moveId).family === 'faith' || moveById(o.moveId).hiddenWith === 'faith')))
    .map((o) => ({ name: hasMove(o.moveId) ? moveById(o.moveId).name : (o.label ?? ''), day: o.day }))
    .filter((x) => x.name !== '')
}

export interface MonthAgoDay {
  day: string
  /** The day's reading out of 100 when two blocks or more were logged. */
  value: number | null
  band: Band | null
  /** Each logged block's reading, when the day has no reading of its own. */
  blocks: { block: Block; value: number }[]
  notes: { block: Block; note: string }[]
  done: string[]
  workout: boolean
}

/** What the record holds for the day a month back, or null when it holds nothing. */
export function monthAgoToday(today: string, checkins: readonly CheckIn[], r: DoneRecords, outside: readonly { day: string }[]): MonthAgoDay | null {
  const day = monthAgo(today)
  const own = checkins.filter((c) => c.day === day)
  const value = dayReading(checkins, day)
  const blocks = value !== null ? [] : BLOCKS.map((block) => ({ block, r: own.find((c) => c.block === block) })).flatMap(({ block, r: c }) => (c && readingOf(c) ? [{ block, value: (readingOf(c) as { value: number }).value }] : []))
  const notes = BLOCKS.flatMap((block) => {
    const note = own.find((c) => c.block === block)?.extras?.note?.trim()
    return note ? [{ block, note }] : []
  })
  const done = [...new Set(doneOn(r, new Set([day])).map((x) => x.name))]
  const workout = outside.some((o) => o.day === day)
  if (value === null && !blocks.length && !notes.length && !done.length && !workout) return null
  return { day, value, band: value === null ? null : bandOf(value), blocks, notes, done, workout }
}

export interface MonthReview {
  month: string
  /** The first day of record, when it falls inside the month: the review covers the month from then. */
  from: string | null
  days: number
  checkins: { completed: number; days: number }
  reading: { mean: number | null; days: number; before: { mean: number; days: number } | null; high: { day: string; value: number } | null; low: { day: string; value: number } | null }
  moved: { reading: ReadingId; thisMonth: number; before: number; delta: number }[]
  commitments: { name: string; learning: boolean; faith: boolean; done: number; planned: number; kept: number }[]
  moves: { done: number; most: { name: string; n: number }[] }
  workoutDays: number
  notes: number
}

export interface MonthInput extends DoneRecords {
  checkins: readonly CheckIn[]
  aims: readonly Aim[]
  skills: readonly Skill[]
  intentions: readonly Intention[]
  outside: readonly { day: string }[]
  /** How each commitment is named on screen. */
  nameOf: (aim: Aim) => string
}

function mean(xs: readonly number[]): number {
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
}

/** The last full calendar month before today's, as the record holds it; null until one has ended since the record began. */
export function monthReview(today: string, i: MonthInput): MonthReview | null {
  const month = monthBefore(monthOf(today))
  const days = daysOfMonth(month)
  const first = i.checkins.reduce<string | null>((f, c) => (f === null || c.day < f ? c.day : f), null)
  if (first === null || first > days[days.length - 1]) return null
  const inMonth = new Set(days)
  const own = i.checkins.filter((c) => inMonth.has(c.day))
  const completed = own.filter((c) => c.completedAt !== null)

  // The day reading: the average of the days with two blocks or more, against the month before, and its highest and lowest day.
  const readings = days.map((day) => ({ day, value: dayReading(i.checkins, day) })).filter((d): d is { day: string; value: number } => d.value !== null)
  const prior = daysOfMonth(monthBefore(month)).map((day) => dayReading(i.checkins, day)).filter((v): v is number => v !== null)
  const enough = readings.length >= MONTH_MIN_DAYS
  const sorted = [...readings].sort((a, b) => b.value - a.value || (a.day < b.day ? -1 : 1))

  // What moved: each of the six readings with a direction, its average answer in the month against the month before.
  const answers = (id: ReadingId, set: ReadonlySet<string>) => i.checkins.filter((c) => set.has(c.day) && c.answers[id] !== undefined).map((c) => c.answers[id] as number)
  const before = new Set(daysOfMonth(monthBefore(month)))
  const moved = INGREDIENT_IDS.flatMap((id) => {
    const now = answers(id, inMonth)
    const then = answers(id, before)
    if (now.length < MONTH_MIN_ANSWERS || then.length < MONTH_MIN_ANSWERS) return []
    const a = mean(now)
    const b = mean(then)
    // Helpful direction positive, as the weekly view keeps it.
    return [{ reading: id, thisMonth: a, before: b, delta: Math.round((INGREDIENTS[id] === 'down' ? b - a : a - b) * 100) / 100 }]
  })

  // Each commitment kept and not paused, but the paths, which have screens of their own.
  const studyAims = i.aims.filter((a) => a.kind === 'certification')
  const byOffer = new Map(i.outcomes.map((x) => [x.offerId, x]))
  const plans = latestPlans(i.intentions)
  const commitments = i.aims
    .filter((a) => a.kind !== 'path' && a.archivedAt === null && !a.pausedAt)
    .map((aim) => {
      const faith = isFaithPractice(aim)
      const keys = stepKeysOf(aim, studyAims)
      const sessions = i.offers.filter((o) => inMonth.has(o.day) && (o.kind === 'step' || o.kind === 'study') && !o.skippedAt && (keys.includes(o.situationKey) || studyOfferBelongs(o, aim, i.skills, studyAims)))
      const done = faith ? 0 : sessions.filter((o) => ['done', 'partly'].includes(byOffer.get(o.id as number)?.outcome ?? '')).length
      const mine = faith ? [] : plans.filter((p) => p.aimId === aim.id && inMonth.has(p.day))
      return { name: i.nameOf(aim), learning: aim.kind === 'certification', faith, done, planned: mine.length, kept: mine.filter((p) => p.offerId !== null).length }
    })

  // The moves of the day's draw; a commitment's steps are counted with their commitment above.
  const moveCounts = new Map<string, number>()
  for (const m of doneOn(i, inMonth, ['block', 'pickup'])) moveCounts.set(m.name, (moveCounts.get(m.name) ?? 0) + 1)
  const most = [...moveCounts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([name, n]) => ({ name, n }))

  return {
    month,
    from: first > days[0] ? first : null,
    days: days.length,
    checkins: { completed: completed.length, days: new Set(completed.map((c) => c.day)).size },
    reading: {
      mean: enough ? mean(readings.map((r) => r.value)) : null,
      days: readings.length,
      before: enough && prior.length >= MONTH_MIN_DAYS ? { mean: mean(prior), days: prior.length } : null,
      high: enough ? sorted[0] : null,
      low: enough ? sorted[sorted.length - 1] : null,
    },
    moved: moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    commitments,
    moves: { done: [...moveCounts.values()].reduce((a, b) => a + b, 0), most },
    workoutDays: new Set(i.outside.filter((o) => inMonth.has(o.day)).map((o) => o.day)).size,
    notes: own.filter((c) => typeof c.extras?.note === 'string' && c.extras.note.trim() !== '').length,
  }
}

/** When the first review comes: the first day of the month after the record's first month. */
export function firstReviewDay(firstDay: string): string {
  return `${monthOf(addDays(`${monthOf(firstDay)}-01`, 31))}-01`
}
