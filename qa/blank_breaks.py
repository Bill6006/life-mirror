"""The blank Now (2026-10-23): the phone's storage interrupted under the app, each rule undone once: the test that guards it
must turn red.

A live read asks again each time the storage closes under the app, the database opened again first when it was left shut;
a read that starts while it is shut opens it first; opening it again after a connection closed mid-open closes it properly
first, so a read waiting on the open never asks again without end; a database closed on purpose stays closed. The
interruptions are heard (never a close on purpose), kept on this phone and ride the sheet for the Worker's report, which
shows them; a new one writes the facts row again though nothing else changed. The id floors never hold an open for good: a connection already gone is left, and the wait has a limit. The
sync opens the database again before it runs. Now is never an empty screen while it reads: its head and a line, a later
line with Try again past its limit, the wait kept with its reads, and Try again asks its reads again.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte, the
table read as data, and an empty test list refused. A break guarded by a browser test runs Playwright against the built
folder, so the app is rebuilt after its replacement and once more after its restore. A break whose test run crashes (a read
asked again without end fills the memory) counts as caught when the run says so.

python blank_breaks.py [id ...]
PW_CONFIG=<config> picks the Playwright config (default playwright.config.ts).
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
NPM = 'npm.cmd' if os.name == 'nt' else 'npm'
CONFIG = os.environ.get('PW_CONFIG', 'playwright.config.ts')
LV = 'src/live.ts'
SW = 'src/storageWatch.ts'
ST = 'src/storageWatch.test.ts'
IF = 'src/idFloors.ts'
NW = 'src/now.tsx'
E = 'e2e/interrupted.spec.ts'
CUT_SHORT = 'a first read it cuts short is asked again and answers'
OPEN_FAILED = 'an open it cuts short leaves the database refusing every read'
SHUT_OPENING = 'a connection closed while the database opens leaves Dexie refusing everything'
WAITING_READ = 'opens it again with a read waiting on the open'
HEARD = 'heard, the open goes on at once'
UNHEARD = 'unheard, it goes on within the limit'
ON_PURPOSE = 'leaves a database closed on purpose closed'
KEPT = 'keeps each interruption on this phone'
SHEET = 'rides the Brain'
ROW = 'writes the facts row again when only an interruption is new'
SYNC = 'opens the database again when the storage left it shut'
REPORT = 'gives the storage interruptions the newest facts row carries'
E_READ = 'the storage cut while Now reads an existing record'
E_OPEN = 'the storage cut while the database opens'
E_EMPTY = 'never an empty screen while Now reads'
E_AGAIN = 'a first read dropped with no word and no close'
E_ROW = 'the next start carries the interruption on the facts row'

ASK_AGAIN = "  const off = onStorageClosed(again)\n"
REOPEN_GUARD = "  if (db.isOpen() || state?.isBeingOpened || state?.autoOpen === false) return\n"
NOW_GUARD = "    return <NowReading key={again} day={today.day} missing={missing} onAgain={() => void reopenIfClosed(db).then(() => setAgain((n) => n + 1))} />\n"
LATE = "      setLate(true)\n      nowWaited(waiting.current)\n"
SHEET_LINE = "  if (storage) sheet.storageFault = storage\n"

TABLE = [
    # ---- A live read asks again ------------------------------------------------------------------------------
    dict(id='live-asks-again', file=LV, old=ASK_AGAIN, new="  const off = () => undefined\n", tests=[ST], pattern=CUT_SHORT),
    dict(id='live-asks-again-browser', file=LV, old=ASK_AGAIN, new="  const off = () => undefined\n", tests=[E], pattern=E_READ),
    dict(id='live-opens-first', file=LV,
         old="    if (!dexie.isOpen()) return void reopenIfClosed(dexie).then(follow)\n",
         new="",
         tests=[ST], pattern=SHUT_OPENING),
    dict(id='live-again-reopens', file=LV,
         old="      void reopenIfClosed(dexie).then(follow)\n",
         new="      follow()\n",
         tests=[ST], pattern=OPEN_FAILED),
    # ---- The database opened again ---------------------------------------------------------------------------
    dict(id='reopen-shut-no-failure', file=SW, old=REOPEN_GUARD,
         new="  if (db.isOpen() || state?.isBeingOpened || state?.autoOpen === false || !db.hasFailed()) return\n",
         tests=[ST], pattern=SHUT_OPENING),
    dict(id='reopen-shut-no-failure-browser', file=SW, old=REOPEN_GUARD,
         new="  if (db.isOpen() || state?.isBeingOpened || state?.autoOpen === false || !db.hasFailed()) return\n",
         tests=[E], pattern=E_OPEN),
    dict(id='reopen-fresh-promise', file=SW,
         old="  if (state?.openComplete && !db.hasFailed()) {\n",
         new="  if (false) {\n",
         tests=[ST], pattern=WAITING_READ),
    dict(id='reopen-leaves-on-purpose', file=SW, old=REOPEN_GUARD,
         new="  if (db.isOpen() || state?.isBeingOpened) return\n",
         tests=[ST], pattern=ON_PURPOSE),
    dict(id='sync-reopens', file='src/cloudSync.ts',
         old="  await reopenIfClosed(db)\n  const { token } = await resolveToken()\n",
         new="  const { token } = await resolveToken()\n",
         tests=['src/cloud.test.ts'], pattern=SYNC),
    # ---- Heard and kept --------------------------------------------------------------------------------------
    dict(id='watch-hears', file=SW,
         old="    if (away || reopening) return\n",
         new="    return\n",
         tests=[ST], pattern=CUT_SHORT),
    dict(id='watch-not-on-purpose', file=SW,
         old="      if (stateOf(db)?.autoOpen === false) return\n",
         new="",
         tests=[ST], pattern=ON_PURPOSE),
    dict(id='watch-keeps', file=SW,
         old="  keep((f, at) => (f ? { ...f, count: f.count + 1, last: at, name } : { count: 1, first: at, last: at, name }), now)\n",
         new="",
         tests=[ST], pattern=KEPT),
    dict(id='sheet-carries', file='src/brainFlow.ts', old=SHEET_LINE, new="", tests=[ST], pattern=SHEET),
    dict(id='sheet-carries-browser', file='src/brainFlow.ts', old=SHEET_LINE, new="", tests=[E], pattern=E_ROW),
    dict(id='row-written-for-a-fault', file='src/brainFlow.ts',
         old=" && same('engineFault') && same('storageFault')",
         new="",
         tests=[ST], pattern=ROW),
    dict(id='worker-report', file='worker/src/engineReport.ts',
         old=", storage: newest?.sheet.storageFault ?? null }",
         new=", storage: null }",
         tests=['worker/src/engineReport.test.ts'], pattern=REPORT),
    # ---- The id floors never hold an open ----------------------------------------------------------------------
    dict(id='floors-connection-gone', file=IF,
         old="      if (!db.isOpen()) return\n",
         new="",
         tests=[ST], pattern=HEARD),
    dict(id='floors-limit', file=IF,
         old="      return Promise.race([raiseCounters(db).then(() => undefined, () => undefined), limit]).finally(() => clearTimeout(timer))\n",
         new="      return raiseCounters(db).then(() => undefined, () => undefined)\n",
         tests=[ST], pattern=UNHEARD),
    # ---- Now while it reads ------------------------------------------------------------------------------------
    dict(id='now-never-empty', file=NW, old=NOW_GUARD, new="    return <section class=\"screen\" />\n", tests=[E], pattern=E_EMPTY),
    dict(id='now-says-late', file=NW, old=LATE, new="      nowWaited(waiting.current)\n", tests=[E], pattern=E_EMPTY),
    dict(id='now-keeps-wait', file=NW, old=LATE, new="      setLate(true)\n", tests=[E], pattern=E_EMPTY),
    dict(id='now-try-again', file=NW,
         old="onAgain={() => void reopenIfClosed(db).then(() => setAgain((n) => n + 1))}",
         new="onAgain={() => undefined}",
         tests=[E], pattern=E_AGAIN),
    dict(id='now-try-again-reads', file=NW,
         old="  const all = useLive(allCheckIns, [again])\n",
         new="  const all = useLive(allCheckIns, [])\n",
         tests=[E], pattern=E_AGAIN),
]

CRASH = ('heap out of memory', 'ERR_IPC_CHANNEL_CLOSED')


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
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
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
            try:
                code2, failed2, passed2, out2 = run(t['tests'], t.get('pattern'))
            except subprocess.TimeoutExpired:
                code2, failed2, passed2, out2 = 1, 0, 0, 'timed out'
        finally:
            io.open(path, 'wb').write(original)
            if browser(t['tests']):
                build()
        assert io.open(path, 'rb').read() == original, 'restore failed: ' + t['file']
        crashed = code2 != 0 and any(c in out2 for c in CRASH)
        verdict = 'CAUGHT' if code2 != 0 and failed2 > 0 else 'CAUGHT (the run crashed)' if crashed else f'MISSED (exit {code2}, {failed2} failed, {passed2} passed)'
        results.append((t['id'], f'{verdict}; baseline {passed} green'))
        print(t['id'], '->', results[-1][1], flush=True)
    print('\nSUMMARY')
    for i, v in results:
        print(f'  {i}: {v}')
    print('caught', sum(1 for _, v in results if v.startswith('CAUGHT')), 'of', len(results))


if __name__ == '__main__':
    main(sys.argv[1:])
