"""P2, P3 and P4 of the AI-generated Paths design (2026-11-06): each new rule undone once, and the test that guards it must
turn red.

P2, the measurement: your own behaviours, never anyone's reaction; the outside view taken when there is one; a stage's
gate on separate weeks, confirmed from outside the moment, in kinds of setting; the stage below back after the attempt
cap; a stage shown checked again later, with a grace; practice apart from what is shown; the strands on; and the record
on the phone (the line before Start, your checks and how hard it was, what someone who was there noticed, one recording
a rep kept on this phone alone and checked the next day, the chance after Partly or No). P3, the second reader: a card
admitted only on the words a reader other than its drafter judged, and certainty by rule. P4, the speaking Path: offered
only once started, its share of the one People row, a guardrail on every rep with someone there or a recording, its
pins in the catalogue, and its screens.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. Browser entries build before and after their break.
PW_CONFIG=<config> picks the Playwright config (default playwright.config.ts).

python paths_p2_p4_breaks.py [id ...]
"""
import io
import os
import re
import subprocess
import sys

import time


def put_back(path, data):
    """Writes a file whole. Windows can refuse the write for a moment while a scanner or a watcher holds the file
    (OSError 22, seen 2026-11-12, when a failed restore left a break in the tree): tried again for ten seconds, and
    never given up quietly."""
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
MEASURE = 'src/pathMeasure.test.ts'
SPEAK = 'src/speakingPath.test.ts'
FLOW = 'src/measureFlow.test.ts'
DATA = 'src/pathsData.test.ts'
PATHS = 'src/paths.test.ts'
CHK = 'src/pathCheck.test.ts'
LIB = 'src/libraryScripts.test.ts'
RULES = 'src/libraryRules.test.ts'
E2E = 'e2e/speaking.spec.ts'
FIRST_E2E = 'read on one screen, labelled experimental'
SMOKE = 'e2e/smoke.spec.ts'
CATALOGUE = 'the catalogue is readable in full from the Moves tab'
REFUSE = 'refuse each broken rule'

TABLE = [
    # P2, the measurement's pure part.
    dict(id='outside-view-ignored', file='src/pathMeasure.ts',
         old='  return outside.length >= own.length && (r.recordingChecks || r.otherChecks) ? { met: outside.length, outside: true, ids: outside } : { met: own.length, outside: false, ids: own }\n',
         new='  return { met: own.length, outside: false, ids: own }\n',
         tests=[MEASURE], pattern='takes the outside view when there is one'),
    dict(id='gate-below-behaviours', file='src/pathMeasure.ts',
         old='    if (shows(r, gate, behaviours)) meeting.push(r)\n',
         new='    meeting.push(r)\n',
         tests=[MEASURE], pattern='does not hold on your own checks alone'),
    dict(id='gate-weeks-ignored', file='src/pathMeasure.ts',
         old='    if (metOn === null && weeks >= gate.weeks && confirmed >= gate.confirmed && kinds >= gate.kinds) metOn = r.day\n',
         new='    if (metOn === null && confirmed >= gate.confirmed && kinds >= gate.kinds) metOn = r.day\n',
         tests=[MEASURE], pattern='does not hold on your own checks alone'),
    dict(id='gate-unconfirmed', file='src/pathMeasure.ts',
         old='    if (metOn === null && weeks >= gate.weeks && confirmed >= gate.confirmed && kinds >= gate.kinds) metOn = r.day\n',
         new='    if (metOn === null && weeks >= gate.weeks && kinds >= gate.kinds) metOn = r.day\n',
         tests=[SPEAK], pattern='holds the first stage while its floor is met on your own checks alone'),
    dict(id='gate-kinds-ignored', file='src/pathMeasure.ts',
         old='    if (metOn === null && weeks >= gate.weeks && confirmed >= gate.confirmed && kinds >= gate.kinds) metOn = r.day\n',
         new='    if (metOn === null && weeks >= gate.weeks && confirmed >= gate.confirmed) metOn = r.day\n',
         tests=[MEASURE], pattern='does not hold on your own checks alone'),
    dict(id='checks-due-every-only', file='src/pathMeasure.ts',
         old='    const day = addDays(from, k < at.length ? at[k] : last + (k - at.length + 1) * every)\n',
         new='    const day = addDays(from, last + k * every)\n',
         tests=[MEASURE], pattern='is due a month later, three months later'),
    dict(id='grace-ignored', file='src/pathMeasure.ts',
         old="    if (!first) return daysBetween(day, today) > CHECK_GRACE_DAYS ? { kind: 'refresh', since: day } : { kind: 'holding', next: day }\n",
         new="    if (!first) return { kind: 'refresh', since: day }\n",
         tests=[SPEAK], pattern='holds it while the check waits'),
    dict(id='check-not-met-holds', file='src/pathMeasure.ts',
         old='    if (!shows(first, gate, behaviours)) {\n',
         new='    if (false) {\n',
         tests=[MEASURE], pattern='brings the stage back when one is missed past the grace or not met'),
    dict(id='calibration-one-sided', file='src/pathMeasure.ts',
         old='    if (!r.checks || !(r.recordingChecks || r.otherChecks)) continue\n',
         new='    if (!r.checks) continue\n',
         tests=[MEASURE], pattern='your checks beside an outside view as counts'),
    dict(id='strands-default-all', file='src/pathMeasure.ts',
         old='  const rest = all.filter((id) => !off.has(id))\n',
         new='  const rest = all\n',
         tests=[MEASURE], pattern='are those you chose, else every strand'),
    dict(id='practised-counts-no', file='src/pathMeasure.ts',
         old="  const practised = reps.filter((r) => r.outcome === 'done' || r.outcome === 'partly').length\n",
         new='  const practised = reps.length\n',
         tests=[MEASURE], pattern='keeps practice apart from what is shown'),
    dict(id='stuck-never', file='src/pathMeasure.ts',
         old='        if (r.metOn === null && r.attempts >= m.cap) out.add(state.stage - 1)\n',
         new='        if (false) out.add(state.stage - 1)\n',
         tests=[SPEAK], pattern='after the attempt cap'),
    dict(id='stuck-one-early', file='src/pathMeasure.ts',
         old='        if (r.metOn === null && r.attempts >= m.cap) out.add(state.stage - 1)\n',
         new='        if (r.metOn === null && r.attempts >= m.cap - 1) out.add(state.stage - 1)\n',
         tests=[SPEAK], pattern='after the attempt cap'),
    dict(id='recording-due-same-day', file='src/pathMeasure.ts',
         old="      return o !== undefined && (o.outcome === 'done' || o.outcome === 'partly') && !o.recordingCheckedAt && dayOf(r.at) < today\n",
         new="      return o !== undefined && (o.outcome === 'done' || o.outcome === 'partly') && !o.recordingCheckedAt && dayOf(r.at) <= today\n",
         tests=[FLOW], pattern='keeps one recording a rep on this phone'),
    dict(id='recording-due-after-no', file='src/pathMeasure.ts',
         old="      return o !== undefined && (o.outcome === 'done' || o.outcome === 'partly') && !o.recordingCheckedAt && dayOf(r.at) < today\n",
         new="      return o !== undefined && o.outcome !== null && !o.recordingCheckedAt && dayOf(r.at) < today\n",
         tests=[FLOW], pattern='never lists a recording whose rep was answered No'),
    # P2, the gate wired into the day's view.
    dict(id='gate-ignored-by-stage', file='src/pathStage.ts',
         old='    if (shown === null) break\n',
         new='',
         tests=[SPEAK], pattern='holds the first stage while its floor is met'),
    # P2, the record on the phone.
    dict(id='start-twice-two-aims', file='src/measureFlow.ts',
         old='    if (live?.id !== undefined) {\n',
         new='    if (false) {\n',
         tests=[FLOW], pattern='one commitment however often'),
    dict(id='reason-kept-on-later', file='src/measureFlow.ts',
         old="  return decide(path, decision, cardsNow(), decision === 'notThis' ? reason : undefined, now)\n",
         new='  return decide(path, decision, cardsNow(), reason, now)\n',
         tests=[FLOW], pattern='puts it away on Later or Not this'),
    dict(id='strands-none-kept', file='src/measureFlow.ts',
         old='  if (!strands.length) return\n',
         new='',
         tests=[FLOW], pattern='never none'),
    dict(id='effort-not-taken-back', file='src/measureFlow.ts',
         old='  if (sheet.effort !== undefined) patch.effort = sheet.effort ?? undefined\n',
         new='  if (sheet.effort) patch.effort = sheet.effort\n',
         tests=[FLOW], pattern='null taking effort back'),
    dict(id='recording-kept-twice', file='src/measureFlow.ts',
         old="    await db.recordings.where('offerId').equals(offerId).delete()\n",
         new='',
         tests=[FLOW], pattern='keeps one recording a rep on this phone'),
    dict(id='chance-after-done', file='src/offerFlow.ts',
         old="...(chance !== null && (outcome === 'partly' || outcome === 'no') ? { chance } : {})",
         new='...(chance !== null ? { chance } : {})',
         tests=[FLOW], pattern='keeps the chance after Partly or No'),
    dict(id='prediction-blank-kept', file='src/pathFlow.ts',
         old='      ...(prediction?.trim() ? { prediction: prediction.trim() } : {}),\n',
         new='      ...(prediction !== undefined ? { prediction } : {}),\n',
         tests=[FLOW], pattern='keeps the line written before Start'),
    dict(id='recordings-synced', file='src/cloudOutbox.ts',
         old="'notes', 'pathVersions', 'pathRequests', 'pathAdaptations', 'pathTests', 'pathTestDays', 'patterns']",
         new="'notes', 'pathVersions', 'pathRequests', 'pathAdaptations', 'pathTests', 'pathTestDays', 'patterns', 'recordings']",
         tests=[FLOW], pattern='stays on this phone'),
    # P4, offered only once started, and where it starts.
    dict(id='started-version-ignored', file='src/pathVersions.ts',
         old='  return offeredNow(path, versions) && (path.builtIn === true || compiled(path))\n',
         new='  return true\n',
         tests=[FLOW], pattern='only on a version you started'),
    # P1 item 6, on the phone: the compiler's checks run again before a Path is shown or offered.
    dict(id='started-uncompiled-offered', file='src/pathVersions.ts',
         old='  return offeredNow(path, versions) && (path.builtIn === true || compiled(path))\n',
         new='  return offeredNow(path, versions)\n',
         tests=[FLOW], pattern='only on a version you started'),
    dict(id='built-in-needs-compiling', file='src/pathVersions.ts',
         old='  return offeredNow(path, versions) && (path.builtIn === true || compiled(path))\n',
         new='  return offeredNow(path, versions) && compiled(path)\n',
         tests=[FLOW], pattern='only on a version you started'),
    dict(id='phone-skips-compiler', file='src/pathRead.tsx',
         old='  return compiledPaths(all.filter((p) => !p.builtIn), reps, cards)\n',
         new='  return all.filter((p) => !p.builtIn)\n',
         tests=[CHK], pattern='leave the phone only the Paths that pass them'),
    dict(id='compiler-keeps-broken', file='src/pathCheck.ts',
         old='  return all.filter((p) => checkPath(p, moves, cards).length === 0)\n',
         new='  return [...all]\n',
         tests=[CHK], pattern='leave the phone only the Paths that pass them'),
    dict(id='focus-opens-nerves', file='src/pathRead.tsx',
         old='  const base = all.includes(focus) && focus !== opens && !waiting.has(focus) ? [focus] : all.filter((id) => id !== opens && !waiting.has(id))\n',
         new='  const base = all.includes(focus) ? [focus] : all\n',
         tests=[FLOW], pattern='turns on the strand a focus names'),
    # P4, its share of the one People row.
    dict(id='alone-own-reps-only', file='src/pathStage.ts',
         old='    if (!binds) return row(v, v.pick)\n',
         new='',
         tests=[DATA], pattern='drawing among all its reps'),
    dict(id='turn-skips-shared-left-behind', file='src/pathStage.ts',
         old='    const own = (id: string) => ownOnly(v.path, id) || (v.path.traits.shareBindsAlone !== true && !primaryHolds.has(id) && Boolean(placeOn(v.path.id, id)))\n',
         new='    const own = (id: string) => ownOnly(v.path, id)\n',
         tests=[DATA], pattern='a rep it shares that Social no longer holds'),
    # P4, a guardrail on every rep with someone there or a recording, its own or its placement's.
    dict(id='placement-guardrail-ignored', file='src/catalogue.ts',
         old='  return m.path?.[id]?.guardrail ?? m.guardrail\n',
         new='  return m.guardrail\n',
         tests=[PATHS], pattern='puts a guardrail on every rep'),
    dict(id='compiler-reads-own-guardrail', file='src/pathCheck.ts',
         old="  if (!builtIn) for (const m of reps) if ((m.with === 'adult' || m.record) && !guardrailOf(m, path.id)) say(",
         new="  if (!builtIn) for (const m of reps) if ((m.with === 'adult' || m.record) && !m.guardrail) say(",
         tests=[CHK], pattern='pass a well-formed Path the catalogue could add'),
    dict(id='recorded-rep-unguarded', file='src/pathCheck.ts',
         old="  if (!builtIn) for (const m of reps) if ((m.with === 'adult' || m.record) && !guardrailOf(m, path.id)) say(",
         new="  if (!builtIn) for (const m of reps) if (m.with === 'adult' && !guardrailOf(m, path.id)) say(",
         tests=[CHK], pattern=REFUSE),
    # P4, the speaking Path's pins in the catalogue.
    dict(id='speaking-share-four', file='src/catalogue.json',
         old='"rowShare": 3',
         new='"rowShare": 4',
         tests=[PATHS], pattern='keeps to itself'),
    dict(id='speaking-not-experimental', file='src/catalogue.json',
         old='"label": "experimental"',
         new='"label": "tested"',
         tests=[PATHS], pattern='is labelled experimental'),
    dict(id='speaking-gate-unconfirmed', file='src/catalogue.json',
         old='"strand": "speaking",\n            "stage": 1,\n            "met": 3,\n            "weeks": 2,\n            "confirmed": 1,',
         new='"strand": "speaking",\n            "stage": 1,\n            "met": 3,\n            "weeks": 2,\n            "confirmed": 0,',
         tests=[PATHS], pattern='with gates confirmed from outside the moment'),
    dict(id='speaking-help-reworded', file='src/catalogue.json',
         old='a doctor or a psychologist can help',
         new='an app can help',
         tests=[PATHS], pattern='opens with the two starting questions'),
    dict(id='speaking-counts-reactions', file='src/catalogue.json',
         old='        "anyone’s reaction, yes or no",\n',
         new='',
         tests=[PATHS], pattern='never counts anyone’s reaction'),
    # P3, the second reader: admitted only on the words a reader other than its drafter judged.
    dict(id='admitted-on-other-words', file='scripts/library-check.mjs',
         old='    if (c.status === \'admitted\' && c.support?.read !== judgedOf(c)) problems.push(',
         new='    if (false) problems.push(',
         tests=[LIB], pattern='admitted on words its reader did not judge'),
    dict(id='verdict-on-changed-words', file='scripts/library-reader.mjs',
         old='    else if (read !== judgedOf(c)) problems.push(',
         new='    else if (false) problems.push(',
         tests=[LIB], pattern='keeps a verdict only for the words laid out'),
    dict(id='admit-changed-words', file='scripts/library-reader.mjs',
         old='    else if (c.support.read !== judgedOf(c)) problems.push(',
         new='    else if (false) problems.push(',
         tests=[LIB], pattern='admits a card only on the words its reader judged'),
    dict(id='reading-unbound', file='scripts/library-reader.mjs',
         old='    else c.support = { reader: \'claude\', run, verdict: v.verdict, why: v.why.trim(), at: new Date().toISOString().slice(0, 10), read }\n',
         new='    else c.support = { reader: \'claude\', run, verdict: v.verdict, why: v.why.trim(), at: new Date().toISOString().slice(0, 10) }\n',
         tests=[LIB], pattern='keeps a verdict only for the words laid out'),
    # P3, certainty by rule.
    dict(id='single-study-above-low', file='src/libraryRules.ts',
         old='  if (single && level > 1) level = 1\n',
         new='',
         tests=[RULES], pattern='never puts a single study above low'),
    dict(id='failed-replication-kept', file='src/libraryRules.ts',
         old="  if (c.replication === 'failed') {\n    level = 0\n",
         new="  if (c.replication === 'failed') {\n",
         tests=[RULES], pattern='a finding that failed to replicate at very low'),
    dict(id='indirect-not-lowered', file='src/libraryRules.ts',
         old="  if (c.origin === 'indirect') down(c.mismatch ? `${REASON_WORDS.indirect}: ${c.mismatch}` : REASON_WORDS.indirect)\n",
         new='',
         tests=[RULES], pattern='goes down one level for each reason against'),
    # P4, the one screen read against your own week, with what it asks a week.
    dict(id='week-any-place-will-do', file='src/pathRead.tsx',
         old="      if (kinds.size && [...kinds].every((k) => k === 'recurring' || k === 'group')) out.push(st.name)\n",
         new="      if (kinds.size && [...kinds].some((k) => k === 'recurring' || k === 'group')) out.push(st.name)\n",
         tests=[FLOW], pattern='reads your week against its stages'),
    dict(id='week-church-ignored', file='src/pathRead.tsx',
         old='  return { office: Object.values(week.officeDays).filter(Boolean).length, church: week.churchDay !== null || week.thirdDay !== null }\n',
         new='  return { office: Object.values(week.officeDays).filter(Boolean).length, church: week.churchDay !== null }\n',
         tests=[FLOW], pattern='reads your week against its stages'),
    dict(id='minutes-of-the-longest', file='src/pathRead.tsx',
         old='  const typ = minutes[Math.floor(minutes.length / 2)]\n',
         new='  const typ = minutes[minutes.length - 1]\n',
         tests=[FLOW], pattern='says what it asks a week'),
    dict(id='least-sure-unsaid', file='src/pathRead.tsx',
         old="  const least = path.decisions?.find((d) => d.element === 'structure')?.uncertainty\n",
         new='  const least = undefined as string | undefined\n',
         tests=[E2E], pattern=FIRST_E2E),
    # P2, the sheet: the expectancy words, and the sheet kept after Partly.
    dict(id='sheet-expectancy-unwritten', file='src/pathMeasureUi.tsx',
         old='onTap={(e) => void setExpectancy(offerId, outcome?.expectancy === e ? null : e)} />',
         new='onTap={() => undefined} />',
         tests=[E2E], pattern=FIRST_E2E),
    dict(id='no-sheet-after-partly', file='src/pathCard.tsx',
         old='  const moveId = pt.repDone?.moveId ?? pt.repPartly\n',
         new='  const moveId = pt.repDone?.moveId\n',
         tests=[E2E], pattern='answered Partly at the next check-in'),
    # P4, the catalogue screen: a Path's strands, and a shared rep's guardrail as each Path shows it.
    dict(id='catalogue-one-strand', file='src/catalogueScreen.tsx',
         old='  const strands = strandsOf(path)\n',
         new='  const strands = strandsOf(path).slice(0, 1)\n',
         tests=[SMOKE], pattern=CATALOGUE),
    dict(id='catalogue-own-guardrail', file='src/catalogueScreen.tsx',
         old='      {guardrailOf(m, path.id) && <p class="move-status">{guardrailOf(m, path.id)}</p>}\n',
         new='      {m.guardrail && <p class="move-status">{m.guardrail}</p>}\n',
         tests=[SMOKE], pattern=CATALOGUE),
    # P4, its screens.
    dict(id='help-before-a-yes', file='src/pathRead.tsx',
         old='          {yes && (\n',
         new='          {true && (\n',
         tests=[E2E], pattern=FIRST_E2E),
    dict(id='answers-kept', file='src/pathRead.tsx',
         old='onClick={() => void startPath(path, start && focus ? strandsFor(path, focus, nervesOn) : activeStrands(path, {})).then(onDone)}',
         new='onClick={() => void startPath(path, [...(start && focus ? strandsFor(path, focus, nervesOn) : activeStrands(path, {})), ...Object.keys(answers)]).then(onDone)}',
         tests=[E2E], pattern=FIRST_E2E),
    dict(id='recorded-rep-checked-at-once', file='src/pathMeasureUi.tsx',
         old='      {!recorded && behaviours.length > 0 && (\n',
         new='      {behaviours.length > 0 && (\n',
         tests=[E2E], pattern=FIRST_E2E),
    dict(id='hand-over-when-alone', file='src/pathMeasureUi.tsx',
         old="  return Boolean(path.measurement?.strands.find((s) => s.strand === strand)?.handOver) && m.with === 'adult'\n",
         new='  return Boolean(path.measurement?.strands.find((s) => s.strand === strand)?.handOver)\n',
         tests=[E2E], pattern=FIRST_E2E),
    dict(id='two-starts', file='src/pathCard.tsx',
         old='          rep &&\n          !predicting && (\n',
         new='          rep && (\n',
         tests=[E2E], pattern=FIRST_E2E),
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
