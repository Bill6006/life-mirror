import { useState } from 'preact/hooks'
import { findPath } from './catalogue'
import { copy } from './copy'
import { db, type PathRequest } from './db'
import { fill } from './format'
import { useLive } from './live'
import { requestState } from './pathJob'
import { MINUTES, requestPath, routeOf, WHERE, withdrawRequest } from './pathRequestFlow'
import type { Triage } from './pathTriage'
import { Disclosure } from './ui'

// Asking for a Path (P5), on the phone: the goal in your words, why once, and four questions with defaults; the
// route the rules give it, with the app's own help for every route that is not a Path; and your requests, each with
// where its job stands. Nothing here is model-written, and nothing starts without your tap on what comes back.

/** The app's own words for a route: help for a risk, a pointer to what covers it, or what happens next. */
export function routeWords(t: Triage): string {
  const r = copy.path.make.routes
  if (t.route === 'fits') return r.fits
  if (t.route === 'redirect' && t.practice) return r.practice
  if (t.route === 'redirect') {
    // Abuse: the Partner path's own fixed help, the same words its monthly check shows.
    const help = t.kind === 'abuse' ? (findPath('partner')?.acts?.find((a) => a.id === 'monthly-check')?.help ?? '') : ''
    return [help, r.redirect[t.kind ?? ''] ?? r.redirect.abuse].filter(Boolean).join(' ')
  }
  if (t.route === 'existing') return r.existing[t.to ?? ''] ?? r.notAPath
  if (t.route === 'refuse') return r.refuse[t.kind ?? ''] ?? r.refuse.others
  return t.route === 'notAPath' ? r.notAPath : r.unclear
}

/** Under Aims → Add: the intake, then the route and its words; a request the rules route as a Path waits for a draft. */
export function MakePathScreen({ onClose }: { onClose: () => void }) {
  const c = copy.path.make
  const [goal, setGoal] = useState('')
  const [why, setWhy] = useState('')
  const [where, setWhere] = useState<string[]>([])
  const [month, setMonth] = useState('')
  const [minutes, setMinutes] = useState<number>(90)
  const [offLimits, setOffLimits] = useState('')
  const [asked, setAsked] = useState<Triage | null>(null)
  const input = (label: string, value: string, set: (v: string) => void, testid: string, max: number, placeholder = '') => (
    <>
      <p class="setting-label">{label}</p>
      <div class="add">
        <input class="input" type="text" maxLength={max} aria-label={label} placeholder={placeholder} value={value} data-testid={testid} onInput={(e) => set((e.currentTarget as HTMLInputElement).value)} />
      </div>
    </>
  )
  if (asked) {
    // Unclear: asked again in place, nothing waiting.
    return (
      <section class="screen" data-testid="make-path">
        <header class="screen-head">
          <p class="eyebrow">{c.eyebrow}</p>
        </header>
        <p class="note ink" data-testid="make-path-route" data-route={asked.route}>
          {routeWords(asked)}
        </p>
        <div class="actions">
          {asked.route === 'unclear' ? (
            <button type="button" class="pill-ink" data-testid="make-path-again" onClick={() => setAsked(null)}>
              {c.retry}
            </button>
          ) : (
            <button type="button" class="pill-ink" data-testid="make-path-done" onClick={onClose}>
              {c.done}
            </button>
          )}
        </div>
      </section>
    )
  }
  const ask = async () => {
    const answers = { goal, why, where, month, minutes, offLimits }
    // Too vague is asked again before anything is kept.
    const t = routeOf(answers)
    if (t.route === 'unclear') return setAsked(t)
    const { triage } = await requestPath(answers)
    setAsked(triage)
  }
  return (
    <section class="screen" data-testid="make-path">
      <header class="screen-head">
        <p class="eyebrow">{c.eyebrow}</p>
      </header>
      {input(c.goal, goal, setGoal, 'make-path-goal', 200, c.goalPlaceholder)}
      {input(c.why, why, setWhy, 'make-path-why', 300)}
      <p class="setting-label">{c.where}</p>
      <span class="when" role="group" aria-label={c.where}>
        {WHERE.map((w) => (
          <button key={w} type="button" class={where.includes(w) ? 'when-chip is-on' : 'when-chip'} aria-pressed={where.includes(w)} data-testid={`make-path-where-${w}`} onClick={() => setWhere((xs) => (xs.includes(w) ? xs.filter((x) => x !== w) : [...xs, w]))}>
            {c.places[w]}
          </button>
        ))}
      </span>
      <p class="sub">{c.whereNote}</p>
      {input(c.month, month, setMonth, 'make-path-month', 300)}
      <p class="setting-label">{c.minutes}</p>
      <span class="when" role="group" aria-label={c.minutes}>
        {MINUTES.map((n) => (
          <button key={n} type="button" class={minutes === n ? 'when-chip is-on' : 'when-chip'} aria-pressed={minutes === n} data-testid={`make-path-minutes-${n}`} onClick={() => setMinutes(n)}>
            {fill(c.minutesValue, { n: String(n) })}
          </button>
        ))}
      </span>
      {input(c.offLimits, offLimits, setOffLimits, 'make-path-off', 300)}
      <p class="note">{c.privacy}</p>
      <div class="actions">
        <button type="button" class="pill-ink" data-testid="make-path-ask" disabled={!goal.trim()} onClick={() => void ask()}>
          {c.ask}
        </button>
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.checkin.close}
        </button>
      </div>
    </section>
  )
}

/** On Aims: your requests of the last thirty days, newest first, each with where its job stands; a ready one is read from here. */
export function PathRequestsCard({ onRead, today }: { onRead: (path: string) => void; today: string }) {
  const rows = useLive(() => Promise.all([db.pathRequests.toArray(), db.pathJobs.toArray()]), [])
  if (!rows) return null
  const [requests, jobs] = rows
  const since = new Date(new Date(`${today}T12:00:00`).getTime() - 30 * 86_400_000).toISOString()
  const shown = requests.filter((r) => r.at >= since).sort((a, b) => (a.at < b.at ? 1 : -1))
  if (!shown.length) return null
  const c = copy.path.make
  return (
    <div class="card pad" data-testid="path-requests">
      <p class="eyebrow">{c.requests}</p>
      {shown.map((r) => (
        <RequestRow key={r.id} r={r} job={jobs.find((j) => j.requestId === r.id)} onRead={onRead} />
      ))}
    </div>
  )
}

function RequestRow({ r, job, onRead }: { r: PathRequest; job: { state: string; pathId?: string; reasons?: string[] } | undefined; onRead: (path: string) => void }) {
  const c = copy.path.make
  const state = requestState(r, job as never)
  // The rules are the same every time: the words shown at the intake, from the request's own words.
  const triage = routeOf({ goal: r.goal, why: r.why, offLimits: r.offLimits })
  return (
    <div class="ease" data-testid="path-request" data-state={state}>
      <span class="sub ink">{r.goal}</span>
      <span class="sub" data-testid="path-request-state">
        {state === 'triaged' ? routeWords(triage) : c.states[state]}
        {state === 'failed' || state === 'refused' || state === 'abstained' ? ` ${c.again}` : ''}
      </span>
      {job?.reasons?.length ? (
        <Disclosure label={c.reasons} testid="path-request-reasons">
          <ul class="calc">
            {job.reasons.map((x, k) => (
              <li key={k} class="calc-line">
                {x}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      <div class="actions">
        {state === 'ready' && job?.pathId && findPath(job.pathId) ? (
          <button type="button" class="pill-quiet" data-testid="path-request-read" onClick={() => onRead(job.pathId as string)}>
            {c.read}
          </button>
        ) : null}
        {state === 'queued' && !job ? (
          <button type="button" class="textbtn faint" data-testid="path-request-withdraw" onClick={() => void withdrawRequest(r.id as number)}>
            {c.withdraw}
          </button>
        ) : null}
      </div>
    </div>
  )
}

