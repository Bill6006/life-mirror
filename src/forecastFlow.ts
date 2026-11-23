import { NOTHING } from './offers'
import { addDays, BLOCKS, type Block } from './blocks'
import { extensionPrompt } from './catalogue'
import { allCheckIns, contextFromWeek, db, getSettings, type Forecast } from './db'
import { carriedByContext, uncoveredContexts, type DayKind } from './people'
import { chooseModel, dayBeside, daysCanDiffer, daysOfRecord, earlyWarning, forecastsDue, LEVEL_WEEKDAY, loggedDays, lowestAhead, MIN_DAYS_TODAY, scoresDue, valuesByKey, WARNING_WINDOW, weekAheadRows, whatIf, type AheadRow, type Warning, type WayId } from './forecast'
import { associationFor, likeForLikeMatched } from './associations'
import { eventTest, knownTest, lastNightKeys, type LastNightKey } from './lastNight'
import { natureMoveDays } from './nature'
import type { AnchorSwap, Card, CheckIn, DayContext, Declaration, ForecastScore, Offer, Outcome } from './db'
import { checksAsShown, honestyChecks, type HonestyChecks } from './honesty/checks'
import { guardRepair } from './repair/breaker'
import { repairEvidence, trackSummary } from './repair/evidence'
import type { Frequency, Settings } from './settings'
import { eveningWorkoutDays } from './workouts'
import { observations, slotKey } from './observe'
import type { ReadingId } from './readings'
import { baselineShift, type Shift } from './shift'
import { bestDays, catalogueHealth, dayReadings, extensionPromptText, gap, movedThisWeek, recentSituations, scorecard, whatLasts, type BestDays, type FamilyHealth, type Gap, type Lasts, type RepairTrack, type Scorecard } from './weekly'
import { necessitiesMissed } from './necessities'
import type { WeeklyAnalyses } from './weeklyFacts'
import { CHALLENGER, challengerOn, fourWays, runChallenger, type ChallengerRun, type Predict } from './challenger'
import { adjustRows, bandBefore, conditionsFor } from './challengerRecord'
import { adjustedWords } from './forecastAdjusted'
import { checkStopsChallenger, movedCheck, type MovedCheck } from './movedCheck'
import { guardComparisons } from './counted/fault'
import { levelWeekdayOn, levelWeekdayReader, levelWeekdayRows, rowsWithTheWay, WEEK, type LevelWeekdayReader, type WeekRow } from './levelWeekday'
import { KNOWN_AHEAD_WAYS, knownAheadOn, knownAheadReader, knownAheadRecordOf, measureOfState, rowsWithKnownAhead, STAGE_C, wayOfState, type KnownAheadDay, type KnownAheadReader, type KnownAheadRecord } from './knownAhead'
import { readWeatherToday } from './weatherFlow'
import { learnedWeights } from './score'
import { onTrip } from './postWindow'
import { awayOn } from './postWindowFlow'
import { getBrainPrefs } from './brainPrefs'
import { noticedOf } from './noteEvents/join'
import { awayDays, homeDaysOnly } from './awayFlow'
import { ownChipsOf } from './settings'

// Forecasts on the phone: written before their slot is logged and never rewritten; scored in
// their own record once the slot is logged; the model named. The brief and the weekly view
// read from these records and the rest of the record.

async function doneSlots(): Promise<Set<string>> {
  const outcomes = await db.outcomes.filter((x) => x.outcome === 'done').toArray()
  const ids = new Set(outcomes.map((x) => x.offerId))
  const offers = await db.offers.filter((o) => o.id !== undefined && ids.has(o.id)).toArray()
  return new Set(offers.map((o) => slotKey(o.day, o.block)))
}

let inflight: Promise<void> | null = null
let rerunFor: string | null = null

/**
 * Writes the forecasts due today and scores what can be scored. Existing forecasts are never
 * touched: the write is add-only. Single-flight: a run already going is joined, and one more run
 * follows it when asked for meanwhile, so two opens can never write the same slot twice. What is
 * due is worked out inside the write, against what is there at that moment.
 */
export function runForecasting(today: string): Promise<void> {
  if (inflight) {
    rerunFor = today
    return inflight
  }
  inflight = (async () => {
    try {
      let day: string | null = today
      while (day !== null) {
        rerunFor = null
        await forecastOnce(day)
        day = rerunFor
      }
    } finally {
      inflight = null
    }
  })()
  return inflight
}

async function forecastOnce(today: string): Promise<void> {
  const all = await allCheckIns()
  // Away from home (post-window, gated): a trip's days stay out of what is usual, and are neither fitted on nor scored; with the gate closed, none is left out.
  const checkins = homeDaysOnly(all, await awayDays())
  const values = valuesByKey(checkins)
  const logged = checkins === all ? values : valuesByKey(all)
  const done = await doneSlots()
  const chosen = loggedDays(values) >= MIN_DAYS_TODAY ? chooseModel(values, today) : null
  // Stage C of the week ahead (Stage C-A, 2026-11-22), behind its switch, which is off: one reader a run, from the record the four are given, asked under the comparisons' guard before the write. Where it is not in use, or where it threw (kept for the Worker's report), the four's pick writes the day exactly as before, never the level-plus-weekday way by its own test.
  const known = chosen && knownAheadOn() ? await knownAheadFor(values, checkins, today) : null
  // The week ahead's level-plus-weekday way (Stage A, 2026-11-21), behind its switch, which is off: one reader a run, asked under the comparisons' guard before the write, as the challenger is. Where it is not in use, or where it threw (kept for the Worker's report), the four's pick writes the day exactly as before.
  const way = chosen && levelWeekdayOn() ? wayFor(values, today) : null
  const predictOf = known ? knownAheadBase(known.reader) : baseForecast(way?.reader ?? null, today)
  // The one challenger (2026-11-14), behind its switch: tried on the record before today. Where it is picked, the rows due are adjusted by what the record held the day before each.
  // Batch 3 (2026-11-21): never again once its own check, read from the stored forecasts and their scores, says to switch it off.
  // Stage A (2026-11-21): its base is the way in use that day: the level-plus-weekday way where it writes the rows, else the four's pick. Stage C-A (2026-11-22): Stage C's way of the day where it writes them.
  const tried = chosen && challengerOn() && !(await challengerSwitchedOff(today)) ? await challengerFor(known?.day.way ?? (way ? LEVEL_WEEKDAY : chosen.model), checkins, values, today, predictOf) : null
  await db.transaction('rw', [db.forecasts, db.forecastScores], async () => {
    const [existing, scored] = await Promise.all([db.forecasts.toArray(), db.forecastScores.toArray()])
    const four = chosen ? forecastsDue(chosen, values, existing, today, done, logged) : []
    // Where the way is in use, its rows: the pick's skips kept, each row keeping what the four would have written.
    const theWays = way ? rowsWithTheWay(four, way.rows, existing, logged, today, (day, block) => whatIf(values, done, day, block)) : four
    // Where Stage C is in use, its rows: the pick's skips kept, each row keeping what the four and the Stage B way would have written; a day inside a planned trip has none.
    const due = known ? rowsWithKnownAhead(four, known.day, existing, logged, today, (day, block) => whatIf(values, done, day, block), known.onTrip) : theWays
    if (tried?.picked) adjustRows(due, tried, values, predictOf)
    const scores = scoresDue(existing, values, scored, today)
    if (due.length) await db.forecasts.bulkAdd(due)
    if (scores.length) await db.forecastScores.bulkAdd(scores)
  })
}

/** Whether the moved forecasts' check (Batch 3, `movedCheck.ts`) has read "switch it off" by today: then the challenger is not tried, and the rows are the base way's. */
async function challengerSwitchedOff(today: string): Promise<boolean> {
  const [forecasts, scores] = await Promise.all([db.forecasts.toArray(), db.forecastScores.toArray()])
  return checkStopsChallenger(movedCheck(forecasts, scores, today))
}

/** The challenger's run for today, from the record the writer forecasts from, on the way in use that day (`base`, forecast by `predictOf`). A failure in it leaves the rows the base way's, and is kept for the Worker's report. */
async function challengerFor(base: WayId, checkins: readonly CheckIn[], values: ReadonlyMap<string, number>, today: string, predictOf: Predict): Promise<ChallengerRun | null> {
  const [contexts, outsideRows, outcomes, settings, items, events, marks, kept, prefs] = await Promise.all([db.days.toArray(), db.outside.toArray(), db.outcomes.toArray(), getSettings(), db.privateItems.toArray(), db.noteEvents.toArray(), db.noteMarks.toArray(), db.notes.toArray(), getBrainPrefs()])
  // What was noticed in notes counts only while it stands under the phone's own join, read afresh at every run; each kind of candidate only while its Brain switch is on.
  const noticed = noticedOf({ events, marks, checkins, kept })
  const record = { checkins, contexts: new Map(contexts.map((c) => [c.day, c])), eveningWorkouts: eveningWorkoutDays(outsideRows), natureMoves: natureMoveDays(outcomes), hideFaith: settings.hideFaith, items, noticed, privateOn: prefs.switches.privateItems !== false, notesOn: prefs.switches.notes !== false }
  return guardComparisons(today, () => runChallenger(base, values, today, conditionsFor(record, today), CHALLENGER, predictOf))
}

/** The level-plus-weekday way for a run (Stage A, 2026-11-21): its one reader and the rows it writes today; null where it is not in use, or where it threw, the failure kept for the Worker's report. */
function wayFor(values: ReadonlyMap<string, number>, today: string): { reader: LevelWeekdayReader; rows: Map<string, WeekRow> } | null {
  // While Stage C is switched on, the level-plus-weekday way's own path is never taken: it writes only from inside Stage C (the owner's word of 2026-11-22).
  if (knownAheadOn()) return null
  return guardComparisons(today, () => wayOf(levelWeekdayReader(values, WEEK), today))
}

function wayOf(reader: LevelWeekdayReader, today: string): { reader: LevelWeekdayReader; rows: Map<string, WeekRow> } | null {
  const rows = reader.rows(today)
  return rows ? { reader, rows } : null
}

/** The challenger's base forecast: the level-plus-weekday way's from the run's one reader, where the way writes the day; the four's by `predict`. */
function baseForecast(reader: LevelWeekdayReader | null, today: string): Predict {
  return (model, values, day, block) => (model === LEVEL_WEEKDAY && reader ? reader.forecast(today, day, block) : fourWays(model, values, day, block))
}

/** How long the writer waits for the day's one weather read, before the day's rows, while Stage C is switched on (Stage C-A). */
export const WEATHER_WAIT_MS = 10_000

/** A promise's value, or null once the time given has passed first. */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([p, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]).finally(() => clearTimeout(timer))
}

/**
 * The forecast issued today, before today's rows (Stage C-A, 2026-11-22): at a day's first open the writer usually runs
 * before the day's one weather read comes back, and a row is never rewritten. So, while Stage C is switched on and today's
 * record keeps no forecast issued yet, the writer first waits for that one read (`readWeatherToday`: the same request, at
 * most once a day, only while its switch is on and a place is known), for at most ten seconds.
 */
async function todaysWeather(today: string): Promise<void> {
  if ((await db.days.get(today))?.weatherIssued) return
  await within(readWeatherToday(), WEATHER_WAIT_MS)
}

/** Stage C for a run (Stage C-A, 2026-11-22): its one reader, and what it writes today; null where it is not in use, or where it threw, the failure kept for the Worker's report. */
async function knownAheadFor(values: ReadonlyMap<string, number>, checkins: readonly CheckIn[], today: string): Promise<{ reader: KnownAheadReader; day: KnownAheadDay; onTrip: (day: string) => boolean } | null> {
  await todaysWeather(today)
  const [days, settings, away] = await Promise.all([db.days.toArray(), getSettings(), awayDays()])
  // The record the four are given: a trip's days left out, their weather and the forecasts issued on them with their check-ins.
  const record = knownAheadRecordOf({ values, checkins, days: homeDaysOnly(days, away), week: settings.week, depth: settings.depth, retired: settings.retiredReadings, weights: learnedWeights() })
  const tripDay = (day: string): boolean => awayOn() && onTrip(settings.away, day)
  return guardComparisons(today, () => knownAheadOf(record, values, today, tripDay))
}

function knownAheadOf(record: KnownAheadRecord, values: ReadonlyMap<string, number>, today: string, tripDay: (day: string) => boolean): { reader: KnownAheadReader; day: KnownAheadDay; onTrip: (day: string) => boolean } | null {
  const reader = knownAheadReader(record, today, STAGE_C)
  const state = reader.state()
  const way = wayOfState(state)
  if (!way) return null
  const rows = reader.rows()
  if (!rows) return null
  // What the Stage B way would have written by its own test, where it is in use that day (the handoff's A5): kept beside Stage C's rows.
  const stageB = levelWeekdayRows(values, today, WEEK)
  return { reader, day: { way, rows, stageB, weather: measureOfState(state) }, onTrip: tripDay }
}

/** The challenger's base forecast where Stage C writes the day: every one of Stage C's ways, the level-plus-weekday way among them, from the run's one reader; the four's by `predict`. */
function knownAheadBase(reader: KnownAheadReader): Predict {
  return (model, values, day, block) => (KNOWN_AHEAD_WAYS.includes(model) ? reader.forecast(day, block) : fourWays(model, values, day, block))
}

export { lastNightKeys, type LastNightKey } from './lastNight'

export interface LastNight {
  key: LastNightKey
  with: number | null
  without: number | null
  n: number
  /** Whether evenings like it and evenings without it shared a band (2026-10-21): only then is it said like for like. */
  matched: boolean
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
  model: WayId | null
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
  const necessities = lastEvenings.reduce((n, c) => n + necessitiesMissed(c?.extras).length, 0)
  const evening = todays.find((t) => t.block === 'evening')?.forecast ?? null
  const yesterday = addDays(today, -1)
  const [offers, outcomes, contexts, outsideRows] = await Promise.all([db.offers.toArray(), db.outcomes.toArray(), db.days.toArray(), db.outside.toArray()])
  const ctxByDay = new Map(contexts.map((c) => [c.day, c]))
  const outside = eveningWorkoutDays(outsideRows)
  const natureMoves = natureMoveDays(outcomes)
  const eve = checkins.find((c) => c.day === yesterday && c.block === 'evening')
  // Where the record can speak for each thing is kept with the twelve themselves (lastNight.ts): caffeine, time in nature and something sweet only where they were seen.
  const known = (key: LastNightKey) => knownTest(key, natureMoves)
  const carried = lastNightKeys(eve, ctxByDay.get(yesterday), outside.has(yesterday), natureMoves.has(yesterday)).map((key) => ({ key, assoc: associationFor(checkins, today, eventTest(key, ctxByDay, outside, natureMoves), known(key)) }))
  const best = carried.filter((c) => c.assoc.diff !== null).sort((a, b) => b.assoc.times - a.assoc.times)[0] ?? carried[0] ?? null
  const lastNight: LastNight | null = best ? { key: best.key, with: best.assoc.withEvent.mean, without: best.assoc.without.mean, n: best.assoc.times, matched: likeForLikeMatched(best.assoc) } : null
  // Steady is a conclusion: it needs the same six logged blocks the warning does, or it says nothing.
  const steady = ready && !w.warning && w.of >= WARNING_WINDOW ? { inside: w.of - w.under, of: w.of } : null
  // Item 4: Nothing extra is no move, and nothing is done for it: it is never yesterday's move.
  const read = observations(checkins, offers, outcomes)
    .filter((o) => o.day === yesterday && o.arm !== 'declined' && o.moveId !== NOTHING)
    .sort((a, b) => b.offerId - a.offerId)
  const move: YesterdayMove | null = read.length ? { moveId: read[0].moveId, target: read[0].target, effect: read[0].effect, arm: read[0].arm as 'done' | 'partly' } : null
  return {
    lastNight,
    steady,
    move,
    days,
    ready,
    model: (todays.find((t) => t.forecast)?.forecast?.model as WayId | undefined) ?? null,
    today: todays,
    yesterday: dayBeside(forecasts, values, addDays(today, -1)),
    warning: ready ? { ...w, chips, necessities } : null,
    // What-if speaks of an evening still to come; once the evening is logged it has nothing to say.
    whatIf: (todays.find((t) => t.block === 'evening')?.actual ?? null) !== null ? null : (evening?.whatIf ?? null),
  }
}

/** What is usual for a slot: its lowest-horizon forecast on record, or null. */
/**
 * The line under the usual one (the forecast follow-ups, item 3): the same slot's forecast, where the challenger moved it,
 * in words; a private item by its name only while names are shown outside its screen, the evening's band read from
 * the evening before by the forecast's own rule.
 */
export async function adjustedFor(day: string, block: Block): Promise<string | null> {
  const [rows, settings, items, before] = await Promise.all([db.forecasts.where('day').equals(day).toArray(), getSettings(), db.privateItems.toArray(), db.checkins.where('day').equals(addDays(day, -1)).toArray()])
  const f = rows.filter((r) => r.block === block).sort((a, b) => a.horizon - b.horizon)[0]
  if (!f) return null
  const names = new Map(items.map((it) => [String(it.id), it.name]))
  return adjustedWords(f, (id) => (settings.showPrivate === true ? (names.get(id) ?? null) : null), bandBefore(before, day))
}

export async function usualFor(day: string, block: Block): Promise<{ point: number; lo: number; hi: number } | null> {
  const rows = (await db.forecasts.where('day').equals(day).toArray()).filter((f) => f.block === block).sort((a, b) => a.horizon - b.horizon)
  return rows[0] ? { point: rows[0].point, lo: rows[0].lo, hi: rows[0].hi } : null
}

export interface Weekly {
  /** The model behind the latest forecasts, named on the weekly view. */
  model: WayId | null
  scorecard: Scorecard
  best: BestDays
  gap: Gap
  moved: ReturnType<typeof movedThisWeek>
  lasts: Lasts
  health: FamilyHealth[]
  /** Part 20's tier 2, use four: contexts the record shows carrying in-person reps that the week's shape never counts as people around. */
  people: { kind: DayKind; block: Block; n: number }[]
  /** Whether a path is on: then tier 1 marks a rep as one that would mean going out, where with none it keeps the draw's in-person moves out (Pass 3). */
  pathOn: boolean
  prompt: string
  weekAhead: AheadRow[]
  weekAheadReady: boolean
  /** The days ahead drawn as the lowest: none when no day reads lower, or the model cannot tell weekdays apart. */
  weekAheadLow: number[]
  /** True when the model has no weekday term, so the days ahead come out alike by construction; never for Stage C's weather way, whose days differ by their forecasts. */
  weekAheadAlike: boolean
  shift: Shift | null
  /** The honesty checks the record runs on itself (stage R7). */
  checks: HonestyChecks
  /** Batch 3: the moved forecasts set beside the plain ones, for the Scorecard, read exactly as the writer reads it. */
  movedCheck: MovedCheck
}

/** The records the weekly view's analyses are computed from. */
export interface WeeklyRecords {
  checkins: readonly CheckIn[]
  offers: readonly Offer[]
  outcomes: readonly Outcome[]
  cards: readonly Card[]
  declarations: readonly Declaration[]
  contexts: readonly DayContext[]
  scores: readonly ForecastScore[]
  outside: readonly { day: string }[]
  hideFaith: boolean
  /** Stage R7: the wording changes, the frequency asked for and the owner's answers on readings that move together. */
  swaps: readonly AnchorSwap[]
  frequency: Frequency
  togetherAnswers: Settings['togetherAnswers']
  /** The learning engine's own count for the scorecard; null when it could not read the record. */
  repair: RepairTrack | null
}

/**
 * The weekly view's six analyses, computed exactly as the view computes them (stage 3, group 1): the
 * Sunday review's facts read them over the steps the sheet may count, and the view over every step.
 */
export function weeklyAnalyses(r: WeeklyRecords, today: string): WeeklyAnalyses {
  const obs = observations(r.checkins, r.offers, r.outcomes)
  return {
    scorecard: scorecard(r.scores, r.checkins, r.repair),
    best: bestDays(r.checkins, r.offers, r.outcomes, r.contexts, today, new Set(r.outside.map((o) => o.day))),
    gap: gap(r.checkins, today),
    moved: movedThisWeek(r.checkins, today),
    lasts: whatLasts(obs, r.checkins),
    health: catalogueHealth(r.offers, r.outcomes, recentSituations(r.offers, today), new Set(r.hideFaith ? ['faith'] : [])),
    checks: honestyChecks(r, today),
  }
}

/** Everything the weekly view shows, from the records at the moment of asking. */
export async function weeklyData(today: string): Promise<Weekly> {
  const [checkins, offers, outcomes, contexts, forecasts, scores, settings, outside, aims, swaps] = await Promise.all([
    allCheckIns(),
    db.offers.toArray(),
    db.outcomes.toArray(),
    db.days.toArray(),
    db.forecasts.toArray(),
    db.forecastScores.toArray(),
    getSettings(),
    db.outside.toArray(),
    db.aims.toArray(),
    db.anchorSwaps.toArray(),
  ])
  // The scorecard's count and what has held are the engine's own (stage R7); null while it cannot read the record.
  const ev = await guardRepair(today, () => repairEvidence(today), null)
  const repair = ev ? trackSummary(ev) : null
  const held = ev ? ev.shown.filter((t) => t.direction === 'helps' && (t.level === 'established' || t.level === 'likely')).map((t) => ({ moveId: t.moveId, target: t.target, level: t.level as 'established' | 'likely' })) : null
  const obs = observations(checkins, offers, outcomes)
  const situations = recentSituations(offers, today)
  const health = catalogueHealth(offers, outcomes, situations, new Set(settings.hideFaith ? ['faith'] : []))
  const week = Array.from({ length: 7 }, (_, k) => addDays(today, k)).map((day) => contexts.find((c) => c.day === day) ?? contextFromWeek(day, settings))
  const people = uncoveredContexts(carriedByContext(offers, outcomes, contexts, today), week)
  const weekAhead = weekAheadRows(forecasts, today)
  const latest = forecasts.reduce<Forecast | null>((m, f) => (m === null || f.madeOn > m.madeOn ? f : m), null)
  const model = (latest?.model as WayId | undefined) ?? null
  return {
    model,
    scorecard: scorecard(scores, checkins, repair),
    // Your own chips (stage 3, item 5) on the view alone: the sheet's analyses above never take them.
    best: bestDays(checkins, offers, outcomes, contexts, today, new Set(outside.map((o) => o.day)), ownChipsOf(settings)),
    gap: gap(checkins, today),
    moved: movedThisWeek(checkins, today),
    lasts: whatLasts(obs, checkins),
    health,
    people,
    pathOn: aims.some((a) => a.kind === 'path' && a.archivedAt === null && !a.pausedAt),
    prompt: extensionPromptText({ situations, offers, outcomes, health, held }, extensionPrompt.template),
    weekAhead,
    weekAheadReady: weekAhead.some((w) => w.expected !== null),
    weekAheadLow: lowestAhead(weekAhead, model),
    weekAheadAlike: model !== null && !daysCanDiffer(model),
    shift: baselineShift(dayReadings(checkins, today), today),
    checks: checksAsShown(honestyChecks({ checkins, offers, outcomes, contexts, scores, swaps, frequency: settings.frequency, togetherAnswers: settings.togetherAnswers }, today), settings.hideFaith),
    movedCheck: movedCheck(forecasts, scores, today),
  }
}

