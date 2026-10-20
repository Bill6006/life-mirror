import { useEffect, useState } from 'preact/hooks'
import { blockAt } from '../blocks'
import { peekBrain } from '../cloudSync'
import { NavRow } from '../controls'
import { copy } from '../copy'
import { db } from '../db'
import { fill, formatDayShort, formatTime } from '../format'
import { useLive } from '../live'
import { clsOf, IN_APP } from '../repair/engine'
import type { RepairEvidence, TestShown } from '../repair/evidence'
import { rungWords } from '../repair/words'
import { readingById, type ReadingId } from '../readings'
import { hasMove, moveById } from '../catalogue'
import { SubHead } from '../ui'
import { changesOf, threadState } from './evidence'
import { allThreads, askAbout, askAgain, askAllowance, askDeep, askEvidence, askExplain, askSooner, askStarter, askTyped, askWaitingKeys, askWaits, cancelTurn, deleteThread, keepNote, lastRead, QUESTION_MAX, reachedAny, searchThreads, settleAskTurns, testOfTurn, type AboutRef, type ThreadWhole } from './flow'
import { matchFindings } from './match'
import { changeLines, soonerOf, startersShown, testContextLine } from './quick'
import { DEEP_COUNTS, THREAD_TURNS_MAX, type AskAnswer, type AskWait } from './shared'
import type { AboutSource, AskStarter, AskTurn, KeptNote } from './types'

// Ask Life Mirror's screen (stage A1, 2026-10-19; the agreed design's points 3 to 8): the question box first, the starters
// that have something real to say, Recent's two newest threads and one link to the rest. It never grows with history. A
// thread shows each question with its answer, a waiting question with the findings its words name, and a marker on an
// answer whose evidence has changed since. Past conversations lists every thread by month, searchable on the phone.
// Stage A2 (2026-10-20): a question for Claude says where it stands until its checked answer comes, and the answer shows
// with the findings it cited; the day's allowance, "Explain this to me", the deep tier and a thread's size limit.

/** What "Ask about this" hands the screen: what it attaches, where it was tapped, and the question in words. */
export type AskAboutThis = AboutRef & { source: AboutSource; question: string }

/** How the screen opens: on its own, on a thread, or with a finding to ask about. */
export type AskOpen = { thread: number } | { about: AskAboutThis } | null

type View = { kind: 'main' } | { kind: 'thread'; id: number } | { kind: 'past' }

const w = () => copy.askMirror
const nameOf = (moveId: string) => (hasMove(moveId) ? moveById(moveId).name : moveId)
/** How often a waiting question looks for its answer while Ask is in view: the skill coach's own pace. */
const LOOK_MS = 20_000

function ThreadRow({ whole, ev, onOpen, withTurns = false }: { whole: ThreadWhole; ev: RepairEvidence | null | undefined; onOpen: () => void; withTurns?: boolean }) {
  const s = threadState(whole.turns, ev)
  const turns = whole.turns.length === 1 ? w().turnsOne : fill(w().turnsMany, { n: String(whole.turns.length) })
  const note = [formatDayShort(whole.thread.day), ...(withTurns ? [turns] : []), w().states[s]].join(' · ')
  return <NavRow label={whole.thread.title} note={note} onClick={onOpen} testid="ask-thread-row" />
}

/** Where a question for Claude stands, in words. */
function waitWords(wait: AskWait | undefined): string {
  const c = w()
  if (!wait) return c.waiting
  return wait.kind === 'refused' ? fill(c.waits.refused, { time: formatTime(wait.retryAt) }) : c.waits[wait.kind]
}

/** The findings a question's words name, as the quick tier writes them. */
function Matches({ t, ev, title }: { t: AskTurn; ev: RepairEvidence | null | undefined; title: string }) {
  const c = w()
  const matches = ev ? matchFindings(t.question, ev) : []
  return (
    <div class="calc" data-testid="ask-matches">
      <p class="calc-line ink">{title}</p>
      {matches.length ? (
        matches.map((m) => (
          <p key={m.key} class="calc-line">
            {fill(c.finding, { move: nameOf(m.moveId), reading: readingById(m.target as ReadingId).name, window: copy.catalogue.windows[m.window as keyof typeof copy.catalogue.windows] ?? m.window, call: rungWords(m.level, m.direction) })}
          </p>
        ))
      ) : (
        <p class="calc-line">{c.matchesNone}</p>
      )}
    </div>
  )
}

/** Claude's checked answer: its words, then the findings it cited as the run read them, and who wrote it. */
function ClaudeAnswer({ a }: { a: AskAnswer }) {
  const c = w()
  return (
    <div class="ask-claude" data-testid="ask-claude">
      {(a.text ?? '')
        .split(/\n+/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} class="ask-claude-text">
            {p}
          </p>
        ))}
      {(a.facts ?? []).length > 0 && (
        <div class="calc" data-testid="ask-claude-cited">
          <p class="calc-line ink">{c.claudeCited}</p>
          {(a.facts ?? []).map((f) => (
            <p key={f.id} class="calc-line">
              {f.text}
            </p>
          ))}
        </div>
      )}
      {a.model && <p class="note faint no-gap">{fill(c.writtenBy, { model: a.model })}</p>}
    </div>
  )
}

/** "Test it" (point 13): the test a question asks about, its card, when it was last asked about, and "Test it sooner" (point 14) on any day it was not. */
function TestIt({ test, question, asked, onSooner }: { test: TestShown; question: string | null; asked: string | null; onSooner: () => void }) {
  const c = w()
  const [open, setOpen] = useState(false)
  // A context the question names is one of the pre-declared ones: that context's own reading of this test, never a new one.
  const contextLine = question ? testContextLine(test, question) : null
  const sooner = soonerOf(test, asked, blockAt(new Date()).day)
  if (!open)
    return (
      <div class="actions">
        <button type="button" class="pill-quiet" data-testid="ask-test-it" onClick={() => setOpen(true)}>
          {c.testIt}
        </button>
      </div>
    )
  return (
    <div class="calc ask-test" data-testid="ask-test-card">
      <p class="calc-line ink">{c.testTitle}</p>
      <p class="calc-line">{fill(c.finding, { move: nameOf(test.moveId), reading: readingById(test.target as ReadingId).name, window: copy.catalogue.windows[test.window as keyof typeof copy.catalogue.windows] ?? test.window, call: rungWords(test.level, test.direction) })}</p>
      <p class="calc-line">{c.testCompare}</p>
      <p class="calc-line">{c.testUnit[clsOf(test.window)]}</p>
      <p class="calc-line">{c.testSecondary}</p>
      <p class="calc-line">{c.testRule}</p>
      <p class="calc-line" data-testid="ask-test-stop">
        {fill(c.testStop, { days: String(IN_APP.queueMaxDays) })}
      </p>
      {test.began && <p class="calc-line">{fill(c.testRegistered, { date: formatDayShort(test.began) })}</p>}
      {contextLine && (
        <p class="calc-line" data-testid="ask-test-context">
          {contextLine}
        </p>
      )}
      {sooner.ownDays && (
        <p class="calc-line" data-testid="ask-test-own-days">
          {sooner.ownDays}
        </p>
      )}
      {sooner.asked && (
        <p class="calc-line" data-testid="ask-sooner-done">
          {sooner.asked}
        </p>
      )}
      {sooner.button && (
        <div class="actions">
          <button type="button" class="pill-quiet" data-testid="ask-sooner" onClick={onSooner}>
            {c.sooner}
          </button>
        </div>
      )}
    </div>
  )
}

/** "Add this as a note" (point 12): the question's own words, editable, kept as a note of today; or when it was kept. */
function KeepNote({ question, kept, onKeep }: { question: string; kept: KeptNote | null; onKeep: (text: string) => Promise<void> }) {
  const c = w()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(question)
  if (kept)
    return (
      <p class="note faint no-gap" data-testid="ask-note-kept">
        {fill(c.noteKept, { date: formatDayShort(kept.day) })}
      </p>
    )
  if (!open)
    return (
      <div class="actions">
        <button type="button" class="pill-quiet" data-testid="ask-note" onClick={() => setOpen(true)}>
          {c.noteOffer}
        </button>
      </div>
    )
  return (
    <div class="ask-note-edit" data-testid="ask-note-edit">
      <label class="setting-label" for="ask-note-text">
        {c.noteLabel}
      </label>
      <textarea id="ask-note-text" class="input note-input" rows={3} maxLength={QUESTION_MAX} value={text} data-testid="ask-note-text" onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)} />
      <button type="button" class="pill-ink" data-testid="ask-note-keep" disabled={!text.trim()} onClick={() => void onKeep(text)}>
        {c.noteKeep}
      </button>
      <div class="actions">
        <button type="button" class="textbtn" data-testid="ask-note-not-now" onClick={() => setOpen(false)}>
          {c.noteNotNow}
        </button>
      </div>
    </div>
  )
}

/** A turn: its question, then its answer as laid out or Claude's, or where it stands while it waits; and the marker. */
function Turn({ t, ev, answer, wait, onAgain, onCancel, onExplain, kept, onKeep }: { t: AskTurn; ev: RepairEvidence | null | undefined; answer?: AskAnswer; wait?: AskWait; onAgain: () => void; onCancel: () => void; onExplain?: () => void; kept: KeptNote | null; onKeep: (text: string) => Promise<void> }) {
  const c = w()
  const test = ev && t.state !== 'cancelled' ? testOfTurn(t, answer, ev) : null
  const asked = test ? ([...(t.asked ?? [])].filter((m) => m.key === test.key).sort((a, b) => (a.day < b.day ? 1 : -1))[0]?.day ?? null) : null
  const changes = ev && t.state === 'answered' ? changesOf(t.cited, ev) : []
  const claude = t.tier !== 'quick'
  // "Test it" stands under the answer: under Claude's, or the app's, or while the question waits, under the findings its words name.
  const testIt = test && t.id !== undefined ? <TestIt test={test} question={t.kind === 'typed' ? t.question : null} asked={asked} onSooner={() => void askSooner(t.id as number, test.key)} /> : null
  return (
    <div class="card pad ask-turn" data-testid="ask-turn" data-state={t.state}>
      <p class="ask-question" data-testid="ask-question">
        {t.question}
      </p>
      {t.quick && (
        <div class="calc" data-testid="ask-answer">
          {t.quick.sections.map((s, i) => (
            <div key={i} class="ask-section">
              {s.title && <p class="calc-line ink">{s.title}</p>}
              {s.lines.map((line, j) => (
                <p key={j} class="calc-line">
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
      {onExplain && (
        <div class="actions">
          <button type="button" class="pill-quiet" data-testid="ask-explain" onClick={onExplain}>
            {c.explain}
          </button>
        </div>
      )}
      {claude && answer?.status === 'answered' && <ClaudeAnswer a={answer} />}
      {claude && answer?.status === 'answered' && (answer.noteOffer || kept) && <KeepNote question={t.question} kept={kept} onKeep={onKeep} />}
      {claude && answer?.status === 'failed' && (
        <>
          <p class="note no-gap" data-testid="ask-no-checked">
            {c.noChecked}
          </p>
          <Matches t={t} ev={ev} title={c.matchesTitle} />
        </>
      )}
      {!(t.state === 'waiting' && !answer) && testIt}
      {t.state === 'waiting' && !answer && (
        <>
          <p class="note no-gap" data-testid="ask-waiting" data-wait={wait?.kind ?? ''}>
            {waitWords(wait)}
          </p>
          <Matches t={t} ev={ev} title={c.matchesTitle} />
          {testIt}
          <div class="actions">
            <button type="button" class="textbtn" data-testid="ask-cancel" onClick={onCancel}>
              {c.cancel}
            </button>
          </div>
        </>
      )}
      {t.state === 'cancelled' && (
        <p class="note faint no-gap" data-testid="ask-cancelled">
          {c.cancelled}
        </p>
      )}
      {changes.length > 0 && (
        <div class="ask-changed" data-testid="ask-changed">
          <p class="calc-line ink">{c.changed}</p>
          {changeLines(changes).map((line, i) => (
            <p key={i} class="calc-line" data-testid="ask-change">
              {line}
            </p>
          ))}
          <div class="actions">
            <button type="button" class="pill-quiet" data-testid="ask-again" onClick={onAgain}>
              {c.askAgain}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The question box: a new thread from the main view, a follow-up in a thread. */
function Box({ label, onAsk }: { label: string; onAsk: (text: string) => Promise<void> }) {
  const c = w()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async (e: Event) => {
    e.preventDefault()
    if (busy || !text.trim()) return
    setBusy(true)
    try {
      await onAsk(text)
      setText('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form class="card pad ask-box" onSubmit={(e) => void send(e)}>
      <label class="setting-label" for="ask-box">
        {label}
      </label>
      <textarea id="ask-box" class="input note-input" rows={3} maxLength={QUESTION_MAX} placeholder={c.boxHint} value={text} data-testid="ask-box" onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)} />
      <div class="actions">
        <button type="submit" class="pill-ink" data-testid="ask-send" disabled={busy || !text.trim()}>
          {c.send}
        </button>
      </div>
    </form>
  )
}

function monthOf(at: string): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/**
 * While a question for Claude waits and Ask is in view: every 20 seconds, a look at the few brain rows that would bring its
 * answer or its run's state, by key, and a whole sync only when one changed; and a look at once whenever the app comes back
 * into view. Nothing while nothing waits.
 */
function useWaitingAsk(waiting: readonly number[]): void {
  const day = blockAt(new Date()).day
  const keys = askWaitingKeys(waiting, day)
  const key = keys.map((k) => `${k.store}|${k.id}`).join(',')
  useEffect(() => {
    if (!keys.length) return
    const look = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void peekBrain(keys)
    }
    const timer = setInterval(look, LOOK_MS)
    const onShow = () => {
      if (document.visibilityState === 'visible') look()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
    // The keys stand for themselves: a new waiting question, or a new day, starts the look over.
  }, [key])
}

export function AskScreen({ open, onClose }: { open: AskOpen; onClose: () => void }) {
  const c = w()
  const [view, setView] = useState<View>(open && 'thread' in open ? { kind: 'thread', id: open.thread } : { kind: 'main' })
  const [tick, setTick] = useState(0)
  const [ev, setEv] = useState<RepairEvidence | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [query, setQuery] = useState('')
  const all = useLive(allThreads, [])
  const last = useLive(lastRead, [])
  const answers = useLive(() => db.askAnswers.toArray(), [])
  const notes = useLive(() => db.notes.toArray(), [])
  const runs = useLive(() => db.askRuns.toArray(), [])
  const waits = useLive(() => askWaits(), [tick])
  const allowance = useLive(() => askAllowance(), [tick])
  // The repair's read: once on opening, and again after each question, so the starters and markers follow it.
  useEffect(() => {
    void askEvidence().then(setEv)
  }, [tick])
  // "Ask about this": the thread begins at once, with the finding attached, and opens.
  useEffect(() => {
    if (!open || !('about' in open)) return
    const { source, question, ...ref } = open.about
    void askAbout(ref as AboutRef, source, question).then((id) => {
      if (id === null) setFailed(true)
      else setView({ kind: 'thread', id })
    })
  }, [])
  // An answer that came for a question still waiting: the turn is marked answered, with the findings it cited.
  const answered = (answers ?? []).map((a) => a.id).join(',')
  useEffect(() => {
    if (answered) void settleAskTurns()
  }, [answered])
  useWaitingAsk([...(waits?.keys() ?? [])])
  const done = (id: number | null) => {
    setTick((n) => n + 1)
    if (id === null) setFailed(true)
    else {
      setFailed(false)
      setView({ kind: 'thread', id })
    }
  }
  const starter = async (s: Exclude<AskStarter, 'deep'>) => done(await askStarter(s))
  const answerOf = (t: AskTurn) => (answers ?? []).find((a) => a.turnId === t.id)

  if (view.kind === 'thread') {
    const whole = all?.find((x) => x.thread.id === view.id)
    const full = (whole?.turns.length ?? 0) >= THREAD_TURNS_MAX
    const reached = whole ? reachedAny(whole.turns.map((t) => t.id as number), answers ?? [], runs ?? []) : false
    return (
      <section class="screen ask" data-testid="ask-thread">
        <SubHead title={c.title} back={c.back} onBack={() => setView({ kind: 'main' })} />
        {whole && (
          <>
            {whole.turns.map((t) => (
              <Turn
                key={t.id}
                t={t}
                ev={ev}
                answer={answerOf(t)}
                wait={waits?.get(t.id as number)}
                onAgain={() => void askAgain(t.id as number).then((ok) => (ok ? setTick((n) => n + 1) : setFailed(true)))}
                onCancel={() => void cancelTurn(t.id as number)}
                onExplain={allowance && t.kind === 'know' && t.state === 'answered' && !full ? () => void askExplain(view.id).then(() => setTick((n) => n + 1)) : undefined}
                kept={(notes ?? []).find((n) => n.turnId === t.id) ?? null}
                onKeep={async (text) => void (await keepNote(t.id as number, text))}
              />
            ))}
            {full ? (
              <p class="note" data-testid="ask-too-long">
                {c.tooLong}
              </p>
            ) : (
              <Box label={c.followUp} onAsk={async (text) => void (await askTyped(text, view.id), setTick((n) => n + 1))} />
            )}
            {confirming ? (
              <div class="card pad" data-testid="ask-delete-confirm">
                <p class="note no-gap">{c.removeConfirm}</p>
                {reached && (
                  <p class="note no-gap" data-testid="ask-delete-copy">
                    {c.removeCopy}
                  </p>
                )}
                <div class="actions">
                  <button
                    type="button"
                    class="pill-quiet"
                    data-testid="ask-delete-yes"
                    onClick={() =>
                      void deleteThread(view.id).then(() => {
                        setConfirming(false)
                        setView({ kind: 'main' })
                      })
                    }
                  >
                    {c.removeYes}
                  </button>
                  <button type="button" class="textbtn" data-testid="ask-delete-no" onClick={() => setConfirming(false)}>
                    {c.removeNo}
                  </button>
                </div>
              </div>
            ) : (
              <div class="actions">
                <button type="button" class="textbtn" data-testid="ask-delete" onClick={() => setConfirming(true)}>
                  {c.remove}
                </button>
              </div>
            )}
          </>
        )}
        {failed && <p class="note" data-testid="ask-failed">{c.readFailed}</p>}
      </section>
    )
  }

  if (view.kind === 'past') {
    const shown = searchThreads(all ?? [], query)
    const months: { month: string; items: ThreadWhole[] }[] = []
    for (const whole of shown) {
      const m = monthOf(whole.thread.at)
      const group = months[months.length - 1]
      if (group && group.month === m) group.items.push(whole)
      else months.push({ month: m, items: [whole] })
    }
    return (
      <section class="screen ask" data-testid="ask-past">
        <SubHead title={c.pastTitle} back={c.back} onBack={() => setView({ kind: 'main' })} />
        <input type="search" class="input" placeholder={c.search} aria-label={c.search} value={query} data-testid="ask-search" onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
        {months.map((g) => (
          <div key={g.month}>
            <h2 class="section">{g.month}</h2>
            <div class="card">
              <ul class="rows">
                {g.items.map((whole) => (
                  <ThreadRow key={whole.thread.id} whole={whole} ev={ev} withTurns onOpen={() => setView({ kind: 'thread', id: whole.thread.id as number })} />
                ))}
              </ul>
            </div>
          </div>
        ))}
        {all && !all.length && <p class="note">{c.noneYet}</p>}
        {all && all.length > 0 && !shown.length && <p class="note" data-testid="ask-no-match">{c.noMatch}</p>}
      </section>
    )
  }

  const starters = ev ? startersShown(ev, last ?? null).filter((s): s is Exclude<AskStarter, 'deep'> => s !== 'deep') : []
  // "Coach me on everything" (the deep tier): once the record has findings and today's allowance holds it, with its cost.
  const deep = Boolean(allowance?.deep && starters.includes('know'))
  const recent = (all ?? []).slice(0, 2)
  return (
    <section class="screen ask" data-testid="ask">
      <SubHead title={c.title} back={c.back} onBack={onClose} />
      <p class="note">{c.intro}</p>
      {allowance && (
        <p class="note faint" data-testid="ask-allowance">
          {allowance.left > 0 ? fill(c.allowance, { n: String(allowance.left), m: String(allowance.of) }) : c.allowanceNone}
        </p>
      )}
      <Box label={c.box} onAsk={async (text) => done(await askTyped(text, null))} />
      {(starters.length > 0 || deep) && (
        <div class="ask-starters" role="group" aria-label={c.title}>
          {starters.map((s) => (
            <button key={s} type="button" class="pill-quiet" data-testid={`ask-starter-${s}`} onClick={() => void starter(s)}>
              {c.starters[s]}
            </button>
          ))}
          {deep && (
            <div class="ask-deep">
              <button type="button" class="pill-quiet" data-testid="ask-starter-deep" onClick={() => void askDeep().then((id) => done(id))}>
                {c.starters.deep}
              </button>
              <p class="note faint no-gap" data-testid="ask-deep-cost">
                {fill(c.deepCost, { n: String(DEEP_COUNTS) })}
              </p>
            </div>
          )}
        </div>
      )}
      {failed && <p class="note" data-testid="ask-failed">{c.readFailed}</p>}
      {recent.length > 0 && (
        <>
          <h2 class="section">{c.recent}</h2>
          <div class="card">
            <ul class="rows">
              {recent.map((whole) => (
                <ThreadRow key={whole.thread.id} whole={whole} ev={ev} onOpen={() => setView({ kind: 'thread', id: whole.thread.id as number })} />
              ))}
            </ul>
          </div>
          <div class="card">
            <ul class="rows">
              <NavRow label={c.past} note={(all?.length ?? 0) === 1 ? c.pastOne : fill(c.pastMany, { n: String(all?.length ?? 0) })} onClick={() => setView({ kind: 'past' })} testid="ask-past-open" />
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
