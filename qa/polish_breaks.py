"""The polish pass (2026-11-07): each new rule undone once, and the test that guards it must turn red.

The sweets hint: what counts said under the question on the afternoon's card and in the evening's list, in the owner's
words, outside the button so the question alone stays its words, and in line with the question's words. Now's effort
figures: five 48-pixel targets in one row wherever they fit with 4 pixels between them, three to a row where they do not,
never one alone on a line and never past the room they are given; the room taken from the whole row, and the line drawn at
256 pixels.

The Not now test's fixed draw has no entry: a test made deterministic cannot be shown so by one failing run. It was shown by
the draws themselves: three runs on its seed alike, four unseeded runs all different, one of them the recorded timeout.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, an empty test list refused, and an id that matches no entry refused. Browser entries build before
and after their break.
PW_CONFIG=<config> picks the Playwright config (default playwright.config.ts).

python polish_breaks.py [id ...]
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
SP = 'e2e/speaking.spec.ts'
SWEET = 'time in nature and Something sweet'
FIGURES = 'five effort figures read as one set'

TABLE = [
    # The sweets hint, under the question wherever it is asked.
    dict(id='sweet-hint-evening', file='src/extras.tsx',
         old="                {key === 'sweet' && (\n                  <p class=\"note faint no-gap sweet-hint\" data-testid=\"sweet-hint\">\n                    {copy.extras.sweetHint}\n                  </p>\n                )}\n",
         new="",
         tests=[S], pattern=SWEET),
    dict(id='sweet-hint-afternoon', file='src/extras.tsx',
         old="            <p class=\"note faint no-gap sweet-hint\" data-testid=\"sweet-hint\">\n              {copy.extras.sweetHint}\n            </p>\n            {on && (",
         new="            {on && (",
         tests=[S], pattern=SWEET),
    dict(id='sweet-hint-words', file='src/copy.ts',
         old="    sweetHint: 'Sweets, desserts, sugary drinks or juice. Whole fruit doesn’t count.',\n",
         new="    sweetHint: 'Sweets, desserts or sugary drinks.',\n",
         tests=[S], pattern=SWEET),
    dict(id='sweet-hint-outside-the-button', file='src/extras.tsx',
         old="<span class=\"row-main\">{keepTogether(copy.extras.sweet, 'check-in?')}</span>",
         new="<span class=\"row-main\">{keepTogether(copy.extras.sweet, 'check-in?')} {copy.extras.sweetHint}</span>",
         tests=[S], pattern=SWEET),
    dict(id='sweet-hint-in-line', file='src/styles.css',
         old=".church-ask,\n.sweet-hint {\n",
         new=".church-ask {\n",
         tests=[S], pattern=SWEET),
    # Now's effort figures, one set at every width.
    dict(id='figures-grid', file='src/styles.css',
         old=".when.is-figures {\n  display: grid;\n",
         new=".when.is-figures {\n  display: flex;\n  flex-wrap: wrap;\n",
         tests=[SP], pattern=FIGURES),
    dict(id='figures-three-to-a-row', file='src/styles.css',
         old="@container (width < 256px) {\n  .when.is-figures {",
         new="@container (width < 1px) {\n  .when.is-figures {",
         tests=[SP], pattern=FIGURES),
    dict(id='figures-line-at-256', file='src/styles.css',
         old="@container (width < 256px) {\n  .when.is-figures {",
         new="@container (width < 257px) {\n  .when.is-figures {",
         tests=[SP], pattern=FIGURES),
    dict(id='figures-container', file='src/pathMeasureUi.tsx',
         old="  return narrow ? <div class=\"figures\">{group}</div> : group\n",
         new="  return group\n",
         tests=[SP], pattern=FIGURES),
    dict(id='figures-whole-row', file='src/styles.css',
         old=".figures {\n  container-type: inline-size;\n  align-self: stretch;\n}",
         new=".figures {\n  container-type: inline-size;\n}",
         tests=[SP], pattern=FIGURES),
    dict(id='figures-gap-4', file='src/styles.css',
         old="  gap: 10px 4px;\n",
         new="  gap: 10px 8px;\n",
         tests=[SP], pattern=FIGURES),
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
