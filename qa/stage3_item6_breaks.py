"""Stage 3, item 6's deliberate breaks (built 2026-10-18, at the owner's word): each undoes one rule, and the test that guards it must turn red.

Weather as context: the one request a day, naming only the area to one decimal and two dates, with no referrer;
nothing asked while the switch is off or no place is set; a failure not tried again that day; what comes back read only
in the units asked, a day missing anything unknown and never dry, kept on the days' own records and no record made up;
rain this hour or the next keeping a move that needs the outdoors waiting, only while the switch is on; the comparisons
waiting for 14 days with weather, a day without it on neither side; the sheet carrying the weather only while the
switch is on, values only; the Worker filing it with the day's record, keeping it from the free chain and giving
Claude its rule only when it is there; a line making the weather a cause refused; the switch on this phone alone; the
export saying unknown, never dry; and the screens saying first, and wherever the area goes, exactly what is sent.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for
byte, the table read as data, and an empty test list refused. A break guarded by a unit test runs Vitest; one guarded
by a browser test runs Playwright against the built folder, so the app is rebuilt after its replacement and once more
after its restore.

python stage3_item6_breaks.py [id ...]
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
TH = 'e2e/themes.spec.ts'
W = 'src/weather.test.ts'
F = 'src/weatherFlow.test.ts'
WK = 'worker/src/weather.test.ts'
ON = 'off on a fresh install, its words first'
EV = 'weather on Evidence'
AUDIT = 'weather for your area, its words, its reading'

TABLE = [
    # The one request: the area to one decimal, two dates, and what is asked back; nothing else.
    dict(id='area-one-decimal', file='src/weather.ts',
         old="latitude=${oneDecimal(p.lat)}&longitude=${oneDecimal(p.lon)}",
         new="latitude=${p.lat}&longitude=${p.lon}",
         tests=[W], pattern='names the area to one decimal'),
    dict(id='nothing-else-asked', file='src/weather.ts',
         old="&timezone=auto&start_date=",
         new="&timezone=auto&current=rain&start_date=",
         tests=[W], pattern='names the area to one decimal'),
    dict(id='no-referrer', file='src/weatherFlow.ts',
         old="{ referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store' }",
         new="{ credentials: 'omit', cache: 'no-store' }",
         tests=[F], pattern='switched on, makes one request a day'),
    dict(id='once-a-day', file='src/weatherFlow.ts',
         old="    if (askedHere === today || askedOn() === today) return 'asked'\n",
         new="    if (askedHere === today) return 'asked'\n",
         tests=[F], pattern='switched on, makes one request a day'),
    dict(id='failure-not-retried', file='src/weatherFlow.ts',
         old="    } catch {\n      return 'failed'\n    }\n",
         new="    } catch {\n      askedHere = null\n      markAsked('')\n      return 'failed'\n    }\n",
         tests=[F], pattern='does not try again the same day'),
    dict(id='off-asks-nothing', file='src/weatherFlow.ts',
         old="  if (!settings.weather.on) return 'off'\n",
         new="",
         tests=[F], pattern='asks nothing while the switch is off'),
    dict(id='no-place-asks-nothing', file='src/weatherFlow.ts',
         old="  if (!where) return 'noPlace'\n",
         new="",
         tests=[F], pattern='asks nothing without a place'),
    dict(id='no-record-made-up', file='src/weatherFlow.ts',
         old="      if (ctx) await db.days.put({ ...ctx, weather })",
         new="      await db.days.put({ ...(ctx ?? { day }), weather } as never)",
         tests=[F], pattern='makes no record up for it'),
    # What comes back: the units asked, unknown never dry, the clock hours, the hours on the day alone.
    dict(id='units-asked', file='src/weather.ts',
         old="  if (!unitsAre(obj(o.daily_units), DAILY_UNITS)) return {}\n",
         new="",
         tests=[W], pattern='reads nothing in a unit it did not ask for'),
    dict(id='unknown-never-dry', file='src/weather.ts',
         old="    const showers = num(arr(daily.showers_sum)[i])",
         new="    const showers = num(arr(daily.showers_sum)[i]) ?? 0",
         tests=[W], pattern='leaves a day unknown, never dry'),
    dict(id='hour-before-its-time', file='src/weather.ts',
         old="time.indexOf(`${day}T${String(h + 1).padStart(2, '0')}:00`)",
         new="time.indexOf(`${day}T${String(h).padStart(2, '0')}:00`)",
         tests=[W], pattern='rain by the clock hour'),
    dict(id='hours-on-the-day-alone', file='src/weather.ts',
         old="    const hours = day === today && unitsAre(",
         new="    const hours = unitsAre(",
         tests=[F], pattern='makes no record up for it'),
    # Rain this hour or the next keeps a move that needs the outdoors waiting, while the switch is on.
    dict(id='rain-a-tenth', file='src/weather.ts',
         old="export const RAIN_HOUR_MM = 0.1",
         new="export const RAIN_HOUR_MM = 0.5",
         tests=[W], pattern='says yes while either hour'),
    dict(id='rain-the-next-hour', file='src/weather.ts',
         old="  const known = [w.hours[h], w.hours[h + 1]].filter(",
         new="  const known = [w.hours[h]].filter(",
         tests=[W], pattern='says yes while either hour'),
    dict(id='rain-with-the-switch', file='src/offerFlow.ts',
         old="...(settings.weather.on && rainSoon(ctx.weather, day, now) === true ? { rain: true } : {})",
         new="...(rainSoon(ctx.weather, day, now) === true ? { rain: true } : {})",
         tests=[F], pattern='is offered as before with the switch off'),
    dict(id='outdoors-waits', file='src/offers.ts',
         old="  if (move.needs.includes('outdoors') && t.rain === true) return 'rain'\n",
         new="",
         tests=[F], pattern='waits while rain is forecast'),
    dict(id='outdoors-waits-in-the-draw', file='src/offers.ts',
         old="  if (move.needs.includes('outdoors') && t.rain === true) return 'rain'\n",
         new="",
         tests=[S], pattern='a move that needs the outdoors'),
    # The comparisons: the wet-day line, a day without weather on neither side, 14 days, before today, the share of daylight.
    dict(id='rainy-at-a-millimetre', file='src/weather.ts',
         old="export const RAIN_DAY_MM = 1",
         new="export const RAIN_DAY_MM = 0.1",
         tests=[W], pattern='set rainy days against dry ones'),
    dict(id='unknown-on-neither-side', file='src/weather.ts',
         old="  const rain = dayAssociation(checkins, today, isRainy, (day) => known.has(day))",
         new="  const rain = dayAssociation(checkins, today, isRainy)",
         tests=[W], pattern='set rainy days against dry ones'),
    dict(id='fourteen-days', file='src/weather.ts',
         old="export const WEATHER_DAYS_MIN = 14",
         new="export const WEATHER_DAYS_MIN = 13",
         tests=[W], pattern='wait for 14 days'),
    dict(id='days-before-today', file='src/weather.ts',
         old="contexts.filter((c) => c.day < today && c.weather)",
         new="contexts.filter((c) => c.day <= today && c.weather)",
         tests=[W], pattern='wait for 14 days'),
    dict(id='share-of-daylight', file='src/weather.ts',
         old="  return span > 0 ? Math.min(1, (ctx.weather.sun * 60) / span) : null",
         new="  return span > 0 ? ctx.weather.sun : null",
         tests=[W], pattern='set sunnier days against greyer ones'),
    # The day's sheet: only while the switch is on, values only.
    dict(id='sheet-only-while-on', file='src/brainFlow.ts',
         old="...(settings.weather.on ? { weatherOn: true } : {})",
         new="weatherOn: true",
         tests=[F], pattern='carries the weather only while the switch is on'),
    dict(id='sheet-values-only', file='src/facts.ts',
         old="{ rain: w.rain, sun: w.sun, high, highF }))",
         new="{ rain: w.rain, sun: w.sun, high, highF, at: w.at }))",
         tests=[W], pattern='carries today’s forecast'),
    dict(id='sheet-written-again', file='src/weatherFlow.ts',
         old="    void readWeatherToday(clock()).then((r) => {\n      if (r === 'read') onRead()\n    })\n",
         new="    void readWeatherToday(clock()).then(() => undefined)\n",
         tests=[S], pattern=ON),
    # The Worker: the day's record, never the free chain, Claude's rule only when it is there.
    dict(id='worker-day-record', file='worker/src/retrieval.ts',
         old="                          ['dayRecord']\n                        : f.id === 'becoming'",
         new="                          ['factSheet']\n                        : f.id === 'becoming'",
         tests=[WK], pattern='file the weather and its comparisons'),
    dict(id='worker-free-chain', file='worker/src/briefing.ts',
         old="|| isWeeklyFact(id) || isWeatherFact(id))",
         new="|| isWeeklyFact(id))",
         tests=[WK], pattern='keep the free chain on the approved fact sheet'),
    dict(id='worker-rule-only-when', file='worker/src/prompt.ts',
         old="(sheet.facts.some((f) => isWeatherFact(f.id)) ? `\\n\\n${WEATHER_RULES}` : '')",
         new="`\\n\\n${WEATHER_RULES}`",
         tests=[WK], pattern='rule only when a weather fact is on its sheet'),
    # A line that makes the weather a cause is refused.
    dict(id='cause-refused', file='src/brainShared.ts',
         old="  if (factIds.some(isWeatherFact)) {\n    const why = weatherRefusal(text)\n    if (why) out.push(why)\n  }\n",
         new="",
         tests=['src/brainShared.test.ts'], pattern='refuses the weather said to cause a reading'),
    dict(id='cause-because', file='src/brainShared.ts',
         old="because (?:of )?(?:the )?(?:rain|weather|grey|gray|clouds?|sun(?:shine)?|heat|cold)|",
         new="",
         tests=['src/brainShared.test.ts'], pattern='refuses the weather said to cause a reading'),
    # The switch, on this phone alone and off until turned on.
    dict(id='switch-never-sent', file='src/cloudOutbox.ts',
         old="location: _location, weather: _weather, ...rest",
         new="location: _location, ...rest",
         tests=['src/cloud.test.ts'], pattern='never restores the weather'),
    dict(id='switch-kept-on-pull', file='src/cloudSync.ts',
         old=", weather: mine?.weather ?? withDefaults(undefined).weather }",
         new=" }",
         tests=['src/cloud.test.ts'], pattern='never restores the weather'),
    dict(id='switch-off-by-default', file='src/settings.ts',
         old="  weather: { on: false },\n  setupUndone: {},",
         new="  weather: { on: true },\n  setupUndone: {},",
         tests=['src/settings.test.ts'], pattern='is off on a fresh install'),
    # The export: values only, unknown never dry.
    dict(id='export-unknown-empty', file='src/export.ts',
         old="    String(weatherOf.get(c.day)?.rain ?? ''),",
         new="    String(weatherOf.get(c.day)?.rain ?? 0),",
         tests=['src/export.test.ts'], pattern='gives each check-in row its day'),
    dict(id='export-values-only', file='src/export.ts',
         old="({ day, rainMm: w.rain, sunHours: w.sun, highC: w.high, readAt: w.at })",
         new="({ day, rainMm: w.rain, sunHours: w.sun, highC: w.high, readAt: w.at, hours: w.hours ?? null })",
         tests=['src/export.test.ts'], pattern='lists each day with weather'),
    # The screens: words first, Not now, the credit, and wherever the area goes, said.
    dict(id='words-first', file='src/settingsScreen.tsx',
         old="onChange={(v) => (v ? setAsking(true) : onChange(false))}",
         new="onChange={(v) => onChange(v)}",
         tests=[S], pattern=ON),
    dict(id='not-now-stays-off', file='src/settingsScreen.tsx',
         old='data-testid="weather-not-now" onClick={() => setAsking(false)}',
         new='data-testid="weather-not-now" onClick={() => onChange(true)}',
         tests=[S], pattern=ON),
    dict(id='words-name-the-terms', file='src/copy.ts',
         old=" Its terms say it keeps request logs, coordinates among them, for 90 days.'",
         new="'",
         tests=[S], pattern=ON),
    dict(id='credit-beside-the-forecast', file='src/settingsScreen.tsx',
         old='          <a class="credit" href={WEATHER_CREDIT_URL} target="_blank" rel="noopener noreferrer" data-testid="weather-credit">\n            {c.credit}\n          </a>\n',
         new='',
         tests=[S], pattern=ON),
    dict(id='place-note-says-so', file='src/settingsScreen.tsx',
         old="fill(weatherOn ? w.placeSunWeather : w.placeSun,",
         new="fill(w.placeSun,",
         tests=[S], pattern=ON),
    dict(id='data-note-says-so', file='src/copy.ts',
         old="your area to one decimal and two dates, to Open-Meteo once a day, if you turn on Weather for your area under The week; ",
         new="",
         tests=[S], pattern=ON),
    dict(id='week-row-says-so', file='src/settingsScreen.tsx',
         old=", ...(s.weather.on ? [n.weatherOn] : [])]",
         new="]",
         tests=[S], pattern=ON),
    dict(id='watched-while-on', file='src/app.tsx',
         old="  useEffect(() => (weatherOn ? watchWeather(() => void writeFactsRow(blockAt(new Date()).day)) : undefined), [weatherOn])",
         new="  useEffect(() => undefined, [weatherOn])",
         tests=[S], pattern=ON),
    dict(id='evidence-only-while-on', file='src/evidenceScreen.tsx',
         old="  if (!settings?.weather.on || !all || !days) return null",
         new="  if (!settings || !all || !days) return null",
         tests=[S], pattern=EV),
    dict(id='location-note-says-so', file='src/locationScreen.tsx',
         old="          {settings?.weather.on ? ` ${c.keptWeather}` : ''}\n",
         new="",
         tests=[TH], pattern=AUDIT),
    dict(id='credit-target-48', file='src/styles.css',
         old=".textbtn.inline::after,\na.credit::after {",
         new=".textbtn.inline::after {",
         tests=[TH], pattern=AUDIT),
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
