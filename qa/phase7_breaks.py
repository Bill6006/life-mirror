"""Phase 7 of the next build (2026-11-14), "Coach me on everything" covers everything. Each rule undone once, and the
test that guards it must turn red.

The write-ups, served to the deep tier: one fact an observation, the oldest month first; what was recorded told from
what Claude noticed, which says in its own words that it is a guess nobody tested; the days it came from, eight named
and the rest counted; every number its words say, the count of its days and its month's year in its values; one
month when a month is asked for, and a reply that says so when there is none; only ids and words are sent; ordinary
Ask is refused both lookups; a deep lookup's query is read strictly.

What of a write-up is served, the phone's own rule at the moment of serving: the forget moment and a mark of wrong
are read from the phone's marks; a day that no longer holds a record, by its own row or a check-in; a kind this run
may not read; faith, by the join and by the fact's own tag; a private name; one marked wrong left out; each fact
read under every kind it drew on, a missing or unknown kind closed; the Partner Path named where it was drawn on;
held to the rule again at the check.

What Claude noticed is never repeated as fact: said as a guess, in the words the rule names; "may" is not the month;
never the usual case on a guess's strength, every such word named; a counted comparison cited beside it answers for
those words; no rule without a guess cited; the rule runs in the checker; a write-up's facts are associations; a
guess is told from its count.

A followed guess with its count since: the table's own count for that guess; held to a pattern fact's rule; read
under its kind's category too; none while nothing is counted, the kind is gone, or no table can be read.

The month under way: from the month's first day to the task's day; each line as the exact-day lookup words it; whole
or nothing, by the database's own count, the workouts and sixteen parts; built once a run and kept with what was
served; a part in range; a line switched off since taken away; the facts kept with the run's lookups; a month with
nothing says so. A day's line that quotes a note holds the note's own numbers, from the quote alone.

No one-year limit for the deep tier: its lookups over a range, its search of the notes from the record's first day
that holds anything, and a category's read; ordinary Ask keeps a year.

The budget: counted beside the run's other reads, never against them; each read and its size counted, the parts
served recorded; logged as the deep tier's, by count; the most grows with the months that have a write-up, with
four spare; it stops.

Which months it lacks: worked out at the first briefing, kept with what was served, said in the briefing; a month
with a write-up is not lacking, nor one that holds nothing, nor the month under way or any after it; a guess's count
alone makes no month; an answer that cites a write-up names each lacking month, by its name with its capital; one
that cites none is not bound; every reason at once; its own lookups named beside the nine, for the deep tier alone.

A failed read: counted by what it asked for; once more, then go on; a read that throws costs the deep tier nothing;
ordinary Ask fails as before.

What it is told: its four rules, each word for word, and ordinary Ask none; about 250 words, held to 450. The two
reads have names on the phone. The write-ups' head is no head a sheet carries.
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
DR = 'worker/src/deepRead.ts'
A = 'worker/src/ask.ts'
L = 'worker/src/lookups.ts'
R = 'worker/src/retrieval.ts'
M = 'worker/src/month.ts'
BS = 'src/brainShared.ts'
P = 'worker/src/prompt.ts'
C = 'src/copy.ts'
TU = 'worker/src/turso.ts'
AS = 'src/ask/shared.ts'
DT = 'worker/src/deepRead.test.ts'
AO = 'worker/src/askOrdinary.test.ts'
FC = 'worker/src/freeChain.test.ts'

FIRST = 'serves each observation as a fact'

TABLE = [
    # The write-ups, served to the deep tier.
    dict(id='the-oldest-month-first', file=DR,
         old="sort((a, b) => (a.month < b.month ? -1 : 1))) {",
         new="sort((a, b) => (a.month < b.month ? 1 : -1))) {",
         tests=[DT], pattern=FIRST),
    dict(id='recorded-is-told-from-noticed', file=DR,
         old="o.part === 'recorded' ? 'you recorded' : NOTICED_WORDS",
         new="'you recorded'",
         tests=[DT], pattern=FIRST),
    dict(id='noticed-says-it-is-a-guess', file=DR,
         old="export const NOTICED_WORDS = 'Claude noticed (a guess made on reading the month; nobody tested it)'",
         new="export const NOTICED_WORDS = 'Claude noticed'",
         tests=[DT], pattern=FIRST),
    dict(id='the-days-it-came-from-are-said', file=DR,
         old=" It came from ${o.days.length === 1 ? 'the day' : 'the days'} ${d.words}.`,",
         new="`,",
         tests=[DT], pattern=FIRST),
    dict(id='one-day-is-the-day', file=DR,
         old="${o.days.length === 1 ? 'the day' : 'the days'}",
         new="the days",
         tests=[DT], pattern=FIRST),
    dict(id='eight-days-are-named', file=DR,
         old="export const DAYS_NAMED = 8",
         new="export const DAYS_NAMED = 7",
         tests=[DT], pattern='names the days it came from up to eight'),
    dict(id='the-rest-of-the-days-are-counted', file=DR,
         old="${more ? `, and ${more} more ${more === 1 ? 'day' : 'days'}` : ''}",
         new="",
         tests=[DT], pattern='names the days it came from up to eight'),
    dict(id='how-many-more-is-in-its-values', file=DR,
         old="...(d.more ? { more: d.more } : {}), ",
         new="",
         tests=[DT], pattern='names the days it came from up to eight'),
    dict(id='the-numbers-its-words-say', file=DR,
         old="values: { ...saidIn(o.text), days: o.days.length,",
         new="values: { days: o.days.length,",
         tests=[DT], pattern=FIRST),
    dict(id='the-count-of-its-days', file=DR,
         old="...saidIn(o.text), days: o.days.length, ",
         new="...saidIn(o.text), ",
         tests=[DT], pattern=FIRST),
    dict(id='the-year-of-its-month', file=DR,
         old="year: Number(month.slice(0, 4)), month, part: o.part,",
         new="month, part: o.part,",
         tests=[DT], pattern=FIRST),
    dict(id='a-month-asked-for-is-the-one-served', file=A,
         old="      facts = query.month ? all.filter((f) => f.values.month === query.month) : all\n",
         new="      facts = all\n",
         tests=[DT], pattern='serves one month when a month is asked for'),
    dict(id='no-write-up-says-so', file=A,
         old="...(facts.length ? {} : { note: query.month ?",
         new="...(true ? {} : { note: query.month ?",
         tests=[DT], pattern='serves one month when a month is asked for'),
    dict(id='only-ids-and-words-are-sent', file=A,
         old="  const sent = facts.map((f) => ({ id: f.id, text: f.text }))\n",
         new="  const sent = facts\n",
         tests=[DT], pattern=FIRST),
    dict(id='ordinary-ask-is-refused-the-deep-lookups', file=A,
         old="return deep ? handleDeepLookup(deps, t, url) : reply(403, { error: `the lookup ${name} is served to “Coach me on everything” alone` })",
         new="return handleDeepLookup(deps, t, url)",
         tests=[DT], pattern='refuses ordinary Ask both lookups'),
    dict(id='the-deep-lookups-are-two', file=R,
         old="export const DEEP_LOOKUPS = ['writeups', 'monthSoFar'] as const",
         new="export const DEEP_LOOKUPS = ['writeups'] as const",
         tests=[DT], pattern='refuses ordinary Ask both lookups'),
    dict(id='a-deep-query-is-never-a-category-too', file=DR,
         old="  if (url.searchParams.has('category')) return { ok: false, reason: 'ask for a category or a lookup, never both' }\n",
         new="",
         tests=[DT], pattern='reads a query for a deep lookup strictly'),
    dict(id='a-deep-lookups-own-parameter-alone', file=DR,
         old="k !== 'lookup' && k !== own) return",
         new="k !== 'lookup' && k !== 'month' && k !== 'part') return",
         tests=[DT], pattern='reads a query for a deep lookup strictly'),
    dict(id='a-month-is-a-month', file=DR,
         old="    if (month !== null && !MONTH_RE.test(month)) return { ok: false, reason: 'month must be a month, YYYY-MM' }\n",
         new="",
         tests=[DT], pattern='reads a query for a deep lookup strictly'),
    dict(id='a-part-is-from-one', file=DR,
         old="part < 1 || part > MONTH_PARTS_MOST) return",
         new="part < 0 || part > MONTH_PARTS_MOST) return",
         tests=[DT], pattern='reads a query for a deep lookup strictly'),
    dict(id='a-part-is-sixteen-at-most', file=DR,
         old="part < 1 || part > MONTH_PARTS_MOST) return",
         new="part < 1 || part > MONTH_PARTS_MOST + 1) return",
         tests=[DT], pattern='reads a query for a deep lookup strictly'),
    dict(id='the-first-part-unless-told', file=DR,
         old="url.searchParams.get('part') ?? '1'",
         new="url.searchParams.get('part') ?? '2'",
         tests=[DT], pattern='reads a query for a deep lookup strictly'),

    # What of a write-up is served: the phone's own rule, at the moment of serving.
    dict(id='the-forget-moment-is-read', file=DR,
         old="(b.kind === 'wrong' || b.kind === 'forget') && typeof b.at === 'string'",
         new="b.kind === 'wrong' && typeof b.at === 'string'",
         tests=[DT], pattern='serves nothing written at or before the forget moment'),
    dict(id='a-mark-of-wrong-is-read', file=DR,
         old="(b.kind === 'wrong' || b.kind === 'forget') && typeof b.at === 'string'",
         new="b.kind === 'forget' && typeof b.at === 'string'",
         tests=[DT], pattern='leaves out an observation the owner marked wrong'),
    dict(id='one-marked-wrong-is-left-out', file=DR,
         old="      if (o.wrong) continue\n",
         new="",
         tests=[DT], pattern='leaves out an observation the owner marked wrong'),
    dict(id='a-day-must-still-hold-a-record', file=DR,
         old="    days: new Set(held),\n",
         new="    days: { has: () => true } as unknown as Set<string>,\n",
         tests=[DT], pattern='cites a day which no longer holds a record'),
    dict(id='a-check-in-holds-its-day', file=TU,
         old="[...live(APP, 'days'), ...live(APP, 'checkins')]",
         new="[...live(APP, 'days')]",
         tests=[DT], pattern='cites a day which no longer holds a record'),
    dict(id='a-days-own-row-holds-it', file=TU,
         old="[...live(APP, 'days'), ...live(APP, 'checkins')]",
         new="[...live(APP, 'checkins')]",
         tests=[DT], pattern='serves everything on a record with nothing hidden'),
    dict(id='a-kind-must-be-readable', file=DR,
         old="    kindOn: (kind) => x.a.allowed(kind as Category),\n",
         new="    kindOn: () => true,\n",
         tests=[DT], pattern='the join: an observation resting on a line tagged faith'),
    dict(id='faith-shown-only-where-readable', file=DR,
         old="    faithShown: x.a.allowed('faith'),\n",
         new="    faithShown: true,\n",
         tests=[DT], pattern='the join: an observation resting on a line tagged faith'),
    dict(id='names-hidden-while-they-may-not-be-shown', file=DR,
         old="x.showPrivate ? Promise.resolve([] as string[]) : privateNames(x.store)",
         new="Promise.resolve([] as string[])",
         tests=[DT], pattern='names a private item while names may not be shown'),
    dict(id='each-fact-is-one-the-run-may-read', file=DR,
         old="  return out.filter((f) => mayRead(f, x.a))\n",
         new="  return out\n",
         tests=[DT], pattern='the fact: it carries faith'),
    dict(id='a-faith-line-tags-its-fact', file=DR,
         old="      const faith = raw?.[o.part][o.place - 1]?.faith === true\n",
         new="      const faith = false\n",
         tests=[DT], pattern='the fact: it carries faith'),
    dict(id='every-kind-it-drew-on', file=DR,
         old="  const kinds = o.kinds.join('|')\n",
         new="  const kinds = o.kinds[0]\n",
         tests=[DT], pattern='the fact: it carries faith'),
    dict(id='the-partner-path-where-it-was-drawn-on', file=DR,
         old="category: o.kinds.includes('partnerPath') ? 'partnerPath' : (o.kinds[0] ?? 'closed') },",
         new="category: o.kinds[0] ?? 'closed' },",
         tests=[DT], pattern='the fact: it carries faith'),
    dict(id='every-kind-of-a-fact-must-be-readable', file=R,
         old="const named: Category[] = kinds.length ? kinds.map(",
         new="const named: Category[] = kinds.length ? kinds.slice(0, 1).map(",
         tests=[DT], pattern='reads each fact under every kind its observation drew on'),
    dict(id='an-unknown-kind-is-closed', file=R,
         old="kinds.map((k) => ((CATEGORIES as readonly string[]).includes(k) ? (k as Category) : CLOSED)) : [CLOSED]",
         new="kinds.map((k) => k as Category) : [CLOSED]",
         tests=[DT], pattern='reads each fact under every kind its observation drew on'),
    dict(id='no-kinds-is-closed', file=R,
         old="(k as Category) : CLOSED)) : [CLOSED]\n",
         new="(k as Category) : CLOSED)) : []\n",
         tests=[DT], pattern='reads each fact under every kind its observation drew on'),
    dict(id='a-faith-tag-adds-faith', file=R,
         old="    return f.tags.includes('faith') && !named.includes('faith') ? [...named, 'faith'] : named\n",
         new="    return named\n",
         tests=[DT], pattern='reads each fact under every kind its observation drew on'),
    dict(id='the-write-ups-head-is-its-own', file=R,
         old="export const WRITEUP_HEAD = 'writeups'",
         new="export const WRITEUP_HEAD = 'note'",
         tests=[FC], pattern='carries a fact head no fact on the sheet carries'),
    dict(id='held-to-the-rule-again-at-the-check', file=A,
         old="    for (let i = lookups.length - 1; i >= 0; i--) if (isWriteUpFact(lookups[i].id) && !still.has(lookups[i].id)) lookups.splice(i, 1)\n",
         new="",
         tests=[DT], pattern='holds a served fact to the rule again at the check'),
    dict(id='a-deleted-day-takes-its-fact-at-the-check', file=A,
         old="    for (let i = lookups.length - 1; i >= 0; i--) if (isWriteUpFact(lookups[i].id) && !still.has(lookups[i].id)) lookups.splice(i, 1)\n",
         new="",
         tests=[DT], pattern='takes a served fact out when a day it cites is deleted'),

    # What Claude noticed is never repeated as fact.
    dict(id='a-guess-is-said-as-a-guess', file=BS,
         old="  if (!GUESS_WORDS.test(text)) out.push(",
         new="  if (false) out.push(",
         tests=[DT], pattern='refuses a guess said as a fact'),
    dict(id='the-rule-runs-in-the-checker', file=BS,
         old="  if (factIds.some(isNoticedFact)) out.push(...noticedRefusals(text, factIds, all))\n",
         new="",
         tests=[DT], pattern='refuses a guess said as a fact'),
    dict(id='may-is-a-guess-word', file=BS,
         old="|\\b(?:may|might)\\b/",
         new="|\\b(?:might)\\b/",
         tests=[DT], pattern='reads the guess words as the rule names them'),
    dict(id='might-is-a-guess-word', file=BS,
         old="|\\b(?:may|might)\\b/",
         new="|\\b(?:may)\\b/",
         tests=[DT], pattern='reads the guess words as the rule names them'),
    dict(id='may-is-not-the-month', file=BS,
         old="|\\b(?:may|might)\\b/\n",
         new="|\\b(?:may|might)\\b/i\n",
         tests=[DT], pattern='reads the guess words as the rule names them'),
    dict(id='not-tested-is-a-guess-word', file=BS,
         old="|[Nn]ot tested)",
         new=")",
         tests=[DT], pattern='reads the guess words as the rule names them'),
    dict(id='claude-noticed-is-a-guess-word', file=BS,
         old="(?:[Cc]laude noticed|",
         new="(?:",
         tests=[DT], pattern='reads the guess words as the rule names them'),
    dict(id='a-guess-is-a-guess-word', file=BS,
         old="|[Aa] guess|",
         new="|",
         tests=[DT], pattern='reads the guess words as the rule names them'),
    dict(id='never-the-usual-case-on-a-guess', file=BS,
         old="  if (calledUsual) out.push(",
         new="  if (false) out.push(",
         tests=[DT], pattern='refuses the usual-case words on a guess'),
    dict(id='every-usual-word-is-named-for-a-guess', file=BS,
         old="const calledUsual = counted ? null : found(USUAL_WORDS, text, all)",
         new="const calledUsual = counted ? null : found(USUAL_WORDS, text)",
         tests=[DT], pattern='reads the guess words as the rule names them'),
    dict(id='a-counted-comparison-answers-for-those-words', file=BS,
         old="const calledUsual = counted ? null : found(USUAL_WORDS, text, all)",
         new="const calledUsual = found(USUAL_WORDS, text, all)",
         tests=[DT], pattern='reads the guess words as the rule names them'),
    dict(id='a-note-count-answers-for-them-too', file=BS,
         old="  const counted = factIds.some(isTableFact) || factIds.some(isNoteWordsFact)\n",
         new="  const counted = factIds.some(isTableFact)\n",
         tests=[DT], pattern='reads the guess words as the rule names them'),
    dict(id='no-rule-without-a-guess-cited', file=BS,
         old="  if (!factIds.some(isNoticedFact)) return []\n",
         new="",
         tests=[DT], pattern='reads the guess words as the rule names them'),
    dict(id='a-write-up-is-an-association', file=BS,
         old="  if (isWriteUpFact(id)) return true\n",
         new="",
         tests=[DT], pattern='facts apart'),
    dict(id='no-cause-on-a-guess', file=BS,
         old="  if (isWriteUpFact(id)) return true\n",
         new="",
         tests=[DT], pattern='refuses the usual-case words on a guess'),
    dict(id='a-count-since-is-a-table-fact', file=BS,
         old="  return id.startsWith('pattern.') || isFollowedFact(id)\n",
         new="  return id.startsWith('pattern.')\n",
         tests=[DT], pattern='facts apart'),
    dict(id='a-count-since-keeps-a-pattern-facts-wording', file=BS,
         old="  return id.startsWith('pattern.') || isFollowedFact(id)\n",
         new="  return id.startsWith('pattern.')\n",
         tests=[DT], pattern='is held to the wording a pattern fact keeps'),
    dict(id='a-guess-is-not-its-count', file=BS,
         old="\\.noticed\\.\\d+$/.test(id)",
         new="\\.noticed\\.\\d+/.test(id)",
         tests=[DT], pattern='facts apart'),
    dict(id='a-count-ends-in-since', file=BS,
         old="\\.noticed\\.\\d+\\.since$/.test(id)",
         new="\\.noticed\\.\\d+/.test(id)",
         tests=[DT], pattern='facts apart'),
    dict(id='a-write-ups-facts-are-headed-so', file=BS,
         old="  return id.startsWith('writeups.')\n",
         new="  return id.startsWith('writeup')\n",
         tests=[DT], pattern='facts apart'),

    # A followed guess, with its count since.
    dict(id='the-count-comes-from-the-table', file=A,
         old="  return writeUpFacts(x, shown, 'table' in table ? table.table : null)\n",
         new="  return writeUpFacts(x, shown, null)\n",
         tests=[DT], pattern=FIRST),
    dict(id='the-tables-own-count-for-that-guess', file=DR,
         old="  const kept = table.followed?.find((f) => f.id === o.markId)\n",
         new="  const kept = table.followed?.[0]\n",
         tests=[DT], pattern='the count since: the table'),
    dict(id='nothing-counted-yet-serves-no-count', file=DR,
         old="  if (!kept || !kind || !w || kept.n + kept.m === 0) return null\n",
         new="  if (!kept || !kind || !w) return null\n",
         tests=[DT], pattern='is not served while the table holds no count'),
    dict(id='a-kind-gone-serves-no-count', file=DR,
         old="  if (!kept || !kind || !w || kept.n + kept.m === 0) return null\n",
         new="  if (!kept || !w || kept.n + kept.m === 0) return null\n",
         tests=[DT], pattern='is not served while the table holds no count'),
    dict(id='no-count-kept-serves-none', file=DR,
         old="  if (!kept || !kind || !w || kept.n + kept.m === 0) return null\n",
         new="  if (!kind || !w) return null\n",
         tests=[DT], pattern='is not served while the table holds no count'),
    dict(id='the-count-carries-its-standing', file=DR,
         old="family: kept.family, standing: kept.standing, direction: kept.direction, ...saidIn(",
         new="family: kept.family, direction: kept.direction, ...saidIn(",
         tests=[DT], pattern=FIRST),
    dict(id='the-count-carries-how-many-were-looked-at', file=DR,
         old="restPct: kept.m ? Math.round((100 * kept.restK) / kept.m) : 0, family: kept.family, ",
         new="restPct: kept.m ? Math.round((100 * kept.restK) / kept.m) : 0, ",
         tests=[DT], pattern='at a lead is said as a lead'),
    dict(id='the-count-reads-under-its-kinds-category', file=DR,
         old="  const kinds = [...new Set([kind.category, ...o.kinds])].join('|')\n",
         new="  const kinds = o.kinds.join('|')\n",
         tests=[DT], pattern='the count since: the table'),

    # The month under way.
    dict(id='so-far-starts-at-the-months-first', file=M,
         old="  const range = { from: `${month}-01`, to: day }\n",
         new="  const range = { from: day, to: day }\n",
         tests=[DT], pattern='serves the days of the month up to the task'),
    dict(id='so-far-ends-at-the-tasks-day', file=M,
         old="  const range = { from: `${month}-01`, to: day }\n",
         new="  const range = { from: `${month}-01`, to: `${month}-31` }\n",
         tests=[DT], pattern='serves the days of the month up to the task'),
    dict(id='so-far-is-named-by-a-day', file=M,
         old="  if (!SO_FAR_DAY.test(day)) return { ok: false, reason: `${day} is not a day` }\n",
         new="",
         tests=[DT], pattern='is named by a day, and says what it read'),
    dict(id='so-far-as-the-exact-day-words-it', file=M,
         old="days.push({ day: d, inside: true, facts: dayFacts(x, d, got) })",
         new="days.push({ day: d, inside: true, facts: dayFacts(x, d, got).reverse() })",
         tests=[DT], pattern='serves the days of the month up to the task'),
    dict(id='so-far-is-whole-or-nothing', file=M,
         old="    if (inHand !== inDatabase) return",
         new="    if (inHand > inDatabase) return",
         tests=[DT], pattern='is whole or nothing'),
    dict(id='so-far-keeps-its-counts', file=M,
         old="    tally[store] = inHand\n",
         new="",
         tests=[DT], pattern='is built once a run and kept'),
    dict(id='so-far-the-workouts-read-is-whole', file=M,
         old="  if (got.outside.length >= OUTSIDE_READ) return",
         new="  if (got.outside.length > OUTSIDE_READ) return",
         tests=[DT], pattern='builds nothing when the finished workouts outran'),
    dict(id='so-far-sixteen-parts-at-most', file=M,
         old="  if (built.length > MONTH_PARTS_MOST) return",
         new="  if (built.length > MONTH_PARTS_MOST + 1) return",
         tests=[DT], pattern='builds nothing past sixteen parts'),
    dict(id='built-once-a-run', file=A,
         old="      if (!soFar) {\n",
         new="      if (true) {\n",
         tests=[DT], pattern='is built once a run and kept'),
    dict(id='kept-with-what-was-served', file=A,
         old=", ...(soFar ? { deep: { ...served.served.deep, soFar } } : {}) }, at)",
         new=" }, at)",
         tests=[DT], pattern='is built once a run and kept'),
    dict(id='not-whole-is-a-failed-read', file=A,
         old="        if (!built.ok) return failedRead(deps, t, key, built.reason)\n",
         new="        if (!built.ok) return reply(200, { lookup: 'monthSoFar', facts: [] })\n",
         tests=[DT], pattern='is whole or nothing'),
    dict(id='a-part-out-of-range-is-refused', file=A,
         old="      if (!part && soFar.parts.length) return reply(400,",
         new="      if (false) return reply(400,",
         tests=[DT], pattern='serves the days of the month up to the task'),
    dict(id='a-line-switched-off-since-is-taken-away', file=A,
         old="      facts = (part?.facts ?? []).filter((f) => mayRead(f, access))\n",
         new="      facts = part?.facts ?? []\n",
         tests=[DT], pattern='takes a line away when its switch is turned off after the month was built'),
    dict(id='a-month-with-nothing-says-so', file=A,
         old="...(soFar.parts.length ? {} : { note: 'nothing this run may read is recorded this month yet' })",
         new="",
         tests=[DT], pattern='says so when the month holds nothing yet'),
    dict(id='the-facts-are-kept-with-the-runs-lookups', file=A,
         old="lookups: withLookups(served.served.lookups ?? [], facts), ...(soFar",
         new="lookups: served.served.lookups, ...(soFar",
         tests=[DT], pattern='passes an answer that cites a guess and says it is one'),
    dict(id='a-note-line-holds-its-numbers', file=L,
         old="f.values.category === 'notes' && f.text.includes('“') ? { ...f, values:",
         new="false ? { ...f, values:",
         tests=[DT], pattern='checks an answer against the part it read'),
    dict(id='from-the-quote-alone', file=L,
         old="saidIn(f.text.slice(f.text.indexOf('“')))",
         new="saidIn(f.text)",
         tests=[DT], pattern='checks an answer against the part it read'),

    # No one-year limit for the deep tier.
    dict(id='the-deep-tier-has-no-year-limit', file=A,
         old="parseLookupQuery(url, t.day, deep ? { first: await firstDay(deps.store) } : undefined)",
         new="parseLookupQuery(url, t.day, undefined)",
         tests=[DT], pattern='lets its lookups over a range reach back past a year'),
    dict(id='ordinary-ask-keeps-a-year', file=A,
         old="parseLookupQuery(url, t.day, deep ? { first: await firstDay(deps.store) } : undefined)",
         new="parseLookupQuery(url, t.day, { first: await firstDay(deps.store) })",
         tests=[DT], pattern='lets its lookups over a range reach back past a year'),
    dict(id='the-year-stands-without-a-reach', file=L,
         old="  if (!reach && from < addDays(day, -REACH_DAYS)) return",
         new="  if (reach && from < addDays(day, -REACH_DAYS)) return",
         tests=[DT], pattern='lets its lookups over a range reach back past a year'),
    dict(id='the-notes-from-the-records-first-day', file=L,
         old="(lookup === 'noteWords' && reach?.first ? reach.first : addDays(",
         new="(lookup !== 'noteWords' && reach?.first ? reach.first : addDays(",
         tests=[DT], pattern='searches the notes from the record'),
    dict(id='ordinary-ask-searches-a-year', file=A,
         old="parseLookupQuery(url, t.day, deep ? { first: await firstDay(deps.store) } : undefined)",
         new="parseLookupQuery(url, t.day, { first: await firstDay(deps.store) })",
         tests=[DT], pattern='searches the notes from the record'),
    dict(id='the-first-month-that-holds-anything', file=A,
         old="  const first = (await store.monthStamps()).find((s) => s.held > 0)\n",
         new="  const first = (await store.monthStamps())[0]\n",
         tests=[DT], pattern='searches the notes from the record'),
    dict(id='a-categorys-read-has-no-year-limit-for-it', file=A,
         old="  const q = parseContextQuery(url, t.day, t.task === 'deep')\n",
         new="  const q = parseContextQuery(url, t.day)\n",
         tests=[DT], pattern='read reach back past a year too'),
    dict(id='ordinary-ask-keeps-a-year-for-a-category', file=A,
         old="  const q = parseContextQuery(url, t.day, t.task === 'deep')\n",
         new="  const q = parseContextQuery(url, t.day, true)\n",
         tests=[DT], pattern='read reach back past a year too'),
    dict(id='no-year-only-where-it-is-said', file=R,
         old="  if (!noYear) {\n",
         new="  if (noYear) {\n",
         tests=[DT], pattern='read reach back past a year too'),

    # The budget.
    dict(id='counted-beside-never-against', file=A,
         old="  await deps.store.writeTask({ ...t, deep: { ...counted, reads: counted.reads + 1,",
         new="  await deps.store.writeTask({ ...t, contextCalls: t.contextCalls + 1, deep: { ...counted, reads: counted.reads + 1,",
         tests=[DT], pattern='counts the write-ups and the parts beside its other reads'),
    dict(id='its-size-is-not-against-the-64-kb', file=A,
         old="  await deps.store.writeTask({ ...t, deep: { ...counted, reads: counted.reads + 1,",
         new="  await deps.store.writeTask({ ...t, contextBytes: t.contextBytes + bytes, deep: { ...counted, reads: counted.reads + 1,",
         tests=[DT], pattern='counts the write-ups and the parts beside its other reads'),
    dict(id='each-deep-read-is-counted', file=A,
         old="deep: { ...counted, reads: counted.reads + 1, bytes: counted.bytes + bytes,",
         new="deep: { ...counted, reads: counted.reads, bytes: counted.bytes + bytes,",
         tests=[DT], pattern='counts the write-ups and the parts beside its other reads'),
    dict(id='a-deep-reads-size-is-counted', file=A,
         old="deep: { ...counted, reads: counted.reads + 1, bytes: counted.bytes + bytes,",
         new="deep: { ...counted, reads: counted.reads + 1, bytes: counted.bytes,",
         tests=[DT], pattern='counts the write-ups and the parts beside its other reads'),
    dict(id='the-parts-served-are-recorded', file=A,
         old="parts: served1 === null ? counted.parts : ",
         new="parts: true ? counted.parts : ",
         tests=[DT], pattern='counts the write-ups and the parts beside its other reads'),
    dict(id='logged-as-the-deep-tiers', file=A,
         old="task: 'deep', category: `lookup.${query.lookup}`, count: sent.length, bytes,",
         new="task: 'ask', category: `lookup.${query.lookup}`, count: sent.length, bytes,",
         tests=[DT], pattern='counts the write-ups and the parts beside its other reads'),
    dict(id='logged-by-its-count', file=A,
         old="task: 'deep', category: `lookup.${query.lookup}`, count: sent.length, bytes,",
         new="task: 'deep', category: `lookup.${query.lookup}`, count: 0, bytes,",
         tests=[DT], pattern='counts the write-ups and the parts beside its other reads'),
    dict(id='logged-under-its-own-name', file=A,
         old="task: 'deep', category: `lookup.${query.lookup}`, count: sent.length, bytes,",
         new="task: 'deep', category: 'lookup.day', count: sent.length, bytes,",
         tests=[DT], pattern='counts the write-ups and the parts beside its other reads'),
    dict(id='the-deep-reads-stop', file=A,
         old="  if (counted.reads >= most) return reply(429,",
         new="  if (counted.reads > most) return reply(429,",
         tests=[DT], pattern='grows with the months, and stops'),
    dict(id='the-most-grows-with-the-months-it-has', file=A,
         old="deepReadsMost(served.served.deep?.months?.have.length ?? 0)",
         new="deepReadsMost(0)",
         tests=[DT], pattern='grows with the months, and stops'),
    dict(id='the-months-count-toward-the-most', file=DR,
         old="(months: number): number => months + MONTH_PARTS_MOST + DEEP_SPARE_READS",
         new="(months: number): number => MONTH_PARTS_MOST + DEEP_SPARE_READS",
         tests=[DT], pattern='grows with the months, and stops'),
    dict(id='four-spare-reads', file=DR,
         old="export const DEEP_SPARE_READS = 4",
         new="export const DEEP_SPARE_READS = 5",
         tests=[DT], pattern='grows with the months, and stops'),

    # Which months it lacks.
    dict(id='the-months-at-the-first-briefing', file=A,
         old="  if (deep && !run.months) {\n",
         new="  if (false) {\n",
         tests=[DT], pattern='is told in its briefing which months'),
    dict(id='the-months-kept-with-what-was-served', file=A,
         old="    run.served = { served: { ...run.served.served, deep: { ...run.served.served.deep, months: run.months } }, kept: false }\n",
         new="",
         tests=[DT], pattern='is told in its briefing which months'),
    dict(id='the-months-said-in-the-briefing', file=A,
         old="    ...(run.months ? [monthsText(run.months)] : []),\n",
         new="",
         tests=[DT], pattern='is told in its briefing which months'),
    dict(id='its-own-lookups-after-the-nine', file=A,
         old=", ...(deep ? DEEP_LOOKUPS.map((l) => DEEP_LOOKUP_HELP[l]) : [])],",
         new="],",
         tests=[DT], pattern='is told in its briefing which months'),
    dict(id='ordinary-ask-is-listed-nine', file=A,
         old=", ...(deep ? DEEP_LOOKUPS.map((l) => DEEP_LOOKUP_HELP[l]) : [])],",
         new=", ...DEEP_LOOKUPS.map((l) => DEEP_LOOKUP_HELP[l])],",
         tests=[AO], pattern='is briefed exactly as it was'),
    dict(id='ordinary-ask-is-briefed-as-before', file=A,
         old="...(deep ? { reach:",
         new="...(true ? { reach:",
         tests=[AO], pattern='is briefed exactly as it was'),
    dict(id='its-reach-and-a-failed-reads-cost-are-said', file=A,
         old="...(deep ? { reach:",
         new="...(false ? { reach:",
         tests=[DT], pattern='is told in its briefing which months'),
    dict(id='the-write-ups-lookup-says-what-it-serves', file=DR,
         old="what was recorded, what Claude noticed, and a noticed guess counted since. It does not count against maxCalls or maxBytes',",
         new="what was recorded and what Claude noticed',",
         tests=[DT], pattern='is told in its briefing which months'),
    dict(id='the-month-so-far-lookup-says-how-to-read-it', file=DR,
         old="start at part=1, and each reply says how many parts there are. It does not count against maxCalls or maxBytes',",
         new="start at part=1',",
         tests=[DT], pattern='is told in its briefing which months'),
    dict(id='the-lacking-months-named-in-the-briefing', file=DR,
         old="    ...(m.lacking.length ? [`No write-up can be read for:",
         new="    ...(false ? [`No write-up can be read for:",
         tests=[DT], pattern='is told in its briefing which months'),
    dict(id='a-month-with-a-write-up-is-not-lacking', file=DR,
         old="s.held > 0 && s.month < underWay && !have.includes(s.month)",
         new="s.held > 0 && s.month < underWay",
         tests=[DT], pattern='says the months as they stand'),
    dict(id='a-month-that-holds-nothing-lacks-nothing', file=DR,
         old="s.held > 0 && s.month < underWay && !have.includes(s.month)",
         new="s.month < underWay && !have.includes(s.month)",
         tests=[DT], pattern='says the months as they stand'),
    dict(id='the-month-under-way-is-never-lacking', file=DR,
         old="s.held > 0 && s.month < underWay && !have.includes(s.month)",
         new="s.held > 0 && s.month <= underWay && !have.includes(s.month)",
         tests=[DT], pattern='says the months as they stand'),
    dict(id='a-month-after-is-never-lacking', file=DR,
         old="s.held > 0 && s.month < underWay && !have.includes(s.month)",
         new="s.held > 0 && s.month !== underWay && !have.includes(s.month)",
         tests=[DT], pattern='says the months as they stand'),
    dict(id='a-count-alone-makes-no-month', file=DR,
         old="facts.filter((f) => f.values.part === 'recorded' || f.values.part === 'noticed')",
         new="facts.filter(() => true)",
         tests=[DT], pattern='says the months as they stand'),
    dict(id='the-check-holds-what-the-briefing-said', file=A,
         old=", ...(served.served.deep?.months ? { months: served.served.deep.months } : {}) } }\n",
         new=" } }\n",
         tests=[DT], pattern='does not name a month that has none'),
    dict(id='the-lacking-months-are-held', file=A,
         old="    if (lack) verdict = verdict.ok ? { ok: false, reason: lack } : { ok: false, reason: `${verdict.reason}; and ${lack}` }\n",
         new="",
         tests=[DT], pattern='does not name a month that has none'),
    dict(id='only-where-a-write-up-is-cited', file=DR,
         old="  if (!lacking.length || !factIds.some(isWriteUpFact)) return null\n",
         new="  if (!lacking.length) return null\n",
         tests=[DT], pattern='does not name a month that has none'),
    dict(id='every-lacking-month-is-held', file=DR,
         old="  const missing = lacking.filter(",
         new="  const missing = lacking.slice(0, 1).filter(",
         tests=[DT], pattern='holds each lacking month by its own name'),
    dict(id='a-month-by-its-name-with-its-capital', file=DR,
         old="new RegExp(`\\\\b${monthWord(m)}\\\\b`)",
         new="new RegExp(`\\\\b${monthWord(m)}\\\\b`, 'i')",
         tests=[DT], pattern='holds each lacking month by its own name'),
    dict(id='the-lacking-reason-beside-the-others', file=A,
         old="{ ok: false, reason: lack } : { ok: false, reason: `${verdict.reason}; and ${lack}` }",
         new="{ ok: false, reason: lack } : { ok: false, reason: verdict.reason }",
         tests=[DT], pattern='adds the reason to the others'),

    # A failed read.
    dict(id='a-failed-read-is-counted-by-what-it-asked', file=A,
         old="deep: { ...counted, failed: { ...counted.failed, [key]: n } } })",
         new="deep: { ...counted } })",
         tests=[DT], pattern='is whole or nothing'),
    dict(id='once-more-then-go-on', file=A,
         old="  const again = n < DEEP_READ_TRIES\n",
         new="  const again = true\n",
         tests=[DT], pattern='is whole or nothing'),
    dict(id='asked-and-once-more', file=DR,
         old="export const DEEP_READ_TRIES = 2",
         new="export const DEEP_READ_TRIES = 3",
         tests=[DT], pattern='is whole or nothing'),
    dict(id='a-thrown-read-costs-the-deep-tier-nothing', file=A,
         old="    if (!deep) throw e\n",
         new="    throw e\n",
         tests=[DT], pattern='costs a deep run nothing'),
    dict(id='ordinary-ask-fails-as-before', file=A,
         old="    if (!deep) throw e\n",
         new="",
         tests=[DT], pattern='costs a deep run nothing'),
    dict(id='a-thrown-deep-read-is-a-failed-read', file=A,
         old="  } catch {\n    return failedRead(deps, t, key, 'the read could not be made')\n  }\n",
         new="  } catch (e) {\n    throw e\n  }\n",
         tests=[DT], pattern='costs a deep run nothing'),

    # What it is told.
    dict(id='the-deep-tier-is-told-its-rules', file=P,
         old="    ...(task === 'deep' ? DEEP_RULES : []),\n",
         new="",
         tests=[DT], pattern='is told its four rules'),
    dict(id='ordinary-ask-is-told-none-of-them', file=P,
         old="    ...(task === 'deep' ? DEEP_RULES : []),\n",
         new="    ...DEEP_RULES,\n",
         tests=[AO], pattern='is told exactly what it was told'),
    dict(id='the-rule-to-read-everything', file=P,
         old="These two do not count against your other reads.",
         new="These two count against your other reads.",
         tests=[DT], pattern='is told its four rules'),
    dict(id='the-rule-that-a-guess-is-a-guess', file=P,
         old="which nobody tested: it is never a fact. With one cited, say it is a guess,",
         new="which nobody tested. With one cited, say it is a guess,",
         tests=[DT], pattern='is told its four rules'),
    dict(id='the-rule-to-name-the-lacking-months', file=P,
         old="  `- When you cite a write-up and THE MONTHS names months that have none, say in the answer that you had no write-up for each of them, naming the month by its name alone, with no year.`,\n",
         new="",
         tests=[DT], pattern='is told its four rules'),
    dict(id='the-rule-on-a-failed-read', file=P,
         old="  `- A read that fails costs nothing: ask it once more. If it fails again, go on without it, and say in the answer what you could not read.`,\n",
         new="",
         tests=[DT], pattern='is told its four rules'),
    dict(id='about-250-words', file=P,
         old="about 250 words in four or five short paragraphs",
         new="about 300 words in four or five short paragraphs",
         tests=[DT], pattern='is prompted to about 250 words'),
    dict(id='held-to-450-words', file=AS,
         old="export const ASK_WORDS = { ask: 220, deep: 450 } as const",
         new="export const ASK_WORDS = { ask: 220, deep: 500 } as const",
         tests=[DT], pattern='is prompted to about 250 words'),
    dict(id='the-write-ups-read-has-a-name', file=C,
         old="      'lookup.writeups': 'Lookup: your monthly write-ups',\n",
         new="",
         tests=[DT], pattern='has a name on the phone for each of the two reads'),
    dict(id='the-month-so-fars-read-has-a-name', file=C,
         old="      'lookup.monthSoFar': 'Lookup: this month so far',\n",
         new="",
         tests=[DT], pattern='has a name on the phone for each of the two reads'),
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
