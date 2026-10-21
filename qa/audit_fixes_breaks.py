"""The audit's eight fixes and the new D7 (the owner's go of 2026-10-18), each rule undone once: the test that guards it must turn red.

The new D7 ("suggestions on tap, two a day"): the Worker's minute answers a suggestion alone and first, every other job
keeping its fifteen minutes; a suggestion never waits for the day's line or the coach, while a review still does; only runs
that reached Claude count toward the two; a refused fire waits its fifteen minutes, or the routine's retry-after, and its
asks wait on; the minute's check reads one range and stops when nothing is asked. The phone: an ask still queued is "not sent
yet" while the cloud copy is out of reach; the day's two counted by the runs that reached Claude; the brain's runs kept from
the bridge; a look at named rows before any pull, every 20 seconds; and the card's words for a refused fire.

The eight: the Aims cards' actions first and counts under Details, and Claude's evidence under Why; "Anything behind it?"
and the copy test allowing that phrase alone; "not asked" on the summary, on Now and on Mirror; the test tap's sentence; the
note field's hint fitting; "check-in?" kept whole.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by a browser test runs Playwright against the
built folder, so the app is rebuilt after its replacement and once more after its restore.

python audit_fixes_breaks.py [id ...]
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
S = 'e2e/smoke.spec.ts'
ST = 'e2e/storage.spec.ts'
TH = 'e2e/themes.spec.ts'
TICK = 'worker/src/tick.test.ts'
SC = 'worker/src/skillCoach.test.ts'
CF = 'src/coachFlow.test.ts'
CL = 'src/cloud.test.ts'
REFUSED = 'a fire the routine refused before any session'
CLOUD_ON = 'the skill coach with its cloud copy on'
AIMS = 'the Aims cards with real history'
# Restated 2026-10-19: since every morning asks both, the test seeds mornings from before, which asked one in turn.
NOT_ASKED = 'that asked one of Motivation and Confidence keeps the other marked'
AUDIT = 'nocturne: every screen and opened state'

TABLE = [
    # The Worker's tick: the minute answers a suggestion alone, and first.
    dict(id='minute-alone', file='worker/src/index.ts',
         old="        if (!onQuarter(now)) return\n",
         new="",
         tests=[TICK], pattern='answers a suggestion, then a waiting question'),
    dict(id='minute-answers-suggestions', file='worker/src/index.ts',
         old="          await dispatch('suggestions', env, now)\n",
         new="          await Promise.resolve()\n",
         tests=[TICK], pattern='answers a suggestion, then a waiting question'),
    # The skill coach's job.
    dict(id='suggestion-never-waits', file='worker/src/skillCoach.ts',
         old="  if (kind !== 'review' && pending.setup.length) {",
         new="  if (kind !== 'review' && pending.setup.length && (await store.hasBrief(`${day}:brief`))) {",
         tests=[SC], pattern='starts a suggestion at once'),
    dict(id='reviews-still-wait', file='worker/src/skillCoach.ts',
         old="    if (!opts.force && pending.review.length) {\n",
         new="    if (opts.force === 'never' && pending.review.length) {\n",
         tests=[SC], pattern='starts a suggestion at once'),
    dict(id='only-reached-count', file='worker/src/skillCoach.ts',
         old="  const reached = runs.filter(reachedClaude).length\n",
         new="  const reached = runs.length\n",
         tests=[SC], pattern=REFUSED),
    dict(id='refused-waits', file='worker/src/skillCoach.ts',
         old="    return now.getTime() < at ? { reason: `the routine refused the last fire; it is tried again at ${new Date(at).toISOString()}` } : { id: refused.id }\n",
         new="    return { id: refused.id }\n",
         tests=[SC], pattern=REFUSED),
    dict(id='refused-asks-wait-on', file='worker/src/skillCoach.ts',
         old="  const carried = new Set(today.filter((t) => reachedClaude(t) || t.status === 'firing').flatMap((t) => t.asks ?? []))",
         new="  const carried = new Set(today.flatMap((t) => t.asks ?? []))",
         tests=[SC], pattern=REFUSED),
    dict(id='retry-after-kept', file='src/coachShared.ts',
         old="  if (!ra) return base\n",
         new="  return base\n",
         tests=[SC], pattern=REFUSED),
    dict(id='no-run-for-a-stale-ask', file='worker/src/skillCoach.ts',
         old="    if (!stands(a, aimBodies, skillBodies, faithHidden)) continue\n",
         new="",
         tests=[SC], pattern='starts no run for an ask its commitment has moved past'),
    dict(id='minute-reads-one-range', file='worker/src/skillCoach.ts',
         old="  if (kind === 'setup' && !asks.some((a) => a.kind === 'setup')) return { ran: false, reason: 'nothing asked', day }\n",
         new="",
         tests=[SC], pattern='reads the open asks alone'),
    # The phone: where an ask stands.
    dict(id='unsent-said', file='src/coachFlow.ts',
         old="  if (queued && !reachable) return { kind: 'unsent' }\n",
         new="",
         tests=[CF], pattern='usually ready in a few minutes while Claude is at it'),
    dict(id='out-of-reach-is-unsent', file='src/coachFlow.ts',
         old="  const reachable = online && !sync?.lastError\n",
         new="  const reachable = online\n",
         tests=[S], pattern='Suggest a skill with Claude on your tap'),
    dict(id='two-counted-by-reached', file='src/coachFlow.ts',
         old="  if (runs.filter(reachedClaude).length >= MAX_SETUP_RUNS_A_DAY) return { kind: 'tomorrow' }",
         new="  if (runs.length >= MAX_SETUP_RUNS_A_DAY) return { kind: 'tomorrow' }",
         tests=[CF], pattern='both of today’s runs reached Claude'),
    dict(id='runs-kept-from-bridge', file='src/cloudSync.ts',
         old="          if (run) await db.coachRuns.put(run)\n",
         new="",
         tests=[CL], pattern='keeps a suggestion run'),
    dict(id='look-before-pull', file='src/cloudSync.ts',
         old="    if (!seen.some((r) => r.synced_at > watermark)) return false\n",
         new="",
         tests=[CL], pattern='looks at the few rows'),
    dict(id='look-every-20-seconds', file='src/aimsScreen.tsx',
         old="export const COACH_LOOK_MS = 20_000",
         new="export const COACH_LOOK_MS = 60_000",
         tests=[ST], pattern=CLOUD_ON),
    dict(id='refused-words', file='src/coachCards.tsx',
         old="  if (w.kind === 'refused') return fill(c.whenRefused, { time: formatTime(w.retryAt) })\n",
         new="",
         tests=[ST], pattern=CLOUD_ON),
    # 1. The Aims cards.
    dict(id='cue-counts-off-the-face', file='src/aimCard.tsx',
         old="      {blocked && unblock && !open",
         new="      <CueCounts counts={counts} />\n      {blocked && unblock && !open",
         tests=[S], pattern=AIMS),
    dict(id='actions-before-the-review', file='src/aimCard.tsx',
         old="      {/* The Aims cards (the owner's words, 2026-10-17, done whole 2026-10-18): the actions first,",
         new="      {learning?.coach && learning.current && !paused && <ReviewCoach coach={learning.coach.state} current={learning.current} rhythm={learning.coach.rhythm} earlier={learning.earlier} onAnswer={learning.coach.onReview} />}\n      {/* The Aims cards (the owner's words, 2026-10-17, done whole 2026-10-18): the actions first,",
         tests=[S], pattern=AIMS),
    dict(id='practice-line-under-details', file='src/aimCard.tsx',
         old="      {learning?.current?.safety && (\n        <p class=\"calc-line\" data-testid=\"aim-safety\">",
         new="      {learning?.current && <p data-testid=\"aim-practice\">{practiceLine(learning.practice)}</p>}\n      {learning?.current?.safety && (\n        <p class=\"calc-line\" data-testid=\"aim-safety\">",
         tests=[S], pattern=AIMS),
    dict(id='reps-under-details', file='src/pathCard.tsx',
         old="      {!paused && p.prompts}",
         new="      <p data-testid=\"path-rep-count\">{reps.length}</p>\n      {!paused && p.prompts}",
         tests=[S], pattern=AIMS),
    dict(id='evidence-under-why', file='src/coachCards.tsx',
         old="  const reasons = r && mode === null && why && (",
         new="  const reasons = r && mode === null && (",
         tests=[S], pattern='a progression review as it ships since Pass 1B'),
    # 2. "Anything behind it?", and the copy test allowing that phrase alone.
    dict(id='owners-words-restored', file='src/copy.ts',
         old="    behindIt: 'Anything behind it?',",
         new="    behindIt: 'Anything going on?',",
         tests=[S], pattern='after a reading worsens by two steps'),
    dict(id='phrase-allowed-alone', file='src/copy.test.ts',
         old="const ownersWords = ['Anything behind it?', 'The evidence behind this has changed']",
         new="const ownersWords = ['The evidence behind this has changed']",
         tests=['src/copy.test.ts'], pattern='contains no verdict words'),
    # 3. Not asked.
    dict(id='not-asked-named', file='src/db.ts',
         old="  return other && !retired.includes(other) ? other : null\n",
         new="  return null\n",
         tests=['src/askedDay.test.ts'], pattern='names the one of Motivation and Confidence'),
    dict(id='not-asked-on-summary', file='src/checkin.tsx',
         old="            const other = notAskedInTurn(record, settings.retiredReadings)\n",
         new="            const other = null as ReturnType<typeof notAskedInTurn>\n",
         tests=[S], pattern=NOT_ASKED),
    dict(id='not-asked-on-now', file='src/reading.tsx',
         old="v.id === notToday ? copy.disclose.contextNotAsked : old && copy.disclose.contextEarlier",
         new="old && copy.disclose.contextEarlier",
         tests=[S], pattern=NOT_ASKED),
    dict(id='not-asked-on-mirror', file='src/mirror.tsx',
         old="{overlayId && all.some((c) => c.day === today.day && notAskedInTurn(c) === overlayId) && (",
         new="{false && (",
         tests=[S], pattern=NOT_ASKED),
    # 5. The test tap's sentence.
    # 6. The note field's hint fits; 7. "check-in?" kept whole: the layout audit's two new rules.
    dict(id='note-hint-fits', file='src/copy.ts',
         old="    notePlaceholder: 'A line Claude may read',",
         new="    notePlaceholder: 'One line. Claude may read it, as Settings → Brain allows.',",
         tests=[TH], pattern=AUDIT),
    dict(id='check-in-kept-whole-evening', file='src/extras.tsx',
         old="<span class=\"row-main\">{keepTogether(copy.extras[key], 'check-in?')}</span>",
         new="<span class=\"row-main\">{copy.extras[key]}</span>",
         tests=[S], pattern='Outside a while today and Something sweet'),
    dict(id='check-in-kept-whole', file='src/styles.css',
         old=".keep-together {\n  white-space: nowrap;\n}",
         new=".keep-together {\n}",
         tests=[S], pattern='Outside a while today and Something sweet'),
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
