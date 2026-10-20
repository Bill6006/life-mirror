"""The old engine retired, with no fallback (2026-10-20), each rule undone once: the test that guards it must turn red.

A failing engine offers no move at a check-in or at pickup time, and nothing else draws in its place; Now and Evidence
say it failed; the failure holds for the session; the Brain's sheet carries it for the Worker, whose report reads it; the
weekly scorecard says the engine could not read the record, never an older count. No production module imports the old
engine or a module of it, names one of its functions, or holds its closed key. A move drawn outside the comparisons (a
skip's replacement, the pickup-time move) is drawn among real moves alone, under the engine's day rules: a move for the
next block always, one with a day's window only while the day has none, never one over several days; each such offer is
noted for the rest of the day, and a check-in's draw counts as one offered; Skip's count follows the same rule. The
line offers two actions, never a test, and a test action is refused. Settings → Data has no Import a hypothesis.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by a browser test runs Playwright against the
built folder, so the app is rebuilt after its replacement and once more after its restore.

python retire_breaks.py [id ...]
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
BF = 'src/repair/breakerFlow.test.ts'
OE = 'src/oldEngineRetired.test.ts'
AS = 'src/repair/aside.test.ts'
RS = 'e2e/repair.spec.ts'

TABLE = [
    # No fallback.
    dict(id='no-fallback-check-in', file='src/offerFlow.ts', tests=[BF],
         old=", draw)) : drawMade(await repairDraw(checkin, situation, t, ids, draw))), null)",
         new=", draw)) : drawMade(await repairDraw(checkin, situation, t, ids, draw))), { moveId: ids[0], chances: { [ids[0]]: 1 }, candidates: [ids[0]], belief: () => ({ mean: 0, sd: 1, n: 0 }) as never, fits: [], week: false })"),
    dict(id='no-fallback-pickup', file='src/offerFlow.ts', tests=[BF],
         old="asideMade(await guardRepair(day, () => repairAside(day, 'energy', set.candidates.map((c) => c.id), draw), null))",
         new="asideMade(await guardRepair(day, () => repairAside(day, 'energy', set.candidates.map((c) => c.id), draw), { moveId: set.candidates[0]?.id ?? 'walk-ten', chances: {}, candidates: [], belief: () => ({}) as never }))"),
    dict(id='failure-holds', file='src/repair/gate.ts', tests=[BF, 'src/repair/gate.test.ts'],
         old="export function engineFailed(): boolean {\n  return repairTripped()\n}", new="export function engineFailed(): boolean {\n  return false\n}"),
    dict(id='now-says-failed', file='src/now.tsx', tests=[RS, '-g', 'the engine failing'],
         old="      {!settings.hideMoves && failed && !offer && (\n        <p class=\"note\" data-testid=\"engine-failed-now\">\n          {copy.move.engineFailed}\n        </p>\n      )}\n",
         new=""),
    dict(id='evidence-says-failed', file='src/evidenceScreen.tsx', tests=[RS, '-g', 'the engine failing'],
         old="      {failed ? (\n        <p class=\"note\" data-testid=\"engine-failed\">", new="      {false ? (\n        <p class=\"note\" data-testid=\"engine-failed\">"),
    dict(id='sheet-carries-failure', file='src/brainFlow.ts', tests=[BF],
         old="  if (fault) sheet.engineFault = fault\n", new=""),
    dict(id='worker-reads-failure', file='worker/src/engineReport.ts', tests=['worker/src/engineReport.test.ts'],
         old="fault: newest?.sheet.engineFault ?? null", new="fault: null"),
    dict(id='weekly-never-older-count', file='src/weeklyFacts.ts', tests=['src/weeklyFacts.test.ts'],
         old="'the learning engine could not read the record'", new="'experiments declared 0, replicated 0'"),
    # Nothing of the old engine in production.
    dict(id='no-old-name', file='src/offers.ts', tests=[OE],
         old="export { NOTHING }\n", new="export { NOTHING }\nexport const COIN_FLIP_RATE = 0.2\n"),
    dict(id='no-old-module', file='src/offers.ts', tests=[OE],
         old="import { minutesOf } from './settings'\n", new="import { minutesOf } from './settings'\nimport type {} from './bandit'\n"),
    dict(id='no-closed-key', file='src/repair/gate.ts', tests=[OE],
         old="export function engineFailed(): boolean {\n", new="export const OLD_KEY = 'life-mirror.preview.learningRepair'\nexport function engineFailed(): boolean {\n"),
    # Draws outside the comparisons.
    dict(id='aside-real-only', file='src/offerFlow.ts', tests=[OE, 'src/repair/flow.test.ts'],
         old="repairAside(day, situation.target, ids.filter((id) => id !== NOTHING), draw)", new="repairAside(day, situation.target, ids, draw)"),
    dict(id='aside-day-rule', file='src/repair/engine.ts', tests=[AS],
         old="  return cls === 'next' || (cls === 'day' && !offeredClasses.has('day'))\n", new="  return cls === 'next' || cls === 'day'\n"),
    dict(id='aside-never-several-days', file='src/repair/engine.ts', tests=[AS],
         old="  return cls === 'next' || (cls === 'day' && !offeredClasses.has('day'))\n", new="  return cls !== 'day' || !offeredClasses.has('day')\n"),
    dict(id='aside-noted', file='src/repair/record.ts', tests=[AS],
         old="engine.noteAside(index(o.day), o.moveId)", new="void index(o.day)"),
    dict(id='aside-counts-draws', file='src/repair/engine.ts', tests=[AS],
         old="...this.offers.filter((o) => o.d === d && o.moveId !== NOTHING), ", new=""),
    dict(id='skip-count-same-rule', file='src/offerFlow.ts', tests=['src/repair/skipCount.test.ts'],
         old="ids.filter((id) => id !== NOTHING && id !== offer.moveId && asideFits(clsOf(windowOfMove(id, target)), offered)).length",
         new="ids.filter((id) => id !== NOTHING && id !== offer.moveId).length"),
    # The line, and Data.
    dict(id='line-two-actions', file='worker/src/prompt.ts', tests=['worker/src/gatedPrompts.test.ts'],
         old="When the line asks the person to do one of two things", new="When the line asks the person to do one of three things"),
    dict(id='test-action-refused', file='src/brainShared.ts', tests=['src/brainShared.test.ts'],
         old="  return { ok: false, reason: 'action kind must be plan or depth' }", new="  return { ok: true, value: a as never }"),
    dict(id='data-no-import', file='src/dataScreen.tsx', tests=[RS, '-g', 'Import a hypothesis'],
         old="      <h2 class=\"section\">{copy.data.deleteTitle}</h2>", new="      <h2 class=\"section\">Import a hypothesis</h2>\n      <h2 class=\"section\">{copy.data.deleteTitle}</h2>"),
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
