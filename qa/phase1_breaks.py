"""Phase 1 of the next build (2026-11-12), one batch of small fixes: each new rule undone once, and the test that guards
it must turn red.

The Worker: the free chain reads of the sheet only what Claude may read under the owner's switches and the faith rule, for
the line and for the review, is told what was said lately only while the Brain's history is on, and reads faith as hidden
with no settings row; each of the Worker's rows is stamped at its write; a task's served sheet is kept in a row of its
own, read from an older task's own row, and bound to one start of its task; a quiet minute sends the database three
requests. The phone: its pull of the Worker's rows starts five minutes behind its watermark, holds back a run of equal
stamps, asks only for the stores it keeps, never moves its watermark back, and syncs when a row it waits on changed since
its last look. A commitment on a Path the phone does not know is offered nowhere and runs nothing; a screen that throws
says so, and its fault is kept by its name alone and rides the sheet to the Worker's report. Delete everything empties
the token's homes by name and says so when it cannot. A private item is named outside its screen only while the name
switch is on. The week-ahead card says a measured rate only from twenty scored forecasts. A cue names only the plans
whose own moment has come, and today's open plan is not counted as a cue that did not hold.

Not broken here: the service worker's one line that calls cuedPlans, which no test runs.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, an empty test list refused, and an id that matches no entry refused. Browser entries build before
and after their break. PW_CONFIG=<config> picks the Playwright config (default playwright.config.ts).

python phase1_breaks.py [id ...]
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
FREE = 'worker/src/freeChain.test.ts'
STAMPS = 'worker/src/writeStamps.test.ts'
CLAUDE = 'worker/src/claude.test.ts'
ASK = 'worker/src/ask.test.ts'
MINUTE = 'worker/src/minute.test.ts'
CLOUD = 'src/cloud.test.ts'
FAULTS = 'src/screenFaults.test.ts'
WIPE = 'src/wipe.test.ts'
WORDS = 'src/associationWords.test.ts'
WEEKLY = 'src/weeklyScreen.test.ts'
AIMS = 'src/aims.test.ts'
E2E = 'e2e/phase1.spec.ts'

TABLE = [
    # ---- The free chain under the owner's switches and the faith rule ----------------------------------------------
    dict(id='free-reads-what-claude-may', file='worker/src/retrieval.ts',
         old="  return forFreeChain(sheetForClaude(sheet, freeAccess(task, settings, prefs)))\n",
         new="  return forFreeChain(sheet)\n",
         tests=[FREE], pattern='loses exactly the facts of a category'),
    dict(id='free-line-bound', file='worker/src/brief.ts',
         old="  const sheet = sheetForFree(due.sheet, 'line', settings, prefs)\n",
         new="  const sheet = sheetForFree(due.sheet, 'line', { hideFaith: false }, null)\n",
         tests=[FREE], pattern='loses exactly the facts of a category'),
    dict(id='free-review-bound', file='worker/src/brief.ts',
         old="  const sheet = sheetForFree(whole, 'review', settings, prefs)\n",
         new="  const sheet = sheetForFree(whole, 'review', { hideFaith: false }, null)\n",
         tests=[FREE], pattern='loses exactly the facts of a category'),
    dict(id='free-faith-hidden', file='worker/src/brief.ts',
         old="  const sheet = sheetForFree(due.sheet, 'line', settings, prefs)\n",
         new="  const sheet = sheetForFree(due.sheet, 'line', { hideFaith: false }, prefs)\n",
         tests=[FREE], pattern='while faith is hidden'),
    dict(id='free-no-settings-closed', file='worker/src/retrieval.ts',
         old="  return accessFor(task, gatesFrom(settings), readBrainPrefs(prefs))\n",
         new="  return accessFor(task, gatesFrom(settings ?? {}), readBrainPrefs(prefs))\n",
         tests=[FREE], pattern='when no settings row can be read'),
    dict(id='free-said-follows-history', file='worker/src/brief.ts',
         old="said: freeAccess('line', settings, prefs).allowed('brainHistory') ? said : [], firm })",
         new="said, firm })",
         tests=[FREE], pattern='not told what was said lately'),
    dict(id='free-repeat-check-reads-all', file='worker/src/brief.ts',
         old="buildMessages(b), lineCheck(b, said), 4000",
         new="buildMessages(b), lineCheck(b), 4000",
         tests=[FREE], pattern='not told what was said lately'),
    # ---- The Worker's rows stamped at the write --------------------------------------------------------------------
    dict(id='stamp-at-the-write', file='worker/src/turso.ts',
         old="updatedAt, DEVICE, new Date().toISOString()] })\n",
         new="updatedAt, DEVICE, updatedAt] })\n",
         tests=[STAMPS], pattern='stamps each row'),
    dict(id='stamp-a-withdrawal', file='worker/src/turso.ts',
         old="args: [now, new Date().toISOString(), BRAIN_APP, id] })",
         new="args: [now, now, BRAIN_APP, id] })",
         tests=[STAMPS], pattern='stamps each row'),
    dict(id='stamp-in-memory', file='worker/src/turso.ts',
         old="  const stamp = () => new Date((last = Math.max(Date.now(), last + 1))).toISOString()\n",
         new="  const stamp = () => new Date((last = Date.parse('2026-01-01T00:00:00.000Z'))).toISOString()\n",
         tests=[STAMPS], pattern='in the store the tests use'),
    # ---- The served sheet in a row of its own ----------------------------------------------------------------------
    dict(id='served-off-the-task-row', file='worker/src/claude.ts',
         old="  await deps.store.writeTask({ ...t, briefingAt: deps.now.toISOString(), briefingBytes: bytesOf(text), ...(journal.length ? { journal } : {}) })\n",
         new="  await deps.store.writeTask({ ...t, briefingAt: deps.now.toISOString(), briefingBytes: bytesOf(text), served: built.run.served.served, ...(journal.length ? { journal } : {}) })\n",
         tests=[CLAUDE], pattern='kept in a row of its own'),
    dict(id='served-kept-at-first-serving', file='worker/src/claude.ts',
         old="  await keepServed(deps, t, built.run.served)\n",
         new="",
         tests=[CLAUDE], pattern='kept in a row of its own'),
    dict(id='served-older-task-read', file='worker/src/claude.ts',
         old="  if (t.served) return { served: t.served, kept: true }\n",
         new="",
         tests=[CLAUDE, ASK], pattern='an older task carries'),
    dict(id='served-one-start', file='worker/src/claude.ts',
         old="  if (row && row.taskAt === t.at) {\n",
         new="  if (row) {\n",
         tests=[CLAUDE], pattern='started again afresh'),
    dict(id='ask-served-off-the-task-row', file='worker/src/ask.ts',
         old="  await deps.store.writeTask({ ...run.t, briefingAt: deps.now.toISOString(), briefingBytes: bytesOf(text) })\n",
         new="  await deps.store.writeTask({ ...run.t, briefingAt: deps.now.toISOString(), briefingBytes: bytesOf(text), served: run.served.served })\n",
         tests=[ASK], pattern='never on the task’s row'),
    dict(id='ask-served-kept-at-briefing', file='worker/src/ask.ts',
         old="  await keepServed(deps, run.t, run.served)\n",
         new="",
         tests=[ASK], pattern='never on the task’s row'),
    dict(id='ask-served-kept-at-answer', file='worker/src/ask.ts',
         old="    await keepServed(deps, t, built.run.served)\n",
         new="",
         tests=[ASK], pattern='keeps that sheet for the retry'),
    dict(id='ask-served-no-coach-block', file='worker/src/ask.ts',
         old="  const served = await servedSheet(deps, t, { coach: false })\n",
         new="  const served = await servedSheet(deps, t)\n",
         tests=[ASK], pattern='never on the task’s row'),
    # ---- A quiet minute ---------------------------------------------------------------------------------------------
    dict(id='minute-runs-in-one-request', file='worker/src/ask.ts',
         old="  return store.readTasks([...askTaskIds(day), deepTaskId(day), ...handTaskIds(day)])\n",
         new="  return (await Promise.all([...askTaskIds(day), deepTaskId(day), ...handTaskIds(day)].map((id) => store.readTask(id)))).filter((t): t is TaskRow => t !== null)\n",
         tests=[MINUTE], pattern='three requests'),
    dict(id='minute-answers-only-when-waiting', file='worker/src/ask.ts',
         old="  if (!rows.length) return []\n  const answered = await store.answerIds()\n",
         new="  const answered = await store.answerIds()\n",
         tests=[MINUTE], pattern='three requests'),
    # ---- The phone's pull of the Worker's rows ---------------------------------------------------------------------
    dict(id='pull-starts-behind', file='src/cloudSync.ts',
         old="export const BRAIN_OVERLAP_MS = 5 * 60_000\n",
         new="export const BRAIN_OVERLAP_MS = 0\n",
         tests=[CLOUD], pattern='stamped before one it has already read'),
    dict(id='pull-five-minutes-no-more', file='src/cloudSync.ts',
         old="export const BRAIN_OVERLAP_MS = 5 * 60_000\n",
         new="export const BRAIN_OVERLAP_MS = 7 * 60_000\n",
         tests=[CLOUD], pattern='stamped before one it has already read'),
    dict(id='pull-whole-runs', file='src/cloudSync.ts',
         old="    const rows = wholeRuns(page, PAGE)\n    after = ",
         new="    const rows = page\n    after = ",
         tests=[CLOUD], pattern='a run stamped alike'),
    dict(id='pull-kept-stores-only', file='src/cloudSync.ts',
         old="    const page = await store.pull(BRAIN_APP, after, PAGE, BRAIN_STORES)\n",
         new="    const page = await store.pull(BRAIN_APP, after, PAGE)\n",
         tests=[CLOUD], pattern='asks only for the stores it keeps'),
    dict(id='pull-watermark-forward', file='src/cloudSync.ts',
         old="      if (after > meta.watermark) await db.cloudMeta.put(",
         new="      await db.cloudMeta.put(",
         tests=[CLOUD], pattern='cut short part way'),
    dict(id='look-sees-a-change', file='src/cloudSync.ts',
         old="      if ((at && at > watermark) || (before !== undefined && before !== at)) changed = true\n",
         new="      if (at && at > watermark) changed = true\n",
         tests=[CLOUD], pattern='not as its last look saw it'),
    dict(id='store-filter-in-memory', file='src/cloudStore.ts',
         old=" && (!stores?.length || stores.includes(r.store)))",
         new=")",
         tests=[CLOUD], pattern='asks only for the stores it keeps'),
    # ---- A Path the phone does not know, and a screen that throws --------------------------------------------------
    dict(id='unknown-path-not-offered', file='src/pathVersions.ts',
         old="  if (!path) return false\n",
         new="  if (!path) return true\n",
         tests=[FAULTS], pattern='is offered nowhere'),
    dict(id='unknown-path-not-on', file='src/pathFlow.ts',
         old=" && !a.pausedAt && findPath(a.path as PathId) !== undefined\n",
         new=" && !a.pausedAt\n",
         tests=[FAULTS], pattern='is not on'),
    dict(id='fault-by-name-alone', file='src/screenFaults.ts',
         old="    const name = plain((error as { name?: unknown } | null)?.name, 'Error')\n",
         new="    const name = String((error as { message?: unknown } | null)?.message ?? 'Error')\n",
         tests=[FAULTS], pattern='never by its message'),
    dict(id='fault-name-letters-only', file='src/screenFaults.ts',
         old="const plain = (v: unknown, otherwise: string): string => (typeof v === 'string' && /^[A-Za-z]{1,40}$/.test(v) ? v : otherwise)\n",
         new="const plain = (v: unknown, otherwise: string): string => (typeof v === 'string' ? v : otherwise)\n",
         tests=[FAULTS], pattern='letters alone'),
    dict(id='fault-rides-the-sheet', file='src/brainFlow.ts',
         old="  if (screens) sheet.screenFault = screens\n",
         new="",
         tests=[FAULTS], pattern='rides the Brain’s sheet'),
    dict(id='fault-rewrites-the-row', file='src/brainFlow.ts',
         old="same('storageFault') && same('screenFault') && same('assocFault') && existing.sheet.showPrivate",
         new="same('storageFault') && same('assocFault') && existing.sheet.showPrivate",
         tests=[FAULTS], pattern='only a screen fault is new'),
    dict(id='fault-in-the-report', file='worker/src/engineReport.ts',
         old=", screens: newest?.sheet.screenFault ?? null, associations:",
         new=", screens: null, associations:",
         tests=['worker/src/engineReport.test.ts'], pattern='a screen that threw'),
    dict(id='guard-around-the-screen', file='src/app.tsx',
         old="        <ScreenGuard key={view.kind === 'tabs' ? `tab.${tab}` : view.kind} screen={view.kind === 'tabs' ? tab : view.kind} onLeave={view.kind === 'tabs' ? undefined : closeAll}>\n          {content()}\n        </ScreenGuard>\n",
         new="        {content()}\n",
         tests=[E2E], pattern='says so, tries again'),
    dict(id='guard-way-back', file='src/app.tsx',
         old=" onLeave={view.kind === 'tabs' ? undefined : closeAll}>",
         new=">",
         tests=[E2E], pattern='can be left'),
    dict(id='evidence-skips-unknown-path', file='src/pathEvidence.tsx',
         old=".filter((id) => findPath(id) !== undefined)",
         new="",
         tests=[E2E], pattern='shows no row and breaks no screen'),
    # ---- Delete everything and the token's homes -------------------------------------------------------------------
    dict(id='wipe-empties-token-homes', file='src/db.ts',
         old=".then(clearChoicesCopy).then(clearTokenHomes)\n",
         new=".then(clearChoicesCopy).then(() => true)\n",
         tests=[WIPE], pattern='leaves no token in either home'),
    dict(id='wipe-all-four-homes', file='src/tokenVault.ts',
         old="  const keys = [MIRROR_KEY, MARK_KEY, LOG_KEY, DEVICE_KEY]\n",
         new="  const keys = [MIRROR_KEY, MARK_KEY]\n",
         tests=[WIPE], pattern='leaves no token in either home'),
    dict(id='wipe-says-when-stuck', file='src/tokenVault.ts',
         old="    return keys.every((key) => kv.getItem(key) === null)\n",
         new="    return true\n",
         tests=[WIPE], pattern='will not let the token go'),
    dict(id='wipe-on-the-screen', file='src/db.ts',
         old=".then(clearChoicesCopy).then(clearTokenHomes)\n",
         new=".then(clearChoicesCopy).then(() => true)\n",
         tests=[E2E], pattern='after Delete everything and a restart'),
    # ---- Private names under the name switch -----------------------------------------------------------------------
    dict(id='private-unnamed-on-evidence', file='src/associationWords.ts',
         old="  const c = copy.evidence\n  const a = p.association\n  const name = named ? p.name : c.privateUnnamed\n",
         new="  const c = copy.evidence\n  const a = p.association\n  const name = p.name\n",
         tests=[WORDS], pattern='only while the name switch is on'),
    dict(id='private-unnamed-on-the-card', file='src/associationWords.ts',
         old="  const c = copy.move\n  const a = p.association\n  const name = named ? p.name : c.privateUnnamed\n",
         new="  const c = copy.move\n  const a = p.association\n  const name = p.name\n",
         tests=[WORDS], pattern='only while the name switch is on'),
    dict(id='evidence-reads-the-switch', file='src/evidenceScreen.tsx',
         old="{privateLineWords(p, nameOf(p.alternativeId), namesShown)}",
         new="{privateLineWords(p, nameOf(p.alternativeId), true)}",
         tests=[E2E], pattern='named on Evidence only while'),
    dict(id='card-reads-the-switch', file='src/moveCard.tsx',
         old="{privateInlineWords(p, moveById(p.alternativeId).name, namesShown)}",
         new="{privateInlineWords(p, moveById(p.alternativeId).name, true)}",
         tests=[E2E], pattern='named on the move card only while'),
    # ---- The week-ahead card's sentence ----------------------------------------------------------------------------
    dict(id='measured-from-twenty', file='src/weeklyScreen.tsx',
         old="export const MEASURED_FROM = 20\n",
         new="export const MEASURED_FROM = 5\n",
         tests=[WEEKLY], pattern='until twenty day-ahead forecasts are scored'),
    dict(id='never-a-rate-unmeasured', file='src/weeklyScreen.tsx',
         old="  if (sc.scored < MEASURED_FROM || sc.hitRate === null) return c.modelBuilt\n",
         new="  if (sc.hitRate === null) return c.modelBuilt\n",
         tests=[WEEKLY], pattern='until twenty day-ahead forecasts are scored'),
    dict(id='measured-as-counted', file='src/weeklyScreen.tsx',
         old="hits: String(Math.round(sc.hitRate * sc.scored)),",
         new="hits: String(Math.round(0.6 * sc.scored)),",
         tests=[WEEKLY], pattern='what was counted from the twentieth on'),
    # ---- Cues -------------------------------------------------------------------------------------------------------
    dict(id='cue-at-its-own-moment', file='src/aims.ts',
         old="minutesOf(p.remindAt ?? p.time) <= minute - (followUp ? 40 : 0)",
         new="minutesOf(p.time) <= minute - (followUp ? 40 : 0)",
         tests=[AIMS], pattern='whose own moment has come'),
    dict(id='cue-count-leaves-today-open', file='src/aims.ts',
         old="    if (day === today && plan.offerId === null) continue\n",
         new="",
         tests=[AIMS], pattern='while it is still open'),
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
