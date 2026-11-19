"""The forecast follow-ups, Batch 1 (agreed 2026-11-19). Each rule undone once, and the test that guards it must turn
red. Item 8, the simpler week-ahead graph: each bar as tall as its reading out of 100; the lowest days' bars marked;
nothing in the graph but the numbers and the days; the room over the highest number cropped, never the number;
under the graph, how often its forecasts land, said only from twenty scored; under Details, closed until opened, the
week's ranges from its first and last days, said when the days differ too, and how the range is built only until
twenty are scored; no caption.

python -B -I -X utf8 qa/batch1_breaks.py [id ...]   (every entry when none is named)
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
CH = 'src/charts.tsx'
WS = 'src/weeklyScreen.tsx'
WT = 'src/weeklyScreen.test.ts'
SMOKE = 'e2e/smoke.spec.ts'
ALIKE = 'blind to weekdays'
DIP = 'a Monday dip'

TABLE = [
    # ---- Item 8: the graph ----------------------------------------------------------------------------------------
    dict(id='bar-as-tall-as-its-reading', file=CH, tests=[SMOKE, '-g', DIP],
         old="d={bar(i, d.expected)}",
         new="d={bar(i, 75)}"),
    dict(id='lowest-bar-marked', file=CH, tests=[SMOKE, '-g', DIP],
         old="class={isLow(i) ? 'wa-bar is-low' : 'wa-bar'}",
         new="class=\"wa-bar\""),
    dict(id='nothing-else-in-the-graph', file=CH, tests=[SMOKE, '-g', ALIKE],
         old='<line class="wa-base" x1={0} x2={W} y1={bottom} y2={bottom} />',
         new='<line class="wa-base" x1={0} x2={W} y1={bottom} y2={bottom} /><text class="wa-day" x={0} y={bottom}>100</text>'),
    dict(id='numbers-never-cropped', file=CH, tests=[SMOKE, '-g', ALIKE],
         old="y(Math.max(...values)) - VALUE_AIR - VALUE_HEIGHT - 4)",
         new="y(Math.max(...values)) - VALUE_AIR)"),
    # ---- Item 8: the card -----------------------------------------------------------------------------------------
    dict(id='details-closed-until-opened', file=WS, tests=[SMOKE, '-g', ALIKE],
         old='testid="week-ahead-details" class="week-ahead-details">',
         new='testid="week-ahead-details" class="week-ahead-details" defaultOpen>'),
    dict(id='how-often-under-the-graph', file=WS, tests=[SMOKE, '-g', ALIKE],
         old='data-testid="week-ahead-rate">\n                {rangeWords(sc)}\n',
         new='data-testid="week-ahead-rate">\n                {sizedWords(sc)}\n'),
    dict(id='no-caption', file=WS, tests=[SMOKE, '-g', ALIKE],
         old='              <WeekAhead rows={w.weekAhead} low={w.weekAheadLow} />\n            </div>\n',
         new='              <WeekAhead rows={w.weekAhead} low={w.weekAheadLow} />\n            </div>\n            <p class="note">Daily expected value with range (lower–upper).</p>\n'),
    dict(id='ranges-when-the-days-differ', file=WS, tests=[SMOKE, '-g', DIP],
         old="                {ranges && (\n",
         new="                {flat && ranges && (\n"),
    dict(id='ranges-to-the-last-day', file=WS, tests=[WT, '-t', 'from the first day with a forecast'],
         old="  const last = known[known.length - 1]\n  return { near: { lo: first.lo, hi: first.hi }, far: { lo: last.lo, hi: last.hi } }\n",
         new="  const last = known[0]\n  return { near: { lo: first.lo, hi: first.hi }, far: { lo: last.lo, hi: last.hi } }\n"),
    dict(id='how-it-is-built-until-twenty', file=WS, tests=[WT, '-t', 'under Details how the range is built'],
         old="  return sc.scored < MEASURED_FROM || sc.hitRate === null ? copy.weekly.modelBuilt : null\n",
         new="  return copy.weekly.modelBuilt\n"),
    dict(id='how-it-is-built-not-from-twenty', file=WS, tests=[SMOKE, '-g', 'once twenty day-ahead forecasts are scored'],
         old="                {w.model && sized && (\n",
         new="                {w.model && (sized || copy.weekly.modelBuilt) && (\n"),
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
