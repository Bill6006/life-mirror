import { useState } from 'preact/hooks'
import { moves, pathReps, paths, strandsOf, type Move, type Path } from './catalogue'
import { copy } from './copy'
import { db, getSettings, type Aim } from './db'
import type { WeekShape } from './settings'
import { fill } from './format'
import { cardById, library } from './library'
import type { ClaimCard } from './libraryTypes'
import { compiledPaths } from './pathCheck'
import { useLive } from './live'
import { setAsidePath, startPath } from './measureFlow'
import { WhyBuilt } from './pathMeasureUi'
import { pathName } from './pathStage'
import { standing } from './pathVersions'
import { Disclosure, Tag } from './ui'

// A Path the catalogue adds, before it runs (P1 and P4 of the AI-generated Paths design, 2026-11-06):
// one screen to read, labelled for what it is, with Start, Later and Not this; then, for a Path with a
// start, its two questions, the app's own help on a yes, and where it starts. Nothing is offered until
// you start it, and a later version that changes it in a major way waits for you to read what changed.

/** The Paths the catalogue adds that pass the compiler's checks, run again on the phone: the only ones the add sheet and the Aims tab offer. */
export function addedPaths(all: readonly Path[] = paths, reps: readonly Move[] = moves, cards: readonly Pick<ClaimCard, 'id' | 'status'>[] = library): Path[] {
  return compiledPaths(all.filter((p) => !p.builtIn), reps, cards)
}

function labelOf(path: Path): string | null {
  return path.label ? (copy.path.read.label[path.label] ?? path.label) : null
}

/** On Aims: each Path the catalogue adds that you have not decided on yet, with Read it. Later or Not this puts it away; the add sheet still has it. */
export function NewPathCards({ aims, onRead }: { aims: readonly Aim[]; onRead: (path: string) => void }) {
  const versions = useLive(() => db.pathVersions.toArray(), [])
  if (!versions) return null
  const c = copy.path.read
  const undecided = (p: Path) => {
    const s = standing(p, versions)
    return s.kind === 'proposed' && !s.later
  }
  const shown = addedPaths().filter((p) => !aims.some((a) => a.kind === 'path' && a.path === p.id) && undecided(p))
  return (
    <>
      {shown.map((p) => (
        <div key={p.id} class="card pad" data-testid="path-new" data-path={p.id}>
          <p class="eyebrow">{c.card}</p>
          <p class="rep-title">{pathName(p)}</p>
          <p class="note">{fill(c.cardNote, { name: p.names?.add ?? pathName(p), label: (labelOf(p) ?? '').toLowerCase() })}</p>
          <div class="actions">
            <button type="button" class="pill-quiet" data-testid="path-new-read" onClick={() => onRead(p.id)}>
              {c.open}
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

/** The decisions' origins, counted, in the order the scale runs. */
function originsLine(path: Path): string {
  const c = copy.path.read
  const order = ['direct', 'indirect', 'mechanism', 'expert', 'inference', 'judgment']
  const counts = order.map((o) => [o, (path.decisions ?? []).filter((d) => d.origin === o).length] as const).filter(([, n]) => n > 0)
  return counts.map(([o, n]) => fill(c.originCount, { n: String(n), origin: c.origins[o] })).join(', ')
}

/** The stages whose stage-moving reps all ask for a place you go each week or a group: what the week must hold for them. */
export function stagesNeedingAPlace(path: Path): string[] {
  const out: string[] = []
  for (const s of strandsOf(path)) {
    for (const st of s.stages) {
      const moving = pathReps(path.id, st.n, s.id).filter((m) => m.path?.[path.id]?.advances && m.path?.[path.id]?.stage === st.n)
      const kinds = new Set(moving.flatMap((m) => m.settings ?? []))
      if (kinds.size && [...kinds].every((k) => k === 'recurring' || k === 'group')) out.push(st.name)
    }
  }
  return out
}

/** The places your week holds by its schedule: the office days, and a church day (the Third Day read as Tuesday when unset). */
export function weekPlaces(week: Pick<WeekShape, 'officeDays' | 'churchDay' | 'thirdDay'>): { office: number; church: boolean } {
  return { office: Object.values(week.officeDays).filter(Boolean).length, church: week.churchDay !== null || week.thirdDay !== null }
}

/** Your week read against the stages, in one line. */
export function weekLine(path: Path, week: Pick<WeekShape, 'officeDays' | 'churchDay' | 'thirdDay'>): string {
  const c = copy.path.read
  const need = stagesNeedingAPlace(path)
  if (!need.length) return c.weekAll
  const { office, church } = weekPlaces(week)
  const places = [office ? fill(office === 1 ? c.officeOne : c.office, { n: String(office) }) : null, church ? c.church : null].filter(Boolean).join(' and ')
  return places ? fill(c.weekHas, { places, stages: need.join('; ') }) : fill(c.weekNone, { stages: need.join('; ') })
}

/** What a Path asks a week: its reps' minutes and the usual one, one a day at most, on its share of days beside another path or every day alone. */
export function minutesLine(path: Path): string {
  const minutes = pathReps(path.id).map((m) => m.minutes).sort((a, b) => a - b)
  if (!minutes.length) return ''
  const typ = minutes[Math.floor(minutes.length / 2)]
  return fill(copy.path.read.minutes, { lo: String(minutes[0]), hi: String(minutes[minutes.length - 1]), typ: String(typ), week: String(typ * (path.traits.rowShare ?? 7)), alone: String(typ * 7) })
}

/** One screen to read before a Path the catalogue adds runs: what it is, what it asks, its strands, your week, what counts and never counts, what it leaves out, what it rests on; Start, Later or Not this. */
export function PathReadScreen({ pathId, onStart, onClose }: { pathId: string; onStart: () => void; onClose: () => void }) {
  const versions = useLive(() => db.pathVersions.toArray(), [])
  const settings = useLive(getSettings, [])
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const path = addedPaths().find((p) => p.id === pathId)
  if (!versions || !settings) return <section class="screen" />
  if (!path || path.builtIn) {
    onClose()
    return <section class="screen" />
  }
  const c = copy.path.read
  const st = standing(path, versions)
  const label = labelOf(path)
  const disputed = path.cards.filter((id) => cardById(id)?.status === 'disputed').length
  const least = path.decisions?.find((d) => d.element === 'structure')?.uncertainty
  return (
    <section class="screen" data-testid="path-read" data-path={path.id}>
      <header class="screen-head">
        <p class="eyebrow">{st.kind === 'waiting' ? c.waiting : c.eyebrow}</p>
      </header>
      <h1 class="title">{pathName(path)}</h1>
      {label && (
        <p data-testid="path-read-label">
          <Tag>{label}</Tag>
        </p>
      )}
      <p class="note">{path.what}</p>
      {st.kind === 'waiting' && (
        <div class="calc" data-testid="path-read-changed">
          <p class="calc-line ink">{c.changed}</p>
          {st.changes.map((ch) => (
            <p key={ch.version} class="calc-line">
              {ch.version} · {ch.what}
            </p>
          ))}
        </div>
      )}
      {st.kind === 'declined' && (
        <p class="note" data-testid="path-read-declined">
          {c.declined}
        </p>
      )}
      {st.kind === 'proposed' && st.later && (
        <p class="note" data-testid="path-read-set-aside">
          {c.setAside}
        </p>
      )}
      <div class="calc evidence">
        <div class="ev" data-testid="path-read-asks">
          <span class="calc-key">{c.asks}</span>
          <span class="calc-line">{minutesLine(path)}</span>
          {path.timeline && <span class="calc-line">{path.timeline}</span>}
        </div>
        <div class="ev" data-testid="path-read-strands">
          <span class="calc-key">{c.strands}</span>
          {(path.strands ?? []).map((s) => (
            <span key={s.id} class="calc-line">
              <span class="ink">{s.name}</span>: {s.stages.map((x) => x.name).join(' · ')}
            </span>
          ))}
        </div>
        <div class="ev" data-testid="path-read-week">
          <span class="calc-key">{c.week}</span>
          <span class="calc-line">{weekLine(path, settings.week)}</span>
        </div>
        <div class="ev">
          <span class="calc-key">{c.counted}</span>
          <span class="calc-line">{path.counted}</span>
        </div>
        <div class="ev">
          <span class="calc-key">{c.never}</span>
          <span class="calc-line">{path.neverCounted.join('; ')}.</span>
        </div>
        {path.excluded.length > 0 && (
          <div class="ev">
            <span class="calc-key">{c.left}</span>
            {path.excluded.map((e) => (
              <span key={e.what} class="calc-line">
                {e.what}: {e.why}
              </span>
            ))}
          </div>
        )}
        <div class="ev" data-testid="path-read-basis">
          <span class="calc-key">{c.basis}</span>
          {path.decisions?.length ? <span class="calc-line">{fill(c.basisLine, { n: String(path.decisions.length), origins: originsLine(path) })}</span> : null}
          <span class="calc-line">{fill(c.cards, { n: String(path.cards.length), d: String(disputed) })}</span>
          {least && <span class="calc-line">{fill(c.leastSure, { text: least })}</span>}
        </div>
      </div>
      {path.decisions?.length ? (
        <Disclosure label={c.why} testid="path-read-why">
          <WhyBuilt path={path} />
        </Disclosure>
      ) : null}
      {declining ? (
        <>
          <p class="setting-label">{c.notThisReason}</p>
          <div class="add">
            <input class="input" type="text" maxLength={140} aria-label={c.notThisReason} value={reason} data-testid="path-read-reason" onInput={(e) => setReason((e.currentTarget as HTMLInputElement).value)} />
          </div>
          <div class="actions">
            <button type="button" class="pill-quiet" data-testid="path-read-notthis-confirm" onClick={() => void setAsidePath(path, 'notThis', reason).then(onClose)}>
              {c.notThis}
            </button>
            <button type="button" class="textbtn" onClick={() => setDeclining(false)}>
              {copy.checkin.close}
            </button>
          </div>
        </>
      ) : (
        <div class="actions">
          <button type="button" class="pill-ink" data-testid="path-read-start" onClick={onStart}>
            {st.kind === 'waiting' ? c.continue : c.start}
          </button>
          <button type="button" class="textbtn" data-testid="path-read-later" onClick={() => void setAsidePath(path, 'later').then(onClose)}>
            {c.later}
          </button>
          <button type="button" class="textbtn faint" data-testid="path-read-notthis" onClick={() => setDeclining(true)}>
            {c.notThis}
          </button>
        </div>
      )}
    </section>
  )
}

/** The strands a focus choice turns on: a strand's own id, or every strand but the one a yes opens. */
export function strandsFor(path: Pick<Path, 'strands' | 'start'>, focus: string, nerves: boolean): string[] {
  const all = (path.strands ?? []).map((s) => s.id)
  const opens = path.start?.opens
  const base = all.includes(focus) && focus !== opens ? [focus] : all.filter((id) => id !== opens)
  return all.filter((id) => base.includes(id) || (nerves && id === opens))
}

/**
 * The start of a Path with strands: its two questions, yes or no, never kept; on a yes, the app's own
 * help first and the strand it opens turned on, yours to turn off; then where it starts. A version a
 * major change left waiting continues here as it stands, the strands you have on kept.
 */
export function PathStartScreen({ pathId, onDone, onBack }: { pathId: string; onDone: () => void; onBack: () => void }) {
  const aims = useLive(() => db.aims.filter((a) => a.archivedAt === null && a.kind === 'path' && a.path === pathId).toArray(), [pathId])
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [focus, setFocus] = useState<string | null>(null)
  const [nerves, setNerves] = useState<boolean | null>(null)
  const path = addedPaths().find((p) => p.id === pathId)
  if (!aims) return <section class="screen" />
  if (!path || path.builtIn) {
    onBack()
    return <section class="screen" />
  }
  const c = copy.path.start
  const start = path.start
  const yes = Object.values(answers).some(Boolean)
  const nervesOn = nerves ?? yes
  const opens = start ? path.strands?.find((s) => s.id === start.opens) : undefined
  const existing = aims[0] as Aim | undefined
  // Started already (a version waiting): continue with the strands you have on.
  if (existing?.strands?.length) {
    return (
      <section class="screen" data-testid="path-start">
        <header class="screen-head">
          <p class="eyebrow">{c.eyebrow}</p>
        </header>
        <h1 class="title">{pathName(path)}</h1>
        <div class="actions">
          <button type="button" class="pill-ink" data-testid="path-start-begin" onClick={() => void startPath(path, existing.strands as string[]).then(onDone)}>
            {copy.path.read.continue}
          </button>
          <button type="button" class="textbtn" onClick={onBack}>
            {copy.checkin.close}
          </button>
        </div>
      </section>
    )
  }
  return (
    <section class="screen" data-testid="path-start">
      <header class="screen-head">
        <p class="eyebrow">{c.eyebrow}</p>
      </header>
      <h1 class="title">{pathName(path)}</h1>
      {start && (
        <>
          <p class="note">{c.questionsNote}</p>
          {start.questions.map((q) => (
            <div key={q.id} class="ease" data-testid="path-start-question">
              <span class="sub ink">{q.text}</span>
              <span class="when" role="group" aria-label={q.text}>
                {([true, false] as const).map((v) => (
                  <button key={String(v)} type="button" class={answers[q.id] === v ? 'when-chip is-on' : 'when-chip'} aria-pressed={answers[q.id] === v} data-testid={`path-start-${q.id}-${v ? 'yes' : 'no'}`} onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}>
                    {v ? c.yes : c.no}
                  </button>
                ))}
              </span>
            </div>
          ))}
          {yes && (
            <p class="note ink" data-testid="path-start-help">
              {start.help}
            </p>
          )}
          <p class="setting-label">{c.focus}</p>
          <span class="when" role="group" aria-label={c.focus}>
            {start.focus.map((f) => (
              <button key={f.id} type="button" class={focus === f.id ? 'when-chip is-on' : 'when-chip'} aria-pressed={focus === f.id} data-testid={`path-start-focus-${f.id}`} onClick={() => setFocus(f.id)}>
                {f.words}
              </button>
            ))}
          </span>
          {opens && (
            <div class="ease">
              <span class="when" role="group" aria-label={c.nerves}>
                <button type="button" class={nervesOn ? 'when-chip is-on' : 'when-chip'} aria-pressed={nervesOn} data-testid="path-start-nerves" onClick={() => setNerves(!nervesOn)}>
                  {fill(c.nerves, { name: opens.name })}
                </button>
              </span>
              <span class="sub">{opens.what}</span>
            </div>
          )}
        </>
      )}
      <div class="actions">
        <button type="button" class="pill-ink" data-testid="path-start-begin" disabled={Boolean(start) && focus === null} onClick={() => void startPath(path, start && focus ? strandsFor(path, focus, nervesOn) : (path.strands ?? []).map((s) => s.id)).then(onDone)}>
          {c.begin}
        </button>
        <button type="button" class="textbtn" onClick={onBack}>
          {copy.checkin.close}
        </button>
      </div>
    </section>
  )
}

