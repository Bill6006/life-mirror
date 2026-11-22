"""Phase 8 of the next build (2026-11-14), the forecast's one challenger. Each rule undone once, and the test that
guards it must turn red. The challenger was switched on 2026-11-19, in a commit of its own, once all of it was in. The entries were added piece by piece as it was wired in:
the pure module first, then its list read from the record and the writer's use of it.

An adjustment: read from the day before alone, on the day forecast and in the back-test; a slot's own miss is never
in its own size; a state's average miss less the average over every known day; cut by its own uncertainty; nothing
under eight days in the state, nor eight outside it; a state that does not move moves nothing; a condition moves only
its own check-ins; a state the record cannot speak for is never read as "no"; each condition learns from what the one
before it left.

The pick: enough slots; the least gain; the least clearance; the gain is the base way's miss less its own; the
clearance is the gain over its day-to-day spread; it looks back over the window and no further; its range comes from
the back-test's days alone, and from its own misses.

The kinds that join: only at a steady pattern; three at most; a kind that stands does join.

The numbers: switched off; the margin as the simulation set it.

The forecast's leakage rules, against the store: no row for a slot already logged; a row once written is never
touched; the hit-rate line counts day-ahead rows alone.

The list read from the record: a short night is the lowest two anchors; no answer is unknown; the evening is the
complete evening check-in, completed before the next day began; the standings come from the days before the day of
the run; the church day is no candidate while faith is hidden; a thing joins only at a steady pattern; a thing never
shown is unknown, and so is an evening not logged in full; a thing moves only the morning after it was present.

The rows: the points are added to the base way's forecast; the range comes from the challenger's own misses; a row
nothing speaks for is left as it was; the row says what was added and keeps the base way's name.

Private items and note events: an evening counts only where it was completed before the next day began; a private
item is unknown where it was not on screen, and compared only there; a type of note event is known only at an evening
with a note, compared only there, present only with an event of its own type on that check-in's note, identified
before the morning's day began, never one marked wrong; a type joins once five check-ins hold one, identified before
the day of the run; each kind only while its Brain switch is on, the writer reading both switches and the marks; the
list's order. The export carries the two fields, a private item only with private items and then by its name.

The Worker's side: a moved forecast's fact needs a move and a condition the forecast knows, and names the switch of
every condition, each read; a private item by its name only where names may be shown; the way of the newest
forecasts; the day-ahead record counts the day-ahead forecasts alone, and the moved forecasts' record those moved; a
kind the read layer does not name is closed. The checker: the rule binds a stored forecast only beside a counted
comparison; the track record is cited, any of the three; no cause, caffeine's own rule answering for its own; a
stored forecast by its day; the validator holds it; both tiers are told it. The shared words: from twenty; the ways
that tell weekdays apart; the church day under faith; an unknown thing, item or type read nowhere; a private item by
its name where one is given.

Where a forecast and a counted comparison differ (2026-11-18): only where the forecast's way cannot tell one weekday
from another, on the forecast's own weekday read from its date, a steady cell, of the level alone; the stored forecast
names its way; only moved the other way, against a steady comparison of a condition that moved it, a private item's
own and the things of last night as the sheet names them; the moved fact says its direction; the words the rule
names, and "different" not among them; the checker asks, reads the cited facts alone, and is handed them by the
validator; the rule names the words.

The writer: nothing of it runs while the switch is off; rows are adjusted only when it is picked; on the wired
writer nothing logged today moves today's forecast; an adjusted row is never touched.
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
CH = 'src/challenger.ts'
F = 'src/forecast.ts'
FF = 'src/forecastFlow.ts'
W = 'src/weekly.ts'
CT = 'src/challenger.test.ts'
ST = 'src/challengerSimulation.test.ts'
LT = 'src/forecastLeakage.test.ts'
CR = 'src/challengerRecord.ts'
RT = 'src/challengerRecord.test.ts'
WT = 'src/forecastChallenger.test.ts'
UT = 'src/forecastWriterUnchanged.test.ts'
KT = 'src/challengerCandidates.test.ts'
FC = 'src/forecastCandidates.test.ts'
EX = 'src/export.ts'
L = 'worker/src/lookups.ts'
R = 'worker/src/retrieval.ts'
BS = 'src/brainShared.ts'
P = 'worker/src/prompt.ts'
FCS = 'src/forecastConditions.ts'
WK = 'worker/src/forecastsLookup.test.ts'
RF = 'src/forecastRefusals.test.ts'
FCT = 'src/forecastConditions.test.ts'
DT = 'src/forecastDifferences.test.ts'

SIZE = 'cut by its own uncertainty'
USELESS = 'rarely picks it'
ALONE = 'three numbers alone'

TABLE = [
    # An adjustment.
    dict(id='read-from-the-day-before', file=CH,
         old="adjustmentFor: (day, block) => adjust(addDays(day, -1), block, null) }",
         new="adjustmentFor: (day, block) => adjust(day, block, null) }",
         tests=[CT], pattern='on seeded records'),
    dict(id='the-back-test-reads-the-day-before', file=CH,
         old="    const before = addDays(day, -1)",
         new="    const before = day",
         tests=[CT], pattern=SIZE),
    dict(id='a-slots-own-miss-is-not-in-its-size', file=CH,
         old="      const size = c.moves(state) ? sizeOf(sums.get(key), state, numbers) : 0",
         new="      if (left !== null) take(key, state, left)\n      const size = c.moves(state) ? sizeOf(sums.get(key), state, numbers) : 0",
         tests=[ST], pattern=USELESS),
    dict(id='less-the-average-over-every-known-day', file=CH,
         old="  const size = s.sum / s.n - sums.sum / sums.n",
         new="  const size = s.sum / s.n",
         tests=[CT], pattern=SIZE),
    dict(id='cut-by-its-own-uncertainty', file=CH,
         old="  return size * Math.max(0, 1 - (numbers.shrink * unsure) / (size * size))",
         new="  return size",
         tests=[CT], pattern='within its own noise'),
    dict(id='eight-days-in-the-state', file=CH,
         old="s.n < numbers.minState || sums.n - s.n < numbers.minState) return 0",
         new="sums.n - s.n < numbers.minState) return 0",
         tests=[CT], pattern='is nothing under eight days'),
    dict(id='eight-days-outside-it', file=CH,
         old="s.n < numbers.minState || sums.n - s.n < numbers.minState) return 0",
         new="s.n < numbers.minState) return 0",
         tests=[CT], pattern='is nothing under eight days'),
    dict(id='a-state-that-does-not-move', file=CH,
         old="      const size = c.moves(state) ? sizeOf(sums.get(key), state, numbers) : 0",
         new="      const size = sizeOf(sums.get(key), state, numbers)",
         tests=[CT], pattern='a kind moves only the morning'),
    dict(id='only-its-own-check-ins', file=CH,
         old="      if (!c.blocks.includes(block)) return\n",
         new="",
         tests=[CT], pattern='a kind moves only the morning'),
    dict(id='unknown-is-never-no', file=CH,
         old="      const state = c.stateOn(before)\n",
         new="      const state = c.stateOn(before) ?? 'no'\n",
         tests=[CT], pattern='cannot speak for the condition'),
    dict(id='each-learns-from-what-was-left', file=CH,
         old="        left -= size\n",
         new="",
         tests=[CT], pattern='takes the conditions in order'),
    # The pick.
    dict(id='enough-slots', file=CH,
         old="const picked = slots >= numbers.minSlots && gain !== null",
         new="const picked = gain !== null",
         tests=[CT], pattern=ALONE),
    dict(id='the-least-gain', file=CH,
         old="gain >= numbers.minGain && clear !== null",
         new="clear !== null",
         tests=[CT], pattern=ALONE),
    dict(id='the-least-clearance', file=CH,
         old="clear >= numbers.minClear",
         new="clear >= 0",
         tests=[CT], pattern=ALONE),
    dict(id='the-gain-is-miss-less-miss', file=CH,
         old="dayGain += Math.abs(miss) - Math.abs(miss - a.points)",
         new="dayGain += Math.abs(a.points)",
         tests=[ST], pattern=USELESS),
    dict(id='the-clearance-is-over-its-spread', file=CH,
         old="clear = spread > 0 ? total / spread : null",
         new="clear = spread > 0 ? total : null",
         tests=[CT], pattern='whatever the scale'),
    dict(id='the-window', file=CH,
         old="for (let back = numbers.window; back >= 1; back--) {",
         new="for (let back = 365; back >= 1; back--) {",
         tests=[CT], pattern='looks back over the window'),
    dict(id='its-range-from-the-back-test-days', file=CH,
         old="if (back <= BACKTEST_DAYS) errors.push(miss - a.points)",
         new="errors.push(miss - a.points)",
         tests=[CT], pattern='takes its range'),
    dict(id='its-range-from-its-own-misses', file=CH,
         old="if (back <= BACKTEST_DAYS) errors.push(miss - a.points)",
         new="if (back <= BACKTEST_DAYS) errors.push(miss)",
         tests=[CT], pattern='takes its range'),
    # The kinds that join.
    dict(id='only-at-a-steady-pattern', file=CH,
         old=".filter((s) => s.standing === 'pattern')",
         new=".filter((s) => s.standing === 'pattern' || s.standing === 'lead')",
         tests=[CT], pattern='takes only kinds'),
    dict(id='three-kinds-at-most', file=CH,
         old="    .slice(0, max)\n",
         new="",
         tests=[CT], pattern='takes only kinds'),
    dict(id='a-kind-that-stands-joins', file=CH,
         old="    .slice(0, max)\n",
         new="    .slice(0, 0)\n",
         tests=[ST], pattern='for a thing that lifts'),
    # The numbers.
    dict(id='switched-on', file=CH,
         old="export const CHALLENGER_ON = true",
         new="export const CHALLENGER_ON = false",
         tests=[CT], pattern='is switched on'),
    dict(id='the-margin-as-set', file=CH,
         old="minSlots: 20, minGain: 0.5, minClear: 2.4, maxKinds: 3 }",
         new="minSlots: 20, minGain: 0.5, minClear: 2.2, maxKinds: 3 }",
         tests=[CT], pattern='is switched on'),
    # The forecast's leakage rules, against the store.
    dict(id='no-row-for-a-logged-slot', file=F,
         old="      if (logged.has(slotKey(day, block))) continue\n",
         new="",
         tests=[LT], pattern='writes no forecast for a slot already logged'),
    dict(id='a-row-is-never-touched', file=FF,
         old="    if (due.length) await db.forecasts.bulkAdd(due)",
         new="    if (due.length) {\n      await db.forecasts.clear()\n      await db.forecasts.bulkAdd(due)\n    }",
         tests=[LT], pattern='never rewrites a stored forecast'),
    dict(id='the-line-counts-day-ahead-rows', file=W,
         old="  const dayAhead = scores.filter((s) => s.horizon === 1)",
         new="  const dayAhead = scores",
         tests=[LT], pattern='counts in the hit rate only stored forecasts'),
    # The list read from the record.
    dict(id='a-short-night-is-the-lowest-two-anchors', file=CR,
         old="return v === undefined ? null : v <= SHORT_NIGHT ? 'short' : 'not'",
         new="return v === undefined ? null : v < SHORT_NIGHT ? 'short' : 'not'",
         tests=[RT], pattern='reads a short night'),
    dict(id='no-sleep-answer-is-unknown', file=CR,
         old="return v === undefined ? null : v <= SHORT_NIGHT ? 'short' : 'not'",
         new="return v === undefined ? 'not' : v <= SHORT_NIGHT ? 'short' : 'not'",
         tests=[RT], pattern='reads a short night'),
    dict(id='the-evening-completed-before-the-next-day', file=CR,
         old="if (o.block === 'evening' && o.at <= dayStart(addDays(o.day, 1))) band.set(o.day, o.band)",
         new="if (o.block === 'evening') band.set(o.day, o.band)",
         tests=[RT], pattern='reads the evening by its band'),
    dict(id='the-evening-is-the-evening-check-in', file=CR,
         old="if (o.block === 'evening' && o.at <= dayStart(addDays(o.day, 1))) band.set(o.day, o.band)",
         new="if (o.at <= dayStart(addDays(o.day, 1))) band.set(o.day, o.band)",
         tests=[RT], pattern='reads the evening by its band'),
    dict(id='the-standings-from-days-before-today', file=CR,
         old="const beforeToday = (r: ChallengerRecord, today: string): CheckIn[] => r.checkins.filter((c) => c.day < today)",
         new="const beforeToday = (r: ChallengerRecord, today: string): CheckIn[] => [...r.checkins]",
         tests=[RT], pattern='works the standings out from the days before'),
    dict(id='no-church-day-while-faith-is-hidden', file=CR,
         old="LAST_NIGHT_KEYS.filter((key) => !(r.hideFaith && key === 'churchDay')).flatMap(",
         new="LAST_NIGHT_KEYS.flatMap(",
         tests=[RT], pattern='never takes the church day'),
    dict(id='a-thing-joins-only-at-a-pattern', file=CR,
         old="...family.filter((f) => standing.has(f.compared.id)).map(",
         new="...family.map(",
         tests=[RT], pattern='puts a thing of last night on the list only when'),
    dict(id='a-thing-never-shown-is-unknown', file=CR,
         old="(c) => (known && !known(c) ? null : isEvent(c) ? 'yes' : 'no')",
         new="(c) => (isEvent(c) ? 'yes' : 'no')",
         tests=[RT], pattern='present, absent, or unknown'),
    dict(id='an-evening-not-logged-in-full-is-unknown', file=CR,
         old="    if (c.block !== 'evening' || readingOf(c) === null) continue\n",
         new="    if (c.block !== 'evening') continue\n",
         tests=[RT], pattern='present, absent, or unknown'),
    dict(id='a-thing-moves-only-when-present', file=CR,
         old="    moves: (state) => state === 'yes',",
         new="    moves: () => true,",
         tests=[RT], pattern='present, absent, or unknown'),
    dict(id='a-thing-moves-the-morning-alone', file=CR,
         old="    blocks: ['morning'],",
         new="    blocks: BLOCKS,",
         tests=[RT], pattern='present, absent, or unknown'),
    # The rows.
    dict(id='the-points-are-added', file=CR,
         old="    f.point = clamp(p + a.points)",
         new="    f.point = clamp(p)",
         tests=[RT], pattern='adds its points'),
    dict(id='the-range-from-the-challengers-misses', file=CR,
         old="    f.lo = clamp(p + a.points + band.lo)",
         new="    f.lo = clamp(p + a.points)",
         tests=[RT], pattern='adds its points'),
    dict(id='a-row-nothing-speaks-for-is-left', file=CR,
         old="    if (a.points === 0) continue\n",
         new="",
         tests=[RT], pattern='adds its points'),
    dict(id='the-row-says-what-was-added', file=CR,
         old="    f.adjBy = a.by\n",
         new="",
         tests=[RT], pattern='adds its points'),
    dict(id='the-row-keeps-the-base-ways-name', file=CR,
         old="    f.adjBy = a.by\n",
         new="    f.adjBy = a.by\n    f.model = 'challenger'\n",
         tests=[WT], pattern='under one of the four ways'),
    # The writer.
    dict(id='nothing-runs-while-switched-off', file=FF,
         old="const tried = chosen && challengerOn() && !(await challengerSwitchedOff(today)) ? await",
         new="const tried = chosen && !(await challengerSwitchedOff(today)) ? await",
         tests=[UT], pattern='writes the rows it wrote before'),
    dict(id='adjusted-only-when-picked', file=FF,
         old="    if (tried?.picked) adjustRows(due, tried, values, predictOf)",
         new="    if (tried) adjustRows(due, tried, values, predictOf)",
         tests=[WT], pattern='tried and not picked'),
    dict(id='the-wired-writer-reads-the-day-before', file=CH,
         old="adjustmentFor: (day, block) => adjust(addDays(day, -1), block, null) }",
         new="adjustmentFor: (day, block) => adjust(day, block, null) }",
         tests=[WT], pattern='lets nothing logged today move'),
    dict(id='an-adjusted-row-is-never-touched', file=FF,
         old="    if (due.length) await db.forecasts.bulkAdd(due)",
         new="    if (due.length) {\n      await db.forecasts.clear()\n      await db.forecasts.bulkAdd(due)\n    }",
         tests=[WT], pattern='never rewrites an adjusted row'),
    # Piece 3: private items and note events as candidates, with their switches; the export's two fields.
    dict(id='an-evening-completed-before-the-next-day-began', file=CR,
         old="    if (at && Date.parse(at) <= Date.parse(dayStart(addDays(c.day, 1)))) out.set(c.day, c)",
         new="    if (at) out.set(c.day, c)",
         tests=[KT], pattern='completed before the next day began'),
    dict(id='a-private-item-unknown-where-not-shown', file=CR,
         old="(c) => (!privateShownAt(item, c) ? null : logged(c) ? 'yes' : 'no')",
         new="(c) => (logged(c) ? 'yes' : 'no')",
         tests=[KT], pattern='reads a private item as marked'),
    dict(id='a-note-event-known-only-at-a-note', file=CR,
         old="    if (!noteOf(c)) return null\n",
         new="",
         tests=[KT], pattern='only at an evening with a note'),
    dict(id='a-note-event-identified-before-the-day', file=CR,
         old="events.some((n) => n.checkinId === c.id && identifiedBefore(n, start))",
         new="events.some((n) => n.checkinId === c.id)",
         tests=[KT], pattern='only at an evening with a note'),
    dict(id='before-the-mornings-own-day', file=CR,
         old="    const start = dayStart(addDays(day, 1))\n",
         new="    const start = dayStart(addDays(day, 2))\n",
         tests=[KT], pattern='only at an evening with a note'),
    dict(id='no-event-marked-wrong', file=CR,
         old="(r.noticed ?? []).filter((n) => !n.wrong && n.checkinId !== null && n.type.id === type)",
         new="(r.noticed ?? []).filter((n) => n.checkinId !== null && n.type.id === type)",
         tests=[KT], pattern='only at an evening with a note'),
    dict(id='an-event-on-a-check-ins-note', file=CR,
         old="(r.noticed ?? []).filter((n) => !n.wrong && n.checkinId !== null && n.type.id === type)",
         new="(r.noticed ?? []).filter((n) => !n.wrong && n.type.id === type)",
         tests=[KT], pattern='once five check-ins hold one'),
    dict(id='an-event-of-its-own-type', file=CR,
         old="(r.noticed ?? []).filter((n) => !n.wrong && n.checkinId !== null && n.type.id === type)",
         new="(r.noticed ?? []).filter((n) => !n.wrong && n.checkinId !== null)",
         tests=[KT], pattern='once five check-ins hold one'),
    dict(id='five-check-ins-hold-one', file=CR,
         old=".map((n) => n.checkinId)).size >= NOTICED_MIN)",
         new=".map((n) => n.checkinId)).size >= NOTICED_MIN - 1)",
         tests=[KT], pattern='once five check-ins hold one'),
    dict(id='the-five-identified-before-today', file=CR,
         old="    .filter((type) => new Set(eventsOf(r, type).filter((n) => identifiedBefore(n, start)).map(",
         new="    .filter((type) => new Set(eventsOf(r, type).map(",
         tests=[KT], pattern='once five check-ins hold one'),
    dict(id='note-types-only-while-notes-on', file=CR,
         old="  if (!r.notesOn) return []\n",
         new="",
         tests=[KT], pattern='only while their Brain switches are on'),
    dict(id='private-items-only-while-switched-on', file=CR,
         old="  if (!r.privateOn) return []\n",
         new="",
         tests=[KT], pattern='only while their Brain switches are on'),
    dict(id='a-private-item-compared-where-shown', file=CR,
         old="privateIsLogged(item.id), (c) => privateShownAt(item, c), { id: privateId(item.id)",
         new="privateIsLogged(item.id), () => true, { id: privateId(item.id)",
         tests=[KT], pattern='compares a private item only at the evenings'),
    dict(id='a-note-type-compared-where-a-note-was-written', file=CR,
         old="on.has(c.id), (c) => noteOf(c) !== '', { id: noticedId(type)",
         new="on.has(c.id), () => true, { id: noticedId(type)",
         tests=[KT], pattern='compares a private item only at the evenings'),
    dict(id='the-standing-counts-events-identified-before-today', file=CR,
         old="    const on = new Set(eventsOf(r, type).filter((n) => identifiedBefore(n, start)).map((n) => n.checkinId))",
         new="    const on = new Set(eventsOf(r, type).map((n) => n.checkinId))",
         tests=[KT], pattern='compares a private item only at the evenings'),
    dict(id='the-list-order', file=CR,
         old="  return [...night, ...privateCandidates(r, today), ...noticedCandidates(r, today)]",
         new="  return [...night, ...noticedCandidates(r, today), ...privateCandidates(r, today)]",
         tests=[KT], pattern='only while their Brain switches are on'),
    dict(id='the-writer-reads-the-private-switch', file=FF,
         old="privateOn: prefs.switches.privateItems !== false,",
         new="privateOn: true,",
         tests=[FC], pattern='switch for private items is off'),
    dict(id='the-writer-reads-the-notes-switch', file=FF,
         old="notesOn: prefs.switches.notes !== false }",
         new="notesOn: true }",
         tests=[FC], pattern='switch for notes is off'),
    dict(id='the-writer-reads-the-marks', file=FF,
         old="  const noticed = noticedOf({ events, marks, checkins, kept })",
         new="  const noticed = noticedOf({ events, marks: [], checkins, kept })",
         tests=[FC], pattern='counts no event marked wrong'),
    dict(id='the-export-leaves-a-private-item-out', file=EX,
         old="    if (!includePrivate) return []\n",
         new="",
         tests=[KT], pattern='a private item only with private items'),
    dict(id='the-export-names-a-private-item', file=EX,
         old="    return [`private: ${names.get(key) ?? `item ${key}`}`]",
         new="    return [id]",
         tests=[KT], pattern='a private item only with private items'),
    dict(id='the-export-carries-the-two-fields', file=EX,
         old="whatIf: f.whatIf, ...forecastAdjustment(f, names, opts.includePrivate) })),",
         new="whatIf: f.whatIf })),",
         tests=[KT], pattern='a private item only with private items'),
    # Piece 4: the Worker's side. What moved a stored forecast, read under every switch of its conditions.
    dict(id='the-moved-fact-needs-a-move', file=L,
         old="  if (typeof b.adj !== 'number' || !Number.isFinite(b.adj) || b.adj === 0 || !Array.isArray(b.adjBy)) return null",
         new="  if (typeof b.adj !== 'number' || !Number.isFinite(b.adj) || !Array.isArray(b.adjBy)) return null",
         tests=[WK], pattern='serves nothing of a condition the forecast does not know'),
    dict(id='an-unknown-condition-is-read-nowhere', file=L,
         old="  if (!by.length || kinds.some((k) => k === null)) return null",
         new="  if (!by.length) return null",
         tests=[WK], pattern='makes no fact of a condition the forecast does not know'),
    dict(id='the-moved-fact-names-every-switch', file=L,
         old="by: by.join('|'), kinds: [...new Set(kinds)].join('|') }, kinds.includes('faith'))",
         new="by: by.join('|') }, kinds.includes('faith'))",
         tests=[WK], pattern='how far it was moved and for what'),
    dict(id='a-private-name-only-where-names-are-shown', file=L,
         old="  const namesPrivate = x.showPrivate && rows.some(",
         new="  const namesPrivate = rows.some(",
         tests=[WK], pattern='names a private item only where names may be shown'),
    dict(id='the-way-of-the-newest-forecasts', file=L,
         old="str(b.madeOn) > str(m.madeOn) ? b : m), null)",
         new="str(b.madeOn) < str(m.madeOn) ? b : m), null)",
         tests=[WK], pattern='which way the latest forecasts rest on'),
    dict(id='the-day-ahead-record-counts-day-ahead', file=L,
         old="  const ahead = scores.filter((b) => Number(b.horizon) === 1)",
         new="  const ahead = scores",
         tests=[WK], pattern='the day-ahead record exactly as the Weekly View counts it'),
    dict(id='the-moved-record-counts-moved-forecasts', file=L,
         old="  const movedScores = scores.filter((b) => movedSlots.has(slot(b)))",
         new="  const movedScores = scores",
         tests=[WK], pattern='the day-ahead record exactly as the Weekly View counts it'),
    dict(id='a-moved-forecast-holds-a-number', file=L,
         old=".filter((b) => typeof b.adj === 'number').map(slot))",
         new=".map(slot))",
         tests=[WK], pattern='the day-ahead record exactly as the Weekly View counts it'),
    dict(id='the-read-layer-reads-every-kind', file=R,
         old="    if (head === 'forecasts' && typeof f.values.kinds === 'string' && f.values.kinds) {",
         new="    if (head === 'none' && typeof f.values.kinds === 'string' && f.values.kinds) {",
         tests=[WK], pattern='how far it was moved and for what'),
    dict(id='a-kind-the-layer-does-not-name-is-closed', file=R,
         old="f.values.kinds.split('|').map((k) => ((CATEGORIES as readonly string[]).includes(k) ? (k as Category) : CLOSED))",
         new="f.values.kinds.split('|').map((k) => k as Category)",
         tests=[WK], pattern='closes a kind the read layer does not name'),
    # The checker.
    dict(id='the-rule-binds-only-beside-a-comparison', file=BS,
         old="  if (!factIds.some(isStoredForecastFact) || !factIds.some(isAssociationFact)) return []",
         new="  if (!factIds.some(isStoredForecastFact)) return []",
         tests=[RF], pattern='asks for the forecast’s own track record'),
    dict(id='the-track-record-is-cited', file=BS,
         old="  if (!factIds.some((id) => FORECAST_RECORD_IDS.includes(id))) out.push(",
         new="  if (false) out.push(",
         tests=[RF], pattern='asks for the forecast’s own track record'),
    dict(id='no-cause-beside-a-forecast', file=BS,
         old="  const cause = CAFFEINE_WORDS.test(text) ? null : found(CAUSAL_WORDS, text, all)",
         new="  const cause = CAFFEINE_WORDS.test(text) ? null : null",
         tests=[RF], pattern='refuses a cause beside a forecast'),
    dict(id='caffeines-own-rule-answers-for-it', file=BS,
         old="  const cause = CAFFEINE_WORDS.test(text) ? null : found(CAUSAL_WORDS, text, all)",
         new="  const cause = found(CAUSAL_WORDS, text, all)",
         tests=[RF], pattern='refuses a cause beside a forecast'),
    dict(id='a-stored-forecast-by-its-day', file=BS,
         old="  return /^forecasts\\.\\d{4}-\\d{2}-\\d{2}\\./.test(id)",
         new="  return /^forecasts\\./.test(id)",
         tests=[RF], pattern='knows a stored forecast'),
    dict(id='every-record-of-the-forecast', file=BS,
         old="export const FORECAST_RECORD_IDS: readonly string[] = ['forecasts.dayAhead', 'forecasts.scorecard', 'forecasts.movedRecord']",
         new="export const FORECAST_RECORD_IDS: readonly string[] = ['forecasts.dayAhead']",
         tests=[RF], pattern='asks for the forecast’s own track record'),
    dict(id='the-validator-holds-the-forecast-rule', file=BS,
         old="  if (factIds.some(isStoredForecastFact)) out.push(...forecastRefusals(text, factIds, all, sheet))\n",
         new="",
         tests=[RF], pattern='is held by the validator on a whole answer'),
    dict(id='both-tiers-are-told-the-rule', file=P,
         old="    FORECAST_RULE,\n",
         new="",
         tests=[WK], pattern='tells both tiers of Ask'),
    # The shared words.
    dict(id='the-day-ahead-rate-from-twenty', file=FCS,
         old="export const DAY_AHEAD_MEASURED_FROM = 20",
         new="export const DAY_AHEAD_MEASURED_FROM = 19",
         tests=[FCT], pattern='counts the day-ahead record from twenty'),
    dict(id='the-ways-that-tell-weekdays-apart', file=FCS,
         old="export const WEEKDAY_WAYS: readonly string[] = ['weekdayBlock', 'blend', 'levelWeekday']",
         new="export const WEEKDAY_WAYS: readonly string[] = ['weekdayBlock', 'levelWeekday']",
         tests=[FCT], pattern='names each way'),
    dict(id='the-church-day-under-faith', file=FCS,
         old="return typeof NIGHT[key] !== 'string' ? null : key === 'churchDay' ? 'faith' : 'dayRecord'",
         new="return typeof NIGHT[key] !== 'string' ? null : 'dayRecord'",
         tests=[FCT], pattern='reads each condition under its own switch'),
    dict(id='an-unknown-thing-of-last-night', file=FCS,
         old="return typeof NIGHT[key] !== 'string' ? null : key === 'churchDay' ? 'faith' : 'dayRecord'",
         new="return key === 'churchDay' ? 'faith' : 'dayRecord'",
         tests=[FCT], pattern='reads each condition under its own switch'),
    dict(id='a-private-item-by-its-number', file=FCS,
         old="  if (/^private\\.\\d+$/.test(id)) return 'privateItems'",
         new="  if (/^private\\./.test(id)) return 'privateItems'",
         tests=[FCT], pattern='reads each condition under its own switch'),
    dict(id='a-note-event-of-a-known-type', file=FCS,
         old="  if (id.startsWith('noticed.')) return eventTypeOf(id.slice('noticed.'.length)) ? 'notes' : null",
         new="  if (id.startsWith('noticed.')) return 'notes'",
         tests=[FCT], pattern='reads each condition under its own switch'),
    dict(id='a-private-item-by-its-name-where-given', file=FCS,
         old="${privateName(id.slice('private.'.length)) ?? 'a private item'} marked the evening before",
         new="a private item marked the evening before",
         tests=[FCT], pattern='says each condition in words'),
    # Piece 5: where a stored forecast and a counted comparison differ, read from their structured fields alone.
    dict(id='a-weekday-the-way-cannot-see', file=FCS,
         old="    if (!m || typeof f.values.model !== 'string' || WEEKDAY_WAYS.includes(f.values.model)) continue",
         new="    if (!m || typeof f.values.model !== 'string') continue",
         tests=[DT], pattern='finds none where the way can tell weekdays apart'),
    dict(id='the-forecasts-own-weekday', file=FCS,
         old="      if (w && Number(w[1]) === weekday && steady(p)) out.push(",
         new="      if (w && steady(p)) out.push(",
         tests=[DT], pattern='finds none where the way can tell weekdays apart'),
    dict(id='the-weekday-from-the-date', file=FCS,
         old="    const weekday = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()",
         new="    const weekday = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() % 6",
         tests=[DT], pattern='reads the forecast’s weekday from its own date'),
    dict(id='a-steady-weekday-cell', file=FCS,
         old="      if (w && Number(w[1]) === weekday && steady(p)) out.push(",
         new="      if (w && Number(w[1]) === weekday) out.push(",
         tests=[DT], pattern='finds none where the way can tell weekdays apart'),
    dict(id='a-cell-of-the-level-alone', file=FCS,
         old="const LEVEL_WEEKDAY = /^pattern\\.level\\.(?:low|high)\\.weekday\\.([0-6])$/",
         new="const LEVEL_WEEKDAY = /^pattern\\..+\\.weekday\\.([0-6])$/",
         tests=[DT], pattern='finds none where the way can tell weekdays apart'),
    dict(id='a-stored-forecast-names-its-way', file=L,
         old="horizon: Number(b.horizon), scale: 100, model: str(b.model),",
         new="horizon: Number(b.horizon), scale: 100,",
         tests=[WK], pattern='how far it was moved and for what'),
    dict(id='moved-the-other-way', file=FCS,
         old="      if (c && steady(c) && c.values.direction === other) out.push(",
         new="      if (c && steady(c) && c.values.direction !== 'none') out.push(",
         tests=[DT], pattern='finds none the same way'),
    dict(id='a-steady-comparison', file=FCS,
         old="      if (c && steady(c) && c.values.direction === other) out.push(",
         new="      if (c && c.values.direction === other) out.push(",
         tests=[DT], pattern='finds none the same way'),
    dict(id='the-comparison-of-a-condition-that-moved-it', file=FCS,
         old="      const c = id ? cited.find((x) => x.id === id) : undefined",
         new="      const c = cited.find((x) => x.id.startsWith('assoc.') || x.id.startsWith('private.'))",
         tests=[DT], pattern='finds none the same way'),
    dict(id='a-private-items-own-comparison', file=FCS,
         old="  if (/^private\\.\\d+$/.test(condition)) return condition\n  return null\n}",
         new="  return null\n}",
         tests=[DT], pattern='maps each condition to its own comparison'),
    dict(id='the-things-of-last-night-as-the-sheet-names-them', file=FCS,
         old="  nature: 'assoc.nature.morning',\n",
         new="  nature: 'assoc.nature',\n",
         tests=[DT], pattern='maps each condition to its own comparison'),
    dict(id='a-moved-fact-says-its-direction', file=L,
         old="{ points, dir: b.adj < 0 ? 'lower' : 'higher', by: by.join('|'),",
         new="{ points, dir: 'lower', by: by.join('|'),",
         tests=[WK], pattern='how far it was moved and for what'),
    dict(id='the-words-that-say-they-differ', file=FCS,
         old="export const DIFFER_WORDS = /\\b(?:differ(?:s|ed)?|disagree(?:s|d)?|(?:does|do|did) not match|(?:doesn|don|didn)[’']t match)\\b/i",
         new="export const DIFFER_WORDS = /\\b(?:differ(?:s|ed)?|(?:does|do|did) not match|(?:doesn|don|didn)[’']t match)\\b/i",
         tests=[DT], pattern='takes each of the words the rule names'),
    dict(id='different-is-not-one-of-them', file=FCS,
         old="export const DIFFER_WORDS = /\\b(?:differ(?:s|ed)?|disagree(?:s|d)?|(?:does|do|did) not match|(?:doesn|don|didn)[’']t match)\\b/i",
         new="export const DIFFER_WORDS = /\\b(?:differ(?:s|ed|ent)?|disagree(?:s|d)?|(?:does|do|did) not match|(?:doesn|don|didn)[’']t match)\\b/i",
         tests=[DT], pattern='takes each of the words the rule names'),
    dict(id='the-checker-asks-where-they-differ', file=BS,
         old="  if (differ.length && !DIFFER_WORDS.test(text)) out.push(",
         new="  if (false) out.push(",
         tests=[DT], pattern='takes each of the words the rule names'),
    dict(id='the-checker-reads-the-cited-facts', file=BS,
         old="  const differ = sheet ? forecastDifferences(sheet.facts.filter((f) => factIds.includes(f.id))) : []",
         new="  const differ = sheet ? forecastDifferences(sheet.facts) : []",
         tests=[DT], pattern='asks nothing where they do not differ'),
    dict(id='the-validator-hands-the-check-its-facts', file=BS,
         old="  if (factIds.some(isStoredForecastFact)) out.push(...forecastRefusals(text, factIds, all, sheet))\n",
         new="  if (factIds.some(isStoredForecastFact)) out.push(...forecastRefusals(text, factIds, all))\n",
         tests=[DT], pattern='is held by the validator on a whole answer'),
    dict(id='the-rule-names-the-words', file=P,
         old="Where the two differ, say so in one of these words: \"differ\", \"disagree\" or \"does not match\".",
         new="Where the two differ, say so.",
         tests=[WK], pattern='tells both tiers of Ask'),
]


def run(tests, pattern):
    assert tests, 'an empty test list would run everything'
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
            code2, failed2, passed2, out2 = run(t['tests'], t.get('pattern'))
        finally:
            put_back(path, original)
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
