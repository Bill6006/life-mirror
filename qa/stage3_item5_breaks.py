"""Stage 3, item 5's deliberate breaks (designed 2026-10-17): each undoes one rule, and the test that guards it must turn red.

The check-in and the readings put to use: the optional taps above the move and a move drawn again when the day
changes (part 1); Out among people today (part 7); sleep asked late (part 2); Motivation and Confidence in turn
(part 4); Outside a while today (part 5); Something sweet and when the last caffeine was (part 8); Social energy
steering the People row (part 3); the expectancy tap (part 9); your own chips (part 6); and the newer chips counted
and compared only where they were shown (Rule 2).

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for
byte, the table read as data, and an empty test list refused. A break guarded by a unit test runs Vitest; one guarded
by a browser test runs Playwright against the built folder, so the app is rebuilt after its replacement and once more
after its restore.

python stage3_item5_breaks.py [id ...]
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
R = 'src/redraw.test.ts'
A = 'src/askedDay.test.ts'
AU = 'src/audit.test.ts'
CH = 'src/chips.test.ts'
WK = 'src/weekly.test.ts'
NAT = 'src/nature.test.ts'
ST = 'src/steer.test.ts'
EX = 'src/expectancy.test.ts'
OW = 'src/ownChips.test.ts'
PE = 'src/people.test.ts'
EXP = 'src/export.test.ts'
REDRAW = 'a chip that changes the day draws an untouched move again'
AMONG = 'Out among people today, the fourth chip'
LATE = 'the afternoon asks the two sleep readings first'
CHIPS = 'time in nature and Something sweet'
EXPECT = 'after a People rep is done, one optional tap'
OWN = 'your own chips, added in Settings'

TABLE = [
    # Part 1: the optional taps above the move, and a move drawn again when a chip changes the day.
    dict(id='redraw-answered', file='src/offerFlow.ts',
         old="    if ((await db.outcomes.where('offerId').equals(offer.id).count()) > 0) return null\n",
         new="",
         tests=[R], pattern='leaves a move alone once it is (answered|done)'),
    dict(id='redraw-put-off', file='src/offerFlow.ts',
         old="    if (!offer || offer.id === undefined || offer.closedAt !== null || offer.deferredAt) return null\n",
         new="    if (!offer || offer.id === undefined) return null\n",
         tests=[R], pattern='leaves a move alone once it is put off'),
    dict(id='redraw-block-open', file='src/offerFlow.ts',
         old="    if (slot.day !== day || slot.block !== block) return null\n    const offer = await offerForSlot(day, block)\n",
         new="    const offer = await offerForSlot(day, block)\n",
         tests=[R], pattern='leaves a move alone once it is put off'),
    dict(id='redraw-may-be-nothing', file='src/offerFlow.ts',
         old="o.skippedAt !== null && !setAside(o)).count()) > 0",
         new="o.skippedAt !== null).count()) > 0",
         tests=[R], pattern='sets an untouched move aside'),
    dict(id='redraw-not-offered', file='src/facts.ts',
         old="o.day <= today && (o.kind === 'block' || o.kind === 'pickup') && !setAside(o))",
         new="o.day <= today && (o.kind === 'block' || o.kind === 'pickup'))",
         tests=[R], pattern='is not among the week'),
    dict(id='redraw-not-nothing', file='src/evidenceFlow.ts', tests=['src/redraw.test.ts'],
         old='const nulls = offers.filter((o) => o.moveId === NOTHING && !setAside(o))',
         new='const nulls = offers.filter((o) => o.moveId === NOTHING)', pattern='is not among Nothing extra'),
    dict(id='redraw-not-a-skip-of-yours', file='src/usageFacts.ts',
         old="&& !setAside(o) && hasMove(o.moveId)",
         new="&& hasMove(o.moveId)",
         tests=[R], pattern='is no suggestion you skipped again and again'),
    dict(id='redraw-on-chip', file='src/extras.tsx',
         old="void setDayContext(day, patch).then(() => redrawForDay(day, block))",
         new="void setDayContext(day, patch)",
         tests=[S], pattern=REDRAW),
    dict(id='redraw-card-says', file='src/moveCard.tsx',
         old="      {offer.redrawn && (\n",
         new="      {false && offer.redrawn && (\n",
         tests=[S], pattern=REDRAW),
    dict(id='redraw-history', file='src/movesScreen.tsx',
         old="const status = setAside(offer) ? h.dayChanged : offer.skippedAt",
         new="const status = offer.skippedAt",
         tests=[S], pattern=REDRAW),
    dict(id='taps-above-move', file='src/checkin.tsx',
         old="      {block !== 'evening' && <CaffeineCard day={day} block={block} />}\n      {block === 'afternoon' && complete && <SweetChip record={record} />}\n      {block !== 'evening' && <TodayChips day={day} block={block} onAway={onAway} />}\n\n      {complete && offer && !settings.hideMoves && <MoveCard offer={offer} compact />}\n",
         new="      {complete && offer && !settings.hideMoves && <MoveCard offer={offer} compact />}\n      {block !== 'evening' && <CaffeineCard day={day} block={block} />}\n      {block === 'afternoon' && complete && <SweetChip record={record} />}\n      {block !== 'evening' && <TodayChips day={day} block={block} onAway={onAway} />}\n",
         tests=[S], pattern=REDRAW),
    dict(id='export-set-aside', file='src/export.ts',
         old="skipped: o.skippedAt !== null && !setAside(o),",
         new="skipped: o.skippedAt !== null,",
         tests=[EXP], pattern='shows a move set aside'),
    # Part 7: Out among people today.
    # Restated 2026-10-19: Out among people is read through outAmongPeople since the owner's office-day fix.
    dict(id='among-people-around', file='src/people.ts',
         old="  return ctx.amongPeople === true || officeDayAtOffice(ctx)\n",
         new="  return officeDayAtOffice(ctx)\n",
         tests=[PE], pattern='reads Out among people today'),
    dict(id='among-people-chip', file='src/extras.tsx',
         old="{!atOfficeToday && !chipRetired('amongPeople', states) && <ExtraRow label={copy.today.amongPeople}",
         new="{false && !atOfficeToday && !chipRetired('amongPeople', states) && <ExtraRow label={copy.today.amongPeople}",
         tests=[S], pattern=AMONG),
    dict(id='among-people-seen', file='src/extras.tsx',
         old="useChipsSeen(cardRef, { day, block }, record && ctx && !atOfficeToday && !chipRetired('amongPeople', states) && !record.extras?.chipsShown?.amongPeople ? ['amongPeople'] : [])",
         new="useChipsSeen(cardRef, { day, block }, [])",
         tests=[S], pattern=AMONG),
    # Part 2: sleep asked late.
    dict(id='late-asked', file='src/settings.ts',
         old="  if (block === 'afternoon') return [...SLEEP_READINGS.filter((id) => !retired.includes(id) && at.morning?.answers[id] === undefined), ...all]\n",
         new="",
         tests=[A], pattern='asks the two sleep readings first'),
    dict(id='late-only-unanswered', file='src/settings.ts',
         old="!retired.includes(id) && at.morning?.answers[id] === undefined), ...all]",
         new="!retired.includes(id)), ...all]",
         tests=[A], pattern='asks the two sleep readings first'),
    dict(id='late-never-retired', file='src/settings.ts',
         old="SLEEP_READINGS.filter((id) => !retired.includes(id) && at.morning",
         new="SLEEP_READINGS.filter((id) => at.morning",
         tests=[A], pattern='never a sleep reading you retired'),
    dict(id='late-mornings-alone', file='src/associations.ts',
         old="    .filter((c) => c.block === 'morning' && c.day < today && include(c))\n",
         new="    .filter((c) => (c.block === 'morning' || c.block === 'afternoon') && c.day < today && include(c))\n",
         tests=[A], pattern='never sets a late answer'),
    dict(id='late-mark', file='src/db.ts',
         old="  return c.block === 'afternoon' ? askedOf(c).filter((id) => SLEEP_READINGS.includes(id)) : []\n",
         new="  return []\n",
         tests=[A], pattern='marks them asked late'),
    dict(id='late-fact', file='src/facts.ts',
         old="  const slept = morning?.answers.sleepHours ?? lateSlept\n",
         new="  const slept = morning?.answers.sleepHours\n",
         tests=[A], pattern='carries the afternoon'),
    dict(id='late-context-fact', file='src/facts.ts',
         old="      const late = askedLate(latest).includes(id)\n",
         new="      const late = false\n",
         tests=[A], pattern='carries the afternoon'),
    dict(id='late-line', file='src/situations.ts',
         old="when: num(f, 'late') === 1 ? copy.brain.shortNightWhen.late : copy.brain.shortNightWhen.morning",
         new="when: copy.brain.shortNightWhen.morning",
         tests=[A], pattern='has the short-night line say when'),
    dict(id='late-on-screen', file='src/checkin.tsx',
         old="      {block === 'afternoon' && SLEEP_READINGS.includes(id) && (\n",
         new="      {false && block === 'afternoon' && SLEEP_READINGS.includes(id) && (\n",
         tests=[S], pattern=LATE),
    dict(id='late-on-summary', file='src/checkin.tsx',
         old="{askedLate(record).includes(id) && <span class=\"sub\">{copy.summary.askedLate}</span>}",
         new="",
         tests=[S], pattern=LATE),
    # Part 4's turns were withdrawn at the owner's word on 2026-10-19 (both every morning, never one in turn to save a
    # tap): six_fixes_breaks.py carries both-every-morning. The day still reaches
    # the phone's check-in, for the sleep readings asked late.
    dict(id='late-on-the-phone', file='src/checkin.tsx',
         old="askedReadings(block, depth, retired, { day, morning: morning ?? null })",
         new="askedReadings(block, depth, retired)",
         tests=[S], pattern=LATE),
    # Parts 5 and 8, and Rule 2: the newer chips, counted and compared only where shown.
    dict(id='shown-compare', file='src/chips.ts',
         old="  if (!SHOWN_CHIPS.includes(key)) return true\n",
         new="  return true\n",
         tests=[CH], pattern='compared only where shown'),
    dict(id='shown-retire', file='src/audit.ts',
         old="    nature: showed('nature'),\n",
         new="    nature: evenings,\n",
         tests=[AU], pattern='never stops one over the record from before it existed'),
    dict(id='sweet-by-the-day', file='src/audit.ts',
         old="    sweet: perDay(showed('sweet')),\n",
         new="    sweet: showed('sweet'),\n",
         tests=[AU], pattern='by the day'),
    dict(id='shown-best-days', file='src/weekly.ts',
         old="controlled.push(countShown('sweet', (d) => Boolean(byDay.get(d)?.some((c) => c.extras?.sweet)), 'something sweet'))",
         new="controlled.push(count('something sweet', (d) => Boolean(byDay.get(d)?.some((c) => c.extras?.sweet))))",
         tests=[WK], pattern='only over the days that showed it'),
    dict(id='shown-last-night', file='src/forecastFlow.ts',
         old="eventTest(key, ctxByDay, outside, natureMoves), known(key)) }))",
         new="eventTest(key, ctxByDay, outside, natureMoves), key === 'caffeine' ? caffeineKnown : undefined) }))",
         tests=[CH], pattern='sets it only against the evenings that showed it'),
    dict(id='shown-marked', file='src/chipsSeen.ts',
         old="        void markChipsShown(slot, seen.map((e) => (e.target as HTMLElement).dataset.chip as string))\n",
         new="",
         tests=[S], pattern=CHIPS),
    dict(id='shown-exported', file='src/export.ts',
         old="      chipsShown: shownNames(c),\n",
         new="      chipsShown: [],\n",
         tests=[EXP], pattern='carries the new chips'),
    dict(id='outside-nature', file='src/facts.ts',
         old="assocFact('assoc.nature', ['nature'],",
         new="assocFact('assoc.nature', [],",
         tests=[NAT], pattern='compares the evening of and the morning after'),
    dict(id='sweet-afternoon', file='src/checkin.tsx',
         old="      {block === 'afternoon' && complete && <SweetChip record={record} />}\n",
         new="",
         tests=[S], pattern=CHIPS),
    dict(id='caffeine-last-after-a-band', file='src/caffeine.tsx',
         old="const lastShowing = showing && Boolean(record?.extras?.caffeineIntake) &&",
         new="const lastShowing = showing &&",
         tests=[S], pattern=CHIPS),
    dict(id='caffeine-last-kept', file='src/db.ts',
         old="caffeineIntake: last === null ? rest : { ...rest, last } }",
         new="caffeineIntake: rest }",
         tests=[S], pattern=CHIPS),
    # Part 3: Social energy steering the People row.
    dict(id='steer-draws-only', file='src/pathStage.ts',
         old="  if (!steer || pick?.rule !== 'draw') return pick\n",
         new="  if (!steer || !pick) return pick\n",
         tests=[ST], pattern='own rules stand'),
    dict(id='steer-calls-and-messages', file='src/pathStage.ts',
         old="return steer === 'remote' ? !inPerson(m) && (m.settings ?? []).includes('remote') : inPerson(m)",
         new="return steer === 'remote' ? m.with === 'remote' : inPerson(m)",
         tests=[ST], pattern='holds both kinds at stage 3'),
    dict(id='steer-in-person', file='src/pathStage.ts',
         old="(m.settings ?? []).includes('remote') : inPerson(m)",
         new="(m.settings ?? []).includes('remote') : (m.settings ?? []).length > 0",
         tests=[ST], pattern='draws among the reps in person on a high morning'),
    dict(id='steer-a-call-is-a-call', file='src/pathStage.ts',
         old="const toward = steer === 'remote' ? kept.map((m) => ({ ...m, settings: ['remote'] as SettingKind[] })) : kept",
         new="const toward = kept",
         tests=[ST], pattern='is done as a call or a message toward one'),
    dict(id='steer-said', file='src/pathStage.ts',
         old="  const rule = pick.steer && (pick.rule === 'draw' || pick.rule === 'only')\n",
         new="  const rule = false && pick.steer && (pick.rule === 'draw' || pick.rule === 'only')\n",
         tests=[ST], pattern='says'),
    dict(id='steer-kept-with-the-step', file='src/pathFlow.ts',
         old="      ...(pick.steer ? { steer: pick.steer } : {}),\n",
         new="",
         tests=[ST], pattern='is written on the offer'),
    dict(id='steer-read-on-the-row', file='src/pathStage.ts',
         old="steeredPick(path, elig.eligible, steerOf(i.socialEnergy), entries,",
         new="steeredPick(path, elig.eligible, null, entries,",
         tests=[ST], pattern='reads this morning'),
    # Part 9: the expectancy tap after a People rep, reflection only.
    dict(id='expect-reflection-only', file='src/pathStage.ts',
         old="  const answer = new Map(outcomes.map((x) => [x.offerId, x.outcome]))\n",
         new="  const answer = new Map(outcomes.map((x) => [x.offerId, x.expectancy === 'harder' ? 'no' : x.outcome]))\n",
         tests=[EX], pattern='never moves a stage'),
    dict(id='expect-retires', file='src/expectancy.ts',
         old="  return asked.length >= EXPECTANCY_UNUSED_RETIRES && asked.every((x) => !x.expectancy)\n",
         new="  return false\n",
         tests=[EX], pattern='stops after a dozen'),
    dict(id='expect-counts-done', file='src/expectancy.ts',
         old="if (!ids.has(x.offerId) || x.outcome !== 'done' || !x.expectancy) continue",
         new="if (!ids.has(x.offerId) || !x.expectancy) continue",
         tests=[EX], pattern='counts this path'),
    dict(id='expect-after-done', file='src/pathCard.tsx',
         old="        done && p.askExpect && justDone !== null ? (\n",
         new="        false && done && p.askExpect && justDone !== null ? (\n",
         tests=[S], pattern=EXPECT),
    dict(id='expect-asked-marked', file='src/pathCard.tsx',
         old="  useEffect(() => void markExpectancyAsked(offerId), [offerId])\n",
         new="",
         tests=[S], pattern=EXPECT),
    dict(id='expect-counted-in-details', file='src/pathCard.tsx',
         old="          {p.expect && (\n",
         new="          {false && p.expect && (\n",
         tests=[S], pattern=EXPECT),
    # Part 6: your own chips.
    dict(id='own-three-at-most', file='src/settings.ts',
         old="ownChipsOf(s).length >= OWN_CHIPS_MAX) return s",
         new="ownChipsOf(s).length > OWN_CHIPS_MAX) return s",
         tests=[OW], pattern='three at most'),
    dict(id='own-stored-untouched', file='src/settings.ts',
         old="ownChips: [...(Array.isArray(s.ownChips) ? s.ownChips : []), ",
         new="ownChips: [...allOwnChips(s), ",
         tests=[OW], pattern='never rewrites a stored entry'),
    dict(id='own-where-shown', file='src/ownChips.ts',
         old="  return Boolean(c.extras?.chipsShown?.[ownShownKey(id)] || c.extras?.own?.[id])\n",
         new="  return true\n",
         tests=[OW], pattern='only where shown'),
    dict(id='own-off-the-sheet', file='src/brainFlow.ts',
         old="direction: settings.direction, usual",
         new="direction: settings.ownChips?.[0]?.label ?? settings.direction, usual",
         tests=[OW], pattern='is left off every fact'),
    dict(id='own-on-the-view', file='src/forecastFlow.ts',
         old="new Set(outside.map((o) => o.day)), ownChipsOf(settings)),",
         new="new Set(outside.map((o) => o.day))),",
         tests=[OW], pattern='is left off every fact'),
    dict(id='own-asked-at-evening', file='src/extras.tsx',
         old="          {own.map((ch) => {\n",
         new="          {own.slice(0, 0).map((ch) => {\n",
         tests=[S], pattern=OWN),
    dict(id='own-where-it-goes', file='src/settingsScreen.tsx',
         old="            {c.where}\n",
         new="",
         tests=[S], pattern=OWN),
    dict(id='own-on-evidence', file='src/evidenceScreen.tsx',
         old="      <OwnChipsEvidence today={today} />\n",
         new="",
         tests=[S], pattern=OWN),
    dict(id='own-exported', file='src/export.ts',
         old="    ...ownAll.map((ch) => yesNo(Boolean(c.extras?.own?.[ch.id]))),\n",
         new="    ...ownAll.map(() => ''),\n",
         tests=[EXP], pattern='carries your own chips'),
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
