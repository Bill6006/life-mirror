import { useEffect, useState } from 'preact/hooks'
import { NavRow } from '../controls'
import { copy } from '../copy'
import { fill, formatDayShort } from '../format'
import { useLive } from '../live'
import type { RepairEvidence } from '../repair/evidence'
import { rungWords } from '../repair/words'
import { readingById, type ReadingId } from '../readings'
import { hasMove, moveById } from '../catalogue'
import { SubHead } from '../ui'
import { changesOf, threadState } from './evidence'
import { allThreads, askAbout, askAgain, askEvidence, askStarter, askTyped, cancelTurn, deleteThread, lastRead, QUESTION_MAX, searchThreads, type AboutRef, type ThreadWhole } from './flow'
import { matchFindings } from './match'
import { changeLines, startersShown } from './quick'
import type { AboutSource, AskStarter, AskTurn } from './types'

// Ask Life Mirror's screen (stage A1, 2026-10-19; the agreed design's points 3 to 8): the question box first, the starters
// that have something real to say, Recent's two newest threads and one link to the rest. It never grows with history. A
// thread shows each question with its answer, a waiting question with the findings its words name, and a marker on an
// answer whose evidence has changed since. Past conversations lists every thread by month, searchable on the phone.

/** What "Ask about this" hands the screen: what it attaches, where it was tapped, and the question in words. */
export type AskAboutThis = AboutRef & { source: AboutSource; question: string }

/** How the screen opens: on its own, on a thread, or with a finding to ask about. */
export type AskOpen = { thread: number } | { about: AskAboutThis } | null

type View = { kind: 'main' } | { kind: 'thread'; id: number } | { kind: 'past' }

const w = () => copy.askMirror
const nameOf = (moveId: string) => (hasMove(moveId) ? moveById(moveId).name : moveId)

function ThreadRow({ whole, ev, onOpen, withTurns = false }: { whole: ThreadWhole; ev: RepairEvidence | null | undefined; onOpen: () => void; withTurns?: boolean }) {
  const s = threadState(whole.turns, ev)
  const turns = whole.turns.length === 1 ? w().turnsOne : fill(w().turnsMany, { n: String(whole.turns.length) })
  const note = [formatDayShort(whole.thread.day), ...(withTurns ? [turns] : []), w().states[s]].join(' · ')
  return <NavRow label={whole.thread.title} note={note} onClick={onOpen} testid="ask-thread-row" />
}

/** A turn: its question, then its answer as laid out, or the waiting state with the findings its words name; and the marker. */
function Turn({ t, ev, onAgain, onCancel }: { t: AskTurn; ev: RepairEvidence | null | undefined; onAgain: () => void; onCancel: () => void }) {
  const c = w()
  const changes = ev && t.state === 'answered' ? changesOf(t.cited, ev) : []
  const matches = ev && t.state === 'waiting' ? matchFindings(t.question, ev) : []
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
      {t.state === 'waiting' && (
        <>
          <p class="note no-gap" data-testid="ask-waiting">
            {c.waiting}
          </p>
          <div class="calc" data-testid="ask-matches">
            <p class="calc-line ink">{c.matchesTitle}</p>
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
  const done = (id: number | null) => {
    setTick((n) => n + 1)
    if (id === null) setFailed(true)
    else {
      setFailed(false)
      setView({ kind: 'thread', id })
    }
  }
  const starter = async (s: Exclude<AskStarter, 'deep'>) => done(await askStarter(s))

  if (view.kind === 'thread') {
    const whole = all?.find((x) => x.thread.id === view.id)
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
                onAgain={() => void askAgain(t.id as number).then((ok) => (ok ? setTick((n) => n + 1) : setFailed(true)))}
                onCancel={() => void cancelTurn(t.id as number)}
              />
            ))}
            <Box label={c.followUp} onAsk={async (text) => void (await askTyped(text, view.id), setTick((n) => n + 1))} />
            {confirming ? (
              <div class="card pad" data-testid="ask-delete-confirm">
                <p class="note no-gap">{c.removeConfirm}</p>
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
  const recent = (all ?? []).slice(0, 2)
  return (
    <section class="screen ask" data-testid="ask">
      <SubHead title={c.title} back={c.back} onBack={onClose} />
      <p class="note">{c.intro}</p>
      <Box label={c.box} onAsk={async (text) => done(await askTyped(text, null))} />
      {starters.length > 0 && (
        <div class="ask-starters" role="group" aria-label={c.title}>
          {starters.map((s) => (
            <button key={s} type="button" class="pill-quiet" data-testid={`ask-starter-${s}`} onClick={() => void starter(s)}>
              {c.starters[s]}
            </button>
          ))}
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
