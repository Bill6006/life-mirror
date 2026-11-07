"""P6 of the AI-generated Paths design (2026-11-07): each new rule undone once, and the test that guards it must turn red.

The fast loop: only applied rows of a Path's own log read, a rep set aside outranking a preference; feasibility on three
of four answered with no chance, never what would break the stage's floor, a declined proposal back only on newer
answers; a step-down on can't-do-it-yet twice in three weeks, never on the first stage; the smaller version first on
three hard of four done or three Nos for no time of four answered; check-again spacing lengthened up to a year and
shortened to three weeks at least; a proposal applied never proposed again; the checks restarted by a spacing taken. The
engine: a rep set aside never offered, nor one needing only a kind of setting you don't have; where a rep is meant to
happen never such a kind; a draw leaning to a rep you prefer; the smaller version first after a hard one only; a step-down
bringing the stage below's reps back. The record: Not for me refused on the floor, Undo kept as undone, a safety set-aside
written at once, once, and never undone by a tap; the Path's own reason kept only after a No; Not now kept as declined;
the log synced and exported, the Partner path's only when included. The boundaries: the fact sheet and the Worker's
readers never carry the log. The screens: the Path's own reason asked after a No (and the chance question no more), the
safety notice, the changes and suggestions under Details, the Details line, the sheet's safety line. The slow loop's
calls: the repaired threshold and weeks, the stricter call while two tests run, the minimums, the counts' floor.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. Browser entries build before and after their break.
PW_CONFIG=<config> picks the Playwright config (default playwright.config.ts).

python paths_p6_breaks.py [id ...]
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
ADAPT = 'src/pathAdapt.test.ts'
FLOW = 'src/pathAdaptFlow.test.ts'
BOUNDARY = 'src/pathAdaptBoundary.test.ts'
RETRIEVAL = 'worker/src/retrieval.test.ts'
TESTS = 'src/pathTests.test.ts'
STRESS = 'src/pathTests.stress.test.ts'
E2E = 'e2e/personalize.spec.ts'
A = 'src/pathAdapt.ts'
S = 'src/pathStage.ts'
F = 'src/pathAdaptFlow.ts'
T = 'src/pathTests.ts'

TABLE = [
    # The fast loop's rules.
    dict(id='rows-of-other-path', file=A,
         old="  const mine = (rows ?? []).filter((r) => r.path === path && r.state === 'applied')",
         new="  const mine = (rows ?? []).filter((r) => r.state === 'applied')",
         tests=[ADAPT], pattern='the runtime reads only applied rows'),
    dict(id='declined-applies', file=A,
         old="  const mine = (rows ?? []).filter((r) => r.path === path && r.state === 'applied')",
         new="  const mine = (rows ?? []).filter((r) => r.path === path && r.state !== 'undone')",
         tests=[ADAPT], pattern='the runtime reads only applied rows'),
    dict(id='prefer-over-aside', file=A,
         old="  for (const id of setAside) prefer.delete(id)\n",
         new="",
         tests=[ADAPT], pattern='outrank a preference'),
    dict(id='no-chance-at-two', file=A,
         old="export const NO_CHANCE = { of: 4, at: 3 } as const",
         new="export const NO_CHANCE = { of: 4, at: 2 } as const",
         tests=[ADAPT], pattern='feasibility'),
    dict(id='no-chance-floor-ignored', file=A,
         old="    if (setAside.has(moveId) || i.floorLost(moveId)) continue",
         new="    if (setAside.has(moveId)) continue",
         tests=[ADAPT], pattern='feasibility'),
    dict(id='declined-evidence-reused', file=A,
         old="  return rows.filter((r) => r.key === key && r.state === 'declined').reduce((s, r) => (r.stateAt > s ? r.stateAt : s), '')",
         new="  return rows.length < 0 ? key : ''",
         tests=[ADAPT], pattern='feasibility'),
    dict(id='cant-yet-any-time', file=A,
         old="r.at > from && r.day >= addDays(i.today, -(CANT_YET.days - 1)) && r.day <= i.today)",
         new="r.at > from && r.day <= i.today)",
         tests=[ADAPT], pattern='step-down'),
    dict(id='step-down-first-stage', file=A,
         old="    if (s.stage > 1 && !i.belowBack(s)) {",
         new="    if (!i.belowBack(s)) {",
         tests=[ADAPT], pattern='step-down'),
    dict(id='hard-at-three', file=A,
         old="export const HARD_EFFORT = 4",
         new="export const HARD_EFFORT = 3",
         tests=[ADAPT], pattern='the smaller version first'),
    dict(id='burden-ignored', file=A,
         old="    else if (last.length >= TOO_MUCH.of && noTime >= TOO_MUCH.at) add(",
         new="    else if (false) add(",
         tests=[ADAPT], pattern='the smaller version first'),
    dict(id='spacing-uncapped', file=A,
         old="const every = c.passed ? Math.min(SPACING.most, Math.round(c.next * SPACING.longer))",
         new="const every = c.passed ? Math.round(c.next * SPACING.longer)",
         tests=[ADAPT], pattern='check-again spacing'),
    dict(id='spacing-no-floor', file=A,
         old=": Math.max(SPACING.least, Math.round(c.next * SPACING.shorter))",
         new=": Math.round(c.next * SPACING.shorter)",
         tests=[ADAPT], pattern='check-again spacing'),
    dict(id='applied-proposed-again', file=A,
         old="    if (appliedKey(i.rows, key) || out.some((x) => x.key === key)) return",
         new="    if (out.some((x) => x.key === key)) return",
         tests=[ADAPT], pattern='never proposed again'),
    dict(id='checks-spacing-ignored', file='src/pathMeasure.ts',
         old="    const take = spacing.filter((s) => s.after === day && s.every > 0).pop()",
         new="    const take = spacing.filter(() => false).pop()",
         tests=[ADAPT], pattern='check-again spacing'),
    # The engine.
    dict(id='set-aside-offered', file=S,
         old="  if (a.setAside.has(m.id)) return true\n",
         new="",
         tests=[ADAPT], pattern='never offers a rep you set aside'),
    dict(id='no-setting-ignored', file=S,
         old="  return (m.settings?.length ? m.settings : [defaultSetting(m)]).every((k) => a.noSettings.has(k))",
         new="  return false",
         tests=[ADAPT], pattern='never offers a rep you set aside'),
    dict(id='setting-kind-kept', file=S,
         old="  const own = no?.size && all.some((k) => !no.has(k)) ? all.filter((k) => !no.has(k)) : all",
         new="  const own = all",
         tests=[ADAPT], pattern='never offers a rep you set aside'),
    dict(id='prefer-no-lean', file=S,
         old="  const leans = Boolean(prefer?.size) && eligible.some((m) => prefer?.has(m.id)) && eligible.some((m) => !prefer?.has(m.id))",
         new="  const leans = false",
         tests=[ADAPT], pattern='leans a draw toward a rep you prefer'),
    dict(id='smaller-first-ignored', file=S,
         old="  if (first.length) return { ...one(lightest(first), 'smaller'), first: true }\n",
         new="",
         tests=[ADAPT], pattern='offers the smaller version first'),
    dict(id='smaller-first-any-answer', file=S,
         old="  return Boolean(x && ((x.outcome === 'done' && (x.effort ?? 0) >= HARD_EFFORT) || (x.outcome === 'no' && x.why === 'noTime')))",
         new="  return Boolean(x && x.outcome === 'done')",
         tests=[ADAPT], pattern='offers the smaller version first'),
    dict(id='step-down-ignored', file=S,
         old="  const down = (strand: string, state: StageState) => (state.stage > 1 && adapted.stepDown.some((d) => d.strand === strand && d.stage === state.stage) ? [state.stage - 1] : [])",
         new="  const down = (_strand: string, _state: StageState): number[] => []",
         tests=[ADAPT], pattern='brings the stage below'),
    # The record.
    dict(id='floor-tap-allowed', file=F,
         old="    if (refused) return refused\n",
         new="",
         tests=[FLOW], pattern='refuse Not for me'),
    dict(id='undo-deletes', file=F,
         old="    if (r?.state === 'applied') await db.pathAdaptations.update(id, { state: 'undone', stateAt: now.toISOString() })",
         new="    if (r?.state === 'applied') await db.pathAdaptations.delete(id)",
         tests=[FLOW], pattern='unsafe or harmful'),
    dict(id='safety-undone-by-tap', file=F,
         old="    if (!on) for (const r of live) if (r.origin !== 'safety') await db.pathAdaptations.update(",
         new="    if (!on) for (const r of live) await db.pathAdaptations.update(",
         tests=[FLOW], pattern='unsafe or harmful'),
    dict(id='safety-not-written', file='src/offerFlow.ts',
         old="    if (pathWhy === 'unsafe' && outcome === 'no') {",
         new="    if (false) {",
         tests=[FLOW], pattern='unsafe or harmful'),
    dict(id='safety-twice', file=F,
         old="    if (existing.some((r) => r.path === path.id && r.key === key && r.state === 'applied')) continue\n",
         new="",
         tests=[FLOW], pattern='unsafe or harmful'),
    dict(id='path-why-on-partly', file='src/offerFlow.ts',
         old="...(pathWhy !== null && outcome === 'no' ? { pathWhy } : {}),",
         new="...(pathWhy !== null ? { pathWhy } : {}),",
         tests=[FLOW], pattern='unsafe or harmful'),
    dict(id='decline-applies', file=F,
         old="  await db.pathAdaptations.add(rowOf(path, { ...target, origin, why, state: 'declined' }, now))",
         new="  await db.pathAdaptations.add(rowOf(path, { ...target, origin, why }, now))",
         tests=[FLOW], pattern='what the record suggests'),
    dict(id='export-partner-leak', file='src/export.ts',
         old="{ pathAdaptations: (records.pathAdaptations ?? []).filter((r) => partner || r.path !== 'partner').map(",
         new="{ pathAdaptations: (records.pathAdaptations ?? []).map(",
         tests=[FLOW], pattern='the log in your record'),
    dict(id='export-missing', file='src/export.ts',
         old="            ...((records.pathAdaptations ?? []).some((r) => partner || r.path !== 'partner') ? {",
         new="            ...(false ? {",
         tests=[FLOW], pattern='the log in your record'),
    dict(id='not-synced', file='src/cloudOutbox.ts',
         old="'pathRequests', 'pathAdaptations', 'pathTests', 'pathTestDays']",
         new="'pathRequests', 'pathTests', 'pathTestDays']",
         tests=[FLOW], pattern='the log in your record'),
    # The boundaries.
    dict(id='sheet-reads-log', file='src/facts.ts',
         old="    const name = pt ? pathName(pt.path) : (aim.name ?? copy.aims.kinds[aim.kind])",
         new="    const name = pt ? pathName(pt.path) + (i.adaptations ?? []).map((r) => r.why).join('') : (aim.name ?? copy.aims.kinds[aim.kind])",
         tests=[BOUNDARY], pattern='the fact sheet'),
    dict(id='worker-reads-log', file='worker/src/retrieval.ts',
         old="      const kept = (await x.store.readRecords('notes', { from: q.from, to: q.to, ...(q.q ? { like: q.q } : {}) }, q.limit))\n        .map((r) => {\n          const text = str(obj(r.body).text).trim()",
         new="      const kept = (await x.store.readRecords('pathAdaptations', { from: q.from, to: q.to, ...(q.q ? { like: q.q } : {}) }, q.limit))\n        .map((r) => {\n          const text = str(obj(r.body).why).trim()",
         tests=[RETRIEVAL], pattern='P6'),
    # The slow loop's calls.
    dict(id='promising-design-threshold', file=T,
         old="export const PROMISING = { p: 0.95, pTwo: 0.975, weeks: 8, each: 12 } as const",
         new="export const PROMISING = { p: 0.9, pTwo: 0.975, weeks: 8, each: 12 } as const",
         tests=[STRESS], pattern='no difference: Promising in at most 5%'),
    dict(id='promising-four-weeks', file=T,
         old="export const PROMISING = { p: 0.95, pTwo: 0.975, weeks: 8, each: 12 } as const",
         new="export const PROMISING = { p: 0.95, pTwo: 0.975, weeks: 4, each: 12 } as const",
         tests=[STRESS], pattern='contradictory'),
    dict(id='two-tests-same-threshold', file=T,
         old="  const pr = twoTests ? P.pTwo : P.p",
         new="  const pr = P.p",
         tests=[TESTS], pattern='need more while two tests run'),
    dict(id='promising-no-minimum', file=T,
         old="  if (e.diff !== null && weeksDone >= P.weeks && e.n[0] >= P.each && e.n[1] >= P.each) {",
         new="  if (e.diff !== null) {",
         tests=[TESTS], pattern='say Promising only past'),
    dict(id='no-difference-no-minimum', file=T,
         old="  if (e.diff !== null && weeksDone >= N.weeks && e.n[0] >= N.each && e.n[1] >= N.each && e.pSmall >= N.p) return { kind: 'noDifference' }",
         new="  if (e.diff !== null && e.pSmall >= N.p) return { kind: 'noDifference' }",
         tests=[TESTS], pattern='say no meaningful difference only past'),
    dict(id='no-count-floor', file=T,
         old="  const v = Math.max(between, floor)",
         new="  const v = between || 1e-9",
         tests=[TESTS], pattern='never takes a spread of zero'),
    dict(id='chance-unweighted', file=T,
         old="      const w = mine.reduce((s, u) => s + 1 / u.chance, 0)\n      return mine.length ? { m: mine.reduce((s, u) => s + u.y / u.chance, 0) / w, n: mine.length } : null",
         new="      return mine.length ? { m: mine.reduce((s, u) => s + u.y, 0) / mine.length, n: mine.length } : null",
         tests=[TESTS], pattern='weights each unit by the inverse'),
    # The screens.
    dict(id='path-why-not-asked', file='src/ask.tsx',
         old="  const askPathWhy = pathRep && outcome === 'no' && why !== undefined",
         new="  const askPathWhy = false",
         tests=[E2E], pattern='answered No at the check-in'),
    dict(id='chance-after-no', file='src/ask.tsx',
         old="  const askChance = measuredRep && outcome === 'partly'",
         new="  const askChance = measuredRep && (outcome === 'partly' || (outcome === 'no' && why !== undefined))",
         tests=[E2E], pattern='answered No at the check-in'),
    dict(id='no-safety-notice', file='src/pathCard.tsx',
         old="      {forYou && <SafetyNotice path={path} rows={forYou.rows} today={p.today} />}",
         new="      {false && forYou && <SafetyNotice path={path} rows={forYou.rows} today={p.today} />}",
         tests=[E2E], pattern='answered No at the check-in'),
    dict(id='no-changes-under-details', file='src/pathCard.tsx',
         old="        {forYou && <PathChanges path={path} rows={forYou.rows} proposals={forYou.proposals} onFit={p.onFit} />}",
         new="        {false && forYou && <PathChanges path={path} rows={forYou.rows} proposals={forYou.proposals} onFit={p.onFit} />}",
         tests=[E2E], pattern='a suggestion from the record'),
    dict(id='no-details-line', file='src/pathCard.tsx',
         old="sub={suggestionsSub(forYou?.proposals.length ?? 0)}",
         new="sub={undefined}",
         tests=[E2E], pattern='a suggestion from the record'),
    dict(id='safety-toggle-on-sheet', file='src/pathAdaptUi.tsx',
         old="                {s.safety ? (",
         new="                {false ? (",
         tests=[E2E], pattern='answered No at the check-in'),
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
