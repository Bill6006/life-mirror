"""Stage C of the week ahead, Stage C-A (2026-11-22): the dormant build, behind a switch that is off. Each rule undone
once, and the test that guards it must turn red.

Push 1, the words and the readers: each of Stage C's ways' name and its sentence under Details, word for word as the
owner approved them; the screen says each way's own sentence; the two ways with a weekday shift among the ways that tell
one weekday from another, for the phone (`tellsWeekdaysApart`) and for the Worker (`WEEKDAY_WAYS`), and the weather way
not among them; the weather way's days read as days that can differ (`daysCanDiffer`, `DAYS_APART_WAYS`), so the card
marks its lowest day, never says its week as one level for want of a weekday term nor its days alike, and the Worker
never says its days come out alike; the four's forecast given for the four alone.

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
