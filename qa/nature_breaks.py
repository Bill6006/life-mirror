"""Time in nature (item 2 of 4, 2026-10-21), each rule undone once: the test that guards it must turn red.

The evening's mark is "20+ min in nature today, in total": 20 minutes or more in nature in the day, separate periods adding
up, never a negative period. Walk somewhere green done counts the day by itself; partly done, another outdoor move, or a
move before the definition's start does not; moves' minutes in nature add up. No day before 2026-10-21 is a nature day,
and none enters either side. The sheet compares the evening of and the morning after, tagged nature, with the minutes in
the values; the chip's answer says them only where a matched band exists; the older Outside a while today has no
comparison and is never offered back; the daylight card leaves nature. Last night and best days read the same day mark.
The association is never said as a cause. On the check-in: the label's words, what counts one tap away, and Walk somewhere
green done shown as counting the day. The export carries the new mark beside the old.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by a browser test runs Playwright against the
built folder, so the app is rebuilt after its replacement and once more after its restore.

python nature_breaks.py [id ...]
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
N = 'src/nature.test.ts'
AU = 'src/audit.test.ts'
EXP = 'src/export.test.ts'
S = 'e2e/smoke.spec.ts'
NT = 'src/nature.ts'
WALK = 'Walk somewhere green done counting the day'

TABLE = [
    dict(id='n-threshold', file=NT,
         old="export const NATURE_MINUTES = 20\n",
         new="export const NATURE_MINUTES = 15\n",
         tests=[N], pattern='is 20 minutes or more'),
    dict(id='n-adds-up', file=NT,
         old="  return periods.reduce((sum, m) => sum + Math.max(0, m), 0) >= NATURE_MINUTES\n",
         new="  return Math.max(0, ...periods) >= NATURE_MINUTES\n",
         tests=[N], pattern='is 20 minutes or more'),
    dict(id='n-never-negative', file=NT,
         old="  return periods.reduce((sum, m) => sum + Math.max(0, m), 0) >= NATURE_MINUTES\n",
         new="  return periods.reduce((sum, m) => sum + m, 0) >= NATURE_MINUTES\n",
         tests=[N], pattern='is 20 minutes or more'),
    dict(id='n-since', file=NT,
         old="export const NATURE_SINCE = '2026-10-21'\n",
         new="export const NATURE_SINCE = '2026-01-01'\n",
         tests=[N], pattern='never reads Outside a while today'),
    dict(id='n-evening-date', file=NT,
         old="  return c.day >= NATURE_SINCE && (Boolean(c.extras?.nature) || moveDays.has(c.day))\n",
         new="  return Boolean(c.extras?.nature) || moveDays.has(c.day)\n",
         tests=[N], pattern='never reads Outside a while today'),
    dict(id='n-known-date', file=NT,
         old="  return c.day >= NATURE_SINCE && (chipShownAt('nature', c) || moveDays.has(c.day))\n",
         new="  return chipShownAt('nature', c) || moveDays.has(c.day)\n",
         tests=[N], pattern='never reads Outside a while today'),
    dict(id='n-moves-done-only', file=NT,
         old="    if (x.outcome !== 'done' || !moves.includes(x.moveId) || x.day < NATURE_SINCE) continue\n",
         new="    if (x.outcome === 'no' || !moves.includes(x.moveId) || x.day < NATURE_SINCE) continue\n",
         tests=[N], pattern='counts Walk somewhere green done'),
    dict(id='n-moves-since', file=NT,
         old="    if (x.outcome !== 'done' || !moves.includes(x.moveId) || x.day < NATURE_SINCE) continue\n",
         new="    if (x.outcome !== 'done' || !moves.includes(x.moveId)) continue\n",
         tests=[N], pattern='counts Walk somewhere green done'),
    dict(id='n-moves-list', file=NT,
         old="export const NATURE_MOVES: readonly string[] = ['green-walk']\n",
         new="export const NATURE_MOVES: readonly string[] = ['green-walk', 'walk-ten']\n",
         tests=[N], pattern='counts Walk somewhere green done'),
    dict(id='n-moves-add', file=NT,
         old="    byDay.set(x.day, [...(byDay.get(x.day) ?? []), minutesOf(x.moveId)])\n",
         new="    byDay.set(x.day, [minutesOf(x.moveId)])\n",
         tests=[N], pattern='counts Walk somewhere green done'),
    dict(id='n-answer-evening-matched', file=NT,
         old="      : e.without.mean === null || e.diff === null\n",
         new="      : e.without.mean === null\n",
         tests=[N], pattern='answers the tap'),
    dict(id='n-answer-morning-matched', file=NT,
         old="  return m.withEvent.mean !== null && m.without.mean !== null && m.diff !== null ? `${first}",
         new="  return m.withEvent.mean !== null && m.without.mean !== null ? `${first}",
         tests=[N], pattern='answers the tap'),
    dict(id='n-facts-evening', file='src/facts.ts',
         old="assocFact('assoc.nature', ['nature'], NATURE_EVENT, nature.evening, 'Evenings of'), ",
         new="",
         tests=[N], pattern='compares the evening of and the morning after'),
    dict(id='n-facts-tag', file='src/facts.ts',
         old="assocFact('assoc.nature.morning', ['nature'],",
         new="assocFact('assoc.nature.morning', [],",
         tests=[N], pattern='compares the evening of and the morning after'),
    dict(id='n-facts-minutes', file='src/facts.ts',
         old="if (f) facts.push({ ...f, values: { ...f.values, minutes: NATURE_MINUTES } })",
         new="if (f) facts.push(f)",
         tests=[N], pattern='compares the evening of and the morning after'),
    dict(id='n-daylight-untagged', file='src/library.json',
         old='independently of exercise.",\n    "domain": "mood",\n    "tags": [\n      "light",\n      "mood",\n      "morning"\n    ],',
         new='independently of exercise.",\n    "domain": "mood",\n    "tags": [\n      "light",\n      "mood",\n      "morning",\n      "nature"\n    ],',
         tests=[N], pattern='draws only the library'),
    dict(id='n-no-cause', file='src/brainShared.ts',
         old="  if (factIds.some(isAssociationFact)) {\n",
         new="  if (false) {\n",
         tests=[N], pattern='never a cause'),
    dict(id='n-last-night-tap', file='src/forecastFlow.ts',
         old="  if (ex.nature || natureDay) keys.push('nature')\n",
         new="  if (natureDay) keys.push('nature')\n",
         tests=[N], pattern='reads last night by the same day mark'),
    dict(id='n-last-night-move', file='src/forecastFlow.ts',
         old="lastNightKeys(eve, ctxByDay.get(yesterday), outside.has(yesterday), natureMoves.has(yesterday))",
         new="lastNightKeys(eve, ctxByDay.get(yesterday), outside.has(yesterday))",
         tests=[N], pattern='reads last night by the same day mark'),
    dict(id='n-best-days-move', file='src/weekly.ts',
         old="('20+ minutes in nature', (d) => Boolean(evening(d)?.extras?.nature) || natureMoves.has(d)))",
         new="('20+ minutes in nature', (d) => Boolean(evening(d)?.extras?.nature)))",
         tests=[N], pattern='among best days'),
    dict(id='n-best-days-since', file='src/weekly.ts',
         old="controlled.push(countOver((d) => d >= NATURE_SINCE && (",
         new="controlled.push(countOver((d) => (",
         tests=[N], pattern='among best days'),
    dict(id='n-shown-by-tap', file='src/chips.ts',
         old="(key === 'nature' && ex?.nature) || ",
         new="",
         tests=[AU], pattern='reads a tap as shown'),
    dict(id='n-offered', file='src/audit.ts',
         old="'napped', 'nature', 'sweet', 'shower',",
         new="'napped', 'sweet', 'shower',",
         tests=[N], pattern='says the rule in a short label'),
    dict(id='n-label', file='src/copy.ts',
         old="    nature: '20+ min in nature today, in total',\n",
         new="    nature: 'Outside a while today',\n",
         tests=[N], pattern='says the rule in a short label'),
    dict(id='n-what-text', file='src/copy.ts',
         old="Separate times add up.',\n    natureFromMove",
         new="',\n    natureFromMove",
         tests=[N], pattern='says the rule in a short label'),
    dict(id='n-export', file='src/export.ts',
         old="      natureToday: Boolean(c.extras?.nature),\n",
         new="      natureToday: false,\n",
         tests=[EXP], pattern='carries time in nature as its own mark'),
    dict(id='n-chip-from-move', file='src/extras.tsx',
         old="            const fromMove = key === 'nature' && !ex.nature ? natureMoveToday(outcomes, day) : null\n",
         new="            const fromMove = null as string | null\n",
         tests=[S], pattern=WALK),
    dict(id='n-chip-what', file='src/extras.tsx',
         old="                {key === 'nature' && (\n                  <button type=\"button\" class=\"textbtn faint nature-what\"",
         new="                {false && (\n                  <button type=\"button\" class=\"textbtn faint nature-what\"",
         tests=[S], pattern=WALK),
    dict(id='n-chip-kept-together', file='src/extras.tsx',
         old="key === 'nature' ? '20+ min' : 'check-in?'",
         new="'check-in?'",
         tests=[S], pattern='time in nature and Something sweet'),
    dict(id='n-chip-asked', file='src/extras.tsx',
         old="const CHIPS: readonly ChipKey[] = ['nothingLanded', 'hardToSeePoint', 'coolingOff', 'bigSocial', 'napped', 'nature', 'sweet']",
         new="const CHIPS: readonly ChipKey[] = ['nothingLanded', 'hardToSeePoint', 'coolingOff', 'bigSocial', 'napped', 'sweet']",
         tests=[S], pattern=WALK),
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
