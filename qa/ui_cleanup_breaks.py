"""The UI cleanups' deliberate breaks (agreed 2026-10-17: Let it out, the Aims cards, the skill coach).

Each break undoes one change, and the browser test that guards it must turn red. Same rules as
stage1_breaks.py: a green baseline first, one exact replacement, the file always restored byte for
byte, the table read as data, and an empty test list refused. The browser tests serve the built
folder, so the app is rebuilt after each replacement and once more after each restore.

python ui_cleanup_breaks.py [id ...]
PW_CONFIG=<config> picks the Playwright config (default playwright.config.ts).
"""
import io
import os
import re
import subprocess
import sys

# The repository root: this folder's parent.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'
NPM = 'npm.cmd' if os.name == 'nt' else 'npm'
CONFIG = os.environ.get('PW_CONFIG', 'playwright.config.ts')
S = 'e2e/smoke.spec.ts'
JOURNAL = 'Let it out: the night'
AIMS = 'aims: something to learn in its own words'
COACH = 'Suggest a skill with Claude on your tap'
PHYSICAL = 'a physical goal asks one safety question'
SOCIAL = 'the Social path: added under Aims'

TABLE = [
    # 1. Let it out
    dict(id='journal-in-note-card', file='src/extras.tsx',
         old="        <JournalBox day={day} />\n      </div>",
         new="      </div>\n      <JournalBox day={day} />",
         tests=[S], pattern=JOURNAL),
    dict(id='journal-no-box-note', file='src/extras.tsx',
         old="          onBlur={flush}\n        />\n      </div>",
         new="          onBlur={flush}\n        />\n        <p class=\"note faint no-gap\">Yours to read back under Mirror. Never a reading, a score or a finding.</p>\n      </div>",
         tests=[S], pattern=JOURNAL),
    dict(id='journal-ink-label', file='src/styles.css',
         old=".journal-row .d-label {\n  color: var(--ink);\n}",
         new=".journal-row .d-label {\n}",
         tests=[S], pattern=JOURNAL),
    # 3. The skill coach
    dict(id='coach-ask-primary', file='src/coachCards.tsx',
         old="class={named ? 'pill-quiet' : 'pill-quiet is-primary'} data-testid=\"coach-ask\"",
         new="class=\"textbtn\" data-testid=\"coach-ask\"",
         tests=[S], pattern=COACH),
    dict(id='coach-no-ask-on-create', file='src/aimsScreen.tsx',
         old="<LearningForm onAdd={(goal, method, about) => void addLearning(goal, method, '', about).then(onClose)} />",
         new="<LearningForm onAdd={(goal, method, about) => void addLearning(goal, method, '', about).then((id) => { if (id !== null) void askSuggestion(id); onClose() })} />",
         tests=[S], pattern=COACH),
    # coach-when-after-line and coach-when-line-read retired 2026-10-18: the owner amended D7 ("Go on the new D7:
    # suggestions on tap, two a day"), so no card says a suggestion comes after the day's line. The card's new words,
    # usually ready in a few minutes, or why not yet and when, are audit_fixes_breaks.py's to guard.
    dict(id='coach-set-myself-opens', file='src/coachCards.tsx',
         old="            h.onOwn(askId)\n            onOwn?.()\n",
         new="            h.onOwn(askId)\n",
         tests=[S], pattern=PHYSICAL),
    dict(id='learn-form-no-skill', file='src/aimsScreen.tsx',
         old="      {input(c.aboutLabel, about, setAbout, 'aim-about-input', 240, c.aboutPlaceholder)}",
         new="      {input(c.skillNowPlaceholder, '', () => undefined, 'aim-skill-now-input', 80, c.skillNowPlaceholder)}\n      {input(c.aboutLabel, about, setAbout, 'aim-about-input', 240, c.aboutPlaceholder)}",
         tests=[S], pattern=COACH),
    # 2. The Aims cards
    dict(id='ease-in-details', file='src/aimCard.tsx',
         old="      {learning?.current?.safety && (",
         new="      {hasEase && <p class=\"calc-line faint\" data-testid=\"aim-ease-line\">{c.easeLine}</p>}\n      {learning?.current?.safety && (",
         tests=[S], pattern=AIMS),
    dict(id='details-one-line', file='src/aimCard.tsx',
         old="<Disclosure label={d.details} testid=\"aim-details\">",
         new="<Disclosure label={d.details} sub=\"How often · pause · finish · remove\" testid=\"aim-details\">",
         tests=[S], pattern=AIMS),
    dict(id='no-practised-before-skill', file='src/aimCard.tsx',
         old="!unnamed && last && <span data-testid=\"aim-last\">{last}</span>",
         new="last && <span data-testid=\"aim-last\">{last}</span>",
         tests=[S], pattern=AIMS),
    dict(id='no-second-no-session-line', file='src/aimCard.tsx',
         old="{learning?.current && (learning.practice?.sessions ?? 0) > 0 && (",
         new="{learning?.current && (",
         tests=[S], pattern=AIMS),
    dict(id='no-closing-note', file='src/aimsScreen.tsx',
         old="      )}\n    </section>\n  )\n}\n\nfunction familyName",
         new="      )}\n      <p class=\"note faint\">Commitments are part of your record; nothing is graded.</p>\n    </section>\n  )\n}\n\nfunction familyName",
         tests=[S], pattern=AIMS),
    dict(id='path-one-details', file='src/pathCard.tsx',
         old="        <div data-testid=\"path-settings\">",
         new="      </Disclosure>\n      <Disclosure label=\"Path settings\" testid=\"path-split\">\n        <div data-testid=\"path-settings\">",
         tests=[S], pattern=SOCIAL),
    dict(id='path-plan-before-change', file='src/pathCard.tsx',
         old="                {rep && ((!pending && cues > 0) || hasNotes) && <PlanTap open={planOpen} onToggle={() => setPlanOpen((v) => !v)} label={!pending && cues > 0 ? d.planWhen : d.repNotes} />}\n                <button type=\"button\" class=\"textbtn\" data-testid=\"path-change\" onClick={p.onChange}>\n                  {c.change}\n                </button>\n",
         new="                <button type=\"button\" class=\"textbtn\" data-testid=\"path-change\" onClick={p.onChange}>\n                  {c.change}\n                </button>\n                {rep && ((!pending && cues > 0) || hasNotes) && <PlanTap open={planOpen} onToggle={() => setPlanOpen((v) => !v)} label={!pending && cues > 0 ? d.planWhen : d.repNotes} />}\n",
         tests=[S], pattern=SOCIAL),
]


def build():
    r = subprocess.run([NPM, 'run', 'build'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit('build failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def run(tests, pattern):
    assert tests, 'an empty test list would run everything'
    cmd = [NPX, 'playwright', 'test', '-c', CONFIG, '--retries', '0', *tests]
    if pattern:
        cmd += ['-g', pattern]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
    passed = int(m.group(1)) if (m := re.search(r'(\d+) passed', out)) else 0
    failed = int(m.group(1)) if (m := re.search(r'(\d+) failed', out)) else 0
    return r.returncode, failed, passed, out


def main(ids):
    rows = [t for t in TABLE if not ids or t['id'] in ids]
    assert rows, 'no entry matched'
    results = []
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
            build()
            code2, failed2, passed2, out2 = run(t['tests'], t.get('pattern'))
        finally:
            io.open(path, 'wb').write(original)
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
