"""Stage C of the week ahead, Stage C-A (2026-11-22): the dormant build, behind a switch that is off. Each rule undone
once, and the test that guards it must turn red.

Push 1, the words and the readers: each of Stage C's ways' name and its sentence under Details, word for word as the
owner approved them; the screen says each way's own sentence; the two ways with a weekday shift among the ways that tell
one weekday from another, for the phone (`tellsWeekdaysApart`) and for the Worker (`WEEKDAY_WAYS`), and the weather way
not among them; the weather way's days read as days that can differ (`daysCanDiffer`, `DAYS_APART_WAYS`), so the card
marks its lowest day, never says its week as one level for want of a weekday term nor its days alike, and the Worker
never says its days come out alike; the four's forecast given for the four alone.

Push 2, the dormant build: each of the method's numbers as its verdict fixed them, and no recurring events' term; the
switch, off; the test over the weekdays that have their days (all seven the level-plus-weekday way's own, fewer than
five closed, a weekday left out taking no shift, the F over those weekdays) and a past day of another kind left out; the
slope test; the readings' term (each at its share, never while the score's test is held, its own chance and shrinking,
each reading's own miss); the weather's term (its chance, its strength, the level on half its days and from the days
before, the trust's least pairs, its bounds and its slope through nothing, one measure the smallest chance, the shift
from the forecast issued on the day of writing, in use only where its shift can be laid); the hold, its length, broken
by one day and counting the day itself; nothing read of the day of writing or after; the ranges from each day's own
record; the rows, the point and the challenger's base; a day's kind and the record the reader is given; the way a day's
rows name; the rows the writer adds (Stage C's numbers and way, `four`, `stageB`, the measure, the pick's skips, no row
for a trip's day); the writer (its switch, the guard, one reader a run, the level-plus-weekday way only from inside
Stage C, the pick beneath, the Stage B row by its own test, the trip set, the challenger on top, the day's weather read
first and at most ten seconds); and the export of what is kept.

python -B -I -X utf8 qa/known_ahead_breaks.py [id ...]   (every entry when none is named)
"""
import io
import os
import re
import subprocess
import sys
import time


def put_back(path, data):
    """Writes a file whole, trying again for ten seconds where Windows refuses the write for a moment (OSError 22)."""
    last = None
    for _ in range(40):
        try:
            with io.open(path, 'wb') as f:
                f.write(data)
            return
        except OSError as e:
            last = e
            time.sleep(0.25)
    raise last


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
NPM = 'npm.cmd' if os.name == 'nt' else 'npm'
CONFIG = os.environ.get('PW_CONFIG', 'playwright.config.ts')
FC = 'src/forecast.ts'
FCS = 'src/forecastConditions.ts'
FF = 'src/forecastFlow.ts'
CP = 'src/copy.ts'
WS = 'src/weeklyScreen.tsx'
CH = 'src/challenger.ts'
LK = 'worker/src/lookups.ts'
KW = 'src/knownAheadWords.test.ts'
CT = 'src/forecastConditions.test.ts'
DT = 'src/forecastDifferences.test.ts'
LT = 'worker/src/forecastsLookup.test.ts'
KA = 'src/knownAhead.ts'
EX = 'src/export.ts'
KT = 'src/knownAhead.test.ts'
KR = 'src/knownAheadWriter.test.ts'
KG = 'src/knownAheadGuard.test.ts'
KWT = 'src/knownAheadWeather.test.ts'
NUMBERS = "export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 2 }"
WEEKDAY = "'levelWeekday', 'levelReadings', 'levelWeekdayWeather']"
APART = " || model === LEVEL_READINGS || model === LEVEL_WEEKDAY_WEATHER"

TABLE = [
    # ---- Push 1: the words -----------------------------------------------------------------------------------------------
    dict(id='the-readings-ways-name', file=CP, tests=[KW, LT],
         old="levelReadings: 'your usual level at this time of day and how this weekday usually differs in some of your readings'",
         new="levelReadings: 'your usual level at this time of day and how this weekday usually differs in your readings'"),
    dict(id='the-weather-ways-name', file=CP, tests=[KW, LT],
         old="levelWeather: 'your usual level at this time of day and the weather forecast for the day'",
         new="levelWeather: 'your usual level at this time of day and the weather for the day'"),
    dict(id='the-weekday-weather-ways-name', file=CP, tests=[KW, LT],
         old="levelWeekdayWeather: 'your usual level at this time of day, how this weekday usually differs and the weather forecast for the day'",
         new="levelWeekdayWeather: 'your usual level at this time of day, how this weekday usually differs and the weather for the day'"),
    dict(id='the-weather-sentence', file=CP, tests=[KW],
         old="modelWeather: 'Expected from {model}. This way is used only after a clear tie between the weather and your days has held for four weeks.'",
         new="modelWeather: 'Expected from {model}. This way is used only after a tie between the weather and your days has held for four weeks.'"),
    dict(id='the-weekday-weather-sentence', file=CP, tests=[KW],
         old="modelWeekdayWeather: 'Expected from {model}. Each part is used only after it has held clearly for four weeks.'",
         new="modelWeekdayWeather: 'Expected from {model}. Each part is used only after it has held for four weeks.'"),
    # ---- Push 1: the screen says each way's own sentence -----------------------------------------------------------------
    dict(id='the-readings-way-says-the-weekday-sentence', file=WS, tests=[KW],
         old="[LEVEL_READINGS]: copy.weekly.modelWeekdays", new="[LEVEL_READINGS]: copy.weekly.model"),
    dict(id='the-weather-way-says-its-sentence', file=WS, tests=[KW],
         old="[LEVEL_WEATHER]: copy.weekly.modelWeather", new="[LEVEL_WEATHER]: copy.weekly.model"),
    dict(id='the-weekday-weather-way-says-its-sentence', file=WS, tests=[KW],
         old="[LEVEL_WEEKDAY_WEATHER]: copy.weekly.modelWeekdayWeather", new="[LEVEL_WEEKDAY_WEATHER]: copy.weekly.modelWeather"),
    dict(id='the-screen-asks-stage-cs-lines', file=WS, tests=[KW],
         old="fill(STAGE_C_LINES[model] ?? (", new="fill(("),
    # ---- Push 1: which ways tell weekdays apart, and whose days can differ -----------------------------------------------
    dict(id='the-readings-way-tells-weekdays-apart', file=FC, tests=[KW, CT], old=APART, new=" || model === LEVEL_WEEKDAY_WEATHER"),
    dict(id='the-weekday-weather-way-tells-weekdays-apart', file=FC, tests=[KW, CT], old=APART, new=" || model === LEVEL_READINGS"),
    dict(id='the-weather-ways-days-can-differ', file=FC, tests=[KW, CT],
         old="return tellsWeekdaysApart(model) || model === LEVEL_WEATHER", new="return tellsWeekdaysApart(model)"),
    dict(id='the-flat-week-reads-days-can-differ', file=FC, tests=[KW],
         old="  const blind = !daysCanDiffer(model)\n", new="  const blind = !tellsWeekdaysApart(model)\n"),
    dict(id='the-lowest-reads-days-can-differ', file=FC, tests=[KW],
         old="if (model !== null && !daysCanDiffer(model)) return []", new="if (model !== null && !tellsWeekdaysApart(model)) return []"),
    dict(id='the-weekly-alike-reads-days-can-differ', file=FF, tests=[KW],
         old="    weekAheadAlike: model !== null && !daysCanDiffer(model),\n",
         new="    weekAheadAlike: model !== null && !(daysCanDiffer(model) && model !== 'levelWeather'),\n"),
    # ---- Push 1: the shared lists, for the phone and the Worker -----------------------------------------------------------
    dict(id='stage-cs-weekday-ways', file=FCS, tests=[CT, LT, DT], old=WEEKDAY, new="'levelWeekday']"),
    dict(id='the-weather-way-not-among-the-weekday-ways', file=FCS, tests=[CT, LT, DT], old=WEEKDAY,
         new="'levelWeekday', 'levelReadings', 'levelWeekdayWeather', 'levelWeather']"),
    dict(id='the-ways-whose-days-can-differ', file=FCS, tests=[CT, LT],
         old="[...WEEKDAY_WAYS, 'levelWeather']", new="[...WEEKDAY_WAYS]"),
    dict(id='the-weather-way-never-said-alike', file=LK, tests=[LT],
         old="const alike = DAYS_APART_WAYS.includes(str(newest.model)) ? 'That way cannot tell one weekday from another.' : ",
         new="const alike = false ? 'That way cannot tell one weekday from another.' : "),
    # ---- Push 1: the four's forecast, for the four alone --------------------------------------------------------------------
    dict(id='the-four-ways-alone', file=FC, tests=[KW],
         old="(MODELS as readonly string[]).includes(model)", new="(MODELS as readonly string[]).includes(model) || model.startsWith('levelR')"),
    dict(id='the-four-ways-forecast-the-four-alone', file=CH, tests=[KW],
         old="(isFourWay(model) ? predict(model, values, day, block) : null)",
         new="(model !== 'levelWeekday' ? predict(model as never, values, day, block) : null)"),
    # ---- Push 2: the method's numbers, as its verdict fixed them -------------------------------------------------------------
    dict(id='the-readings-chance-as-set', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.00001, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 2 }"),
    dict(id='the-readings-shrinking-as-set', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 3, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 2 }"),
    dict(id='the-schedule-rule-on', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: false, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 2 }"),
    dict(id='the-least-weekdays-as-set', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 4, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 2 }"),
    dict(id='the-weathers-chance-as-set', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 2 }"),
    dict(id='the-weathers-shrinking-as-set', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 3, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 2 }"),
    dict(id='the-weathers-window-as-set', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 179, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 2 }"),
    dict(id='the-weathers-level-as-set', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 27, minPairs: 28, eventChance: 0, eventShrink: 2 }"),
    dict(id='the-least-pairs-as-set', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 27, eventChance: 0, eventShrink: 2 }"),
    dict(id='no-events-term', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0.01, eventShrink: 2 }"),
    dict(id='the-events-shrinking-as-set', file=KA, tests=[KT], old=NUMBERS, new="export const STAGE_C: StageCNumbers = { readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 3 }"),
    dict(id='the-events-term-is-not-built', file=KA, tests=[KT],
         old="  if (numbers.eventChance > 0) throw new Error('the recurring events’ term is not built')\n", new=""),
    # ---- Push 2: the switch ---------------------------------------------------------------------------------------------------
    dict(id='the-switch', file=KA, tests=[KT, KR], old="export const KNOWN_AHEAD_ON = false", new="export const KNOWN_AHEAD_ON = true"),
    # ---- Push 2: the test over the weekdays that have their days, and the slope test -------------------------------------------
    dict(id='all-seven-is-the-ways-own-test', file=KA, tests=[KT], old="  if (weekdays === 7) return gateOf(days, numbers)\n", new=""),
    dict(id='fewer-than-five-closed', file=KA, tests=[KT],
         old="if (weekdays < Math.max(2, minWeekdays)) return CLOSED", new="if (weekdays < Math.max(2, minWeekdays - 2)) return CLOSED"),
    dict(id='a-weekday-left-out-takes-no-shift', file=KA, tests=[KT],
         old="const offset = mean.map((m, w) => (has[w] ? m - grand : 0))", new="const offset = mean.map((m) => m - grand)"),
    dict(id='the-f-over-those-weekdays', file=KA, tests=[KT],
         old="const chance = fChance(f, weekdays - 1, total - weekdays)", new="const chance = fChance(f, 6, total - 7)"),
    dict(id='the-spread-between-those-weekdays', file=KA, tests=[KT],
         old="n[w] * o * o : 0), 0) / (weekdays - 1)", new="n[w] * o * o : 0), 0) / 6"),
    dict(id='a-past-day-of-another-kind-left-out', file=KA, tests=[KT, KR],
         old="      if (numbers.reset && !record.sameKind(x, t)) continue\n", new=""),
    dict(id='the-slopes-t', file=KA, tests=[KT],
         old="const t2 = (slope * slope * sxx) / (left / df)", new="const t2 = (slope * slope * sxx) / (left / (df + 1))"),
    dict(id='the-slope-needs-its-degrees', file=KA, tests=[KT],
         old="if (df < 1 || !(sxx > 0)) return null", new="if (df < 0 || !(sxx > 0)) return null"),
    # ---- Push 2: the readings' term ---------------------------------------------------------------------------------------------
    dict(id='each-reading-at-its-share', file=KA, tests=[KT],
         old="if (on) v += record.share(r, block) * d.readings[r].shift[w]", new="if (on) v += d.readings[r].shift[w] / 6"),
    dict(id='the-readings-never-while-the-score', file=KA, tests=[KT],
         old="record.readings.map((_, r) => !score && openRun(", new="record.readings.map((_, r) => openRun("),
    dict(id='the-readings-own-chance', file=KA, tests=[KT],
         old="{ ...WEEK, chance: numbers.readingChance, shrink: numbers.readingShrink }", new="{ ...WEEK, chance: WEEK.chance, shrink: numbers.readingShrink }"),
    dict(id='the-readings-own-shrinking', file=KA, tests=[KT],
         old="{ ...WEEK, chance: numbers.readingChance, shrink: numbers.readingShrink }", new="{ ...WEEK, chance: numbers.readingChance, shrink: WEEK.shrink }"),
    dict(id='each-readings-own-miss', file=KA, tests=[KT, KR],
         old="const p = actual === undefined ? null : predict('sameBlock', series, day, block)", new="const p = actual === undefined ? null : predict('sameBlock', values, day, block)"),
    # ---- Push 2: the weather's term ---------------------------------------------------------------------------------------------
    dict(id='the-weathers-own-chance', file=KA, tests=[KT],
         old="if (!test || !(test.chance <= numbers.weatherChance)) return NO_WEATHER", new="if (!test || !(test.chance <= STAGE_C.weatherChance)) return NO_WEATHER"),
    dict(id='the-weathers-strength', file=KA, tests=[KT],
         old="effect: test.slope * Math.max(0, 1 - numbers.weatherShrink / test.t2)", new="effect: test.slope"),
    dict(id='the-level-on-half-its-days', file=KA, tests=[KT],
         old="return n >= Math.ceil(numbers.weatherLevel / 2) ? sum / n : null", new="return n >= Math.ceil(numbers.weatherLevel / 2) - 1 ? sum / n : null"),
    dict(id='the-level-from-the-days-before', file=KA, tests=[KT],
         old="for (let back = numbers.weatherLevel; back >= 1; back--) {", new="for (let back = numbers.weatherLevel; back >= 0; back--) {"),
    dict(id='the-trusts-least-pairs', file=KA, tests=[KT],
         old="return pairs >= minPairs && sff > 0 ? Math.max(0, Math.min(1, sfo / sff)) : 0", new="return pairs >= minPairs - 3 && sff > 0 ? Math.max(0, Math.min(1, sfo / sff)) : 0"),
    dict(id='the-trust-at-most-one', file=KA, tests=[KT],
         old="return pairs >= minPairs && sff > 0 ? Math.max(0, Math.min(1, sfo / sff)) : 0", new="return pairs >= minPairs && sff > 0 ? Math.max(0, sfo / sff) : 0"),
    dict(id='the-trust-at-least-nothing', file=KA, tests=[KT],
         old="return pairs >= minPairs && sff > 0 ? Math.max(0, Math.min(1, sfo / sff)) : 0", new="return pairs >= minPairs && sff > 0 ? Math.min(1, sfo / sff) : 0"),
    dict(id='the-trust-through-nothing', file=KA, tests=[KT],
         old="        sff += (said - lv) * (said - lv)\n        sfo += (said - lv) * (came - lv)", new="        sff += said * said\n        sfo += said * came"),
    dict(id='one-measure-the-smallest-chance', file=KA, tests=[KT],
         old="(measure < 0 || d.weather[m].chance < d.weather[measure].chance)", new="(measure < 0 || d.weather[m].chance > d.weather[measure].chance)"),
    dict(id='the-shift-from-todays-forecast', file=KA, tests=[KT],
         old="const said = h >= 0 && h <= HORIZON ? record.issued(a.measure, s, h) : null", new="const said = h >= 0 && h <= HORIZON ? record.issued(a.measure, addDays(s, -1), h + 1) : null"),
    dict(id='in-use-only-where-it-can-be-laid', file=KA, tests=[KT], old="&& laid(m, s) && (measure", new="&& (measure"),
    dict(id='laid-needs-todays-forecast', file=KA, tests=[KT],
         old="=> record.issued(m, s, 0) !== null && level[m](s) !== null", new="=> level[m](s) !== null"),
    dict(id='laid-needs-the-level', file=KA, tests=[KT],
         old="=> record.issued(m, s, 0) !== null && level[m](s) !== null", new="=> record.issued(m, s, 0) !== null"),
    # ---- Push 2: the hold -----------------------------------------------------------------------------------------------------
    dict(id='the-holds-length', file=KA, tests=[KT], old="const days = held ? HOLD + 1 : 1", new="const days = held ? HOLD : 1"),
    dict(id='the-hold-broken-by-one-day', file=KA, tests=[KT],
         old="for (let back = 0; back < days; back++) if (!open(addDays(day, -back))) return false", new="for (let back = 0; back < days - 1; back++) if (!open(addDays(day, -back))) return false"),
    dict(id='the-hold-counts-the-day-itself', file=KA, tests=[KT],
         old="for (let back = 0; back < days; back++) if (!open(addDays(day, -back))) return false", new="for (let back = 1; back < days; back++) if (!open(addDays(day, -back))) return false"),
    # ---- Push 2: what it reads, and what it never reads -----------------------------------------------------------------------
    dict(id='the-tests-read-the-days-before', file=KA, tests=[KT],
         old="    for (let back = WINDOW; back >= 1; back--) {\n      const x = addDays(t, -back)\n      const m = series(x)",
         new="    for (let back = WINDOW; back >= 0; back--) {\n      const x = addDays(t, -back)\n      const m = series(x)"),
    dict(id='the-weathers-test-reads-the-days-before', file=KA, tests=[KT],
         old="    for (let back = numbers.weatherWindow; back >= 1; back--) {\n      const x = addDays(t, -back)",
         new="    for (let back = numbers.weatherWindow; back >= 0; back--) {\n      const x = addDays(t, -back)"),
    dict(id='the-trust-reads-what-came-before', file=KA, tests=[KT],
         old="      for (let back = numbers.weatherWindow; back >= 1; back--) {\n        const d = addDays(t, -back)",
         new="      for (let back = numbers.weatherWindow; back >= 0; back--) {\n        const d = addDays(t, -back)"),
    dict(id='the-rows-from-the-record-before', file=KA, tests=[KT],
         old="        const flat = predict('sameBlock', prior, day, block)\n        if (flat === null) continue",
         new="        const flat = predict('sameBlock', values, day, block)\n        if (flat === null) continue"),
    dict(id='the-challengers-base-from-the-record-before', file=KA, tests=[KT],
         old="    const flat = predict('sameBlock', prior, day, block)\n    if (flat === null) return null",
         new="    const flat = predict('sameBlock', values, day, block)\n    if (flat === null) return null"),
    dict(id='the-ranges-read-the-days-before', file=KA, tests=[KT],
         old="    for (let back = 1; back <= BACKTEST_DAYS; back++) {\n      const x = addDays(t, -back)\n      const written",
         new="    for (let back = 0; back <= BACKTEST_DAYS; back++) {\n      const x = addDays(t, -back)\n      const written"),
    # ---- Push 2: the ranges, the rows and the challenger's base ------------------------------------------------------------------
    dict(id='the-ranges-from-each-days-own-record', file=KA, tests=[KT],
         old="if (e !== null) out.push(e - shift(written, false, x, block))", new="if (e !== null) out.push(e - shift(today, false, x, block))"),
    dict(id='the-ranges-written-that-many-days-before', file=KA, tests=[KT],
         old="const written = addDays(x, -(Math.max(1, ahead) - 1))", new="const written = x"),
    dict(id='no-rows-while-not-in-use', file=KA, tests=[KT], old="    if (!anyOf(active(today, true))) return null\n", new=""),
    dict(id='the-point-takes-the-shift', file=KA, tests=[KT], old="const p = flat + shift(today, true, day, block)", new="const p = flat"),
    dict(id='a-past-days-forecast-by-that-days-state', file=KA, tests=[KT], old="const s = day < today ? day : today", new="const s = today"),
    # ---- Push 2: a day's kind and the record the reader is given ------------------------------------------------------------------
    dict(id='the-kind-never-at-office', file=KA, tests=[KT],
         old="...(typeof ctx.officeDay === 'boolean' ? { office: ctx.officeDay } : {}),", new="...(typeof ctx.atOffice === 'boolean' ? { office: ctx.atOffice } : {}),"),
    dict(id='the-church-held-by-the-schedule', file=KA, tests=[KT],
         old="...(ctx.schedule === 1 ? { church: church ?? 'none' } : {}),", new="...({ church: church ?? 'none' }),"),
    dict(id='a-trips-church-from-what-it-kept', file=KA, tests=[KT],
         old="const church = held ? held.church : ctx.church", new="const church = ctx.church"),
    dict(id='a-trips-pickup-from-what-it-kept', file=KA, tests=[KT],
         old="const pickup = held ? held.pickupTime : ctx.pickupTime", new="const pickup = ctx.pickupTime"),
    dict(id='the-templates-daycare-with-a-pickup', file=KA, tests=[KT],
         old="daycare: (week.daycareDays[weekday] ? week.pickupTime : null) !== null,", new="daycare: week.daycareDays[weekday],"),
    dict(id='the-share-as-the-block-asks', file=KA, tests=[KT],
         old="const asked = askedReadings(block, src.depth, src.retired).filter((id) => INGREDIENT_IDS.includes(id))", new="const asked = INGREDIENT_IDS"),
    dict(id='the-share-by-the-learned-weights', file=KA, tests=[KT],
         old="const weight = (id: string): number => (src.weights ? (src.weights[id] ?? 1) : 1)", new="const weight = (_id: string): number => 1"),
    dict(id='a-readings-points', file=KA, tests=[KT],
         old="readings[r].set(slotKey(c.day, c.block), pointsFor(id, a as Position))", new="readings[r].set(slotKey(c.day, c.block), ((a as number) - 1) * 25)"),
    dict(id='the-forecasts-as-issued-for-their-day', file=KA, tests=[KT],
         old="const f = kept?.days.find((d) => d.day === addDays(issuedOn, ahead))", new="const f = kept?.days.find((d) => d.day === addDays(issuedOn, ahead + 1))"),
    # ---- Push 2: the way a day's rows name ----------------------------------------------------------------------------------------
    dict(id='the-way-with-a-weekday-and-the-weather', file=KA, tests=[KT], old="if (weekday && weather) return LEVEL_WEEKDAY_WEATHER", new="if (false) return LEVEL_WEEKDAY_WEATHER"),
    dict(id='the-weather-way', file=KA, tests=[KT, KR], old="if (weather) return LEVEL_WEATHER", new="if (false) return LEVEL_WEATHER"),
    dict(id='the-readings-way', file=KA, tests=[KT, KR], old="return s.score ? LEVEL_WEEKDAY : LEVEL_READINGS", new="return LEVEL_WEEKDAY"),
    dict(id='the-measure-named', file=KA, tests=[KT], old="return m < 0 ? null : MEASURES[m]", new="return m < 0 ? null : MEASURES[0]"),
    # ---- Push 2: the rows the writer adds -------------------------------------------------------------------------------------------
    dict(id='stage-cs-own-numbers', file=KA, tests=[KT, KR],
         old="{ ...f, model: ahead.way, point: w.point, lo: w.lo, hi: w.hi, four:", new="{ ...f, model: ahead.way, point: f.point, lo: f.lo, hi: f.hi, four:"),
    dict(id='the-days-way-on-its-rows', file=KA, tests=[KT, KR],
         old="out.push(w ? { ...f, model: ahead.way,", new="out.push(w ? { ...f, model: f.model,"),
    dict(id='four-kept', file=KA, tests=[KT, KR],
         old="four: { model: f.model, point: f.point, lo: f.lo, hi: f.hi }, ...keptOf(ahead, key)", new="four: { model: f.model, point: w.point, lo: w.lo, hi: w.hi }, ...keptOf(ahead, key)"),
    dict(id='stage-b-kept', file=KA, tests=[KT, KR],
         old="return { ...(b ? { stageB: { point: b.point, lo: b.lo, hi: b.hi } } : {}), ...(day.weather ? { weather: day.weather } : {}) }",
         new="return { ...(day.weather ? { weather: day.weather } : {}) }"),
    dict(id='the-weather-measure-kept', file=KA, tests=[KT, KR],
         old="return { ...(b ? { stageB: { point: b.point, lo: b.lo, hi: b.hi } } : {}), ...(day.weather ? { weather: day.weather } : {}) }",
         new="return { ...(b ? { stageB: { point: b.point, lo: b.lo, hi: b.hi } } : {}) }"),
    dict(id='a-slot-of-the-picks-alone-stays', file=KA, tests=[KT], old="      if (f) out.push(w ? { ...f", new="      if (f && w) out.push(w ? { ...f"),
    dict(id='never-a-slot-with-a-row-at-that-distance', file=KA, tests=[KT],
         old="else if (w && !have.has(key) && !logged.has(slotKey(day, block)))", new="else if (w && !logged.has(slotKey(day, block)))"),
    dict(id='never-a-logged-slot', file=KA, tests=[KT],
         old="else if (w && !have.has(key) && !logged.has(slotKey(day, block)))", new="else if (w && !have.has(key))"),
    dict(id='no-row-for-a-trips-day', file=KA, tests=[KT, KR], old="    if (onTrip(day)) continue\n", new=""),
    # ---- Push 2: the writer ---------------------------------------------------------------------------------------------------------
    dict(id='the-writer-asks-the-switch', file=FF, tests=[KR],
         old="const known = chosen && knownAheadOn() ? await knownAheadFor(values, checkins, today) : null", new="const known = chosen ? await knownAheadFor(values, checkins, today) : null"),
    dict(id='the-guard', file=FF, tests=[KG],
         old="  return guardComparisons(today, () => knownAheadOf(record, values, today, tripDay))", new="  return knownAheadOf(record, values, today, tripDay)"),
    dict(id='one-reader-a-run', file=FF, tests=[KG], old="  const rows = reader.rows()\n", new="  const rows = knownAheadReader(record, today, STAGE_C).rows()\n"),
    dict(id='the-writer-adds-stage-cs-rows', file=FF, tests=[KR],
         old="const due = known ? rowsWithKnownAhead(four, known.day, existing, logged, today, (day, block) => whatIf(values, done, day, block), known.onTrip) : theWays",
         new="const due = theWays"),
    dict(id='the-level-plus-weekday-way-only-from-inside', file=FF, tests=[KR], old="  if (knownAheadOn()) return null\n", new=""),
    dict(id='what-is-beneath-is-the-pick', file=FF, tests=[KR],
         old="  const way = wayOfState(state)\n  if (!way) return null\n",
         new="  const way = wayOfState(state)\n  if (!way) {\n    const b = levelWeekdayRows(values, today, WEEK)\n    return b ? { reader, day: { way: LEVEL_WEEKDAY, rows: b, stageB: null, weather: null }, onTrip: tripDay } : null\n  }\n"),
    dict(id='the-stage-b-row-by-its-own-test', file=FF, tests=[KR],
         old="  const stageB = levelWeekdayRows(values, today, WEEK)\n", new="  const stageB = null\n"),
    dict(id='the-trip-from-the-trip-set', file=FF, tests=[KR],
         old="const tripDay = (day: string): boolean => awayOn() && onTrip(settings.away, day)", new="const tripDay = (_day: string): boolean => false"),
    dict(id='the-challengers-base-is-stage-cs-way', file=FF, tests=[KR],
         old="challengerFor(known?.day.way ?? (way ? LEVEL_WEEKDAY : chosen.model),", new="challengerFor((way ? LEVEL_WEEKDAY : chosen.model),"),
    dict(id='the-challengers-forecast-of-stage-c', file=FF, tests=[KR],
         old="(KNOWN_AHEAD_WAYS.includes(model) ? reader.forecast(day, block) : fourWays(model, values, day, block))",
         new="(KNOWN_AHEAD_WAYS.includes(model) ? fourWays('sameBlock', values, day, block) : fourWays(model, values, day, block))"),
    dict(id='the-moved-rows-take-stage-cs-forecast', file=FF, tests=[KR],
         old="const predictOf = known ? knownAheadBase(known.reader) : baseForecast(way?.reader ?? null, today)",
         new="const predictOf = baseForecast(way?.reader ?? null, today)"),
    dict(id='the-days-weather-read-first', file=FF, tests=[KWT], old="  await todaysWeather(today)\n", new=""),
    dict(id='the-wait-bounded', file=FF, tests=[KWT], old="  await within(readWeatherToday(), WEATHER_WAIT_MS)", new="  await readWeatherToday()"),
    dict(id='no-wait-with-todays-forecast-kept', file=FF, tests=[KWT], old="  if ((await db.days.get(today))?.weatherIssued) return\n", new=""),
    # ---- Push 2: the export of what is kept ---------------------------------------------------------------------------------------
    dict(id='stage-b-exported', file=EX, tests=[KR],
         old="...(b ? { stageB: { point: b.point, lo: b.lo, hi: b.hi } } : {}), ...(f.weather", new="...(f.weather"),
    dict(id='the-weather-measure-exported', file=EX, tests=[KR],
         old=", ...(f.weather ? { weather: f.weather } : {}) }", new=" }"),
]


def build():
    r = subprocess.run([NPM, 'run', 'build'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit('build failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def browser(tests):
    return any(t.startswith('e2e/') for t in tests)


def run(tests):
    assert tests, 'an empty test list would run everything'
    if browser(tests):
        cmd = [NPX, 'playwright', 'test', '-c', CONFIG, '--retries', '0', *tests]
    else:
        cmd = [NPX, 'vitest', 'run', *tests]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
    passed = int(m.group(1)) if (m := re.search(r'(\d+) passed', out)) else 0
    failed = int(m.group(1)) if (m := re.search(r'(\d+) failed', out)) else 0
    return r.returncode, failed, passed, out


def main(ids):
    # An id that matches no entry is refused, never skipped.
    unknown = [i for i in ids if i not in {t['id'] for t in TABLE}]
    assert not unknown, f'no entry is named {unknown}'
    rows = [t for t in TABLE if not ids or t['id'] in ids]
    assert rows, 'no entry matched'
    results = []
    if any(browser(t['tests']) for t in rows):
        build()
    for t in rows:
        path = ROOT + t['file']
        original = io.open(path, 'rb').read()
        text = original.decode('utf-8')
        n = text.count(t['old'])
        if n != 1:
            results.append((t['id'], f'SETUP: the text to break appears {n} times'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        code, failed, passed, out = run(t['tests'])
        if code != 0 or passed == 0:
            results.append((t['id'], f'NO GREEN BASELINE (exit {code}, {passed} passed)'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        try:
            io.open(path, 'wb').write(text.replace(t['old'], t['new']).encode('utf-8'))
            if browser(t['tests']):
                build()
            code2, failed2, passed2, out2 = run(t['tests'])
        finally:
            put_back(path, original)
            if browser(t['tests']):
                build()
        assert io.open(path, 'rb').read() == original, 'restore failed: ' + t['file']
        verdict = 'CAUGHT' if code2 != 0 and failed2 > 0 else f'MISSED (exit {code2}, {failed2} failed, {passed2} passed)'
        results.append((t['id'], f'{verdict}; baseline {passed} green'))
        print(t['id'], '->', results[-1][1], flush=True)
    print('\nSUMMARY')
    for i, v in results:
        print(f'  {i}: {v}')
    print('caught', sum(1 for _, v in results if v.startswith('CAUGHT')), 'of', len(results))


if __name__ == '__main__':
    main(sys.argv[1:])
