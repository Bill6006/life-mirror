"""Phase 4 of the next build (2026-11-13), lookups as facts, the pattern table and the exact day: each rule undone once,
and the test that guards it must turn red.

The pattern table: the level is counted as two kinds by the Weekly View's bands, under 40 and 80 or more; a kind says
its cut-off; a faith practice's kind is faith's; a kind with too few to test keeps its counts; the level's averages
carry their counts in the five bands; a kind's comparisons are kept by exactly its occasions; the stored record is
read strictly, goes stale at 48 hours, and is the same table whenever it was built.

The words: every cell is named as it reads after the thing; the level's averages claim no difference; a kind says its
cut-off as the app's default.

The checker: a table fact is an association; the usual-case words need a steady pattern; a lead says "lead" and how
many comparisons were looked at, the number as its own; with no lead the words that put one time ahead of another are
refused; the whole-kind fact licenses nothing; a count said "k of n" counts once for the voice, and only where a table
fact is cited.

The lookups: a lookup's fact is read under the category it names, an unknown one is closed; a read that was cut is
known to be; an unknown parameter is refused, and a category beside a lookup; a private name only where names may be
shown, and the question's own name as a whole word; a switch drops a fact, and a faith word with faith hidden; the
Brain's own lines under its history's switch; a stale table refused; an id that may not be read answered as none; the
day in the order of its clock times, numbered after the check, the filed day and home time said; a step not done not
listed, and nothing of a generated Path but a step's name; a workout under its day at home; the scorecard's count.

Ask in the Worker: a lookup is served to Ask alone, counts as a read within the run's twenty, is kept with the served
sheet, cut for size, logged under its own name; the answer is checked against the sheet and the lookups together, each
read again at the check; the cited words are kept; the briefing lists the lookups and the instructions say the rules.

The phone: the table is written only when it changed, never over a newer format; a failed build is kept as a failure;
one build after another; a question waits a short while; the table follows the day's sheet and a question; a synced
record's key comes from its store's schema; the table is synced, in the export, and a private kind stays out of it.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, an empty test list refused, and an id that matches no entry refused.

python phase4_breaks.py [id ...]
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
K = 'src/counted/kinds.ts'
KT = 'src/counted/kinds.test.ts'
O = 'src/counted/occasions.ts'
TB = 'src/counted/table.ts'
TT = 'src/counted/table.test.ts'
SD = 'src/counted/stored.ts'
SDT = 'src/counted/stored.test.ts'
W = 'src/counted/words.ts'
WT = 'src/counted/words.test.ts'
BS = 'src/brainShared.ts'
PW = 'src/patternWording.test.ts'
R = 'worker/src/retrieval.ts'
L = 'worker/src/lookups.ts'
LT = 'worker/src/lookups.test.ts'
A = 'worker/src/ask.ts'
AL = 'worker/src/askLookups.test.ts'
PF = 'src/patternsFlow.ts'
PFT = 'src/patternsFlow.test.ts'
CK = 'src/cloudKeys.test.ts'

TABLE = [
    # ---- The pattern table ------------------------------------------------------------------------------------------
    dict(id='level-low-is-under-40', file=K,
         old="happened: (o) => o.reading < LOW_READING })",
         new="happened: (o) => o.reading <= LOW_READING + 2 })",
         tests=[KT], pattern='count the level as two kinds'),
    dict(id='level-high-is-80-or-more', file=K,
         old="happened: (o) => o.reading >= HIGH_READING })",
         new="happened: (o) => o.reading > HIGH_READING + 3 })",
         tests=[KT], pattern='count the level as two kinds'),
    dict(id='the-low-cut-off-is-40', file=O,
         old="export const LOW_READING = 40\n",
         new="export const LOW_READING = 38\n",
         tests=[KT], pattern='count the level as two kinds'),
    dict(id='the-high-cut-off-is-80', file=O,
         old="export const HIGH_READING = 80\n",
         new="export const HIGH_READING = 84\n",
         tests=[KT], pattern='count the level as two kinds'),
    dict(id='a-kind-says-its-cut-off', file=K,
         old="'a short night (under six hours)', 'under six hours', 'sleepHours',",
         new="'a short night (under six hours)', 'under seven hours', 'sleepHours',",
         tests=[KT], pattern='cut-off in words'),
    dict(id='a-faith-practice-is-faiths', file=K,
         old="category: faithMove(moveId) ? 'faith' : 'dayRecord', private: false,",
         new="category: 'dayRecord', private: false,",
         tests=[KT], pattern='file a faith practice'),
    dict(id='a-hidden-faith-move-is-faiths-too', file=K,
         old="moveById(moveId).family === 'faith' || moveById(moveId).hiddenWith === 'faith'",
         new="moveById(moveId).family === 'faith' && moveById(moveId).hiddenWith === 'faith'",
         tests=[KT], pattern='file a faith practice'),
    dict(id='untested-kinds-keep-their-counts', file=TB,
         old="    else untested.push(e.count)\n",
         new="",
         tests=[TT], pattern='starts small'),
    dict(id='the-level-is-counted-in-its-bands', file=TB,
         old="bands: LEVEL_BANDS.map((b) => inCell.filter((o) => o.band === b).length)",
         new="bands: LEVEL_BANDS.map(() => 0)",
         tests=[TT], pattern='as an average and as counts in the five bands'),
    dict(id='the-level-is-set-against-the-rest', file=TB,
         old="restMean: rest ? round1((sum - own) / rest) : 0",
         new="restMean: rest ? round1(sum / total) : 0",
         tests=[TT], pattern='as an average and as counts in the five bands'),
    dict(id='a-kept-kind-is-not-worked-out-again', file=TB,
         old="    if (was && was.from === from) return was\n",
         new="",
         tests=[TT], pattern='built a kind at a time'),
    dict(id='a-changed-kind-is-worked-out-again', file=TB,
         old="    if (was && was.from === from) return was\n",
         new="    if (was) return was\n",
         tests=[TT], pattern='built a kind at a time'),
    dict(id='the-kept-table-is-the-plain-table', file=TB,
         old="    entries.push(entryFor(kind, laid, true))\n    await pause()\n",
         new="    if (kind.unit === 'day') entries.push(entryFor(kind, laid, true))\n    await pause()\n",
         tests=[TT], pattern='built a kind at a time'),
    dict(id='the-stored-format-is-checked', file=SD,
         old="r.id !== PATTERNS_ID || r.format !== PATTERNS_FORMAT || !isDay(r.builtFor)",
         new="r.id !== PATTERNS_ID || !isDay(r.builtFor)",
         tests=[SDT], pattern='refused whole'),
    dict(id='a-cell-over-its-count-is-refused', file=SD,
         old="  if (c.k > c.n || c.restK > c.m) return null\n",
         new="",
         tests=[SDT], pattern='refused whole'),
    dict(id='an-unknown-standing-is-refused', file=SD,
         old="  if (typeof c.standing !== 'string' || !STANDINGS.includes(c.standing) || typeof c.direction",
         new="  if (typeof c.standing !== 'string' || typeof c.direction",
         tests=[SDT], pattern='refused whole'),
    dict(id='the-table-goes-stale-at-48-hours', file=SD,
         old="export const PATTERNS_MAX_AGE_MS = 48 * 3_600_000",
         new="export const PATTERNS_MAX_AGE_MS = 72 * 3_600_000",
         tests=[SDT], pattern='goes stale at 48 hours'),
    dict(id='the-same-table-whenever-it-was-built', file=SD,
         old="JSON.stringify({ format: r.format, builtFor: r.builtFor, kinds: r.kinds, level: r.level })",
         new="JSON.stringify(r)",
         tests=[SDT], pattern='is the same table whenever it was built'),
    dict(id='the-minimums-said-are-the-cores', file=SD,
         old="export const TABLE_MIN_SIDE = 8\n",
         new="export const TABLE_MIN_SIDE = 7\n",
         tests=[SDT], pattern='goes stale at 48 hours'),
    dict(id='the-bands-run-firing-to-empty', file=SD,
         old="export const LEVEL_BAND_WORDS: readonly string[] = ['Firing', 'Solid', 'Getting by', 'Worn down', 'Empty']",
         new="export const LEVEL_BAND_WORDS: readonly string[] = ['Empty', 'Worn down', 'Getting by', 'Solid', 'Firing']",
         tests=[SDT], pattern='goes stale at 48 hours'),
    # ---- The words --------------------------------------------------------------------------------------------------
    dict(id='a-cell-is-named-against-the-rest', file=W,
         old="{ where: `on ${WEEKDAYS[Number(cell)]}`, elsewhere: 'on other days' }",
         new="{ where: `on ${WEEKDAYS[Number(cell)]}`, elsewhere: 'on the other weekdays' }",
         tests=[WT], pattern='name every cell of the table'),
    dict(id='a-cell-the-table-does-not-hold-has-no-name', file=W,
         old="  if (split === 'shortNight') return cell === 'yes' ? {",
         new="  if (split === 'shortNight') return cell !== '' ? {",
         tests=[WT], pattern='name every cell of the table'),
    dict(id='the-levels-average-claims-no-difference', file=W,
         old=" An average describes and is no comparison: whether a difference stands is said by the two kinds \"a check-in that read under 40\" and \"a check-in that read 80 or more\".",
         new="",
         tests=[WT], pattern='say the level in a cell'),
    dict(id='a-kind-says-its-cut-off-is-the-default', file=W,
         old=" Cut-off: ${w.cutoff}, the app's own default; none of yours is set.",
         new=" Cut-off: ${w.cutoff}.",
         tests=[WT], pattern='say a kind as a whole'),
    dict(id='too-few-says-what-is-needed', file=W,
         old=": a comparison needs ${w.minSide} occasions in a cell and ${w.minSide} outside it, and ${w.minOccurrences} occurrences in all.`",
         new=".`",
         tests=[WT], pattern='say a kind as a whole'),
    # ---- The checker ------------------------------------------------------------------------------------------------
    dict(id='a-table-fact-is-an-association', file=BS,
         old="return id.startsWith('assoc.') || id.startsWith('private.') || isTableFact(id)",
         new="return id.startsWith('assoc.') || id.startsWith('private.')",
         tests=[PW], pattern='knows the table'),
    dict(id='the-usual-case-needs-a-steady-pattern', file=BS,
         old="  if (best >= STANDING_RANK.pattern) return []\n",
         new="  if (best >= STANDING_RANK.lead) return []\n",
         tests=[PW], pattern='at a lead refuses each usual-case word'),
    dict(id='a-lead-says-lead', file=BS,
         old=r"""    if (!/\blead\b/i.test(text)) out.push('cites a comparison that stands at a lead without saying so: say "a lead"')
""",
         new="",
         tests=[PW], pattern='at a lead refuses each usual-case word'),
    dict(id='a-lead-says-how-many-were-looked-at', file=BS,
         old="    if (families.length && !families.some((n) => saysNumber(text, n))) out.push(",
         new="    if (families.length > 99) out.push(",
         tests=[PW], pattern='at a lead refuses each usual-case word'),
    dict(id='the-family-number-is-its-own', file=BS,
         old=r"""  if (new RegExp(`(?<![\\d.,:])${n}(?![\\d:]|[.,]\\d)`).test(text)) return true""",
         new=r"""  if (new RegExp(`${n}`).test(text)) return true""",
         tests=[PW], pattern='at a lead refuses each usual-case word'),
    dict(id='a-family-in-words-is-read', file=BS,
         old="  const word = n === 1 ? 'one' : (whole ?? (tens && unit ? `${tens}-${unit}` : null))",
         new="  const word = n === 1 ? 'one' : (whole ?? null)",
         tests=[PW], pattern='at a lead refuses each usual-case word'),
    dict(id='no-lead-refuses-the-usual-case', file=BS,
         old="  if (usual) out.push(`says ${usual} of a comparison with no clear pattern yet: say \"no clear pattern yet\", with the counts`)\n",
         new="",
         tests=[PW], pattern='with no lead cited refuses'),
    dict(id='no-lead-refuses-one-time-ahead-of-another', file=BS,
         old="  const ahead = found(AHEAD_WORDS, text, all)\n",
         new="  const ahead = found(/never-a-word-of-the-answer/, text, all)\n",
         tests=[PW], pattern='with no lead cited refuses'),
    dict(id='a-missing-standing-licenses-nothing', file=BS,
         old="  const rank = (f: Fact) => STANDING_RANK[String(f.values.standing ?? '')] ?? 0\n  const best = Math.max(...cited.map(rank))\n  if (best >= STANDING_RANK.pattern)",
         new="  const rank = (f: Fact) => STANDING_RANK[String(f.values.standing ?? '')] ?? 3\n  const best = Math.max(...cited.map(rank))\n  if (best >= STANDING_RANK.pattern)",
         tests=[PW], pattern='with no lead cited refuses'),
    dict(id='every-offending-word-is-named', file=BS,
         old="  const usual = found(USUAL_WORDS, text, all)\n",
         new="  const usual = found(USUAL_WORDS, text)\n",
         tests=[PW], pattern='names every offending word at once'),
    dict(id='a-pair-counts-once-for-the-voice', file=BS,
         old="  const pairs = factIds.some((id) => isTableFact(id) || isNoteWordsFact(id)) ? (plain.match(COUNT_PAIR) ?? []).length : 0\n",
         new="  const pairs = 0\n",
         tests=[PW], pattern='counts once for the voice'),
    dict(id='the-pair-rule-is-the-patterns-alone', file=BS,
         old="  const pairs = factIds.some((id) => isTableFact(id) || isNoteWordsFact(id)) ? (plain.match(COUNT_PAIR) ?? []).length : 0\n",
         new="  const pairs = (plain.match(COUNT_PAIR) ?? []).length\n",
         tests=[PW], pattern='counts once for the voice'),
    dict(id='the-wording-rule-is-in-the-check', file=BS,
         old="  if (factIds.some(isTableFact)) out.push(...patternWordingRefusals(text, factIds, sheet, all))\n",
         new="",
         tests=[PW], pattern='lets an answer say one comparison'),
    # ---- The retrieval layer ----------------------------------------------------------------------------------------
    dict(id='a-lookup-facts-faith-tag-adds-faith', file=R,
         old="    return f.tags.includes('faith') && named !== 'faith' ? [named, 'faith'] : [named]\n",
         new="    return [named]\n",
         tests=[LT], pattern='are each mapped on purpose'),
    dict(id='an-unknown-category-is-closed', file=R,
         old="(c as Category) : CLOSED\n",
         new="(c as Category) : 'dayRecord'\n",
         tests=[LT], pattern='missing or unknown as closed'),
    dict(id='a-lookup-head-is-read-by-its-own-category', file=R,
         old="  if ((LOOKUPS as readonly string[]).includes(head)) {\n",
         new="  if ((LOOKUPS as readonly string[]).includes(head) && head !== 'day') {\n",
         tests=[LT], pattern='are each mapped on purpose'),
    dict(id='a-cut-read-is-known-to-be-cut', file=R,
         old="  const got = await x.store.readRecords(store, range, limit + 1)\n",
         new="  const got = await x.store.readRecords(store, range, limit)\n",
         tests=[LT], pattern='read of 501 rows is not whole'),
    dict(id='the-readers-own-limit-is-said', file=R,
         old="  if (x.tally && found.length > q.limit) x.tally.lines += found.length - q.limit\n",
         new="",
         tests=[LT], pattern='read of 501 rows is not whole'),
    dict(id='a-whole-read-says-whole', file=R,
         old="complete: notRead === 0 && linesLeftOut === 0, notRead, linesLeftOut }",
         new="complete: false, notRead, linesLeftOut }",
         tests=[LT], pattern='read of 501 rows is not whole'),
    # ---- The lookups ------------------------------------------------------------------------------------------------
    dict(id='an-unknown-lookup-parameter-is-refused', file=L,
         old="k !== 'lookup' && !LOOKUP_PARAMS[lookup].includes(k)) return",
         new="k !== 'lookup' && k === 'nothing') return",
         tests=[LT], pattern='refuses an unknown lookup'),
    dict(id='never-a-category-beside-a-lookup', file=L,
         old="  if (url.searchParams.has('category')) return { ok: false, reason: 'ask for a category or a lookup, never both' }\n",
         new="",
         tests=[LT], pattern='refuses an unknown lookup'),
    dict(id='a-day-is-never-after-the-tasks', file=L,
         old="    if (lookup === 'day' && date > day) return",
         new="    if (lookup === 'day' && date > '9999') return",
         tests=[LT], pattern='refuses an unknown lookup'),
    dict(id='a-range-reaches-back-a-year', file=L,
         old="const REACH_DAYS = 366\n",
         new="const REACH_DAYS = 3660\n",
         tests=[LT], pattern='refuses an unknown lookup'),
    dict(id='a-private-name-only-where-names-are-shown', file=L,
         old="(k.private && !x.showPrivate ? 'a private item' : k.label)",
         new="(k.label)",
         tests=[LT], pattern='name only where names may be shown'),
    dict(id='the-question-names-a-whole-word', file=L,
         old=r"""new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(k.label.trim())}(?![\\p{L}\\p{N}])`, 'iu')""",
         new=r"""new RegExp(`${escapeRe(k.label.trim())}`, 'iu')""",
         tests=[LT], pattern='name only where names may be shown'),
    dict(id='a-keyword-keeps-the-named-item', file=L,
         old="!k.id.toLowerCase().includes(needle) && !named) continue",
         new="!k.id.toLowerCase().includes(needle)) continue",
         tests=[LT], pattern='name only where names may be shown'),
    dict(id='a-keyword-finds-a-kind-by-its-id', file=L,
         old="!label.toLowerCase().includes(needle) && !k.id.toLowerCase().includes(needle) && !named) continue",
         new="!label.toLowerCase().includes(needle) && !named) continue",
         tests=[LT], pattern='filters by a keyword'),
    dict(id='a-switch-drops-a-lookups-fact', file=L,
         old="return factCategories(f, NO_AIMS).every((c) => a.allowed(c) ||",
         new="return factCategories(f, NO_AIMS).every((c) => c !== 'faith' || a.allowed(c) ||",
         tests=[LT], pattern='serves no fact of a category whose switch is off'),
    dict(id='a-faith-word-is-hidden-with-faith', file=L,
         old=" && (a.allowed('faith') || !FAITH_WORDS.test(f.text))\n",
         new="\n",
         tests=[LT], pattern='reads each line under its own switch'),
    dict(id='the-brains-lines-under-its-historys-switch', file=L,
         old="const linesAllowed = (a: Access): boolean => permitted('line', 'claude', 'brainHistory', a.gates, a.prefs.switches)",
         new="const linesAllowed = (_a: Access): boolean => true",
         tests=[LT], pattern='past lines and reviews'),
    dict(id='the-history-allowance-is-the-lines-lookups-alone', file=L,
         old="(c === 'brainHistory' && f.id.split('.')[0] === 'lines' && linesAllowed(a))",
         new="(c === 'brainHistory' && linesAllowed(a))",
         tests=[LT], pattern='for the lines lookup alone'),
    dict(id='a-stale-table-is-refused', file=L,
         old="  if (!Number.isFinite(age) || age > PATTERNS_MAX_AGE_MS) return",
         new="  if (!Number.isFinite(age)) return",
         tests=[LT], pattern='says so when no table has been built'),
    dict(id='a-table-that-does-not-parse-is-no-table', file=L,
         old="  if (!table) return { note: 'the pattern table could not be read' }\n",
         new="  if (!table) return { table: body as PatternsRecord }\n",
         tests=[LT], pattern='says so when no table has been built'),
    dict(id='a-kind-that-may-not-be-read-is-answered-as-none', file=L,
         old="  return { facts, complete: true, notRead: 0, ...(facts.length ? {} : { note: none }) }\n",
         new="  return { facts, complete: true, notRead: 0, ...(facts.length ? {} : { note: 'that kind may not be read' }) }\n",
         tests=[LT], pattern='answers an id the table does not hold'),
    dict(id='the-whole-kind-fact-carries-no-standing', file=L,
         old="{ occurrences: k.occurrences, known: k.known, family: k.family, ...(k.family === 0",
         new="{ occurrences: k.occurrences, known: k.known, family: k.family, standing: best ?? 'tooFew', ...(k.family === 0",
         tests=[LT], pattern='gives a kind as a whole'),
    dict(id='a-cell-with-nothing-in-it-is-not-served', file=L,
         old="    return w && c.n > 0 ? [{ c, w }] : []\n",
         new="    return w ? [{ c, w }] : []\n",
         tests=[LT], pattern='gives a kind as a whole'),
    dict(id='a-label-s-numbers-are-in-the-fact', file=L,
         old="  ;(label.match(/\\d+/g) ?? []).forEach((n, i) => (out[`said${i + 1}`] = Number(n)))\n",
         new="",
         tests=[LT], pattern='carries the numbers a label says'),
    dict(id='the-day-is-in-the-order-of-its-times', file=L,
         old=".sort((a, b) => stamp(a.l) - stamp(b.l) || a.i - b.i)",
         new=".sort((a, b) => a.i - b.i)",
         tests=[LT], pattern='order of their clock times'),
    dict(id='the-day-is-numbered-after-the-check', file=L,
         old="id: `day.${D}.${facts.length + 1}` })",
         new="id: `day.${D}.${ordered.findIndex((o) => o.l === l) + 1}` })",
         tests=[LT], pattern='reads each line under its own switch'),
    dict(id='the-filed-day-is-named', file=L,
         old="${t.day !== filed ? ` (on ${t.day} by the calendar; filed under ${filed})` : ''}",
         new="",
         tests=[LT], pattern='order of their clock times'),
    dict(id='home-time-is-said-for-a-day-away', file=L,
         old="${traveling ? ' (home time: logged while traveling)' : ''}",
         new="",
         tests=[LT], pattern='says home time'),
    dict(id='a-clock-time-is-in-the-facts-values', file=L,
         old="{ ...(t ? { at: t.clock } : {}), ...(l.values ?? {}) }",
         new="{ ...(l.values ?? {}) }",
         tests=[LT], pattern='order of their clock times'),
    dict(id='a-step-not-done-is-not-listed', file=L,
         old="      if (!own && said?.outcome !== 'done' && said?.outcome !== 'partly') continue\n",
         new="",
         tests=[LT], pattern='order of their clock times'),
    dict(id='a-skipped-offer-is-not-on-the-day', file=L,
         old="    if (b.skippedAt || !id || id === 'nothing') continue\n",
         new="    if (!id || id === 'nothing') continue\n",
         tests=[LT], pattern='order of their clock times'),
    dict(id='nothing-of-a-generated-path-but-a-steps-name', file=L,
         old="steps.set(str(m.id), str(m.name))",
         new="steps.set(str(m.id), `${str(m.name)} ${str(m.why)}`)",
         tests=[LT], pattern='but the name of a step that was done'),
    dict(id='a-path-of-your-own-is-the-commitments', file=L,
         old="const pathCategoryOf = (path: string): string => (path === 'social' ? 'socialPath' : path === 'partner' ? 'partnerPath' : 'commitments')",
         new="const pathCategoryOf = (path: string): string => (path === 'social' ? 'socialPath' : path === 'partner' ? 'partnerPath' : 'dayRecord')",
         tests=[LT], pattern='reads each line under its own switch'),
    dict(id='the-day-has-a-line-for-every-kind', file=L,
         old="    if (ex.sweet === true) also.push('something sweet')\n",
         new="",
         tests=[LT], pattern='has a line for every kind'),
    dict(id='a-private-item-on-the-day-is-unnamed-when-names-are-off', file=L,
         old="${x.showPrivate && names.get(id) ? names.get(id) : 'a private item'} marked",
         new="${names.get(id) ? names.get(id) : 'a private item'} marked",
         tests=[LT], pattern='reads each line under its own switch'),
    dict(id='a-workout-is-filed-at-home', file=L,
         old="  const t = localTime(new Date(ms), zone)\n  return t.hour < 4 ? addDays(t.day, -1) : t.day\n",
         new="  const t = localTime(new Date(ms), 'UTC')\n  return t.hour < 4 ? addDays(t.day, -1) : t.day\n",
         tests=[LT], pattern='under its day in the home zone'),
    dict(id='a-workout-outside-the-days-asked-is-not-listed', file=L,
         old="    return s && day && day >= q.from && day <= q.to ? [{ ...s, day }] : []\n",
         new="    return s && day ? [{ ...s, day }] : []\n",
         tests=[LT], pattern='under its day in the home zone'),
    dict(id='the-moves-are-the-ordinary-ones', file=L,
         old=".filter((o) => !(Array.isArray(o.b.paths) && o.b.paths.length) && x.catalogue.has(str(o.b.moveId)))",
         new=".filter((o) => x.catalogue.has(str(o.b.moveId)))",
         tests=[LT], pattern='list ordinary moves day by day'),
    dict(id='the-lookups-own-limit-is-said', file=L,
         old="  return { facts: facts.slice(0, q.limit), complete: facts.length <= q.limit, notRead: 0 }\n}\n\nasync function pathStepsLookup",
         new="  return { facts: facts.slice(0, q.limit), complete: true, notRead: 0 }\n}\n\nasync function pathStepsLookup",
         tests=[LT], pattern='list ordinary moves day by day'),
    dict(id='the-path-steps-own-limit-is-said', file=L,
         old="  return { facts: facts.slice(0, q.limit), complete: facts.length <= q.limit, notRead: 0 }\n}\n\nasync function workoutsLookup",
         new="  return { facts: facts.slice(0, q.limit), complete: true, notRead: 0 }\n}\n\nasync function workoutsLookup",
         tests=[LT], pattern='under its day in the home zone'),
    dict(id='a-withdrawn-line-is-not-served', file=L,
         old="if (r.day && str(b.text) && !b.withdrawnAt) rows.push(",
         new="if (r.day && str(b.text)) rows.push(",
         tests=[LT], pattern='past lines and reviews'),
    dict(id='an-earlier-lines-numbers-ground-nothing', file=L,
         old="    else rows.push({ day: b.day, text: `the line said “${b.text}”`, category: 'brainHistory' })\n",
         new="    else rows.push({ day: b.day, text: `the line said “${b.text}”`, category: 'brainHistory', values: { said: 62 } } as never)\n",
         tests=[LT], pattern='past lines and reviews'),
    dict(id='the-scorecard-counts-the-ranges-that-held', file=L,
         old="    const hits = scores.filter((b) => b.hit === true).length\n",
         new="    const hits = scores.length\n",
         tests=[LT], pattern='stored forecasts as predictions'),
    dict(id='a-forecast-is-said-with-how-it-scored', file=L,
         old="${s.hit === true ? 'inside' : 'outside'} the range.",
         new="inside the range.",
         tests=[LT], pattern='stored forecasts as predictions'),
    dict(id='a-lookup-whose-read-was-cut-is-not-whole', file=L,
         old="complete: made.complete && notRead === 0, notRead,",
         new="complete: made.complete, notRead,",
         tests=[LT], pattern='read of the database was cut'),
    dict(id='the-phone-names-each-lookups-read', file='src/copy.ts',
         old="      'lookup.pattern': 'Lookup: when a thing was recorded',\n",
         new="",
         tests=[LT], pattern='has a name on the phone'),
    # ---- Ask in the Worker ------------------------------------------------------------------------------------------
    dict(id='a-lookup-is-served-to-ask-alone', file='worker/src/claude.ts',
         old="  if (url.searchParams.has('lookup')) return reply(403, { error: `the ${t.task} task is served no lookup` })\n",
         new="",
         tests=[AL], pattern='is served to Ask alone'),
    dict(id='a-lookup-counts-as-a-read', file=A,
         old="contextCalls: t.contextCalls + 1, contextBytes: t.contextBytes + bytes })\n  return reply(200, { lookup:",
         new="contextCalls: t.contextCalls, contextBytes: t.contextBytes + bytes })\n  return reply(200, { lookup:",
         tests=[AL], pattern='counts as one of the run'),
    dict(id='a-lookups-size-counts-against-the-run', file=A,
         old="contextCalls: t.contextCalls + 1, contextBytes: t.contextBytes + bytes })\n  return reply(200, { lookup:",
         new="contextCalls: t.contextCalls + 1, contextBytes: t.contextBytes })\n  return reply(200, { lookup:",
         tests=[AL], pattern='counts as one of the run'),
    dict(id='the-twenty-reads-hold-for-a-lookup', file=A,
         old="  if (t.contextCalls >= CONTEXT_CALLS) return reply(429, { error: `at most ${CONTEXT_CALLS} reads a run` })\n  if (t.contextBytes >= CONTEXT_BYTES) return reply(429, { error: `at most ${CONTEXT_BYTES / 1024} KB a run` })\n  const served = await servedSheet(deps, t, { coach: false })\n  if (!served) return reply(409,",
         new="  if (t.contextBytes >= CONTEXT_BYTES) return reply(429, { error: `at most ${CONTEXT_BYTES / 1024} KB a run` })\n  const served = await servedSheet(deps, t, { coach: false })\n  if (!served) return reply(409,",
         tests=[AL], pattern='twenty reads'),
    dict(id='a-refused-query-is-no-read', file=A,
         old="  const q = parseLookupQuery(url, t.day)\n  if (!q.ok) return reply(400, { error: q.reason })\n",
         new="  const q = parseLookupQuery(url, t.day)\n  if (!q.ok) {\n    await deps.store.writeTask({ ...t, contextCalls: t.contextCalls + 1 })\n    return reply(400, { error: q.reason })\n  }\n",
         tests=[AL], pattern='twenty reads'),
    dict(id='the-lookups-are-kept-with-the-served-sheet', file=A,
         old="{ taskAt: t.at, ...served.served, lookups: withLookups(served.served.lookups ?? [], facts) }",
         new="{ taskAt: t.at, ...served.served }",
         tests=[AL], pattern='passes when it cites a lookup'),
    dict(id='an-earlier-lookup-is-kept-beside-a-later-one', file=A,
         old="{ taskAt: t.at, ...served.served, lookups: withLookups(served.served.lookups ?? [], facts) }",
         new="{ taskAt: t.at, ...served.served, lookups: facts }",
         tests=[AL], pattern='counts as one of the run'),
    dict(id='an-id-served-twice-is-kept-once', file=A,
         old="  return [...kept.filter((f) => !ids.has(f.id)), ...more]\n",
         new="  return [...kept, ...more]\n",
         tests=[AL], pattern='keeps an id served twice once'),
    dict(id='the-answer-is-checked-against-the-lookups-too', file=A,
         old="  const extended: FactSheet = lookups.length ? { ...sheet, facts: [...sheet.facts, ...lookups] } : sheet\n",
         new="  const extended: FactSheet = sheet\n",
         tests=[AL], pattern='passes when it cites a lookup'),
    dict(id='a-switch-off-at-the-check-takes-the-fact-away', file=A,
         old="  const lookups = (served.served.lookups ?? []).filter((f) => mayRead(f, access))\n",
         new="  const lookups = served.served.lookups ?? []\n",
         tests=[AL], pattern='turned off between the lookup and the answer'),
    dict(id='a-lookup-is-cut-to-the-runs-room', file=A,
         old="  while (facts.length && bytesOf(JSON.stringify(facts)) > room) facts = facts.slice(0, -1)\n",
         new="",
         tests=[AL], pattern='cuts a lookup to what the run may still read'),
    dict(id='a-lookup-cut-for-size-says-so', file=A,
         old="complete: r.complete && cut === 0, notRead: r.notRead,",
         new="complete: r.complete, notRead: r.notRead,",
         tests=[AL], pattern='cuts a lookup to what the run may still read'),
    dict(id='a-lookups-read-is-logged-under-its-name', file=A,
         old="category: `lookup.${q.query.lookup}`,",
         new="category: 'dayRecord',",
         tests=[AL], pattern='counts as one of the run'),
    dict(id='the-reply-keeps-the-values-with-the-worker', file=A,
         old="facts: facts.map((f) => ({ id: f.id, text: f.text })), complete: r.complete",
         new="facts, complete: r.complete",
         tests=[AL], pattern='counts as one of the run'),
    dict(id='the-cited-lookup-words-are-kept', file=A,
         old="facts: citedFacts(extended, verdict.value.factIds,",
         new="facts: citedFacts(sheet, verdict.value.factIds,",
         tests=[AL], pattern='passes when it cites a lookup'),
    dict(id='the-briefing-lists-the-lookups', file=A,
         old=" lookups: LOOKUPS.map((l) => LOOKUP_HELP[l]),",
         new="",
         tests=[AL], pattern='lists the nine lookups'),
    dict(id='a-categorys-reply-says-whether-it-is-whole', file=A,
         old="truncated: r.truncated, complete: r.complete, notRead: r.notRead, linesLeftOut: r.linesLeftOut, ...(q.category === 'journal' ? { rules: journalRules('line') } : {}) })",
         new="truncated: r.truncated, ...(q.category === 'journal' ? { rules: journalRules('line') } : {}) })",
         tests=[AL], pattern='appears only in a category'),
    dict(id='the-instructions-tell-a-lookups-facts-from-a-categorys-lines', file='worker/src/prompt.ts',
         old=" A lookup's facts (lookup=) each have an id in brackets: cite them in factIds beside the FACTS ids, and a number in a cited lookup fact may be said.",
         new="",
         tests=[AL], pattern='tells the writer'),
    dict(id='the-instructions-send-a-when-question-to-the-table', file='worker/src/prompt.ts',
         old="is answered from the pattern table, never from a count of your own:",
         new="is answered as you see fit:",
         tests=[AL], pattern='tells the writer'),
    dict(id='the-instructions-say-the-standing-rule', file='worker/src/prompt.ts',
         old="\"Most likely\", \"most often\", \"usually\" and \"tends to\" only when a cited cell stands as a steady pattern.",
         new="",
         tests=[AL], pattern='tells the writer'),
    dict(id='the-instructions-say-the-pair-counts-once', file='worker/src/prompt.ts',
         old=" A count written \"7 of 26\" counts as one number for the limits on numbers.",
         new="",
         tests=[AL], pattern='tells the writer'),
    # ---- The phone --------------------------------------------------------------------------------------------------
    dict(id='the-table-is-written-only-when-it-changed', file=PF,
         old="    if (samePatterns(existing, next)) return false\n",
         new="",
         tests=[PFT], pattern='rewritten only when its content changes'),
    dict(id='a-newer-format-is-never-overwritten', file=PF,
         old="    if (raw !== undefined && existing === null && (raw as { format?: unknown }).format !== PATTERNS_FORMAT) return false\n",
         new="",
         tests=[PFT], pattern='never overwrites a stored record of another format'),
    dict(id='a-failed-build-is-kept-as-a-failure', file=PF,
         old="    noteComparisonFault(day, e)\n    return false\n",
         new="    return false\n",
         tests=[PFT], pattern='writes no table when the build throws'),
    dict(id='one-build-after-another', file=PF,
         old="  const next = last.then(() => writePatternsRow(day, now))\n",
         new="  const next = writePatternsRow(day, now)\n",
         tests=[PFT], pattern='one build after another'),
    dict(id='the-table-follows-the-days-sheet', file=PF,
         old="  later(day, now)\n",
         new="",
         tests=[PFT], pattern='one build after another'),
    dict(id='close-moments-make-one-build', file=PF,
         old="  if (waiting) clearTimeout(waiting.timer)\n  const timer",
         new="  const timer",
         tests=[PFT], pattern='one build after another'),
    dict(id='the-table-waits-a-moment-after-the-sheet', file=PF,
         old="export const PATTERNS_AFTER_SHEET_MS = 1500\n",
         new="export const PATTERNS_AFTER_SHEET_MS = 0\n",
         tests=[PFT], pattern='one build after another'),
    dict(id='the-clouds-table-stands-on-a-first-read', file='src/cloudSync.ts',
         old="  patterns: () => false,\n",
         new="",
         tests=[CK], pattern='gives way to the cloud'),
    dict(id='a-lookup-shares-no-head-with-the-sheet', file=R,
         old="'lines', 'forecasts', 'noteWords'] as const",
         new="'lines', 'forecast', 'noteWords'] as const",
         tests=[LT], pattern='share no head with the day'),
    dict(id='a-question-waits-a-short-while-at-most', file=PF,
         old="  await Promise.race([build(day, now), new Promise<void>((resolve) => setTimeout(resolve, waitMs))])\n",
         new="  await build(day, now)\n",
         tests=[PFT], pattern='lets a question go on after a short wait'),
    dict(id='the-wait-is-four-seconds', file=PF,
         old="export const PATTERNS_ASK_WAIT_MS = 4000\n",
         new="export const PATTERNS_ASK_WAIT_MS = 40000\n",
         tests=[PFT], pattern='lets a question go on after a short wait'),
    dict(id='a-question-builds-the-table', file='src/ask/flow.ts',
         old="  await patternsForAsk(blockAt(now).day, now)\n",
         new="",
         tests=[PFT], pattern='lets a question go on after a short wait'),
    dict(id='the-table-counts-the-whole-record', file=PF,
         old="  return { checkins, contexts, items, chips: allOwnChips(settings), offers, outcomes, workoutDays:",
         new="  return { checkins: checkins.slice(0, 50), contexts, items, chips: allOwnChips(settings), offers, outcomes, workoutDays:",
         tests=[PFT], pattern='built from the whole record'),
    dict(id='a-records-key-comes-from-its-stores-schema', file='src/cloudSync.ts',
         old="  return store === 'settings' || db.table(store).schema.primKey.auto ? Number(id) : id\n",
         new="  return store === 'days' || store === 'herSkills' || store === 'facts' ? id : Number(id)\n",
         tests=[CK], pattern='do not stop the syncs after them'),
    dict(id='the-brain-settings-come-back-on-a-new-phone', file='src/cloudSync.ts',
         old="  return store === 'settings' || db.table(store).schema.primKey.auto ? Number(id) : id\n",
         new="  return store === 'days' || store === 'herSkills' || store === 'facts' || store === 'patterns' ? id : Number(id)\n",
         tests=[CK], pattern='come back on a new phone'),
    dict(id='the-settings-record-keeps-its-number', file='src/cloudSync.ts',
         old="  return store === 'settings' || db.table(store).schema.primKey.auto ? Number(id) : id\n",
         new="  return db.table(store).schema.primKey.auto ? Number(id) : id\n",
         tests=[CK], pattern='is a number for a store keyed by a counted id'),
    dict(id='the-table-is-synced', file='src/cloudOutbox.ts',
         old="'pathTests', 'pathTestDays', 'patterns', 'noteMarks']",
         new="'pathTests', 'pathTestDays', 'noteMarks']",
         tests=[CK], pattern='syncs as one row'),
    dict(id='version-28-adds-the-patterns-store', file='src/db.ts',
         old="    this.version(28).stores({\n      patterns: 'id',\n    })\n",
         new="",
         tests=['src/dbMigration28.test.ts'], pattern='version-27 record whole'),
    dict(id='the-export-holds-the-table', file='src/export.ts',
         old="            ...patternsForExport(records.patterns, opts.includePrivate, partner),\n",
         new="",
         tests=[PFT], pattern='is in the export as counts and standings'),
    dict(id='the-exports-note-rides-with-the-table', file='src/export.ts',
         old="        ...(readPatterns(records?.patterns) ? { patternTable: 'patternTable is the table",
         new="        ...(true ? { patternTable: 'patternTable is the table",
         tests=[PFT], pattern='is in the export as counts and standings'),
    dict(id='a-private-kind-stays-out-of-the-export', file='src/export.ts',
         old="table.kinds.filter((k) => (includePrivate || !k.private) && (partner || k.category !== 'partnerPath'))",
         new="table.kinds.filter((k) => partner || k.category !== 'partnerPath')",
         tests=[PFT], pattern='is in the export as counts and standings'),
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
