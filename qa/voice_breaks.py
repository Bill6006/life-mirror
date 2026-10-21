"""Ask Life Mirror's coaching voice (2026-10-21), each rule undone once: the test that guards it must turn red.

The voice check refuses an answer whose first sentence gives more than one number, or spends its one number on the record's
own size; more numbers than its tier carries, 6 for a standard answer and 10 for the deep tier; a paragraph giving more than
3 numbers, or running over 90 words; and hype. It reads numbers as the grounding does: a date or a clock time once, a count
written as a word once, a cited name not at all; and paragraphs as the screen shows them, each line its own. Its reasons
are said with the evidence's, every one at once. A count before "out of" is grounded, in Ask and in the Brain's line alike.
The Worker checks the answer by its own tier. Both tiers are told the voice before the rules, with its limits. On the
screen: the answer's paragraphs, and what it rests on folded under "What this rests on" until tapped.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by a browser test runs Playwright against the
built folder, so the app is rebuilt after its replacement and once more after its restore.

python voice_breaks.py [id ...]
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
V = 'src/ask/voice.test.ts'
W = 'worker/src/ask.test.ts'
AS = 'e2e/ask.spec.ts'
BS = 'src/brainShared.ts'

TABLE = [
    dict(id='v-first-sentence', file=BS,
         old="  if (opening > ASK_SHAPE.firstSentence) reasons.push(",
         new="  if (opening > 99) reasons.push(",
         tests=[V], pattern='what do you know about me'),
    dict(id='v-record-size', file=BS,
         old="  else if (opening > 0 && RECORD_SIZE.test(first)) reasons.push(",
         new="  else if (opening < 0 && RECORD_SIZE.test(first)) reasons.push(",
         tests=[V], pattern='what do you know about me'),
    dict(id='v-record-size-counted', file=BS,
         old=r"`\\b(?:\\d[\\d,]*|${Object.keys(NUMBER_WORDS).join('|')})(?:-(?:${Object.keys(UNIT_WORDS).join('|')}))?\\s+(?:(?:days?",
         new=r"`\\b(?:(?:days?",
         tests=[V], pattern='what do you know about me'),
    dict(id='v-total-cap', file=BS,
         old="  if (all > cap) reasons.push(",
         new="  if (all > 99) reasons.push(",
         tests=[V], pattern='lets the deep tier carry more numbers'),
    dict(id='v-tier-cap', file=BS,
         old="  const cap = deep ? ASK_SHAPE.deep : ASK_SHAPE.ask\n",
         new="  const cap = ASK_SHAPE.ask\n",
         tests=[V], pattern='lets the deep tier carry more numbers'),
    dict(id='v-shape-standard', file=BS,
         old="export const ASK_SHAPE = { ask: 6, deep: 10, firstSentence: 1, paragraphNumbers: 3, paragraphWords: 90 } as const",
         new="export const ASK_SHAPE = { ask: 7, deep: 10, firstSentence: 1, paragraphNumbers: 3, paragraphWords: 90 } as const",
         tests=[V], pattern='lets the deep tier carry more numbers'),
    dict(id='v-shape-deep', file=BS,
         old="export const ASK_SHAPE = { ask: 6, deep: 10, firstSentence: 1, paragraphNumbers: 3, paragraphWords: 90 } as const",
         new="export const ASK_SHAPE = { ask: 6, deep: 12, firstSentence: 1, paragraphNumbers: 3, paragraphWords: 90 } as const",
         tests=[V], pattern='Coach me on everything'),
    dict(id='v-paragraph-numbers', file=BS,
         old="  const listing = paragraphs.map((p) => numberCount(p, sheet, factIds)).find((n) => n > ASK_SHAPE.paragraphNumbers)\n",
         new="  const listing = paragraphs.map((p) => numberCount(p, sheet, factIds)).find((n) => n > 99)\n",
         tests=[V], pattern='Coach me on everything'),
    dict(id='v-wall', file=BS,
         old="  const wall = paragraphs.map((p) => words(p)).find((n) => n > ASK_SHAPE.paragraphWords)\n",
         new="  const wall = paragraphs.map((p) => words(p)).find((n) => n > 999)\n",
         tests=[V], pattern='refuses a wall'),
    dict(id='v-hype', file=BS,
         old="  const hype = HYPE.exec(text)\n",
         new="  const hype = null as RegExpExecArray | null\n",
         tests=[V], pattern='weak evidence'),
    dict(id='v-hype-praise-only', file=BS,
         old="|superb|brilliant|",
         new="|superb|outstanding|brilliant|",
         tests=[V], pattern='weak evidence'),
    dict(id='v-spelled-counts', file=BS,
         old="numbersIn(plain).length + [...plain.matchAll(COUNT_WORD)].length",
         new="numbersIn(plain).length",
         tests=[V], pattern='counts a number spelled out'),
    dict(id='v-names-set-aside', file=BS,
         old="  const named = withoutCitedNames(text, sheet, factIds)\n  const rest = withoutClockTimes(named)\n",
         new="  const named = text\n  const rest = withoutClockTimes(named)\n",
         tests=[V], pattern='counts nothing in a cited move'),
    dict(id='v-times-once', file=BS,
         old="  const rest = withoutClockTimes(named)\n",
         new="  const rest = named\n",
         tests=[V], pattern='counts a date or a clock time once'),
    dict(id='v-dates-once', file=BS,
         old="  const plain = rest.replace(ISO_DATE, ' ')\n",
         new="  const plain = rest\n",
         tests=[V], pattern='counts a date or a clock time once'),
    dict(id='v-paragraphs-lines', file=BS,
         old="    .split(/\\n+/)\n    .map((p) => p.trim())\n",
         new="    .split(/\\n\\s*\\n/)\n    .map((p) => p.trim())\n",
         tests=[V], pattern='reads paragraphs as the screen shows them'),
    dict(id='v-validate-calls-voice', file=BS,
         old="  const voice = askVoiceRefusal(own, deep, sheet, cited.factIds)\n",
         new="  const voice = null as string | null\n",
         tests=[V], pattern='Coach me on everything'),
    dict(id='v-reasons-together', file=BS,
         old="  return { ok: false, reason: [long, why, voice].filter(Boolean).join('; and ') }",
         new="  return { ok: false, reason: [long, why ?? voice].filter(Boolean).join('; and ') }",
         tests=[V], pattern='says the evidence'),
    dict(id='v-out-of', file=BS,
         old=r"(?=\\s+(?:of\\b|out\\s+of\\b|(?:more\\s+)?(?:times?|",
         new=r"(?=\\s+(?:of\\b|(?:more\\s+)?(?:times?|",
         tests=[V], pattern='grounds a count before'),
    dict(id='v-worker-tier', file='worker/src/ask.ts',
         old="validateAsk(answer, sheet, cards, words, undefined, question, t.task === 'deep')",
         new="validateAsk(answer, sheet, cards, words, undefined, question, false)",
         tests=[W], pattern='checks an answer’s voice by its tier'),
    dict(id='v-prompt-voice', file='worker/src/prompt.ts',
         old="    askVoice(task),\n",
         new="",
         tests=[W], pattern='tells Claude one coaching voice'),
    dict(id='v-prompt-deep', file='worker/src/prompt.ts',
         old='? `"Coach me on everything" is a coaching read of the whole record, about 250 words',
         new='? `"Coach me on everything" is the broad read of the whole record, about 250 words',
         tests=[W], pattern='tells Claude one coaching voice'),
    dict(id='v-prompt-caps', file='worker/src/prompt.ts',
         old="and ${task === 'deep' ? ASK_SHAPE.deep : ASK_SHAPE.ask} in the whole answer",
         new="and ${ASK_SHAPE.ask} in the whole answer",
         tests=[W], pattern='tells Claude one coaching voice'),
    dict(id='v-screen-fold', file='src/ask/askScreen.tsx',
         old='<Disclosure label={c.claudeCited} testid="ask-claude-cited-open">',
         new='<Disclosure label={c.claudeCited} testid="ask-claude-cited-open" defaultOpen>',
         tests=[AS], pattern='folded under it until tapped'),
    dict(id='v-screen-paragraphs', file='src/ask/askScreen.tsx',
         old="      {askParagraphs(a.text ?? '').map((p, i) => (",
         new="      {[a.text ?? ''].map((p, i) => (",
         tests=[AS], pattern='folded under it until tapped'),
    dict(id='v-label', file='src/copy.ts',
         old="    claudeCited: 'What this rests on',",
         new="    claudeCited: 'The findings it cited',",
         tests=[AS], pattern='folded under it until tapped'),
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
