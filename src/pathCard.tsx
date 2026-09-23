import { When, useQuarterMinute } from './aimCard'
import { lastLine, type CueCount } from './aims'
import { blockAt, type Block } from './blocks'
import { moveById, type Move, type Path, type SettingKind } from './catalogue'
import { copy } from './copy'
import { db, getDayContext, type Aim, type Cue, type DayContext, type Intention, type Offer } from './db'
import { fill } from './format'
import { useLive } from './live'
import { doneOpen, recordDoneNow } from './offerFlow'
import { setPathPick } from './pathFlow'
import { countsByRep, pathName, pathToday, stageWords, type PathToday } from './pathStage'
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
  ctx: Pick<DayContext, 'pickupTime' | 'soloUntil'> | null
  plan: Intention | null
  /** Tier 2's one counted line for this context, shown only under "no people rep fits". */
  carried: string | null
  onResume: () => void
  onChange: () => void
  onPlan: (cue: Cue, time: string) => void
}

function whereWords(s: SettingKind): string {
  return fill(copy.path.where, { where: copy.catalogue.paths.settingNames[s] })
}

/** The rep on show: the started one while its step is open, else today's pick. */
function repOf(p: Pick<PathShared, 'pt' | 'open' | 'openOffer'>): Move | null {
  if (p.open && p.openOffer) return moveById(p.openOffer.moveId)
  return p.pt.pick ? moveById(p.pt.pick.moveId) : null
}

/** Change, as a quiet tap on a line of the row, so the side holds Resume alone. */
function ChangeTap({ onChange }: { onChange: () => void }) {
  return (
    <button type="button" class="textbtn inline" data-testid="path-change" onClick={onChange}>
      {copy.path.change}
    </button>
  )
}

/** The rep in a row: its cue as its one line, then its minutes, where, whose pick, and Change. */
function RepLines({ path, rep, setting, yours, onChange }: { path: Path; rep: Move; setting: SettingKind | null; yours: boolean; onChange: (() => void) | null }) {
  const moves = rep.path?.[path.id]?.advances
  return (
    <>
      {rep.cue && (
        <span class="sub" data-testid="path-rep-cue">
          {copy.catalogue.paths.cue}: {rep.cue}
        </span>
      )}
      <span class="sub">
        {fill(copy.catalogue.minutes, { n: String(rep.minutes) })}
        {setting && ` · ${whereWords(setting)}`}
        {yours && ` · ${copy.path.yours}`}
        {onChange && (
          <>
            {' · '}
            <ChangeTap onChange={onChange} />
          </>
        )}
      </span>
      {!moves && (
        <span class="sub" data-testid="path-warmup">
          {copy.path.warmUp}
        </span>
      )}
    </>
  )
}

/** On Now: the path's one People row. */
export function PathRow(p: PathShared) {
  const c = copy.path
  useQuarterMinute()
  const rep = repOf(p)
  const canDone = p.openOffer !== null && doneOpen(p.openOffer)
  const setting = p.open ? (p.openOffer?.setting ?? null) : (p.pt.pick?.setting ?? null)
  return (
    <li class="row is-static aim-row" data-testid="aim-card" data-kind="path" data-path={p.pt.path.id}>
      <span class="row-main">
        <span class="sub" data-testid="path-stage">
          {pathName(p.pt.path)} · {stageWords(p.pt.path, p.pt.state.stage)}
        </span>
        {rep ? (
          <>
            <span class="aim-row-title" data-testid="aim-step">
              {rep.name}
            </span>
            <RepLines path={p.pt.path} rep={rep} setting={setting} yours={!p.open && p.pt.pick?.chosenBy === 'you'} onChange={p.open ? null : p.onChange} />
          </>
        ) : (
          <>
            <span class="aim-row-title" data-testid="path-none">
              {c.none[p.block]}
            </span>
            {p.carried && (
              <span class="sub" data-testid="path-carried">
                {p.carried}
              </span>
            )}
            <span class="sub">
              <ChangeTap onChange={p.onChange} />
            </span>
          </>
        )}
      </span>
      <span class="row-side aim-row-side">
        {p.open ? (
          <>
            <span data-testid="aim-started">{copy.aims.startedShort}</span>
            {canDone && p.openOffer && (
              <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(p.openOffer as Offer)}>
                {copy.move.done}
              </button>
            )}
          </>
        ) : (
          rep && (
            <button type="button" class="pill-quiet" data-testid="aim-resume" onClick={p.onResume}>
              {copy.aims.resume}
            </button>
          )
        )}
      </span>
      {!p.open && rep && <When plan={p.plan} ctx={p.ctx} onPlan={p.onPlan} />}
    </li>
  )
}

/** On Aims: the path's card. */
export function PathCard(p: PathShared & { today: string; counts: readonly CueCount[]; onPause: (paused: boolean) => void; onRemove: () => void }) {
  const c = copy.path
  useQuarterMinute()
  const path = p.pt.path
  const stage = path.stages.find((s) => s.n === p.pt.state.stage)
  const rep = repOf(p)
  const canDone = p.openOffer !== null && doneOpen(p.openOffer)
  const setting = p.open ? (p.openOffer?.setting ?? null) : (p.pt.pick?.setting ?? null)
  const paused = Boolean(p.aim.pausedAt)
  const reps = countsByRep(p.pt.entries).filter((r) => r.offered > 0)
  const last = p.pt.entries.filter((e) => e.outcome === 'done').pop()
  return (
    <div class="card pad move-card aim-card" data-testid="aim-card" data-kind="path" data-path={path.id}>
      <p class="eyebrow small">{pathName(path)}</p>
      <h2 class="move-title" data-testid="path-stage">
        {stageWords(path, p.pt.state.stage)}
      </h2>
      {stage && <p class="move-what">{stage.what}</p>}
      {p.pt.state.reentry && (
        <p class="note" data-testid="path-reentry">
          {c.reentry}
        </p>
      )}

      {paused ? (
        <p class="note" data-testid="path-paused">
          {c.paused}
        </p>
      ) : (
        <div class="calc">
          {rep ? (
            <>
              <p class="calc-line ink" data-testid="aim-step">
                {rep.name}
              </p>
              <p class="calc-line" data-testid="path-rep-what">
                {rep.what}
              </p>
              <p class="calc-line">
                {fill(copy.catalogue.minutes, { n: String(rep.minutes) })}
                {setting && ` · ${whereWords(setting)}`}
                {!p.open && p.pt.pick?.chosenBy === 'you' && ` · ${c.yours}`}
              </p>
              {!rep.path?.[path.id]?.advances && (
                <p class="calc-line" data-testid="path-warmup">
                  {c.warmUp}
                </p>
              )}
            </>
          ) : (
            <>
              <p class="calc-line ink" data-testid="path-none">
                {c.none[p.block]}
              </p>
              {p.carried && <p class="calc-line">{p.carried}</p>}
            </>
          )}
          <div class="actions">
            {p.open ? (
              <>
                <span class="move-state" data-testid="aim-started">
                  {copy.aims.started}
                </span>
                {canDone && p.openOffer && (
                  <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(p.openOffer as Offer)}>
                    {copy.move.done}
                  </button>
                )}
              </>
            ) : (
              <>
                {rep && (
                  <button type="button" class="pill-quiet" data-testid="aim-resume" onClick={p.onResume}>
                    {copy.aims.resume}
                  </button>
                )}
                <button type="button" class="textbtn" data-testid="path-change" onClick={p.onChange}>
                  {c.change}
                </button>
              </>
            )}
          </div>
          {!p.open && rep && <When plan={p.plan} ctx={p.ctx} onPlan={p.onPlan} />}
        </div>
      )}

      <div class="calc">
        <p class="calc-line">
          <span class="calc-key">{c.counts}</span> · {path.counted}
        </p>
        {stage && (
          <p class="calc-line">
            <span class="calc-key">{c.notProgress}</span> · {stage.notProgress}
          </p>
        )}
        {last && (
          <p class="calc-line" data-testid="path-last">
            {fill(c.lastRep, { rep: moveById(last.moveId).name, when: lastLine('done', last.day, p.today) })}
          </p>
        )}
      </div>

      <div class="calc" data-testid="path-reps">
        <p class="calc-line ink">{c.byRep}</p>
        {reps.length === 0 ? (
          <p class="calc-line">{c.noReps}</p>
        ) : (
          reps.map((r) => (
            <p key={r.moveId} class="calc-line" data-testid="path-rep-count">
              {fill(c.repLine, { rep: moveById(r.moveId).name, done: String(r.done), partly: String(r.partly), no: String(r.no) })}
            </p>
          ))
        )}
      </div>

      {p.counts.length > 0 && (
        <div class="calc">
          {p.counts.map((x) => (
            <p key={x.cue} class="calc-line" data-testid="aim-cue-count">
              {fill(copy.aims.cueLine, { cue: copy.aims.cues[x.cue], started: String(x.started), n: String(x.n) })}
            </p>
          ))}
        </div>
      )}

      <div class="actions">
        <button type="button" class="textbtn" data-testid="path-pause" onClick={() => p.onPause(!paused)}>
          {paused ? c.unpause : c.pause}
        </button>
        <button type="button" class="textbtn faint" onClick={p.onRemove}>
          {copy.aims.remove}
        </button>
      </div>
    </div>
  )
}

/** Change: every rep of the stage, in-person ones first where the record shows this context has carried one; a rep you pick is today's, whatever the shape says. */
export function PathChangeScreen({ aimId, onClose }: { aimId: number; onClose: () => void }) {
  const now = new Date()
  const { day, block } = blockAt(now)
  const aim = useLive(() => db.aims.get(aimId).then((a) => a ?? null), [aimId])
  const offers = useLive(() => db.offers.toArray(), [])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  const contexts = useLive(() => db.days.toArray(), [])
  const ctx = useLive(() => getDayContext(day), [day])
  if (aim === undefined || !offers || !outcomes || !contexts || ctx === undefined) return <section class="screen" />
  if (aim === null || aim.kind !== 'path') {
    onClose()
    return <section class="screen" />
  }
  const c = copy.path
  const pt = pathToday({ aim, offers, outcomes, ctx, day, block })
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
      <div class="card">
        <ul class="rows">
          {list.map((m) => (
            <li key={m.id}>
              <button type="button" class="row" data-testid={`path-choice-${m.id}`} onClick={() => void setPathPick(aimId, m.id, day).then(onClose)}>
                <span class="row-main">
                  {m.name}
                  <span class="sub">
                    {fill(copy.catalogue.minutes, { n: String(m.minutes) })} · {m.path?.[pt.path.id]?.advances ? c.movesStage : copy.catalogue.paths.movesNothing}
                    {inPerson(m) && !pt.around ? ` · ${c.notAround}` : ''}
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
