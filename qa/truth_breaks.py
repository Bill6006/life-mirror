"""The record's comparisons said truthfully (2026-10-21, before Item 3), each guard undone once: its test must turn red.

A line says "started the same", "ended the same" or "like for like" only when a band both sides share holds an outcome on
each: the evening chips' answer, Something sweet's, your own chips', a passive item's, the events on Evidence (cooling off,
big social days, heavy caffeine, workouts, evening workouts, hard sessions), the private items on Evidence and on the move
card, and the morning's last-night line, which says "the first time recorded" only when it is; the sheet's last-night fact
likewise.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte, the
table read as data, and an empty test list refused.

python truth_breaks.py [id ...]
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
T = 'src/associationWords.test.ts'
W = 'src/associationWords.ts'
APART = 'never says it when no band was shared'

TABLE = [
    dict(id='tf-matched-means-only', file='src/associations.ts',
         old="  return a.bands > 0 && a.diff !== null\n",
         new="  return a.withEvent.mean !== null && a.without.mean !== null\n",
         tests=[T], pattern=APART),
    dict(id='tf-passive', file=W,
         old="  if (failed || !likeForLikeMatched(a) || standing === 'tooFew') return fill(c.passiveUnmatched,",
         new="  if (failed || a.without.mean === null || standing === 'tooFew') return fill(c.passiveUnmatched,",
         tests=[T], pattern=APART),
    # Since Phase 3 (2026-11-12) cooling off, a big social day, heavy caffeine, workouts and a private item on Evidence
    # share one guard, the clause that says where a comparison stands: this one entry undoes it for all five, and for
    # your own chips' line, which reads the same clause.
    # Since the check-in's answers moved the same way (2026-11-12, later the same day) it also stands for the evening chips'
    # answer, Something sweet's, time in nature's and a private item's line on the move card: tf-chip, tf-sweet and
    # tf-private-inline are folded into it.
    dict(id='tf-cooling', file=W,
         old="!likeForLikeMatched(a) || a.diff === null) return null",
         new="a.without.mean === null) return null",
         tests=[T], pattern=APART),
    dict(id='tf-evening-workout-both', file=W,
         old="  if (standing === null || slept === null) return fill(c.eveningWorkoutUnmatched, { n, why: whyUnsaid(stood, 'assoc.eveningWorkout') })",
         new="  if (standing === null) return fill(c.eveningWorkoutUnmatched, { n, why: whyUnsaid(stood, 'assoc.eveningWorkout') })",
         tests=[T], pattern=APART),
    dict(id='tf-hard', file=W,
         old="  if (!measures.some(speaks)) return fill(c.hardWorkoutUnmatched, { n, why: stood === null ? c.unsaid.failed : c.unsaid.tooFew })\n",
         new="",
         tests=[T], pattern='says hard sessions'),
    dict(id='tf-last-night-matched', file=W,
         old="  if (night.standing === 'tooFew' || night.diff === null) return",
         new="  if (night.diff === null) return",
         tests=[T], pattern='first time only when it is'),
    dict(id='tf-last-night-first', file=W,
         old=" return ln.n <= 1 ? fill(c.lastNightFirst,",
         new=" return true ? fill(c.lastNightFirst,",
         tests=[T], pattern='first time only when it is'),
    dict(id='tf-brief-matched', file='src/forecastFlow.ts',
         old="matched: likeForLikeMatched(best.assoc) }",
         new="matched: true }",
         tests=[T], pattern='on the brief and on the sheet alike'),
    dict(id='tf-sheet-fact', file='src/facts.ts',
         old="    a.diff === null\n      ? `Last night carried",
         new="    false\n      ? `Last night carried",
         tests=[T], pattern='on the brief and on the sheet alike'),
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
