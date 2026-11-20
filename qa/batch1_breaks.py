"""The forecast follow-ups, Batch 1 (agreed 2026-11-19). Each rule undone once, and the test that guards it must turn
red. Item 8, the simpler week-ahead graph: each bar as tall as its reading out of 100; the lowest days' bars marked;
nothing in the graph but the numbers and the days; the room over the highest number cropped, never the number;
under the graph, how often its forecasts land, said only from twenty scored; under Details, closed until opened, the
week's ranges from its first and last days, said when the days differ too, and how the range is built only until
twenty are scored; no caption.

Item 1, the strength phrases (2026-11-20): beside a cited test with no call yet alone; said only in a sentence that names
research, by any of its three words; the answer says "no call yet"; every grade phrase; held by Ask's validator, and
Ask's alone; Ask told the rule. Item 3, a check-in says when its forecast was moved: under one point "less than a
point"; lower or higher; a private item by its name where one is given; the evening's band named; nothing unmoved; an
unknown condition read nowhere; each condition's switch; the band of the evening before, by the forecast's own rule;
on the sheet a private item never named, the switches named, faith tagged; the Worker reading them; on the check-in
the line itself, names under the switch, the band from the evening before. Item 4: the month's read told to count
nothing itself. Item 2: the move cue reads Now afresh while its tap area stands shorter than its own.

python -B -I -X utf8 qa/batch1_breaks.py [id ...]   (every entry when none is named)
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
CH = 'src/charts.tsx'
WS = 'src/weeklyScreen.tsx'
WT = 'src/weeklyScreen.test.ts'
SMOKE = 'e2e/smoke.spec.ts'
B1 = 'e2e/batch1.spec.ts'
BS = 'src/brainShared.ts'
EST = 'src/evidenceStrength.test.ts'
FA = 'src/forecastAdjusted.ts'
FAT = 'src/forecastAdjusted.test.ts'
CR = 'src/challengerRecord.ts'
FCTS = 'src/facts.ts'
FF = 'src/forecastFlow.ts'
ALIKE = 'blind to weekdays'
DIP = 'a Monday dip'

TABLE = [
    # ---- Item 8: the graph ----------------------------------------------------------------------------------------
    dict(id='bar-as-tall-as-its-reading', file=CH, tests=[SMOKE, '-g', DIP],
         old="d={bar(i, d.expected)}",
         new="d={bar(i, 75)}"),
    dict(id='lowest-bar-marked', file=CH, tests=[SMOKE, '-g', DIP],
         old="class={isLow(i) ? 'wa-bar is-low' : 'wa-bar'}",
         new="class=\"wa-bar\""),
    dict(id='nothing-else-in-the-graph', file=CH, tests=[SMOKE, '-g', ALIKE],
         old='<line class="wa-base" x1={0} x2={W} y1={bottom} y2={bottom} />',
         new='<line class="wa-base" x1={0} x2={W} y1={bottom} y2={bottom} /><text class="wa-day" x={0} y={bottom}>100</text>'),
    dict(id='numbers-never-cropped', file=CH, tests=[SMOKE, '-g', ALIKE],
         old="y(Math.max(...values)) - VALUE_AIR - VALUE_HEIGHT - 4)",
         new="y(Math.max(...values)) - VALUE_AIR)"),
    # ---- Item 8: the card -----------------------------------------------------------------------------------------
    dict(id='details-closed-until-opened', file=WS, tests=[SMOKE, '-g', ALIKE],
         old='testid="week-ahead-details" class="week-ahead-details">',
         new='testid="week-ahead-details" class="week-ahead-details" defaultOpen>'),
    dict(id='how-often-under-the-graph', file=WS, tests=[SMOKE, '-g', ALIKE],
         old='data-testid="week-ahead-rate">\n                {rangeWords(sc)}\n',
         new='data-testid="week-ahead-rate">\n                {sizedWords(sc)}\n'),
    dict(id='no-caption', file=WS, tests=[SMOKE, '-g', ALIKE],
         old='              <WeekAhead rows={w.weekAhead} low={w.weekAheadLow} />\n            </div>\n',
         new='              <WeekAhead rows={w.weekAhead} low={w.weekAheadLow} />\n            </div>\n            <p class="note">Daily expected value with range (lower–upper).</p>\n'),
    dict(id='ranges-when-the-days-differ', file=WS, tests=[SMOKE, '-g', DIP],
         old="                {ranges && (\n",
         new="                {flat && ranges && (\n"),
    dict(id='ranges-to-the-last-day', file=WS, tests=[WT, '-t', 'from the first day with a forecast'],
         old="  const last = known[known.length - 1]\n  return { near: { lo: first.lo, hi: first.hi }, far: { lo: last.lo, hi: last.hi } }\n",
         new="  const last = known[0]\n  return { near: { lo: first.lo, hi: first.hi }, far: { lo: last.lo, hi: last.hi } }\n"),
    dict(id='how-it-is-built-until-twenty', file=WS, tests=[WT, '-t', 'under Details how the range is built'],
         old="  return sc.scored < MEASURED_FROM || sc.hitRate === null ? copy.weekly.modelBuilt : null\n",
         new="  return copy.weekly.modelBuilt\n"),
    dict(id='how-it-is-built-not-from-twenty', file=WS, tests=[SMOKE, '-g', 'once twenty day-ahead forecasts are scored'],
         old="                {w.model && sized && (\n",
         new="                {w.model && (sized || copy.weekly.modelBuilt) && (\n"),
    # ---- Item 1: a strength phrase beside a test with no call yet ---------------------------------------------------
    dict(id='strength-beside-no-call-yet-alone', file=BS, tests=[EST, '-t', 'binds only beside a cited test with no call yet'],
         old="factIds.includes(f.id) && (f.values.level ?? 'none') === 'none')",
         new="factIds.includes(f.id))"),
    dict(id='strength-said-of-research', file=BS, tests=[EST, '-t', 'lets a strength phrase stand in a sentence that names research'],
         old=".filter((s) => !RESEARCH_WORDS.test(s))",
         new=".filter(() => true)"),
    dict(id='research-named-three-ways', file=BS, tests=[EST, '-t', 'lets a strength phrase stand in a sentence that names research'],
         old="(research|studies|the library)",
         new="(research)"),
    dict(id='strength-says-no-call-yet', file=BS, tests=[EST, '-t', 'asks the answer to say'],
         old="  if (!NO_CALL_WORDS.test(text)) out.push(",
         new="  if (false) out.push("),
    dict(id='strength-every-grade-phrase', file=BS, tests=[EST, '-t', 'holds every grade phrase'],
         old="Object.values(GRADE_PHRASES).join('|')",
         new="'strong evidence'"),
    dict(id='strength-in-the-validator', file=BS, tests=[EST, '-t', 'is held by the validator'],
         old="  if (ownTests && factIds.some(isLadderFact)) out.push(...strengthRefusals(text, factIds, sheet))\n",
         new=""),
    dict(id='strength-for-ask-alone', file=BS, tests=[EST, '-t', 'is held by the validator'],
         old="  if (ownTests && factIds.some(isLadderFact)) out.push(...strengthRefusals(",
         new="  if (factIds.some(isLadderFact)) out.push(...strengthRefusals("),
    dict(id='strength-rule-told', file='worker/src/prompt.ts', tests=['worker/src/strengthRule.test.ts'],
         old="    LADDER_RULE,\n    STRENGTH_RULE,\n",
         new="    LADDER_RULE,\n"),
    # ---- Item 3: a check-in says when its forecast was moved -------------------------------------------------------
    dict(id='adjusted-under-a-point', file=FA, tests=[FAT, '-t', 'less than a point'],
         old="Math.abs(f.adj) < 1 ? c.adjustedUnder",
         new="Math.abs(f.adj) < 0.5 ? c.adjustedUnder"),
    dict(id='adjusted-lower-or-higher', file=FA, tests=[FAT, '-t', 'approved frames'],
         old="f.adj < 0 ? c.adjustedLower : c.adjustedHigher",
         new="c.adjustedLower"),
    dict(id='adjusted-private-name-where-given', file=FA, tests=[FAT, '-t', 'approved frames'],
         old="privateName(id.slice('private.'.length)) ?? c.adjustedPrivateUnnamed",
         new="c.adjustedPrivateUnnamed"),
    dict(id='adjusted-band-named', file=FA, tests=[FAT, '-t', 'approved frames'],
         old="fill(c.adjustedBand, { band: BANDS[band] })",
         new="c.adjustedBandUnread"),
    dict(id='adjusted-nothing-unmoved', file=FA, tests=[FAT, '-t', 'says nothing of a forecast that was not moved'],
         old="if (typeof f.adj !== 'number' || f.adj === 0) return null",
         new="if (typeof f.adj !== 'number') return null"),
    dict(id='adjusted-unknown-read-nowhere', file=FA, tests=[FAT, '-t', 'reads past an id'],
         old="  if (conditionCategory(id) === null) return null\n  const c = copy.summary\n",
         new="  const c = copy.summary\n"),
    dict(id='adjusted-kinds-each-condition', file=FA, tests=[FAT, '-t', 'names the Brain switch'],
         old="        const k = conditionCategory(id)\n        return k === null ? [] : [k]\n",
         new="        return ['dayRecord']\n"),
    dict(id='band-before-by-the-rule', file=CR, tests=[FAT, '-t', 'reads the band of the evening before'],
         old="  return eveningCondition(checkins).stateOn(addDays(day, -1))\n",
         new="  return eveningCondition(checkins).stateOn(day)\n"),
    dict(id='sheet-private-always-unnamed', file=FCTS, tests=[FAT, '-t', 'never its name'],
         old="const moved = adjustedWords(t.forecast, () => null, band)",
         new="const moved = adjustedWords(t.forecast, () => 'Late snack', band)"),
    dict(id='sheet-kinds-named', file=FCTS, tests=[FAT, '-t', 'never its name'],
         old="...(moved && kinds.length ? { kinds: kinds.join('|') } : {})",
         new="...({})"),
    dict(id='sheet-faith-tag', file=FCTS, tests=[FAT, '-t', 'never its name'],
         old="['forecast', t.block, ...(kinds.includes('faith') ? ['faith'] : [])]",
         new="['forecast', t.block]"),
    dict(id='worker-reads-the-kinds', file='worker/src/retrieval.ts', tests=['worker/src/forecastFactKinds.test.ts'],
         old="  if (head === 'forecast' && typeof f.values.kinds === 'string' && f.values.kinds) {\n",
         new="  if (false) {\n"),
    dict(id='forecast-unnamed-kind-closed', file='worker/src/retrieval.ts', tests=['worker/src/forecastFactKinds.test.ts'],
         old="map((k): Category => ((CATEGORIES as readonly string[]).includes(k) ? (k as Category) : CLOSED))",
         new="map((k): Category => k as Category)"),
    dict(id='check-in-adjusted-line', file='src/checkin.tsx', tests=[B1, '-g', 'under "Usually"'],
         old='      {adjusted && (\n        <p class="note no-gap" data-testid="adjusted-line">\n',
         new='      {false && (\n        <p class="note no-gap" data-testid="adjusted-line">\n'),
    dict(id='check-in-names-under-the-switch', file=FF, tests=[B1, '-g', 'named on the check-in only while'],
         old="(settings.showPrivate === true ? (names.get(id) ?? null) : null)",
         new="(names.get(id) ?? null)"),
    dict(id='check-in-band-from-the-evening-before', file=FF, tests=[B1, '-g', 'band is named as it read'],
         old="bandBefore(before, day))\n",
         new="null)\n"),
    # ---- Item 4: the month's read counts nothing itself -------------------------------------------------------------
    dict(id='month-counts-nothing', file='worker/src/monthPrompt.ts', tests=['worker/src/monthPrompt.test.ts', '-t', 'count nothing itself'],
         old="'- Count nothing yourself: ",
         new="'- Count what you like: "),
    # ---- Item 2: the move cue keeps its full height -----------------------------------------------------------------
    dict(id='cue-reads-afresh-while-shorter', file='src/moveCue.tsx', tests=[SMOKE, '-g', 'truly sits within its 48-point band'],
         old="      if (at.current && at.current.h < tall && now - scrolledAt >= SETTLE_MS) page = null\n",
         new=""),
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
