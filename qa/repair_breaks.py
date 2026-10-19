"""The learning repair, stages R1 to R4 (2026-10-19), each rule undone once: the test that guards it must turn red.

R1, the engine: the app's copy of the judged engine (src/repair/engine.ts), whose replay of a draw creates its tests in the
order a live draw does and carries the week's fits. Guarded by the equivalence harness (stress/equivalence.ts), which runs
the stress test's people through the judged engine and the app's, live, replayed, and rebuilt from app-shaped records.

R3, the learning week (2026-10-19): an invitation stands while unanswered; a week counts its days; the owner's answers
are read back from the day's record, and an answer makes the day's record when it has none yet; the week's line on Now
follows the switch; the invitation's controls keep their size in every theme; and the preview opens only in an automated
test browser.

R4, the screens (2026-10-19): the engine's track record of its own calls (requirement 15): a call kept once, held when
its test reaches a higher rung in its direction or an established call stands sixty days, not held when its test turns
or an established call is withdrawn, and kept every day; the thresholds: ten resolved before a rung can move, tightened
on the exact interval and returned when calls hold, the allowed error halved, the rule run each day and on in the app
alone, and every call reading the thresholds in force; and the screens: a test whose call did not hold marked revised
(general calls only), the tests the queue runs first and always shown, open calls counted, one rebuild per record, and
Evidence, the move card's rung and test words, the Moves door and the Legend following the switch.

R2, the record and the draw: what counts as a randomized decision (a check-in's own draw, every chance kept, nothing extra
among its candidates, not set aside); what an answer means (a skip is a seen No, Not home stays out, answers from before
the seen mark count as seen); the day's context (short sleep from the morning's anchor, daycare from a pickup); a rebuild
that stops before a new draw's slot; and, behind the switch, the draw in the app: a replacement after a skip stays
today's, the candidates and chances recorded are the engine's, and the draw carries the repair's version. The switch
itself ships gated.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by the harness rebuilds its bundle, and one
guarded by a browser test rebuilds the app, after the replacement and after the restore.

python repair_breaks.py [id ...]
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
HARNESS = 'harness'
PEOPLE = '2'

E = 'src/repair/engine.ts'
R = 'src/repair/record.ts'
OF = 'src/offerFlow.ts'
BS = 'src/brainShared.ts'
RT = 'src/repair/record.test.ts'
FT = 'src/repair/flow.test.ts'
WT = 'src/repair/week.test.ts'
GT = 'src/repair/gate.test.ts'
RS = 'e2e/repair.spec.ts'
TH = 'e2e/themes.spec.ts'
EV = 'src/repair/evidence.ts'
TT = 'src/repair/track.test.ts'
ET = 'src/repair/evidence.test.ts'
ES = 'src/evidenceScreen.tsx'
MC = 'src/moveCard.tsx'
MS = 'src/movesScreen.tsx'
LG = 'src/legend.tsx'
FL = 'src/repair/flow.ts'
WL = 'src/repair/weekLine.tsx'
GA = 'src/repair/gate.ts'

TABLE = [
    dict(id='replay-test-order', file=E, tests=[HARNESS],
         old="    if (!week) for (const id of real) this.testFor(id, target, windowOfMove(id, target))",
         new="    void week"),
    dict(id='replay-week-fits', file=E, tests=[HARNESS],
         old="      if (tt && tt.lwDays[tt.lwDays.length - 1] !== d) tt.lwDays.push(d)",
         new="      void tt"),
    dict(id='record-responds', file=R, tests=[HARNESS],
         old="      engine.respond(id, responseOf(o, outcomeOf.get(o.id as number)))",
         new="      void responseOf"),
    dict(id='draw-needs-nothing', file=R, tests=[RT],
         old="o.candidates.includes(NOTHING) && ",
         new=""),
    dict(id='draw-not-set-aside', file=R, tests=[RT],
         old=" && !setAside(o)",
         new=""),
    dict(id='not-home-stays-out', file=R, tests=[RT],
         old="    if (o.skipReason === 'notHome') return { seen: false, did: null, why: null, answered: false }\n",
         new=""),
    dict(id='old-answers-seen', file=R, tests=[RT],
         old=" || (answered && outcome?.seen === undefined)",
         new=""),
    dict(id='short-sleep-anchor', file=R, tests=[RT],
         old="export const SHORT_SLEEP_ANCHOR = 2",
         new="export const SHORT_SLEEP_ANCHOR = 3"),
    dict(id='daycare-from-pickup', file=R, tests=[RT],
         old="    daycare: rec?.pickupTime !== null && rec?.pickupTime !== undefined,",
         new="    daycare: false,"),
    dict(id='stop-before-slot', file=R, tests=[RT],
         old="      if (d === last && b === stopBefore) return { engine, epoch, index, ids }\n",
         new=""),
    dict(id='replacement-stays-today', file=OF, tests=[FT],
         old="repairOn() && !replacing ?",
         new="repairOn() ?"),
    dict(id='engine-candidates-kept', file=OF, tests=[FT],
         old="    const drawnFrom = made ? made.offer.candidates : set.candidates.map((c) => c.id)",
         new="    const drawnFrom = set.candidates.map((c) => c.id)"),
    dict(id='repair-version-kept', file=OF, tests=[FT],
         old="      draw: made ? { ...drawRecord, engine: REPAIR_ENGINE } : drawRecord,",
         new="      draw: drawRecord,"),
    dict(id='switch-ships-gated', file=BS, tests=[RT],
         old="export const LEARNING_REPAIR: 'gated' | 'open' = 'gated'",
         new="export const LEARNING_REPAIR: 'gated' | 'open' = 'open'"),
    dict(id='invitation-stands', file=E, tests=[WT],
         old="      this.invitationDue = d\n      return",
         new="      return"),
    dict(id='week-counts-days', file=FL, tests=[WT],
         old="weekDay: d < until ? d - (until - length) + 1 : null }",
         new="weekDay: d < until ? 1 : null }"),
    dict(id='answers-read-back', file=FL, tests=[RS],
         old="weekAnswers: new Map(days.filter((d) => d.weekAnswer).map((d) => [d.day, d.weekAnswer === 'yes'])) }",
         new="weekAnswers: new Map() }"),
    dict(id='week-line-follows-switch', file=WL, tests=[RS],
         old="  const state = useLive(() => (on ? weekState(day) : Promise.resolve(null)), [day, on])",
         new="  const state = useLive(() => weekState(day), [day, on])"),
    dict(id='preview-needs-automation', file=GA, tests=[GT],
         old="navigator.webdriver === true && ",
         new=""),
    dict(id='answer-makes-the-day', file=FL, tests=[FT],
         old="  await ensureDayContext(today, await getSettings())\n",
         new=""),
    dict(id='week-invite-targets', file=WL, tests=[TH, '-g', 'learning week'],
         old='class="pill-quiet" data-testid="week-yes"',
         new='data-testid="week-yes"'),
    dict(id='track-held-higher', file=E, tests=[TT],
         old="    else if (RUNG_RANK[level] > RUNG_RANK[c.rung] && direction === c.direction) held = true\n",
         new=""),
    dict(id='track-other-direction', file=E, tests=[TT],
         old="    if (level !== 'none' && direction !== c.direction) held = false\n",
         new="    if (level === 'established' && direction !== c.direction) held = false\n"),
    dict(id='track-withdrawn', file=E, tests=[TT],
         old="    else if (c.rung === 'established' && revisedOn !== null && revisedOn > c.day) held = false\n",
         new=""),
    dict(id='track-stands-sixty', file=E, tests=[TT],
         old="export const TRACK_STANDS = 60",
         new="export const TRACK_STANDS = 59"),
    dict(id='track-once', file=E, tests=[TT],
         old=" && !still.some((c) => c.direction === direction && RUNG_RANK[c.rung] >= RUNG_RANK[level])",
         new=""),
    dict(id='track-kept-daily', file=E, tests=[ET],
         old="    this.trackDay(d)\n",
         new=""),
    dict(id='tighten-needs-ten', file=E, tests=[TT],
         old="export const TRACK_ENOUGH = 10",
         new="export const TRACK_ENOUGH = 9"),
    dict(id='tighten-on-the-interval', file=E, tests=[TT],
         old="    else out[r] = heldUpper(k, n) < TESTED_RATES[r]",
         new="    else out[r] = k / n < TESTED_RATES[r]"),
    dict(id='tighten-returns', file=E, tests=[TT],
         old="    else if (before[r]) out[r] = k / n < TESTED_RATES[r]",
         new="    else if (before[r]) out[r] = true"),
    dict(id='thresholds-halve', file=E, tests=[TT],
         old="    early: tight.early ? 1 - (1 - cfg.tauEarly) / 2 : cfg.tauEarly,",
         new="    early: cfg.tauEarly,"),
    dict(id='rule-each-day', file=E, tests=[TT],
         old="    if (this.cfg.trackRule) this.tighten()\n",
         new=""),
    dict(id='rule-on-in-the-app', file=E, tests=[TT],
         old="export const IN_APP: BConfig = { ...REPAIR, trackRule: true }",
         new="export const IN_APP: BConfig = { ...REPAIR, trackRule: false }"),
    dict(id='established-rate-read', file=E, tests=[TT],
         old="    const estScale = rungThresholds(cfg, this.tight).estScale",
         new="    const estScale = 1"),
    dict(id='likely-probability-read', file=E, tests=[TT],
         old="      const likely = rung(rates.likely, this.tauOf('likely'))",
         new="      const likely = rung(rates.likely, cfg.tauLikely)"),
    dict(id='early-probability-read', file=E, tests=[TT],
         old="      const early = likely ? null : rung(rates.early, this.tauOf('early'))",
         new="      const early = likely ? null : rung(rates.early, cfg.tauEarly)"),
    dict(id='revised-general-only', file=EV, tests=[ET],
         old="c.held === false && c.ctx === null",
         new="c.held === false"),
    dict(id='revised-from-the-record', file=EV, tests=[TT],
         old="      revised: c.revised || notHeld.has(t.key),",
         new="      revised: c.revised,"),
    dict(id='running-first', file=EV, tests=[ET],
         old="Number(b.running) - Number(a.running) || ",
         new=""),
    dict(id='open-counted', file=EV, tests=[ET],
         old="open: mine.filter((c) => c.held === null).length",
         new="open: 0"),
    dict(id='running-shown', file=EV, tests=[ET],
         old="  const shown = all.filter((t) => t.running || t.level !== 'none')",
         new="  const shown = all.filter((t) => t.level !== 'none')"),
    dict(id='rebuild-follows-the-record', file=R, tests=[ET],
         old="  const key = `${through}|${fingerprint(JSON.stringify([r.checkins, r.offers, r.outcomes, r.days, [...r.weekAnswers]]))}`",
         new="  const key = through"),
    dict(id='evidence-follows-switch', file=ES, tests=[RS],
         old="  const repair = repairOn()\n  const r = copy.repairEvidence",
         new="  const repair = false\n  const r = copy.repairEvidence"),
    dict(id='move-card-rung', file=MC, tests=[RS],
         old="                  {rungWords(rung?.level ?? 'none', rung?.direction ?? null)}",
         new="                  {copy.evidence.tiers.little}"),
    dict(id='move-card-test-words', file=MC, tests=[RS],
         old="          {repair\n            ? offer.kind === 'pickup'",
         new="          {false\n            ? offer.kind === 'pickup'"),
    dict(id='moves-door-words', file=MS, tests=[RS],
         old="repairOn() ? copy.repairEvidence.door",
         new="false ? copy.repairEvidence.door"),
    dict(id='legend-rungs', file=LG, tests=[RS],
         old="repairOn() ? copy.repairEvidence.legendConclusions",
         new="false ? copy.repairEvidence.legendConclusions"),
]


def bundle():
    r = subprocess.run([NPX, 'esbuild', 'stress/equivalence.ts', '--bundle', '--platform=node', '--format=esm', '--outfile=stress/.out/equivalence.mjs', '--log-level=warning'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit('bundle failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def build():
    r = subprocess.run([NPM, 'run', 'build'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit('build failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def browser(tests):
    return any(t.startswith('e2e/') for t in tests)


def run(tests):
    assert tests, 'an empty test list would run everything'
    if browser(tests):
        r = subprocess.run([NPX, 'playwright', 'test', '-c', CONFIG, '--retries', '0', *tests], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
        out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
        passed = int(m.group(1)) if (m := re.search(r'(\d+) passed', out)) else 0
        failed = int(m.group(1)) if (m := re.search(r'(\d+) failed', out)) else 0
        return r.returncode, failed, passed, out
    if tests == [HARNESS]:
        bundle()
        r = subprocess.run(['node', 'stress/.out/equivalence.mjs', PEOPLE], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
        out = r.stdout + r.stderr
        same = len(re.findall(r'^SAME ', out, re.M))
        different = len(re.findall(r'^DIFFERENT [a-z-]+:', out, re.M))
        return r.returncode, different, same, out
    r = subprocess.run([NPX, 'vitest', 'run', *tests], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
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
        code, failed, passed, out = run(t['tests'])
        if code != 0 or passed == 0:
            results.append((t['id'], f'NO GREEN BASELINE (exit {code}, {passed} passed)'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        try:
            io.open(path, 'wb').write(text.replace(t['old'], t['new']).encode('utf-8'))
            if browser(t['tests']):
                build()
            code2, failed2, passed2, out2 = run(t['tests'])
        finally:
            io.open(path, 'wb').write(original)
            if t['tests'] == [HARNESS]:
                bundle()
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
