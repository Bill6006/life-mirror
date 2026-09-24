import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { cuesFor, movedLine, type BlockReason, type CueCount, type TodaySessions } from './aims'
import type { Move, PathId } from './catalogue'
import { copy } from './copy'
import type { Aim, Cue, DayContext, Intention, LadderKind, Offer } from './db'
import { fill, formatDayShort, formatTime } from './format'
import { Icon, type IconName } from './icons'
import { TOP_RUNG, type RungMove, type Sitting } from './ladder'
import { blockAt } from './blocks'
import { doneOpen, recordDoneNow } from './offerFlow'
import { indexLabel } from './theme'
import { ClampText, Disclosure, Facts, RungTrack } from './ui'

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
  ctx: Pick<DayContext, 'withHer' | 'pickupTime' | 'soloUntil'> | null
  /** Today's plan for the step, or null. */
  plan: Intention | null
  /** One plain fact: when the ladder last moved, or the step was last done. */
  last: string | null
  /** Today's sessions: the latest done, or a Partly with none done (Workstream 6). */
  today: TodaySessions
  /** The one thing to do on the screen (the Brain line names it): its Start carries the accent. */
  due?: boolean
  onResume: () => void
  /** Did it already: a session done away from the app, recorded as done now. */
  onLog: () => void
  onUnblock: () => void
  onPlan: (cue: Cue, time: string) => void
}

/** When a session began: the time today, or its day and time when it began on an earlier day. */
export function startedWhen(offer: Offer): string {
  const time = formatTime(offer.at)
  return offer.day === blockAtDay() ? fill(copy.aims.startedAt, { time }) : fill(copy.aims.startedOn, { day: formatDayShort(offer.day), time })
}

function blockAtDay(): string {
  return blockAt(new Date()).day
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
export function useQuarterMinute(): void {
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

/** A commitment's icon: its kind, or its path. */
export function kindIcon(aim: Pick<Aim, 'kind' | 'path'>): IconName {
  if (aim.kind === 'path') return (aim.path as PathId) === 'partner' ? 'partner' : 'social'
  return aim.kind === 'certification' ? 'study' : aim.kind === 'practice' ? 'practice' : 'person'
}

/** The step's name. A rung step sets its rung on a line of its own; the text still reads "skill · rung". */
export function StepTitle({ step, tag = 'span', class: cls }: { step: Sitting; tag?: 'span' | 'h2'; class: string }) {
  const Tag = tag
  if (step.skill && step.rungStep) {
    return (
      <Tag class={cls} data-testid="aim-step">
        {step.skill}
        <span class="rung-sep"> · </span>
        <span class="aim-rung">{step.rungStep}</span>
      </Tag>
    )
  }
  return (
    <Tag class={cls} data-testid="aim-step">
      {step.title}
    </Tag>
  )
}

/** Whether a plan waits for today, and the cues still ahead. */
export function planState(plan: Intention | null, ctx: Shared['ctx']): { pending: Intention | null; cues: number } {
  return { pending: plan && plan.offerId === null ? plan : null, cues: cuesFor(ctx, new Date()).length }
}

/** The quiet Plan tap: opens the cue chips under the step. Absent while a plan waits (it shows itself) or when no cue is ahead. */
export function PlanTap({ open, onToggle, label = copy.disclose.plan }: { open: boolean; onToggle: () => void; label?: string }) {
  return (
    <button type="button" class="link plan" aria-expanded={open} data-testid="aim-plan-open" onClick={onToggle}>
      <Icon name="clock" />
      {label}
    </button>
  )
}

/**
 * One tap says when. The cues still ahead today as chips; once one is tapped, the plan in a line
 * with a tap to change it. Nothing once the step is started, and nothing when no cue is ahead:
 * then the step is for now.
 */
export function When({ plan, ctx, onPlan }: Pick<Shared, 'plan' | 'ctx' | 'onPlan'>) {
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
 * A commitment's protected next step on Aims: the step and how to do it, the ladder it climbs,
 * Resume and when. Its proofs, skills and removal sit behind Details; adding the first skill stays
 * in view until there is one. When the last step ended in No or Not now, the offer under it
 * removes the obstacle; it never shrinks the aim.
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
  today,
  due = false,
  onResume,
  onUnblock,
  onPlan,
  onLog,
  counts = [],
  onRemove,
  onChangeStep,
  skillCount,
  onAddSkill,
  onName,
  onLadder,
  onConvert,
}: Shared & {
  /** Per cue, plans made and steps started, counts only. */
  counts?: readonly CueCount[]
  onRemove?: () => void
  onChangeStep?: () => void
  /** A person, the one action left to it (Part 24): become the Social path, keeping its record. */
  onConvert?: () => void
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
  const d = copy.disclose
  const [skill, setSkill] = useState('')
  const [name, setName] = useState('')
  const [nameLadder, setNameLadder] = useState<LadderKind>(aim.ladder ?? 'technical')
  const [changingLadder, setChangingLadder] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [moved, showMoved] = useMoved()
  useQuarterMinute()
  const canDone = openOffer !== null && doneOpen(openOffer)
  const ladder = aim.ladder ?? 'technical'
  const { pending, cues } = planState(plan, ctx)
  const noSkill = skillCount === 0
  const addSkill = onAddSkill && (
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
  )
  const detailsSub = aim.kind === 'certification' ? (noSkill ? d.detailsStudyNoSkill : d.detailsStudy) : aim.kind === 'person' ? d.detailsPerson : d.detailsPractice
  return (
    <div class={due && !open && !today.done ? 'card pad move-card aim-card is-due' : 'card pad move-card aim-card'} data-testid="aim-card" data-kind={aim.kind}>
      <div class="aim-head">
        <Icon name={kindIcon(aim)} />
        <p class="eyebrow">{aim.name ?? step.subject ?? c.kinds[aim.kind]}</p>
      </div>
      <StepTitle step={step} tag="h2" class="move-title" />
      <ClampText class="move-what" text={step.what} testid="aim-what" />
      {step.rung !== undefined && step.rungStep && (
        <div class="ladder" data-testid="aim-ladder">
          <RungTrack n={step.rung} of={TOP_RUNG} label={fill(c.rungOf, { n: String(step.rung), of: String(TOP_RUNG), name: step.rungStep })} />
          <span class="ladder-cap">{fill(c.rungOf, { n: String(step.rung), of: String(TOP_RUNG), name: step.rungStep })}</span>
        </div>
      )}
      <p class="aim-facts">
        <Facts items={[fill(c.sized, { n: String(step.minutes) }), last && <span data-testid="aim-last">{last}</span>, noSkill ? c.noSkillsShort : null]} />
      </p>
      {moved && (
        <div class="calc">
          <p class="calc-line ink" data-testid="aim-moved">
            {movedLine(moved)}
          </p>
        </div>
      )}

      {open && openOffer ? (
        <>
          <p class="move-state" data-testid="aim-started">
            {fill(c.startedCard, { when: startedWhen(openOffer) })}
          </p>
          {canDone && openOffer && (
            <div class="actions">
              <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(openOffer).then(showMoved)}>
                {copy.move.done}
              </button>
            </div>
          )}
        </>
      ) : today.done ? (
        <>
          <p class="move-state ink" data-testid="aim-done-today">
            {fill(c.doneTodayAt, { time: formatTime(today.done.at) })}
          </p>
          <div class="actions">
            <button type="button" class="link" data-testid="aim-another" onClick={onResume}>
              {c.doAnother}
            </button>
          </div>
        </>
      ) : (
        <>
          <div class="actions">
            <button type="button" class={due ? 'pill-quiet is-primary' : 'pill-quiet'} data-testid={today.partly ? 'aim-resume' : 'aim-start'} onClick={onResume}>
              {today.partly ? c.resume : c.start}
            </button>
            {!pending && cues > 0 && <PlanTap open={planOpen} onToggle={() => setPlanOpen((v) => !v)} label={d.planWhen} />}
            {!today.partly && (
              <button type="button" class="link" data-testid="aim-log" onClick={onLog}>
                {c.didIt}
              </button>
            )}
          </div>
          {today.partly && (
            <p class="note faint no-gap" data-testid="aim-partly">
              {c.partlyToday}
            </p>
          )}
          {(pending || planOpen) && (
            <When
              plan={plan}
              ctx={ctx}
              onPlan={(cue, time) => {
                onPlan(cue, time)
                setPlanOpen(false)
              }}
            />
          )}
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

      {blocked && unblock && !open && !today.done && (
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
      {/* Until a study has its first skill, adding one stays in view. */}
      {noSkill && addSkill}

      <Disclosure label={d.details} sub={detailsSub} testid="aim-details">
        {skillCount !== undefined && skillCount > 0 && <p class="move-meta">{skillCount === 1 ? c.skillOne : fill(c.skillsOn, { n: String(skillCount) })}</p>}
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
        {!noSkill && addSkill}
        {onConvert && (
          <div class="calc" data-testid="aim-convert">
            <button type="button" class="pill-quiet" data-testid="aim-convert-social" onClick={onConvert}>
              {copy.path.convert}
            </button>
            <p class="note faint no-gap">{copy.path.convertNote}</p>
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
      </Disclosure>
    </div>
  )
}

/** A row on Now: an icon (or the index), the kind, the step, one tap beside, and a line of facts with its quiet taps under both. */
export function RowFrame({
  icon,
  index,
  kind,
  title,
  extra,
  side,
  facts,
  links,
  below,
  due,
  testKind,
  path,
}: {
  icon: IconName
  index: number
  kind: ComponentChildren
  title: ComponentChildren
  extra?: ComponentChildren
  side: ComponentChildren
  facts: ComponentChildren
  links?: ComponentChildren
  below?: ComponentChildren
  due: boolean
  testKind: string
  path?: string
}) {
  return (
    <li class={due ? 'aim-row is-due' : 'aim-row'} data-testid="aim-card" data-kind={testKind} data-path={path}>
      <span class="aim-ic" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span class="idx aim-idx" aria-hidden="true">
        {indexLabel(index)}
      </span>
      <div class="aim-main">
        {kind}
        {title}
        {extra}
      </div>
      <span class="aim-side">{side}</span>
      <div class="aim-meta">
        {facts}
        {links && <span class="links">{links}</span>}
      </div>
      {below && <div class="aim-extra">{below}</div>}
    </li>
  )
}

/**
 * The same commitment on Now, as one row: its subject or kind, the step, one tap beside, and
 * under both a line of facts with Plan. Several fit without a scroll; Change the step, the proofs
 * and Remove live on Aims.
 */
export function AimRow({ aim, step, open, openOffer, blocked, unblock, ctx, plan, last, today, due = false, onResume, onUnblock, onPlan, onLog, index = 0 }: Shared & { index?: number }) {
  const c = copy.aims
  const [moved, showMoved] = useMoved()
  const [planOpen, setPlanOpen] = useState(false)
  useQuarterMinute()
  const canDone = openOffer !== null && doneOpen(openOffer)
  const { pending, cues } = planState(plan, ctx)
  // Workstream 6: a fresh session is Start; Resume only finishes one answered Partly today; once one is done today the row says so and asks nothing.
  const done = !open && today.done !== null
  return (
    <RowFrame
      icon={kindIcon(aim)}
      index={index}
      due={due && !open && !done}
      testKind={aim.kind}
      kind={<span class="aim-kind">{aim.name ?? step.subject ?? c.kinds[aim.kind]}</span>}
      title={<StepTitle step={step} class="aim-title" />}
      extra={
        moved && (
          <span class="sub ink" data-testid="aim-moved">
            {movedLine(moved)}
          </span>
        )
      }
      side={
        open ? (
          <>
            <span data-testid="aim-started">{c.startedShort}</span>
            {canDone && openOffer && (
              <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(openOffer).then(showMoved)}>
                {copy.move.done}
              </button>
            )}
          </>
        ) : done ? (
          <span class="ink" data-testid="aim-done-today">
            {c.doneToday}
          </span>
        ) : (
          <>
            {blocked && unblock && (
              <button type="button" class="textbtn" data-testid="aim-unblock" onClick={onUnblock}>
                {c.unblockStart}
              </button>
            )}
            <button type="button" class={due ? 'pill-quiet is-primary' : 'pill-quiet'} data-testid={today.partly ? 'aim-resume' : 'aim-start'} onClick={onResume}>
              {today.partly ? c.resume : c.start}
            </button>
          </>
        )
      }
      facts={
        <Facts
          items={
            open && openOffer
              ? [startedWhen(openOffer), fill(copy.catalogue.minutes, { n: String(step.minutes) })]
              : done && today.done
                ? [formatTime(today.done.at), last && <span data-testid="aim-last">{last}</span>]
                : [fill(copy.catalogue.minutes, { n: String(step.minutes) }), last && <span data-testid="aim-last">{last}</span>, today.partly && <span data-testid="aim-partly">{c.partlyToday}</span>, blocked && unblock && fill(c.blockedShort, { why: c.blockedWhy[blocked], unblock: unblock.name })]
          }
        />
      }
      links={
        !open &&
        (done ? (
          <button type="button" class="link" data-testid="aim-another" onClick={onResume}>
            {c.doAnother}
          </button>
        ) : (
          <>
            {!pending && cues > 0 && <PlanTap open={planOpen} onToggle={() => setPlanOpen((v) => !v)} />}
            {!today.partly && (
              <button type="button" class="link" data-testid="aim-log" onClick={onLog}>
                {c.didIt}
              </button>
            )}
          </>
        ))
      }
      below={
        !open &&
        !done &&
        (pending || planOpen) && (
          <When
            plan={plan}
            ctx={ctx}
            onPlan={(cue, time) => {
              onPlan(cue, time)
              setPlanOpen(false)
            }}
          />
        )
      }
    />
  )
}
