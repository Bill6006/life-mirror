"""Batch 3, item 7 (2026-11-21): the moved forecasts' check. Each forecast the challenger moves keeps the plain forecast
it was moved from; once scored, the two are set side by side, and at three looks fixed in advance (40, 80 and 120 moved
forecasts, on at least 10 days) the app reads them by a rule frozen before any real result was read, and acts on it:
"switch it off" stops the challenger. Each rule undone once, and the test that guards it must turn red.

What is read: a moved forecast with its plain forecast, scored before today, beside it: the two misses, the two ranges.
The order: by the day scored first. The looks: whole scoring days, the count, the days forecast and their floor. The
reading: the challenger's own clearance, grouped by day, none without spread; the gain per forecast; the misses; the
ranges held; read from the day after. The verdict: 2.4 either way at the first two looks, the gain alone at the third,
final once decided, the next look's count. The writer: keeps the plain row, reads the check before trying the
challenger, stops only at "switch it off"; the Weekly View carries the same check. The words, the Scorecard, the
export and the document.

python -B -I -X utf8 qa/forecast_check_breaks.py [id ...]   (every entry when none is named)
"""
import io
import os
import re
import subprocess
import sys
import time


def put_back(path, data):
    """Writes a file whole, trying again for ten seconds where Windows refuses the write for a moment (OSError 22)."""
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
NPM = 'npm.cmd' if os.name == 'nt' else 'npm'
CONFIG = os.environ.get('PW_CONFIG', 'playwright.config.ts')
MC = 'src/movedCheck.ts'
CR = 'src/challengerRecord.ts'
FF = 'src/forecastFlow.ts'
WS = 'src/weeklyScreen.tsx'
CP = 'src/copy.ts'
EX = 'src/export.ts'
DOC = 'docs/forecast-check.md'
MT = 'src/movedCheck.test.ts'
FC = 'src/forecastCheck.test.ts'
B3 = 'e2e/batch3.spec.ts'

TABLE = [
    # ---- The rule's numbers ------------------------------------------------------------------------------------------
    dict(id='looks-three', file=MC, tests=[MT],
         old="export const CHECK_LOOKS = [40, 80, 120] as const",
         new="export const CHECK_LOOKS = [40, 80, 100] as const"),
    dict(id='min-days', file=MC, tests=[MT],
         old="export const CHECK_MIN_DAYS = 10",
         new="export const CHECK_MIN_DAYS = 9"),
    dict(id='clear-bound', file=MC, tests=[MT],
         old="export const CHECK_CLEAR = 2.4",
         new="export const CHECK_CLEAR = 2.0"),
    # ---- What is read --------------------------------------------------------------------------------------------------
    dict(id='needs-plain', file=MC, tests=[MT],
         old="const plain = plainOf(f)\n    if (!plain) continue",
         new="const plain = plainOf(f) ?? { point: f.point - f.adj, lo: f.lo - f.adj, hi: f.hi - f.adj }"),
    dict(id='moved-only', file=MC, tests=[MT],
         old="if (!finite(f.adj) || f.adj === 0 || !finite(f.point)",
         new="if (!finite(f.adj) || !finite(f.point)"),
    dict(id='scored-before-today', file=MC, tests=[MT],
         old="!(s.scoredOn < today)",
         new="!(s.scoredOn <= today)"),
    dict(id='plain-miss', file=MC, tests=[MT],
         old="plainMiss: Math.abs(actual - plain.point),",
         new="plainMiss: Math.abs(actual - f.point),"),
    dict(id='moved-held-ends', file=MC, tests=[MT],
         old="held: f.lo <= actual && actual <= f.hi,",
         new="held: f.lo < actual && actual <= f.hi,"),
    dict(id='plain-held', file=MC, tests=[MT],
         old="plainHeld: plain.lo <= actual && actual <= plain.hi,",
         new="plainHeld: f.lo <= actual && actual <= f.hi,"),
    dict(id='scored-order', file=MC, tests=[MT],
         old="a.scoredOn !== b.scoredOn ? (a.scoredOn < b.scoredOn ? -1 : 1) : a.day !== b.day",
         new="a.day !== b.day"),
    # ---- The looks ------------------------------------------------------------------------------------------------------
    dict(id='whole-days', file=MC, tests=[MT],
         old="const dayEnds = i + 1 === rows.length || rows[i + 1].scoredOn !== rows[i].scoredOn",
         new="const dayEnds = true"),
    dict(id='look-count', file=MC, tests=[MT],
         old="if (dayEnds && i + 1 >= count && days.size >= CHECK_MIN_DAYS)",
         new="if (dayEnds && i + 1 > count && days.size >= CHECK_MIN_DAYS)"),
    dict(id='days-floor', file=MC, tests=[MT],
         old="if (dayEnds && i + 1 >= count && days.size >= CHECK_MIN_DAYS)",
         new="if (dayEnds && i + 1 >= count && days.size >= 1)"),
    dict(id='days-forecast', file=MC, tests=[MT],
         old="days.add(rows[i].day)",
         new="days.add(rows[i].scoredOn)"),
    # ---- The reading ----------------------------------------------------------------------------------------------------
    dict(id='clear-variance', file=MC, tests=[MT],
         old="/ (dayGains.length - 1)) * dayGains.length)",
         new="/ dayGains.length) * dayGains.length)"),
    dict(id='clear-by-day', file=MC, tests=[MT],
         old="byDay.set(r.day, (byDay.get(r.day) ?? 0) + g)",
         new="byDay.set(r.day + r.block, (byDay.get(r.day + r.block) ?? 0) + g)"),
    dict(id='clear-no-spread', file=MC, tests=[MT],
         old="clear = spread > 0 ? total / spread : null",
         new="clear = spread >= 0 ? total / spread : null"),
    dict(id='gain-per-forecast', file=MC, tests=[MT],
         old="gain: n ? total / n : 0,",
         new="gain: n ? total / dayGains.length : 0,"),
    dict(id='miss-sides', file=MC, tests=[MT],
         old="miss: n ? sum((r) => r.miss) / n : 0,",
         new="miss: n ? sum((r) => r.plainMiss) / n : 0,"),
    dict(id='held-counts', file=MC, tests=[MT],
         old="held: rows.filter((r) => r.held).length,",
         new="held: rows.filter((r) => r.plainHeld).length,"),
    dict(id='read-day-after', file=MC, tests=[MT],
         old="readOn: addDays(cut, 1),",
         new="readOn: cut,"),
    # ---- The verdict ----------------------------------------------------------------------------------------------------
    dict(id='keep-at-bound', file=MC, tests=[MT],
         old="if (r.clear !== null && r.clear >= CHECK_CLEAR) return 'keep'",
         new="if (r.clear !== null && r.clear > CHECK_CLEAR) return 'keep'"),
    dict(id='off-at-bound', file=MC, tests=[MT],
         old="if (r.clear !== null && r.clear <= -CHECK_CLEAR) return 'off'",
         new="if (r.clear !== null && r.clear < -CHECK_CLEAR) return 'off'"),
    dict(id='third-by-gain', file=MC, tests=[MT],
         old="if (r.look === 3) return r.gain > 0 ? 'keep' : 'off'",
         new="if (r.look === 3) return r.gain >= 0 ? 'keep' : 'off'"),
    dict(id='third-decides', file=MC, tests=[MT],
         old="if (r.look === 3) return r.gain > 0 ? 'keep' : 'off'",
         new="if (r.look === 4) return r.gain > 0 ? 'keep' : 'off'"),
    dict(id='final-verdict', file=MC, tests=[MT],
         old="if (verdict !== 'watch') return { scored: rows.length, reading, verdict, next: null }",
         new="if (verdict !== 'watch' && k === CHECK_LOOKS.length - 1) return { scored: rows.length, reading, verdict, next: null }"),
    dict(id='look-numbered', file=MC, tests=[MT],
         old="reading = readingOf(look.rows, (k + 1) as 1 | 2 | 3, look.cut)",
         new="reading = readingOf(look.rows, 1, look.cut)"),
    dict(id='next-look', file=MC, tests=[MT],
         old="verdict: reading ? 'watch' : null, next: CHECK_LOOKS[k] }",
         new="verdict: reading ? 'watch' : null, next: null }"),
    dict(id='stops-only-off', file=MC, tests=[FC],
         old="export const checkStopsChallenger = (c: MovedCheck): boolean => c.verdict === 'off'",
         new="export const checkStopsChallenger = (c: MovedCheck): boolean => c.verdict !== 'keep'"),
    # ---- The writer -----------------------------------------------------------------------------------------------------
    dict(id='plain-kept', file=CR, tests=[FC],
         old="    f.adjBy = a.by\n    f.plain = plain",
         new="    f.adjBy = a.by"),
    dict(id='plain-before-move', file=CR, tests=[FC],
         old="    f.plain = plain",
         new="    f.plain = { point: f.point, lo: f.lo, hi: f.hi }"),
    dict(id='writer-reads-check', file=FF, tests=[FC],
         old="const tried = chosen && challengerOn() && !(await challengerSwitchedOff(today)) ?",
         new="const tried = chosen && challengerOn() ?"),
    dict(id='writer-reads-scores', file=FF, tests=[FC],
         old="return checkStopsChallenger(movedCheck(forecasts, scores, today))",
         new="return checkStopsChallenger(movedCheck(forecasts, [], today))"),
    dict(id='weekly-carries', file=FF, tests=[FC],
         old="movedCheck: movedCheck(forecasts, scores, today),",
         new="movedCheck: movedCheck(forecasts, [], today),"),
    # ---- The Scorecard's lines --------------------------------------------------------------------------------------------
    dict(id='lines-pending', file=WS, tests=[MT],
         old=", fill(c.pending, { first: String(CHECK_LOOKS[0]), days: String(CHECK_MIN_DAYS) })]",
         new="]"),
    dict(id='lines-pending-first', file=WS, tests=[MT],
         old="first: String(CHECK_LOOKS[0])",
         new="first: String(CHECK_LOOKS[1])"),
    dict(id='lines-reading-count', file=WS, tests=[MT],
         old="return [fill(c.scored, { n }),",
         new="return [fill(c.scored, { n: String(m.scored) }),"),
    dict(id='lines-held-sides', file=WS, tests=[MT],
         old="fill(c.held, { a: String(r.held), b: String(r.plainHeld), n })",
         new="fill(c.held, { a: String(r.plainHeld), b: String(r.held), n })"),
    dict(id='lines-miss-decimals', file=WS, tests=[MT],
         old="x: r.miss.toFixed(1)",
         new="x: r.miss.toFixed(2)"),
    dict(id='lines-watching', file=WS, tests=[MT],
         old="next: String(m.next), now: String(m.scored)",
         new="next: String(m.scored), now: String(m.next)"),
    dict(id='lines-read-on', file=WS, tests=[MT],
         old="const day = dayAndMonth(r.readOn)",
         new="const day = dayAndMonth(r.cut)"),
    dict(id='lines-kept-stopped', file=WS, tests=[MT],
         old="m.verdict === 'keep' ? fill(c.kept, { day }) : fill(c.stopped, { day })",
         new="m.verdict === 'keep' ? fill(c.stopped, { day }) : fill(c.kept, { day })"),
    dict(id='scorecard-shows', file=WS, tests=[B3],
         old="{movedCheckLines(w.movedCheck).map((line) => (",
         new="{([] as string[]).map((line) => ("),
    dict(id='scorecard-under-hit-rate', file=WS, tests=[B3],
         old="            {movedCheckLines(w.movedCheck).map((line) => (\n              <p key={line} class=\"calc-line\" data-testid=\"moved-check\">\n                {line}\n              </p>\n            ))}",
         new="            <div>\n            {movedCheckLines(w.movedCheck).map((line) => (\n              <p key={line} class=\"calc-line\" data-testid=\"moved-check\">\n                {line}\n              </p>\n            ))}\n            </div>"),
    # ---- The words ----------------------------------------------------------------------------------------------------------
    dict(id='copy-scored', file=CP, tests=[MT],
         old="scored: 'Forecasts moved and scored: {n}',",
         new="scored: 'Forecasts moved so far: {n}',"),
    dict(id='copy-pending', file=CP, tests=[MT],
         old="pending: 'They are set beside the plain forecast once {first} are scored, on at least {days} days.',",
         new="pending: 'They are set beside the plain forecast once {first} are scored.',"),
    dict(id='copy-held', file=CP, tests=[MT],
         old="held: 'Range held: {a} of {n} moved, {b} of {n} plain',",
         new="held: 'Range held: {a} moved, {b} plain',"),
    dict(id='copy-miss', file=CP, tests=[MT],
         old="miss: 'Average miss: {x} moved, {y} plain',",
         new="miss: 'Average miss: {x}, against {y}',"),
    dict(id='copy-verdict', file=CP, tests=[MT],
         old="verdict: 'Read as written down beforehand: {verdict}.',",
         new="verdict: 'Read as written down: {verdict}.',"),
    dict(id='copy-verdict-words', file=CP, tests=[MT],
         old="verdicts: { keep: 'keep it', watch: 'keep watching', off: 'switch it off' },",
         new="verdicts: { keep: 'keep it', watch: 'keep watching', off: 'turn it off' },"),
    dict(id='copy-watching', file=CP, tests=[MT],
         old="watching: 'Read on {day}; read again once {next} are scored ({now} so far).',",
         new="watching: 'Read on {day}; read again later.',"),
    dict(id='copy-kept', file=CP, tests=[MT],
         old="kept: 'Read on {day}; it is not read again.',",
         new="kept: 'Read on {day}.',"),
    dict(id='copy-stopped', file=CP, tests=[MT],
         old="stopped: 'Read on {day}: forecasts written from then on are not moved.',",
         new="stopped: 'Read on {day}.',"),
    # ---- The export ---------------------------------------------------------------------------------------------------------
    dict(id='export-plain', file=EX, tests=[FC],
         old="...(p ? { plain: { point: p.point, lo: p.lo, hi: p.hi } } : {})",
         new="...({})"),
    dict(id='export-scored-on', file=EX, tests=[FC],
         old="hit: s.hit, scoredOn: s.scoredOn })),",
         new="hit: s.hit })),"),
    # ---- The document -------------------------------------------------------------------------------------------------------
    dict(id='doc-looks', file=DOC, tests=[MT],
         old="**Look 1** at 40 moved forecasts scored",
         new="**Look 1** at 50 moved forecasts scored"),
    dict(id='doc-fingerprint', file=DOC, tests=[MT],
         old="520036607665158a0e1eb92f4e015baf6015dbd5d46cfb10f66f37a63158b1c0",
         new="520036607665158a0e1eb92f4e015baf6015dbd5d46cfb10f66f37a63158b1c1"),
    dict(id='doc-words', file=DOC, tests=[MT],
         old="`Read on {day}: forecasts written from then on are not moved.`",
         new="`Read on {day}: forecasts are not moved.`"),
]


def build():
    r = subprocess.run([NPM, 'run', 'build'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit('build failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def browser(tests):
    return any(t.startswith('e2e/') for t in tests)


def run(tests):
    assert tests, 'an empty test list would run everything'
    if browser(tests):
        cmd = [NPX, 'playwright', 'test', '-c', CONFIG, '--retries', '0', *tests]
    else:
        cmd = [NPX, 'vitest', 'run', *tests]
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
            put_back(path, original)
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
