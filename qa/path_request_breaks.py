"""The Path request fix (2026-11-21): a request whose Path came back is read from its row only until you decide on that
Path, and then says where it stands with you; the read screen of a Path you started that is on your Aims offers no
second start, and no Later or Not this. Each rule undone once, and the test that guards it must turn red.

Where a requested Path stands: on your Aims once started there, a major change waiting included; removed once started
and taken off your Aims; Not this; Later; still to decide otherwise. What the read screen offers: nothing to decide for
a Path started on its current version that is on your Aims; as today for a major change waiting, and for a Path removed
from your Aims, which Add starts again. The words: each standing's line, and the read screen's eyebrow. The row: its
live read takes your decisions and your Aims; it says the standing; Read it only while still to decide. The read
screen: its live read takes your Aims; it guards the start; its eyebrow, its line and its Close; a Path removed from
your Aims still offers Start there.

python -B -I -X utf8 qa/path_request_breaks.py [id ...]   (every entry when none is named)
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
PV = 'src/pathVersions.ts'
PI = 'src/pathIntake.tsx'
PR = 'src/pathRead.tsx'
CP = 'src/copy.ts'
PT = 'src/pathRequest.test.ts'
MP = 'e2e/makePath.spec.ts'
DECIDED = 'once its Path is decided'
OFFERS = "return !(st.kind === 'started' && onAims)"

TABLE = [
    # ---- Where a requested Path stands (requestedPath) --------------------------------------------------------------
    dict(id='waiting-is-on-aims', file=PV, tests=[PT],
         old="if (s.kind === 'started' || s.kind === 'waiting') return onAims ? 'onAims' : 'removed'",
         new="if (s.kind === 'started') return onAims ? 'onAims' : 'removed'"),
    dict(id='removed-by-aims', file=PV, tests=[PT],
         old="return onAims ? 'onAims' : 'removed'",
         new="return 'onAims'"),
    dict(id='not-this-said', file=PV, tests=[PT],
         old="if (s.kind === 'declined') return 'notThis'",
         new="if (s.kind === 'declined') return 'later'"),
    dict(id='later-said', file=PV, tests=[PT],
         old="return s.kind === 'proposed' && s.later ? 'later' : 'undecided'",
         new="return 'undecided'"),
    # ---- What the read screen offers (offersDecision) ---------------------------------------------------------------
    dict(id='no-second-start', file=PV, tests=[PT],
         old=OFFERS,
         new="return true"),
    dict(id='removed-starts-again', file=PV, tests=[PT],
         old=OFFERS,
         new="return st.kind !== 'started'"),
    dict(id='waiting-continues', file=PV, tests=[PT],
         old=OFFERS,
         new="return !((st.kind === 'started' || st.kind === 'waiting') && onAims)"),
    # ---- The words ----------------------------------------------------------------------------------------------------
    dict(id='words-on-aims', file=CP, tests=[PT],
         old="onAims: 'Started: it is on your Aims.'",
         new="onAims: 'Started.'"),
    dict(id='words-later', file=CP, tests=[PT],
         old="later: 'Set aside for later: Add still has it.'",
         new="later: 'Set aside for later.'"),
    dict(id='words-not-this', file=CP, tests=[PT],
         old="notThis: 'You chose Not this: Add still has it.'",
         new="notThis: 'You chose Not this.'"),
    dict(id='words-removed', file=CP, tests=[PT],
         old="removed: 'Started, then removed from your Aims: Add still has it.'",
         new="removed: 'Removed from your Aims.'"),
    dict(id='words-eyebrow', file=CP, tests=[PT],
         old="started: 'A Path you started',",
         new="started: 'A new Path to read',"),
    # ---- The request's row ---------------------------------------------------------------------------------------------
    dict(id='row-reads-decisions', file=PI, tests=[MP, '-g', DECIDED],
         old="db.pathJobs.toArray(), db.pathVersions.toArray(), db.aims",
         new="db.pathJobs.toArray(), Promise.resolve([] as PathVersion[]), db.aims"),
    dict(id='row-knows-your-aims', file=PI, tests=[MP, '-g', DECIDED],
         old="onAims={(id) => aims.some((a) => a.path === id)}",
         new="onAims={() => aims.length < 0}"),
    dict(id='row-reads-its-path', file=PI, tests=[MP, '-g', DECIDED],
         old="const where = path ? requestedPath(path, versions, onAims(path.id)) : null",
         new="const where = path ? ('undecided' as const) : null"),
    dict(id='row-says-the-standing', file=PI, tests=[MP, '-g', DECIDED],
         old="where && where !== 'undecided' ? c.decided[where] : c.states[state]",
         new="c.states[state]"),
    dict(id='read-it-only-undecided', file=PI, tests=[MP, '-g', DECIDED],
         old="{path && where === 'undecided' ? (",
         new="{path ? ("),
    # ---- The read screen -------------------------------------------------------------------------------------------------
    dict(id='screen-reads-your-aims', file=PR, tests=[MP, '-g', DECIDED],
         old="db.aims.filter((a) => a.archivedAt === null && a.kind === 'path' && a.path === pathId).count()",
         new="Promise.resolve(0)"),
    dict(id='screen-guards-the-start', file=PR, tests=[MP, '-g', DECIDED],
         old="const offers = offersDecision(st, onAims > 0)",
         new="const offers = true"),
    dict(id='screen-removed-starts-again', file=PR, tests=[MP, '-g', DECIDED],
         old="const offers = offersDecision(st, onAims > 0)",
         new="const offers = offersDecision(st, onAims >= 0)"),
    dict(id='screen-eyebrow-started', file=PR, tests=[MP, '-g', DECIDED],
         old="{!offers ? c.started : st.kind === 'waiting' ? c.waiting : c.eyebrow}",
         new="{st.kind === 'waiting' ? c.waiting : c.eyebrow}"),
    dict(id='screen-says-started', file=PR, tests=[MP, '-g', DECIDED],
         old="""          <p class="note" data-testid="path-read-started">
            {copy.path.make.decided.onAims}""",
         new="""          <p class="note" data-testid="path-read-started">
            {copy.path.make.decided.later}"""),
    dict(id='screen-closes', file=PR, tests=[MP, '-g', DECIDED],
         old='data-testid="path-read-close" onClick={onClose}',
         new='data-testid="path-read-close" onClick={() => undefined}'),
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
