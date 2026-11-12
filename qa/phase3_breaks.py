"""Phase 3 of the next build (2026-11-12), the standard takes over the existing comparisons: each rule undone once, and
the test that guards it must turn red. So far, the sheet's associations (the phase is not finished or shipped).

Every association the sheet carries is one family; a fact is written from its standing; too few is "little" in the old
three-valued field and says no difference; "promising" there is only ever a lead or a pattern in the good direction; and
a comparison on a scale of steps says a lead at most.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, an empty test list refused, and an id that matches no entry refused.

python phase3_breaks.py [id ...]
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
F = 'src/facts.ts'
T = 'src/sheetStandings.test.ts'
SIM = 'src/counted/simulation.test.ts'
O = 'src/counted/occasions.ts'
OT = 'src/counted/occasions.test.ts'
K = 'src/counted/kinds.ts'
KT = 'src/counted/kinds.test.ts'
TB = 'src/counted/table.ts'
TT = 'src/counted/table.test.ts'
A = 'src/associations.ts'
LT = 'src/counted/likeForLike.test.ts'
W = 'src/counted/words.ts'
WT = 'src/counted/words.test.ts'

TABLE = [
    dict(id='promising-is-only-the-good-direction', file=F,
         old="(standing === 'lead' || standing === 'pattern') && helpful ? 'promising' : 'unclear'",
         new="standing === 'lead' || standing === 'pattern' ? 'promising' : 'unclear'",
         tests=[T], pattern='used to say unclear'),
    dict(id='too-few-is-little', file=F,
         old="const tier = standing === 'tooFew' ? 'little' : ",
         new="const tier = standing === 'tooFew' ? 'unclear' : ",
         tests=[T], pattern='tapped three times'),
    dict(id='the-sheet-is-one-family', file=F,
         old="  return new Map(standings(family).map((s) => [",
         new="  return new Map(family.flatMap((c) => standings([c])).map((s) => [",
         tests=[T], pattern='one of a family'),
    dict(id='steps-say-a-lead-at-most', file=F,
         old="stepScale(s.id) && s.standing === 'pattern' ? { ...s, standing: 'lead' as const } : s",
         new="s",
         tests=[T], pattern='a lead at most'),
    dict(id='too-few-says-no-difference', file=W,
         old="  if (w.standing === 'tooFew' || w.diff === null) return ",
         new="  if (w.diff === null) return ",
         tests=[T], pattern='tapped three times'),
    dict(id='a-comparison-nobody-named-has-no-chance', file=A,
         old="  if (named) {\n",
         new="  if (named || points.length > 0) {\n    named = named ?? { id: 'unnamed', worth: 10 }\n",
         tests=[T], pattern='one of a family'),
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
