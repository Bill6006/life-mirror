"""The forecast follow-ups, Batch 2, item 6 (built 2026-11-21, its verdict passed at 43 days): "A steady pattern" has to
hold. Each rule undone once, and the test that guards it must turn red. The hold: 43 days, as a literal; held from 43
days running and not one day sooner, since the run's first day; only the days running to today; the run under way
today; a fall back only after a run of 43 or more, the latest such run, until its last day. The words: the three
sentences of the approved contract, one day in the singular, the day as the Since line says it. The row: a pattern
reads as a lead until it is known to have held; Details only where today's standing and the days kept agree. The days
kept on the phone: by the build; by every evening before the day (its eight answers, its own reading, the next
morning's), the day's own evening apart; a missing answer apart from any value; every day from the day after the first
evening to today; worked out in slices, the first at once; kept when done, with what they were worked out from; under
the comparisons' guard; no holds until every day is known; a kept day's answers read only in range. A day's answers
are comesBefore's own: too few on a side is never a pattern; the interval rule; the family of sixteen. The screens:
the row's held standing; its Details, labelled so, under its standing line, closed until opened, in the calculation
register; Mirror and the evening's card each giving their rows the days, the card's up to tonight.

(The plan names this runner `qa/batch2_breaks.py`; that name is an earlier runner's, the foundations' Batch 2, so this
one is named for the hold.)

python -B -I -X utf8 qa/hold_breaks.py [id ...]   (every entry when none is named)
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
HP = 'src/heldPairs.ts'
HT = 'src/heldPairs.test.ts'
BD = 'src/beforeDays.ts'
CP = 'src/copy.ts'
MI = 'src/mirror.tsx'
CK = 'src/checkin.tsx'
B2 = 'e2e/batch2.spec.ts'
SMOKE = 'e2e/smoke.spec.ts'
HELD = 'at a steady pattern 43 days running and more'
FEWER = 'for fewer than 43 days reads as a lead'
EVENING = 'Evenings like this one says tonight'
TONIGHT = 'after an evening, the one pattern from What comes before your days that tonight matches'

ROW_BEFORE = """      <span class="before-line" data-testid="before-standing">
        {standingLine({ standing: heldStanding(p, hold), family: p.family })}
      </span>
      {details && (
        <Disclosure label={copy.disclose.details} testid="before-details" class="before-details">
          <div class="calc">
            <p class="calc-line" data-testid="before-details-line">
              {details}
            </p>
          </div>
        </Disclosure>
      )}
"""
ROW_MOVED = """      {details && (
        <Disclosure label={copy.disclose.details} testid="before-details" class="before-details">
          <div class="calc">
            <p class="calc-line" data-testid="before-details-line">
              {details}
            </p>
          </div>
        </Disclosure>
      )}
      <span class="before-line" data-testid="before-standing">
        {standingLine({ standing: heldStanding(p, hold), family: p.family })}
      </span>
"""

TABLE = [
    # ---- The hold ---------------------------------------------------------------------------------------------------
    dict(id='hold-is-43', file=HP, tests=[HT],
         old="export const HOLD_DAYS = 43",
         new="export const HOLD_DAYS = 42"),
    dict(id='held-from-43', file=HP, tests=[HT],
         old="return k >= HOLD_DAYS ? { kind: 'held'",
         new="return k > HOLD_DAYS ? { kind: 'held'"),
    dict(id='held-since-run-start', file=HP, tests=[HT],
         old="since: days[today.start] }",
         new="since: days[today.end] }"),
    dict(id='days-running-only', file=HP, tests=[HT],
         old="if (run && run.end === i - 1) run.end = i",
         new="if (run) run.end = i"),
    dict(id='run-under-way-today', file=HP, tests=[HT],
         old="const today = runs.find((r) => r.end === bits.length - 1)",
         new="const today = runs[runs.length - 1]"),
    dict(id='fell-from-43', file=HP, tests=[HT],
         old="const ended = runs.filter((r) => r.end - r.start + 1 >= HOLD_DAYS)",
         new="const ended = runs.filter((r) => r.end - r.start + 1 > HOLD_DAYS)"),
    dict(id='fell-latest', file=HP, tests=[HT],
         old="const latest = ended[ended.length - 1]",
         new="const latest = ended[0]"),
    dict(id='fell-until-last-day', file=HP, tests=[HT],
         old="until: days[latest.end] }",
         new="until: days[latest.start] }"),
    # ---- The words --------------------------------------------------------------------------------------------------
    dict(id='one-day-singular', file=HP, tests=[HT],
         old="fill(h.k === 1 ? c.notHeldOne : c.notHeld,",
         new="fill(c.notHeld,"),
    dict(id='not-held-words', file=CP, tests=[HT],
         old="notHeld: 'It has read as a steady pattern {k} days running; it is called one from {n}.',",
         new="notHeld: 'It has read as a steady pattern {k} days running.',"),
    dict(id='held-words', file=CP, tests=[HT],
         old="held: 'A steady pattern since {date}, {k} days running.',",
         new="held: 'A steady pattern since {date}.',"),
    dict(id='fell-words', file=CP, tests=[HT],
         old="fell: 'It was a steady pattern for {k} days, until {date}.',",
         new="fell: 'It was a steady pattern until {date}.',"),
    dict(id='day-as-the-since-line', file=HP, tests=[HT],
         old="toLocaleDateString(undefined, { day: 'numeric', month: 'long' })",
         new="toLocaleDateString(undefined, { day: 'numeric', month: 'short' })"),
    # ---- The row ----------------------------------------------------------------------------------------------------
    dict(id='lead-until-known', file=HP, tests=[HT],
         old="return p.standing === 'pattern' && h?.kind !== 'held' ? 'lead' : p.standing",
         new="return p.standing === 'pattern' && h !== null && h.kind !== 'held' ? 'lead' : p.standing"),
    dict(id='lead-until-held', file=HP, tests=[HT],
         old="return p.standing === 'pattern' && h?.kind !== 'held' ? 'lead' : p.standing",
         new="return p.standing === 'pattern' && h === null ? 'lead' : p.standing"),
    dict(id='details-where-they-agree', file=HP, tests=[HT],
         old="if (!h || h.kind === 'none' || (h.kind === 'fell') === (p.standing === 'pattern')) return null",
         new="if (!h || h.kind === 'none') return null"),
    # ---- The days kept ----------------------------------------------------------------------------------------------
    dict(id='kept-by-build', file=HP, tests=[HT],
         old="k && k.v === 1 && k.build === buildId && Array.isArray(k.chain)",
         new="k && k.v === 1 && Array.isArray(k.chain)"),
    dict(id='kept-by-evenings', file=HP, tests=[HT],
         old="if (isMask(m) && sameInputs(old, fresh, day)) masks.set(day, m)",
         new="if (isMask(m)) masks.set(day, m)"),
    dict(id='the-day-own-evening-apart', file=HP, tests=[HT],
         old="    while (i < a.length && a[i].day >= day) i++\n    while (j < b.length && b[j].day >= day) j++\n",
         new="    while (i < a.length && a[i].day > day) i++\n    while (j < b.length && b[j].day > day) j++\n"),
    dict(id='kept-by-answers', file=HP, tests=[HT],
         old="[c.day, ...EVENING_READINGS.map((r) => answered(c.answers[r])), own(c.day), morningAfter(byKey, c.day)]",
         new="[c.day, own(c.day), morningAfter(byKey, c.day)]"),
    dict(id='kept-by-own-reading', file=HP, tests=[HT],
         old="answered(c.answers[r])), own(c.day), morningAfter(byKey, c.day)]",
         new="answered(c.answers[r])), null, morningAfter(byKey, c.day)]"),
    dict(id='kept-by-next-morning', file=HP, tests=[HT],
         old="answered(c.answers[r])), own(c.day), morningAfter(byKey, c.day)]",
         new="answered(c.answers[r])), own(c.day), null]"),
    dict(id='missing-answer-apart', file=HP, tests=[HT],
         old="(v === undefined ? '-' : (v as number | null))",
         new="(v === undefined ? null : (v as number | null))"),
    dict(id='every-day-to-today', file=HP, tests=[HT],
         old="d <= today; d = addDays(d, 1)) days.push(d)",
         new="d < today; d = addDays(d, 1)) days.push(d)"),
    dict(id='from-the-first-evening', file=HP, tests=[HT],
         old="for (let d = addDays(firstEvening, 1);",
         new="for (let d = addDays(firstEvening, 2);"),
    dict(id='in-slices', file=HP, tests=[HT],
         old="while (next < todo.length && clock() - t0 < ms) {",
         new="while (next < todo.length) {"),
    dict(id='first-slice-at-once', file=HP, tests=[HT],
         old="  step(opts.first ?? SLICE_MS)\n  return {",
         new="  return {"),
    dict(id='kept-when-done', file=HP, tests=[HT],
         old="      finished = true\n      save()\n",
         new="      finished = true\n"),
    dict(id='kept-with-its-evenings', file=HP, tests=[HT],
         old="JSON.stringify({ v: 1, build: buildId, chain, days: out } satisfies Kept)",
         new="JSON.stringify({ v: 1, build: buildId, chain: [], days: out } satisfies Kept)"),
    dict(id='under-the-guard', file=HP, tests=[HT],
         old="const ran = guardComparisons(today, () => {",
         new="const ran = ((read: () => boolean) => read())(() => {"),
    dict(id='no-holds-before-known', file=HP, tests=[HT],
         old="if (!finished || failed) return null",
         new="if (failed) return null"),
    dict(id='kept-answers-in-range', file=HP, tests=[HT],
         old="m < 1 << PAIR_KEYS.length",
         new="m < 1 << 17"),
    # ---- A day's answers are comesBefore's own ----------------------------------------------------------------------
    dict(id='too-few-never-a-pattern', file=BD, tests=[HT],
         old="if (s.standing !== 'pattern' || !drawn[i].enough) return false",
         new="if (s.standing !== 'pattern') return false"),
    dict(id='the-interval-rule', file=BD, tests=[HT],
         old="return iv !== null && !(iv.lo <= 0 && iv.hi >= 0)\n  })\n}",
         new="return iv !== null\n  })\n}"),
    dict(id='the-family-of-sixteen', file=BD, tests=[HT],
         old="return standings(compared).map((s, i) => {",
         new="return compared.map((one) => standings([one])[0]).map((s, i) => {"),
    # ---- The screens ------------------------------------------------------------------------------------------------
    dict(id='row-says-the-held-standing', file=MI, tests=[B2, '-g', FEWER],
         old="{standingLine({ standing: heldStanding(p, hold), family: p.family })}",
         new="{standingLine(p)}"),
    dict(id='row-has-its-details', file=MI, tests=[B2, '-g', HELD],
         old="      {details && (\n        <Disclosure label={copy.disclose.details} testid=\"before-details\"",
         new="      {false && (\n        <Disclosure label={copy.disclose.details} testid=\"before-details\""),
    dict(id='details-labelled-details', file=MI, tests=[B2, '-g', HELD],
         old="<Disclosure label={copy.disclose.details} testid=\"before-details\"",
         new="<Disclosure label=\"More\" testid=\"before-details\""),
    dict(id='details-under-the-standing', file=MI, tests=[B2, '-g', HELD],
         old=ROW_BEFORE,
         new=ROW_MOVED),
    dict(id='details-closed-until-opened', file=MI, tests=[B2, '-g', HELD],
         old='testid="before-details" class="before-details">',
         new='testid="before-details" class="before-details" defaultOpen>'),
    dict(id='details-in-the-calculation-register', file=MI, tests=[B2, '-g', HELD],
         old='<p class="calc-line" data-testid="before-details-line">',
         new='<p class="note" data-testid="before-details-line">'),
    dict(id='mirror-gives-its-rows-the-days', file=MI, tests=[B2, '-g', HELD],
         old="<BeforeRow key={`${p.reading}-${p.level}`} p={p} span={span} held={held} />\n            ))}\n          </ul>\n        )}",
         new="<BeforeRow key={`${p.reading}-${p.level}`} p={p} span={span} held={null} />\n            ))}\n          </ul>\n        )}"),
    dict(id='mirror-works-out-the-days', file=MI, tests=[B2, '-g', FEWER],
         old="const held = useHeldPairs(all, today.day)",
         new="const held = useHeldPairs(null, today.day)"),
    dict(id='card-gives-its-row-the-days', file=CK, tests=[B2, '-g', EVENING],
         old="<BeforeRow p={pattern} span={span} held={held} />",
         new="<BeforeRow p={pattern} span={span} held={null} />"),
    dict(id='card-holds-to-tonight', file=CK, tests=[B2, '-g', EVENING],
         old="const held = useHeldPairs(pattern ? all : null, record.day)",
         new="const held = useHeldPairs(pattern ? all : null, '2026-12-31')"),
    dict(id='card-says-the-held-standing', file=MI, tests=[SMOKE, '-g', TONIGHT],
         old="{standingLine({ standing: heldStanding(p, hold), family: p.family })}",
         new="{standingLine(p)}"),
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
