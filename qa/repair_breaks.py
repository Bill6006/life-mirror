"""The learning repair, stages R1 and R2 (2026-10-19), each rule undone once: the test that guards it must turn red.

R1, the engine: the app's copy of the judged engine (src/repair/engine.ts), whose replay of a draw creates its tests in the
order a live draw does and carries the week's fits. Guarded by the equivalence harness (stress/equivalence.ts), which runs
the stress test's people through the judged engine and the app's, live, replayed, and rebuilt from app-shaped records.

R2, the record and the draw: what counts as a randomized decision (a check-in's own draw, every chance kept, nothing extra
among its candidates, not set aside); what an answer means (a skip is a seen No, Not home stays out, answers from before
the seen mark count as seen); the day's context (short sleep from the morning's anchor, daycare from a pickup); a rebuild
that stops before a new draw's slot; and, behind the switch, the draw in the app: a replacement after a skip stays
today's, the candidates and chances recorded are the engine's, and the draw carries the repair's version. The switch
itself ships gated.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by the harness rebuilds its bundle after the
replacement and after the restore.

python repair_breaks.py [id ...]
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
HARNESS = 'harness'
PEOPLE = '2'

E = 'src/repair/engine.ts'
R = 'src/repair/record.ts'
OF = 'src/offerFlow.ts'
BS = 'src/brainShared.ts'
RT = 'src/repair/record.test.ts'
FT = 'src/repair/flow.test.ts'

TABLE = [
    dict(id='replay-test-order', file=E, tests=[HARNESS],
         old="    if (!week) for (const id of real) this.testFor(id, target, windowOfMove(id, target))",
         new="    void week"),
    dict(id='replay-week-fits', file=E, tests=[HARNESS],
         old="      if (tt && tt.lwDays[tt.lwDays.length - 1] !== d) tt.lwDays.push(d)",
         new="      void tt"),
    dict(id='record-responds', file=R, tests=[HARNESS],
         old="      engine.respond(id, responseOf(o, outcomeOf.get(o.id as number)))",
         new="      void responseOf"),
    dict(id='draw-needs-nothing', file=R, tests=[RT],
         old="o.candidates.includes(NOTHING) && ",
         new=""),
    dict(id='draw-not-set-aside', file=R, tests=[RT],
         old=" && !setAside(o)",
         new=""),
    dict(id='not-home-stays-out', file=R, tests=[RT],
         old="    if (o.skipReason === 'notHome') return { seen: false, did: null, why: null, answered: false }\n",
         new=""),
    dict(id='old-answers-seen', file=R, tests=[RT],
         old=" || (answered && outcome?.seen === undefined)",
         new=""),
    dict(id='short-sleep-anchor', file=R, tests=[RT],
         old="export const SHORT_SLEEP_ANCHOR = 2",
         new="export const SHORT_SLEEP_ANCHOR = 3"),
    dict(id='daycare-from-pickup', file=R, tests=[RT],
         old="    daycare: rec?.pickupTime !== null && rec?.pickupTime !== undefined,",
         new="    daycare: false,"),
    dict(id='stop-before-slot', file=R, tests=[RT],
         old="      if (d === last && b === stopBefore) return { engine, epoch, index, ids }\n",
         new=""),
    dict(id='replacement-stays-today', file=OF, tests=[FT],
         old="LEARNING_REPAIR === 'open' && !replacing ?",
         new="LEARNING_REPAIR === 'open' ?"),
    dict(id='engine-candidates-kept', file=OF, tests=[FT],
         old="    const drawnFrom = made ? made.offer.candidates : set.candidates.map((c) => c.id)",
         new="    const drawnFrom = set.candidates.map((c) => c.id)"),
    dict(id='repair-version-kept', file=OF, tests=[FT],
         old="      draw: made ? { ...drawRecord, engine: REPAIR_ENGINE } : drawRecord,",
         new="      draw: drawRecord,"),
    dict(id='switch-ships-gated', file=BS, tests=[RT],
         old="export const LEARNING_REPAIR: 'gated' | 'open' = 'gated'",
         new="export const LEARNING_REPAIR: 'gated' | 'open' = 'open'"),
]


def bundle():
    r = subprocess.run([NPX, 'esbuild', 'stress/equivalence.ts', '--bundle', '--platform=node', '--format=esm', '--outfile=stress/.out/equivalence.mjs', '--log-level=warning'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit('bundle failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def run(tests):
    assert tests, 'an empty test list would run everything'
    if tests == [HARNESS]:
        bundle()
        r = subprocess.run(['node', 'stress/.out/equivalence.mjs', PEOPLE], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
        out = r.stdout + r.stderr
        same = len(re.findall(r'^SAME ', out, re.M))
        different = len(re.findall(r'^DIFFERENT [a-z-]+:', out, re.M))
        return r.returncode, different, same, out
    r = subprocess.run([NPX, 'vitest', 'run', *tests], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
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
        code, failed, passed, out = run(t['tests'])
        if code != 0 or passed == 0:
            results.append((t['id'], f'NO GREEN BASELINE (exit {code}, {passed} passed)'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        try:
            io.open(path, 'wb').write(text.replace(t['old'], t['new']).encode('utf-8'))
            code2, failed2, passed2, out2 = run(t['tests'])
        finally:
            io.open(path, 'wb').write(original)
            if t['tests'] == [HARNESS]:
                bundle()
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
