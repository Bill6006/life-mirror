import { addDays, BLOCKS, type Block } from './blocks'
import { extensionPrompt } from './catalogue'
import { allCheckIns, db, getSettings, type Forecast } from './db'
import { chooseModel, dayBeside, daysOfRecord, earlyWarning, forecastsDue, loggedDays, MIN_DAYS_TODAY, scoresDue, valuesByKey, type ModelId, type Warning } from './forecast'
import { observations, slotKey } from './learning'
import { evaluateCards } from './tiers'
import { bestDays, catalogueHealth, extensionPromptText, gap, movedThisWeek, recentSituations, scorecard, whatLasts, type BestDays, type FamilyHealth, type Gap, type Lasts, type Scorecard } from './weekly'

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

export interface Brief {
  days: number
  ready: boolean
  model: ModelId | null
  today: { block: Block; forecast: Forecast | null; actual: number | null }[]
  yesterday: ReturnType<typeof dayBeside>
  warning: (Warning & { chips: number; necessities: number }) | null
  whatIf: number | null
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
  return {
    days,
    ready,
    model: (todays.find((t) => t.forecast)?.forecast?.model as ModelId | undefined) ?? null,
    today: todays,
    yesterday: dayBeside(forecasts, values, addDays(today, -1)),
    warning: ready ? { ...w, chips, necessities } : null,
    whatIf: evening?.whatIf ?? null,
  }
}

export interface Weekly {
  scorecard: Scorecard
  best: BestDays
  gap: Gap
  moved: ReturnType<typeof movedThisWeek>
  lasts: Lasts
  health: FamilyHealth[]
  prompt: string
  weekAhead: { day: string; expected: number | null; lo: number | null; hi: number | null }[]
  weekAheadReady: boolean
}

/** Everything the weekly view shows, from the records at the moment of asking. */
export async function weeklyData(today: string): Promise<Weekly> {
  const [checkins, offers, outcomes, cards, declarations, contexts, forecasts, scores, settings] = await Promise.all([
    allCheckIns(),
    db.offers.toArray(),
    db.outcomes.toArray(),
    db.cards.toArray(),
    db.declarations.toArray(),
    db.days.toArray(),
    db.forecasts.toArray(),
    db.forecastScores.toArray(),
    getSettings(),
  ])
  const obs = observations(checkins, offers, outcomes)
  const effectCards = cards.filter((c) => c.origin !== 'weight')
  const stats = evaluateCards(effectCards, obs, declarations)
  const situations = recentSituations(offers, today)
  const health = catalogueHealth(offers, outcomes, situations, new Set(settings.hideFaith ? ['faith'] : []))
  const cardMoves = new Map(effectCards.map((c) => [c.id as number, { moveId: c.moveId, situationKey: c.situationKey }]))
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null)
  const weekAhead = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i + 1)
    const rows = forecasts.filter((f) => f.day === day && f.horizon === i + 1)
    return { day, expected: mean(rows.map((f) => f.point)), lo: mean(rows.map((f) => f.lo)), hi: mean(rows.map((f) => f.hi)) }
  })
  return {
    scorecard: scorecard(scores, checkins, declarations, stats),
    best: bestDays(checkins, offers, outcomes, contexts, today),
    gap: gap(checkins, today),
    moved: movedThisWeek(checkins, today),
    lasts: whatLasts(obs, checkins),
    health,
    prompt: extensionPromptText({ situations, offers, outcomes, health, stats, cardMoves }, extensionPrompt.template),
    weekAhead,
    weekAheadReady: weekAhead.some((w) => w.expected !== null),
  }
}

