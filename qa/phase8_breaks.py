"""Phase 8 of the next build (2026-11-14), the forecast's one challenger. Each rule undone once, and the test that
guards it must turn red. The challenger is a pure module, switched off and wired to nothing; the entries for its
wiring are added with the wiring.

An adjustment: read from the day before alone, on the day forecast and in the back-test; a slot's own miss is never
in its own size; a state's average miss less the average over every known day; cut by its own uncertainty; nothing
under eight days in the state, nor eight outside it; a state that does not move moves nothing; a condition moves only
its own check-ins; a state the record cannot speak for is never read as "no"; each condition learns from what the one
before it left.

The pick: enough slots; the least gain; the least clearance; the gain is the base way's miss less its own; the
clearance is the gain over its day-to-day spread; it looks back over the window and no further; its range comes from
the back-test's days alone, and from its own misses.

The kinds that join: only at a steady pattern; three at most; a kind that stands does join.

The numbers: switched off; the margin as the simulation set it.

The forecast's leakage rules, against the store: no row for a slot already logged; a row once written is never
touched; the hit-rate line counts day-ahead rows alone.
"""
import io
import os
import re
import subprocess
import sys

import time


def put_back(path, data):
    """Writes a file whole. Windows can refuse the write for a moment while a scanner or a watcher holds the file
    (OSError 22, seen 2026-11-12, when a failed restore left a break in the tree): tried again for ten seconds, and
    never given up quietly."""
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
CH = 'src/challenger.ts'
F = 'src/forecast.ts'
FF = 'src/forecastFlow.ts'
W = 'src/weekly.ts'
CT = 'src/challenger.test.ts'
ST = 'src/challengerSimulation.test.ts'
LT = 'src/forecastLeakage.test.ts'

SIZE = 'cut by its own uncertainty'
USELESS = 'rarely picks it'
ALONE = 'three numbers alone'

TABLE = [
    # An adjustment.
    dict(id='read-from-the-day-before', file=CH,
         old="adjustmentFor: (day, block) => adjust(addDays(day, -1), block, null) }",
         new="adjustmentFor: (day, block) => adjust(day, block, null) }",
         tests=[CT], pattern='on seeded records'),
    dict(id='the-back-test-reads-the-day-before', file=CH,
         old="    const before = addDays(day, -1)",
         new="    const before = day",
         tests=[CT], pattern=SIZE),
    dict(id='a-slots-own-miss-is-not-in-its-size', file=CH,
         old="      const size = c.moves(state) ? sizeOf(sums.get(key), state, numbers) : 0",
         new="      if (left !== null) take(key, state, left)\n      const size = c.moves(state) ? sizeOf(sums.get(key), state, numbers) : 0",
         tests=[ST], pattern=USELESS),
    dict(id='less-the-average-over-every-known-day', file=CH,
         old="  const size = s.sum / s.n - sums.sum / sums.n",
         new="  const size = s.sum / s.n",
         tests=[CT], pattern=SIZE),
    dict(id='cut-by-its-own-uncertainty', file=CH,
         old="  return size * Math.max(0, 1 - (numbers.shrink * unsure) / (size * size))",
         new="  return size",
         tests=[CT], pattern='within its own noise'),
    dict(id='eight-days-in-the-state', file=CH,
         old="s.n < numbers.minState || sums.n - s.n < numbers.minState) return 0",
         new="sums.n - s.n < numbers.minState) return 0",
         tests=[CT], pattern='is nothing under eight days'),
    dict(id='eight-days-outside-it', file=CH,
         old="s.n < numbers.minState || sums.n - s.n < numbers.minState) return 0",
         new="s.n < numbers.minState) return 0",
         tests=[CT], pattern='is nothing under eight days'),
    dict(id='a-state-that-does-not-move', file=CH,
         old="      const size = c.moves(state) ? sizeOf(sums.get(key), state, numbers) : 0",
         new="      const size = sizeOf(sums.get(key), state, numbers)",
         tests=[CT], pattern='a kind moves only the morning'),
    dict(id='only-its-own-check-ins', file=CH,
         old="      if (!c.blocks.includes(block)) return\n",
         new="",
         tests=[CT], pattern='a kind moves only the morning'),
    dict(id='unknown-is-never-no', file=CH,
         old="      const state = c.stateOn(before)\n",
         new="      const state = c.stateOn(before) ?? 'no'\n",
         tests=[CT], pattern='cannot speak for the condition'),
    dict(id='each-learns-from-what-was-left', file=CH,
         old="        left -= size\n",
         new="",
         tests=[CT], pattern='takes the conditions in order'),
    # The pick.
    dict(id='enough-slots', file=CH,
         old="const picked = slots >= numbers.minSlots && gain !== null",
         new="const picked = gain !== null",
         tests=[CT], pattern=ALONE),
    dict(id='the-least-gain', file=CH,
         old="gain >= numbers.minGain && clear !== null",
         new="clear !== null",
         tests=[CT], pattern=ALONE),
    dict(id='the-least-clearance', file=CH,
         old="clear >= numbers.minClear",
         new="clear >= 0",
         tests=[CT], pattern=ALONE),
    dict(id='the-gain-is-miss-less-miss', file=CH,
         old="dayGain += Math.abs(miss) - Math.abs(miss - a.points)",
         new="dayGain += Math.abs(a.points)",
         tests=[ST], pattern=USELESS),
    dict(id='the-clearance-is-over-its-spread', file=CH,
         old="clear = spread > 0 ? total / spread : null",
         new="clear = spread > 0 ? total : null",
         tests=[ST], pattern=USELESS),
    dict(id='the-window', file=CH,
         old="for (let back = numbers.window; back >= 1; back--) {",
         new="for (let back = 365; back >= 1; back--) {",
         tests=[CT], pattern='looks back over the window'),
    dict(id='its-range-from-the-back-test-days', file=CH,
         old="if (back <= BACKTEST_DAYS) errors.push(miss - a.points)",
         new="errors.push(miss - a.points)",
         tests=[CT], pattern='takes its range'),
    dict(id='its-range-from-its-own-misses', file=CH,
         old="if (back <= BACKTEST_DAYS) errors.push(miss - a.points)",
         new="if (back <= BACKTEST_DAYS) errors.push(miss)",
         tests=[CT], pattern='takes its range'),
    # The kinds that join.
    dict(id='only-at-a-steady-pattern', file=CH,
         old=".filter((s) => s.standing === 'pattern')",
         new=".filter((s) => s.standing === 'pattern' || s.standing === 'lead')",
         tests=[CT], pattern='takes only kinds'),
    dict(id='three-kinds-at-most', file=CH,
         old="    .slice(0, max)\n",
         new="",
         tests=[CT], pattern='takes only kinds'),
    dict(id='a-kind-that-stands-joins', file=CH,
         old="    .slice(0, max)\n",
         new="    .slice(0, 0)\n",
         tests=[ST], pattern='for a thing that lifts'),
    # The numbers.
    dict(id='switched-off', file=CH,
         old="export const CHALLENGER_ON = false",
         new="export const CHALLENGER_ON = true",
         tests=[CT], pattern='is switched off'),
    dict(id='the-margin-as-set', file=CH,
         old="minSlots: 20, minGain: 0.5, minClear: 2.4, maxKinds: 3 }",
         new="minSlots: 20, minGain: 0.5, minClear: 2.2, maxKinds: 3 }",
         tests=[CT], pattern='is switched off'),
    # The forecast's leakage rules, against the store.
    dict(id='no-row-for-a-logged-slot', file=F,
         old="      if (logged.has(slotKey(day, block))) continue\n",
         new="",
         tests=[LT], pattern='writes no forecast for a slot already logged'),
    dict(id='a-row-is-never-touched', file=FF,
         old="    if (due.length) await db.forecasts.bulkAdd(due)",
         new="    if (due.length) {\n      await db.forecasts.clear()\n      await db.forecasts.bulkAdd(due)\n    }",
         tests=[LT], pattern='never rewrites a stored forecast'),
    dict(id='the-line-counts-day-ahead-rows', file=W,
         old="  const dayAhead = scores.filter((s) => s.horizon === 1)",
         new="  const dayAhead = scores",
         tests=[LT], pattern='counts in the hit rate only stored forecasts'),
]


def run(tests, pattern):
    assert tests, 'an empty test list would run everything'
    cmd = [NPX, 'vitest', 'run', *tests]
    if pattern:
        cmd += ['-t', pattern]
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
    for t in rows:
        path = ROOT + t['file']
        original = io.open(path, 'rb').read()
        text = original.decode('utf-8')
        n = text.count(t['old'])
        if n != 1:
            results.append((t['id'], f'SETUP: the text to break appears {n} times'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        code, failed, passed, out = run(t['tests'], t.get('pattern'))
        if code != 0 or passed == 0:
            results.append((t['id'], f'NO GREEN BASELINE (exit {code}, {passed} passed)'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        try:
            io.open(path, 'wb').write(text.replace(t['old'], t['new']).encode('utf-8'))
            code2, failed2, passed2, out2 = run(t['tests'], t.get('pattern'))
        finally:
            put_back(path, original)
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
