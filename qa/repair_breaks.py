"""The learning repair, stages R1 to R4 (2026-10-19), each rule undone once: the test that guards it must turn red.

R1, the engine: the app's copy of the judged engine (src/repair/engine.ts), whose replay of a draw creates its tests in the
order a live draw does and carries the week's fits. Guarded by the equivalence harness (stress/equivalence.ts), which runs
the stress test's people through the judged engine and the app's, live, replayed, and rebuilt from app-shaped records.

R3, the learning week (2026-10-19): an invitation stands while unanswered; a week counts its days; the owner's answers
are read back from the day's record, and an answer makes the day's record when it has none yet; the week's line on Now
follows the switch; the invitation's controls keep their size in every theme; and the preview opens only in an automated
test browser.

R4, the screens (2026-10-19): the engine's track record of its own calls (requirement 15): a call kept once, held when
its test reaches a higher rung in its direction or an established call stands sixty days, not held when its test turns
or an established call is withdrawn, and kept every day; the thresholds: ten resolved before a rung can move, tightened
on the exact interval and returned when calls hold, the allowed error halved, the rule run each day and on in the app
alone, and every call reading the thresholds in force; and the screens: a test whose call did not hold marked revised
(general calls only), the tests the queue runs first and always shown, open calls counted, one rebuild per record, and
Evidence, the move card's rung and test words, the Moves door and the Legend following the switch.

R2, the record and the draw: what counts as a randomized decision (a check-in's own draw, every chance kept, nothing extra
among its candidates, not set aside); what an answer means (a skip is a seen No, Not home stays out, answers from before
the seen mark count as seen); the day's context (short sleep from the morning's anchor, daycare from a pickup); a rebuild
that stops before a new draw's slot; and, behind the switch, the draw in the app: a replacement after a skip stays
today's, the candidates and chances recorded are the engine's, and the draw carries the repair's version. The switch
itself ships gated.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by the harness rebuilds its bundle, and one
guarded by a browser test rebuilds the app, after the replacement and after the restore.

python repair_breaks.py [id ...]
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
HARNESS = 'harness'
PEOPLE = '2'

E = 'src/repair/engine.ts'
R = 'src/repair/record.ts'
OF = 'src/offerFlow.ts'
BS = 'src/brainShared.ts'
RT = 'src/repair/record.test.ts'
FT = 'src/repair/flow.test.ts'
WT = 'src/repair/week.test.ts'
GT = 'src/repair/gate.test.ts'
RS = 'e2e/repair.spec.ts'
TH = 'e2e/themes.spec.ts'
EV = 'src/repair/evidence.ts'
TT = 'src/repair/track.test.ts'
ET = 'src/repair/evidence.test.ts'
ES = 'src/evidenceScreen.tsx'
MC = 'src/moveCard.tsx'
MS = 'src/movesScreen.tsx'
LG = 'src/legend.tsx'
HT = 'src/repair/helps.test.ts'
TS = 'src/repair/testsSection.tsx'
BF = 'src/brainFlow.ts'
RF = 'src/repair/facts.ts'
LW = 'src/ladderWording.test.ts'
FX = 'src/repair/facts.test.ts'
SH = 'src/repair/sheet.test.ts'
SC = 'src/repair/sheetClosed.test.ts'
WR = 'worker/src/retrieval.ts'
WP = 'worker/src/prompt.ts'
WC = 'worker/src/claude.ts'
LT = 'worker/src/ladder.test.ts'
CT = 'worker/src/claude.test.ts'
AT = 'src/repair/alongside.test.ts'
PS = 'src/repair/passive.ts'
FL = 'src/repair/flow.ts'
WL = 'src/repair/weekLine.tsx'
GA = 'src/repair/gate.ts'
BK = 'src/repair/breaker.ts'
BKT = 'src/repair/breaker.test.ts'
BFT = 'src/repair/breakerFlow.test.ts'
BLT = 'src/brainFlow.test.ts'
CDT = 'src/cadence.test.ts'
FC = 'src/facts.ts'
NW = 'src/now.tsx'
DS = 'src/dataScreen.tsx'

TABLE = [
    dict(id='replay-test-order', file=E, tests=[HARNESS],
         old="    if (!week) for (const id of real) this.testFor(id, target, windowOfMove(id, target))",
         new="    void week"),
    dict(id='replay-week-fits', file=E, tests=[HARNESS],
         old="      if (tt && tt.lwDays[tt.lwDays.length - 1] !== d) tt.lwDays.push(d)",
         new="      void tt"),
    dict(id='record-responds', file=R, tests=[HARNESS],
         old="      engine.respond(id, responseOf(o, outcomeOf.get(o.id as number)))",
         new="      void responseOf"),
    dict(id='draw-needs-nothing', file=R, tests=[RT],
         old="o.candidates.includes(NOTHING) && ",
         new=""),
    dict(id='draw-not-set-aside', file=R, tests=[RT],
         old=" && !setAside(o)",
         new=""),
    dict(id='not-home-stays-out', file=R, tests=[RT],
         old="    if (o.skipReason === 'notHome') return { seen: false, did: null, why: null, answered: false }\n",
         new=""),
    dict(id='old-answers-seen', file=R, tests=[RT],
         old=" || (answered && outcome?.seen === undefined)",
         new=""),
    dict(id='short-sleep-anchor', file=R, tests=[RT],
         old="export const SHORT_SLEEP_ANCHOR = 2",
         new="export const SHORT_SLEEP_ANCHOR = 3"),
    dict(id='daycare-from-pickup', file=R, tests=[RT],
         old="    daycare: rec?.pickupTime !== null && rec?.pickupTime !== undefined,",
         new="    daycare: false,"),
    dict(id='stop-before-slot', file=R, tests=[RT],
         old="      if (d === last && b === stopBefore) return { engine, epoch, index, ids }\n",
         new=""),
    dict(id='replacement-stays-today', file=OF, tests=[FT],
         old="repairOn() && !replacing ?",
         new="repairOn() ?"),
    dict(id='engine-candidates-kept', file=OF, tests=[FT],
         old="    const drawnFrom = made ? made.offer.candidates : set.candidates.map((c) => c.id)",
         new="    const drawnFrom = set.candidates.map((c) => c.id)"),
    dict(id='repair-version-kept', file=OF, tests=[FT],
         old="      draw: made ? { ...drawRecord, engine: REPAIR_ENGINE } : drawRecord,",
         new="      draw: drawRecord,"),
    dict(id='switch-ships-open', file=BS, tests=[RT],
         old="export const LEARNING_REPAIR: 'gated' | 'open' = 'open'",
         new="export const LEARNING_REPAIR: 'gated' | 'open' = 'gated'"),
    dict(id='invitation-stands', file=E, tests=[WT],
         old="      this.invitationDue = d\n      return",
         new="      return"),
    dict(id='week-counts-days', file=FL, tests=[WT],
         old="weekDay: d < until ? d - (until - length) + 1 : null }",
         new="weekDay: d < until ? 1 : null }"),
    dict(id='answers-read-back', file=FL, tests=[RS],
         old="weekAnswers: new Map(days.filter((d) => d.weekAnswer).map((d) => [d.day, d.weekAnswer === 'yes'])) }",
         new="weekAnswers: new Map() }"),
    dict(id='week-line-follows-switch', file=WL, tests=[RS],
         old="  const state = useLive(() => (on ? guardRepair(day, () => weekState(day), null) : Promise.resolve(null)), [day, on])",
         new="  const state = useLive(() => guardRepair(day, () => weekState(day), null), [day, on])"),
    dict(id='preview-needs-automation', file=GA, tests=[GT],
         old="navigator.webdriver === true && ",
         new=""),
    dict(id='answer-makes-the-day', file=FL, tests=[FT],
         old="  await ensureDayContext(today, await getSettings())\n",
         new=""),
    dict(id='week-invite-targets', file=WL, tests=[TH, '-g', 'learning week'],
         old='class="pill-quiet" data-testid="week-yes"',
         new='data-testid="week-yes"'),
    dict(id='track-held-higher', file=E, tests=[TT],
         old="    else if (RUNG_RANK[level] > RUNG_RANK[c.rung] && direction === c.direction) held = true\n",
         new=""),
    dict(id='track-other-direction', file=E, tests=[TT],
         old="    if (level !== 'none' && direction !== c.direction) held = false\n",
         new="    if (level === 'established' && direction !== c.direction) held = false\n"),
    dict(id='track-withdrawn', file=E, tests=[TT],
         old="    else if (c.rung === 'established' && revisedOn !== null && revisedOn > c.day) held = false\n",
         new=""),
    dict(id='track-stands-sixty', file=E, tests=[TT],
         old="export const TRACK_STANDS = 60",
         new="export const TRACK_STANDS = 59"),
    dict(id='track-once', file=E, tests=[TT],
         old=" && !still.some((c) => c.direction === direction && RUNG_RANK[c.rung] >= RUNG_RANK[level])",
         new=""),
    dict(id='track-kept-daily', file=E, tests=[ET],
         old="    this.trackDay(d)\n",
         new=""),
    dict(id='tighten-needs-ten', file=E, tests=[TT],
         old="export const TRACK_ENOUGH = 10",
         new="export const TRACK_ENOUGH = 9"),
    dict(id='tighten-on-the-interval', file=E, tests=[TT],
         old="    else out[r] = heldUpper(k, n) < TESTED_RATES[r]",
         new="    else out[r] = k / n < TESTED_RATES[r]"),
    dict(id='tighten-returns', file=E, tests=[TT],
         old="    else if (before[r]) out[r] = k / n < TESTED_RATES[r]",
         new="    else if (before[r]) out[r] = true"),
    dict(id='thresholds-halve', file=E, tests=[TT],
         old="    early: tight.early ? 1 - (1 - cfg.tauEarly) / 2 : cfg.tauEarly,",
         new="    early: cfg.tauEarly,"),
    dict(id='rule-each-day', file=E, tests=[TT],
         old="    if (this.cfg.trackRule) this.tighten()\n",
         new=""),
    dict(id='rule-on-in-the-app', file=E, tests=[TT],
         old="export const IN_APP: BConfig = { ...REPAIR, trackRule: true }",
         new="export const IN_APP: BConfig = { ...REPAIR, trackRule: false }"),
    dict(id='established-rate-read', file=E, tests=[TT],
         old="    const estScale = rungThresholds(cfg, this.tight).estScale",
         new="    const estScale = 1"),
    dict(id='likely-probability-read', file=E, tests=[TT],
         old="      const likely = rung(rates.likely, this.tauOf('likely'))",
         new="      const likely = rung(rates.likely, cfg.tauLikely)"),
    dict(id='early-probability-read', file=E, tests=[TT],
         old="      const early = likely ? null : rung(rates.early, this.tauOf('early'))",
         new="      const early = likely ? null : rung(rates.early, cfg.tauEarly)"),
    dict(id='revised-general-only', file=EV, tests=[ET],
         old="c.held === false && c.ctx === null",
         new="c.held === false"),
    dict(id='revised-from-the-record', file=EV, tests=[TT],
         old="      revised: c.revised || notHeld.has(t.key),",
         new="      revised: c.revised,"),
    dict(id='running-first', file=EV, tests=[ET],
         old="Number(b.running) - Number(a.running) || ",
         new=""),
    dict(id='open-counted', file=EV, tests=[ET],
         old="open: mine.filter((c) => c.held === null).length",
         new="open: 0"),
    dict(id='running-shown', file=EV, tests=[ET],
         old="  const shown = all.filter((t) => t.running || t.level !== 'none')",
         new="  const shown = all.filter((t) => t.level !== 'none')"),
    dict(id='rebuild-follows-the-record', file=R, tests=[ET],
         old="  const key = `${through}|${fingerprint(JSON.stringify([r.checkins, r.offers, r.outcomes, r.days, [...r.weekAnswers]]))}`",
         new="  const key = through"),
    dict(id='evidence-follows-switch', file=ES, tests=[RS],
         old="  const repair = useRepairOn()\n  const r = copy.repairEvidence",
         new="  const repair = false\n  const r = copy.repairEvidence"),
    dict(id='move-card-rung', file=MC, tests=[RS],
         old="                  {rungWords(rung?.level ?? 'none', rung?.direction ?? null)}",
         new="                  {copy.evidence.tiers.little}"),
    dict(id='move-card-test-words', file=MC, tests=[RS],
         old="          {repair\n            ? offer.kind === 'pickup'",
         new="          {false\n            ? offer.kind === 'pickup'"),
    dict(id='moves-door-words', file=MS, tests=[RS],
         old="note={repair ? copy.repairEvidence.door",
         new="note={false ? copy.repairEvidence.door"),
    dict(id='legend-rungs', file=LG, tests=[RS],
         old="{repair ? copy.repairEvidence.legendConclusions",
         new="{false ? copy.repairEvidence.legendConclusions"),
    dict(id='helps-best-first', file=EV, tests=[HT],
         old="sort((a, b) => b.belief - a.belief || a.key.localeCompare(b.key))",
         new="sort((a, b) => a.key.localeCompare(b.key))"),
    dict(id='helps-only-helping', file=EV, tests=[HT],
         old="h.target === target && h.belief > 0",
         new="h.target === target"),
    dict(id='helps-three-at-most', file=EV, tests=[HT],
         old="a.key.localeCompare(b.key)).slice(0, 3) }))",
         new="a.key.localeCompare(b.key)).slice(0, 4) }))"),
    dict(id='research-beside', file=EV, tests=[HT],
         old="research: hasMove(t.moveId) ? moveById(t.moveId).prior.effect : 0",
         new="research: 0"),
    dict(id='nearest-open-only', file=EV, tests=[HT],
         old="all.filter((n) => n.level !== 'established')",
         new="all.filter(() => true)"),
    dict(id='nearest-three-at-most', file=EV, tests=[HT],
         old="b.nearness - a.nearness || a.key.localeCompare(b.key)).slice(0, 3)",
         new="b.nearness - a.nearness || a.key.localeCompare(b.key)).slice(0, 4)"),
    dict(id='nearness-of-little', file=EV, tests=[HT],
         old="margin > 0 ? margin / (Math.abs(beta) + half) : 0",
         new="0"),
    dict(id='began-first-decision', file=EV, tests=[HT],
         old="began: dayOf(t.decisions[0].d)",
         new="began: dayOf(t.decisions[t.decisions.length - 1].d)"),
    dict(id='began-names-the-day', file=EV, tests=[HT],
         old="return evidenceOf(built.engine, (d) => addDays(built.epoch, d))",
         new="return evidenceOf(built.engine)"),
    dict(id='helps-opens-evidence', file=TS, tests=[RS],
         old="      <HelpsBlock ev={ev} />\n",
         new=""),
    dict(id='ladder-only-cited', file=BS, tests=[LW],
         old="const cited = sheet.facts.filter((f) => isLadderFact(f.id) && factIds.includes(f.id))",
         new="const cited = sheet.facts.filter((f) => isLadderFact(f.id))"),
    dict(id='ladder-reliable-established', file=BS, tests=[LW],
         old="if (reliable && !cited.some((f) => f.values.level === 'established'))",
         new="if (false && reliable)"),
    dict(id='ladder-negation-honest', file=BS, tests=[LW],
         old="const help = HELP_WORDS.exec(text.replace(NEGATED_HELP, ' '))",
         new="const help = HELP_WORDS.exec(text)"),
    dict(id='ladder-no-call', file=BS, tests=[LW],
         old="const called = cited.filter((f) => f.values.level !== 'none' && f.values.direction)",
         new="const called = cited"),
    dict(id='ladder-direction', file=BS, tests=[LW],
         old="const helping = called.filter((f) => f.values.direction === 'helps')",
         new="const helping = called"),
    dict(id='ladder-hedged-below-established', file=BS, tests=[LW],
         old="if (best < LADDER_RANK.established && !LADDER_HEDGE.test(text))",
         new="if (false)"),
    dict(id='ladder-every-line', file=BS, tests=[LW],
         old="  if (factIds.some(isLadderFact)) {\n    const why = ladderWordingRefusal(text, factIds, sheet)",
         new="  if (false) {\n    const why = ladderWordingRefusal(text, factIds, sheet)"),
    dict(id='ladder-on-the-sheet', file=BF, tests=[SH],
         old=", ...(repair ? { repair } : {}) })",
         new=" })"),
    dict(id='ladder-sheet-open-only', file=BF, tests=[SC],
         old="const repair = repairOn() ? guardRepairNow(",
         new="const repair = true ? guardRepairNow("),
    dict(id='ladder-act-first', file=RF, tests=[FX],
         old="return group(a) - group(b) || ",
         new="return "),
    dict(id='ladder-filed-with-the-sheet', file=WR, tests=[LT],
         old=" || head === 'ladder' || f.id === 'track'",
         new=""),
    dict(id='ladder-rule-only-with-ladder', file=WP, tests=[LT],
         old="return sheet.facts.some((f) => f.id.startsWith('ladder.'))",
         new="return true"),
    dict(id='ladder-rule-free-line', file=WP, tests=[LT],
         old="{ role: 'system', content: lineSystem(b.firm, hasLadder(b.sheet)) }",
         new="{ role: 'system', content: lineSystem(b.firm) }"),
    dict(id='ladder-rule-free-review', file=WP, tests=[LT],
         old="{ role: 'system', content: reviewSystem(b.firm, hasLadder(b.sheet)) }",
         new="{ role: 'system', content: reviewSystem(b.firm) }"),
    dict(id='ladder-rule-claude', file=WC, tests=[CT],
         old="instructions: claudeInstructions(t.task as 'line' | 'review', b.firm, hasLadder(b.sheet)),",
         new="instructions: claudeInstructions(t.task as 'line' | 'review', b.firm),"),
    dict(id='coin-at-its-chance', file=E, tests=[AT],
         old="const dec: Decision = { d, slot: here, A, pi: chance,",
         new="const dec: Decision = { d, slot: here, A, pi: 0.4,"),
    dict(id='coin-takes-no-queue-place', file=E, tests=[AT],
         old="  replayAlongside(a: Answered, d: number, c: DayContext, moveId: string, rode: boolean, chance: number): number {\n    const here = slotOf(d, a.block)",
         new="  replayAlongside(a: Answered, d: number, c: DayContext, moveId: string, rode: boolean, chance: number): number {\n    for (const x of this.readingsOf(moveId)) this.testFor(moveId, x.target, x.window).eligibleDays.push(d)\n    const here = slotOf(d, a.block)"),
    dict(id='coin-rebuilt', file=R, tests=[AT],
         old="      if (o.passiveCoin) {\n        const coin = engine.replayAlongside(",
         new="      if (false as boolean) {\n        const coin = engine.replayAlongside("),
    dict(id='coin-answer-read', file=R, tests=[AT],
         old="  const did = outcome?.passiveOutcome ?? null",
         new="  const did = null"),
    dict(id='coin-at-the-draw', file=OF, tests=[FT],
         old="    const coin = assigned ? await passiveCoinFor(assigned.id, day, settings, draw) : null",
         new="    const coin = null as { moveId: string; rode: boolean; chance: number } | null"),
    dict(id='coin-no-carries-nothing', file=OF, tests=[FT],
         old="const passive = coin ? (coin.rode ? assigned : null) : (assigned ?? pickPassive(",
         new="const passive = coin ? assigned : (assigned ?? pickPassive("),
    dict(id='coin-only-while-a-test-runs', file=OF, tests=[FT],
         old="passiveTestSince(settings, moveId, day) === null) return null\n  const ev = await guardRepair(day, () => repairEvidence(day), null)\n  if (!ev || !passiveTestRuns(settings, moveId, day, ev.shown)) return null",
         new="false) return null"),
    dict(id='coin-on-a-late-mark', file=OF, tests=[FT],
         old="      const coin = await passiveCoinFor(RECOVERY_GAP, day, await getSettings(), rng)\n      if (coin) {",
         new="      const coin = null as { moveId: string; rode: boolean; chance: number } | null\n      if (coin) {"),
    dict(id='coin-mark-taken-back', file=OF, tests=[FT],
         old="    if (!marked && evening.passiveCoin) {\n      await db.offers.update(evening.id, { passiveCoin: undefined, ...(carries ? { passiveId: null } : {}) })\n      return false\n    }\n",
         new=""),
    dict(id='passive-needs-a-test', file=PS, tests=[AT],
         old="testsOfMove(moveId).length > 0",
         new="true"),
    dict(id='passive-test-forty-five-days', file=PS, tests=[AT],
         old="day >= addDays(set.since, PASSIVE_TEST_DAYS)",
         new="day >= addDays(set.since, PASSIVE_TEST_DAYS + 1)"),
    dict(id='passive-test-stops-established', file=PS, tests=[AT],
         old=" && !tests.some((t) => t.moveId === moveId && t.level === 'established')",
         new=""),
    dict(id='passive-tap-replaces', file=PS, tests=[AT],
         old="...(s.repairPassiveTests ?? []).filter((t) => t.moveId !== moveId),",
         new="...(s.repairPassiveTests ?? []),"),
    dict(id='passive-proposed-at-promising', file=ES, tests=[RS],
         old="const offer = !runs && e.stats.tier === 'promising' && testablePassive(e.card.moveId) && at !== null",
         new="const offer = false"),
    dict(id='passive-cards-shown', file=ES, tests=[RS],
         old="          <AlongsideCards cards={ev.cards.filter((e) => e.card.origin === 'passive')} today={today} />\n",
         new=""),
    dict(id='passive-test-said-running', file=ES, tests=[RS],
         old="{runs && since && (",
         new="{false && ("),
    dict(id='passive-test-target', file=ES, tests=[TH, '-g', 'passive item'],
         old='class="pill-quiet" data-testid="passive-test-start"',
         new='data-testid="passive-test-start"'),
    # R6, the switch (2026-10-19): open as it ships, closed only by an automated test browser's key at 0; the breaker,
    # which closes the repair for the session when a rebuild throws; the screens and the Brain's tap following the switch.
    dict(id='closing-key-at-zero', file=GA, tests=[GT],
         old="  if (gate === 'open') return key === '0' ? 'gated' : 'open'",
         new="  if (gate === 'open') return 'open'"),
    dict(id='breaker-closes-the-repair', file=GA, tests=[GT],
         old="  return mode !== 'gated' && !repairTripped()",
         new="  return mode !== 'gated'"),
    dict(id='screens-redraw-on-a-trip', file=GA, tests=[RS, '-g', 'end to end'],
         old="  useEffect(() => onRepairTrip(() => setOn(repairOn())), [])\n",
         new=""),
    dict(id='breaker-guards-the-draw', file=OF, tests=[BFT],
         old="await guardRepair(day, () => repairDraw(checkin, situation, t, drawn.candidates.map((c) => c.id), draw), null)",
         new="await repairDraw(checkin, situation, t, drawn.candidates.map((c) => c.id), draw)"),
    dict(id='breaker-guards-the-coin', file=OF, tests=[BFT],
         old="  const ev = await guardRepair(day, () => repairEvidence(day), null)\n",
         new="  const ev = await repairEvidence(day)\n"),
    dict(id='breaker-guards-the-sheet', file=BF, tests=[BFT],
         old="const repair = repairOn() ? guardRepairNow(day, () => repairEvidenceFrom(",
         new="const repair = repairOn() ? ((_d: string, read: () => never) => read())(day, () => repairEvidenceFrom("),
    dict(id='breaker-trips-once-a-session', file=BK, tests=[BKT],
         old="  if (tripped) return\n  tripped = true\n",
         new="  tripped = true\n"),
    dict(id='breaker-keeps-no-message', file=BK, tests=[BKT],
         old="const name = e instanceof Error ? e.name : typeof e",
         new="const name = e instanceof Error ? e.message : typeof e"),
    dict(id='stand-in-fault-needs-automation', file=BK, tests=[BKT],
         old="return g.navigator?.webdriver === true && g.localStorage?.getItem(FAULT_TEST_KEY) === '1'",
         new="return g.localStorage?.getItem(FAULT_TEST_KEY) === '1'"),
    dict(id='fault-line-shown', file=ES, tests=[RS, '-g', 'the breaker'],
         old="      <RepairFaultLine today={today} />\n",
         new=""),
    dict(id='fault-line-four-weeks', file=ES, tests=[RS, '-g', 'four weeks after the last'],
         old="if (!f || f.last < addDays(today, -FAULT_SHOWN_DAYS)) return null",
         new="if (!f) return null"),
    dict(id='tags-hidden-while-open', file=ES, tests=[RS, '-g', 'open as it ships'],
         old="      {!repair && (\n        <>\n          <h2 class=\"section\">{c.tagsTitle}</h2>",
         new="      {(\n        <>\n          <h2 class=\"section\">{c.tagsTitle}</h2>"),
    dict(id='nothing-line-follows', file=ES, tests=[RS, '-g', 'open as it ships'],
         old="fill(repair ? r.nothingLine : c.nothingLine",
         new="fill(c.nothingLine"),
    dict(id='knows-follows', file=NW, tests=[RS, '-g', 'open as it ships'],
         old="          {repair\n            ? fill(c.knowsRepair, {",
         new="          {false\n            ? fill(c.knowsRepair, {"),
    dict(id='knows-counts-the-repair', file=NW, tests=[RS, '-g', 'open as it ships'],
         old="  const tests = repair ? (underWay ?? 0) : (counts?.tests ?? 0)",
         new="  const tests = counts?.tests ?? 0"),
    dict(id='untested-withheld', file=FC, tests=[CDT],
         old="  if (!i.repair && days >= 14 && backed.length) {",
         new="  if (days >= 14 && backed.length) {"),
    dict(id='import-says-why', file=DS, tests=[RS, '-g', 'Import a hypothesis'],
         old="      {repair ? (\n        <div class=\"card pad\">\n          <p class=\"note no-gap\" data-testid=\"hypothesis-repair\">",
         new="      {false ? (\n        <div class=\"card pad\">\n          <p class=\"note no-gap\" data-testid=\"hypothesis-repair\">"),
    dict(id='test-tap-gone', file=BF, tests=[BLT],
         old="  if (!hypothesisOf(action) || repairOn()) return { state: 'gone' }",
         new="  if (!hypothesisOf(action)) return { state: 'gone' }"),
]


def bundle():
    r = subprocess.run([NPX, 'esbuild', 'stress/equivalence.ts', '--bundle', '--platform=node', '--format=esm', '--outfile=stress/.out/equivalence.mjs', '--log-level=warning'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit('bundle failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def build():
    r = subprocess.run([NPM, 'run', 'build'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit('build failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])


def browser(tests):
    return any(t.startswith('e2e/') for t in tests)


def run(tests):
    assert tests, 'an empty test list would run everything'
    if browser(tests):
        r = subprocess.run([NPX, 'playwright', 'test', '-c', CONFIG, '--retries', '0', *tests], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
        out = re.sub(r'\x1b\[[0-9;]*m', '', r.stdout + r.stderr)
        passed = int(m.group(1)) if (m := re.search(r'(\d+) passed', out)) else 0
        failed = int(m.group(1)) if (m := re.search(r'(\d+) failed', out)) else 0
        return r.returncode, failed, passed, out
    if tests == [HARNESS]:
        bundle()
        r = subprocess.run(['node', 'stress/.out/equivalence.mjs', PEOPLE], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
        out = r.stdout + r.stderr
        same = len(re.findall(r'^SAME ', out, re.M))
        different = len(re.findall(r'^DIFFERENT [a-z-]+:', out, re.M))
        return r.returncode, different, same, out
    r = subprocess.run([NPX, 'vitest', 'run', *tests], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
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
        code, failed, passed, out = run(t['tests'])
        if code != 0 or passed == 0:
            results.append((t['id'], f'NO GREEN BASELINE (exit {code}, {passed} passed)'))
            print(t['id'], '->', results[-1][1], flush=True)
            continue
        try:
            io.open(path, 'wb').write(text.replace(t['old'], t['new']).encode('utf-8'))
            if browser(t['tests']):
                build()
            code2, failed2, passed2, out2 = run(t['tests'])
        finally:
            io.open(path, 'wb').write(original)
            if t['tests'] == [HARNESS]:
                bundle()
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
