"""Stage 1's deliberate breaks: each undoes one fix, and its test must turn red.

For every entry: the test must first be green (a revert kill needs a green baseline), then the one
exact replacement is made, the test must fail, and the file is always restored byte for byte. The
table is data; nothing in it is executed but the test command.

python stage1_breaks.py [id ...]
"""
import io
import os
import re
import subprocess
import sys

# The repository root: this folder's parent.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace('\\', '/') + '/'
NPX = 'npx.cmd' if os.name == 'nt' else 'npx'

TABLE = [
    # a. each reading in its own direction
    dict(id='a-now-direction', file='src/brief.tsx',
         old="  const raw = (INGREDIENTS[m.target] ?? 'up') === 'down' ? -m.effect : m.effect\n",
         new="  const raw = m.effect\n",
         tests=['src/brief.test.ts']),
    # b. reminders follow the owner's settings
    dict(id='b-reminders-off', file='worker/src/cues.ts',
         old="  if (!s.enabled) return { sent: false, due: null, reason: 'reminders are off' }\n",
         new="",
         tests=['worker/src/cues.test.ts'], pattern='sends nothing at all while reminders are off'),
    dict(id='b-ping-quiet-hours', file='worker/src/cues.ts',
         old="  if (inQuietHours(hhmmAt(minute), s)) return { sent: false, due, reason: 'quiet hours' }\n",
         new="",
         tests=['worker/src/cues.test.ts'], pattern='never in quiet hours'),
    dict(id='b-cue-quiet-and-paused', file='worker/src/cues.ts',
         old="    if (inQuietHours(hhmmAt(minute), settings) || !(await cueable(store, p.aimId))) continue\n",
         new="",
         tests=['worker/src/cues.test.ts'], pattern='a plan cue keeps quiet hours'),
    # c. a replaced plan is never counted
    dict(id='c-usage-latest-plan', file='src/usageFacts.ts',
         old="  const plans = latestPlans(i.intentions).filter((p) => own.has(p.aimId))\n",
         new="  const plans = i.intentions.filter((p) => own.has(p.aimId))\n",
         tests=['src/usageFacts.test.ts'], pattern='count plans for your own commitments'),
    dict(id='c-since-latest-plan', file='src/facts.ts',
         old="    const plans = latestPlans(i.intentions).filter((p) => p.aimId === aimId && p.setAt > at)\n",
         new="    const plans = i.intentions.filter((p) => p.aimId === aimId && p.setAt > at)\n",
         tests=['src/brainFlow.test.ts'], pattern='carries last week'),
    # d. the next check-in cue names only a check-in the day holds
    dict(id='d-next-check-in', file='src/aims.ts',
         old="  const held = ctx?.checkIns ? activeBlocks(ctx.checkIns.frequency) : BLOCKS\n",
         new="  const held = BLOCKS\n",
         tests=['src/aims.test.ts'], pattern='names only a check-in the day holds'),
    # e. a stall is measured against its own interval
    dict(id='e-stall-interval', file='src/situations.ts',
         old="        .map((f) => ({ f, d: num(f, 'gapDays') ?? -1, need: stallAfter(num(f, 'interval') ?? 1) }))\n",
         new="        .map((f) => ({ f, d: num(f, 'gapDays') ?? -1, need: 7 }))\n",
         tests=['src/situations.test.ts'], pattern='a stalled step, measured against its own interval'),
    # f. a stale sheet dates its day-relative facts; old context answers do not drive lines
    dict(id='f-dated-facts', file='worker/src/briefing.ts',
         old="  if (f.id.startsWith('today.') || DAY_RELATIVE.test(f.text)) return `On ${sheet.day}: ${f.text}`\n",
         new="  if (f.id.startsWith('today.')) return `On ${sheet.day}: ${f.text}`\n",
         tests=['worker/src/briefing.test.ts'], pattern='dates every fact'),
    dict(id='f-fresh-context', file='src/situations.ts',
         old="      const f = fresh(sheet, factById(sheet, 'context.loneliness'))\n",
         new="      const f = factById(sheet, 'context.loneliness')\n",
         tests=['src/situations.test.ts'], pattern='an old context answer does not drive'),
    # g. faith practices hold Rule 10 everywhere
    dict(id='g-check-faith-action', file='src/brainShared.ts',
         old="    if (!mayNudge(aim)) return { ok: false, reason: 'action plan: a faith practice is offered, never pushed (Rule 10); leave the action out' }\n",
         new="",
         tests=['src/cadence.test.ts'], pattern='holds Rule 10 everywhere'),
    dict(id='g-faith-gap', file='src/facts.ts',
         old="      gapDays: faith ? null : gap,\n",
         new="      gapDays: gap,\n",
         tests=['src/cadence.test.ts'], pattern='holds Rule 10 everywhere'),
    dict(id='g-faith-untested', file='src/facts.ts',
         old=" || OBSERVED_ONLY.has(m) || move.family === 'faith' || move.hiddenWith === 'faith') continue\n",
         new=" || OBSERVED_ONLY.has(m)) continue\n",
         tests=['src/cadence.test.ts'], pattern='never proposes a test of a faith move'),
    # h. numbers checked as whole numbers; dates, names and earlier words are no grounds; counts in words
    dict(id='h-names-set-aside', file='src/brainShared.ts',
         old="  for (const name of [...new Set(named)].sort((a, b) => b.length - a.length)) rest = rest.replace(",
         new="  for (const name of [...new Set(named)].sort((a, b) => b.length - a.length).slice(0, 0)) rest = rest.replace(",
         tests=['src/brainShared.test.ts'], pattern='takes a cited name'),
    dict(id='h-count-words', file='src/brainShared.ts',
         old="  for (const m of rest.matchAll(COUNT_WORD)) {\n",
         new="  for (const m of [...rest.matchAll(COUNT_WORD)].slice(0, 0)) {\n",
         tests=['src/brainShared.test.ts'], pattern='checks a count written as a word'),
    dict(id='h-earlier-words', file='src/brainShared.ts',
         old="typeof e[1] === 'string' && !EARLIER_WORDS.has(e[0]) && e[1].trim().length >= 2",
         new="typeof e[1] === 'string' && e[1].trim().length >= 2",
         tests=['src/brainShared.test.ts'], pattern='never grounds a number in the Brain'),
    # j. a plan tap names only a cue the day holds; the day guard knows bedtime words
    dict(id='j-day-cues', file='src/situations.ts',
         old="  return CUES.filter((c) => (c === 'afterPickup' ? ahead(str(t, 'pickup')) : c === 'afterBedtime' ? ahead(str(t, 'bedtime')) : sheet.hour * 60 < minutesOf(blockStart.evening)))\n",
         new="  return [...CUES]\n",
         tests=['src/situations.test.ts'], pattern='a plan tap names only a cue the day still holds'),
    dict(id='j-check-bedtime-cue', file='src/brainShared.ts',
         old="    if (a.cue === 'afterBedtime' && !shape?.bedtime) return { ok: false, reason: 'action plan: that day has no bedtime of hers; use a cue it holds' }\n",
         new="",
         tests=['src/brainShared.test.ts'], pattern='allows an action only when the sheet makes it possible'),
    dict(id='j-guard-bedtime-words', file='src/brainShared.ts',
         old="  { what: 'her bedtime', re: /\\b(?:her bed-?time|after bed-?time|put(?:ting)? her (?:down|to bed)|tuck(?:ing)? her in)\\b/i, holds: (s) => s.bedtime !== null },\n",
         new="",
         tests=['src/brainShared.test.ts'], pattern='speaks of her bedtime only on a day she is with you'),
    # k. Claude's answer checked against the sheet it was served
    dict(id='k-served-sheet', file='worker/src/claude.ts',
         old="  if (t.served) return { sheet: t.served.sheet, updatedAt: t.served.factsUpdatedAt, ...(t.served.coach ? { coach: t.served.coach } : {}) }\n",
         new="",
         tests=['worker/src/claude.test.ts'], pattern='checks the answer against the sheet its briefing served'),
    # l. Why shows the facts as they stood
    dict(id='l-why-as-said', file='src/brainFlow.ts',
         old="  if (line.facts?.length) return {",
         new="  if (line.facts?.length && false) return {",
         tests=['src/brainFlow.test.ts'], pattern='shows under Why the facts as they stood'),
    # m. said means seen
    dict(id='m-rest-only-seen', file='src/brainFlow.ts',
         old="  const said = (await db.briefLog.toArray()).filter((l) => l.situationId !== null && wasShown(l, briefs)).map(",
         new="  const said = (await db.briefLog.toArray()).filter((l) => l.situationId !== null && briefs !== null).map(",
         tests=['src/brainFlow.test.ts'], pattern='rests a situation only after its line was seen'),
    dict(id='m-worker-seen-sheet', file='src/facts.ts',
         old="  const seen = i.brainBriefs.filter((w) => workerShown(w, i.contexts))\n",
         new="  const seen = i.brainBriefs.filter((w) => w !== null)\n",
         tests=['src/brainFlow.test.ts'], pattern='takes the Worker’s line of yesterday as said'),
    dict(id='m-worker-seen-repeat', file='worker/src/checks.ts',
         old="  const seen = rows.filter((s) => workerShown({ id: s.id, at: s.at ?? '' }, days))\n",
         new="  const seen = rows.filter((s) => days !== null && s !== null)\n",
         tests=['worker/src/brief.test.ts'], pattern='what the repeat check takes as said'),
    # n. the rhythm editor offers only a rhythm that fits a week
    dict(id='n-max-rest', file='src/rhythm.ts',
         old="  return Math.max(0, Math.min(MAX_REST_DAYS, Math.floor(7 / Math.max(1, perWeek)) - 1))\n",
         new="  return MAX_REST_DAYS\n",
         tests=['src/rhythm.test.ts'], pattern='offers only a rhythm that fits a week'),
    # p. the knows line counted from the record
    dict(id='p-knows-counts', file='src/learningFlow.ts',
         old="(o.outcome === 'done' || o.outcome === 'partly') && o.moveId !== NOTHING",
         new="(o.outcome === 'done' || o.outcome === 'partly' || o.outcome === 'no')",
         tests=['src/learningRun.test.ts'], pattern='how much it knows'),
    # item 4: Stress and Overwhelm reworded, the trend saying so across the change
    dict(id='4-trend-across', file='src/facts.ts',
         old="      const across = reading.reworded !== undefined && ",
         new="      const across = false && reading.reworded !== undefined && ",
         tests=['src/reworded.test.ts'], pattern='says so when the trend compares'),
    # item 5: clock times
    dict(id='5-bare-time-shown', file='src/format.ts',
         old="      if (!half && hh.length === 1) return whole\n",
         new="",
         tests=['src/format.test.ts'], pattern='turns every clock time'),
    dict(id='5-time-check', file='src/brainShared.ts',
         old="    if (times.has(t.minutes)) continue\n",
         new="    if (times.has(t.minutes) || true) continue\n",
         tests=['src/brainShared.test.ts'], pattern='checks a clock time as a minute of the day'),
    # item 6: the line's tap does what it says
    dict(id='6-test-reading', file='src/brainShared.ts',
         old="    if (!tests || typeof a.reading !== 'string' || !tests.readings.includes(a.reading)) return",
         new="    if (false) return",
         tests=['src/brainShared.test.ts'], pattern='allows an action only when the sheet makes it possible'),
    dict(id='6-plan-held-to-line', file='src/brainShared.ts',
         old="    if (named.length && cueTime && !named.includes(minutesOfCue(cueTime) as number)) return",
         new="    if (false) return",
         tests=['src/brainShared.test.ts'], pattern='allows an action only when the sheet makes it possible'),
    # the two post-window features open as they ship
    dict(id='open-away', file='src/postWindow.ts',
         old="export const AWAY_FROM_HOME: 'gated' | 'open' = 'open'\n",
         new="export const AWAY_FROM_HOME: 'gated' | 'open' = 'gated'\n",
         tests=['src/postWindowShipped.test.ts']),
    dict(id='open-home-only', file='src/postWindow.ts',
         old="export const HOME_ONLY: 'gated' | 'open' = 'open'\n",
         new="export const HOME_ONLY: 'gated' | 'open' = 'gated'\n",
         tests=['src/postWindowShipped.test.ts']),
]


def run(tests, pattern):
    assert tests, 'an empty test list would run everything'
    cmd = [NPX, 'vitest', 'run', *tests]
    if pattern:
        cmd += ['-t', pattern]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
    m = re.search(r'Tests\s+(?:(\d+) failed \| )?(\d+) passed', out)
    failed = int(m.group(1) or 0) if m else None
    passed = int(m.group(2)) if m else 0
    m2 = re.search(r'Tests\s+(\d+) failed', out)
    if m2 and failed is None:
        failed = int(m2.group(1))
    return r.returncode, (failed or 0), passed, out


def main(ids):
    rows = [t for t in TABLE if not ids or t['id'] in ids]
    assert rows, 'no entry matched'
    results = []
    for t in rows:
        path = ROOT + t['file']
        original = io.open(path, 'rb').read()
        text = original.decode('utf-8')
        n = text.count(t['old'])
        if n != 1:
            results.append((t['id'], f'SETUP: the line to break appears {n} times'))
            continue
        code, failed, passed, out = run(t['tests'], t.get('pattern'))
        if code != 0 or passed == 0:
            results.append((t['id'], f'NO GREEN BASELINE (exit {code}, {passed} passed)'))
            continue
        try:
            io.open(path, 'wb').write(text.replace(t['old'], t['new']).encode('utf-8'))
            code2, failed2, passed2, out2 = run(t['tests'], t.get('pattern'))
        finally:
            io.open(path, 'wb').write(original)
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
