"""Item 4 of 4 (2026-10-23): Location Context's roughness, Nothing extra's meaning and the estimand's words, and Ask's
checked answers, each rule undone once: the test that guards it must turn red.

Location: a position older than a minute (Chrome's last one, given first) never knows or names a place, while it may set the
area; the quick reading may be a minute old, never five; a reading for the day watches a quarter of a minute for a better
one, a better later position replacing the earlier coarse one; 2 km or more is read as the approximate location the phone
allows and said so, with the steps to allow a precise one; less is said as the signal.
Nothing extra: no move suggested, the block lived as usual; nothing is asked of it (a passive item alongside still is); its
block closes at the next check-in with no answer written; its card says so; it is never yesterday's move. Each call is said
as suggesting the move against suggesting nothing extra; the size when done as resting on an assumption.
Ask: every reason at once, each offending word named, the surface's rules included; a line keeps its first reason alone; the
tap's "marked" is no size; every form of the help words, the association's cause words, the broad-question rule and the
sheet's rule blocks told; the retry asked to mend them all; a spent retry kept as the checks' failure with each draft's
reasons; the phone settles it as no checked answer, said by its kind, and a question naming no finding is told so.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte, the
table read as data, and an empty test list refused. A break guarded by a browser test runs Playwright against the built
folder, so the app is rebuilt after its replacement and once more after its restore.

python item4_breaks.py [id ...]
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
LF = 'src/locationFlow.ts'
LT = 'src/locationFlow.test.ts'
NE = 'src/nothingExtra.test.ts'
WA = 'worker/src/ask.test.ts'
AF = 'src/ask/flow.test.ts'
AT = 'src/ask/ask.test.ts'
S = 'e2e/smoke.spec.ts'
AS = 'e2e/ask.spec.ts'
BS = 'src/brainShared.ts'
STALE = 'takes a position older than a minute'
STALE_NAME = 'names nothing from a position older than a minute'
WATCH = 'watches when the quick reading is too rough'
ROUGH = 'reads 2 km or more as the approximate location'
APPROX = 'says an approximate location as such'
HEARD = 'keeps how rough the last reading was in memory alone'
APPROX_UI = 'naming a place on a phone that gives only an approximate location'
ASKS_NOTHING = 'never brings a Nothing extra block to a check-in'
CLOSES = 'closes an earlier Nothing extra at the next check-in'
NE_UI = 'Nothing extra asks nothing'
WORDS = 'says ordinary life goes ahead'
ESTIMAND_WORDS = 'says each call is on suggesting the move'
ALL_AT_ONCE = 'refuses a draft for every reason at once'
MARKED = 'reads "marked" as a size only in its size sense'
LINE_FIRST = 'lets a line keep its first reason alone'
TOLD = 'tells Claude every form of the help words'
BLOCKS = 'carries the rule blocks the Brain'
SETTLE = 'settles a turn whose answer says failed as no checked answer'
PARSE = 'keeps a failure’s kind and each draft’s reasons'
BESIDE = 'names the findings its words name; a question naming none'
FAILED_UI = 'no checked answer is said plainly by its kind'
BROAD_UI = 'a broad question with no checked answer'

TABLE = [
    # ---- Location Context ----------------------------------------------------------------------------------
    dict(id='loc-stale-marked', file=LF,
         old="  return typeof p.timestamp === 'number' && Date.now() - p.timestamp > FRESH_MS ? { ...fix, stale: true } : fix\n",
         new="  return fix\n",
         tests=[LT], pattern=STALE_NAME),
    dict(id='loc-stale-knows-no-place', file=LF,
         old="  if (fix.accuracy > PLACE_ACCURACY || fix.stale) return null\n",
         new="  if (fix.accuracy > PLACE_ACCURACY) return null\n",
         tests=[LT], pattern=STALE),
    dict(id='loc-watch-skips-stale', file=LF,
         old="        if (f.stale) return\n",
         new="",
         tests=[LT], pattern=STALE_NAME),
    dict(id='loc-quick-a-minute', file=LF,
         old="{ enableHighAccuracy: false, maximumAge: FRESH_MS, timeout: timeoutMs }",
         new="{ enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: timeoutMs }",
         tests=[LT], pattern=WATCH),
    dict(id='loc-passive-watch', file=LF,
         old="  const watched = await watchForFix(PASSIVE_WAIT_MS)\n  if (watched.error === 'denied') return { error: 'denied' }\n  return watched.fix && (quick.stale || watched.fix.accuracy < quick.accuracy) ? watched.fix : quick\n",
         new="  return quick\n",
         tests=[LT], pattern=WATCH),
    dict(id='loc-better-later-replaces', file=LF,
         old="        if (!fix || f.accuracy < fix.accuracy) fix = f\n",
         new="        if (!fix) fix = f\n",
         tests=[LT], pattern=WATCH),
    dict(id='loc-approximate-class', file=LF,
         old="accuracy >= APPROXIMATE_ACCURACY ? 'approximate' : 'rough'",
         new="'rough'",
         tests=[LT], pattern=ROUGH),
    dict(id='loc-naming-approximate', file=LF,
         old="    if (seen.length && Math.min(...seen) >= APPROXIMATE_ACCURACY) return 'approximate'\n",
         new="",
         tests=[LT], pattern=APPROX),
    dict(id='loc-heard', file=LF,
         old="  if ('error' in fix) return null\n  heard(fix.accuracy)\n  return sense(fix, now)\n",
         new="  if ('error' in fix) return null\n  return sense(fix, now)\n",
         tests=[LT], pattern=HEARD),
    dict(id='loc-ui-help', file='src/locationScreen.tsx',
         old="      {on && approximate && <PreciseHelp accuracy={approximate.accuracy} />}\n",
         new="",
         tests=[S], pattern=APPROX_UI),
    dict(id='loc-ui-reading-approximate', file='src/locationScreen.tsx',
         old="roughnessOf(accuracy) === 'approximate' ? c.readingApproximate : c.readingRough",
         new="c.readingRough",
         tests=[S], pattern=APPROX_UI),
    # ---- Nothing extra and the estimand ----------------------------------------------------------------------
    dict(id='ne-not-pending', file='src/offerFlow.ts',
         old="      if (o.moveId === NOTHING) return o.passiveId !== null && (!x || x.passiveOutcome === null)\n",
         new="",
         tests=[NE], pattern=ASKS_NOTHING),
    dict(id='ne-closes', file='src/offerFlow.ts',
         old="    for (const o of open) await db.offers.update(o.id as number, { closedAt: now.toISOString() })\n",
         new="",
         tests=[NE], pattern=CLOSES),
    dict(id='ne-closes-earlier-only', file='src/offerFlow.ts',
         old="compareSlots(o, before) < 0",
         new="compareSlots(o, before) <= 0",
         tests=[NE], pattern=CLOSES),
    dict(id='ne-checkin-closes', file='src/checkin.tsx',
         old="    void closeNothingExtra({ day, block })\n",
         new="",
         tests=[S], pattern=NE_UI),
    dict(id='ne-passive-alone', file='src/ask.tsx',
         old="  const passiveOnly = passive !== null && (nothing || (existing !== null && existing.passiveOutcome === null))",
         new="  const passiveOnly = existing !== null && passive !== null && existing.passiveOutcome === null",
         tests=[S], pattern=NE_UI),
    dict(id='ne-card-says', file='src/moveCard.tsx',
         old="{nothing ? c.nothingAfter : c.pending}",
         new="{c.pending}",
         tests=[S], pattern=NE_UI),
    dict(id='ne-never-yesterdays-move', file='src/forecastFlow.ts',
         old=" && o.moveId !== NOTHING)",
         new=")",
         tests=['src/postWindowGated.test.ts'], pattern='builds the same sheet'),
    dict(id='ne-words', file='src/copy.ts',
         old="    nothingWhat: 'No extra move this block: live it as you normally would. Your plans, work, parenting, church, errands and anything spontaneous all go ahead as usual.',\n",
         new="    nothingWhat: 'On purpose. Nothing extra this block; the record will show what that does.',\n",
         tests=[NE], pattern=WORDS),
    dict(id='est-fact-suggested', file='src/repair/facts.ts',
         old="  const suggested = t.itt !== null ? `; when suggested, ${signed(t.itt)} steps against nothing extra` : ''\n",
         new="  const suggested = ''\n",
         tests=['src/repair/facts.test.ts'], pattern='one test: its id, rung, counts, estimate and research'),
    dict(id='est-fact-assumption', file='src/repair/facts.ts',
         old=", assuming it works only through doing it` : ''\n",
         new="` : ''\n",
         tests=['src/repair/facts.test.ts'], pattern='one test: its id, rung, counts, estimate and research'),
    dict(id='est-evidence-itt', file='src/repair/evidence.ts',
         old="      itt: c.itt,\n",
         new="      itt: null,\n",
         tests=['src/repair/evidence.test.ts'], pattern='a strong effect of the walk on stress'),
    dict(id='est-words-intro', file='src/copy.ts',
         old=" Each call says what suggesting the move did, against suggesting nothing extra, whatever was then done; only those draws can make a call established.",
         new=" Only those draws can make a call established.",
         tests=[NE], pattern=ESTIMAND_WORDS),
    # ---- Ask ------------------------------------------------------------------------------------------------
    dict(id='ask-every-reason', file=BS,
         old="...refusals(own, cited.factIds, cited.cardIds, sheet, cited.admitted, Number.POSITIVE_INFINITY, evidence, true, true), firmnessRefusal(own)",
         new="...refusals(own, cited.factIds, cited.cardIds, sheet, cited.admitted, Number.POSITIVE_INFINITY, evidence, true, true).slice(0, 1), firmnessRefusal(own)",
         tests=[WA], pattern=ALL_AT_ONCE),
    dict(id='ask-every-word', file=BS,
         old="  if (factIds.some(isLadderFact)) out.push(...ladderWordingRefusals(text, factIds, sheet, all))\n",
         new="  if (factIds.some(isLadderFact)) out.push(...ladderWordingRefusals(text, factIds, sheet))\n",
         tests=[WA], pattern=ALL_AT_ONCE),
    dict(id='ask-surface-too', file='worker/src/ask.ts',
         old="  if (verdict.ok || draft) {\n",
         new="  if (verdict.ok) {\n",
         tests=[WA], pattern=ALL_AT_ONCE),
    dict(id='ask-mend', file='worker/src/ask.ts',
         old=", ...(spent ? {} : { mend: ASK_MEND })",
         new="",
         tests=[WA], pattern=ALL_AT_ONCE),
    dict(id='ask-failed-reasons-kept', file='worker/src/ask.ts',
         old="noAnswer(deps.store, turn, verdict.reason, deps.now, 'checks', [...t.refusals, verdict.reason])",
         new="noAnswer(deps.store, turn, verdict.reason, deps.now, 'checks')",
         tests=[WA], pattern=ALL_AT_ONCE),
    dict(id='ask-marked-no-size', file=BS,
         old=r"considerabl[ey]|markedly|substantial(?:ly)?",
         new=r"considerabl[ey]|marked(?:ly)?|substantial(?:ly)?",
         tests=[WA], pattern=MARKED),
    dict(id='ask-line-first-reason', file=BS,
         old="  return refusals(text, factIds, cardIds, sheet, admitted, maxWords, evidence, ownTests)[0] ?? null\n",
         new="  return refusals(text, factIds, cardIds, sheet, admitted, maxWords, evidence, ownTests).join('; and ') || null\n",
         tests=[WA], pattern=LINE_FIRST),
    dict(id='ask-told-help-forms', file='worker/src/prompt.ts',
         old="in every form listed and anywhere in the answer, as a claim that a move helps: ${HELP_FORMS.join(', ')}.",
         new="anywhere in the answer, as a claim that a move helps: help, helps, helped, helping, lifts, eases, calms, improves, boosts and works.",
         tests=[WA], pattern=TOLD),
    dict(id='ask-told-cause-words', file='worker/src/prompt.ts',
         old="(gave you, made you, kept you, left you, cost you, lifted you, helped you and the like)",
         new="",
         tests=[WA], pattern=TOLD),
    dict(id='ask-told-broad', file='worker/src/prompt.ts',
         old=" A broad question (what you notice, what they might be missing, what to watch, what is changing) asks for a synthesis: choose the two or three findings that matter most for them now, say each at its rung, say plainly where the record is still thin, and never walk through every fact.",
         new="",
         tests=[WA], pattern=TOLD),
    dict(id='ask-rule-blocks', file='worker/src/ask.ts',
         old="  ].join('\\n\\n') + sheetRules(run.sheet)\n",
         new="  ].join('\\n\\n')\n",
         tests=[WA], pattern=BLOCKS),
    dict(id='ask-settle-failed', file='src/ask/flow.ts',
         old="      if (a.status === 'failed' && (cur.state === 'waiting' || cur.state === 'answered')) await db.askTurns.put(",
         new="      if (false && (cur.state === 'waiting' || cur.state === 'answered')) await db.askTurns.put(",
         tests=[AF], pattern=SETTLE),
    dict(id='ask-settle-sets-right', file='src/ask/flow.ts',
         old="(t.state === 'waiting' || (t.state === 'answered' && by.get(t.id as number)?.status === 'failed'))",
         new="t.state === 'waiting'",
         tests=[AF], pattern=SETTLE),
    dict(id='ask-parse-kind', file='src/cloudSync.ts',
         old="      ...(r.status === 'failed' && (r.kind === 'checks' || r.kind === 'runs' || r.kind === 'waited') ? { kind: r.kind } : {}),\n",
         new="",
         tests=[AF], pattern=PARSE),
    dict(id='ask-beside-calls', file='src/ask/match.ts',
         old="  return calls.length ? { kind: 'calls', tests: calls } : { kind: 'none', tests: [] }\n",
         new="  return { kind: 'none', tests: [] }\n",
         tests=[AT], pattern=BESIDE),
    dict(id='ask-ui-kind', file='src/ask/askScreen.tsx',
         old="{kind === 'waited' ? fill(c.failedWaited, { n: String(ASK_WAITS_DAYS) }) : kind === 'runs' ? fill(c.failedRuns, { n: String(ASK_TRIES) }) : c.failedChecks}",
         new="{c.failedChecks}",
         tests=[AS], pattern=BROAD_UI),
    dict(id='ask-ui-reasons', file='src/ask/askScreen.tsx',
         old="      {reasons.length > 0 && (\n",
         new="      {false && (\n",
         tests=[AS], pattern=FAILED_UI),
    dict(id='ask-ui-unnamed', file='src/ask/askScreen.tsx',
         old="{beside.kind === 'named' ? c.matchesTitle : beside.kind === 'calls' ? c.matchesUnnamed : c.matchesNoCalls}",
         new="{c.matchesTitle}",
         tests=[AS], pattern=BROAD_UI),
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
