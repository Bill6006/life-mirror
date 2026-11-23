"""The week ahead's level-plus-weekday way, Stage A (2026-11-21): the dormant build, behind a switch that is off. Each
rule undone once, and the test that guards it must turn red.

Push 1, the readers: the way's name and its sentence under Details, word for word as the owner approved them; the screen
says the way's sentence for the way's rows and the four's for theirs; the way among the ways that tell one weekday from
another, for the phone (`tellsWeekdaysApart`) and for the Worker (`WEEKDAY_WAYS`), so a stored row of it is never read
as blind to weekdays.

Push 2, the dormant build: the method's numbers as the verdicts fixed them; the test of the seven weekdays together (its
chance, its least days, its F centred on the average over all the days, each day counted once at the average of its
check-ins, over exactly its window); the strength, never under nothing; the hold, 28 days, broken by one closed day; the
range from each past day's own shifts, and its least five; the switch, off; the writer asking the way only while it is
on, under the guard, one reader a run; the rows it adds (the way's numbers and name, `four` kept, the pick's skips, a
slot of the pick's alone kept, a slot of the way's alone written); the challenger on top (its base, its forecast of the
way, the same forecast given to the rows it moves, and its default for a way it cannot forecast); the export of `four`.

python -B -I -X utf8 qa/level_weekday_breaks.py [id ...]   (every entry when none is named)
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
CP = 'src/copy.ts'
WS = 'src/weeklyScreen.tsx'
WT = 'src/levelWeekdayWords.test.ts'
CT = 'src/forecastConditions.test.ts'
DT = 'src/forecastDifferences.test.ts'
LT = 'worker/src/forecastsLookup.test.ts'
SMOKE = 'e2e/smoke.spec.ts'
LW = 'src/levelWeekday.ts'
FF = 'src/forecastFlow.ts'
CH = 'src/challenger.ts'
CR = 'src/challengerRecord.ts'
EX = 'src/export.ts'
UT = 'src/levelWeekday.test.ts'
RT = 'src/levelWeekdayWriter.test.ts'
GT = 'src/levelWeekdayGuard.test.ts'
WEEK = "export const WEEK: WeekNumbers = { window: 180, chance: 0.000001, minDays: 4, hold: 28, shrink: 2 }"
SKIPS = "else if (w && !have.has(key) && !logged.has(slotKey(day, block)))"

TABLE = [
    # ---- Push 1: the words -----------------------------------------------------------------------------------------------
    dict(id='the-ways-name', file=CP, tests=[WT, CT, LT],
         old="levelWeekday: 'your usual level at this time of day and how this weekday usually differs'",
         new="levelWeekday: 'your usual level at this time of day and how this weekday differs'"),
    dict(id='the-details-sentence', file=CP, tests=[WT],
         old="modelWeekdays: 'Expected from {model}. This way is used only after clear weekday differences have held for four weeks.'",
         new="modelWeekdays: 'Expected from {model}. This way is used only after weekday differences have held for four weeks.'"),
    # ---- Push 1: the screen reads the row's way --------------------------------------------------------------------------
    dict(id='the-sentence-for-the-way', file=WS, tests=[WT],
         old="model === LEVEL_WEEKDAY ? copy.weekly.modelWeekdays : copy.weekly.model",
         new="copy.weekly.model"),
    dict(id='the-screen-reads-the-rows-way', file=WS, tests=[SMOKE, '-g', 'a model blind to weekdays says the days come out alike'],
         old="{wayLine(w.model)}",
         new="{wayLine(LEVEL_WEEKDAY)}"),
    # ---- Push 1: the shared lists ------------------------------------------------------------------------------------------
    dict(id='among-the-weekday-ways', file=FCS, tests=[CT, LT, DT],
         old="['weekdayBlock', 'blend', 'levelWeekday', 'levelReadings', 'levelWeekdayWeather']",
         new="['weekdayBlock', 'blend', 'levelReadings', 'levelWeekdayWeather']"),
    dict(id='tells-weekdays-apart', file=FC, tests=[WT, CT],
         old="return model === 'weekdayBlock' || model === 'blend' || model === LEVEL_WEEKDAY",
         new="return model === 'weekdayBlock' || model === 'blend'"),
    # ---- Push 2: the method's numbers, as the verdicts fixed them ---------------------------------------------------------
    dict(id='the-chance', file=LW, tests=[UT], old=WEEK,
         new="export const WEEK: WeekNumbers = { window: 180, chance: 0.00001, minDays: 4, hold: 28, shrink: 2 }"),
    dict(id='the-least-days-as-set', file=LW, tests=[UT], old=WEEK,
         new="export const WEEK: WeekNumbers = { window: 180, chance: 0.000001, minDays: 3, hold: 28, shrink: 2 }"),
    dict(id='the-holds-length', file=LW, tests=[UT], old=WEEK,
         new="export const WEEK: WeekNumbers = { window: 180, chance: 0.000001, minDays: 4, hold: 27, shrink: 2 }"),
    dict(id='the-shrinking', file=LW, tests=[UT], old=WEEK,
         new="export const WEEK: WeekNumbers = { window: 180, chance: 0.000001, minDays: 4, hold: 28, shrink: 3 }"),
    dict(id='the-window', file=LW, tests=[UT], old=WEEK,
         new="export const WEEK: WeekNumbers = { window: 179, chance: 0.000001, minDays: 4, hold: 28, shrink: 2 }"),
    # ---- Push 2: the test of the seven weekdays together, its shifts and their strength ------------------------------------
    dict(id='the-gate-at-its-chance', file=LW, tests=[UT],
         old="  const open = chance <= numbers.chance",
         new="  const open = chance <= numbers.chance * 10"),
    dict(id='the-least-days', file=LW, tests=[UT],
         old="if (n.some((k) => k < numbers.minDays) || total <= 7)",
         new="if (n.some((k) => k < numbers.minDays - 1) || total <= 7)"),
    dict(id='the-centring', file=LW, tests=[UT],
         old="const offset = mean.map((m) => m - grand)",
         new="const offset = mean.map((m) => m)"),
    dict(id='the-strengths-floor', file=LW, tests=[UT],
         old="const strength = Math.max(0, 1 - numbers.shrink / f)",
         new="const strength = 1 - numbers.shrink / f"),
    dict(id='a-day-counted-once', file=LW, tests=[UT],
         old="        if (m) days.push(m)",
         new="        if (m) days.push(m, m)"),
    dict(id='a-days-miss-is-their-average', file=LW, tests=[UT],
         old="miss: got.reduce((a, b) => a + b, 0) / got.length } : null)",
         new="miss: got.reduce((a, b) => a + b, 0) } : null)"),
    dict(id='the-windows-days', file=LW, tests=[UT],
         old="for (let back = numbers.window; back >= 1; back--) {",
         new="for (let back = numbers.window - 1; back >= 1; back--) {"),
    # ---- Push 2: the hold -----------------------------------------------------------------------------------------------------
    dict(id='the-hold-broken-by-one-day', file=LW, tests=[UT],
         old="for (let back = 1; held && back <= numbers.hold; back++) held = gate(addDays(today, -back)).open",
         new="for (let back = 1; held && back < numbers.hold; back++) held = gate(addDays(today, -back)).open"),
    # ---- Push 2: the range ----------------------------------------------------------------------------------------------------
    dict(id='the-range-from-each-days-own-shifts', file=LW, tests=[UT],
         old="const shift = gate(addDays(x, -(Math.max(1, ahead) - 1))).shift[weekdayOf(x)]",
         new="const shift = gate(today).shift[weekdayOf(x)]"),
    dict(id='the-ranges-least-five', file=LW, tests=[UT],
         old="if (far.length >= 5) return errorBand(far)",
         new="if (far.length >= 6) return errorBand(far)"),
    # ---- Push 2: the switch, the guard and the one reader ----------------------------------------------------------------------
    dict(id='the-switch', file=LW, tests=[UT, RT],
         old="export const LEVEL_WEEKDAY_ON = false",
         new="export const LEVEL_WEEKDAY_ON = true"),
    dict(id='the-writer-asks-the-switch', file=FF, tests=[RT],
         old="const way = chosen && levelWeekdayOn() ? wayFor(values, today) : null",
         new="const way = chosen ? wayFor(values, today) : null"),
    dict(id='the-guard', file=FF, tests=[GT],
         old="  return guardComparisons(today, () => wayOf(levelWeekdayReader(values, WEEK), today))",
         new="  return wayOf(levelWeekdayReader(values, WEEK), today)"),
    dict(id='one-reader-a-run', file=FF, tests=[GT],
         old="const predictOf = baseForecast(way?.reader ?? null, today)",
         new="const predictOf = baseForecast(way ? levelWeekdayReader(values, WEEK) : null, today)"),
    # ---- Push 2: the rows the writer adds -------------------------------------------------------------------------------------
    dict(id='the-writer-adds-the-ways-rows', file=FF, tests=[RT],
         old="const due = way ? rowsWithTheWay(four, way.rows, existing, logged, today, (day, block) => whatIf(values, done, day, block)) : four",
         new="const due = four"),
    dict(id='the-ways-own-numbers', file=LW, tests=[UT, RT],
         old="({ ...f, model: LEVEL_WEEKDAY, point: w.point, lo: w.lo, hi: w.hi,",
         new="({ ...f, model: LEVEL_WEEKDAY, point: f.point, lo: f.lo, hi: f.hi,"),
    dict(id='four-kept', file=LW, tests=[UT, RT],
         old="four: { model: f.model, point: f.point, lo: f.lo, hi: f.hi }",
         new="four: { model: f.model, point: w.point, lo: w.lo, hi: w.hi }"),
    dict(id='a-slot-of-the-picks-alone-stays', file=LW, tests=[UT],
         old="if (f) out.push(w ? asTheWays(f, w) : f)",
         new="if (f && w) out.push(asTheWays(f, w))"),
    dict(id='a-slot-of-the-ways-alone-is-written', file=LW, tests=[UT], old=SKIPS, new="else if (w && false)"),
    dict(id='never-a-slot-with-a-row-at-that-distance', file=LW, tests=[UT], old=SKIPS, new="else if (w && !logged.has(slotKey(day, block)))"),
    dict(id='never-a-logged-slot', file=LW, tests=[UT], old=SKIPS, new="else if (w && !have.has(key))"),
    # ---- Push 2: the challenger on top of the way -------------------------------------------------------------------------------
    dict(id='the-challengers-base', file=FF, tests=[RT],
         old="challengerFor(way ? LEVEL_WEEKDAY : chosen.model, checkins, values, today, predictOf)",
         new="challengerFor(chosen.model, checkins, values, today, predictOf)"),
    dict(id='the-challengers-forecast-of-the-way', file=FF, tests=[RT],
         old="model === LEVEL_WEEKDAY && reader ? reader.forecast(today, day, block) : fourWays(model, values, day, block)",
         new="model === LEVEL_WEEKDAY && reader ? fourWays('sameBlock', values, day, block) : fourWays(model, values, day, block)"),
    dict(id='the-moved-rows-take-the-same-forecast', file=FF, tests=[RT],
         old="    if (tried?.picked) adjustRows(due, tried, values, predictOf)",
         new="    if (tried?.picked) adjustRows(due, tried, values)"),
    dict(id='adjust-rows-asks-the-forecast-given', file=CR, tests=[UT],
         old="    const p = predictOf(run.base, values, f.day, f.block)",
         new="    const p = fourWays(run.base, values, f.day, f.block)"),
    dict(id='no-forecast-of-the-way-without-its-reader', file=CH, tests=[UT],
         old="(isFourWay(model) ? predict(model, values, day, block) : null)",
         new="predict(model as never, values, day, block)"),
    # ---- Push 2: the export of what the four would have written ------------------------------------------------------------------
    dict(id='four-exported-unmoved', file=EX, tests=[RT],
         old="  if (typeof f.adj !== 'number') return four",
         new="  if (typeof f.adj !== 'number') return {}"),
    # ---- After push 2 (2026-11-21): one break for each test no entry above had yet turned red (the handoff's A8) -------------
    dict(id='fchance-at-known-values', file=LW, tests=[UT],
         old="  return incompleteBeta(d2 / 2, d1 / 2, d2 / (d2 + d1 * f))",
         new="  return incompleteBeta(d1 / 2, d2 / 2, d2 / (d2 + d1 * f))"),
    dict(id='the-gate-reads-before-the-day', file=LW, tests=[UT],
         old="for (let back = numbers.window; back >= 1; back--) {",
         new="for (let back = numbers.window; back >= 0; back--) {"),
    dict(id='todays-rows-from-the-record-before-today', file=LW, tests=[UT],
         old="    for (let back = 1; back <= BACKTEST_DAYS; back++) {",
         new="    for (let back = 0; back <= BACKTEST_DAYS; back++) {"),
    dict(id='a-past-days-forecast-by-that-days-state', file=LW, tests=[UT],
         old="    const s = state(day < today ? day : today)",
         new="    const s = state(today)"),
    dict(id='no-rows-while-not-in-use', file=LW, tests=[UT, RT],
         old="    if (!s.inUse) return null",
         new="    if (false) return null"),
    dict(id='the-point-takes-the-days-shift', file=LW, tests=[UT, RT],
         old="        const p = flat + s.shift[weekdayOf(day)][i]",
         new="        const p = flat"),
    dict(id='the-ways-rows-are-never-rewritten', file=FF, tests=[RT],
         old="    if (due.length) await db.forecasts.bulkAdd(due)",
         new="    if (due.length) {\n      await db.forecasts.clear()\n      await db.forecasts.bulkAdd(due)\n    }"),
    dict(id='four-exported-moved', file=EX, tests=[RT],
         old="lo: p.lo, hi: p.hi } } : {}), ...four }",
         new="lo: p.lo, hi: p.hi } } : {}) }"),
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
