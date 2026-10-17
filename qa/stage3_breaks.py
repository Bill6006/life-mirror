"""Stage 3's deliberate breaks (designed 2026-10-17): each undoes one rule, and the test that guards it must turn red.

Group 3 (in the moment) in the app; groups 1 and 2 (the Brain's memory, timing) in the Worker and
in the app; group 4 (the owner's record shown back) in the app.

Same rules as the other runners: a green baseline first, one exact replacement, the file always
restored byte for byte, the table read as data, and an empty test list refused. A break guarded by a
unit test runs Vitest; one guarded by a browser test runs Playwright against the built folder, so the
app is rebuilt after its replacement and once more after its restore.

python stage3_breaks.py [id ...]
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
WORSE = 'after a reading worsens by two steps'
M = 'src/memoryFacts.test.ts'
W = 'src/weeklyFacts.test.ts'
T = 'src/trendWeek.test.ts'
P = 'src/planMoment.test.ts'
R = 'src/recordBack.test.ts'
MO = 'src/month.test.ts'
EVENING = 'after an evening, the one pattern'

TABLE = [
    # Group 3: Anything going on? (the agreed "anything behind it?"; Rule 4 bans the word "behind").
    dict(id='behind-threshold', file='src/change.ts',
         old="export const BEHIND_IT_STEPS = 2\n",
         new="export const BEHIND_IT_STEPS = 3\n",
         tests=[S], pattern=WORSE),
    dict(id='behind-own-direction', file='src/change.ts',
         old="    return (dir === 'up' ? before - now : now - before) >= BEHIND_IT_STEPS\n",
         new="    return before - now >= BEHIND_IT_STEPS\n",
         tests=['src/change.test.ts'], pattern='each in its own direction'),
    dict(id='behind-six-readings', file='src/change.ts',
         old="    if (!dir || now === undefined || before === undefined) return false\n",
         new="    if (now === undefined || before === undefined) return false\n",
         tests=['src/change.test.ts'], pattern='only the six readings with a direction'),
    dict(id='behind-not-evening', file='src/checkin.tsx',
         old="  const behind = record.block !== 'evening' && worsenedReadings(record.answers, record.block, previous).length > 0\n",
         new="  const behind = worsenedReadings(record.answers, record.block, previous).length > 0\n",
         tests=[S], pattern=EVENING),
    dict(id='behind-writes-note', file='src/checkin.tsx',
         old="onSave={(text) => void setNote({ day: record.day, block: record.block }, askedOf(record), text)}",
         new="onSave={() => undefined}",
         tests=[S], pattern=WORSE),
    # Group 3: the pattern tonight matches.
    dict(id='pattern-matches-tonight', file='src/beforeDays.ts',
         old="    return position !== undefined && atLevel(position, p.level)\n",
         new="    return position !== undefined\n",
         tests=['src/beforeDays.test.ts'], pattern='tonight matches no pair'),
    dict(id='pattern-evening-only', file='src/beforeDays.ts',
         old="  if (tonight.block !== 'evening') return null\n",
         new="",
         tests=['src/beforeDays.test.ts'], pattern='belongs to the evening alone'),
    dict(id='pattern-ready-only', file='src/beforeDays.ts',
         old=".filter((p) => p.enough && p.diff !== null)",
         new=".filter((p) => p.diff !== null)",
         tests=['src/beforeDays.test.ts'], pattern='tonight matches no pair'),
    dict(id='pattern-shown', file='src/checkin.tsx',
         old="      {pattern && span !== null && (\n",
         new="      {false && pattern && span !== null && (\n",
         tests=[S], pattern=EVENING),
    dict(id='pattern-never-a-cause', file='src/checkin.tsx',
         old="          <p class=\"note faint no-gap\">{copy.summary.patternNote}</p>\n",
         new="",
         tests=[S], pattern=EVENING),
    # Group 1, the Brain with a memory, in the Worker.
    dict(id='memory-brain-history', file='worker/src/retrieval.ts',
         old="['brainHistory', ...(typeof f.values.aimId === 'number' ? [aimCategory(String(f.values.aimId))] : []), ...(f.values.faith === 1 ? (['faith'] as const) : [])]",
         new="['dayRecord']",
         tests=['worker/src/memory.test.ts'], pattern='with the Brain’s own history'),
    dict(id='memory-commitment', file='worker/src/retrieval.ts',
         old="['brainHistory', ...(typeof f.values.aimId === 'number' ? [aimCategory(String(f.values.aimId))] : []), ",
         new="['brainHistory', ",
         tests=['worker/src/memory.test.ts'], pattern='follows the switches of what each was drawn from'),
    dict(id='memory-faith', file='worker/src/retrieval.ts',
         old=", ...(f.values.faith === 1 ? (['faith'] as const) : [])]",
         new="]",
         tests=['worker/src/memory.test.ts'], pattern='with the Brain’s own history'),
    dict(id='weekly-day-record', file='worker/src/retrieval.ts',
         old="['dayRecord', ...(f.id.endsWith('.faith')",
         new="['factSheet', ...(f.id.endsWith('.faith')",
         tests=['worker/src/memory.test.ts'], pattern='file the weekly view’s analyses with the day’s record'),
    dict(id='weekly-faith-switch', file='worker/src/retrieval.ts',
         old="f.id.endsWith('.faith') ? (['faith'] as const) : ",
         new="",
         tests=['worker/src/memory.test.ts'], pattern='follows the switches of what each was drawn from'),
    dict(id='weekly-social-switch', file='worker/src/retrieval.ts',
         old=" : f.id.endsWith('.social') ? (['socialPath'] as const) : []",
         new=" : []",
         tests=['worker/src/memory.test.ts'], pattern='follows the switches of what each was drawn from'),
    dict(id='weekly-review-only', file='worker/src/retrieval.ts',
         old=" && (!isWeeklyFact(f.id) || a.task === 'review'))",
         new=")",
         tests=['worker/src/memory.test.ts'], pattern='the weekly view to the review alone'),
    dict(id='free-chain-memory', file='worker/src/briefing.ts',
         old=" || isMemoryFact(id) || isWeeklyFact(id))",
         new=" || isWeeklyFact(id))",
         tests=['worker/src/memory.test.ts'], pattern='keep the free chain on the approved fact sheet'),
    dict(id='free-chain-weekly', file='worker/src/briefing.ts',
         old=" || isMemoryFact(id) || isWeeklyFact(id))",
         new=" || isMemoryFact(id))",
         tests=['worker/src/memory.test.ts'], pattern='keep the free chain on the approved fact sheet'),
    dict(id='memory-rules-given', file='worker/src/prompt.ts',
         old="(b.sheet.facts.some((f) => isMemoryFact(f.id)) ? `\\n\\n${MEMORY_RULES}` : '')",
         new="''",
         tests=['worker/src/memory.test.ts'], pattern='give Claude the memory’s rule'),
    dict(id='weekly-rules-given', file='worker/src/prompt.ts',
         old="(b.sheet.facts.some((f) => isWeeklyFact(f.id)) ? `\\n\\n${WEEKLY_RULES}` : '')",
         new="''",
         tests=['worker/src/memory.test.ts'], pattern='give Claude the memory’s rule'),
    # Group 2, timing, in the Worker.
    dict(id='cue-remind-at', file='worker/src/cues.ts',
         old="minutesOf(p.remindAt ?? p.time)",
         new="minutesOf(p.time)",
         tests=['worker/src/cues.test.ts'], pattern='reminds at the moment the commitment actually happens'),
    dict(id='follow-up-retired', file='worker/src/cues.ts',
         old="      if (await followUpRetired(store, p.aimId, local.day)) retired.push(p.id)\n      else followUps.push(p.id)\n",
         new="      followUps.push(p.id)\n",
         tests=['worker/src/cues.test.ts'], pattern='retires a commitment’s follow-up'),
    dict(id='follow-up-start-counts', file='worker/src/cues.ts',
         old="  if (followed.length < RETIRE_AFTER || followed.some((f) => f.started)) return false\n",
         new="  if (followed.length < RETIRE_AFTER) return false\n",
         tests=['worker/src/cues.test.ts'], pattern='keeps the follow-up while one of the last five led to a start'),
    dict(id='follow-up-retried', file='worker/src/cues.ts',
         old="  return followed[0].day > addDays(today, -RETRY_AFTER_DAYS)\n",
         new="  return true\n",
         tests=['worker/src/cues.test.ts'], pattern='tries a retired follow-up once more'),
    dict(id='follow-up-own-commitment', file='worker/src/cues.ts',
         old="    if (!p || p.aimId !== aimId || r.day === null",
         new="    if (!p || r.day === null",
         tests=['worker/src/cues.test.ts'], pattern='tries a retired follow-up once more'),
    # Group 1, the Brain with a memory, in the app: the memory of each line seen.
    dict(id='memory-window', file='src/memoryFacts.ts',
         old="  const inWindow = (day: string) => day >= from && day < i.today\n",
         new="  const inWindow = (day: string) => day >= addDays(from, -1) && day <= i.today\n",
         tests=[M], pattern='the lines seen in the 30 days before today'),
    dict(id='memory-seen-phone', file='src/memoryFacts.ts',
         old=" && wasShown(l, i.brainBriefs))",
         new=")",
         tests=[M], pattern='never a line that was not seen'),
    dict(id='memory-seen-worker', file='src/memoryFacts.ts',
         old=" && workerShown(w, i.contexts))",
         new=")",
         tests=[M], pattern='never a line that was not seen'),
    dict(id='memory-shown-moment', file='src/memoryFacts.ts',
         old="shownAt: marks[0] ?? w.at,",
         new="shownAt: w.at,",
         tests=[M], pattern='a lighter check-in'),
    dict(id='memory-plan-that-day', file='src/memoryFacts.ts',
         old=".find((p) => p.aimId === a.aimId && p.day === line.day)",
         new=".find((p) => p.aimId === a.aimId)",
         tests=[M], pattern='never made'),
    dict(id='memory-latest-plan', file='src/memoryFacts.ts',
         old="    const plan = latestPlans(i.intentions).find(",
         new="    const plan = i.intentions.find(",
         tests=[M], pattern='latest plan alone'),
    dict(id='memory-kept', file='src/memoryFacts.ts',
         old="    if (plan.offerId === null) return",
         new="    if (plan.offerId === -1) return",
         tests=[M], pattern='never made'),
    dict(id='memory-faith-general', file='src/memoryFacts.ts',
         old="    if (aim && isFaithPractice(aim)) return",
         new="    if (false && aim && isFaithPractice(aim)) return",
         tests=[M], pattern='faith practice in the general form'),
    dict(id='memory-depth-short', file='src/memoryFacts.ts',
         old=".every((r) => SHORT_READINGS.includes(r))",
         new=".some((r) => SHORT_READINGS.includes(r))",
         tests=[M], pattern='a lighter check-in'),
    dict(id='memory-test-that-day', file='src/memoryFacts.ts',
         old=" && blockAt(new Date(c.createdAt)).day === line.day)",
         new=")",
         tests=[M], pattern='a test: set when'),
    dict(id='memory-received', file='src/memoryFacts.ts',
         old="answer.get(line.key) ?? 'untapped'",
         new="'untapped'",
         tests=[M], pattern='how it landed'),
    dict(id='memory-no-tags', file='src/memoryFacts.ts',
         old="  if (!a) return { id, tags: [], text:",
         new="  if (!a) return { id, tags: ['monitoring'], text:",
         tests=[M], pattern='nothing to tap'),
    dict(id='memory-on-sheet', file='src/facts.ts',
         old="  facts.push(...memoryFacts({",
         new="  void (memoryFacts({",
         tests=['src/memorySheet.test.ts'], pattern='remembers the line'),
    # Group 1 in the app: the weekly view's analyses for the Sunday review.
    dict(id='weekly-faith-own-fact', file='src/weeklyFacts.ts',
         old="  if (m.family === 'faith' || m.hiddenWith === 'faith') return 'faith'\n",
         new="",
         tests=[W], pattern='facts of their own'),
    dict(id='weekly-social-own-fact', file='src/weeklyFacts.ts',
         old="  return m.path?.social ? 'social' : 'general'\n",
         new="  return 'general'\n",
         tests=[W], pattern='facts of their own'),
    dict(id='weekly-partner-never', file='src/weeklyFacts.ts',
         old="  if (m.path?.partner && !m.path.social) return 'partner'\n",
         new="",
         tests=[W], pattern='facts of their own'),
    dict(id='weekly-faith-family', file='src/weeklyFacts.ts',
         old="health.filter((h) => h.family !== 'faith' && h.family !== 'partner')",
         new="health.filter((h) => h.family !== 'partner')",
         tests=[W], pattern='facts of their own'),
    dict(id='weekly-grounded', file='src/weeklyFacts.ts',
         old="Object.assign(values, { [`${h.family}Live`]: h.live, ",
         new="Object.assign(values, { ",
         tests=[W], pattern='every number each says'),
    dict(id='weekly-no-tags', file='src/weeklyFacts.ts',
         old="    id: 'weekly.scorecard',\n    tags: [],\n",
         new="    id: 'weekly.scorecard',\n    tags: ['forecast'],\n",
         tests=[W], pattern='carry no tags'),
    dict(id='weekly-sheet-steps', file='src/brainFlow.ts',
         old="offers: offers.filter(onTheSheet), outcomes, cards",
         new="offers, outcomes, cards",
         tests=['src/memorySheet.test.ts'], pattern='never takes a place from another'),
    # Group 1 in the app: trends read by the week.
    dict(id='trend-to-yesterday', file='src/facts.ts',
         old="a.day >= addDays(today, -TREND_DAYS) && a.day < today)",
         new="a.day >= addDays(today, -TREND_DAYS) && a.day <= today)",
         tests=[T], pattern='leaves today out'),
    dict(id='trend-week', file='src/facts.ts',
         old="const TREND_DAYS = 7\n",
         new="const TREND_DAYS = 6\n",
         tests=[T], pattern='leaves today out'),
    dict(id='trend-three-each', file='src/facts.ts',
         old="const TREND_MIN = 3\n",
         new="const TREND_MIN = 2\n",
         tests=[T], pattern='three answers'),
    # Group 2, timing, in the app.
    dict(id='moment-min-starts', file='src/planMoment.ts',
         old="export const MOMENT_MIN_STARTS = 3\n",
         new="export const MOMENT_MIN_STARTS = 2\n",
         tests=[P], pattern='once there are three'),
    dict(id='moment-own-day', file='src/planMoment.ts',
         old="    if (!o || o.day !== p.day) continue\n",
         new="    if (!o) continue\n",
         tests=[P], pattern='starts on the plan’s own day'),
    dict(id='moment-pooled', file='src/planMoment.ts',
         old="learnedDelay(intentions, offers, cue, aimId, today) ?? learnedDelay(intentions, offers, cue, null, today)",
         new="learnedDelay(intentions, offers, cue, aimId, today)",
         tests=[P], pattern='learns per commitment first'),
    dict(id='moment-never-mid-pickup', file='src/planMoment.ts',
         old="    if (m >= from && m < from + PICKUP_ALLOWANCE_MIN) m = from + PICKUP_ALLOWANCE_MIN\n",
         new="",
         tests=[P], pattern='never inside the pickup'),
    dict(id='moment-stored', file='src/aimFlow.ts',
         old=", ...(remindAt !== time ? { remindAt } : {})",
         new="",
         tests=['src/planMomentFlow.test.ts'], pattern='keeps its cue’s time'),
    dict(id='chips-order', file='src/planMoment.ts',
         old="  return [...cues].sort((a, b) => started(b.cue) - started(a.cue) || CUES.indexOf(a.cue) - CUES.indexOf(b.cue))\n",
         new="  return [...cues]\n",
         tests=[P], pattern='come in the order the record keeps them'),
    dict(id='chips-latest-plan', file='src/planMoment.ts',
         old="  for (const p of latestPlans(intentions)) {\n    if (p.aimId !== aimId",
         new="  for (const p of intentions) {\n    if (p.aimId !== aimId",
         tests=[P], pattern='the latest plan of each day alone'),
    dict(id='chips-wired', file='src/aimCard.tsx',
         old="  const cues = chipOrder(cuesFor(ctx, new Date()), kept)\n",
         new="  const cues = cuesFor(ctx, new Date())\n",
         tests=[S], pattern='the Plan when chips come in the order the record keeps them'),
    # Group 4, the owner's record shown back: Your words and the notes.
    dict(id='words-typed-only', file='src/yourWords.ts',
         old=".filter((c) => typeof c.extras?.note === 'string' && c.extras.note.trim() !== '')",
         new=".filter((c) => typeof c.extras?.note === 'string')",
         tests=[R], pattern='lists every line typed at a check-in'),
    dict(id='words-newest-first', file='src/yourWords.ts',
         old="    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : BLOCKS.indexOf(b.block) - BLOCKS.indexOf(a.block)))\n",
         new="",
         tests=[R], pattern='lists every line typed at a check-in'),
    dict(id='words-beside-reading', file='src/yourWords.ts',
         old="value: r ? r.value : null, band: r ? bandOf(r.value) : null",
         new="value: null, band: null",
         tests=[R], pattern='lists every line typed at a check-in'),
    dict(id='summary-note-shown', file='src/checkin.tsx',
         old="      {block !== 'evening' && ex.note && !asksBehind && (\n",
         new="      {false && block !== 'evening' && ex.note && !asksBehind && (\n",
         tests=[S], pattern='a check-in’s note on its own summary'),
    dict(id='summary-note-evening', file='src/checkin.tsx',
         old="              {ex.note && <NoteRow note={ex.note} />}\n",
         new="",
         tests=[S], pattern='a check-in’s note on its own summary'),
    # Found in the screenshots: the words were the small print under their label, in Signal's data face.
    dict(id='summary-note-face', file='src/checkin.tsx',
         old='        <span class="said own-line">{fill(copy.summary.quoted, { note })}</span>\n',
         new='        <span class="sub ink said">{fill(copy.summary.quoted, { note })}</span>\n',
         tests=[S], pattern='a check-in’s note on its own summary'),
    dict(id='words-back', file='src/app.tsx',
         old="            onDone={() => (view.back ? setView(view.back) : closeAll())}\n",
         new="            onDone={closeAll}\n",
         tests=[S], pattern='a check-in’s note on its own summary'),
    dict(id='last-note-latest', file='src/aims.ts',
         old="  const last = answered.reduce<Offer | null>((m, o) => (m === null || o.at > m.at ? o : m), null)\n",
         new="  const last = answered.reduce<Offer | null>((m, o) => (m === null || o.at < m.at ? o : m), null)\n",
         tests=[R], pattern='is the note left after the last answered session'),
    dict(id='last-note-shown', file='src/aimCard.tsx',
         old="          {lastNote && <LastNote note={lastNote} />}\n",
         new="",
         tests=[S], pattern='the line left after a learning session'),
    # Group 4: Her counted from the current rung, each change dated.
    dict(id='her-history-kept', file='src/herFlow.ts',
         old="    await db.herSkills.update(skillId, { rung, rungAt: at, rungs: [...rungHistory(s).changes, { rung, at }] })\n",
         new="    await db.herSkills.update(skillId, { rung, rungAt: at })\n",
         tests=[R], pattern='keeps each rung change with its moment'),
    dict(id='her-same-rung', file='src/herFlow.ts',
         old="    if (!s || s.rung === rung) return\n",
         new="    if (!s) return\n",
         tests=[R], pattern='keeps each rung change with its moment'),
    dict(id='her-earlier-unknown', file='src/her.ts',
         old="  return { changes, earlierUnknown: changes[0].at > s.addedAt }\n",
         new="  return { changes, earlierUnknown: false }\n",
         tests=[R], pattern='its earlier changes unknown'),
    dict(id='her-counts-since', file='src/herScreen.tsx',
         old="  const counts = skillCounts(momentsSince(moments, skill.rungAt), skill.skillId)\n",
         new="  const counts = skillCounts(moments, skill.skillId)\n",
         tests=[S], pattern='Aims → Her adds a skill from the checklists'),
    dict(id='her-exported', file='src/export.ts',
         old=", ...(s.rungs ? { rungs: s.rungs } : {}) })),",
         new=" })),",
         tests=[R], pattern='goes into the export'),
    # Group 4: a month ago today and the month's review.
    dict(id='month-ago-last-day', file='src/month.ts',
         old="String(Math.min(d, last)).padStart(2, '0')",
         new="String(d).padStart(2, '0')",
         tests=[MO], pattern='is the same date a month back'),
    dict(id='month-ago-nothing', file='src/month.ts',
         old="  if (value === null && !blocks.length && !notes.length && !done.length && !workout) return null\n",
         new="",
         tests=[MO], pattern='is nothing when the record holds nothing'),
    dict(id='month-ago-shown', file='src/mirror.tsx',
         old="      {ago && <MonthAgoCard day={ago} />}\n",
         new="",
         tests=[S], pattern='a month ago today on Mirror'),
    # Found in the screenshots: the count beside Your words wrapped in every theme; it sits on the line beneath, as on Mirror.
    dict(id='month-words-row', file='src/monthScreen.tsx',
         old='              <NavRow label={copy.words.door} note={fill(c.notes, { n: String(r.notes) })} onClick={onWords} testid="month-words" />\n',
         new='              <li><button type="button" class="row" data-testid="month-words" onClick={onWords}><span class="row-main">{fill(c.notes, { n: String(r.notes) })}</span><span class="row-side">{copy.words.door}</span></button></li>\n',
         tests=[S], pattern='the last full month’s review'),
    dict(id='month-partner-out', file='src/month.ts',
         old=" && onTheSheet(o) && !o.skippedAt",
         new=" && !o.skippedAt",
         tests=[MO], pattern='never the Partner path'),
    dict(id='month-faith-hidden', file='src/month.ts',
         old="    .filter((o) => !(r.hideFaith && hasMove(o.moveId) && (moveById(o.moveId).family === 'faith' || moveById(o.moveId).hiddenWith === 'faith')))\n",
         new="",
         tests=[MO], pattern='never the Partner path'),
    dict(id='month-faith-never-counted', file='src/month.ts',
         old="      const done = faith ? 0 : sessions",
         new="      const done = sessions",
         tests=[MO], pattern='a faith practice offered and never counted'),
    dict(id='month-paused-out', file='src/month.ts',
         old=".filter((a) => a.kind !== 'path' && a.archivedAt === null && !a.pausedAt)",
         new=".filter((a) => a.kind !== 'path' && a.archivedAt === null)",
         tests=[MO], pattern='a faith practice offered and never counted'),
    dict(id='month-min-days', file='src/month.ts',
         old="export const MONTH_MIN_DAYS = 7\n",
         new="export const MONTH_MIN_DAYS = 6\n",
         tests=[MO], pattern='says it has too few days'),
    dict(id='month-full-month', file='src/month.ts',
         old="  const month = monthBefore(monthOf(today))\n",
         new="  const month = monthOf(today)\n",
         tests=[MO], pattern='reviews the last full month'),
    dict(id='month-moved-direction', file='src/month.ts',
         old="delta: Math.round((INGREDIENTS[id] === 'down' ? b - a : a - b) * 100) / 100",
         new="delta: Math.round((a - b) * 100) / 100",
         tests=[MO], pattern='reviews the last full month'),
    # Group 4: the workouts read, on Cloud.
    dict(id='cloud-read-days', file='src/outsideRow.ts',
         old="  return { n: rows.length, days: days.size,",
         new="  return { n: rows.length, days: rows.length,",
         tests=[R], pattern='counts what was read'),
    dict(id='cloud-read-shown', file='src/cloudScreen.tsx',
         old="      {readLine && (\n",
         new="      {false && readLine && (\n",
         tests=[S], pattern='the Cloud screen counts the workouts read'),
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
