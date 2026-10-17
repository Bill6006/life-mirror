"""Stage 3's deliberate breaks (designed 2026-10-17): each undoes one rule, and the test that guards it must turn red.

Same rules as the other runners: a green baseline first, one exact replacement, the file always
restored byte for byte, the table read as data, and an empty test list refused. A break guarded by a
unit test runs Vitest; one guarded by a browser test runs Playwright against the built folder, so the
app is rebuilt after its replacement and once more after its restore.

python stage3_breaks.py [id ...]
PW_CONFIG=<config> picks the Playwright config (default playwright.config.ts).
"""
import io
import os
import re
import subprocess
import sys

# The repository root: this folder's parent.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
NPM = 'npm.cmd' if os.name == 'nt' else 'npm'
CONFIG = os.environ.get('PW_CONFIG', 'playwright.config.ts')
S = 'e2e/smoke.spec.ts'
WORSE = 'after a reading worsens by two steps'
EVENING = 'after an evening, the one pattern'

TABLE = [
    # Group 3: Anything going on? (the agreed "anything behind it?"; Rule 4 bans the word "behind").
    dict(id='behind-threshold', file='src/change.ts',
         old="export const BEHIND_IT_STEPS = 2\n",
         new="export const BEHIND_IT_STEPS = 3\n",
         tests=[S], pattern=WORSE),
    dict(id='behind-own-direction', file='src/change.ts',
         old="    return (dir === 'up' ? before - now : now - before) >= BEHIND_IT_STEPS\n",
         new="    return before - now >= BEHIND_IT_STEPS\n",
         tests=['src/change.test.ts'], pattern='each in its own direction'),
    dict(id='behind-six-readings', file='src/change.ts',
         old="    if (!dir || now === undefined || before === undefined) return false\n",
         new="    if (now === undefined || before === undefined) return false\n",
         tests=['src/change.test.ts'], pattern='only the six readings with a direction'),
    dict(id='behind-not-evening', file='src/checkin.tsx',
         old="  const behind = record.block !== 'evening' && worsenedReadings(record.answers, record.block, previous).length > 0\n",
         new="  const behind = worsenedReadings(record.answers, record.block, previous).length > 0\n",
         tests=[S], pattern=EVENING),
    dict(id='behind-writes-note', file='src/checkin.tsx',
         old="onSave={(text) => void setNote({ day: record.day, block: record.block }, askedOf(record), text)}",
         new="onSave={() => undefined}",
         tests=[S], pattern=WORSE),
    # Group 3: the pattern tonight matches.
    dict(id='pattern-matches-tonight', file='src/beforeDays.ts',
         old="    return position !== undefined && atLevel(position, p.level)\n",
         new="    return position !== undefined\n",
         tests=['src/beforeDays.test.ts'], pattern='tonight matches no pair'),
    dict(id='pattern-evening-only', file='src/beforeDays.ts',
         old="  if (tonight.block !== 'evening') return null\n",
         new="",
         tests=['src/beforeDays.test.ts'], pattern='belongs to the evening alone'),
    dict(id='pattern-ready-only', file='src/beforeDays.ts',
         old=".filter((p) => p.enough && p.diff !== null)",
         new=".filter((p) => p.diff !== null)",
         tests=['src/beforeDays.test.ts'], pattern='tonight matches no pair'),
    dict(id='pattern-shown', file='src/checkin.tsx',
         old="      {pattern && span !== null && (\n",
         new="      {false && pattern && span !== null && (\n",
         tests=[S], pattern=EVENING),
    dict(id='pattern-never-a-cause', file='src/checkin.tsx',
         old="          <p class=\"note faint no-gap\">{copy.summary.patternNote}</p>\n",
         new="",
         tests=[S], pattern=EVENING),
]


def build():
    r = subprocess.run([NPM, 'run', 'build'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit('build failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def browser(tests):
    return any(t.startswith('e2e/') for t in tests)


def run(tests, pattern):
    assert tests, 'an empty test list would run everything'
    if browser(tests):
        cmd = [NPX, 'playwright', 'test', '-c', CONFIG, '--retries', '0', *tests]
        if pattern:
            cmd += ['-g', pattern]
    else:
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
        code, failed, passed, out = run(t['tests'], t.get('pattern'))
        if code != 0 or passed == 0:
            results.append((t['id'], f'NO GREEN BASELINE (exit {code}, {passed} passed)'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        try:
            io.open(path, 'wb').write(text.replace(t['old'], t['new']).encode('utf-8'))
            if browser(t['tests']):
                build()
            code2, failed2, passed2, out2 = run(t['tests'], t.get('pattern'))
        finally:
            io.open(path, 'wb').write(original)
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
