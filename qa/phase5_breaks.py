"""Phase 5 of the next build (2026-11-13), notes: exact words, and a home for what is noticed in notes. Each rule
undone once, and the test that guards it must turn red.

Whole words: a match needs no letter or digit on either side, whatever the letter case, a phrase's words any space
apart; a search holds one to five words, each said once, of the allowed characters alone; the database is asked for
the longest plain run, or nothing.

The lookup: the reader confirms each candidate on the note's own words; a note with a faith word is not counted while
faith is hidden, and a faith word is not searched; the journal is never read; the whole year is searched unless the
days are given; the read goes on page by page and says when it stopped short; a count names its notes and says what a
count of notes is; by the weekday whole days change places, and one family runs across both splits; too few says what
is needed; a note's fact carries the note's own numbers and faith's tag; the newest thirty are listed; every fact is
read under the notes switch; a note of spaces alone is no note.

The checker: an answer names the words searched; the usual-case words are refused on a note count at every standing
and stay allowed under a steady pattern of the table; a lead is said as a lead with how many were looked at; with no
lead one time is not put ahead of another; the rule is in the check; a note count is an association; "k of n" counts
once beside it.

Ask: the instructions say the rule, and the briefing lists the lookup with its parameters.

What is noticed: a renamed type merges; an id is one type's alone; the stand-in types need an automated browser; an
event stands only with a known type, after the forget moment, with its note in the record holding the quoted words;
one marked wrong leaves every count; one from a kept note counts nowhere; a row half-read is not kept, nor one from
the journal; five make a kind, known only where a note was written, private.

The phone: the marks are synced and the Worker's rows never sent back; the Worker's rows are asked for by name, and a
deleted one leaves; undo deletes the mark; forget writes its record; the table reads what stands; version 29 adds the
two stores; the export says whether an event was marked wrong.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, an empty test list refused, and an id that matches no entry refused.

python phase5_breaks.py [id ...]
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
NW = 'src/noteWords.ts'
NWT = 'src/noteWords.test.ts'
L = 'worker/src/lookups.ts'
NLT = 'worker/src/noteWordsLookup.test.ts'
T = 'worker/src/turso.ts'
W = 'src/counted/words.ts'
BS = 'src/brainShared.ts'
NWW = 'src/noteWordsWording.test.ts'
P = 'worker/src/prompt.ts'
AL = 'worker/src/askLookups.test.ts'
TY = 'src/noteEvents/types.ts'
J = 'src/noteEvents/join.ts'
SH = 'src/noteEvents/shared.ts'
NET = 'src/noteEvents/noteEvents.test.ts'
K = 'src/counted/kinds.ts'
F = 'src/noteEvents/flow.ts'
NFT = 'src/noteEventsFlow.test.ts'
CS = 'src/cloudSync.ts'
CO = 'src/cloudOutbox.ts'
PF = 'src/patternsFlow.ts'
EX = 'src/export.ts'

TABLE = [
    # Whole words.
    dict(id='no-letter-before-the-word', file=NW,
         old=r"`(?<![\\p{L}\\p{N}])${parts.join('\\s+')}",
         new=r"`${parts.join('\\s+')}",
         tests=[NWT], pattern='is found only where no letter or digit stands beside it'),
    dict(id='no-letter-after-the-word', file=NW,
         old=r"${parts.join('\\s+')}(?![\\p{L}\\p{N}])`",
         new=r"${parts.join('\\s+')}`",
         tests=[NWT], pattern='is found only where no letter or digit stands beside it'),
    dict(id='letter-case-aside', file=NW,
         old=r"(?![\\p{L}\\p{N}])`, 'iu')",
         new=r"(?![\\p{L}\\p{N}])`, 'u')",
         tests=[NWT], pattern='is found whatever its letter case'),
    dict(id='a-phrases-words-any-space-apart', file=NW,
         old=r"parts.join('\\s+')",
         new=r"parts.join(' ')",
         tests=[NWT], pattern='is a phrase whose words may be any space apart'),
    dict(id='five-words-at-most', file=NW,
         old="  if (words.length > NOTE_WORDS_MOST) return",
         new="  if (words.length > 99) return",
         tests=[NWT], pattern='are refused when there are none'),
    dict(id='the-allowed-characters-alone', file=NW,
         old="    if (!WORD.test(word)) return { ok: false, reason: 'a word or phrase holds letters, digits, spaces, apostrophes and hyphens only' }\n",
         new="",
         tests=[NWT], pattern='are refused when there are none'),
    dict(id='a-word-said-once', file=NW,
         old="    if (!words.some((w) => w.toLowerCase() === word.toLowerCase())) words.push(word)\n",
         new="    words.push(word)\n",
         tests=[NWT], pattern='each said once'),
    dict(id='the-database-is-asked-for-a-plain-run-of-two', file=NW,
         old="  return longest.length >= 2 ? longest : null\n",
         new="  return longest || null\n",
         tests=[NWT], pattern='is the longest run of plain letters'),

    # The lookup.
    dict(id='the-reader-confirms-each-candidate', file=L,
         old="        if (r.day && note && holds(note) && (faith || !FAITH_WORDS.test(note))) found.set(",
         new="        if (r.day && note && (faith || !FAITH_WORDS.test(note))) found.set(",
         tests=[NLT], pattern='counts a note that holds the word whole'),
    dict(id='a-faith-note-is-not-counted-while-faith-is-hidden', file=L,
         old="        if (r.day && note && holds(note) && (faith || !FAITH_WORDS.test(note))) found.set(",
         new="        if (r.day && note && holds(note)) found.set(",
         tests=[NLT], pattern='with faith hidden neither counts nor serves'),
    dict(id='a-faith-word-is-not-searched', file=L,
         old="  if (!faith && q.words.some((w) => FAITH_WORDS.test(w))) return { facts: [], complete: true, notRead: 0, note: 'these words are not searched while faith is hidden' }\n",
         new="",
         tests=[NLT], pattern='with faith hidden neither counts nor serves'),
    dict(id='the-journal-is-never-read', file=L,
         old="  const kept: { day: string; text: string }[] = []\n",
         new="  const kept: { day: string; text: string }[] = []\n  await x.store.readRecords('journal', { from: q.from, to: q.to }, 1)\n",
         tests=[NLT], pattern='never reads the journal'),
    dict(id='the-whole-year-unless-told', file=L,
         old="addDays(day, lookup === 'noteWords' ? -REACH_DAYS : -30)",
         new="addDays(day, -30)",
         tests=[NLT], pattern='takes the words, and searches the whole year'),
    dict(id='the-read-goes-on-page-by-page', file=L,
         old="      to = oldest\n",
         new="      break\n",
         tests=[NLT], pattern='reads on, page by page'),
    dict(id='more-notes-than-it-counts-among-says-so', file=L,
         old="  let complete = moments.length <= NOTE_MOMENTS\n",
         new="  let complete = true\n",
         tests=[NLT], pattern='more check-ins hold a note than it counts among'),
    dict(id='pages-that-ran-out-say-how-many-rows-were-left', file=L,
         old="        tally.cuts.push({ store: 'checkins', range: { from: q.from, to, like }, limit: NOTE_PAGE })\n",
         new="",
         tests=[NLT], pattern='outrun its pages'),
    dict(id='a-count-names-its-notes', file=L,
         old="    return ` The notes: ${first}${rows.length > NOTES_NAMED ? `, and ${rows.length - NOTES_NAMED} more` : ''}.`\n",
         new="    return first ? '' : ''\n",
         tests=[NLT], pattern='says how many notes hold the words of all the notes written'),
    dict(id='a-count-says-what-a-count-of-notes-is', file=L,
         old=" This counts notes, a share of the times you wrote one, never how often the thing happened: a note shows when it was written, not when the thing happened.",
         new="",
         tests=[NLT], pattern='says how many notes hold the words of all the notes written'),
    dict(id='by-the-weekday-whole-days-change-places', file=L,
         old="{ split: 'weekday', within: 'stretch',",
         new="{ split: 'weekday', within: 'day',",
         tests=[NLT], pattern='sets when the notes holding the words were written'),
    dict(id='one-family-across-both-splits', file=L,
         old="  const stood = standings(rates.map((c) => c.rate))\n  const family = stood[0]?.family ?? 0\n  const words = q.words.join('|')",
         new="  const stood = splits.flatMap((s) => standings(rates.filter((c) => c.split === s.split).map((c) => c.rate)))\n  const family = stood[0]?.family ?? 0\n  const words = q.words.join('|')",
         tests=[NLT], pattern='sets when the notes holding the words were written'),
    dict(id='too-few-says-what-is-needed', file=L,
         old="family, words, ...(family === 0 ? { minSide: MIN_SIDE, minOccurrences: MIN_OCCURRENCES } : {}),",
         new="family, words,",
         tests=[NLT], pattern='answers too few to compare'),
    dict(id='a-notes-fact-carries-the-notes-own-numbers', file=L,
         old="faith: FAITH_WORDS.test(r.note), values: { words, ...saidIn(r.note) } })),",
         new="faith: FAITH_WORDS.test(r.note), values: { words } })),",
         tests=[AL], pattern='refuses a number the note holds'),
    dict(id='a-faith-note-carries-faiths-tag', file=L,
         old="faith: FAITH_WORDS.test(r.note), values: { words, ...saidIn(r.note) } })),",
         new="faith: false, values: { words, ...saidIn(r.note) } })),",
         tests=[NLT], pattern='with faith hidden neither counts nor serves'),
    dict(id='the-newest-thirty-are-listed', file=L,
         old="    listed.slice(0, NOTES_SERVED).map((r) => (",
         new="    listed.map((r) => (",
         tests=[NLT], pattern='reads on, page by page'),
    dict(id='the-count-is-read-under-the-notes-switch', file=L,
         old="      'notes',\n      { holding: K,",
         new="      'dayRecord',\n      { holding: K,",
         tests=[NLT], pattern='serves nothing with the notes switch off'),
    dict(id='a-note-of-spaces-is-no-note', file=T,
         old=r".filter((r) => typeof r.body?.extras?.note === 'string' && r.body.extras.note.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '') !== '')",
         new=".filter((r) => typeof r.body?.extras?.note === 'string')",
         tests=[NLT], pattern='counts only notes'),
    dict(id='a-cell-sets-the-share-beside-all-notes', file=W,
         old="  const counts = `of the ${w.k + w.restK} notes that hold ${w.words}, ${w.k} were written ${w.where}; of all ${w.n + w.m} notes, ${w.n} were written ${w.where}`\n",
         new="  const counts = `of the ${w.k + w.restK} notes that hold ${w.words}, ${w.k} were written ${w.where}`\n",
         tests=[NLT], pattern='sets when the notes holding the words were written'),

    # The checker.
    dict(id='the-answer-names-the-words-searched', file=BS,
         old="  if (words.length && !words.some((w) => holdsWords(text, w))) out.push(",
         new="  if (words.length > 99) out.push(",
         tests=[NWW], pattern='asks the answer to name at least one of the words searched'),
    dict(id='a-note-pattern-licenses-no-usual-word', file=BS,
         old="  if (usualSaid && table < STANDING_RANK.pattern) out.push(",
         new="  if (usualSaid && table < STANDING_RANK.pattern && !cited.some((f) => rank(f) >= STANDING_RANK.pattern)) out.push(",
         tests=[NWW], pattern='refuses each usual-case word at every standing'),
    dict(id='a-table-pattern-keeps-the-usual-words', file=BS,
         old="  if (usualSaid && table < STANDING_RANK.pattern) out.push(",
         new="  if (usualSaid) out.push(",
         tests=[NWW], pattern='refuses each usual-case word at every standing'),
    dict(id='a-note-lead-is-said-as-a-lead', file=BS,
         old="""out.push('cites a count of notes that stands at a lead without saying so: say "a lead"')""",
         new="void 0",
         tests=[NWW], pattern='lets one time be put ahead of another under a steady pattern'),
    dict(id='a-note-lead-says-how-many-were-looked-at', file=BS,
         old="    if (looked.length && !looked.some((n) => saysNumber(text, n))) out.push(",
         new="    if (looked.length > 99) out.push(",
         tests=[NWW], pattern='lets one time be put ahead of another under a steady pattern'),
    dict(id='no-note-lead-refuses-one-time-ahead', file=BS,
         old="  const aheadSaid = found(AHEAD_WORDS, text, all)\n",
         new="  const aheadSaid = found(/never-a-word-of-the-answer/, text, all)\n",
         tests=[NWW], pattern='with no lead cited refuses'),
    dict(id='the-notes-rule-is-in-the-check', file=BS,
         old="  if (factIds.some(isNoteWordsFact)) out.push(...noteWordsRefusals(text, factIds, sheet, all))\n",
         new="",
         tests=[AL], pattern='refuses an answer that does not name the word searched'),
    dict(id='a-note-count-is-an-association', file=BS,
         old=" || isTableFact(id) || isNoteWordsFact(id)\n}",
         new=" || isTableFact(id)\n}",
         tests=[NWW], pattern='knows its facts by their head'),
    dict(id='a-pair-counts-once-beside-a-note-count', file=BS,
         old="factIds.some((id) => isTableFact(id) || isNoteWordsFact(id))",
         new="factIds.some((id) => isTableFact(id))",
         tests=[NWW], pattern='once for the voice where a search of the notes is cited'),

    # Ask.
    dict(id='the-instructions-say-to-name-the-words', file=P,
         old="and name the words searched in the answer. What it gives is counts of notes",
         new="What it gives is counts of notes",
         tests=[AL], pattern='tells the writer how a lookup'),
    dict(id='the-instructions-say-day-never-date', file=P,
         old=' Write "day" for a calendar day, never "date": "no" or "not" beside "date" is read as dating and refused.`,',
         new='`,',
         tests=[AL], pattern='tells the writer how a lookup'),
    dict(id='the-briefing-says-the-lookups-parameters', file=L,
         old="  noteWords: 'lookup=noteWords&q=<one to five words or phrases, separated by commas> (optional from=&to=):",
         new="  noteWords: 'lookup=noteWords&q= (optional from=&to=):",
         tests=[AL], pattern='lists the nine lookups'),

    # What is noticed: the list, the row, the join.
    dict(id='a-rename-merges', file=TY,
         old=" ?? list.find((t) => t.was?.includes(id)) ?? null",
         new=" ?? null",
         tests=[NET], pattern='reads an event stored under an earlier id'),
    dict(id='an-id-is-one-types-alone', file=TY,
         old="      if (other !== undefined) faults.push(`${id}: named by ${other} and by ${t.id}`)\n",
         new="",
         tests=[NET], pattern='says what is wrong with a list'),
    dict(id='the-stand-ins-need-an-automated-browser', file=TY,
         old="g.navigator?.webdriver === true && g.localStorage?.getItem(STAND_IN_TYPES_KEY) === '1'",
         new="g.localStorage?.getItem(STAND_IN_TYPES_KEY) === '1'",
         tests=[NET], pattern='only by an automated browser holding the test key'),
    dict(id='an-unknown-type-stands-nowhere', file=J,
         old="    const type = eventTypeOf(event.type, types)\n",
         new="    const type = eventTypeOf(event.type, types) ?? types[0]\n",
         tests=[NET], pattern='drops an event of a type the list does not know'),
    dict(id='what-was-forgotten-stands-nowhere', file=J,
         old="    if (forget && event.noticedAt <= forget) continue\n",
         new="",
         tests=[NET], pattern='drops everything noticed up to the forget moment'),
    dict(id='the-forget-moment-itself-is-forgotten', file=J,
         old="event.noticedAt <= forget",
         new="event.noticedAt < forget",
         tests=[NET], pattern='drops everything noticed up to the forget moment'),
    dict(id='the-note-must-hold-the-quoted-words', file=J,
         old="    if (typeof note !== 'string' || !note.includes(quote)) continue\n",
         new="    if (typeof note !== 'string') continue\n",
         tests=[NET], pattern='no longer holds the quoted words'),
    dict(id='the-note-must-be-in-the-record', file=J,
         old="    if (typeof note !== 'string' || !note.includes(quote)) continue\n",
         new="    if (typeof note === 'string' && !note.includes(quote)) continue\n",
         tests=[NET], pattern='whose note is gone from the record'),
    dict(id='a-wrong-mark-leaves-every-count', file=J,
         old="  return all.filter((n) => !n.wrong && n.checkinId !== null",
         new="  return all.filter((n) => n.checkinId !== null",
         tests=[NET], pattern='keeps an event marked wrong in view'),
    dict(id='a-kept-notes-event-counts-nowhere', file=J,
         old="  return all.filter((n) => !n.wrong && n.checkinId !== null && Number.isFinite(n.checkinId)).map(",
         new="  return all.filter((n) => !n.wrong).map(",
         tests=[NET], pattern='shows an event from a kept note and counts it nowhere'),
    dict(id='a-row-half-read-is-not-kept', file=SH,
         old="  if (!id || !n || !type || !quote || !noticedAt || !method || Number.isNaN(Date.parse(noticedAt))) return null\n",
         new="  if (!id || !n || !type || !noticedAt || !method) return null\n",
         tests=[NET], pattern='is not kept when any part is missing or malformed'),
    dict(id='the-journal-is-no-notes-store', file=SH,
         old="  const store = n.store === 'checkins' || n.store === 'notes' ? n.store : null\n",
         new="  const store = typeof n.store === 'string' ? (n.store as 'checkins') : null\n",
         tests=[NET], pattern='is not kept when any part is missing or malformed'),
    dict(id='five-make-a-kind', file=K,
         old="    if (at.size < NOTICED_MIN) continue\n",
         new="    if (at.size < 1) continue\n",
         tests=[NET], pattern='needs five standing events'),
    dict(id='known-only-where-a-note-was-written', file=K,
         old="      known: (o) => typeof o.checkin.extras?.note === 'string' && o.checkin.extras.note.trim() !== '',\n",
         new="      known: () => true,\n",
         tests=[NET], pattern='known only where a note was written'),
    dict(id='a-noticed-kind-is-private', file=K,
         old="      category: 'notes',\n      private: true,\n      known: (o) => typeof",
         new="      category: 'notes',\n      private: false,\n      known: (o) => typeof",
         tests=[NET], pattern='known only where a note was written'),

    # The phone.
    dict(id='the-marks-are-synced', file=CO,
         old="'pathTestDays', 'patterns', 'noteMarks']",
         new="'pathTestDays', 'patterns']",
         tests=[NFT], pattern='is the phone’s own record'),
    dict(id='the-workers-rows-are-never-sent-back', file=CO,
         old="'pathTestDays', 'patterns', 'noteMarks']",
         new="'pathTestDays', 'patterns', 'noteMarks', 'noteEvents']",
         tests=[NFT], pattern='is the phone’s own record'),
    dict(id='the-workers-rows-are-asked-for-by-name', file=CS,
         old="PATH_JOBS_STORE, GENERATED_STORE, NOTE_EVENTS_STORE]",
         new="PATH_JOBS_STORE, GENERATED_STORE]",
         tests=[NFT], pattern='are asked for by name with its other rows'),
    dict(id='a-deleted-row-leaves-the-phone', file=CS,
         old="          const event = row.deleted || !row.body ? null : noteEventOf(row.id, row.body)\n          if (event) await db.noteEvents.put(event)\n          else await db.noteEvents.delete(row.id)\n",
         new="          const event = !row.body ? null : noteEventOf(row.id, row.body)\n          if (event) await db.noteEvents.put(event)\n",
         tests=[NFT], pattern='are asked for by name with its other rows'),
    dict(id='undo-deletes-the-mark', file=F,
         old="    await db.noteMarks.delete(id)\n    return\n",
         new="    return\n",
         tests=[NFT], pattern='is the phone’s own record'),
    dict(id='forget-writes-its-record', file=F,
         old="  await db.noteMarks.put({ id: FORGET_ID, kind: 'forget', at, updatedAt: at })\n",
         new="",
         tests=[NFT], pattern='forgets everything noticed up to a moment'),
    dict(id='the-table-reads-what-stands', file=PF,
         old="  const noticed = countedNotices(noticedOf({ events, marks, checkins, kept }))\n",
         new="  const noticed = countedNotices(noticedOf({ events, marks: [], checkins, kept }))\n",
         tests=[NFT], pattern='hand the pattern table a kind once five stand'),
    dict(id='version-29-adds-the-two-stores', file='src/db.ts',
         old="    this.version(29).stores({\n      noteEvents: 'id',\n      noteMarks: 'id',\n    })\n",
         new="",
         tests=['src/dbMigration29.test.ts'], pattern='version-28 record whole'),
    dict(id='the-export-says-what-was-marked-wrong', file=EX,
         old="  const all = noticedOf({ events: noticed.events, marks: noticed.marks, checkins, kept })\n",
         new="  const all = noticedOf({ events: noticed.events, marks: [], checkins, kept })\n",
         tests=[NFT], pattern='lists what stands, with your own words'),
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
