"""Batch 2's deliberate breaks (the foundations, the claims log, the journal's capture, the wipe):
each undoes one change, and its test must turn red. Same rules as stage1_breaks.py: a green baseline
first, one exact replacement, the file always restored byte for byte, the table read as data.

python batch2_breaks.py [id ...]
"""
import io
import os
import re
import subprocess
import sys

# The repository root: this folder's parent.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'

TABLE = [
    dict(id='draw-record-pickup', file='src/offerFlow.ts', old="      draw: drawRecord,\n      day,\n", new="      day,\n",
         tests=['src/provenance.test.ts'], pattern='keeps what the pickup draw knew'),
    dict(id='draw-record-block', file='src/offerFlow.ts', old="      closedAt: null,\n      draw: drawRecord,\n", new="      closedAt: null,\n",
         tests=['src/provenance.test.ts'], pattern='keeps what each draw knew on the offer'),
    dict(id='draw-context-unwell', file='src/provenance.ts', old="    unwell: Boolean(ctx?.unwell),\n", new="    unwell: false,\n",
         tests=['src/provenance.test.ts'], pattern='takes the day’s context'),
    dict(id='draw-prediction', file='src/provenance.ts', old="  const expected = slot ? forecast(indexCheckIns(i.checkins), slot.day, slot.block, i.target) : null\n",
         new="  const expected = null\n", tests=['src/provenance.test.ts'], pattern='saves the prediction before any outcome'),
    dict(id='seen-guard', file='src/offerFlow.ts', old="    if (offer && offer.at === at && !offer.seenAt) await db.offers.update(id, { seenAt: now.toISOString() })\n",
         new="    if (offer && !offer.seenAt) await db.offers.update(id, { seenAt: now.toISOString() })\n",
         tests=['src/provenance.test.ts'], pattern='records a move seen on Now'),
    dict(id='outcome-reason', file='src/offerFlow.ts', old=", reason: outcomeReasonOf(outcome, why), seen }\n", new=" }\n",
         tests=['src/provenance.test.ts'], pattern='keeps each answer’s reason'),
    dict(id='claims-no-call', file='src/claims.ts',
         old="    if (before === now.tier || (!CALLS.has(now.tier) && (before === undefined || !CALLS.has(before)))) continue\n",
         new="    if (before === now.tier) continue\n",
         tests=['src/claims.test.ts'], pattern='keeps a call when'),
    dict(id='claims-kept-in-run', file='src/learningFlow.ts', old="    if (calls.length) await db.claims.bulkAdd(calls)\n", new="",
         tests=['src/claimsRun.test.ts']),
    dict(id='wipe-every-table', file='src/db.ts', old="    await Promise.all(db.tables.map((t) => t.clear()))\n",
         new="    await Promise.all(db.tables.filter((t) => t.name !== 'coachAsks' && t.name !== 'claims' && t.name !== 'journal').map((t) => t.clear()))\n",
         tests=['src/claims.test.ts'], pattern='leaves every table empty'),
    dict(id='journal-synced', file='src/cloudOutbox.ts', old="'coachAsks', 'claims', 'journal']", new="'coachAsks', 'claims']",
         tests=['src/journal.test.ts'], pattern='syncs as its own store'),
    dict(id='journal-limit', file='src/journal.ts', old="export function saveJournal(day: string, text: string, now: Date = new Date()): Promise<JournalEntry | null> {\n  const words = text.slice(0, JOURNAL_MAX)\n",
         new="export function saveJournal(day: string, text: string, now: Date = new Date()): Promise<JournalEntry | null> {\n  const words = text\n",
         tests=['src/journal.test.ts'], pattern='holds a generous night'),
    dict(id='journal-edited-at', file='src/journal.ts', old="    await db.journal.update(existing.id as number, { text: words, editedAt: at, updatedAt: at })\n",
         new="    await db.journal.update(existing.id as number, { text: words, updatedAt: at })\n",
         tests=['src/journal.test.ts'], pattern='keeps the night’s words'),
    dict(id='journal-search-every-word', file='src/journal.ts', old="    return words.every((w) => text.includes(w))\n", new="    return words.some((w) => text.includes(w))\n",
         tests=['src/journal.test.ts'], pattern='finds the entries holding every word'),
    dict(id='construct-direction', file='src/readings.json', old='"measures": "How heavy or urgent things feel, from nothing pressing to more than you can carry.",\n        "boundary": "Weight and urgency, never a count: how many things compete for your attention is Overwhelm\'s.",\n        "timeframe": "right now",\n        "good": "lower",',
         new='"measures": "How heavy or urgent things feel, from nothing pressing to more than you can carry.",\n        "boundary": "Weight and urgency, never a count: how many things compete for your attention is Overwhelm\'s.",\n        "timeframe": "right now",\n        "good": "higher",',
         tests=['src/construct.test.ts'], pattern='say the good direction'),
]


def run(tests, pattern):
    assert tests, 'an empty test list would run everything'
    cmd = [NPX, 'vitest', 'run', *tests]
    if pattern:
        cmd += ['-t', pattern]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
    m = re.search(r'Tests\s+(?:(\d+) failed \| )?(\d+) passed', out)
    failed = int(m.group(1) or 0) if m else None
    passed = int(m.group(2)) if m else 0
    m2 = re.search(r'Tests\s+(\d+) failed', out)
    if m2 and failed is None:
        failed = int(m2.group(1))
    return r.returncode, (failed or 0), passed, out


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
            results.append((t['id'], f'SETUP: the line to break appears {n} times'))
            continue
        code, failed, passed, out = run(t['tests'], t.get('pattern'))
        if code != 0 or passed == 0:
            results.append((t['id'], f'NO GREEN BASELINE (exit {code}, {passed} passed)'))
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
