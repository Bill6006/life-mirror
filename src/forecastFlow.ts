import { addDays, BLOCKS, type Block } from './blocks'
import { extensionPrompt } from './catalogue'
import { allCheckIns, db, getSettings, type Forecast } from './db'
import { chooseModel, dayBeside, daysOfRecord, earlyWarning, forecastsDue, loggedDays, MIN_DAYS_TODAY, scoresDue, valuesByKey, weekAheadRows, type AheadRow, type ModelId, type Warning } from './forecast'
import { associationFor } from './associations'
import type { CheckIn, DayContext } from './db'
import { observations, slotKey } from './learning'
import type { ReadingId } from './readings'
import { evaluateCards } from './tiers'
import { baselineShift, type Shift } from './shift'
import { bestDays, catalogueHealth, dayReadings, extensionPromptText, gap, movedThisWeek, recentSituations, scorecard, whatLasts, type BestDays, type FamilyHealth, type Gap, type Lasts, type Scorecard } from './weekly'

// Forecasts on the phone: written before their slot is logged and never rewritten; scored in
// their own record once the slot is logged; the model named. The brief and the weekly view
// read from these records and the rest of the record.

async function doneSlots(): Promise<Set<string>> {
  const outcomes = await db.outcomes.filter((x) => x.outcome === 'done').toArray()
  const ids = new Set(outcomes.map((x) => x.offerId))
  const offers = await db.offers.filter((o) => o.id !== undefined && ids.has(o.id)).toArray()
  return new Set(offers.map((o) => slotKey(o.day, o.block)))
}

/** Writes the forecasts due today and scores what can be scored. Existing forecasts are never touched: the write is add-only. */
export async function runForecasting(today: string): Promise<void> {
  const checkins = await allCheckIns()
  const values = valuesByKey(checkins)
  const [existing, scored] = await Promise.all([db.forecasts.toArray(), db.forecastScores.toArray()])
  const chosen = loggedDays(values) >= MIN_DAYS_TODAY ? chooseModel(values, today) : null
  const due = chosen ? forecastsDue(chosen, values, existing, today, await doneSlots()) : []
  const scores = scoresDue(existing, values, scored, today)
  await db.transaction('rw', [db.forecasts, db.forecastScores], async () => {
    if (due.length) await db.forecasts.bulkAdd(due)
    if (scores.length) await db.forecastScores.bulkAdd(scores)
  })
}

export type LastNightKey = 'dinner' | 'caffeine' | 'coolingOff' | 'bigSocial' | 'nothingLanded' | 'hardToSeePoint' | 'necessity' | 'churchDay' | 'workout'

/** What yesterday's evening carried that the record can set this morning against: its extras and chips, a necessity missed, the church day, a workout day. */
export function lastNightKeys(evening: CheckIn | undefined, ctx: DayContext | undefined, workout: boolean): LastNightKey[] {
  const ex = evening?.extras ?? {}
  const keys: LastNightKey[] = []
  if (ex.dinner) keys.push('dinner')
  if (ex.caffeine) keys.push('caffeine')
  if (ex.coolingOff) keys.push('coolingOff')
  if (ex.bigSocial) keys.push('bigSocial')
  if (ex.nothingLanded) keys.push('nothingLanded')
  if (ex.hardToSeePoint) keys.push('hardToSeePoint')
  if (Object.values(ex.necessities ?? {}).some(Boolean)) keys.push('necessity')
  if (ctx?.churchDay) keys.push('churchDay')
  if (workout) keys.push('workout')
  return keys
}

/** The evening test for a key: what the evening record says, or what its day's context and the outside days say. */
function eventTest(key: LastNightKey, ctxByDay: ReadonlyMap<string, DayContext>, outside: ReadonlySet<string>): (c: CheckIn) => boolean {
  switch (key) {
    case 'necessity':
      return (c) => Object.values(c.extras?.necessities ?? {}).some(Boolean)
    case 'churchDay':
      return (c) => Boolean(ctxByDay.get(c.day)?.churchDay)
    case 'workout':
      return (c) => outside.has(c.day)
    default:
      return (c) => Boolean(c.extras?.[key])
  }
}

export interface LastNight {
  key: LastNightKey
  with: number | null
  without: number | null
  n: number
}

export interface YesterdayMove {
  moveId: string
  target: ReadingId
  /** In anchor steps, helpful direction positive. */
  effect: number
  arm: 'done' | 'partly'
}

export interface Brief {
  days: number
  ready: boolean
  model: ModelId | null
  today: { block: Block; forecast: Forecast | null; actual: number | null }[]
  yesterday: ReturnType<typeof dayBeside>
  warning: (Warning & { chips: number; necessities: number }) | null
  whatIf: number | null
  /** What last night carried, set against the mornings after evenings like it; the one with the most evenings behind it. */
  lastNight: LastNight | null
  /** No stretch starting: how many of the last logged blocks read inside their usual range. */
  steady: { inside: number; of: number } | null
  /** Yesterday's move, read this morning against what is usual: one reading, never a finding. */
  move: YesterdayMove | null
}

/** The morning brief: today's shape by block, yesterday beside what happened, and the warning or the model line. */
export async function briefData(today: string): Promise<Brief> {
  const checkins = await allCheckIns()
  const values = valuesByKey(checkins)
  const forecasts = await db.forecasts.toArray()
  const days = daysOfRecord(checkins, today)
  const lowest = (day: string, block: Block): Forecast | null => {
    const rows = forecasts.filter((f) => f.day === day && f.block === block).sort((a, b) => a.horizon - b.horizon)
    return rows[0] ?? null
  }
  const todays = BLOCKS.map((block) => ({ block, forecast: lowest(today, block), actual: values.get(slotKey(today, block)) ?? null }))
  const ready = loggedDays(values) >= MIN_DAYS_TODAY && todays.some((t) => t.forecast !== null)
  const lowOf = (key: string): number | null => {
    const [day, block] = key.split('|')
    return lowest(day, block as Block)?.lo ?? null
  }
  const w = earlyWarning(values, lowOf, today)
  const lastEvenings = [1, 2, 3].map((d) => checkins.find((c) => c.day === addDays(today, -d) && c.block === 'evening'))
  const chips = lastEvenings.filter((c) => c?.extras?.nothingLanded || c?.extras?.hardToSeePoint).length
  const necessities = lastEvenings.reduce((n, c) => n + Object.values(c?.extras?.necessities ?? {}).filter(Boolean).length, 0)
  const evening = todays.find((t) => t.block === 'evening')?.forecast ?? null
  const yesterday = addDays(today, -1)
  const [offers, outcomes, contexts, outsideRows] = await Promise.all([db.offers.toArray(), db.outcomes.toArray(), db.days.toArray(), db.outside.toArray()])
  const ctxByDay = new Map(contexts.map((c) => [c.day, c]))
  const outside = new Set(outsideRows.map((o) => o.day))
  const eve = checkins.find((c) => c.day === yesterday && c.block === 'evening')
  const carried = lastNightKeys(eve, ctxByDay.get(yesterday), outside.has(yesterday)).map((key) => ({ key, assoc: associationFor(checkins, today, eventTest(key, ctxByDay, outside)) }))
  const best = carried.filter((c) => c.assoc.diff !== null).sort((a, b) => b.assoc.times - a.assoc.times)[0] ?? carried[0] ?? null
  const lastNight: LastNight | null = best ? { key: best.key, with: best.assoc.withEvent.mean, without: best.assoc.without.mean, n: best.assoc.times } : null
  const steady = ready && !w.warning && w.of > 0 ? { inside: w.of - w.under, of: w.of } : null
  const read = observations(checkins, offers, outcomes)
    .filter((o) => o.day === yesterday && o.arm !== 'declined')
    .sort((a, b) => b.offerId - a.offerId)
  const move: YesterdayMove | null = read.length ? { moveId: read[0].moveId, target: read[0].target, effect: read[0].effect, arm: read[0].arm as 'done' | 'partly' } : null
  return {
    lastNight,
    steady,
    move,
    days,
    ready,
    model: (todays.find((t) => t.forecast)?.forecast?.model as ModelId | undefined) ?? null,
    today: todays,
    yesterday: dayBeside(forecasts, values, addDays(today, -1)),
    warning: ready ? { ...w, chips, necessities } : null,
    whatIf: evening?.whatIf ?? null,
  }
}

/** What is usual for a slot: its lowest-horizon forecast on record, or null. */
export async function usualFor(day: string, block: Block): Promise<{ point: number; lo: number; hi: number } | null> {
  const rows = (await db.forecasts.where('day').equals(day).toArray()).filter((f) => f.block === block).sort((a, b) => a.horizon - b.horizon)
  return rows[0] ? { point: rows[0].point, lo: rows[0].lo, hi: rows[0].hi } : null
}

export interface Weekly {
  /** The model behind the latest forecasts, named on the weekly view. */
  model: ModelId | null
  scorecard: Scorecard
  best: BestDays
  gap: Gap
  moved: ReturnType<typeof movedThisWeek>
  lasts: Lasts
  health: FamilyHealth[]
  prompt: string
  weekAhead: AheadRow[]
  weekAheadReady: boolean
  shift: Shift | null
}

/** Everything the weekly view shows, from the records at the moment of asking. */
export async function weeklyData(today: string): Promise<Weekly> {
  const [checkins, offers, outcomes, cards, declarations, contexts, forecasts, scores, settings, outside] = await Promise.all([
    allCheckIns(),
    db.offers.toArray(),
    db.outcomes.toArray(),
    db.cards.toArray(),
    db.declarations.toArray(),
    db.days.toArray(),
    db.forecasts.toArray(),
    db.forecastScores.toArray(),
    getSettings(),
    db.outside.toArray(),
  ])
  const obs = observations(checkins, offers, outcomes)
  const effectCards = cards.filter((c) => c.origin !== 'weight')
  const stats = evaluateCards(effectCards, obs, declarations)
  const situations = recentSituations(offers, today)
  const health = catalogueHealth(offers, outcomes, situations, new Set(settings.hideFaith ? ['faith'] : []))
  const cardMoves = new Map(effectCards.map((c) => [c.id as number, { moveId: c.moveId, situationKey: c.situationKey }]))
  const weekAhead = weekAheadRows(forecasts, today)
  const latest = forecasts.reduce<Forecast | null>((m, f) => (m === null || f.madeOn > m.madeOn ? f : m), null)
  return {
    model: (latest?.model as ModelId | undefined) ?? null,
    scorecard: scorecard(scores, checkins, declarations, stats),
    best: bestDays(checkins, offers, outcomes, contexts, today, new Set(outside.map((o) => o.day))),
    gap: gap(checkins, today),
    moved: movedThisWeek(checkins, today),
    lasts: whatLasts(obs, checkins),
    health,
    prompt: extensionPromptText({ situations, offers, outcomes, health, stats, cardMoves }, extensionPrompt.template),
    weekAhead,
    weekAheadReady: weekAhead.some((w) => w.expected !== null),
    shift: baselineShift(dayReadings(checkins, today), today),
  }
}

