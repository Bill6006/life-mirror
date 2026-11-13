"""Phase 0 of the next build (2026-11-12), the weekly copy of the cloud database and its way back: each rule of the
three snapshot scripts undone once, and the test that guards it must turn red.

The snapshot reads fifty records to a request, copies every table, holds the rows it read to the count the database
itself gives, leaves no half-written file behind a failed read, keeps the token out of what it writes, and refuses a
folder inside a repository. The check compares the file with its manifest. The restore refuses a database that holds
rows, a snapshot that fails its manifest, and the live database under either spelling of its address.

Every test runs on a stand-in database and can reach no token and no network, whatever a break does.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, an empty test list refused, and an id that matches no entry refused.

python phase0_breaks.py [id ...]
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
T = 'src/snapshotScripts.test.ts'
SNAP = 'scripts/snapshot.mjs'
CHECK = 'scripts/snapshot-check.mjs'
RESTORE = 'scripts/snapshot-restore.mjs'

TABLE = [
    # The snapshot.
    dict(id='snapshot-fifty-a-request', file=SNAP,
         old="const PAGE = 50;\n",
         new="const PAGE = 200;\n",
         tests=[T], pattern='fifty to a request'),
    dict(id='snapshot-every-table', file=SNAP,
         old="      if (t === 'records') continue;\n",
         new="      if (t !== 'devices') continue;\n",
         tests=[T], pattern='copies every table row for row'),
    dict(id='snapshot-held-to-the-count', file=SNAP,
         old="    if (short.length) {\n",
         new="    if (short.length < 0) {\n",
         tests=[T], pattern='came back short of the count'),
    dict(id='snapshot-nothing-half-written', file=SNAP,
         old="    await removeQuiet(partial);\n    await removeQuiet(manifestPartial);\n    return result;\n",
         new="    return result;\n",
         tests=[T], pattern='no file that looks finished'),
    dict(id='snapshot-token-kept-out', file=SNAP,
         old="  for (const s of secrets) if (s) msg = msg.split(s).join('[redacted]');\n",
         new="",
         tests=[T], pattern='keeps the token out'),
    dict(id='snapshot-never-in-a-repository', file=SNAP,
         old="  if (gitRoot) {\n",
         new="  if (gitRoot && false) {\n",
         tests=[T], pattern='refuses to write a snapshot inside a repository'),
    # The check.
    dict(id='check-file-against-manifest', file=CHECK,
         old="  if (diffs.length) { for (const d of diffs) fail('manifest vs file: ' + d); return false; }\n",
         new="",
         tests=[T], pattern='fails one cut short or miscounted'),
    # The restore.
    dict(id='restore-only-into-empty', file=RESTORE,
         old="  if (!(await target.isEmpty())) {\n",
         new="  if (!(await target.isEmpty()) && false) {\n",
         tests=[T], pattern='refuses one that already holds rows'),
    dict(id='restore-manifest-first', file=RESTORE,
         old="  if (diffs.length) throw new Refusal('the snapshot fails its manifest check: ' + diffs.slice(0, 5).join('; '));\n",
         new="",
         tests=[T], pattern='fails its own manifest'),
    dict(id='restore-never-the-live-database', file=RESTORE,
         old="    if (isLiveAddress(to, live)) { console.error('Refusing: the target is the live database named in worker/wrangler.toml.'); process.exit(2); }\n",
         new="",
         tests=[T], pattern='refuses to restore over the live database'),
    dict(id='restore-either-spelling', file=RESTORE,
         old="  return `${u.hostname.toLowerCase()}:${u.port || '443'}`;\n",
         new="  return `${u.protocol}//${u.hostname.toLowerCase()}:${u.port || '443'}`;\n",
         tests=[T], pattern='under either spelling of its address'),
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
