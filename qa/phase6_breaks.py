"""Phase 6 of the next build (2026-11-13), monthly write-ups. Each rule undone once, and the test that guards it
must turn red. This runner grows with the phase; its first entries are the month's lines.

A month's days: three days served either side; named only by a month's first day; a month that does not exist is no
month; its last day is the month's own.

The written list: each kind of record covered, and each left out with why.

A month's lines: each day's lines as the exact-day lookup words them, from that day's rows alone; the days beside the
month are served and named as outside it; each store is read once, whole, and counted against the database's own
count; a store past an ordinary read is read whole; the workouts' read is whole; a month is read once its days after
have passed; a month past sixteen parts is not read.

The parts: whole days, closed before the day that would pass the size; a day with nothing recorded is skipped; the
days outside the month are named.

The fingerprint: the month's own lines alone, their words as well as their ids.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, an empty test list refused, and an id that matches no entry refused.

python phase6_breaks.py [id ...]
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
M = 'worker/src/month.ts'
MT = 'worker/src/month.test.ts'
L = 'worker/src/lookups.ts'

TABLE = [
    # A month's days.
    dict(id='three-days-either-side', file=M,
         old="export const MONTH_MARGIN = 3",
         new="export const MONTH_MARGIN = 2",
         tests=[MT], pattern='with three days served either side'),
    dict(id='a-months-first-day-alone', file=M,
         old="  if (!MONTH_RE.test(first)) return null\n",
         new="  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(first)) return null\n",
         tests=[MT], pattern='named only by a month’s first day'),
    dict(id='a-month-that-does-not-exist', file=M,
         old="  if (m < 1 || m > 12) return null\n",
         new="",
         tests=[MT], pattern='named only by a month’s first day'),
    dict(id='the-months-own-last-day', file=M,
         old="new Date(Date.UTC(y, m, 0))",
         new="new Date(Date.UTC(y, m, -1))",
         tests=[MT], pattern='with three days served either side'),

    # The written list.
    dict(id='the-list-names-what-is-left-out', file=M,
         old="  { what: 'the journal', why: 'it is never evidence' },\n",
         new="",
         tests=[MT], pattern='names each kind of record covered'),
    dict(id='the-list-names-what-is-covered', file=M,
         old="  'finished workouts',\n",
         new="",
         tests=[MT], pattern='names each kind of record covered'),

    # A month's lines.
    dict(id='lines-as-the-exact-day-words-them', file=M,
         old="    days.push({ day: d, inside, facts: dayFacts(x, d, rows) })\n",
         new="    days.push({ day: d, inside, facts: dayFacts(x, d, rows).reverse() })\n",
         tests=[MT], pattern='exactly as the exact-day lookup words them'),
    dict(id='a-days-lines-from-its-own-rows', file=L,
         old="  const of = (list: readonly RecordRow[]): RecordRow[] => list.filter((r) => r.day === D)\n",
         new="  const of = (list: readonly RecordRow[]): RecordRow[] => [...list]\n",
         tests=[MT], pattern='exactly as the exact-day lookup words them'),
    dict(id='the-days-beside-are-outside', file=M,
         old="    const inside = d >= span.from && d <= span.to\n",
         new="    const inside = d >= span.from\n",
         tests=[MT], pattern='cover every day of the month and three days either side'),
    dict(id='the-days-beside-are-read', file=M,
         old="  const range = { from: span.servedFrom, to: span.servedTo }\n",
         new="  const range = { from: span.from, to: span.to }\n",
         tests=[MT], pattern='cover every day of the month and three days either side'),
    dict(id='a-read-short-of-the-count-builds-nothing', file=M,
         old="    if (read !== held) return",
         new="    if (read > held) return",
         tests=[MT], pattern='read fell short of the database’s own count'),
    dict(id='the-counts-are-kept', file=M,
         old="    counts[store] = read\n",
         new="",
         tests=[MT], pattern='say how many rows of each store'),
    dict(id='a-large-store-is-read-whole', file=L,
         old="    recordsOf(read, 'notes', range, limit),\n",
         new="    recordsOf(read, 'notes', range),\n",
         tests=[MT], pattern='holds more rows than an ordinary read gives'),
    dict(id='the-workouts-read-is-whole', file=M,
         old="  if (rows.outside.length >= OUTSIDE_READ) return",
         new="  if (rows.outside.length > OUTSIDE_READ) return",
         tests=[MT], pattern='finished workouts outran their one read'),
    dict(id='the-days-after-have-passed', file=M,
         old="  if (span.servedTo > x.day) return",
         new="  if (span.to > x.day) return",
         tests=[MT], pattern='whose days after it have not all passed'),
    dict(id='sixteen-parts-at-most', file=M,
         old="  if (parts.length > MONTH_PARTS_MOST) return",
         new="  if (parts.length > MONTH_PARTS_MOST * 100) return",
         tests=[MT], pattern='needs more parts than a read may have'),
    dict(id='the-number-sixteen', file=M,
         old="export const MONTH_PARTS_MOST = 16",
         new="export const MONTH_PARTS_MOST = 17",
         tests=[MT], pattern='needs more parts than a read may have'),
    dict(id='four-thousand-rows-a-read', file=M,
         old="export const MONTH_READ = 4000",
         new="export const MONTH_READ = 500",
         tests=[MT], pattern='four thousand rows at most'),

    # The parts.
    dict(id='a-part-is-32-kb', file=M,
         old="export const MONTH_PART_BYTES = 32 * 1024",
         new="export const MONTH_PART_BYTES = 64 * 1024",
         tests=[MT], pattern='hold whole days, closed before the day'),
    dict(id='a-part-closes-before-the-size', file=M,
         old="    if (!open || (open.bytes + bytes > most && open.lines > 0)) {\n",
         new="    if (!open) {\n",
         tests=[MT], pattern='hold whole days, closed before the day'),
    dict(id='an-empty-day-is-skipped', file=M,
         old="    if (!d.facts.length) continue\n",
         new="",
         tests=[MT], pattern='skip a day with nothing recorded'),
    dict(id='the-outside-days-are-named', file=M,
         old="    if (!d.inside) open.outside.push(d.day)\n",
         new="",
         tests=[MT], pattern='name those of their days that are outside the month'),

    # The fingerprint.
    dict(id='the-fingerprint-is-the-months-own', file=M,
         old="  const own = days.filter((d) => d.inside).flatMap((d) => d.facts)\n",
         new="  const own = days.flatMap((d) => d.facts)\n",
         tests=[MT], pattern='does not change when a day beside the month changes'),
    dict(id='the-fingerprint-reads-the-words', file=M,
         old="facts.map((f) => `${f.id}\\t${f.text}`)",
         new="facts.map((f) => f.id)",
         tests=[MT], pattern='changes when a note in the month changes'),
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
