"""The week ahead's level-plus-weekday way, Stage A (2026-11-21): the dormant build, behind a switch that is off. Each
rule undone once, and the test that guards it must turn red.

Push 1, the readers: the way's name and its sentence under Details, word for word as the owner approved them; the screen
says the way's sentence for the way's rows and the four's for theirs; the way among the ways that tell one weekday from
another, for the phone (`tellsWeekdaysApart`) and for the Worker (`WEEKDAY_WAYS`), so a stored row of it is never read
as blind to weekdays.

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
         old="['weekdayBlock', 'blend', 'levelWeekday']",
         new="['weekdayBlock', 'blend']"),
    dict(id='tells-weekdays-apart', file=FC, tests=[WT, CT],
         old="return model === 'weekdayBlock' || model === 'blend' || model === LEVEL_WEEKDAY",
         new="return model === 'weekdayBlock' || model === 'blend'"),
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
