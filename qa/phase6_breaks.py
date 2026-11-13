"""Phase 6 of the next build (2026-11-13), monthly write-ups. Each rule undone once, and the test that guards it
must turn red. This runner grows with the phase; its first entries are the month's lines.

A month's days: three days served either side; named only by a month's first day; a month that does not exist is no
month; its last day is the month's own.

The written list: each kind of record covered, and each left out with why.

A month's lines: each day's lines as the exact-day lookup words them, from that day's rows alone; the days beside the
month are served and named as outside it; each store is read once, whole, and counted against the database's own
count; a store past an ordinary read is read whole; the workouts' read is whole; a month is read once its days after
have passed; a month past sixteen parts is not read.

The parts: whole days, closed before the day that would pass the size; a day with nothing recorded is skipped; the
days outside the month are named.

The fingerprint: the month's own lines alone, their words as well as their ids.

A write-up's row: read from its words; faith's tag only where the row sets it; a month that exists, a reading from
one, a readable moment, a day, a method, a model; an id that is its month and its reading; counts that are counts;
parts from one; a fingerprint of its shape; both parts lists; an unreadable observation unreads the row; an
observation has words, days that are days, and kinds; a followed pattern reads whole, its counts within their totals;
what was recorded is never followed; a mark names its part; the limits.

The check on a month's answer: the Worker lists the days and the kinds from the lines cited, and carries faith's tag;
two parts, events a list, one thing said at least; ten recorded, eight noticed, sixty events; an observation has
words, cites a line the read served, one inside the month, fifty words and forty lines at most; the number rule, with
the count of the days and of the lines cited; no cause, by the shared words and the month's own; the surface rules;
only what Claude noticed is followed, naming all three; four thousand bytes in all; an event's type is in the list,
named as today; its line is a note's, inside the month; its quote is exact, from the note itself, with words, three
hundred characters at most; one event a note and type; every reason at once.

What is shown of a write-up: a deleted day and a switch hide at once; hidden faith, by its kind and by a line's tag; a
private name, as a whole word; one marked wrong stays in view; an observation keeps its place; the followed cell is
carried; a write-up with nothing left is not listed; the forget moment, at the moment too, from the forget record
alone, and an unreadable one forgets nothing; the newest month first; the newest reading shown, the earlier ones
beside it; a followed pattern marked wrong counts for nothing; the newest reading alone is followed, from the day it
was written.

What the month's read is told: every part read, and how many; the days beside never alone; an uncited observation
refused; the number rule; the caps; the exact quote; the days listed for it; a hypothesis, never a fact; no cause;
followed from the next day; each type's definition; nothing tagged with no type; what was marked wrong; what the read
covers, and why each thing is left out; the surface rules; the shape shows follow.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, an empty test list refused, and an id that matches no entry refused.

python phase6_breaks.py [id ...]
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
M = 'worker/src/month.ts'
MT = 'worker/src/month.test.ts'
L = 'worker/src/lookups.ts'
SH = 'src/writeups/shared.ts'
ST = 'src/writeups/shared.test.ts'
MC = 'worker/src/monthCheck.ts'
MCT = 'worker/src/monthCheck.test.ts'
J = 'src/writeups/join.ts'
JT = 'src/writeups/join.test.ts'
MP = 'worker/src/monthPrompt.ts'
MPT = 'worker/src/monthPrompt.test.ts'

TABLE = [
    # A month's days.
    dict(id='three-days-either-side', file=M,
         old="export const MONTH_MARGIN = 3",
         new="export const MONTH_MARGIN = 2",
         tests=[MT], pattern='with three days served either side'),
    dict(id='a-months-first-day-alone', file=M,
         old="  if (!MONTH_RE.test(first)) return null\n",
         new="  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(first)) return null\n",
         tests=[MT], pattern='named only by a month’s first day'),
    dict(id='a-month-that-does-not-exist', file=M,
         old="  if (m < 1 || m > 12) return null\n",
         new="",
         tests=[MT], pattern='named only by a month’s first day'),
    dict(id='the-months-own-last-day', file=M,
         old="new Date(Date.UTC(y, m, 0))",
         new="new Date(Date.UTC(y, m, -1))",
         tests=[MT], pattern='with three days served either side'),

    # The written list.
    dict(id='the-list-names-what-is-left-out', file=M,
         old="  { what: 'the journal', why: 'it is never evidence' },\n",
         new="",
         tests=[MT], pattern='names each kind of record covered'),
    dict(id='the-list-names-what-is-covered', file=M,
         old="  'finished workouts',\n",
         new="",
         tests=[MT], pattern='names each kind of record covered'),

    # A month's lines.
    dict(id='lines-as-the-exact-day-words-them', file=M,
         old="    days.push({ day: d, inside, facts: dayFacts(x, d, rows) })\n",
         new="    days.push({ day: d, inside, facts: dayFacts(x, d, rows).reverse() })\n",
         tests=[MT], pattern='exactly as the exact-day lookup words them'),
    dict(id='a-days-lines-from-its-own-rows', file=L,
         old="  const of = (list: readonly RecordRow[]): RecordRow[] => list.filter((r) => r.day === D)\n",
         new="  const of = (list: readonly RecordRow[]): RecordRow[] => [...list]\n",
         tests=[MT], pattern='exactly as the exact-day lookup words them'),
    dict(id='the-days-beside-are-outside', file=M,
         old="    const inside = d >= span.from && d <= span.to\n",
         new="    const inside = d >= span.from\n",
         tests=[MT], pattern='cover every day of the month and three days either side'),
    dict(id='the-days-beside-are-read', file=M,
         old="  const range = { from: span.servedFrom, to: span.servedTo }\n",
         new="  const range = { from: span.from, to: span.to }\n",
         tests=[MT], pattern='cover every day of the month and three days either side'),
    dict(id='a-read-short-of-the-count-builds-nothing', file=M,
         old="    if (read !== held) return",
         new="    if (read > held) return",
         tests=[MT], pattern='read fell short of the database’s own count'),
    dict(id='the-counts-are-kept', file=M,
         old="    counts[store] = read\n",
         new="",
         tests=[MT], pattern='say how many rows of each store'),
    dict(id='a-large-store-is-read-whole', file=L,
         old="    recordsOf(read, 'notes', range, limit),\n",
         new="    recordsOf(read, 'notes', range),\n",
         tests=[MT], pattern='holds more rows than an ordinary read gives'),
    dict(id='the-workouts-read-is-whole', file=M,
         old="  if (rows.outside.length >= OUTSIDE_READ) return",
         new="  if (rows.outside.length > OUTSIDE_READ) return",
         tests=[MT], pattern='finished workouts outran their one read'),
    dict(id='the-days-after-have-passed', file=M,
         old="  if (span.servedTo > x.day) return",
         new="  if (span.to > x.day) return",
         tests=[MT], pattern='whose days after it have not all passed'),
    dict(id='sixteen-parts-at-most', file=M,
         old="  if (parts.length > MONTH_PARTS_MOST) return",
         new="  if (parts.length > MONTH_PARTS_MOST * 100) return",
         tests=[MT], pattern='needs more parts than a read may have'),
    dict(id='the-number-sixteen', file=M,
         old="export const MONTH_PARTS_MOST = 16",
         new="export const MONTH_PARTS_MOST = 17",
         tests=[MT], pattern='needs more parts than a read may have'),
    dict(id='four-thousand-rows-a-read', file=M,
         old="export const MONTH_READ = 4000",
         new="export const MONTH_READ = 500",
         tests=[MT], pattern='four thousand rows at most'),

    # The parts.
    dict(id='a-part-is-32-kb', file=M,
         old="export const MONTH_PART_BYTES = 32 * 1024",
         new="export const MONTH_PART_BYTES = 64 * 1024",
         tests=[MT], pattern='hold whole days, closed before the day'),
    dict(id='a-part-closes-before-the-size', file=M,
         old="    if (!open || (open.bytes + bytes > most && open.lines > 0)) {\n",
         new="    if (!open) {\n",
         tests=[MT], pattern='hold whole days, closed before the day'),
    dict(id='an-empty-day-is-skipped', file=M,
         old="    if (!d.facts.length) continue\n",
         new="",
         tests=[MT], pattern='skip a day with nothing recorded'),
    dict(id='the-outside-days-are-named', file=M,
         old="    if (!d.inside) open.outside.push(d.day)\n",
         new="",
         tests=[MT], pattern='name those of their days that are outside the month'),

    # The fingerprint.
    dict(id='the-fingerprint-is-the-months-own', file=M,
         old="  const own = days.filter((d) => d.inside).flatMap((d) => d.facts)\n",
         new="  const own = days.flatMap((d) => d.facts)\n",
         tests=[MT], pattern='does not change when a day beside the month changes'),
    dict(id='the-fingerprint-reads-the-words', file=M,
         old="facts.map((f) => `${f.id}\\t${f.text}`)",
         new="facts.map((f) => f.id)",
         tests=[MT], pattern='changes when a note in the month changes'),

    # The record a note's line came from.
    dict(id='a-notes-line-keeps-its-record', file=M,
         old="      if (source) notes[f.id] = source\n",
         new="",
         tests=[MT], pattern='is kept for each note in the month’s lines'),
    dict(id='a-kept-notes-line-keeps-its-record', file=M,
         old="    return row ? { store: 'notes', id: row.id, day } : null\n",
         new="    return null\n",
         tests=[MT], pattern='is kept for each note in the month’s lines'),
    dict(id='a-notes-record-is-its-check-ins', file=M,
         old="rec(r.body).block === at[1] && ",
         new="",
         tests=[MT], pattern='tells two check-ins of one day apart'),
    dict(id='a-notes-record-is-its-days', file=M,
         old="rows.checkins.find((r) => r.day === day && ",
         new="rows.checkins.find((r) => ",
         tests=[MT], pattern='is not kept for a note of another day'),

    # A write-up's row.
    dict(id='a-row-is-read-from-its-words', file=SH,
         old="      b = JSON.parse(body)\n",
         new="      b = null\n",
         tests=[ST], pattern='is read whole, from the row’s words or from the object'),
    dict(id='faith-only-where-the-row-sets-it', file=SH,
         old="...(o.faith === true ? { faith: true as const } : {})",
         new="...(o.faith ? { faith: true as const } : {})",
         tests=[ST], pattern='carries faith’s tag on an observation only where the row sets it'),
    dict(id='a-month-that-exists', file=SH,
         old="const MONTH = /^\\d{4}-(0[1-9]|1[0-2])$/",
         new="const MONTH = /^\\d{4}-\\d{2}$/",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='a-reading-from-one', file=SH,
         old="  if (!month || !reading || !at",
         new="  if (!month || reading === null || !at",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='when-it-was-written-is-readable', file=SH,
         old=" || Number.isNaN(Date.parse(at)) || !day",
         new=" || !day",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='the-day-is-a-day', file=SH,
         old="typeof o.day === 'string' && DAY.test(o.day)",
         new="typeof o.day === 'string'",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='a-method-is-named', file=SH,
         old=" || !method || !model",
         new=" || !model",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='a-model-is-named', file=SH,
         old=" || !model || !from",
         new=" || !from",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='the-id-is-the-month-and-the-reading', file=SH,
         old="  if (id !== writeUpIdOf(month, reading)) return null\n",
         new="",
         tests=[ST], pattern='is not read under an id that is not its month and its reading'),
    dict(id='the-counts-are-counts', file=SH,
         old="  if (!Object.values(counts).every((n) => count(n) !== null)) return null\n",
         new="",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='the-parts-are-counted-from-one', file=SH,
         old="  if (!parts || lines === null || !fingerprint) return null\n",
         new="  if (lines === null || !fingerprint) return null\n",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='the-fingerprint-has-its-shape', file=SH,
         old="/^[0-9a-f]{64}$/.test(from.fingerprint)",
         new="from.fingerprint.length > 0",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='both-parts-are-lists', file=SH,
         old="  if (!Array.isArray(o.recorded) || !Array.isArray(o.noticed)) return null\n",
         new="  if (!Array.isArray(o.recorded)) return null\n",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='an-unreadable-observation-unreads-the-row', file=SH,
         old="  if (recorded.some((x) => x === null) || noticed.some((x) => x === null)) return null\n",
         new="",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='an-observation-has-words', file=SH,
         old="  if (!text || !days || !kinds) return null\n",
         new="  if (!days || !kinds) return null\n",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='an-observation-has-days', file=SH,
         old="Array.isArray(o.days) && o.days.length > 0 && ",
         new="Array.isArray(o.days) && ",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='an-observations-day-is-a-day', file=SH,
         old="typeof d === 'string' && DAY.test(d)",
         new="typeof d === 'string'",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='an-observation-has-kinds', file=SH,
         old="Array.isArray(o.kinds) && o.kinds.length > 0 && ",
         new="Array.isArray(o.kinds) && ",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='a-followed-pattern-reads-whole', file=SH,
         old="  if (followed === null) return null\n",
         new="",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='a-followed-count-is-within-its-total', file=SH,
         old=" || k > n || restK > m) return null",
         new=") return null",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='what-was-recorded-is-never-followed', file=SH,
         old="  if (recorded.some((x) => x?.followed)) return null\n",
         new="",
         tests=[ST], pattern='nothing half-read is shown'),
    dict(id='a-mark-names-the-part', file=SH,
         old="`obs:${writeUpId}:${part}:${place}`",
         new="`obs:${writeUpId}:${place}`",
         tests=[ST], pattern='name a month’s reading, and an observation'),
    dict(id='eight-noticed-at-most', file=SH,
         old="export const NOTICED_MOST = 8",
         new="export const NOTICED_MOST = 10",
         tests=[ST], pattern='are ten observations recorded and eight noticed'),

    # The check on a month's answer.
    dict(id='the-worker-lists-the-days', file=MC,
         old="[dayOfLine(f.id) as string] : [])))].sort()\n",
         new="[dayOfLine(f.id) as string] : [])))]\n",
         tests=[MCT], pattern='the Worker lists each observation’s days and kinds'),
    dict(id='the-kinds-are-the-lines-own', file=MC,
         old="String(f.values.category ?? '')",
         new="'dayRecord'",
         tests=[MCT], pattern='takes days and kinds from the lines, never from the answer'),
    dict(id='faiths-tag-is-carried', file=MC,
         old="...(cited.some((f) => f.tags.includes('faith')) ? { faith: true as const } : {}), ",
         new="",
         tests=[MCT], pattern='carries faith’s tag where a cited line carries it'),
    dict(id='the-answer-has-two-parts', file=MC,
         old="  if (!Array.isArray(o.recorded) || !Array.isArray(o.noticed)) return",
         new="  if (!Array.isArray(o.recorded) && !Array.isArray(o.noticed)) return",
         tests=[MCT], pattern='no object, a part missing, events that are no list'),
    dict(id='the-events-are-a-list', file=MC,
         old="  if (!Array.isArray(events)) return { ok: false, reason: '\"events\" is a list, or left out' }\n",
         new="",
         tests=[MCT], pattern='no object, a part missing, events that are no list'),
    dict(id='a-write-up-says-one-thing-at-least', file=MC,
         old="  if (o.recorded.length + o.noticed.length === 0) reasons.push",
         new="  if (false) reasons.push",
         tests=[MCT], pattern='no object, a part missing, events that are no list'),
    dict(id='ten-recorded-at-most', file=MC,
         old="  if (o.recorded.length > RECORDED_MOST) reasons.push",
         new="  if (o.recorded.length > RECORDED_MOST + 1) reasons.push",
         tests=[MCT], pattern='past ten observations recorded, eight noticed, or sixty events'),
    dict(id='eight-noticed-in-an-answer', file=MC,
         old="  if (o.noticed.length > NOTICED_MOST) reasons.push",
         new="  if (o.noticed.length > NOTICED_MOST + 1) reasons.push",
         tests=[MCT], pattern='past ten observations recorded, eight noticed, or sixty events'),
    dict(id='sixty-events-at-most', file=MC,
         old="export const EVENTS_MOST = 60",
         new="export const EVENTS_MOST = 61",
         tests=[MCT], pattern='past ten observations recorded, eight noticed, or sixty events'),
    dict(id='an-observation-in-an-answer-has-words', file=MC,
         old="  if (!text) why.push('has no words')\n",
         new="",
         tests=[MCT], pattern='is refused with no words, and with no line cited'),
    dict(id='an-observation-cites-a-line', file=MC,
         old="  if (!ids.length) why.push(",
         new="  if (false) why.push(",
         tests=[MCT], pattern='is refused with no words, and with no line cited'),
    dict(id='only-lines-the-read-served', file=MC,
         old="  if (unknown.length) why.push(",
         new="  if (false) why.push(",
         tests=[MCT], pattern='cites a line the month’s read did not serve'),
    dict(id='one-line-inside-the-month', file=MC,
         old="  if (cited.length && !days.some((d) => d >= x.span.from && d <= x.span.to)) why.push(",
         new="  if (false) why.push(",
         tests=[MCT], pattern='rests only on days beside the month'),
    dict(id='fifty-words-an-observation', file=MC,
         old="    if (n > OBSERVATION_WORDS) why.push(",
         new="    if (n > OBSERVATION_WORDS + 1) why.push(",
         tests=[MCT], pattern='is refused past fifty words, and past forty lines'),
    dict(id='forty-lines-an-observation', file=MC,
         old="export const OBSERVATION_LINES = 40",
         new="export const OBSERVATION_LINES = 41",
         tests=[MCT], pattern='is refused past fifty words, and past forty lines'),
    dict(id='the-number-rule-is-kept', file=MC,
         old="    why.push(...numbersRefusals(text, sheet, [...cited.map((f) => f.id), counted.id]))\n",
         new="",
         tests=[MCT], pattern='pass when a cited line says them'),
    dict(id='the-count-of-days-and-lines-may-be-said', file=MC,
         old="values: { days: days.length, lines: cited.length } }",
         new="values: {} }",
         tests=[MCT], pattern='may be the count of the days cited'),
    dict(id='the-shared-cause-words-are-refused', file=MC,
         old="CAUSAL_WORDS.exec(text) ?? MONTH_CAUSE.exec(text)",
         new="MONTH_CAUSE.exec(text)",
         tests=[MCT], pattern='is never claimed: a month’s read holds no test'),
    dict(id='the-months-cause-words-are-refused', file=MC,
         old="CAUSAL_WORDS.exec(text) ?? MONTH_CAUSE.exec(text)",
         new="CAUSAL_WORDS.exec(text)",
         tests=[MCT], pattern='is never claimed: a month’s read holds no test'),
    dict(id='the-surface-rules-hold', file=MC,
         old="    if (surface) why.push(surface)\n",
         new="",
         tests=[MCT], pattern='hold in a write-up as on every surface'),
    dict(id='only-what-claude-noticed-is-followed', file=MC,
         old="    if (part === 'recorded') why.push('asks to be followed: only what Claude noticed is followed')\n    else if (!f",
         new="    if (!f",
         tests=[MCT], pattern='is refused on what was recorded, and when it does not name all three'),
    dict(id='a-pattern-names-all-three', file=MC,
         old="typeof f.cell !== 'string' || ",
         new="",
         tests=[MCT], pattern='is refused on what was recorded, and when it does not name all three'),
    dict(id='four-thousand-bytes-in-all', file=MC,
         old="  if (bytes > WRITEUP_BYTES) reasons.push(",
         new="  if (false) reasons.push(",
         tests=[MCT], pattern='is four thousand bytes of words at most'),
    dict(id='an-events-type-is-in-the-list', file=MC,
         old="  if (!type) why.push('names a type the list of event types does not hold')\n",
         new="",
         tests=[MCT], pattern='is refused under a type the list does not hold'),
    dict(id='an-events-type-as-named-today', file=MC,
         old="  return { type: type.id, factId: line.id, day, quote }\n",
         new="  return { type: String(o?.type), factId: line.id, day, quote }\n",
         tests=[MCT], pattern='is kept under its type’s name today'),
    dict(id='an-events-line-is-a-notes', file=MC,
         old="  if (!line || note === null) why.push(",
         new="  if (!line) why.push(",
         tests=[MCT], pattern='is refused when its line is not a note’s'),
    dict(id='an-events-note-is-inside-the-month', file=MC,
         old="  else if (!day || day < x.span.from || day > x.span.to) why.push(",
         new="  else if (!day) why.push(",
         tests=[MCT], pattern='is refused when its line is not a note’s'),
    dict(id='the-quote-is-exact', file=MC,
         old="  else if (note !== null && !note.includes(quote)) why.push(",
         new="  else if (note !== null && !note.toLowerCase().includes(quote.toLowerCase())) why.push(",
         tests=[MCT], pattern='is refused unless the note holds the quoted words exactly'),
    dict(id='the-quote-is-from-the-note-itself', file=MC,
         old="const NOTE_LINE = /(?:you wrote|you kept a note): “([\\s\\S]*)”$/",
         new="const NOTE_LINE = /([\\s\\S]*)/",
         tests=[MCT], pattern='is refused unless the note holds the quoted words exactly'),
    dict(id='a-quote-has-words', file=MC,
         old="  if (!quote.trim()) why.push('quotes no words')\n  else if (quote.length",
         new="  if (quote.length",
         tests=[MCT], pattern='is refused unless the note holds the quoted words exactly'),
    dict(id='three-hundred-characters-a-quote', file=MC,
         old="export const QUOTE_MOST = 300",
         new="export const QUOTE_MOST = 301",
         tests=[MCT], pattern='is refused unless the note holds the quoted words exactly'),
    dict(id='only-a-notes-line-gives-a-notes-words', file=MC,
         old="(f.values.category === 'notes' ? (NOTE_LINE.exec(f.text)?.[1] ?? null) : null)",
         new="(NOTE_LINE.exec(f.text)?.[1] ?? null)",
         tests=[MCT], pattern='gives its day from its id, and a note’s own words'),
    dict(id='one-event-a-note-and-type', file=MC,
         old="(seen.has(`${e.factId}|${e.type}`) ? false : (seen.add(`${e.factId}|${e.type}`), true))",
         new="true",
         tests=[MCT], pattern='tagged twice on one note with one type is one event'),
    dict(id='every-reason-at-once', file=MC,
         old="reason: reasons.join('; and ') }",
         new="reason: reasons[0] }",
         tests=[MCT], pattern='is given at once, each with where it stands'),

    # What of a write-up is shown, and what counts.
    dict(id='a-deleted-day-hides-at-once', file=J,
         old="  if (!o.days.every((d) => x.days.has(d))) return false\n",
         new="",
         tests=[JT], pattern='a day it cites holds no record any more'),
    dict(id='a-switch-hides-at-once', file=J,
         old="  if (!o.kinds.every((k) => x.kindOn(k))) return false\n",
         new="",
         tests=[JT], pattern='a kind of record it drew on is switched off'),
    dict(id='hidden-faith-by-its-kind', file=J,
         old="(o.faith === true || o.kinds.includes('faith'))",
         new="(o.faith === true)",
         tests=[JT], pattern='leaves out what drew on faith while faith is hidden'),
    dict(id='hidden-faith-by-a-lines-tag', file=J,
         old="(o.faith === true || o.kinds.includes('faith'))",
         new="(o.kinds.includes('faith'))",
         tests=[JT], pattern='leaves out what drew on faith while faith is hidden'),
    dict(id='a-private-name-hides', file=J,
         old="  return !x.hiddenNames.some((n) => holdsName(o.text, n))\n",
         new="  return true\n",
         tests=[JT], pattern='names a private item while names may not be shown'),
    dict(id='a-name-is-a-whole-word', file=J,
         old=", 'iu').test(text)",
         new=", 'iu').test(text) || text.toLowerCase().includes(name.trim().toLowerCase())",
         tests=[JT], pattern='names a private item while names may not be shown'),
    dict(id='one-marked-wrong-stays-in-view', file=J,
         old="wrong: wrong.has(markId), markId }]",
         new="wrong: false, markId }]",
         tests=[JT], pattern='keeps one marked wrong in view with its mark'),
    dict(id='an-observation-keeps-its-place', file=J,
         old="      const markId = obsMarkIdOf(w.id, name, i + 1)\n",
         new="      const markId = obsMarkIdOf(w.id, name, 1)\n",
         tests=[JT], pattern='a day it cites holds no record any more'),
    dict(id='the-followed-cell-is-carried', file=J,
         old="...(o.followed ? { followed: o.followed } : {}), ",
         new="",
         tests=[JT], pattern='is every observation, in its part and its place'),
    dict(id='nothing-left-is-not-listed', file=J,
         old="    if (s.recorded.length + s.noticed.length === 0) continue\n",
         new="",
         tests=[JT], pattern='does not list a write-up with nothing left to show'),
    dict(id='the-forget-moment-hides', file=J,
         old="    if (forgot !== null && Date.parse(w.at) <= Date.parse(forgot)) continue\n",
         new="",
         tests=[JT], pattern='hides every write-up written up to it'),
    dict(id='written-at-the-moment-is-forgotten', file=J,
         old="Date.parse(w.at) <= Date.parse(forgot)",
         new="Date.parse(w.at) < Date.parse(forgot)",
         tests=[JT], pattern='hides every write-up written up to it'),
    dict(id='the-forget-record-alone', file=J,
         old="x.id === FORGET_ID && x.kind === 'forget'",
         new="x.id === FORGET_ID",
         tests=[JT], pattern='is read from the forget record alone'),
    dict(id='an-unreadable-moment-forgets-nothing', file=J,
         old="  return m && !Number.isNaN(Date.parse(m.at)) ? m.at : null\n",
         new="  return m ? m.at : null\n",
         tests=[JT], pattern='is read from the forget record alone'),
    dict(id='the-newest-month-first', file=J,
         old=".sort((a, b) => (a[0] < b[0] ? 1 : -1))",
         new=".sort((a, b) => (a[0] < b[0] ? -1 : 1))",
         tests=[JT], pattern='are listed the newest first'),
    dict(id='the-newest-reading-is-shown', file=J,
         old="sort((a, b) => b.reading - a.reading)",
         new="sort((a, b) => a.reading - b.reading)",
         tests=[JT], pattern='show a month’s newest reading'),
    dict(id='the-earlier-readings-stay-beside', file=J,
         old="earlier: readings.slice(1) }",
         new="earlier: [] }",
         tests=[JT], pattern='show a month’s newest reading'),
    dict(id='a-followed-pattern-marked-wrong-counts-for-nothing', file=J,
         old="(o.followed && !o.wrong ? [",
         new="(o.followed ? [",
         tests=[JT], pattern='leave out one marked wrong, at once'),
    dict(id='the-newest-reading-alone-is-followed', file=J,
         old="months.flatMap((m) => m.newest.noticed.flatMap(",
         new="months.flatMap((m) => [m.newest, ...m.earlier].flatMap((w) => w.noticed).flatMap(",
         tests=[JT], pattern='are not taken from an earlier reading'),
    dict(id='noticed-on-the-day-it-was-written', file=J,
         old="noticedOn: m.newest.day",
         new="noticedOn: m.month",
         tests=[JT], pattern='each with the day it was noticed'),

    # What the month's read is told.
    dict(id='told-every-part-is-read', file=MP,
         old=" A write-up is kept only when every part was read; saying you read them is not enough.",
         new="",
         tests=[MPT], pattern='name the month and say every part is read'),
    dict(id='told-how-many-parts', file=MP,
         old="to lookup=month&part=${x.parts}.",
         new="onward.",
         tests=[MPT], pattern='name the month and say every part is read'),
    dict(id='told-the-days-beside-never-alone', file=MP,
         old="may be cited beside a line inside the month, never alone.",
         new="may be cited freely.",
         tests=[MPT], pattern='say the rules the answer is checked by'),
    dict(id='told-an-uncited-observation-is-refused', file=MP,
         old=" An observation that cites no served line is refused.",
         new="",
         tests=[MPT], pattern='say the rules the answer is checked by'),
    dict(id='told-the-number-rule', file=MP,
         old=" Any other number is refused.",
         new="",
         tests=[MPT], pattern='say the rules the answer is checked by'),
    dict(id='told-the-caps', file=MP,
         old="each at most ${OBSERVATION_WORDS} words.",
         new="each short.",
         tests=[MPT], pattern='say the rules the answer is checked by'),
    dict(id='told-the-quote-is-exact', file=MP,
         old="letter for letter, at most ${QUOTE_MOST} characters.",
         new="roughly.",
         tests=[MPT], pattern='say the rules the answer is checked by'),
    dict(id='told-the-days-are-listed-for-it', file=MP,
         old="the days are listed for the person from the lines you cite.",
         new="the days are yours to list.",
         tests=[MPT], pattern='say the rules the answer is checked by'),
    dict(id='told-a-hypothesis-never-a-fact', file=MP,
         old=" Each of those is a hypothesis, never a fact.",
         new="",
         tests=[MPT], pattern='is a hypothesis and that no cause is claimed'),
    dict(id='told-no-cause', file=MP,
         old="Say what went with what (",
         new="Say (",
         tests=[MPT], pattern='is a hypothesis and that no cause is claimed'),
    dict(id='told-followed-from-the-next-day', file=MP,
         old="It is then counted from the next day on, on what comes after alone.",
         new="It is then counted.",
         tests=[MPT], pattern='say how a pattern is followed'),
    dict(id='told-each-types-definition', file=MP,
         old="`- ${t.id}: ${t.label}. ${t.definition}`",
         new="`- ${t.id}: ${t.label}.`",
         tests=[MPT], pattern='list each event type by its id, its label and its definition'),
    dict(id='told-to-tag-nothing-with-no-type', file=MP,
         old='EVENT TYPES: none is listed yet. Write "events": [].',
         new='EVENT TYPES: none.',
         tests=[MPT], pattern='say to tag nothing while no type is listed'),
    dict(id='told-what-was-marked-wrong', file=MP,
         old="  const wrong = x.wrong.length ? [",
         new="  const wrong = false ? [",
         tests=[MPT], pattern='hand back the events the person marked wrong'),
    dict(id='told-what-the-read-covers', file=MP,
         old="    `WHAT THIS READ COVERS: ${MONTH_COVERED.join('; ')}.`,\n",
         new="",
         tests=[MPT], pattern='end with the written list'),
    dict(id='told-why-each-is-left-out', file=MP,
         old=" (${l.why})",
         new="",
         tests=[MPT], pattern='end with the written list'),
    dict(id='told-the-surface-rules', file=MP,
         old="never from what did not happen, never counting or rating anyone.",
         new="as you see fit.",
         tests=[MPT], pattern='hold the surface rules'),
    dict(id='the-shape-shows-follow', file=MP,
         old="follow: { kind: 'an id from lookup=kinds', split: 'a split from lookup=pattern', cell: 'a cell of that split' } }],",
         new="}],",
         tests=[MPT], pattern='shows the two lists and the events'),
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
