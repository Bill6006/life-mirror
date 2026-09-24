import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { kindIcon, planState, PlanTap, RowFrame, startedWhen, When, useQuarterMinute } from './aimCard'
import { Icon } from './icons'
import { ClampText, Disclosure, Facts, StageProgress } from './ui'
import { lastLine, type CueCount } from './aims'
import { blockAt, type Block } from './blocks'
import { hasMove, moveById, type Move, type Path, type PathId, type SettingKind } from './catalogue'
import { copy } from './copy'
import { db, getDayContext, getSettings, type Aim, type Cue, type DayContext, type Intention, type Offer } from './db'
import { fill, formatTime } from './format'
import { useLive } from './live'
import { doneOpen, recordDoneNow } from './offerFlow'
import { setPathPick } from './pathFlow'
import { countsByRep, opensNow, pathById, pathName, pathToday, stageWords, whyThisRep, type PathToday } from './pathStage'
import { carriedByContext, carriedLine, dayKindOf, inPerson, orderByEvidence } from './people'

// A path on the screen (Part 24). On Now, one People row: the rep, its one line, its minutes and
// the stage in words, Resume, Done, Change and the cue chips every commitment has. On Aims, the
// card: the stage and what it means, what counts and what does not, the last rep, counts by rep,
// Pause and Remove. Change lists every rep of the stage. Nothing here rates a person or an answer.

/** What a path's row and card share: today's computation, the open step, and the taps. */
export interface PathShared {
  aim: Aim
  pt: PathToday
  block: Block
  open: boolean
  openOffer: Offer | null
  ctx: Pick<DayContext, 'withHer' | 'pickupTime' | 'soloUntil'> | null
  plan: Intention | null
  /** Tier 2's one counted line for this context, shown only under "no people rep fits". */
  carried: string | null
  /** The paths the rep on show counts for: both, when both paths are on and hold it (Part 27). */
  paths?: readonly PathId[]
  /** On a path's card, when today's one People rep is another path's: that path, and whether the rep counts for this one too. */
  elsewhere?: { path: PathId; shared: boolean } | null
  onResume: () => void
  onChange: () => void
  onPlan: (cue: Cue, time: string) => void
}

function whereWords(s: SettingKind): string {
  return fill(copy.path.where, { where: copy.catalogue.paths.settingNames[s] })
}

/** The rep on show: the started one while its step is open, else today's rep once done, else today's pick. */
function repOf(p: Pick<PathShared, 'pt' | 'open' | 'openOffer'>): Move | null {
  if (p.open && p.openOffer) return moveById(p.openOffer.moveId)
  if (p.pt.repDone && hasMove(p.pt.repDone.moveId)) return moveById(p.pt.repDone.moveId)
  return p.pt.pick ? moveById(p.pt.pick.moveId) : null
}

/** Today's one People rep is done and nothing is started: the row and the card say so and offer nothing more today (D4). */
function doneToday(p: Pick<PathShared, 'pt' | 'open'>): boolean {
  return !p.open && p.pt.repDone !== null
}

/** Start for a fresh rep; Resume only for today's rep answered Partly. */
function startLabel(p: Pick<PathShared, 'pt'>, rep: Move): string {
  return p.pt.repPartly === rep.id ? copy.aims.resume : copy.aims.start
}

/** Change, as a quiet tap on the facts line, so the side holds Resume alone. */
function ChangeTap({ onChange }: { onChange: () => void }) {
  return (
    <button type="button" class="link" data-testid="path-change" onClick={onChange}>
      {copy.path.change}
    </button>
  )
}

/** The rep's facts: its minutes, where, whose pick, and whether it counts for both paths. */
function repFacts(rep: Move, setting: SettingKind | null, yours: boolean, both: boolean) {
  return [
    fill(copy.catalogue.minutes, { n: String(rep.minutes) }),
    setting && whereWords(setting),
    yours && copy.path.yours,
    both && <span data-testid="path-both">{copy.path.both}</span>,
  ]
}

/** What sits behind the rep's own tap: its cue and, for a warm-up, that it does not move the stage (moved behind the rep, not off the phone). */
function RepNotes({ path, rep }: { path: Path; rep: Move }) {
  const warm = !rep.path?.[path.id]?.advances
  if (!rep.cue && !warm) return null
  return (
    <>
      {rep.cue && (
        <span class="sub" data-testid="path-rep-cue">
          {copy.catalogue.paths.cue}: {rep.cue}
        </span>
      )}
      {warm && (
        <span class="sub" data-testid="path-warmup">
          {copy.path.warmUp}
        </span>
      )}
    </>
  )
}

/** The next stage's name, or null at the last. */
function nextStage(path: Path, stage: number): string | null {
  return path.stages.find((s) => s.n === stage + 1)?.name ?? null
}

/** On Now: the path's one People row, the same frame as every commitment's. */
export function PathRow(p: PathShared & { index?: number; due?: boolean }) {
  const c = copy.path
  useQuarterMinute()
  const [planOpen, setPlanOpen] = useState(false)
  const rep = repOf(p)
  const canDone = p.openOffer !== null && doneOpen(p.openOffer)
  const setting = p.open ? (p.openOffer?.setting ?? null) : (p.pt.pick?.setting ?? null)
  const { pending, cues } = planState(p.plan, p.ctx)
  const notes = rep && (rep.cue || !rep.path?.[p.pt.path.id]?.advances)
  const done = doneToday(p)
  // Plan opens the cue chips and, under them, the rep's cue and warm-up note; with no cue ahead the same tap says it is about the rep.
  const showTap = !p.open && !done && rep && ((!pending && cues > 0) || notes)
  return (
    <RowFrame
      icon={kindIcon(p.aim)}
      index={p.index ?? 0}
      due={Boolean(p.due) && !p.open && !done && rep !== null}
      testKind="path"
      path={p.pt.path.id}
      kind={
        <span class="aim-kind" data-testid="path-stage">
          <Facts items={[pathName(p.pt.path), stageWords(p.pt.path, p.pt.state.stage)]} />
        </span>
      }
      title={
        rep ? (
          <span class="aim-title" data-testid="aim-step">
            {rep.name}
          </span>
        ) : (
          <span class="aim-title" data-testid="path-none">
            {c.none[p.block]}
          </span>
        )
      }
      extra={
        <>
          {rep && !p.open && !done && p.pt.pick?.chosenBy === 'coach' && p.pt.pick.version && (
            <span class="sub" data-testid="path-coach-version">
              {p.pt.pick.version}
            </span>
          )}
          {rep?.guardrail && (
            <span class="sub ink" data-testid="path-guardrail">
              {rep.guardrail}
            </span>
          )}
          {!rep && p.carried && (
            <span class="sub" data-testid="path-carried">
              {p.carried}
            </span>
          )}
        </>
      }
      side={
        p.open ? (
          <>
            <span data-testid="aim-started">{copy.aims.startedShort}</span>
            {canDone && p.openOffer && (
              <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(p.openOffer as Offer)}>
                {copy.move.done}
              </button>
            )}
          </>
        ) : done ? (
          <span class="ink" data-testid="aim-done-today">
            {copy.aims.doneToday}
          </span>
        ) : (
          rep && (
            <button type="button" class={p.due ? 'pill-quiet is-primary' : 'pill-quiet'} data-testid={p.pt.repPartly === rep.id ? 'aim-resume' : 'aim-start'} onClick={p.onResume}>
              {startLabel(p, rep)}
            </button>
          )
        )
      }
      facts={
        done && p.pt.repDone ? (
          <Facts items={[formatTime(p.pt.repDone.at), (p.paths?.length ?? 0) > 1 && <span data-testid="path-both">{copy.path.both}</span>]} />
        ) : (
          rep && <Facts items={repFacts(rep, setting, !p.open && p.pt.pick?.chosenBy === 'you' && p.pt.repPartly !== rep.id, (p.paths?.length ?? 0) > 1)} />
        )
      }
      links={
        !p.open &&
        !done && (
          <>
            <ChangeTap onChange={p.onChange} />
            {showTap && <PlanTap open={planOpen} onToggle={() => setPlanOpen((v) => !v)} label={!pending && cues > 0 ? copy.disclose.plan : copy.disclose.repNotes} />}
          </>
        )
      }
      below={
        !p.open &&
        !done &&
        rep &&
        (pending || planOpen) && (
          <>
            <When
              plan={p.plan}
              ctx={p.ctx}
              onPlan={(cue, time) => {
                p.onPlan(cue, time)
                setPlanOpen(false)
              }}
            />
            {planOpen && <RepNotes path={p.pt.path} rep={rep} />}
          </>
        )
      }
    />
  )
}

/**
 * On Aims: the path's card. In front, the stage and what comes next, today's rep with Resume,
 * Change and Plan, and your reps so far. Behind their own rows: how the path works (the stage, what
 * counts and what does not, why this rep, a warm-up note), a declared date on the Partner path, and
 * the path's settings with Pause and Remove. This month's prompts stay in front.
 */
export function PathCard(p: PathShared & { today: string; counts: readonly CueCount[]; due?: boolean; onPause: (paused: boolean) => void; onRemove: () => void; prompts?: ComponentChildren; dates?: ComponentChildren; settings?: ComponentChildren }) {
  const c = copy.path
  const d = copy.disclose
  useQuarterMinute()
  const [planOpen, setPlanOpen] = useState(false)
  const path = p.pt.path
  const stage = path.stages.find((s) => s.n === p.pt.state.stage)
  const rep = repOf(p)
  const canDone = p.openOffer !== null && doneOpen(p.openOffer)
  const setting = p.open ? (p.openOffer?.setting ?? null) : (p.pt.pick?.setting ?? null)
  const paused = Boolean(p.aim.pausedAt)
  const partnerPath = path.id === 'partner'
  const { pending, cues } = planState(p.plan, p.ctx)
  // A faith talk is not counted on screen while the faith family is hidden (Rule 10).
  const shown = (moveId: string) => !(p.pt.faithHidden && moveById(moveId).hiddenWith === 'faith')
  const reps = countsByRep(p.pt.entries).filter((r) => r.offered > 0 && shown(r.moveId))
  const last = p.pt.entries.filter((e) => e.outcome === 'done' && shown(e.moveId)).pop()
  const hasNotes = rep && (rep.cue || !rep.path?.[path.id]?.advances)
  const done = doneToday(p)
  return (
    <div class={p.due && !p.open && !done && rep ? 'card pad move-card aim-card is-due' : 'card pad move-card aim-card'} data-testid="aim-card" data-kind="path" data-path={path.id}>
      <div class="aim-head">
        <Icon name={kindIcon(p.aim)} />
        <p class="eyebrow">{pathName(path)}</p>
      </div>
      <StageProgress n={p.pt.state.stage} of={path.stages.length} name={stage?.name ?? ''} next={nextStage(path, p.pt.state.stage)} testid="path-progress" />
      {p.pt.state.reentry && (
        <p class="note" data-testid="path-reentry">
          {c.reentry}
        </p>
      )}

      {paused ? (
        <p class="note" data-testid="path-paused">
          {c.paused}
        </p>
      ) : p.elsewhere && !p.open ? (
        <div class="rep">
          <p class="calc-line no-gap" data-testid="path-elsewhere">
            {fill(p.elsewhere.shared ? c.elsewhereShared : c.elsewhere, { path: pathById(p.elsewhere.path).name })}
          </p>
          <div class="actions">
            <button type="button" class="textbtn" data-testid="path-change" onClick={p.onChange}>
              {c.change}
            </button>
          </div>
        </div>
      ) : (
        <div class="rep" data-testid="path-rep">
          <p class="eyebrow">{c.todaysRep}</p>
          {rep ? (
            <>
              <p class="rep-title" data-testid="aim-step">
                {rep.name}
              </p>
              <ClampText class="move-what" text={rep.what} testid="path-rep-what" />
              {rep.guardrail && (
                <p class="calc-line ink" data-testid="path-guardrail">
                  {rep.guardrail}
                </p>
              )}
              <p class="aim-facts">
                <Facts items={done ? [(p.paths?.length ?? 0) > 1 && <span data-testid="path-both">{copy.path.both}</span>] : repFacts(rep, setting, !p.open && p.pt.pick?.chosenBy === 'you' && p.pt.repPartly !== rep.id, (p.paths?.length ?? 0) > 1)} />
              </p>
            </>
          ) : (
            <>
              <p class="rep-title" data-testid="path-none">
                {c.none[p.block]}
              </p>
              {p.carried && <p class="calc-line">{p.carried}</p>}
            </>
          )}
          <div class="actions">
            {p.open ? (
              <>
                <span class="move-state" data-testid="aim-started">
                  {p.openOffer ? fill(copy.aims.startedCard, { when: startedWhen(p.openOffer) }) : copy.aims.started}
                </span>
                {canDone && p.openOffer && (
                  <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(p.openOffer as Offer)}>
                    {copy.move.done}
                  </button>
                )}
              </>
            ) : done && p.pt.repDone ? (
              <span class="move-state ink" data-testid="aim-done-today">
                {fill(copy.aims.doneTodayAt, { time: formatTime(p.pt.repDone.at) })}
              </span>
            ) : (
              <>
                {rep && (
                  <button type="button" class={p.due ? 'pill-quiet is-primary' : 'pill-quiet'} data-testid={p.pt.repPartly === rep.id ? 'aim-resume' : 'aim-start'} onClick={p.onResume}>
                    {startLabel(p, rep)}
                  </button>
                )}
                <button type="button" class="textbtn" data-testid="path-change" onClick={p.onChange}>
                  {c.change}
                </button>
                {rep && ((!pending && cues > 0) || hasNotes) && <PlanTap open={planOpen} onToggle={() => setPlanOpen((v) => !v)} label={!pending && cues > 0 ? d.plan : d.repNotes} />}
              </>
            )}
          </div>
          {!p.open && !done && rep && (pending || planOpen) && (
            <>
              <When
                plan={p.plan}
                ctx={p.ctx}
                onPlan={(cue, time) => {
                  p.onPlan(cue, time)
                  setPlanOpen(false)
                }}
              />
              {planOpen && rep.cue && (
                <span class="sub" data-testid="path-rep-cue">
                  {copy.catalogue.paths.cue}: {rep.cue}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {reps.length === 0 ? (
        <p class="reps-line" data-testid="path-reps">
          <span class="eyebrow">{c.byRep}</span>
          <span class="muted">{c.repsNone}</span>
        </p>
      ) : (
        <div class="calc" data-testid="path-reps">
          <p class="calc-line ink">{c.byRep}</p>
          {reps.map((r) => (
            <p key={r.moveId} class="calc-line" data-testid="path-rep-count">
              {fill(c.repLine, { rep: moveById(r.moveId).name, done: String(r.done), partly: String(r.partly), no: String(r.no) })}
            </p>
          ))}
        </div>
      )}

      {p.counts.length > 0 && (
        <div class="calc">
          {p.counts.map((x) => (
            <p key={x.cue} class="calc-line" data-testid="aim-cue-count">
              {fill(copy.aims.cueLine, { cue: copy.aims.cues[x.cue], started: String(x.started), n: String(x.n) })}
            </p>
          ))}
        </div>
      )}

      {!paused && p.prompts}

      {partnerPath && !paused && p.dates && (
        <Disclosure label={d.date} sub={d.dateNote} testid="path-dates">
          {p.dates}
        </Disclosure>
      )}

      <Disclosure label={d.how} sub={partnerPath ? d.howPartner : d.howSocial} testid="path-how">
        <div class="calc evidence">
          {stage && <p class="move-what">{stage.what}</p>}
          {rep && !rep.path?.[path.id]?.advances && (
            <p class="calc-line" data-testid="path-warmup">
              {c.warmUp}
            </p>
          )}
          {!p.open && p.pt.pick && (
            <div class="ev">
              <span class="calc-key">{c.why.title}</span>
              <span class="calc-line" data-testid="path-why">
                <span class="dot-sep">{c.why.title} · </span>
                {whyThisRep(p.pt.pick)}
              </span>
            </div>
          )}
          <div class="ev">
            <span class="calc-key">{c.counts}</span>
            <span class="calc-line">{path.counted}</span>
          </div>
          {stage && (
            <div class="ev">
              <span class="calc-key">{c.notProgress}</span>
              <span class="calc-line">{stage.notProgress}</span>
            </div>
          )}
          {last && (
            <p class="calc-line" data-testid="path-last">
              {fill(c.lastRep, { rep: moveById(last.moveId).name, when: lastLine('done', last.day, p.today) })}
            </p>
          )}
        </div>
      </Disclosure>

      <Disclosure label={d.pathSettings} sub={partnerPath ? d.pathSettingsPartner : d.pathSettingsSocial} testid="path-settings">
        {p.settings}
        <div class="actions">
          <button type="button" class="textbtn" data-testid="path-pause" onClick={() => p.onPause(!paused)}>
            {paused ? c.unpause : c.pause}
          </button>
          <button type="button" class="textbtn faint" onClick={p.onRemove}>
            {copy.aims.remove}
          </button>
        </div>
      </Disclosure>
    </div>
  )
}

/**
 * Change: every rep of the stage, in-person ones first where the record shows this context has
 * carried one; a rep you pick is today's, whatever the shape says. With both paths on it switches
 * path too: your later pick is the People row's (Part 27).
 */
export function PathChangeScreen({ aimId, onClose }: { aimId: number; onClose: () => void }) {
  const now = new Date()
  const { day, block } = blockAt(now)
  const [id, setId] = useState(aimId)
  const aim = useLive(() => db.aims.get(id).then((a) => a ?? null), [id])
  const others = useLive(() => db.aims.filter((a) => a.archivedAt === null && a.kind === 'path' && !a.pausedAt && a.id !== id).toArray(), [id])
  const offers = useLive(() => db.offers.toArray(), [])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  const contexts = useLive(() => db.days.toArray(), [])
  const marks = useLive(() => db.pathMarks.toArray(), [])
  const settings = useLive(getSettings, [])
  const ctx = useLive(() => getDayContext(day), [day])
  if (aim === undefined || !others || !offers || !outcomes || !contexts || !marks || !settings || ctx === undefined) return <section class="screen" />
  if (aim === null || aim.kind !== 'path') {
    onClose()
    return <section class="screen" />
  }
  const c = copy.path
  const pt = pathToday({ aim, offers, outcomes, ctx, day, block, marks, online: settings.partnerOnline, faithHidden: settings.hideFaith })
  // A rep with a partner, in the stages you declare, is not placed by who else is around (Part 27).
  const declared = new Set(pt.path.stages.filter((s) => s.advance === 'declared').map((s) => s.n))
  const carried = carriedByContext(offers, outcomes, contexts, day)
  const list = orderByEvidence(pt.elig.stageReps, dayKindOf(day, ctx), block, carried)
  return (
    <section class="screen" data-testid="path-change-screen">
      <header class="screen-head">
        <p class="eyebrow">{c.changeTitle}</p>
      </header>
      <p class="note">
        {pathName(pt.path)} · {stageWords(pt.path, pt.elig.stage)}
      </p>
      <p class="note faint">{c.changeNote}</p>
      {others.length > 0 && (
        <div class="card">
          <ul class="rows">
            {others.map((o) => (
              <li key={o.id}>
                <button type="button" class="row" data-testid={`path-switch-${o.path}`} onClick={() => setId(o.id as number)}>
                  <span class="row-main">{fill(c.switchTo, { path: pathById(o.path as PathId).name })}</span>
                  <span class="chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div class="card">
        <ul class="rows">
          {list.map((m) => (
            <li key={m.id}>
              <button type="button" class="row" data-testid={`path-choice-${m.id}`} onClick={() => void setPathPick(id, m.id, day).then(onClose)}>
                <span class="row-main">
                  {m.name}
                  <span class="sub">
                    {fill(copy.catalogue.minutes, { n: String(m.minutes) })} · {m.path?.[pt.path.id]?.advances ? c.movesStage : copy.catalogue.paths.movesNothing}
                    {m.path?.[pt.path.id]?.onDate && !pt.dateDay ? ` · ${c.notDateDay}` : inPerson(m) && !pt.around && !declared.has(m.path?.[pt.path.id]?.stage ?? 0) ? ` · ${c.notAround}` : ''}
                    {!opensNow(m, pt.path.id, pt.doneEver) ? ` · ${c.opensAfter}` : ''}
                  </span>
                </span>
                <span class="chev" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.checkin.close}
        </button>
      </div>
    </section>
  )
}

/** Tier 2's line for today's context, when there is one; shown only under "no people rep fits". */
export function carriedFor(offers: readonly Offer[], outcomes: Parameters<typeof carriedByContext>[1], contexts: Parameters<typeof carriedByContext>[2], day: string, block: Block, ctx: Parameters<typeof dayKindOf>[1]): string | null {
  return carriedLine(dayKindOf(day, ctx), block, carriedByContext(offers, outcomes, contexts, day))
}
