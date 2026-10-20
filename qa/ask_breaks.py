"""Ask Life Mirror, stage A1 (2026-10-19), each rule undone once: the test that guards it must turn red.

The evidence version moves with a rung, a direction, a revised mark or the queue, and never with drift within a rung. A
cited finding is marked changed when its rung or direction moved, when it was revised, or when the read no longer shows
it; drift within a rung marks nothing; a thread reads its state from its newest turn. "What do you know" opens with what
changed since the last such read, says plainly when nothing has, names the tests begun since, lays out what helps per
reading in the readings' order, best first, then the other calls by rung and by direction, says "Not enough yet" when
nothing has reached a rung, and cites the tests being run as well as the calls. "What should we test next" gives each
test being run whole, with the day it began, what would settle it once, and the queue's next or that nothing waits.
"Ask about this" gives each finding whole, says one no longer among the tests and a line resting on none, and ends with
what would settle it; a line's tests come from its ladder facts, once each. A starter shows only when it has something
real to say. A typed question's matches put a named move before a named reading, and words every name shares name
nothing. The words promise nothing. The gate is closed, and only an automated test browser holding the key previews it.
A typed question waits; only a waiting question can be cancelled; a deleted thread takes its turns, and both go as
tombstones; search reads the answers too; the last read is a "What do you know" or a "What's changed". Both stores are
synced, and the export carries the answers under their own key. The queue's next is one test per move, none of a move
being run, each one the queue may take. On the screen: the Ask button only in the preview, the starters that have
something to say, Recent's two rows, the delete confirmation, the marker, the row's state from the newest turn, the
matches, search, "Ask about this" from Evidence with its test and back to Evidence, from the Brain card's Why, and the
export from the Data screen.

Same rules as the other runners: a green baseline first, one exact replacement, the file always restored byte for byte,
the table read as data, and an empty test list refused. A break guarded by a browser test runs Playwright against the
built folder, so the app is rebuilt after its replacement and once more after its restore. The texts that span several
lines were copied from the source as it stood, never retyped.

python ask_breaks.py [id ...]
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
AT = 'src/ask/ask.test.ts'
FT = 'src/ask/flow.test.ts'
QT = 'src/ask/queue.test.ts'
ET = 'src/export.test.ts'
AS = 'e2e/ask.spec.ts'
WA = 'worker/src/ask.ts'
WT = 'worker/src/ask.test.ts'
VERSION = "`${t.key}:${t.level}:${t.direction ?? '-'}:${t.revised ? 1 : 0}:${t.running ? 1 : 0}`"
CHANGED = "    if (t.level !== c.level || t.direction !== c.direction || (t.revised && !c.revised)) out.push("
BY_CALL = "  return RANK[b.level] - RANK[a.level] || (DIRECTION[a.direction ?? ''] ?? 3) - (DIRECTION[b.direction ?? ''] ?? 3) || a.key.localeCompare(b.key)\n"
QUEUE = "lines: ev.waiting.length ? ev.waiting.map((t) => fill(w.queueLine, { move: nameOf(t.moveId), reading: readingName(t.target), window: windowOf(t.window) })) : [w.queueNone] })"
SYNCED = "'journal', 'askThreads', 'askTurns']"
NEXT_RULE = "      if (busy.has(t.moveId) || !this.mayEnter(t, this.today)) continue\n"

TABLE = [
    # The evidence version.
    dict(id='version-ignores-drift', file='src/ask/evidence.ts', old=VERSION,
         new="`${t.key}:${t.level}:${t.direction ?? '-'}:${t.revised ? 1 : 0}:${t.running ? 1 : 0}:${t.theta}`",
         tests=[AT], pattern='is the same for the same evidence'),
    dict(id='version-direction', file='src/ask/evidence.ts', old=VERSION,
         new="`${t.key}:${t.level}:${t.revised ? 1 : 0}:${t.running ? 1 : 0}`",
         tests=[AT], pattern='is the same for the same evidence'),
    dict(id='version-revised', file='src/ask/evidence.ts', old=VERSION,
         new="`${t.key}:${t.level}:${t.direction ?? '-'}:${t.running ? 1 : 0}`",
         tests=[AT], pattern='is the same for the same evidence'),
    dict(id='version-running', file='src/ask/evidence.ts', old=VERSION,
         new="`${t.key}:${t.level}:${t.direction ?? '-'}:${t.revised ? 1 : 0}`",
         tests=[AT], pattern='is the same for the same evidence'),
    # What changed for a cited finding (point 8), and a thread's state.
    dict(id='changes-ignore-drift', file='src/ask/evidence.ts', old=CHANGED,
         new="    if (t.level !== c.level || t.direction !== c.direction || (t.revised && !c.revised) || round2(t.lo) !== c.lo) out.push(",
         tests=[AT], pattern='marks a cited finding whose rung'),
    dict(id='changes-revised', file='src/ask/evidence.ts', old=CHANGED,
         new="    if (t.level !== c.level || t.direction !== c.direction) out.push(",
         tests=[AT], pattern='marks a cited finding whose rung'),
    dict(id='changes-gone', file='src/ask/evidence.ts',
         old="    if (!t) {\n      out.push({ key: c.key, before, after: null })\n      continue\n    }\n",
         new="    if (!t) continue\n",
         tests=[AT], pattern='marks a cited finding whose rung'),
    dict(id='thread-state-newest', file='src/ask/evidence.ts',
         old="  return ev && changesOf(last.cited, ev).length > 0 ? 'changed' : 'answered'\n",
         new="  return ev && turns.some((t) => t.state === 'answered' && changesOf(t.cited, ev).length > 0) ? 'changed' : 'answered'\n",
         tests=[AT], pattern='state from its newest turn'),
    # "What do you know about me so far?"
    dict(id='know-since-first', file='src/ask/quick.ts',
         old='  if (last) sections.push(...sinceSections(last, ev))\n',
         new='',
         tests=[AT], pattern='opens with what changed since the last read'),
    dict(id='since-nothing-said', file='src/ask/quick.ts',
         old='  if (!changed.length && !begun.length) return [{ title: null, lines: [fill(words().nothingChanged, { date })] }]\n',
         new='  if (!changed.length && !begun.length) return []\n',
         tests=[AT], pattern='opens with what changed since the last read'),
    dict(id='since-new-tests', file='src/ask/quick.ts',
         old=', ...(begun.length ? [{ title: words().newTitle, lines: begun }] : [])',
         new='',
         tests=[AT], pattern='opens with what changed since the last read'),
    dict(id='helps-reading-order', file='src/ask/quick.ts',
         old='.sort((a, b) => READING_ORDER(a.target) - READING_ORDER(b.target) || byCall(a, b))',
         new='.sort(byCall)',
         tests=[AT], pattern='lays out what helps per reading'),
    dict(id='calls-rung-order', file='src/ask/quick.ts', old=BY_CALL,
         new="  return RANK[a.level] - RANK[b.level] || (DIRECTION[a.direction ?? ''] ?? 3) - (DIRECTION[b.direction ?? ''] ?? 3) || a.key.localeCompare(b.key)\n",
         tests=[AT], pattern='lays out what helps per reading'),
    dict(id='calls-direction-order', file='src/ask/quick.ts', old=BY_CALL,
         new="  return RANK[b.level] - RANK[a.level] || (DIRECTION[b.direction ?? ''] ?? 3) - (DIRECTION[a.direction ?? ''] ?? 3) || a.key.localeCompare(b.key)\n",
         tests=[AT], pattern='lays out what helps per reading'),
    dict(id='know-not-enough', file='src/ask/quick.ts',
         old='  if (!calls.length) sections.push({ title: null, lines: [words().notEnough] })\n',
         new='',
         tests=[AT], pattern='gives what helps, the other calls'),
    dict(id='know-cites-running', file='src/ask/quick.ts',
         old='  return { answer: { sections }, cited: stateOf(ev).map(citeOf) }\n',
         new='  return { answer: { sections }, cited: callsOf(ev).map(citeOf) }\n',
         tests=[AT], pattern='cites a test being run at no rung yet'),
    # "What should we test next?"
    dict(id='next-settle', file='src/ask/quick.ts',
         old='  if (running.some(open)) sections.push({ title: null, lines: [w.settle] })\n',
         new='',
         tests=[AT], pattern='gives each test being run whole'),
    dict(id='next-queue-none', file='src/ask/quick.ts', old=QUEUE,
         new="lines: ev.waiting.length ? ev.waiting.map((t) => fill(w.queueLine, { move: nameOf(t.moveId), reading: readingName(t.target), window: windowOf(t.window) })) : [] })",
         tests=[AT], pattern='gives each test being run whole'),
    dict(id='next-began', file='src/ask/quick.ts',
         old='  if (t.began) lines.push(fill(w.began, { date: formatDayShort(t.began) }))\n',
         new='',
         tests=[AT], pattern='gives each test being run whole'),
    # "Ask about this".
    dict(id='about-named-once', file='src/ask/quick.ts',
         old="    sections.push({ title: keys.length === 1 && question.includes(title) ? null : title, lines: testLines(t) })\n",
         new="    sections.push({ title, lines: testLines(t) })\n",
         tests=[AT], pattern='names a finding the question already names only once'),
    dict(id='settle-only-unsettled', file='src/ask/quick.ts',
         old="const open = (t: TestShown) => t.level !== 'established'\n",
         new="const open = (t: TestShown) => t !== null\n",
         tests=[AT], pattern='names a finding the question already names only once'),
    dict(id='about-gone', file='src/ask/quick.ts',
         old='      sections.push({ title: null, lines: [fill(w.aboutGone, { key: titleOf({ moveId, target, window }) })] })\n',
         new='',
         tests=[AT], pattern='gives each attached finding whole'),
    dict(id='about-none', file='src/ask/quick.ts',
         old='  if (!keys.length) return { answer: { sections: [{ title: null, lines: [w.aboutNone] }] }, cited: [] }\n',
         new='',
         tests=[AT], pattern='gives each attached finding whole'),
    dict(id='about-settle', file='src/ask/quick.ts',
         old='  if (found.some(open)) sections.push({ title: null, lines: [w.settle] })\n',
         new='',
         tests=[AT], pattern='gives each attached finding whole'),
    dict(id='line-keys-once', file='src/ask/quick.ts',
         old='    if (t && !out.includes(t.key)) out.push(t.key)\n',
         new='    if (t) out.push(t.key)\n',
         tests=[AT], pattern='finds the tests a line on the Brain card cites'),
    # The starters (point 3).
    dict(id='starter-know', file='src/ask/quick.ts',
         old="  if (ev.shown.length + ev.quiet.length > 0) out.push('know')\n",
         new="  if (ev.shown.length > 0) out.push('know')\n",
         tests=[AT], pattern='shows a starter only when'),
    dict(id='starter-changed', file='src/ask/quick.ts',
         old="  if (last && last.version !== evidenceVersion(ev)) out.push('changed')\n",
         new="  if (last) out.push('changed')\n",
         tests=[AT], pattern='shows a starter only when'),
    dict(id='starter-next', file='src/ask/quick.ts',
         old="  if (ev.shown.some((t) => t.running) || ev.waiting.length > 0) out.push('next')\n",
         new="  if (ev.shown.some((t) => t.running)) out.push('next')\n",
         tests=[AT], pattern='shows a starter only when'),
    # A typed question's matches (point 4).
    dict(id='match-move-first', file='src/ask/match.ts',
         old='score: (move ? 2 : 0) + (reading ? 1 : 0)',
         new='score: (move ? 1 : 0) + (reading ? 2 : 0)',
         tests=[AT], pattern='shows the findings its words name'),
    dict(id='match-common-words', file='src/ask/names.ts',
         old='  const own = words(name).filter((w) => w.length >= 3 && !COMMON.has(w))\n',
         new='  const own = words(name).filter((w) => w.length >= 3)\n',
         tests=[AT], pattern='shows the findings its words name'),
    # The words, and the gate.
    dict(id='words-promise', file='src/copy.ts',
         old="    queueLine: '{move}, for {reading} over the {window}: waiting for a place.',\n",
         new="    queueLine: '{move}, for {reading} over the {window}: it will take the next place that frees.',\n",
         tests=[AT], pattern='describe and never promise'),
    dict(id='gate-closed', file='src/brainShared.ts',
         old="export const ASK: 'gated' | 'open' = 'gated'\n",
         new="export const ASK: 'gated' | 'open' = 'open'\n",
         tests=[AT], pattern='is closed while it is built'),
    dict(id='gate-needs-key', file='src/ask/gate.ts',
         old="  return key === '1' ? 'preview' : 'gated'\n",
         new="  return 'preview'\n",
         tests=[AT], pattern='is closed while it is built'),
    dict(id='gate-test-browser-only', file='src/ask/gate.ts',
         old='navigator.webdriver === true && ',
         new='',
         tests=[AT], pattern='is read only in an automated test browser'),
    # The record on the phone.
    dict(id='typed-waits', file='src/ask/flow.ts',
         old="tier: 'standard', state: 'waiting', kind: 'typed'",
         new="tier: 'standard', state: 'answered', kind: 'typed'",
         tests=[FT], pattern='keeps a typed question waiting'),
    dict(id='cancel-only-waiting', file='src/ask/flow.ts',
         old="    if (t && t.state === 'waiting') await db.askTurns.put(",
         new='    if (t) await db.askTurns.put(',
         tests=[FT], pattern='keeps a typed question waiting'),
    dict(id='delete-takes-turns', file='src/ask/flow.ts',
         old="    await db.askTurns.where('threadId').equals(threadId).delete()\n",
         new='',
         tests=[FT], pattern='deletes a thread whole'),
    dict(id='search-reads-answers', file='src/ask/flow.ts',
         old=", ...(t.quick?.sections ?? []).flatMap((s) => [s.title ?? '', ...s.lines])",
         new='',
         tests=[FT], pattern='deletes a thread whole'),
    dict(id='last-read-kinds', file='src/ask/flow.ts',
         old="(t.kind === 'know' || t.kind === 'changed')",
         new="t.kind !== 'typed'",
         tests=[FT], pattern='compares a new read against the last'),
    dict(id='brain-line-keys', file='src/ask/flow.ts',
         old="  const keys = 'keys' in ref ? [...ref.keys] : keysOfLine(ref.factIds, ev)\n",
         new="  const keys = 'keys' in ref ? [...ref.keys] : []\n",
         tests=[FT], pattern='asks about a finding in a new thread'),
    dict(id='synced', file='src/cloudOutbox.ts', old=SYNCED,
         new="'journal']",
         tests=[QT], pattern='is synced'),
    dict(id='tombstones', file='src/cloudOutbox.ts', old=SYNCED,
         new="'journal']",
         tests=[FT], pattern='deletes a thread whole'),
    dict(id='export-answers', file='src/export.ts',
         old='answer: t.quick?.sections ?? null, cited: t.cited })),\n',
         new='cited: t.cited })),\n',
         tests=[ET], pattern='carries Ask'),
    dict(id='export-key', file='src/export.ts',
         old="        ask: 'Ask Life Mirror: each conversation (threads)",
         new="        askMirror: 'Ask Life Mirror: each conversation (threads)",
         tests=[ET], pattern='carries Ask'),
    # The queue's next, read without changing it.
    dict(id='next-not-a-busy-move', file='src/repair/engine.ts', old=NEXT_RULE,
         new='      if (!this.mayEnter(t, this.today)) continue\n',
         tests=[QT], pattern='names one test per move'),
    dict(id='next-may-enter', file='src/repair/engine.ts', old=NEXT_RULE,
         new='      if (busy.has(t.moveId)) continue\n',
         tests=[QT], pattern='names one test per move'),
    # The layout audit reads only what is shown: not the lines or controls of a closed fold-out.
    dict(id='audit-text-shown-only', file='e2e/themes.spec.ts',
         old="    if (cs.visibility === 'hidden' || !el.checkVisibility()) continue\n    const range = document.createRange()\n",
         new="    if (cs.visibility === 'hidden') continue\n    const range = document.createRange()\n",
         tests=['e2e/themes.spec.ts'], pattern='the audit reads only what is shown'),
    dict(id='audit-targets-shown-only', file='e2e/themes.spec.ts',
         old="    if (cs.visibility === 'hidden' || !el.checkVisibility()) continue\n    let { left, top, right, bottom } = r\n",
         new="    if (cs.visibility === 'hidden') continue\n    let { left, top, right, bottom } = r\n",
         tests=['e2e/themes.spec.ts'], pattern='the audit reads only what is shown'),
    # The Worker's read-only report of a day's planned pings answers only the run key.
    dict(id='pings-run-key-only', file='worker/src/index.ts',
         old="    if (url.pathname === '/run/pings' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {\n",
         new="    if (url.pathname === '/run/pings') {\n",
         tests=['worker/src/claude.test.ts'], pattern='opens only for the bridge key the agent proxy adds'),
    # Stage A2 in the Worker: Claude's answers.
    dict(id='a2-gate', file=WA,
         old="  if ((opts.gate ?? ASK) !== 'open' && !byHand) return { ran: false, reason: 'gated' }\n",
         new='',
         tests=[WT], pattern='runs nothing and reads nothing by schedule'),
    dict(id='a2-by-hand-needs-a-question', file=WA,
         old="  const byHand = opts.dry === true && typeof opts.question === 'string' && opts.question.trim().length > 0\n",
         new="  const byHand = opts.dry === true || opts.force === true\n",
         tests=[WT], pattern='runs nothing and reads nothing by schedule'),
    dict(id='a2-bridge-gate', file=WA,
         old="  if ((deps.gate ?? ASK) !== 'open' && !(t.dry === true && typeof t.question === 'string')) return",
         new="  if ((deps.gate ?? ASK) !== 'open' && false) return",
         tests=[WT], pattern='runs nothing and reads nothing by schedule'),
    dict(id='a2-waits-for-the-line', file=WA,
         old="      const wait = await waitFor(store, day, opts.coach)\n      if (wait) return { ran: false, reason: wait, day, turn: turn.id }\n",
         new='',
         tests=[WT], pattern='before any question runs'),
    dict(id='a2-allowance', file=WA,
         old="  if (!roomFor(task, runs)) return { reason: 'today’s answers are used; the rest wait for tomorrow' }\n",
         new='',
         tests=[WT], pattern='stays within the day'),
    dict(id='a2-deep-once-a-day', file='src/ask/shared.ts',
         old=" && !runs.some((r) => r.task === 'deep' && reachedClaude(r))",
         new='',
         tests=[WT], pattern='runs the deep tier once a day'),
    dict(id='a2-refused-waits', file=WA,
         old="  if (refused) {\n",
         new="  if (refused && false) {\n",
         tests=[WT], pattern='takes a refused fire'),
    dict(id='a2-tries', file=WA,
         old="    if (triesOf(turn.id, runs) >= ASK_TRIES) {\n",
         new="    if (false) {\n",
         tests=[WT], pattern='lets a run past its time go'),
    dict(id='a2-waits-three-days', file=WA,
         old="    if (turn.day < addDays(day, -(ASK_WAITS_DAYS - 1))) {\n",
         new="    if (false) {\n",
         tests=[WT], pattern='lets go a question waiting longer'),
    dict(id='a2-answered-not-run', file=WA,
         old=" && !answered.has(answerIdOf(t.id)))\n",
         new=")\n",
         tests=[WT], pattern='never runs a question that has its answer already'),
    dict(id='a2-one-at-a-time', file=WA,
         old="    if (!why) return { ran: false, reason: 'waiting for Claude', day, task: t.id }\n",
         new="    if (!why) continue\n",
         tests=[WT], pattern='starts the oldest waiting question'),
    dict(id='a2-named-first', file=WA,
         old=".sort((a, b) => b.s - a.s || a.i - b.i)",
         new=".sort((a, b) => a.i - b.i)",
         tests=[WT], pattern='puts the findings the question names first'),
    dict(id='a2-profile-without-history', file='worker/src/briefing.ts',
         old="  ask: { free: [], claude: ['factSheet', 'dayRecord'",
         new="  ask: { free: [], claude: ['brainHistory', 'factSheet', 'dayRecord'",
         tests=[WT], pattern='puts the findings the question names first'),
    dict(id='a2-changed-since', file=WA,
         old="    if (level !== c.level || direction !== c.direction || (revised && !c.revised)) out.push(",
         new="    if (direction !== c.direction || (revised && !c.revised)) out.push(",
         tests=[WT], pattern='gives a follow-up its thread so far'),
    dict(id='a2-own-tests-evidence', file='src/brainShared.ts',
         old=" && !(ownTests && factIds.some(isLadderFact))) return 'speaks of evidence without citing a card'",
         new=") return 'speaks of evidence without citing a card'",
         tests=[WT], pattern='speak of their evidence'),
    dict(id='a2-line-unchanged', file='src/brainShared.ts',
         old="maxWords: number, evidence = false, ownTests = false): string | null {",
         new="maxWords: number, evidence = false, ownTests = true): string | null {",
         tests=[WT], pattern='speak of their evidence'),
    dict(id='a2-floor', file='src/brainShared.ts',
         old="maxWords, evidence, true) ?? firmnessRefusal(text)",
         new="maxWords, evidence, true)",
         tests=[WT], pattern='refuses an answer with an exclamation mark'),
    dict(id='a2-surface', file=WA,
         old="    if (g) verdict = { ok: false, reason: g }\n",
         new='',
         tests=[WT], pattern='refuses an answer with an exclamation mark'),
    dict(id='a2-no-checked-answer', file=WA,
         old="    if (spent && turn && !t.dry) await noAnswer(deps.store, turn, verdict.reason, deps.now)\n",
         new='',
         tests=[WT], pattern='checks an answer as a line is'),
    dict(id='a2-answer-facts', file=WA,
         old="facts: citedFacts(sheet, verdict.value.factIds, (f) => relabel(f, sheet, t.day)),",
         new="facts: [],",
         tests=[WT], pattern='stores a checked answer'),
    dict(id='a2-day-before-sheet', file=WA,
         old="  const factsDay = todays ? day : addDays(day, -1)\n",
         new="  const factsDay = todays ? day : day\n",
         tests=[WT], pattern='reads the day before'),
    dict(id='a2-every-reason', file='src/brainShared.ts',
         old="  return { ok: false, reason: also ? `${why}; and ${also}` : why }\n",
         new="  return { ok: false, reason: why }\n",
         tests=[WT], pattern='say every reason at once'),
    dict(id='a2-ladder-words-ground', file='src/brainShared.ts',
         old="    if (isLadderFact(f.id) && numbersIn(f.text).some((t) => t.replace(/,/g, '') === plain)) return true\n",
         new='',
         tests=[WT], pattern='ground a number in a test'),
    dict(id='a2-ladder-words-only', file='src/brainShared.ts',
         old="    if (isLadderFact(f.id) && numbersIn(f.text).some((t) => t.replace(/,/g, '') === plain)) return true\n",
         new="    if (numbersIn(f.text).some((t) => t.replace(/,/g, '') === plain)) return true\n",
         tests=[WT], pattern='ground a number in a test'),
    dict(id='a2-run-ask-key', file='worker/src/index.ts',
         old="    if (url.pathname === '/run/ask' && env.RUN_KEY && url.searchParams.get('key') === env.RUN_KEY) {\n",
         new="    if (url.pathname === '/run/ask') {\n",
         tests=['worker/src/claude.test.ts'], pattern='opens only for the bridge key the agent proxy adds'),
    # On the screen.
    dict(id='button-only-in-preview', file='src/mirror.tsx',
         old='          askOn() && onAsk ? (\n',
         new='          onAsk ? (\n',
         tests=[AS], pattern='opens from Mirror'),
    dict(id='starters-on-screen', file='src/ask/askScreen.tsx',
         old="  const starters = ev ? startersShown(ev, last ?? null).filter((s): s is Exclude<AskStarter, 'deep'> => s !== 'deep') : []\n",
         new="  const starters: Exclude<AskStarter, 'deep'>[] = ['know', 'changed', 'next']\n",
         tests=[AS], pattern='opens from Mirror'),
    dict(id='recent-two', file='src/ask/askScreen.tsx',
         old='  const recent = (all ?? []).slice(0, 2)\n',
         new='  const recent = all ?? []\n',
         tests=[AS], pattern='Recent keeps two rows'),
    dict(id='delete-confirms', file='src/ask/askScreen.tsx',
         old='data-testid="ask-delete" onClick={() => setConfirming(true)}',
         new="data-testid=\"ask-delete\" onClick={() => void deleteThread(view.id).then(() => setView({ kind: 'main' }))}",
         tests=[AS], pattern='Recent keeps two rows'),
    dict(id='search-on-screen', file='src/ask/askScreen.tsx',
         old='    const shown = searchThreads(all ?? [], query)\n',
         new='    const shown = all ?? []\n',
         tests=[AS], pattern='Recent keeps two rows'),
    dict(id='marker-shown', file='src/ask/askScreen.tsx',
         old='      {changes.length > 0 && (\n',
         new='      {changes.length < 0 && (\n',
         tests=[AS], pattern='an answer whose cited finding has changed'),
    dict(id='row-state-newest', file='src/ask/askScreen.tsx',
         old='  const s = threadState(whole.turns, ev)\n',
         new='  const s = threadState(whole.turns.slice(0, 1), ev)\n',
         tests=[AS], pattern='an answer whose cited finding has changed'),
    dict(id='matches-shown', file='src/ask/askScreen.tsx',
         old="  const matches = ev && t.state === 'waiting' ? matchFindings(t.question, ev) : []\n",
         new="  const matches = ev && t.state === 'waiting' ? matchFindings(t.question, ev).slice(0, 0) : []\n",
         tests=[AS], pattern='a typed question waits for Claude'),
    dict(id='evidence-attaches-test', file='src/repair/testsSection.tsx',
         old="onAsk({ keys: [t.key], source: 'evidence',",
         new="onAsk({ keys: [], source: 'evidence',",
         tests=[AS], pattern='on Evidence opens a thread'),
    dict(id='evidence-back', file='src/app.tsx',
         old="open: { about }, back: { kind: 'evidence' } })}",
         new='open: { about } })}',
         tests=[AS], pattern='on Evidence opens a thread'),
    dict(id='brief-ask', file='src/brief.tsx',
         old='      {askOn() && onAsk && (\n',
         new='      {askOn() && !onAsk && (\n',
         tests=[AS], pattern='in the Brain card'),
    dict(id='export-from-data', file='src/dataScreen.tsx',
         old=', ask: { threads: await db.askThreads.toArray(), turns: await db.askTurns.toArray() } }), [])',
         new=' }), [])',
         tests=[AS], pattern='the export carries every conversation'),
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
