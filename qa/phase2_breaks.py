"""Phase 2 of the next build (2026-11-12), the counted foundation in shadow: each rule of the comparison core undone
once, and the test that guards it must turn red.

The core compares nothing under eight usable occasions a side, or under eight in a cell with five occurrences in all;
shuffles labels only inside a 14-day stretch, and the check-ins of a day among themselves; counts both directions; never
gives a chance of nothing; stops early only once the chance is past 0.05; takes the like-for-like difference weighted by
the smaller side; corrects across the family by Holm, counting every comparison that was tested; and calls a pattern only
at a size worth saying. Since the simulation's tuning (2026-11-12): a label the whole day shares moves by whole days, one
cell to a day; with against without turns a stretch's labels round in the order of their days, never deals them afresh;
and an arrangement is ranked by its difference against its own spread.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, an empty test list refused, and an id that matches no entry refused.

python phase2_breaks.py [id ...]
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
C = 'src/counted/compare.ts'
T = 'src/counted/compare.test.ts'

TABLE = [
    dict(id='eight-a-side', file=C,
         old="  const enough = n >= MIN_SIDE && m >= MIN_SIDE && diff !== null\n",
         new="  const enough = n >= 7 && m >= 7 && diff !== null\n",
         tests=[T], pattern='under eight usable occasions'),
    dict(id='eight-in-the-cell', file=C,
         old="sizes[i] >= MIN_SIDE && total - sizes[i] >= MIN_SIDE && ",
         new="sizes[i] >= 1 && total - sizes[i] >= 1 && ",
         tests=[T], pattern='tests none under eight in the cell'),
    dict(id='five-occurrences', file=C,
         old=" && occurrences >= MIN_OCCURRENCES && ",
         new=" && ",
         tests=[T], pattern='fewer than five times'),
    dict(id='a-size-worth-saying', file=C,
         old="    const big = Math.abs(c.diff as number) >= c.worth - 1e-9\n",
         new="    const big = true\n",
         tests=[T], pattern='ten points, not nine'),
    dict(id='inside-a-stretch', file=C,
         old="  const strata = groups(stretchesOf(points.map((p) => p.day)))\n  const number = ",
         new="  const strata = [points.map((_, i) => i)]\n  const number = ",
         tests=[T], pattern='one fortnight against another as a pattern'),
    dict(id='fourteen-days', file=C,
         old="export const STRETCH_DAYS = 14\n",
         new="export const STRETCH_DAYS = 28\n",
         tests=[T], pattern='one fortnight against another as a pattern'),
    dict(id='check-ins-within-the-day', file=C,
         old="      const strata = groups(points.map((p) => p.day))\n",
         new="      const strata = groups(stretchesOf(points.map((p) => p.day)))\n",
         tests=[T], pattern='never pass for a check-in'),
    dict(id='either-direction', file=C,
         old="      if (Math.abs(got[k]) >= real[k] - 1e-12) reached[k]++\n",
         new="      if (got[k] >= real[k] - 1e-12) reached[k]++\n",
         tests=[T], pattern='in either direction'),
    dict(id='never-a-chance-of-nothing', file=C,
         old="  return real.map((_, k) => (reached[k] + 1) / (done[k] + 1))\n",
         new="  return real.map((_, k) => reached[k] / Math.max(1, done[k]))\n",
         tests=[T], pattern='never gives a chance of nothing'),
    dict(id='early-stop-past-the-line', file=C,
         old="stopAt: number = Math.floor(ALPHA * (shuffles + 1)), how:",
         new="stopAt: number = 5, how:",
         tests=[T], pattern='stops early only when'),
    dict(id='weighted-by-the-smaller-side', file=C,
         old="      const w = Math.min(na[b], nb[b])\n",
         new="      const w = na[b] + nb[b]\n",
         tests=[T], pattern='like for like where'),
    dict(id='corrected-across-the-family', file=C,
         old="  const adjusted = holmAdjusted(tested.map((c) => c.p as number))\n",
         new="  const adjusted = tested.map((c) => c.p as number)\n",
         tests=[T], pattern='corrects across the family by Holm'),
    dict(id='family-counts-the-small', file=C,
         old="  const tested = family.filter((c) => c.enough && c.p !== null)\n",
         new="  const tested = family.filter((c) => c.enough && c.p !== null && Math.abs(c.diff ?? 0) >= c.worth)\n",
         tests=[T], pattern='too small to say in the family'),
    dict(id='under-five-in-a-hundred', file=C,
         old="    const standing: Standing = !big || p > ALPHA ? 'noPattern' : adjusted[at] > ALPHA ? 'lead' : 'pattern'\n",
         new="    const standing: Standing = !big || p > 0.1 ? 'noPattern' : adjusted[at] > 0.1 ? 'lead' : 'pattern'\n",
         tests=[T], pattern='a chance over 0.05'),
    dict(id='whole-days-change-places', file=C,
         old="        let d = dayIndex.get(p.day)\n",
         new="        let d = dayIndex.get(p.day + '|' + row)\n",
         tests=[T], pattern='moves whole days together'),
    dict(id='one-cell-a-day', file=C,
         old="        } else if (dayCell[d] !== at[row]) throw new Error(",
         new="        } else if (dayCell[d] === -2) throw new Error(",
         tests=[T], pattern='refuses a day that carries two cells'),
    dict(id='turned-not-dealt', file=C,
         old="opts.shuffles, opts.stopAt, 'turn')",
         new="opts.shuffles, opts.stopAt, 'shuffle')",
         tests=[T], pattern='a streak stays a streak'),
    dict(id='in-the-order-of-their-days', file=C,
         old="  const inOrder = strata.map((rows) => [...rows].sort((a, b) => number[a] - number[b] || a - b))\n",
         new="  const inOrder = strata\n",
         tests=[T], pattern='in the order of the days'),
    dict(id='the-spread-it-is-read-against', file=C,
         old="      spread += w * w * (1 / na[b] + 1 / nb[b])\n",
         new="      spread += w * (1 / na[b] + 1 / nb[b])\n",
         tests=[T], pattern='against its own spread'),
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
            io.open(path, 'wb').write(original)
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
