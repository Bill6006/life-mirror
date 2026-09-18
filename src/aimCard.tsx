import { useEffect, useRef, useState } from 'preact/hooks'
import { cuesFor, movedLine, type BlockReason, type CueCount } from './aims'
import type { Move } from './catalogue'
import { copy } from './copy'
import type { Aim, Cue, DayContext, Intention, LadderKind, Offer } from './db'
import { fill } from './format'
import type { RungMove, Sitting } from './ladder'
import { doneOpen, recordDoneNow } from './offerFlow'

/** What a commitment's card and its row on Now share: the step, its state, today's plan and the last fact. */
interface Shared {
  aim: Aim
  step: Sitting
  open: boolean
  /** The open offer behind a started step, for the Done tap once its minutes have passed and while its block is on. */
  openOffer: Offer | null
  blocked: BlockReason | null
  unblock: Move | null
  /** Today's context, for the cues on offer; null before the day is written. */
  ctx: Pick<DayContext, 'pickupTime' | 'soloUntil'> | null
  /** Today's plan for the step, or null. */
  plan: Intention | null
  /** One plain fact: when the ladder last moved, or the step was last done. */
  last: string | null
  onResume: () => void
  onUnblock: () => void
  onPlan: (cue: Cue, time: string) => void
}

/** Done on a rung's step says what it did, on the same screen, for a few seconds. */
function useMoved(): [RungMove | null, (m: RungMove | null) => void] {
  const [moved, setMoved] = useState<RungMove | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = (m: RungMove | null) => {
    setMoved(m)
    window.clearTimeout(timer.current)
    if (m) timer.current = window.setTimeout(() => setMoved(null), 8_000)
  }
  return [moved, show]
}

/** The Done tap opens on the ladder's clock; the row looks again every quarter minute. */
function useQuarterMinute(): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
}

/** The three ladders as chips, one tap. */
export function LadderChips({ value, onPick, prefix = 'aim-ladder' }: { value: LadderKind; onPick: (k: LadderKind) => void; prefix?: string }) {
  return (
    <div class="days" role="group" aria-label={copy.aims.studyLadder}>
      {(['technical', 'language', 'craft'] as const).map((k) => (
        <button key={k} type="button" class={value === k ? 'day is-on' : 'day'} aria-pressed={value === k} data-testid={prefix + '-' + k} onClick={() => onPick(k)}>
          {copy.ladder.kinds[k]}
        </button>
      ))}
    </div>
  )
}

/**
 * One tap says when. The cues still ahead today as chips; once one is tapped, the plan in a line
 * with a tap to change it. Nothing once the step is started, and nothing when no cue is ahead:
 * then the step is for now.
 */
function When({ plan, ctx, onPlan }: Pick<Shared, 'plan' | 'ctx' | 'onPlan'>) {
  const c = copy.aims
  const [changing, setChanging] = useState(false)
  const cues = cuesFor(ctx, new Date())
  const pending = plan && plan.offerId === null ? plan : null
  if (pending && !changing) {
    return (
      <span class="sub aim-when" data-testid="aim-plan">
        {fill(c.planned, { cue: c.cues[pending.cue], time: pending.time })}
        {cues.length > 0 && (
          <>
            {' · '}
            <button type="button" class="textbtn inline" data-testid="aim-plan-change" onClick={() => setChanging(true)}>
              {c.changePlan}
            </button>
          </>
        )}
      </span>
    )
  }
  if (cues.length === 0) return null
  return (
    <span class="when aim-when" role="group" aria-label={c.when}>
      {cues.map(({ cue, time }) => (
        <button
          key={cue}
          type="button"
          class={pending?.cue === cue ? 'when-chip is-on' : 'when-chip'}
          aria-pressed={pending?.cue === cue}
          data-testid={'aim-cue-' + cue}
          onClick={() => {
            onPlan(cue, time)
            setChanging(false)
          }}
        >
          {c.cues[cue]}
        </button>
      ))}
    </span>
  )
}

/**
 * A commitment's protected next step: one line sized to one sitting, held above the move on
 * Now where the state ranking cannot displace it. Resume is one tap. When the last step ended
 * in No or Not now, the offer under it removes the obstacle; it never shrinks the aim.
 */
export function AimCard({
  aim,
  step,
  open,
  openOffer,
  blocked,
  unblock,
  ctx,
  plan,
  last,
  onResume,
  onUnblock,
  onPlan,
  counts = [],
  onRemove,
  onChangeStep,
  skillCount,
  onAddSkill,
  onName,
  onLadder,
}: Shared & {
  /** Per cue, plans made and steps started, counts only. */
  counts?: readonly CueCount[]
  onRemove?: () => void
  onChangeStep?: () => void
  /** A study commitment: how many skills it climbs. */
  skillCount?: number
  /** A study commitment: a skill typed here goes under its name. */
  onAddSkill?: (name: string) => void
  /** A study commitment made before names existed: the one word it is waiting for, and its six proofs. */
  onName?: (name: string, ladder: LadderKind) => void
  /** A study commitment: its six proofs, changed in one tap; the marks stay. */
  onLadder?: (ladder: LadderKind) => void
}) {
  const c = copy.aims
  const [skill, setSkill] = useState('')
  const [name, setName] = useState('')
  const [nameLadder, setNameLadder] = useState<LadderKind>(aim.ladder ?? 'technical')
  const [changingLadder, setChangingLadder] = useState(false)
  const [moved, showMoved] = useMoved()
  useQuarterMinute()
  const canDone = openOffer !== null && doneOpen(openOffer)
  const ladder = aim.ladder ?? 'technical'
  return (
    <div class="card pad move-card aim-card" data-testid="aim-card" data-kind={aim.kind}>
      <p class="eyebrow small">{aim.name ?? step.subject ?? c.kinds[aim.kind]}</p>
      <h2 class="move-title" data-testid="aim-step">
        {step.title}
      </h2>
      <p class="move-what">{step.what}</p>
      <p class="move-meta">
        {fill(c.sized, { n: String(step.minutes) })}
        {last && <span data-testid="aim-last"> · {last}</span>}
      </p>
      {skillCount !== undefined && <p class="move-meta">{skillCount === 1 ? c.skillOne : skillCount ? fill(c.skillsOn, { n: String(skillCount) }) : c.noSkillsYet}</p>}
      {onLadder && (
        <div class="calc">
          <p class="calc-line" data-testid="aim-proofs">
            {fill(c.proofs, { kind: copy.ladder.kinds[ladder] })}
            {' · '}
            <button type="button" class="textbtn inline" data-testid="aim-ladder-change" onClick={() => setChangingLadder((v) => !v)}>
              {c.changeProofs}
            </button>
          </p>
          {changingLadder && (
            <>
              <LadderChips
                value={ladder}
                onPick={(k) => {
                  onLadder(k)
                  setChangingLadder(false)
                }}
              />
              <p class="note faint no-gap">{c.proofsNote}</p>
            </>
          )}
        </div>
      )}
      {moved && (
        <div class="calc">
          <p class="calc-line ink" data-testid="aim-moved">
            {movedLine(moved)}
          </p>
        </div>
      )}

      {open ? (
        <>
          <p class="move-state" data-testid="aim-started">
            {c.started}
          </p>
          {canDone && openOffer && (
            <div class="actions">
              <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(openOffer).then(showMoved)}>
                {copy.move.done}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div class="actions">
            <button type="button" class="pill-quiet" data-testid="aim-resume" onClick={onResume}>
              {c.resume}
            </button>
          </div>
          <When plan={plan} ctx={ctx} onPlan={onPlan} />
        </>
      )}

      {counts.length > 0 && (
        <div class="calc">
          {counts.map((x) => (
            <p key={x.cue} class="calc-line" data-testid="aim-cue-count">
              {fill(c.cueLine, { cue: c.cues[x.cue], started: String(x.started), n: String(x.n) })}
            </p>
          ))}
          <p class="note faint no-gap">{c.cueNote}</p>
        </div>
      )}

      {blocked && unblock && !open && (
        <div class="calc" data-testid="aim-blocked">
          <p class="calc-line">{fill(c.blocked, { why: c.blockedWhy[blocked] })}</p>
          <p class="calc-line ink">
            {unblock.name} · {fill(copy.catalogue.minutes, { n: String(unblock.minutes) })}
          </p>
          <button type="button" class="textbtn" data-testid="aim-unblock" onClick={onUnblock}>
            {c.unblockStart}
          </button>
        </div>
      )}

      {onName && (
        <>
          <div class="add">
            <input class="input" type="text" maxLength={40} placeholder={c.namePlaceholder} value={name} data-testid="aim-name-it" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
            <button type="button" class="pill-quiet" data-testid="aim-name-it-add" disabled={!name.trim()} onClick={() => onName(name, nameLadder)}>
              {c.nameIt}
            </button>
          </div>
          <LadderChips value={nameLadder} onPick={setNameLadder} prefix="aim-name-ladder" />
        </>
      )}
      {onAddSkill && (
        <div class="add">
          <input class="input" type="text" maxLength={60} placeholder={c.skillPlaceholder} value={skill} data-testid="aim-skill-input" onInput={(e) => setSkill((e.currentTarget as HTMLInputElement).value)} />
          <button
            type="button"
            class="pill-quiet"
            data-testid="aim-skill-add"
            disabled={!skill.trim()}
            onClick={() => {
              onAddSkill(skill)
              setSkill('')
            }}
          >
            {c.addSkillHere}
          </button>
        </div>
      )}
      {(onRemove || onChangeStep) && (
        <div class="actions">
          {onChangeStep && (
            <button type="button" class="textbtn" onClick={onChangeStep}>
              {c.changeStep}
            </button>
          )}
          {onRemove && (
            <button type="button" class="textbtn faint" onClick={onRemove}>
              {c.remove}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The same commitment on Now, as one row: its subject or kind, the step, its minutes and the last
 * fact, one tap beside, and one tap that says when on a line of its own under the row. Several fit
 * without a scroll; Change the step, the proofs and Remove live on Aims.
 */
export function AimRow({ aim, step, open, openOffer, blocked, unblock, ctx, plan, last, onResume, onUnblock, onPlan }: Shared) {
  const c = copy.aims
  const [moved, showMoved] = useMoved()
  useQuarterMinute()
  const canDone = openOffer !== null && doneOpen(openOffer)
  return (
    <li class="row is-static aim-row" data-testid="aim-card" data-kind={aim.kind}>
      <span class="row-main">
        <span class="sub">{aim.name ?? step.subject ?? c.kinds[aim.kind]}</span>
        <span class="aim-row-title" data-testid="aim-step">
          {step.title}
        </span>
        <span class="sub">
          {fill(copy.catalogue.minutes, { n: String(step.minutes) })}
          {last && <span data-testid="aim-last"> · {last}</span>}
          {blocked && unblock && !open && ' · ' + fill(c.blockedShort, { why: c.blockedWhy[blocked], unblock: unblock.name })}
        </span>
        {moved && (
          <span class="sub ink" data-testid="aim-moved">
            {movedLine(moved)}
          </span>
        )}
      </span>
      <span class="row-side aim-row-side">
        {open ? (
          <>
            <span data-testid="aim-started">{c.startedShort}</span>
            {canDone && openOffer && (
              <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(openOffer).then(showMoved)}>
                {copy.move.done}
              </button>
            )}
          </>
        ) : (
          <>
            {blocked && unblock && (
              <button type="button" class="textbtn" data-testid="aim-unblock" onClick={onUnblock}>
                {c.unblockStart}
              </button>
            )}
            <button type="button" class="pill-quiet" data-testid="aim-resume" onClick={onResume}>
              {c.resume}
            </button>
          </>
        )}
      </span>
      {!open && <When plan={plan} ctx={ctx} onPlan={onPlan} />}
    </li>
  )
}
