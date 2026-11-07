"""P5 of the AI-generated Paths design (2026-11-06): each new rule undone once, and the test that guards it must turn red.

The compiler: the rules' triage first; abstention on thin evidence; two to six stages; no treatment, no tactic, a crutch,
a method from the library; the budget and the minutes; floors by kind; the app's own start for exposure, for a clinical
word and for a people Path, opening an exposure strand, its focus never on that strand or one that waits; no cycle, a
hard prerequisite never trained later; every component shown or composite, and trained; every gate naming what its
stage is for; nothing recorded the Path does not measure; done whatever anyone answers; feasibility (what a rep needs,
a plan never moving a stage, a partner only on a strand that waits); a spare rep at every stage the rule moves; an
outside check only with an audience, on two reps; calls and messages only where a strand says; a strand that waits,
pausing only others, never alone, no declared stage; the app's own private check; the attempt cap; a decision for
every number; provenance stamped by the harness. The engine: a gate's required behaviours; a strand that waits off by
default and its pauses; the private check monthly while its strand is on; the start's focus. The phone: every version
checked again, the start's and the check's words the app's own. The shared rows: a search never carrying your words,
whole rows only, the quiet hours, a reader bound to the words read. The request: queued only when the rules route it
as a Path, withdrawn only before its draft. The Worker: the gate, the quiet hours, the rules again, a run past its time
across midnight, the search's privacy, the goal word for word, spans at their place, every number in a span, verdicts
bound and only "supports" admitting, a dry run's own stores, the provenance, new cards namespaced. The phone's screens.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. Browser entries build before and after their break.
PW_CONFIG=<config> picks the Playwright config (default playwright.config.ts).

python paths_p5_breaks.py [id ...]
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
COMPILE = 'src/pathCompile.test.ts'
MEASURE = 'src/pathMeasure.test.ts'
GEN = 'src/generatedPaths.test.ts'
REQ = 'src/pathRequestFlow.test.ts'
WORKER = 'worker/src/paths.test.ts'
E2E = 'e2e/makePath.spec.ts'
ASKING = 'asking for a Path: the rules route it before anything is kept'
BACK = 'a generated Path that came back'
C = 'src/pathCompile.ts'
W = 'worker/src/paths.ts'

TABLE = [
    # The compiler.
    dict(id='triage-ignored', file=C,
         old="  if (rules.route !== 'fits' && !(rules.route === 'redirect' && rules.practice) && !(ctx.knownAnswer && rules.route === 'existing')) say(",
         new="  if (false) say(",
         tests=[COMPILE], pattern='route by the goal'),
    dict(id='abstain-ignored', file=C,
         old="    if (!behind.some((id) => admitted.has(id))) abstains.push(",
         new="    if (false) abstains.push(",
         tests=[COMPILE], pattern='abstain when the model does'),
    dict(id='stages-any-number', file=C,
         old="    if (s.stages.length < 2 || s.stages.length > 6) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='refuse a fixed shape, treatment, a tactic'),
    dict(id='treatment-allowed', file=C,
         old="      if (TREATMENT.test(t)) say(`${where}: treatment words",
         new="      if (false) say(`${where}: treatment words",
         tests=[COMPILE], pattern='refuse a fixed shape, treatment, a tactic'),
    dict(id='tactic-allowed', file=C,
         old="      if (TACTIC.test(t)) say(",
         new="      if (false) say(",
         tests=[COMPILE], pattern='refuse a fixed shape, treatment, a tactic'),
    dict(id='crutch-optional', file=C,
         old="    if (!r.crutch?.trim()) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='refuse a fixed shape, treatment, a tactic'),
    dict(id='method-anything', file=C,
         old="    if (!methodById(r.method) && !isBlocked(r.method)) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='refuse a fixed shape, treatment, a tactic'),
    dict(id='budget-ignored', file=C,
         old="  if (typical * 3 > ctx.minutesPerWeek) say(",
         new="  if (false) say(",
         tests=[COMPILE], pattern='refuse a fixed shape, treatment, a tactic'),
    dict(id='minutes-any', file=C,
         old="    if (!(r.minutes >= 1 && r.minutes <= 90)) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='the minutes, the floors by kind, the attempt cap'),
    dict(id='floors-any', file=C,
         old="    if (floor && (s.rule.reps < floor.reps || s.rule.distinctReps < floor.distinctReps)) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='the minutes, the floors by kind, the attempt cap'),
    dict(id='exposure-no-start', file=C,
         old="  if (d.strands.some((s) => s.kind === 'exposure') && !d.start) say(",
         new="  if (false) say(",
         tests=[COMPILE], pattern='refuse an exposure strand without the app'),
    dict(id='clinical-no-help', file=C,
         old="  if (rules.route === 'redirect' && !d.start) say(",
         new="  if (false) say(",
         tests=[COMPILE], pattern='route by the goal'),
    dict(id='people-no-screen', file=C,
         old="  if (people && d.start?.screen !== 'socialFear') say(",
         new="  if (false) say(",
         tests=[COMPILE], pattern='a people Path opens on the app'),
    dict(id='start-opens-any', file=C,
         old="    if (!opened || opened.kind !== 'exposure') say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='a people Path opens on the app'),
    dict(id='focus-on-opened', file=C,
         old="    for (const f of d.start.focus) if (f.id === d.start.opens || strandOf(f.id)?.waits) say(",
         new="    for (const f of d.start.focus) if (false) say(",
         tests=[COMPILE], pattern='a people Path opens on the app'),
    dict(id='cycle-allowed', file=C,
         old="  if ([...compIds].some((id) => cycle(id, new Set()))) say(",
         new="  if (false) say(",
         tests=[COMPILE], pattern='refuse an exposure strand without the app'),
    dict(id='hard-link-later', file=C,
         old="      if (first(l.to) < first(l.from)) say(",
         new="      if (false) say(",
         tests=[COMPILE], pattern='every component is shown by a behaviour'),
    dict(id='component-unshown', file=C,
         old="      if (!shown.length) say(",
         new="      if (false) say(",
         tests=[COMPILE], pattern='every component is shown by a behaviour'),
    dict(id='component-untrained', file=C,
         old="      if (!d.reps.some((r) => r.trains?.includes(c.id))) say(",
         new="      if (false) say(",
         tests=[COMPILE], pattern='every component is shown by a behaviour'),
    dict(id='composite-unbuilt', file=C,
         old="      if (!d.links.some((l) => l.to === c.id)) say(",
         new="      if (false) say(",
         tests=[COMPILE], pattern='every component is shown by a behaviour'),
    dict(id='gate-names-nothing', file=C,
         old="    if (!g.requires?.length) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='a gate names the behaviours its stage exists for'),
    dict(id='gate-requires-unknown', file=C,
         old="    for (const b of g.requires ?? []) if (!bs.some((x) => x.id === b)) say(",
         new="    for (const b of g.requires ?? []) if (false) say(",
         tests=[COMPILE], pattern='a gate names the behaviours its stage exists for'),
    dict(id='rating-recorded', file=C,
         old="    for (const t of [r.what, r.doneWhen]) if (RATING.test(t)) say(",
         new="    for (const t of [r.what, r.doneWhen]) if (false) say(",
         tests=[COMPILE], pattern='a rep asks you to record only what the Path measures'),
    dict(id='answered-allowed', file=C,
         old="    if (ANSWERED.test(r.doneWhen.replace(WHATEVER, ''))) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='a rep asks you to record only what the Path measures'),
    dict(id='whatever-read-as-waiting', file=C,
         old="    if (ANSWERED.test(r.doneWhen.replace(WHATEVER, ''))) say(",
         new="    if (ANSWERED.test(r.doneWhen)) say(",
         tests=[COMPILE], pattern='a rep asks you to record only what the Path measures'),
    dict(id='needs-ungiven', file=C,
         old="        if (!given) say(",
         new="        if (false) say(",
         tests=[COMPILE], pattern='a rep is feasible'),
    dict(id='plan-moves-stage', file=C,
         old="      if (n === 'plan' && r.advances) say(",
         new="      if (false) say(",
         tests=[COMPILE], pattern='a rep is feasible'),
    dict(id='partner-anywhere', file=C,
         old="      if (n === 'partner' && !strand?.waits) say(",
         new="      if (false) say(",
         tests=[COMPILE], pattern='a rep is feasible'),
    dict(id='partner-words-ignored', file=C,
         old="    if ([r.name, r.what, r.doneWhen, r.cue].some((x) => PARTNER_WORDS.test(x)) && !r.needs?.includes('partner')) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='a rep is feasible'),
    dict(id='no-spare-rep', file=C,
         old="      const short = here.length < s.rule.distinctReps + 1 || here.some(",
         new="      const short = here.length < s.rule.distinctReps || here.some(",
         tests=[COMPILE], pattern='every stage the rule moves keeps its floor'),
    dict(id='handover-anyone', file=C,
         old="    if (r.handOver && !(r.with === 'adult' && r.settings.includes('group'))) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='an outside check needs an audience'),
    dict(id='confirmed-one-rep', file=C,
         old="    if (g.confirmed > 0 && here.filter((r) => r.record || r.handOver).length < 2) say(",
         new="    if (g.confirmed > 0 && here.filter((r) => r.record || r.handOver).length < 1) say(",
         tests=[COMPILE], pattern='an outside check needs an audience'),
    dict(id='remote-moves-any', file=C,
         old="    if (r.advances && strand && !strand.remote && remoteOnly(r)) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='a call or a message moves a stage only on a strand'),
    dict(id='pauses-itself', file=C,
         old="    for (const p of s.pauses ?? []) if (p === s.id || !d.strands.some((x) => x.id === p && !x.waits)) say(",
         new="    for (const p of s.pauses ?? []) if (false) say(",
         tests=[COMPILE], pattern='a strand that waits is off until you turn it on, pauses only others'),
    dict(id='all-strands-wait', file=C,
         old="  if (!d.strands.some((s) => !s.waits && s.id !== d.start?.opens)) say(",
         new="  if (false) say(",
         tests=[COMPILE], pattern='a strand that waits is off until you turn it on, pauses only others'),
    dict(id='declared-stage', file=C,
         old="    for (const st of s.stages) if ((st.advance ?? 'counts') !== 'counts') say(",
         new="    for (const st of s.stages) if (false) say(",
         tests=[COMPILE], pattern='a strand that waits is off until you turn it on, pauses only others'),
    dict(id='check-left-out', file=C,
         old="    ...(check ? { check } : {}),\n",
         new="",
         tests=[COMPILE], pattern='a strand whose reps need a partner carries the app'),
    dict(id='cap-any', file=C,
         old="  if (!(m.cap >= 4 && m.cap <= 12)) say(",
         new="  if (false) say(",
         tests=[COMPILE], pattern='the minutes, the floors by kind, the attempt cap'),
    dict(id='decisions-optional', file=C,
         old="  for (const e of need) if (!elements.has(e)) say(",
         new="  for (const e of need) if (false) say(",
         tests=[COMPILE], pattern='the minutes, the floors by kind, the attempt cap'),
    dict(id='provenance-from-model', file=C,
         old="    generated: { goalTypes: d.triage.types, provenance: { ...ctx.provenance } },",
         new="    generated: { goalTypes: d.triage.types, provenance: (d as unknown as { provenance?: Provenance }).provenance ?? { ...ctx.provenance } },",
         tests=[COMPILE], pattern='carries the harness'),
    dict(id='provenance-unstamped', file=C,
         old="  if (!(ctx.provenance.run && ctx.provenance.model && ctx.provenance.promptHash && ctx.provenance.retrievedOn)) say(",
         new="  if (false) say(",
         tests=[COMPILE], pattern='carries the harness'),
    # Round 2's rules.
    dict(id='smaller-not-smaller', file=C,
         old="      if (here.length && here.every((r) => r.effort === 'high')) say(",
         new="      if (false) say(",
         tests=[COMPILE], pattern='a smaller version that is smaller'),
    dict(id='component-unmeasured', file=C,
         old="      if (!(c.shows ?? []).some((b) => required.has(b))) say(",
         new="      if (false) say(",
         tests=[COMPILE], pattern='a smaller version that is smaller'),
    dict(id='cap-undecided', file=C,
         old="const REQUIRED_DECISIONS = ['structure', 'maintenance', 'rule', 'timeline', 'cap'] as const",
         new="const REQUIRED_DECISIONS = ['structure', 'maintenance', 'rule', 'timeline'] as const",
         tests=[COMPILE], pattern='a smaller version that is smaller'),
    dict(id='ask-unmarked', file=C,
         old="    if ([r.name, r.what, r.doneWhen].some((x) => ASK_WORDS.test(x)) && !r.asks) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='an ask says so and carries the app'),
    dict(id='ask-bar-left-off', file=C,
         old="[r.guardrail, r.asks ? ASK_BAR : ''].filter(Boolean).join(' ')",
         new="[r.guardrail].filter(Boolean).join(' ')",
         tests=[COMPILE], pattern='an ask says so and carries the app'),
    dict(id='consent-unpractised', file=C,
         old="  for (const s of partnerStrands) if (!d.reps.some(",
         new="  for (const s of partnerStrands) if (false && !d.reps.some(",
         tests=[COMPILE], pattern='an ask says so and carries the app'),
    dict(id='gate-on-last-stage', file=C,
         old="    if (g.stage >= (strandOf(g.strand)?.stages.length ?? 0)) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='an ask says so and carries the app'),
    # The stress set's rules.
    dict(id='share-ignored', file=C,
         old="    if (total > SHARE_FLOOR + 1e-9) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='the share, a first stage that waits on no one'),
    dict(id='first-stage-waits', file=C,
         old="    if (g.confirmed > 0 && g.stage === 1 && !here.some((r) => r.record)) say(",
         new="    if (false) say(",
         tests=[COMPILE], pattern='the share, a first stage that waits on no one'),
    dict(id='any-partner-romance', file=C,
         old="const PARTNER_WORDS = /\\b(your (girlfriend|",
         new="const PARTNER_WORDS = /\\b(your (partner|girlfriend|",
         tests=[COMPILE], pattern='the share, a first stage that waits on no one'),
    dict(id='body-not-redirected', file='src/pathTriage.ts',
         old="  ['body', /",
         new="  ['bodyOff', /\\bnever matches\\b|",
         tests=['src/pathTriage.test.ts'], pattern='asks back on a vague goal'),
    # The database version.
    dict(id='v26-drops-a-store', file='src/db.ts',
         old="      pathJobs: 'id, requestId',\n    })",
         new="      pathJobs: 'id, requestId',\n      checkins: null,\n    })",
         tests=['src/dbMigration26.test.ts'], pattern='keeps a version-25 record whole'),
    dict(id='abstain-needs-shape', file=C,
         old="  if (d.triage?.route === 'abstain') return { ok: false, abstain: reasons.length === 0, reasons: [...reasons, `the generator abstained: ${d.triage.why}`] }\n",
         new="  if (d.triage?.route === 'abstain') abstains.push(`the generator abstained: ${d.triage.why}`)\n",
         tests=[COMPILE], pattern='abstain when the model does'),
    # The engine.
    dict(id='requires-ignored', file='src/pathMeasure.ts',
         old="  return v.met >= gate.met && (gate.requires ?? []).every((id) => v.ids.includes(id))\n",
         new="  return v.met >= gate.met\n",
         tests=[MEASURE], pattern='counts a rep only when its best view shows each required behaviour'),
    dict(id='waiting-on-by-default', file='src/pathMeasure.ts',
         old="  const off = new Set([path.start?.opens, ...(path.strands ?? []).filter((s) => s.waits).map((s) => s.id)])\n",
         new="  const off = new Set([path.start?.opens])\n",
         tests=[MEASURE], pattern='is off until you turn it on, as the strand a yes opens is'),
    dict(id='pauses-ignored', file='src/pathMeasure.ts',
         old="  const pauses = (path.strands?.find((s) => s.id === id)?.pauses ?? []).filter((x) => all.includes(x) && x !== id)\n",
         new="  const pauses: string[] = []\n",
         tests=[MEASURE], pattern='pauses the strands it names while it is on'),
    dict(id='check-any-strand', file='src/pathMeasure.ts',
         old="  return Boolean(path.check) && activeStrands(path, aim).includes(path.check?.strand ?? '') && aim.checkedMonth !== today.slice(0, 7)\n",
         new="  return Boolean(path.check) && aim.checkedMonth !== today.slice(0, 7)\n",
         tests=[MEASURE], pattern='private check monthly while its strand is on'),
    dict(id='check-every-day', file='src/pathMeasure.ts',
         old="  return Boolean(path.check) && activeStrands(path, aim).includes(path.check?.strand ?? '') && aim.checkedMonth !== today.slice(0, 7)\n",
         new="  return Boolean(path.check) && activeStrands(path, aim).includes(path.check?.strand ?? '')\n",
         tests=[MEASURE], pattern='private check monthly while its strand is on'),
    dict(id='focus-turns-on-waiting', file='src/pathRead.tsx',
         old="  const base = all.includes(focus) && focus !== opens && !waiting.has(focus) ? [focus] : all.filter((id) => id !== opens && !waiting.has(id))\n",
         new="  const base = all.includes(focus) && focus !== opens ? [focus] : all.filter((id) => id !== opens)\n",
         tests=[MEASURE], pattern='is never turned on by the start'),
    # The phone's own checks.
    dict(id='phone-trusts-row', file='src/generatedPaths.ts',
         old="    if (checkPath(r.path, [...withShared, ...r.reps], [...library, ...r.cards]).length || appWordsProblems(r.path).length) refused.push(r.pathId)\n",
         new="    if (false) refused.push(r.pathId)\n",
         tests=[GEN], pattern='show a version that fails the compiler'),
    dict(id='phone-trusts-words', file='src/generatedPaths.ts',
         old=" || appWordsProblems(r.path).length) refused.push(r.pathId)\n",
         new=") refused.push(r.pathId)\n",
         tests=[GEN], pattern='show a Path whose start or private check differs'),
    # The shared rows.
    dict(id='query-carries-answers', file='src/pathJob.ts',
         old="  if (hit) return `the query carries a word from your own answers",
         new="  if (false) return `the query carries a word from your own answers",
         tests=[REQ], pattern='refuse a search carrying your own words'),
    dict(id='query-carries-name', file='src/pathJob.ts',
         old="  if (named) return `the query carries a name",
         new="  if (false) return `the query carries a name",
         tests=[REQ], pattern='refuse a search carrying your own words'),
    dict(id='version-takes-catalogue-rep', file='src/pathJob.ts',
         old="  if (reps.some((m) => !m || typeof m.id !== 'string' || !m.id.startsWith(`${b.pathId}-`) || m.family !== b.pathId)) return null\n",
         new="",
         tests=[REQ], pattern='read a request, a job and a version whole'),
    dict(id='version-takes-library-card', file='src/pathJob.ts',
         old="  if (cards.some((c) => !c || typeof c.id !== 'string' || !c.id.startsWith(`${b.pathId}-`))) return null\n",
         new="",
         tests=[REQ], pattern='read a request, a job and a version whole'),
    dict(id='no-quiet-hours', file='src/pathJob.ts',
         old="  return hhmm >= '09:00' && hhmm < '11:30'\n",
         new="  return false\n",
         tests=[REQ], pattern='keep a stable fingerprint'),
    dict(id='read-unbound', file='src/pathJob.ts',
         old="  return fingerprintOf(JSON.stringify([card.claim, card.effect ?? null, card.population ?? null]))\n",
         new="  return fingerprintOf(JSON.stringify([card.claim]))\n",
         tests=[REQ], pattern='keep a stable fingerprint'),
    # The request.
    dict(id='everything-queued', file='src/pathRequestFlow.ts',
         old="    state: drafts(triage) ? 'queued' : 'triaged',\n",
         new="    state: 'queued',\n",
         tests=[REQ], pattern='waits for a draft when the rules route it as a Path'),
    dict(id='withdraw-while-drafting', file='src/pathRequestFlow.ts',
         old="    if (!r || r.state !== 'queued' || job) return\n",
         new="    if (!r || r.state !== 'queued') return\n",
         tests=[REQ], pattern='is withdrawn before its draft starts'),
    dict(id='abuse-help-missing', file='src/pathIntake.tsx',
         old="    const help = t.kind === 'abuse' ? (findPath('partner')?.acts?.find((a) => a.id === 'monthly-check')?.help ?? '') : ''\n",
         new="    const help = ''\n",
         tests=[REQ], pattern='own words for every route'),
    # The Worker.
    dict(id='worker-ungated', file=W,
         old="  if ((opts.gate ?? PATH_GENERATOR) !== 'open') return { ran: false, reason: 'gated' }\n",
         new="",
         tests=[WORKER], pattern='reads nothing while gated'),
    dict(id='worker-no-quiet-hours', file=W,
         old="  if (quietHours(hhmm) && !opts.force) return",
         new="  if (false) return",
         tests=[WORKER], pattern='reads nothing while gated'),
    dict(id='worker-trusts-phone-route', file=W,
         old="  if (rules.route !== 'fits' && !(rules.route === 'redirect' && rules.practice)) {\n",
         new="  if (false) {\n",
         tests=[WORKER], pattern='never drafts a request the rules route elsewhere'),
    dict(id='worker-retries-at-once', file=W,
         old="  if (!opts.force && now.getTime() < waitUntil) return",
         new="  if (false) return",
         tests=[WORKER], pattern='tries a fire the routine refused again only after an hour'),
    dict(id='worker-midnight-forgotten', file=W,
         old="[day, addDays(day, -1)].flatMap(",
         new="[day].flatMap(",
         tests=[WORKER], pattern='lets a run go past its time'),
    dict(id='worker-search-unchecked', file=W,
         old="    const why = request ? queryRefusal(q, request) : 'the request is not there'\n",
         new="    const why = null\n",
         tests=[WORKER], pattern='searches with generic words only'),
    dict(id='worker-other-goal', file=W,
         old="    if (d.goal !== request.goal) return refuse(",
         new="    if (false) return refuse(",
         tests=[WORKER], pattern='refuses a dossier with every reason at once'),
    dict(id='worker-span-unhashed', file=W,
         old="    if (!passage || (await hashOf(passage)) !== s.hash) say(",
         new="    if (!passage) say(",
         tests=[WORKER], pattern='checks each new card'),
    dict(id='worker-numbers-unspanned', file=W,
         old="if (!passages.some((p) => p.includes(n))) say(`the number ${n} in its effect stands in no passage it spans`)",
         new="if (false) say(`the number ${n} in its effect stands in no passage it spans`)",
         tests=[WORKER], pattern='checks each new card'),
    dict(id='worker-verdict-unbound', file=W,
         old="    if (v.read !== readOf(c)) {\n",
         new="    if (false) {\n",
         tests=[WORKER], pattern='admits a card only on a supports bound to the words served'),
    dict(id='worker-partly-admits', file=W,
         old="    if (v.verdict === 'supports') admitted.push(",
         new="    if (v.verdict !== 'doesNot') admitted.push(",
         tests=[WORKER], pattern='is left out, every citation of it with it'),
    dict(id='worker-dry-writes-phone', file=W,
         old="  const stores = storesOf(dry)\n",
         new="  const stores = storesOf(false)\n",
         tests=[WORKER], pattern='goes the whole way on a stand-in goal'),
    dict(id='worker-unstamped', file=W,
         old="  return { run: t.id, model: written, promptHash: t.procedureHash ?? 'unknown', retrievedOn: t.day }\n",
         new="  return { run: t.id, model: written, promptHash: 'unknown', retrievedOn: t.day }\n",
         tests=[WORKER], pattern='stamps its provenance'),
    dict(id='worker-cards-unnamespaced', file=W,
         old="    const { dossier, cards } = namespaced(d, drafted, pathId)\n",
         new="    const { dossier, cards } = { dossier: d, cards: drafted }\n",
         tests=[WORKER], pattern='checks each new card'),
    dict(id='worker-abstain-refused', file=W,
         old="    if (!d || typeof d.goal !== 'string' || (!abstaining && !Array.isArray(d.strands))) return refuse(",
         new="    if (!d || typeof d.goal !== 'string' || !Array.isArray(d.strands)) return refuse(",
         tests=[WORKER], pattern='ends the job as abstained, with why'),
    # The phone's screens.
    dict(id='list-words-from-route-alone', file='src/pathIntake.tsx',
         old="  const triage = routeOf({ goal: r.goal, why: r.why, offLimits: r.offLimits })\n",
         new="  const triage = { route: r.route } as Triage\n",
         tests=[E2E], pattern=ASKING),
    dict(id='no-withdraw', file='src/pathIntake.tsx',
         old="        {state === 'queued' && !job ? (\n",
         new="        {false ? (\n",
         tests=[E2E], pattern=ASKING),
    dict(id='no-make-path', file='src/aimsScreen.tsx',
         old="    ...(onMakePath ? [{ id: 'make-path',",
         new="    ...(false ? [{ id: 'make-path',",
         tests=[E2E], pattern=ASKING),
    dict(id='no-check-card', file='src/pathCard.tsx',
         old="      {path.check && checkDue(path, p.aim, p.today) && <PathCheckCard",
         new="      {false && checkDue(path, p.aim, p.today) && <PathCheckCard",
         tests=[E2E], pattern=BACK),
    dict(id='strands-undated', file='src/measureFlow.ts',
         old="strandsLog: [...(aim.strandsLog ?? []), { at: now.toISOString(), strands: [...strands] }]",
         new="strandsLog: aim.strandsLog ?? []",
         tests=[E2E], pattern=BACK),
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
    # An id that matches no entry is refused, never skipped: a list read with stray characters once ran one entry of 71.
    unknown = [i for i in ids if i not in {t['id'] for t in TABLE}]
    assert not unknown, f'no entry is named {unknown}'
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
