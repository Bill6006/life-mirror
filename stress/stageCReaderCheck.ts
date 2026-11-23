import { fileURLToPath } from 'node:url'
import { BLOCKS } from '../src/blocks'
import { weekdayOf } from '../src/counted/occasions'
import { HORIZON, predict, type ModelId } from '../src/forecast'
import { knownAheadReader, MEASURES, STAGE_C, type KnownAheadRecord } from '../src/knownAhead'
import { slotKey } from '../src/observe'
import { stageCTrackerOf, type StageCInputs, type StageCState } from './stageC'
import { runStageC } from './stageCSim'
import { cRecordOf, cWorldById, DAYS, READINGS, type CTruth } from './stageCWorlds'
import type { WeekRow } from './levelWeekday'

// Stage C-A's proof of the move (2026-11-22, the handoff's A1): the app's reader (src/knownAhead.ts), given each
// simulated person's record as the app would hold it, set beside the day-by-day tracker the verdict ran
// (stress/stageC.ts), on the fixture's 24 people, every day of each from day 0 to day 179: the state, every row, and the
// forecast the challenger reads as its base, number for number. The tracker is run two ways: through the simulation itself
// (runStageC's own hook, exactly as the verdict and the fixture ran it), and as built here from the same inputs, which must
// agree with each other before either is set beside the reader. A difference stops the run.
//
// node stress/.out/stageCReaderCheck.mjs [first seed]

const FIRST = 920001
const PEOPLE: readonly [world: string, plus: number][] = [
  ['plain', 0], ['two', 0], ['two', 1], ['two', 2], ['two-strong', 0], ['two-strong', 1], ['sun', 0], ['sun', 1], ['sun', 2], ['sun-bad', 0], ['sun-bad', 1], ['all', 0],
  ['all', 1], ['all', 2], ['kind-move', 0], ['kind-move', 1], ['kind-move', 2], ['kind-move', 3], ['kind-idle', 0], ['kind-idle', 1], ['rhythm', 0], ['rhythm', 1], ['rhythm-turn', 0], ['season', 0],
]
const NO_TRUTH: CTruth = { steps: [0, 1].map(() => Array.from({ length: 7 }, () => [0, 0, 0])), sun: 0, skill: [1, 1, 1, 1, 1, 1, 1, 1] }

const fail = (what: string): never => {
  throw new Error(what)
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const stateOf = (s: StageCState) => ({ inUse: s.inUse, score: s.score, readings: s.readings, weather: s.weather })
const rowsOf = (m: ReadonlyMap<string, WeekRow> | null) => (m ? [...m].sort(([a], [b]) => (a < b ? -1 : 1)) : [])

export function check(first: number): { people: number; days: number; inUse: number; rows: number; forecasts: number } {
  let days = 0
  let inUse = 0
  let rows = 0
  let forecasts = 0
  for (const [world, plus] of PEOPLE) {
    const seed = first + plus
    const rec = cRecordOf(cWorldById(world), seed)
    const index = new Map(rec.dayName.map((name, d) => [name, d]))
    // The tracker as the simulation runs it: its state and rows on every day, through runStageC's own hook.
    const watched: { state: StageCState; rows: Map<string, WeekRow> }[] = []
    runStageC(world, seed, [STAGE_C], NO_TRUTH, false, 'stageB', (day, state, r) => {
      watched[day] = { state, rows: r }
    })

    // The record as the app would hold it: every score and reading the simulation's record keeps (runStageC's own `all`
    // and `byReading`, days 0 to 179), each day's scheduled kind and the template's, the weather as it came, and the
    // forecasts as issued. Nothing of a day before the record's first is known.
    const values = new Map<string, number>()
    const byReading = READINGS.map(() => new Map<string, number>())
    for (let d = 0; d < DAYS; d++) {
      if (weekdayOf(rec.dayName[d]) !== rec.weekday[d]) fail(`${world} ${seed}: day ${d}'s weekday is not its date's`)
      BLOCKS.forEach((b, i) => {
        const v = rec.score[d][i]
        const p = rec.points[d][i]
        if (v === null || p === null) return
        values.set(slotKey(rec.dayName[d], b), v)
        p.forEach((x, r) => byReading[r].set(slotKey(rec.dayName[d], b), x))
      })
    }
    const at = (day: string): number | undefined => index.get(day)
    const record: KnownAheadRecord = {
      values,
      readings: byReading,
      share: () => 1 / READINGS.length,
      sameKind: (day, asOf) => {
        const x = at(day)
        const s = at(asOf)
        if (x === undefined || s === undefined) return fail(`${world} ${seed}: a kind asked of ${day} as of ${asOf}, outside the record`)
        return rec.kind[x] === rec.kindNow(s, rec.weekday[x])
      },
      observed: (m, day) => {
        const x = at(day)
        return x === undefined ? null : rec.observed[m][x]
      },
      issued: (m, issuedOn, ahead) => {
        const u = at(issuedOn)
        return u === undefined ? null : rec.issued[m][u][ahead]
      },
    }
    if (MEASURES.length !== rec.observed.length) fail('the measures differ in number')

    // The same tracker built here from the simulation's own inputs (as runStageC builds them), for its shift on a day.
    const upTo = (last: number): ReadonlyMap<string, number> => {
      const limit = last >= 0 ? rec.dayName[last] : ''
      return { get: (k: string) => (last >= 0 && k.slice(0, 10) <= limit ? values.get(k) : undefined) } as unknown as ReadonlyMap<string, number>
    }
    const view = (map: ReadonlyMap<string, number>, last: number): ReadonlyMap<string, number> => {
      const limit = last >= 0 ? rec.dayName[last] : ''
      return { get: (k: string) => (last >= 0 && k.slice(0, 10) <= limit ? map.get(k) : undefined) } as unknown as ReadonlyMap<string, number>
    }
    const missMemo = new Map<string, number | null>()
    const missOf = (model: ModelId, x: number, i: number, ahead: number): number | null => {
      const key = `${model}|${x}|${i}|${ahead}`
      if (!missMemo.has(key)) {
        const actual = rec.score[x][i]
        const p = actual === null ? null : predict(model, upTo(x - Math.max(1, ahead)), rec.dayName[x], BLOCKS[i])
        missMemo.set(key, actual === null || p === null ? null : actual - p)
      }
      return missMemo.get(key) as number | null
    }
    const inputs: StageCInputs = {
      reading: (day, block) => rec.score[day][block],
      flatMiss: (day, block, ahead) => missOf('sameBlock', day, block, ahead),
      flatForecast: (t, day, block) => predict('sameBlock', upTo(t - 1), rec.dayName[day], BLOCKS[block]),
      weekday: (day) => rec.weekday[day],
      dayName: (day) => rec.dayName[day],
      readings: READINGS.length,
      share: () => 1 / READINGS.length,
      readingMiss: (x, i, r) => {
        const actual = rec.points[x][i]
        const p = actual === null ? null : predict('sameBlock', view(byReading[r], x - 1), rec.dayName[x], BLOCKS[i])
        return actual === null || p === null ? null : actual[r] - p
      },
      kindOf: (day) => rec.kind[day],
      kindNow: (asOf, weekday) => rec.kindNow(asOf, weekday),
      measures: MEASURES.length,
      observed: (measure, day) => rec.observed[measure][day],
      issued: (measure, issuedOn, ahead) => rec.issued[measure][issuedOn][ahead],
      events: 0,
      eventBlock: () => 0,
      eventOn: () => null,
    }
    const tracker = stageCTrackerOf(STAGE_C, inputs)

    for (let t = 0; t < DAYS; t++) {
      const w = watched[t]
      if (!w) fail(`${world} ${seed}: no state watched on day ${t}`)
      const own = tracker.stateOn(t)
      if (!same(stateOf(own), stateOf(w.state)) || !same(rowsOf(tracker.rowsOn(t)), rowsOf(w.rows))) fail(`${world} ${seed}, day ${t}: the tracker built here differs from the simulation's`)
      if (w.state.events.length) fail('an event term in the fixture')
      const reader = knownAheadReader(record, rec.dayName[t], STAGE_C)
      const st = reader.state()
      if (!same(st, stateOf(w.state))) fail(`${world} ${seed}, day ${t}: the reader's state ${JSON.stringify(st)} differs from the tracker's ${JSON.stringify(stateOf(w.state))}`)
      const mine = reader.rows()
      if (!same(rowsOf(mine), rowsOf(w.state.inUse ? w.rows : null))) fail(`${world} ${seed}, day ${t}: the reader's rows differ from the tracker's (${mine?.size ?? 0} against ${w.rows.size})`)
      if (mine === null && w.state.inUse) fail(`${world} ${seed}, day ${t}: no rows where the tracker writes`)
      days++
      if (st.inUse) inUse++
      rows += mine?.size ?? 0
      // The challenger's base (A6): the same-block way's forecast from the record before the day of writing, plus what
      // Stage C added on the day it was written: the day itself before the day of writing, the day of writing from it on.
      if (t % 5 === 0 || st.inUse)
        for (let d = Math.max(0, t - 30); d <= Math.min(DAYS - 1, t + HORIZON); d++)
          BLOCKS.forEach((block, i) => {
            const flat = predict('sameBlock', upTo(t - 1), rec.dayName[d], block)
            const expected = flat === null ? null : flat + (d < t ? tracker.shiftOn(d, d, i) : tracker.shiftOn(t, d, i))
            const got = reader.forecast(rec.dayName[d], block)
            if (got !== expected) fail(`${world} ${seed}, day ${t}: the reader's forecast of ${rec.dayName[d]} ${block} is ${got}, the tracker's ${expected}`)
            forecasts++
          })
    }
    process.stderr.write(`${world} ${seed}: the same, ${DAYS} days\n`)
  }
  return { people: PEOPLE.length, days, inUse, rows, forecasts }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && /stageCReaderCheck\.mjs$/.test(process.argv[1])) {
  const r = check(Number(process.argv[2] || FIRST))
  console.log(`the reader is the tracker, number for number: ${r.people} people, ${r.days} days of writing, ${r.inUse} with Stage C in use, ${r.rows} rows, ${r.forecasts} forecasts of the challenger's base`)
}
