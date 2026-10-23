"""The owner's six fixes of 2026-10-19, each rule undone once: the test that guards it must turn red.

Items 3 to 5 are fixed where the choices are kept, not only at the controls: a choice made by hand survives tab changes,
reloads, sync, recalibration and the app reopening.

Item 1: on a scheduled office day not marked Working from home, Out among people reads Yes and is not asked; the day keeps
whether the week scheduled it, an older day gains that once, and the chip row reads the day as made. Item 2: every morning
asks both Motivation and Confidence; a morning from before keeps its "not asked", in words for then. Items 3 and 4: a day
changed by hand is stamped and never given to a copy only made from the week, in the cloud, the queue or its second copy;
a writer of the day reads it inside its own write; this phone's own choices keep a second copy in local storage, written
as each action is done and at every start, and put back in one write after a cleared database. Item 5: naming a place says
at once that it is reading, its buttons wait, a rough reading is followed until it is good enough, and every outcome is
said. Item 6: "Out of town / traveling" wherever the trip is shown, its meaning kept, the stored names unchanged. And the two found
at their live check and agreed the same evening: a day read where the phone is, never as the UTC date of a stamp; and the
cue reading Now again when a slide or a fade on it ends.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by a browser test runs Playwright against the
built folder, so the app is rebuilt after its replacement and once more after its restore. The texts that span several
lines were copied from the source as it stood, never retyped.

python six_fixes_breaks.py [id ...]
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
S = 'e2e/smoke.spec.ts'
PW = 'e2e/postWindow.spec.ts'
TH = 'e2e/themes.spec.ts'
PE = 'src/people.test.ts'
PCH = 'src/phoneChoices.test.ts'
CL = 'src/cloud.test.ts'
LF = 'src/locationFlow.test.ts'
OFFICE = 'on a scheduled office day Out among people reads Yes'
BEFORE = 'a morning from before the owner'
NAMING = 'naming a place says at once'
TRIP = 'Away from home, previewed'
KEPT = 'keeps each choice by the time its action is done'
TRIP_OLD = "async function reshapeToday(today: string): Promise<void> {\n  const range = (await getSettings()).away\n  await db.transaction('rw', db.days, async () => {\n    const ctx = await db.days.get(today)\n    if (!ctx) return\n    const next = onTrip(range, today) ? awayShaped(ctx) : awayUnshaped(ctx)\n    if (next !== ctx) await db.days.put(next)\n  })\n}\n\n/**\n * Sets the trip, or changes the one set: both days, the end required. A trip under way keeps its\n * start; only its end may move. Refused while the gate is closed, or with the reason it cannot stand.\n */\nexport async function setAway(from: string, to: string, now: Date = new Date()): Promise<AwayProblem | 'gated' | null> {\n  if (!awayOn()) return 'gated'\n  const today = dayKey(now)\n  const current = (await getSettings()).away\n  const started = Boolean(current && current.from === from && current.from < today && onTrip(current, today))\n  const problem = awayProblem(from, to, today, started)\n  if (problem) return problem\n  await db.transaction('rw', [db.settings, db.days], async () => {\n    await updateSettings((s) => ({ ...s, away: { from, to, setAt: now.toISOString() } }))\n    await reshapeToday(today)\n  })\n  return null\n}\n"
TRIP_NEW = "async function reshapeToday(today: string): Promise<void> {\n  const ctx = await db.days.get(today)\n  if (!ctx) return\n  const range = (await getSettings()).away\n  const next = onTrip(range, today) ? awayShaped(ctx) : awayUnshaped(ctx)\n  if (next !== ctx) await db.days.put(next)\n}\n\n/**\n * Sets the trip, or changes the one set: both days, the end required. A trip under way keeps its\n * start; only its end may move. Refused while the gate is closed, or with the reason it cannot stand.\n */\nexport async function setAway(from: string, to: string, now: Date = new Date()): Promise<AwayProblem | 'gated' | null> {\n  if (!awayOn()) return 'gated'\n  const today = dayKey(now)\n  const current = (await getSettings()).away\n  const started = Boolean(current && current.from === from && current.from < today && onTrip(current, today))\n  const problem = awayProblem(from, to, today, started)\n  if (problem) return problem\n  await updateSettings((s) => ({ ...s, away: { from, to, setAt: now.toISOString() } }))\n  await reshapeToday(today)\n  return null\n}\n"
WHERE_OLD = "  return db.transaction('rw', db.days, async () => {\n    const ctx = await db.days.get(day)\n    if (!ctx) return false\n    const before = ctx.where?.[block] ?? []\n    const list = replacing && replacing !== where ? before.filter((w) => w !== replacing) : before\n    if (list.includes(where) && list.length === before.length) return false\n    await db.days.put({ ...ctx, where: { ...(ctx.where ?? {}), [block]: list.includes(where) ? list : [...list, where] } })\n    return !before.includes(where)\n  })\n"
WHERE_NEW = '  return (async () => {\n    const ctx = await db.days.get(day)\n    if (!ctx) return false\n    const before = ctx.where?.[block] ?? []\n    const list = replacing && replacing !== where ? before.filter((w) => w !== replacing) : before\n    if (list.includes(where) && list.length === before.length) return false\n    await db.days.put({ ...ctx, where: { ...(ctx.where ?? {}), [block]: list.includes(where) ? list : [...list, where] } })\n    return !before.includes(where)\n  })()\n'
RESTORE_OLD = "    await db.transaction('rw', [db.settings, db.places, db.placeMeta], async () => {\n      if (copy.secret && !(await db.placeMeta.get('secret'))) await db.placeMeta.put({ key: 'secret', value: copy.secret })\n      if ((await db.places.count()) === 0 && copy.places.length) await db.places.bulkAdd(copy.places.map((p) => ({ ...p })))\n      await updateSettings((s) => ({ ...s, location: copy.location, weather: copy.weather }))\n      await db.placeMeta.put({ key: MARK_KEY, value: copy.mark })\n    })\n"
RESTORE_NEW = "    await updateSettings((s) => ({ ...s, location: copy.location, weather: copy.weather }))\n    await db.transaction('rw', [db.places, db.placeMeta], async () => {\n      if (copy.secret && !(await db.placeMeta.get('secret'))) await db.placeMeta.put({ key: 'secret', value: copy.secret })\n      if ((await db.places.count()) === 0 && copy.places.length) await db.places.bulkAdd(copy.places.map((p) => ({ ...p })))\n      await db.placeMeta.put({ key: MARK_KEY, value: copy.mark })\n    })\n"

TABLE = [
    # Item 1, Out among people on a scheduled office day.
    dict(id='office-infers-among-people', file='src/people.ts',
         old='  return ctx.amongPeople === true || officeDayAtOffice(ctx)\n',
         new='  return ctx.amongPeople === true\n',
         tests=[PE], pattern='reads a scheduled office day at the office as out among people'),
    dict(id='working-from-home-asks', file='src/people.ts',
         old='  return ctx?.officeDay === true && ctx.atOffice === true\n',
         new='  return ctx?.officeDay === true\n',
         tests=[PE], pattern='reads a scheduled office day at the office as out among people'),
    dict(id='office-day-kept', file='src/db.ts',
         old='    officeDay: w.officeDays[weekday],\n',
         new='',
         tests=[PE], pattern='keeps on the day whether the week scheduled it'),
    dict(id='office-day-filled-in', file='src/db.ts',
         old='      if (existing.officeDay === undefined) patch.officeDay = settings.week.officeDays[weekday]\n',
         new='',
         tests=[PE], pattern='fills in a day made before it'),
    dict(id='office-day-filled-once', file='src/db.ts',
         old='      if (existing.officeDay === undefined) patch.officeDay = settings.week.officeDays[weekday]\n',
         new='      if (existing.officeDay !== null) patch.officeDay = settings.week.officeDays[weekday]\n',
         tests=[PE], pattern='fills in a day made before it'),
    dict(id='path-words-among-people', file='src/pathStage.ts',
         old=' : outAmongPeople(ctx) ? c.amongPeople : null\n',
         new=' : null\n',
         tests=['src/pathStage.test.ts'], pattern='out among people into its evening'),
    dict(id='chip-hidden-on-office-day', file='src/extras.tsx',
         old="          {!atOfficeToday && !sabbathToday && !chipRetired('amongPeople', states) && <ExtraRow",
         new="          {!sabbathToday && !chipRetired('amongPeople', states) && <ExtraRow",
         tests=[S], pattern=OFFICE),
    dict(id='office-row-from-the-day', file='src/extras.tsx',
         old='  const office = ctx.officeDay ?? settings.week.officeDays[weekday]\n',
         new='  const office = settings.week.officeDays[weekday]\n',
         tests=[S], pattern=OFFICE),
    # Item 2, both Motivation and Confidence every morning.
    dict(id='both-every-morning', file='src/settings.ts',
         old='  if (!at) return all\n',
         new="  if (!at) return all\n  if (block === 'morning') return all.filter((id) => id !== 'confidence')\n",
         tests=['src/askedDay.test.ts'], pattern='asks both every morning'),
    dict(id='before-words-summary', file='src/copy.ts',
         old="    notAskedWhy: 'Mornings then asked it in turn with {other}',\n",
         new="    notAskedWhy: 'Asked in turn with {other}, one each morning',\n",
         tests=[S], pattern=BEFORE),
    dict(id='before-words-overlay', file='src/copy.ts',
         old="    overlayNotAsked: '{reading}: not asked this morning, which asked Motivation and Confidence in turn.',\n",
         new="    overlayNotAsked: '{reading}: not asked today. Motivation and Confidence are asked in turn, one each morning.',\n",
         tests=[S], pattern=BEFORE),
    # Items 3 and 4, a day changed by hand: stamped, and never given to a copy only made from the week.
    dict(id='day-stamped', file='src/db.ts',
         old='changed: true, updatedAt: new Date().toISOString() })',
         new='changed: true })',
         tests=[CL], pattern='keeps the later of two changed copies'),
    dict(id='made-day-gives-way', file='src/cloudSync.ts',
         old="  } else if (local !== undefined && !(row.store === 'days' && givesWayToPulled(local, row))) {\n",
         new='  } else if (local !== undefined) {\n',
         tests=[CL], pattern='comes back as you left it'),
    dict(id='by-hand-keeps-against-made', file='src/cloudSync.ts',
         old="    if (row.store === 'days' && keepsAgainstPulled(local, row)) {\n",
         new="    if (row.store === 'none' && keepsAgainstPulled(local, row)) {\n",
         tests=[CL], pattern='keeps the later of two changed copies'),
    dict(id='queued-made-day-gives-way', file='src/cloudSync.ts',
         old="      if (madeAgain) await db.outbox.where('[store+key]').equals([row.store, row.key]).delete()\n      else if (queued.has(k)) continue\n",
         new='      if (queued.has(k)) continue\n',
         tests=[CL], pattern='comes back from the queue'),
    dict(id='pending-copy-keeps-by-hand', file='src/pendingCopy.ts',
         old="      if (c.row.store === 'days' && have && bodyByHand(have.row.body) && !bodyByHand(c.row.body)) continue\n",
         new='',
         tests=[CL], pattern='comes back from the queue'),
    dict(id='first-read-by-hand', file='src/cloudSync.ts',
         old='  days: (local) => dayByHand(local),\n',
         new='  days: (local) => local.changed === true,\n',
         tests=['src/freshIds.test.ts'], pattern='a learning week answered before the token'),
    dict(id='by-hand-week-answer', file='src/dayChoice.ts',
         old=' || d.weekAnswer !== undefined',
         new='',
         tests=['src/dayChoice.test.ts'], pattern=None),
    dict(id='by-hand-stamp', file='src/dayChoice.ts',
         old=" || (typeof d.updatedAt === 'string' && d.updatedAt !== '')",
         new='',
         tests=['src/dayChoice.test.ts'], pattern=None),
    dict(id='week-answer-stamped', file='src/repair/flow.ts',
         old="weekAnswer: yes ? 'yes' : 'notNow', updatedAt: new Date().toISOString() })",
         new="weekAnswer: yes ? 'yes' : 'notNow' })",
         tests=['src/repair/flow.test.ts'], pattern='stamps the day as changed by hand'),
    # A writer of the day reads it inside its own write: the trip, and the place written for a part of the day.
    dict(id='trip-reads-day-in-write', file='src/awayFlow.ts',
         old=TRIP_OLD,
         new=TRIP_NEW,
         tests=['src/postWindow.test.ts'], pattern='never undoes a chip tapped while the trip reshapes the day'),
    dict(id='place-reads-day-in-write', file='src/locationFlow.ts',
         old=WHERE_OLD,
         new=WHERE_NEW,
         tests=[LF], pattern='never undoes a chip tapped while the day'),
    # Item 4, this phone's own choices: a second copy in local storage, put back after a cleared database.
    dict(id='location-put-back', file='src/phoneChoices.ts',
         old='      await updateSettings((s) => ({ ...s, location: copy.location, weather: copy.weather }))\n',
         new='',
         tests=[PCH], pattern='keeps a copy from the first start'),
    dict(id='places-put-back', file='src/phoneChoices.ts',
         old='      if ((await db.places.count()) === 0 && copy.places.length) await db.places.bulkAdd(copy.places.map((p) => ({ ...p })))\n',
         new='',
         tests=[PCH], pattern='keeps a copy from the first start'),
    dict(id='key-put-back', file='src/phoneChoices.ts',
         old="      if (copy.secret && !(await db.placeMeta.get('secret'))) await db.placeMeta.put({ key: 'secret', value: copy.secret })\n",
         new='',
         tests=[PCH], pattern='keeps a copy from the first start'),
    dict(id='put-back-in-one-write', file='src/phoneChoices.ts',
         old=RESTORE_OLD,
         new=RESTORE_NEW,
         tests=[PCH], pattern='puts the choices back in one write'),
    dict(id='copy-follows-each-change', file='src/choicesWatch.ts',
         old="  target.addEventListener('complete', () => listener?.())\n",
         new="  target.addEventListener('complete', () => undefined)\n",
         tests=[PCH], pattern='keeps a copy from the first start'),
    dict(id='kept-when-turned-on', file='src/locationFlow.ts',
         old='  // Kept at once: the reading below can take its time, and the choice is made already (2026-10-19).\n  await keepChoices()\n',
         new='',
         tests=[PCH], pattern=KEPT),
    dict(id='kept-when-named', file='src/locationFlow.ts',
         old='  await keepChoices()\n  const settings = await getSettings()\n  const { day, block } = blockAt(now)\n',
         new='  const settings = await getSettings()\n  const { day, block } = blockAt(now)\n',
         tests=[PCH], pattern=KEPT),
    dict(id='kept-when-forgotten', file='src/locationFlow.ts',
         old='  await db.places.delete(id)\n  await keepChoices()\n',
         new='  await db.places.delete(id)\n',
         tests=[PCH], pattern=KEPT),
    dict(id='kept-when-turned-off', file='src/locationFlow.ts',
         old='  await updateSettings((s) => ({ ...s, location: { ...s.location, on: false } }))\n  await keepChoices()\n',
         new='  await updateSettings((s) => ({ ...s, location: { ...s.location, on: false } }))\n',
         tests=[PCH], pattern=KEPT),
    dict(id='start-writes-copy-again', file='src/phoneChoices.ts',
         old='  ready = true\n  await keepChoices()\n  return outcome\n',
         new='  ready = true\n  return outcome\n',
         tests=[PCH], pattern='writes the copy again from the database in use at every start'),
    dict(id='wipe-takes-copy', file='src/db.ts',
         old='  return wipeTables().then(clearPending).then(clearChoicesCopy)\n',
         new='  return wipeTables().then(clearPending)\n',
         tests=[PCH], pattern='a wipe takes the copy too'),
    dict(id='forget-keeps-mark', file='src/locationFlow.ts',
         old="    await db.placeMeta.where('key').noneOf(['dbMark']).delete()\n",
         new='    await db.placeMeta.clear()\n',
         tests=[PCH], pattern='Forget everything keeps the database'),
    # Item 5, naming a place: said at once, the buttons wait, a rough reading followed, every outcome said.
    dict(id='naming-watches', file='src/locationFlow.ts',
         old=': await watchForFix(NAMING_WAIT_MS, onFix)',
         new=': quick',
         tests=[LF], pattern='naming a place when the quick reading is too rough'),
    dict(id='watch-ends-at-once', file='src/locationFlow.ts',
         old='        // A position that comes after the wait has ended is no part of it.\n        if (done) return\n',
         new='',
         tests=[LF], pattern='naming a place when the quick reading is too rough'),
    dict(id='naming-says-reading', file='src/locationScreen.tsx',
         old='    setMsg(c.reading)\n',
         new='',
         tests=[S], pattern=NAMING),
    dict(id='naming-buttons-wait', file='src/locationScreen.tsx',
         old='disabled={reading !== null}',
         new='disabled={false}',
         tests=[S], pattern=NAMING),
    dict(id='naming-buttons-look-it', file='src/styles.css',
         old='.when-chip:disabled:not(.is-on) {\n  color: var(--faint);\n',
         new='.when-chip:disabled:not(.is-on) {\n',
         tests=[S], pattern=NAMING),
    dict(id='naming-says-rough', file='src/locationScreen.tsx',
         old='if (accuracy > PLACE_ACCURACY) setMsg(fill(c.readingRough',
         new='if (accuracy > Infinity) setMsg(fill(c.readingRough',
         tests=[S], pattern=NAMING),
    dict(id='naming-says-failure', file='src/locationScreen.tsx',
         old='      setMsg(fill(c.namedFailed, { error: e instanceof Error ? e.message : String(e) }))\n',
         new='      void e\n',
         tests=[S], pattern=NAMING),
    # Item 6, "Out of town / traveling", its meaning kept; stored names unchanged.
    dict(id='renamed-screen', file='src/copy.ts',
         old="    title: 'Out of town / traveling',\n",
         new="    title: 'Away from home',\n",
         tests=[PW], pattern=TRIP),
    dict(id='renamed-meaning', file='src/copy.ts',
         old="    about: 'Away from your normal local area, not at work, a park or a store nearby. For a trip",
         new="    about: 'For a trip",
         tests=[PW], pattern=TRIP),
    dict(id='renamed-row', file='src/copy.ts',
         old="    row: 'Out of town / traveling',\n",
         new="    row: 'Away from home',\n",
         tests=[PW], pattern=TRIP),
    dict(id='renamed-until', file='src/copy.ts',
         old="    until: 'Out of town until {to}.',\n",
         new="    until: 'Away from home until {to}.',\n",
         tests=[PW], pattern=TRIP),
    dict(id='renamed-history', file='src/copy.ts',
         old="    away: 'out of town',\n",
         new="    away: 'away from home',\n",
         tests=[TH], pattern='nocturne: the post-window features'),
    dict(id='renamed-facts', file='src/facts.ts',
         old='      ? `You are out of town, traveling, ${span}:',
         new='      ? `You are away from home on a trip, ${span}:',
         tests=['src/postWindow.test.ts'], pattern='says the day is out of town'),
    dict(id='renamed-place-words', file='src/facts.ts',
         old="away: 'out of town, in a different area' }",
         new="away: 'away from home, in a different area' }",
         tests=['src/locationFacts.test.ts'], pattern=None),
    dict(id='renamed-worker-day', file='worker/src/retrieval.ts',
         old="b.awayFromHome ? 'out of town, traveling' :",
         new="b.awayFromHome ? 'away from home on a trip' :",
         tests=['worker/src/postWindowOpen.test.ts'], pattern=None),
    # Found at the six fixes' live check and agreed the same evening (2026-10-19): a day read where the phone is, and the cue
    # reading Now again when a slide or a fade on it ends.
    dict(id='named-day-where-the-phone-is', file='src/locationScreen.tsx',
         old="formatDayShort(dayKey(new Date(p.learnedAt)))",
         new="formatDayShort(p.learnedAt.slice(0, 10))",
         tests=[S], pattern='says the day it was named there'),
    dict(id='aims-added-where-the-phone-is', file='src/usageFacts.ts',
         old="i.aims.map((a) => dayKey(new Date(a.createdAt))).filter(",
         new="i.aims.map((a) => a.createdAt.slice(0, 10)).filter(",
         tests=['src/usageFacts.test.ts'], pattern='counts a commitment by the day it was added where the phone is'),
    dict(id='cue-reads-after-a-slide', file='src/moveCue.tsx',
         old="    for (const e of SETTLED) main?.addEventListener(e, moved)\n",
         new="",
         tests=[S], pattern='the cue reads Now again when a slide on it ends'),
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
