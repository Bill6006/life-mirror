"""Phase 3 of the next build (2026-11-12), the standard takes over the existing comparisons: each rule undone once, and
the test that guards it must turn red. So far, the sheet's associations (the phase is not finished or shipped).

Every association the sheet carries is one family; a fact is written from its standing; too few is "little" in the old
three-valued field and says no difference; "promising" there is only ever a lead or a pattern in the good direction; and
a comparison on a scale of steps says a lead at most. The phone's own lines that state a difference speak only at a
lead or a pattern, say which, and take the higher strength only at a pattern.

Best days: each condition is counted only over the days the record can speak for it, every condition is one family, a
list shows up to four that stand at a lead, the largest difference first, and a lead is the most it says.

The brief's last-night line: its comparison is a member of the sheet's family, counted once; the card, the sheet's
last-night fact and the sheet's own fact give it one standing; too few says no reading; the chance is kept only for
the very occasions it was computed from; and a failed pass leaves the sheet without association facts, with the
error's name alone riding it.

Firmness: an association is a pattern only at a steady pattern, and tentative below it, last night's line and a
private item alike. Evidence explains the four words; the hard session's and the weather's facts say each standing.

The caffeine comparisons: compared only from fifteen in each of the two groups across six weeks, a lead at most for
next-night sleep, no reading while too few, members of the sheet's family, and the phone's line only at a lead.

The check-in's answers and the move card's private line: read from the sheet's own family, your own chips among your own
chips, the afternoon's something sweet from the afternoons' comparison; a reading only past too few, each part of the
nature answer on its own standing; too few said in the standard's own word, a failed read never called too few; the
move card's line only while private items are in selection and only at its own check-in.

The Worker's instructions: the day's line and the weekly review are told how a comparison stands and that a lead is
tentative; Adaptive is Supportive only below a steady pattern, as the shared check allows; Ask's are left as they were.

The comparisons' guard, completed: the evidence's arithmetic, best days, the sixteen pairs and your own chips each run
under it; the read after a failure asks no chance; a failed evidence says so, leaves no family and no best-days fact.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, an empty test list refused, and an id that matches no entry refused.

python phase3_breaks.py [id ...]
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
F = 'src/facts.ts'
T = 'src/sheetStandings.test.ts'
S = 'src/situations.ts'
E = 'src/evidenceFlow.ts'
B = 'src/beforeDays.ts'
BT = 'src/beforeDays.test.ts'
PE = 'src/passiveEvidence.test.ts'
ST = 'src/situations.test.ts'
FG = 'src/firmGated.test.ts'
SIM = 'src/counted/simulation.test.ts'
O = 'src/counted/occasions.ts'
OT = 'src/counted/occasions.test.ts'
K = 'src/counted/kinds.ts'
KT = 'src/counted/kinds.test.ts'
TB = 'src/counted/table.ts'
TT = 'src/counted/table.test.ts'
A = 'src/associations.ts'
LT = 'src/counted/likeForLike.test.ts'
W = 'src/counted/words.ts'
WT = 'src/counted/words.test.ts'
WK = 'src/weekly.ts'
WKT = 'src/weekly.test.ts'
WF = 'src/weeklyFacts.ts'
WFT = 'src/weeklyFacts.test.ts'
C = 'src/counted/compare.ts'
AWT = 'src/associationWords.test.ts'
AW = 'src/associationWords.ts'
FM = 'src/firmness.ts'
CR = 'src/caffeineRecord.ts'
NM = 'src/counted/named.ts'
CRT = 'src/caffeineRecord.test.ts'
FMT = 'src/firmness.test.ts'
BF = 'src/brainFlow.ts'
KT2 = 'src/keptChance.test.ts'
AFT = 'src/assocFault.test.ts'
FT = 'src/counted/fault.ts'
CA = 'src/checkinAnswers.ts'
CAT = 'src/checkinAnswers.test.ts'
CG = 'src/comparisonGuard.test.ts'
WST = 'worker/src/standings.test.ts'

TABLE = [
    dict(id='promising-is-only-the-good-direction', file=A,
         old="return (standing === 'lead' || standing === 'pattern') && helpful ? 'promising' : 'unclear'",
         new="return standing === 'lead' || standing === 'pattern' ? 'promising' : 'unclear'",
         tests=[T], pattern='used to say unclear'),
    dict(id='too-few-is-little', file=A,
         old="  if (standing === 'tooFew') return 'little'",
         new="  if (standing === 'tooFew') return 'unclear'",
         tests=[T], pattern='tapped three times'),
    dict(id='the-sheet-is-one-family', file=F,
         old="  return new Map(standings(family).map((s) => [",
         new="  return new Map(family.flatMap((c) => standings([c])).map((s) => [",
         tests=[T], pattern='one of a family'),
    dict(id='steps-say-a-lead-at-most', file=F,
         old="stepScale(s.id) && s.standing === 'pattern' ? { ...s, standing: 'lead' as const } : s",
         new="s",
         tests=[T], pattern='a lead at most'),
    dict(id='too-few-says-no-difference', file=W,
         old="  if (w.standing === 'tooFew' || w.diff === null) return ",
         new="  if (w.diff === null) return ",
         tests=[T], pattern='tapped three times'),
    dict(id='a-comparison-nobody-named-has-no-chance', file=A,
         old="  if (named) out.compared = { ...namedComparison(occasions, named), diff }",
         new="  out.compared = { ...namedComparison(occasions, named ?? { id: 'unnamed', worth: 10 }), diff }",
         tests=[T], pattern='one of a family'),
    dict(id='a-line-speaks-only-at-a-lead-or-a-pattern', file=S,
         old="&& standings.includes(String(f.values.standing)) ? f : null",
         new="? f : null",
         tests=[ST], pattern='reads the chips like for like'),
    dict(id='the-higher-strength-is-a-patterns', file=S,
         old="strength: f.values.standing === 'pattern' ? 0.8 : 0.5,",
         new="strength: 0.8,",
         tests=[FG], pattern='says every situation exactly as before'),
    dict(id='no-clear-pattern-says-no-direction-for-short-sleep', file=S,
         old="strength: f.values.standing === 'pattern' ? 0.8 : 0.55,",
         new="strength: f.values.standing !== 'pattern' ? 0.8 : 0.55,",
         tests=[FG], pattern='says every situation exactly as before'),
    dict(id='a-card-says-a-lead-at-most', file=E,
         old="const standing: Standing = !s ? 'tooFew' : s.standing === 'pattern' ? 'lead' : s.standing",
         new="const standing: Standing = !s ? 'tooFew' : s.standing",
         tests=[PE], pattern='a lead is the most a card says'),
    dict(id='a-card-done-three-times-is-little', file=E,
         old="return { card, association, standing, tier: tierFor(standing,",
         new="return { card, association, standing, tier: association.times >= 3 && (association.diff ?? 0) >= 10 ? 'promising' : tierFor(standing,",
         tests=[PE], pattern='done three times'),
    dict(id='a-pair-has-its-standing', file=B,
         old="Object.assign(pairs[i], { standing: s.standing, direction: s.direction, family: s.family })",
         new="Object.assign(pairs[i], { direction: s.direction, family: s.family })",
         tests=[BT], pattern='its standing among the sixteen'),
    dict(id='tonight-shows-only-a-lead-or-a-pattern', file=B,
         old=" && (p.standing === 'lead' || p.standing === 'pattern'))",
         new=")",
         tests=[BT], pattern='after an evening with stress high'),
    dict(id='best-days-says-a-lead-at-most', file=WK,
         old="const capped = (standing: Standing): Standing => (standing === 'pattern' ? 'lead' : standing)",
         new="const capped = (standing: Standing): Standing => standing",
         tests=[WKT], pattern='says a lead at most'),
    dict(id='best-days-shows-only-what-stands-at-a-lead', file=WK,
         old="      .filter((d) => d.standing === 'lead' || d.standing === 'pattern')\n",
         new="",
         tests=[WKT], pattern='once it stands at a lead'),
    dict(id='best-days-counts-only-the-days-the-record-can-speak-for', file=WK,
         old="      if (!d || !c.known(d)) continue",
         new="      if (!d) continue",
         tests=[WKT], pattern='only over the days the record can speak for it'),
    dict(id='best-days-is-one-family', file=WK,
         old="  const stood = standings(cells)",
         new="  const stood = cells.flatMap((c) => standings([c]))",
         tests=[WKT], pattern='says where each stands'),
    dict(id='best-days-shows-four-at-most', file=WK,
         old="      .slice(0, 4)",
         new="      .slice(0, 5)",
         tests=[WKT], pattern='at most four in a list'),
    dict(id='best-days-largest-difference-first', file=WK,
         old="Math.abs(share(b)) - Math.abs(share(a)))",
         new="Math.abs(share(a)) - Math.abs(share(b)))",
         tests=[WKT], pattern='at most four in a list'),
    dict(id='best-days-needs-eight-best-days', file=C,
         old="  const enough = cells.map((_, i) => sizes[i] >= MIN_SIDE && ",
         new="  const enough = cells.map((_, i) => sizes[i] >= 7 && ",
         tests=[WKT], pattern='fewer than eight days'),
    dict(id='best-days-fact-says-how-many-were-compared', file=WF,
         old="on the best days and on the rest; ${compared}. What you control:",
         new="on the best days and on the rest. What you control:",
         tests=[WFT], pattern='a faith practice and a Social path rep'),
    dict(id='best-days-fact-says-each-standing', file=W,
         old="      return `${w.thing}: ${counts}, ${often} on the best days (${said('lead')})`",
         new="      return `${w.thing}: ${counts}`",
         tests=[WFT], pattern='a faith practice and a Social path rep'),
    dict(id='a-comparison-is-one-member-of-the-family', file=F,
         old="a?.compared && !seen.has(a.compared.id) && seen.add(a.compared.id) ? [a.compared] : []",
         new="a?.compared ? [a.compared] : []",
         tests=[AWT], pattern='one standing on the brief'),
    dict(id='last-night-says-no-reading-when-too-few', file=F,
         old="  const compared = s.standing !== 'tooFew' && a.diff !== null",
         new="  const compared = a.diff !== null",
         tests=[AWT], pattern='once evenings like it and evenings without it started the same'),
    dict(id='last-night-fact-says-its-standing', file=F,
         old="      : `Last night carried ${event}. ${withWords({ thing: event, after: 'Mornings after', unit: 'points', n: s.n, m: s.m, diff: a.diff, likeForLike: true, standing: s.standing,",
         new="      : `Last night carried ${event}. ${withWords({ thing: event, after: 'Mornings after', unit: 'points', n: s.n, m: s.m, diff: a.diff, likeForLike: true, standing: 'noPattern',",
         tests=[AWT], pattern='one standing on the brief'),
    dict(id='last-night-line-reads-the-family', file=BF,
         old="  return { ...brief, night: family ? nightStanding(family, key) : null }",
         new="  return { ...brief, night: family ? { ...nightStanding(family, key), standing: 'lead' as const } : null }",
         tests=[AWT], pattern='one standing on the brief'),
    dict(id='church-morning-speaks-only-at-a-lead-or-a-pattern', file=S,
         old="      return f && stands && str(f, 'key') === 'churchDay'",
         new="      return f && str(f, 'key') === 'churchDay'",
         tests=[ST], pattern='only at a lead or a pattern'),
    dict(id='the-chance-is-kept-only-for-the-same-occasions', file=NM,
         old="  if (kept && kept.from === from) return kept.compared",
         new="  if (kept) return kept.compared",
         tests=[KT2], pattern='worked out again'),
    dict(id='the-chance-is-kept', file=NM,
         old="  keptChance.set(named.id, { from, compared })",
         new="",
         tests=[KT2], pattern='worked out once'),
    dict(id='a-failed-pass-rides-the-sheet', file=BF,
         old="  if (compared) sheet.assocFault = compared\n",
         new="",
         tests=[AFT], pattern='rides it by its name alone'),
    dict(id='a-failed-pass-keeps-the-name-alone', file=FT,
         old="    const name = e instanceof Error && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : 'Error'",
         new="    const name = e instanceof Error ? e.message : 'Error'",
         tests=[AFT], pattern='rides it by its name alone'),
    dict(id='a-failed-pass-says-no-reading', file='src/associationWords.ts',
         old="  if (!night) return fill(c.lastNightOnly, { event })",
         new="  if (!night) return fill(c.lastNight, { event, n: String(ln.n), m: '0', standing: '', points: '0 points', dir: c.higher })",
         tests=[AFT], pattern='no reading'),
    dict(id='an-association-is-a-pattern-only-at-a-steady-pattern', file=FM,
         old="  if (isAssociationFact(f)) return v.standing === 'pattern'",
         new="  if (isAssociationFact(f)) return v.standing === 'pattern' || v.standing === 'lead'",
         tests=[FMT], pattern='only at a steady pattern'),
    dict(id='an-association-stays-tentative-below-a-pattern', file=FM,
         old="  if (isAssociationFact(f)) return !isPatternFact(f)",
         new="  if (isAssociationFact(f)) return false",
         tests=[FMT], pattern='only at a steady pattern'),
    dict(id='last-night-and-a-private-item-are-associations', file=FM,
         old="f.id.startsWith('assoc.') || f.id.startsWith('private.') || f.id === 'lastNight'",
         new="f.id.startsWith('assoc.')",
         tests=[FMT], pattern='a private item alike'),
    dict(id='evidence-explains-the-four-words', file='src/copy.ts',
         old="      'A steady pattern: past chance after that allowance too.',\n",
         new="",
         tests=[WT], pattern='explained on Evidence'),
    dict(id='evidence-names-the-day-the-rule-changed', file='src/copy.ts',
         old="    standardSince: 'Since 13 November 2026 every comparison",
         new="    standardSince: 'Since 12 November 2026 every comparison",
         tests=[WT], pattern='explained on Evidence'),
    dict(id='a-hard-session-says-each-standing', file=F,
         old="steps (${lower(STANDING_WORDS[s.standing])})`}`)",
         new="steps`}`)",
         tests=[T], pattern='a hard session’s readings'),
    dict(id='the-weather-says-its-standing', file=F,
         old="none : said(diff, lower(STANDING_WORDS[s.standing])),",
         new="none : said(diff, 'unclear'),",
         tests=[T], pattern='the weather’s two comparisons'),
    dict(id='caffeine-is-compared-from-fifteen-a-group-across-six-weeks', file=CR,
         old="    const floor = groups[0].n >= STRONG_PER_GROUP && groups[groups.length - 1].n >= STRONG_PER_GROUP && weeks >= STRONG_WEEKS\n    compared = {",
         new="    const floor = true\n    compared = {",
         tests=[CRT], pattern='too few under fifteen a group or six weeks'),
    dict(id='caffeine-word-is-promising-only-the-good-way', file=CR,
         old="  return own.some((x) => x.stands === 'lead' && x.good) ? 'promising' : 'unclear'",
         new="  return own.some((x) => x.stands === 'lead') ? 'promising' : 'unclear'",
         tests=[CRT], pattern='too few under fifteen a group or six weeks'),
    dict(id='caffeine-sleep-says-a-lead-at-most', file=F,
         old=" || id.startsWith('assoc.caffeine.bands.') || id.startsWith('assoc.caffeine.latest.')",
         new="",
         tests=[CRT], pattern='a lead at most for next-night sleep'),
    dict(id='caffeine-too-few-says-no-reading', file=F,
         old="    const minutes = c.hoursDiff === null || hoursAt === 'tooFew' ? null : Math.round(c.hoursDiff * 60)",
         new="    const minutes = c.hoursDiff === null ? null : Math.round(c.hoursDiff * 60)",
         tests=[CRT], pattern='a lead at most for next-night sleep'),
    dict(id='caffeine-joins-the-sheets-family', file=F,
         old="caffeine.byMorningBand.compared, caffeine.reported.compared].map((compared) => ({ compared })),",
         new="caffeine.byMorningBand.compared, caffeine.reported.compared].map(() => ({ compared: null })),",
         tests=[CRT], pattern='joins the sheet’s family'),
    dict(id='the-phone-speaks-of-caffeine-only-at-a-lead', file=S,
         old="const said = minutes !== null && minutes <= -30 && hoursAt ? {",
         new="const said = minutes !== null && minutes <= -30 ? {",
         tests=[ST], pattern='speaks of caffeine from reported bands only'),
    dict(id='a-lead-never-raises-the-caffeine-lines-rank', file=S,
         old="strength: said.standing === 'pattern' ? 0.8 : 0.5, vars: { what: said.what,",
         new="strength: 0.8, vars: { what: said.what,",
         tests=[FG], pattern='says every situation exactly as before'),
    dict(id='the-minimum-is-eight-matched-occasions-a-side', file=NM,
         old="  const tested = !chanceOff && floor && n >= MIN_SIDE && m >= MIN_SIDE ? comparedOnce(occasions, named) : null",
         new="  const tested = !chanceOff && floor ? comparedOnce(occasions, named) : null",
         tests=[LT], pattern='under eight matched evenings a side'),
    dict(id='the-workers-report-reads-the-comparisons-failures', file='worker/src/engineReport.ts',
         old=", associations: newest?.sheet.assocFault ?? null }",
         new=", associations: null }",
         tests=['worker/src/engineReport.test.ts'], pattern='the comparisons’ own failures'),
    dict(id='a-line-on-evidence-says-no-reading-when-too-few', file=AW,
         old="  if (!s || s.standing === 'tooFew' || !likeForLikeMatched(a) || a.diff === null) return null",
         new="  if (!s || !likeForLikeMatched(a) || a.diff === null) return null",
         tests=[AWT], pattern='only with where the comparison stands'),
    dict(id='a-line-on-evidence-says-no-reading-when-the-pass-failed', file=AW,
         old="  if (!s || s.standing === 'tooFew' || !likeForLikeMatched(a) || a.diff === null) return null",
         new="  if (s?.standing === 'tooFew' || !likeForLikeMatched(a) || a.diff === null) return null",
         tests=[AWT], pattern='only with where the comparison stands'),
    dict(id='a-passive-line-says-no-reading-when-too-few', file=AW,
         old="  if (failed || !likeForLikeMatched(a) || standing === 'tooFew') return fill(c.passiveUnmatched",
         new="  if (failed || !likeForLikeMatched(a)) return fill(c.passiveUnmatched",
         tests=[AWT], pattern='only with where the comparison stands'),
    dict(id='a-hard-reading-too-few-is-not-said', file=AW,
         old="=> at(m) !== undefined && at(m)?.standing !== 'tooFew'",
         new="=> at(m) !== undefined",
         tests=[AWT], pattern='says hard sessions against mornings that ended the same'),
    dict(id='a-pair-is-a-steady-pattern-only-with-its-interval-to-one-side', file=B,
         old="  for (const p of pairs) if (p.standing === 'pattern' && (p.lo === null || p.hi === null || (p.lo <= 0 && p.hi >= 0))) p.standing = 'lead'\n",
         new="",
         tests=[BT], pattern='only where its own interval keeps to one side'),
    dict(id='an-own-chip-says-a-reading-only-past-too-few', file=AW,
         old="  const standing = standingClause(stood, `own.${id}`, a)\n  if (standing === null) return fill(c.ownUnmatched,",
         new="  const standing = standingClause(stood, `own.${id}`, a) ?? ''\n  if (!likeForLikeMatched(a)) return fill(c.ownUnmatched,",
         tests=['src/ownChips.test.ts'], pattern='a family of their own'),
    dict(id='your-own-chips-are-named-in-their-own-family', file='src/ownChips.ts',
         old="[ch.id, ownChipAnswer(all, ch.id, today, WORTH_POINTS)]",
         new="[ch.id, ownChipAnswer(all, ch.id, today)]",
         tests=['src/ownChips.test.ts'], pattern='a family of their own'),
    # ---- The check-in's answers, the move card's private line and the no-reading lines (2026-11-12, the evening) ------
    dict(id='a-failed-read-is-never-called-too-few', file=AW,
         old="  return stood === null || !stood.has(id) ? copy.evidence.unsaid.failed : copy.evidence.unsaid.tooFew",
         new="  return copy.evidence.unsaid.tooFew",
         tests=[AWT], pattern='only with where the comparison stands'),
    dict(id='a-comparison-missing-from-the-family-is-a-failure', file=AW,
         old="  return stood === null || !stood.has(id) ? copy.evidence.unsaid.failed",
         new="  return stood === null ? copy.evidence.unsaid.failed",
         tests=[AWT], pattern='only with where the comparison stands'),
    dict(id='too-few-is-said-in-the-standards-own-word', file='src/copy.ts',
         old="    unsaid: { tooFew: 'too few to compare yet',",
         new="    unsaid: { tooFew: 'nothing yet to set it against',",
         tests=[AWT], pattern='never says it when no band was shared'),
    dict(id='a-chip-answer-with-too-few-says-no-reading', file='src/copy.ts',
         old="    chipUnmatched: '{times} before: {why}.',\n",
         new="    chipUnmatched: '{times} before. The morning after read 72 (3); {why}.',\n",
         tests=[CAT], pattern='tapped three times'),
    dict(id='the-nature-answer-says-each-part-on-its-own-standing', file=AW,
         old="  return morning === null ? first : ",
         new="  return m.diff === null ? first : ",
         tests=[AWT], pattern='only with where the comparison stands'),
    dict(id='cooling-off-says-one-block-as-one', file=AW,
         old="(n === 1 ? one : fill(many, { n: String(n) }))",
         new="fill(many, { n: String(n) })",
         tests=[AWT], pattern='only with where the comparison stands'),
    dict(id='the-check-in-says-a-failed-read', file=CA,
         old="  if (!read.family) return copy.extras.chipFailed\n  return key === 'nature'",
         new="  if (!read.family) return null\n  return key === 'nature'",
         tests=[CG], pattern='reads the evidence again with no chance asked'),
    dict(id='your-own-chip-is-answered-among-your-own-chips', file=CA,
         old="  return a ? chipAnswerWords(a, read.own.stood) : null",
         new="  return a ? chipAnswerWords(a, read.stood) : null",
         tests=[CAT], pattern='among your own chips'),
    dict(id='the-afternoon-sweet-reads-the-afternoons-comparison', file=CA,
         old="sweetAnswerWords(read.family.sweetAfternoon, read.family.stood)",
         new="sweetAnswerWords(read.family.sweetEvening, read.family.stood)",
         tests=[CAT], pattern='something sweet from the sheet'),
    dict(id='the-move-card-reads-privates-only-in-selection', file=BF,
         old="  if (!settings.privateInSelection) return { privates: [], stood: null }\n",
         new="",
         tests=[CAT], pattern='only while private items are in selection'),
    dict(id='the-move-card-shows-only-its-own-check-in', file=BF,
         old="privates: family.privates.filter((p) => p.block === block), stood: family.stood }",
         new="privates: family.privates, stood: family.stood }",
         tests=[CAT], pattern='only at its own check-in'),
    # ---- The comparisons' guard, completed (2026-11-12) --------------------------------------------------------------
    dict(id='the-evidence-runs-under-the-guard', file=E,
         old="  return guardComparisons(today, read) ?? { ...withoutChance(read), failed: true }\n",
         new="  return read()\n",
         tests=[CG], pattern='reads the evidence again with no chance asked'),
    dict(id='a-failed-evidence-says-it-failed', file=E,
         old="?? { ...withoutChance(read), failed: true }",
         new="?? withoutChance(read)",
         tests=[CG], pattern='reads the evidence again with no chance asked'),
    dict(id='the-read-after-a-failure-asks-no-chance', file=NM,
         old="  chanceOff = true\n  try {",
         new="  chanceOff = false\n  try {",
         tests=[CG], pattern='reads the evidence again with no chance asked'),
    dict(id='a-failed-evidence-leaves-no-family', file=BF,
         old="  return ev.failed ? null : guardComparisons(day, () => sheetAssociations({ ...r, evidence: ev }, day))",
         new="  return guardComparisons(day, () => sheetAssociations({ ...r, evidence: ev }, day))",
         tests=[CG], pattern='own arithmetic threw'),
    dict(id='best-days-runs-under-the-guard', file=WK,
         old="  const read = guardComparisons(today, () => ({ all: bestConditions(checkins, offers, outcomes, contexts, today, outside, own) }))\n",
         new="  const read = { all: bestConditions(checkins, offers, outcomes, contexts, today, outside, own) } as { all: ReturnType<typeof bestConditions> } | null\n",
         tests=[CG], pattern='leaves best days saying it failed'),
    dict(id='a-failed-best-days-writes-no-fact', file=WF,
         old="  if (b.failed) return []\n",
         new="",
         tests=[CG], pattern='leaves best days saying it failed'),
    dict(id='the-pairs-run-under-the-guard', file=B,
         old="  return guardComparisons(today, () => comesBefore(checkins, today))\n",
         new="  return comesBefore(checkins, today)\n",
         tests=[CG], pattern='sixteen pairs saying they failed'),
    dict(id='your-own-chips-run-under-the-guard', file=BF,
         old="  const own = ev.failed ? null : guardComparisons(day, () => ownChipStandings(checkins, ownChipsOf(settings), day))\n",
         new="  const own = ev.failed ? null : ownChipStandings(checkins, ownChipsOf(settings), day)\n",
         tests=[CG], pattern='only your own chips fail'),
    # ---- The Worker's instructions for the standings (2026-11-12): the line and the review; Ask's left as they were -------
    dict(id='the-writers-are-told-how-a-comparison-stands', file='worker/src/prompt.ts',
         old="- A comparison in the record says where it stands, in its fact's own words: too few to compare yet, no clear pattern yet, a lead that is not yet a pattern, or a steady pattern. Say it no stronger than that: only a steady pattern is a pattern, a lead is tentative, and too few or no clear pattern is never a finding. It says what went with what, never why.\n",
         new="",
         tests=[WST], pattern='how a comparison stands'),
    dict(id='a-lead-is-told-as-tentative', file='worker/src/prompt.ts',
         old="only a steady pattern is a pattern, a lead is tentative, and too few",
         new="a steady pattern and a lead are patterns, and too few",
         tests=[WST], pattern='how a comparison stands'),
    dict(id='adaptive-is-supportive-only-below-a-steady-pattern', file='worker/src/prompt.ts',
         old="where it rests only on an association that is not a steady pattern, a forecast,",
         new="where it rests only on an association, a forecast,",
         tests=[WST], pattern='as the shared check allows'),
    dict(id='asks-instructions-are-left-as-they-were', file='worker/src/prompt.ts',
         old="where it rests only on an early sign, an association or a small count.",
         new="where it rests only on an early sign, an association that is not a steady pattern or a small count.",
         tests=[WST], pattern='leaves Ask'),
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
