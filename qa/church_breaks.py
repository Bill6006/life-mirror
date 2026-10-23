"""Sabbath Day and Third Day (item 3 of 4, 2026-10-23), each rule undone once: the test that guards it must turn red.

Two church schedules in the week's shape: the Sabbath (Saturday, the whole day, services at 07:30, 14:30 and 19:30) and
the Third Day (Tuesday, the blocks its service times fall in: 19:30 is the evening), each weekday and time editable, a week
from before read with the defaults. A day's context keeps the schedule it was made under: earlier days never change, today
takes it once and follows an edit, a day away from home keeps giving way. Church touches nothing of home or office, and a
schedule is never attendance: no check-in, no Out among people, no big social day, no recovery gap. In its blocks people
are around, the church move fits, the house's moves wait, the shape words say church; the Sabbath hour is the Sabbath's.
The Brain, Ask and Claude's day words name it as scheduled; last night counts an evening with a service. On the screen:
two tabs over the one weekday grid, each schedule's times behind Edit times, every target 48px, the chosen tab marked by
more than colour, today re-shaped on an edit (never stamped as a change by hand); the Sabbath asks no Out among people; only its evening's note asks about a
big social day.

Not a break, by design: the Sabbath's guard on the chips marked as seen. A chip is marked only once its row is on screen,
so with the row not drawn there is nothing to mark, and the guard on drawing it (ui-sabbath-chip) is the one tested.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by a browser test runs Playwright against the
built folder, so the app is rebuilt after its replacement and once more after its restore.

python church_breaks.py [id ...]
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
C = 'src/church.test.ts'
WC = 'worker/src/church.test.ts'
PS = 'src/pathStage.test.ts'
PW = 'src/postWindow.test.ts'
S = 'e2e/smoke.spec.ts'
CH = 'src/church.ts'
DB = 'src/db.ts'
DEF = 'default to the Sabbath on Saturday'
EDIT = 'follows a changed weekday'
WFH = 'leaves a Tuesday worked from home'
SHAPE = 'says church in the shape words'
KEEPS = 'keeps every earlier day as it was recorded'
TRIP = 'leaves a day away from home without church'
HAND_KEPT = 'keeps a day changed by hand as it was chosen'
FITS = 'offers the church move in the blocks with a service'
WORDS = 'names the Sabbath and the Third Day with their times'
AFTER = 'reads the morning after an evening with a service'
REP = 'keeps a rep out only when its own part of the day has passed'
HELD = 'gives way the office, the daycare, church and the study day'
WORKER = 'says the Sabbath and the Third Day as scheduled'
SET_UI = 'Sabbath Day and Third Day'
DAY_UI = 'the Sabbath does not ask Out among people today'

TABLE = [
    # The schedules.
    dict(id='c-sabbath-whole', file=CH,
         old="  if (ctx.church === 'sabbath') return { morning: true, afternoon: true, evening: true }\n",
         new="  if (ctx.church === 'sabbath') return { ...none, morning: true }\n",
         tests=[C], pattern=DEF),
    dict(id='c-third-its-blocks', file=CH,
         old="    const at = new Set((ctx.services?.length ? ctx.services : ['19:30']).map(blockOfService))\n",
         new="    const at = new Set<Block>(BLOCKS)\n",
         tests=[C], pattern=DEF),
    dict(id='c-third-null-is-none', file=CH,
         old="third: { day: w.thirdDay === undefined ? THIRD_DAY_WEEKDAY : w.thirdDay,",
         new="third: { day: w.thirdDay ?? THIRD_DAY_WEEKDAY,",
         tests=[C], pattern=EDIT),
    dict(id='c-third-tuesday', file=CH,
         old="export const THIRD_DAY_WEEKDAY: Weekday = 2\n",
         new="export const THIRD_DAY_WEEKDAY: Weekday = 3\n",
         tests=[C], pattern=DEF),
    dict(id='c-sabbath-three-services', file=CH,
         old="export const SABBATH_DEFAULT: readonly string[] = ['07:30', '14:30', '19:30']\n",
         new="export const SABBATH_DEFAULT: readonly string[] = ['07:30', '19:30']\n",
         tests=[C], pattern=DEF),
    dict(id='c-third-service', file=CH,
         old="export const THIRD_DAY_DEFAULT: readonly string[] = ['19:30']\n",
         new="export const THIRD_DAY_DEFAULT: readonly string[] = ['19:00']\n",
         tests=[C], pattern=DEF),
    dict(id='c-times-once-in-order', file=CH,
         old=r"  return [...new Set(times.filter((t) => /^\d{2}:\d{2}$/.test(t)))].sort()",
         new=r"  return times.filter((t) => /^\d{2}:\d{2}$/.test(t))",
         tests=[C], pattern=EDIT),
    dict(id='c-sabbath-wins', file=CH,
         old="  if (s.sabbath.day === weekday) return { church: 'sabbath', services: s.sabbath.services }\n  if (s.third.day === weekday) return { church: 'third', services: s.third.services }\n",
         new="  if (s.third.day === weekday) return { church: 'third', services: s.third.services }\n  if (s.sabbath.day === weekday) return { church: 'sabbath', services: s.sabbath.services }\n",
         tests=[C], pattern=EDIT),
    dict(id='c-afternoon-service', file=CH,
         old="  return m >= minutes(blockStart.evening) ? 'evening' : m >= minutes(blockStart.afternoon) ? 'afternoon' : 'morning'\n",
         new="  return m >= minutes(blockStart.evening) ? 'evening' : 'morning'\n",
         tests=[C], pattern=EDIT),
    dict(id='c-old-church-morning', file=CH,
         old="  return ctx.churchDay ? { ...none, morning: true } : none\n",
         new="  return ctx.churchDay ? { morning: true, afternoon: true, evening: true } : none\n",
         tests=[C], pattern=KEEPS),
    dict(id='c-old-church-sabbath', file=CH,
         old="(ctx.church === undefined && ctx.churchDay)",
         new="false",
         tests=[C], pattern=DEF),
    dict(id='settings-third-default', file='src/settings.ts',
         old="export const DEFAULT_WEEK: WeekShape = { churchDay: 6, thirdDay: 2,",
         new="export const DEFAULT_WEEK: WeekShape = { churchDay: 6, thirdDay: 3,",
         tests=[C], pattern=DEF),
    # A day's context: made under the schedule, earlier days kept, today re-shaped, a trip giving way.
    dict(id='db-made-with-schedule', file=DB,
         old="    ...churchOf(w, weekday),\n    schedule: 1,\n",
         new="    schedule: 1,\n",
         tests=[C], pattern=DEF),
    dict(id='db-earlier-days-kept', file=DB,
         old="if (existing.schedule === undefined && day >= blockAt(new Date()).day && !existing.awayFromHome)",
         new="if (existing.schedule === undefined && !existing.awayFromHome)",
         tests=[C], pattern=KEEPS),
    dict(id='db-trip-not-backfilled', file=DB,
         old="if (existing.schedule === undefined && day >= blockAt(new Date()).day && !existing.awayFromHome)",
         new="if (existing.schedule === undefined && day >= blockAt(new Date()).day)",
         tests=[C], pattern=TRIP),
    dict(id='db-refresh-trip', file=DB,
         old="    if (!existing || existing.awayFromHome) return\n    const weekday = parseDay(day).getDay() as Weekday\n    const { church: _church, services: _services, ...rest } = existing\n",
         new="    if (!existing) return\n    const weekday = parseDay(day).getDay() as Weekday\n    const { church: _church, services: _services, ...rest } = existing\n",
         tests=[C], pattern=TRIP),
    dict(id='db-refresh-drops-old', file=DB,
         old="    const { church: _church, services: _services, ...rest } = existing\n",
         new="    const rest = existing\n",
         tests=[C], pattern=KEEPS),
    dict(id='db-refresh-sabbath', file=DB,
         old="churchDay: settings.week.churchDay === weekday, ...churchOf(settings.week, weekday), schedule: 1 })",
         new="...churchOf(settings.week, weekday), schedule: 1 })",
         tests=[C], pattern=KEEPS),
    dict(id='db-refresh-not-by-hand', file=DB,
         old="...churchOf(settings.week, weekday), schedule: 1 })",
         new="...churchOf(settings.week, weekday), schedule: 1, updatedAt: now.toISOString() })",
         tests=[C], pattern=KEEPS),
    dict(id='db-refresh-keeps-hand', file=DB,
         old="    const { church: _church, services: _services, ...rest } = existing\n    await db.days.put(",
         new="    const { church: _church, services: _services, changed: _changed, ...rest } = existing\n    await db.days.put(",
         tests=[C], pattern=HAND_KEPT),
    dict(id='db-away-drops-church', file=DB,
         old="  return { ...rest, atOffice: false, pickupTime: null, churchDay: false, studyNight: false, awayFromHome: { held } }\n",
         new="  return { ...ctx, atOffice: false, pickupTime: null, churchDay: false, studyNight: false, awayFromHome: { held } }\n",
         tests=[PW], pattern=HELD),
    dict(id='db-away-holds-church', file=DB,
         old=", ...(ctx.church ? { church: ctx.church, services: ctx.services } : {}) }",
         new=" }",
         tests=[PW], pattern=HELD),
    # What fits a block.
    dict(id='people-church-blocks', file='src/people.ts',
         old="  if (churchIn(ctx, block)) return true\n",
         new="  if (ctx.churchDay && block === 'morning') return true\n",
         tests=[C], pattern=WFH),
    dict(id='offers-church-early', file='src/offers.ts',
         old="  if (move.id === 'church-early' && !(t.church ? t.church[s.block] : t.churchDay && s.block === 'morning')) return 'schedule'\n",
         new="  if (move.id === 'church-early' && !t.churchDay) return 'schedule'\n",
         tests=[C], pattern=FITS),
    dict(id='offers-church-early-block', file='src/offers.ts',
         old="!(t.church ? t.church[s.block] : t.churchDay && s.block === 'morning')",
         new="!(t.church ? Object.values(t.church).some(Boolean) : t.churchDay && s.block === 'morning')",
         tests=[C], pattern=FITS),
    dict(id='offers-sabbath-hour', file='src/offers.ts',
         old="  if (move.id === 'sabbath-hour' && t.church !== undefined && t.sabbath !== true) return 'schedule'\n",
         new="",
         tests=[C], pattern=FITS),
    dict(id='offers-house-waits', file='src/offers.ts',
         old="  if ((t.homeOut === true || t.church?.[s.block] === true) && needsHome(move.id)) return 'home'\n",
         new="  if (t.homeOut === true && needsHome(move.id)) return 'home'\n",
         tests=[C], pattern=FITS),
    dict(id='flow-church-state', file='src/offerFlow.ts',
         old="church: churchBlocks(ctx), sabbath: sabbathOf(ctx), ",
         new="",
         tests=[C], pattern=FITS),
    dict(id='cat-church-early-blocks', file='src/catalogue.json',
         old='"stay for coffee after church"\n      ],\n      "countsToward": [\n        "conversations",\n        "faith"\n      ],\n      "when": [\n        "morning",\n        "afternoon",\n        "evening"\n      ],',
         new='"stay for coffee after church"\n      ],\n      "countsToward": [\n        "conversations",\n        "faith"\n      ],\n      "when": [\n        "morning"\n      ],',
         tests=[C], pattern=FITS),
    dict(id='rep-church-ahead', file='src/pathStage.ts',
         old="  if (m.id === 'church-early' && !BLOCKS.some((b) => blockIndex(b) >= blockIndex(block) && churchIn(ctx, b))) return 'church'\n",
         new="  if (m.id === 'church-early' && ctx?.churchDay !== true) return 'church'\n",
         tests=[PS], pattern=REP),
    dict(id='rep-church-not-past', file='src/pathStage.ts',
         old="blockIndex(b) >= blockIndex(block) && churchIn(ctx, b)",
         new="churchIn(ctx, b)",
         tests=[PS], pattern=REP),
    dict(id='shape-church-blocks', file='src/pathStage.ts',
         old="churchIn(ctx, block) ? c.church",
         new="ctx.churchDay && block === 'morning' ? c.church",
         tests=[C], pattern=SHAPE),
    # The words: scheduled, never attended.
    dict(id='c-words-sabbath', file=CH,
         old="`the Sabbath, services scheduled at ${timesWords(t)}`",
         new="`the Sabbath, at church at ${timesWords(t)}`",
         tests=[C], pattern=WORDS),
    dict(id='c-words-third', file=CH,
         old="`the Third Day, ${t.length === 1 ? 'a service' : 'services'} scheduled at ${timesWords(t)}`",
         new="`the Third Day, attended at ${timesWords(t)}`",
         tests=[C], pattern=WORDS),
    dict(id='c-words-none', file=CH,
         old="  return ctx.churchDay ? 'a church day' : null\n",
         new="  return ctx.churchDay ? 'a church day' : 'not a church day'\n",
         tests=[C], pattern=WORDS),
    dict(id='facts-today-words', file='src/facts.ts',
         old="'at home', churchWords(ctx), ctx.studyNight",
         new="'at home', ctx.churchDay ? 'a church day' : null, ctx.studyNight",
         tests=[C], pattern=WORDS),
    dict(id='facts-today-times', file='src/facts.ts',
         old="        ...(ctx.church && ctx.services?.length ? { services: timesWords(ctx.services) } : {}),\n",
         new="",
         tests=[C], pattern=WORDS),
    dict(id='facts-yesterday-words', file='src/facts.ts',
         old="`Yesterday was ${churchWords(yctx) ?? 'not a church day'}",
         new="`Yesterday was ${yctx.churchDay ? 'a church day' : 'not a church day'}",
         tests=[C], pattern=WORDS),
    dict(id='last-night-evening', file='src/forecastFlow.ts',
         old="  if (ctx?.churchDay || churchIn(ctx, 'evening')) keys.push('churchDay')\n",
         new="  if (ctx?.churchDay) keys.push('churchDay')\n",
         tests=[C], pattern=AFTER),
    dict(id='last-night-counts-evenings', file='src/forecastFlow.ts',
         old="      return (c) => Boolean(ctxByDay.get(c.day)?.churchDay) || churchIn(ctxByDay.get(c.day), 'evening')\n",
         new="      return (c) => Boolean(ctxByDay.get(c.day)?.churchDay)\n",
         tests=[C], pattern=AFTER),
    dict(id='last-night-scheduled-words', file='src/copy.ts',
         old="'a church day on the schedule'",
         new="'a church day'",
         tests=[C], pattern=AFTER),
    dict(id='worker-day-words', file='worker/src/retrieval.ts',
         old="churchWords(b as never), ",
         new="b.churchDay ? 'a church day' : null, ",
         tests=[WC], pattern=WORKER),
    # On the screen.
    dict(id='ui-grid-edits-tab', file='src/churchSettings.tsx',
         old="save((w) => (which === 'sabbath' ? { ...w, churchDay: day } : { ...w, thirdDay: day }))",
         new="save((w) => ({ ...w, churchDay: day }))",
         tests=[S], pattern=SET_UI),
    dict(id='ui-times-closed', file='src/churchSettings.tsx',
         old="  const [editing, setEditing] = useState(false)\n",
         new="  const [editing, setEditing] = useState(true)\n",
         tests=[S], pattern=SET_UI),
    dict(id='ui-refresh-today', file='src/churchSettings.tsx',
         old=".then(() => refreshChurchToday())",
         new="",
         tests=[S], pattern=SET_UI),
    dict(id='ui-tab-48', file='src/styles.css',
         old=".church-tab {\n  min-height: 48px;",
         new=".church-tab {\n  min-height: 36px;",
         tests=[S], pattern=SET_UI),
    dict(id='ui-time-48', file='src/styles.css',
         old='.church-time input[type="time"] {\n  min-height: 48px;',
         new='.church-time input[type="time"] {\n  min-height: 30px;',
         tests=[S], pattern=SET_UI),
    dict(id='ui-tab-not-colour-alone', file='src/styles.css',
         old=".church-tab.is-on {\n  color: var(--ink);\n  font-weight: 600;\n  text-decoration: underline 2px var(--accent);\n  text-underline-offset: 6px;\n}",
         new=".church-tab.is-on {\n  color: var(--ink);\n}",
         tests=[S], pattern=SET_UI),
    dict(id='ui-sabbath-chip', file='src/extras.tsx',
         old="{!atOfficeToday && !sabbathToday && !chipRetired('amongPeople', states) && <ExtraRow",
         new="{!atOfficeToday && !chipRetired('amongPeople', states) && <ExtraRow",
         tests=[S], pattern=DAY_UI),
    dict(id='ui-church-note-sabbath-only', file='src/extras.tsx',
         old="const churchToday = contexts?.some((c) => c.day === day && c.churchDay === true) ?? false",
         new="const churchToday = contexts?.some((c) => c.day === day && (c.churchDay === true || c.church === 'third')) ?? false",
         tests=[S], pattern=DAY_UI),
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
