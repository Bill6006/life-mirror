"""Batch 2b's deliberate breaks (Let it out's Brain use): each undoes one change, and its test must turn
red. Same rules as stage1_breaks.py: a green baseline first, one exact replacement, the file always
restored byte for byte, the table read as data.

python batch2b_breaks.py [id ...]
"""
import io
import os
import re
import subprocess
import sys

# The repository root: this folder's parent.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
J = 'worker/src/journalBrain.test.ts'
C = 'src/journalCheck.test.ts'

TABLE = [
    dict(id='profile-line', file='worker/src/briefing.ts',
         old="'brainHistory', 'tier2', 'usage', 'location', 'journal'],",
         new="'brainHistory', 'tier2', 'usage', 'location'],",
         tests=[J], pattern='Claude’s line and review alone'),
    dict(id='switch-listed', file='src/brainShared.ts',
         old="export const BRAIN_SWITCHES = ['dayRecord', 'notes', 'journal', 'privateItems',",
         new="export const BRAIN_SWITCHES = ['dayRecord', 'notes', 'privateItems',",
         tests=[J], pattern='Claude’s line and review alone'),
    dict(id='faith-left-out', file='worker/src/retrieval.ts',
         old=".filter((e) => e.text && (faith || !FAITH_WORDS.test(e.text)) && (!needle || e.text.toLowerCase().includes(needle)))",
         new=".filter((e) => e.text && (!needle || e.text.toLowerCase().includes(needle)))",
         tests=[J], pattern='a night about faith only while faith may be read'),
    dict(id='needle-on-words', file='worker/src/retrieval.ts',
         old=".filter((e) => e.text && (faith || !FAITH_WORDS.test(e.text)) && (!needle || e.text.toLowerCase().includes(needle)))\n        .map((e) => ({ day: e.day, text: `${JOURNAL_LABEL}: “${e.text}”` }))",
         new=".filter((e) => e.text && (faith || !FAITH_WORDS.test(e.text)))\n        .map((e) => ({ day: e.day, text: `${JOURNAL_LABEL}: “${e.text}”` }))\n        .filter((i) => !needle || i.text.toLowerCase().includes(needle))",
         tests=[J], pattern='a keyword searches the words written'),
    dict(id='whole-record', file='worker/src/retrieval.ts',
         old="if (from < addDays(day, -366) && category !== 'journal') return",
         new="if (from < addDays(day, -366)) return",
         tests=[J], pattern='reaches the whole record'),
    dict(id='brief-cut', file='worker/src/retrieval.ts',
         old="    if (s.category === 'journal') items = items.map(briefEntry)\n",
         new="",
         tests=[J], pattern='briefs a long night only up to its cut'),
    dict(id='served-kept-briefing', file='worker/src/claude.ts',
         old="served: built.run.served, ...(journal.length ? { journal } : {}) })",
         new="served: built.run.served })",
         tests=[J], pattern='keeps their nights with the task'),
    dict(id='served-kept-read', file='worker/src/claude.ts',
         old="contextBytes: t.contextBytes + bytesOf(r.text), ...(journal.length ? { journal } : {}) })",
         new="contextBytes: t.contextBytes + bytesOf(r.text) })",
         tests=[J], pattern='read on demand from years back'),
    dict(id='rule-applied', file='worker/src/claude.ts',
         old="  let nights: string[] = []\n  if (verdict.ok) {\n",
         new="  let nights: string[] = []\n  if (verdict.ok && false) {\n",
         tests=[J], pattern='is refused for words lifted'),
    dict(id='dates-set-aside', file='worker/src/claude.ts',
         old="const asChecked = listed && declared.length ? {",
         new="const asChecked = listed && false ? {",
         tests=[J], pattern='read on demand from years back'),
    dict(id='question-needs-a-night', file='worker/src/claude.ts',
         old="  if (question && !nights.length) return { ok: false, reason: 'question: a follow-up question comes from what was written: list in \"journal\" the nights it draws on' }\n",
         new="",
         tests=[J], pattern='refuses a question that names no night'),
    dict(id='question-is-a-question', file='src/brainShared.ts',
         old="const why = (asked.endsWith('?') ? null : 'is not a question') ??",
         new="const why =",
         tests=[J], pattern='refuses a question that names no night'),
    dict(id='rules-only-when-carried', file='worker/src/prompt.ts',
         old="export const carriesJournal = (context: string | undefined): boolean => /^\\[journal\\] /m.test(context ?? '')",
         new="export const carriesJournal = (context: string | undefined): boolean => true || /^\\[journal\\] /m.test(context ?? '')",
         tests=['worker/src/gatedPrompts.test.ts'], pattern='as stage 1 left them'),
    dict(id='lift-check', file='src/journalCheck.ts',
         old="      if (!lifts(s, e.text)) continue\n",
         new="      continue\n",
         tests=[C], pattern='refuses words lifted from an entry'),
    dict(id='framed-check', file='src/journalCheck.ts',
         old="  if (!framed.length) return 'a statement from the journal is framed as what was written (\"On 14 October you wrote…\")'\n",
         new="",
         tests=[C], pattern='refuses a night never given'),
    dict(id='number-words', file='src/journalCheck.ts',
         old="if (/\\d/.test(bare) || NUMBER_WORD.test(bare)) return",
         new="if (/\\d/.test(bare)) return",
         tests=[C], pattern='refuses a number written as a word'),
    dict(id='journal-causes', file='src/journalCheck.ts',
         old="|| RECORD_CAUSE.test(bare) || JOURNAL_CAUSE.test(bare)) return",
         new="|| RECORD_CAUSE.test(bare)) return",
         tests=[C], pattern='refuses a number written as a word'),
    dict(id='quotes-whole', file='src/journalCheck.ts',
         old="      if (c === '“') depth++\n",
         new="      if (c === '“') depth += 0\n",
         tests=[C], pattern='keeps a quotation whole'),
    dict(id='stock-phrases', file='src/journalCheck.ts',
         old="const LIFTED_CONTENT = 3\n",
         new="const LIFTED_CONTENT = 0\n",
         tests=[C], pattern='lifts nothing from a stock phrase'),
    dict(id='why-names-nights', file='src/brainFlow.ts',
         old="  const journal = line.journal ?? []\n",
         new="  const journal: string[] = []\n",
         tests=['src/brainFlow.test.ts'], pattern='shows under Why the facts'),
    dict(id='row-carries-nights', file='src/cloudSync.ts',
         old=", ...(journalDaysOf(r.journal).length ? { journal: journalDaysOf(r.journal) } : {}) }",
         new=" }",
         tests=['src/cloud.test.ts'], pattern='brain'),
    dict(id='review-question', file='src/brainFlow.ts',
         old="...(typeof question === 'string' && question ? { question } : {}), ",
         new="",
         tests=['src/brainFlow.test.ts'], pattern='reviews the week from the record'),
    dict(id='coach-limits-said', file='worker/src/skillCoach.ts',
         old=" Each field is checked for length, in characters: the skill and the likely next at most ${COACH_LIMITS.skill}, the method ${COACH_LIMITS.method}, how and the safety line ${COACH_LIMITS.how}, why ${COACH_LIMITS.why}, each piece of evidence ${COACH_LIMITS.evidence}.`",
         new="`",
         tests=['worker/src/skillCoach.test.ts'], pattern='says every length it checks'),
    dict(id='coach-limits-shape', file='worker/src/skillCoach.ts',
         old="how: `optional, at most ${L.how} characters`",
         new="how: 'optional'",
         tests=['worker/src/skillCoach.test.ts'], pattern='says every length it checks'),
    dict(id='coach-limits-shared', file='src/coachShared.ts',
         old="    const how = text(ch.how, COACH_LIMITS.how, 'how', false)\n",
         new="    const how = text(ch.how, 250, 'how', false)\n",
         tests=['worker/src/skillCoach.test.ts'], pattern='says every length it checks'),
    dict(id='never-evidence', file='src/learning.ts',
         old="import { addDays, blockIndex, BLOCKS, daysBetween, type Block } from './blocks'\n",
         new="import { addDays, blockIndex, BLOCKS, daysBetween, type Block } from './blocks'\n// reads db.journal\n",
         tests=['src/journalNeverEvidence.test.ts']),
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
