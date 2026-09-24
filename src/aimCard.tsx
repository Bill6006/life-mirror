import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { setEase, setSessionNote, type SkillWords } from './aimFlow'
import { cuesFor, type BlockReason, type CueCount, type Practice, type TodaySessions } from './aims'
import { blockAt } from './blocks'
import type { Move, PathId } from './catalogue'
import { copy } from './copy'
import type { Aim, Cue, DayContext, Ease, Intention, Offer, Skill } from './db'
import { fill, formatDayShort, formatTime } from './format'
import { Icon, type IconName } from './icons'
import type { Sitting } from './ladder'
import { doneOpen, recordDoneNow } from './offerFlow'
import { indexLabel } from './theme'
import { ClampText, Disclosure, Facts } from './ui'

/** What a commitment's card and its row on Now share: the step, its state, today's plan and the last fact. */
interface Shared {
  aim: Aim
  step: Sitting
  open: boolean
  /** The open offer behind a started session: Done stays open on it until you resolve it (D3). */
  openOffer: Offer | null
  blocked: BlockReason | null
  unblock: Move | null
  /** Today's context, for the cues on offer; null before the day is written. */
  ctx: Pick<DayContext, 'withHer' | 'pickupTime' | 'soloUntil'> | null
  /** Today's plan for the step, or null. */
  plan: Intention | null
  /** One plain fact: when it was last practised, or the step last done. */
  last: string | null
  /** Today's sessions: the latest done, or a Partly with none done (Workstream 6). */
  today: TodaySessions
  /** The one thing to do on the screen (the Brain line names it): its Start carries the accent. */
  due?: boolean
  /** A learning commitment asks how each session went, one optional tap, until the tap has gone unused a dozen times running. */
  askEase?: boolean
  onResume: () => void
  /** Did it already: a session done away from the app, recorded as done now; says which, for the ease tap. */
  onLog: () => Promise<number | null>
  onUnblock: () => void
  onPlan: (cue: Cue, time: string) => void
}

/** When a session began: the time today, or its day and time when it began on an earlier day. */
export function startedWhen(offer: Offer): string {
  const time = formatTime(offer.at)
  return offer.day === blockAt(new Date()).day ? fill(copy.aims.startedAt, { time }) : fill(copy.aims.startedOn, { day: formatDayShort(offer.day), time })
}

/** The row looks at the clock again every quarter minute. */
export function useQuarterMinute(): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
}

const EASES: readonly Ease[] = ['hard', 'right', 'easy']

/**
 * How it went, one optional tap after a learning session (Workstream 6): evidence for a later
 * review, never a grade; on the card, one optional line with it. It shows once, where Done was
 * tapped, and leaves with the screen.
 */
export function EaseTap({ offerId, withNote = false }: { offerId: number; withNote?: boolean }) {
  const c = copy.aims
  const [chosen, setChosen] = useState<Ease | null>(null)
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [kept, setKept] = useState(false)
  return (
    <div class="ease" data-testid="aim-ease">
      <span class="sub">{c.easeQuestion}</span>
      <span class="when" role="group" aria-label={c.easeQuestion}>
        {EASES.map((e) => (
          <button
            key={e}
            type="button"
            class={chosen === e ? 'when-chip is-on' : 'when-chip'}
            aria-pressed={chosen === e}
            data-testid={'aim-ease-' + e}
            onClick={() => {
              setChosen(e)
              void setEase(offerId, e)
            }}
          >
            {c.ease[e]}
          </button>
        ))}
      </span>
      {withNote && chosen && !noting && !kept && (
        <button type="button" class="link" data-testid="aim-note-open" onClick={() => setNoting(true)}>
          {c.noteAdd}
        </button>
      )}
      {noting && !kept && (
        <div class="add">
          <input class="input" type="text" maxLength={200} placeholder={c.notePlaceholder} aria-label={c.notePlaceholder} value={note} data-testid="aim-note-input" onInput={(e) => setNote((e.currentTarget as HTMLInputElement).value)} />
          <button type="button" class="pill-quiet" data-testid="aim-note-save" disabled={!note.trim()} onClick={() => void setSessionNote(offerId, note).then(() => setKept(true))}>
            {c.save}
          </button>
        </div>
      )}
      {kept && (
        <span class="sub" data-testid="aim-note-kept">
          {c.noteSaved}
        </span>
      )}
      <span class="note faint no-gap">{c.easeNote}</span>
    </div>
  )
}

/** A skill in your words: its name, and, when asked, how you practise it, how to do it and a session's minutes. Nothing is assumed. */
function SkillForm({ initial, submit, onSubmit, testid, full = true }: { initial: SkillWords; submit: string; onSubmit: (w: SkillWords) => void; testid: string; full?: boolean }) {
  const c = copy.aims
  const [name, setName] = useState(initial.name)
  const [method, setMethod] = useState(initial.method ?? '')
  const [how, setHow] = useState(initial.how ?? '')
  const [minutes, setMinutes] = useState(initial.minutes ? String(initial.minutes) : '')
  const field = (label: string, value: string, set: (v: string) => void, id: string, max: number, placeholder = '') => (
    <>
      <p class="setting-label">{label}</p>
      <input class="input" type="text" maxLength={max} aria-label={label} placeholder={placeholder} value={value} data-testid={`${testid}-${id}`} onInput={(e) => set((e.currentTarget as HTMLInputElement).value)} />
    </>
  )
  return (
    <div class="skill-form" data-testid={testid}>
      {field(c.skillName, name, setName, 'name', 80, c.skillNowPlaceholder)}
      {field(c.skillMethod, method, setMethod, 'method', 60, c.methodPlaceholder)}
      {full && field(c.skillHow, how, setHow, 'how', 240)}
      {full && (
        <>
          <p class="setting-label">{c.skillMinutes}</p>
          <input class="input" type="number" inputMode="numeric" min={1} max={240} aria-label={c.skillMinutes} value={minutes} data-testid={`${testid}-minutes`} onInput={(e) => setMinutes((e.currentTarget as HTMLInputElement).value)} />
        </>
      )}
      <div class="actions">
        <button type="button" class="pill-quiet" data-testid={`${testid}-save`} disabled={!name.trim()} onClick={() => onSubmit({ name, method, how, minutes: minutes.trim() ? Number(minutes) : null })}>
          {submit}
        </button>
      </div>
    </div>
  )
}

/** A learning commitment's own view (Workstream 6): its current skill, the practice since it began, earlier skills, and what only you change. */
export interface LearningView {
  current: Skill | null
  practice: Practice | null
  /** Earlier skills, newest first, each with its sessions. */
  earlier: { skill: Skill; sessions: number }[]
  /** Proof names each skill reached before the ladder was retired, read only. */
  proofs: Readonly<Record<number, readonly string[]>>
  onSetSkill: (w: SkillWords) => void
  onEditSkill: (skillId: number, w: SkillWords) => void
  onMakeCurrent: (skillId: number) => void
  onPause: (paused: boolean) => void
  onFinish: () => void
}

/** "With an audio course": how it is practised, in a sentence; a leading A, An or The from your words reads lower case there, and nothing else changes. */
export function withMethod(method: string): string {
  return fill(copy.aims.withMethod, { method: method.replace(/^(A|An|The) /, (w) => w.toLowerCase()) })
}

function countWord(n: number, words: { one: string; many: string }): string {
  return n === 1 ? words.one : fill(words.many, { n: String(n) })
}

/** The practice on the current skill, in words: sessions, the different days they fell on, since when. Counts only. */
export function practiceLine(p: Practice | null): string {
  const c = copy.aims
  if (!p || p.sessions === 0) return c.practiceNone
  return fill(c.practice, { sessions: countWord(p.sessions, c.sessionsWord), days: countWord(p.days, c.daysWord), since: p.since ? formatDayShort(p.since) : '' }).replace(/ since $/, '')
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
 * A commitment on Aims. Something to learn: the goal, its one current skill and how it is
 * practised, the practice since it began, Start or Done today, and behind Details the skill's
 * words, a new current skill, the skills so far, Pause, Finish and Remove (Workstream 6). With no
 * skill named yet, a place to name it and nothing to start. A practice or a person: the step, how
 * to do it, Start, and behind Details changing the step. When the last session ended in No or Not
 * now, the offer under it removes the obstacle; it never shrinks the aim.
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
  askEase = false,
  onResume,
  onUnblock,
  onPlan,
  onLog,
  counts = [],
  onRemove,
  onChangeStep,
  onConvert,
  learning,
}: Shared & {
  /** Per cue, plans made and steps started, counts only. */
  counts?: readonly CueCount[]
  onRemove?: () => void
  onChangeStep?: () => void
  /** A person, the one action left to it (Part 24): become the Social path, keeping its record. */
  onConvert?: () => void
  /** Something to learn: its current skill, its practice and its history. */
  learning?: LearningView
}) {
  const c = copy.aims
  const d = copy.disclose
  const [planOpen, setPlanOpen] = useState(false)
  const [justDone, setJustDone] = useState<number | null>(null)
  const [editing, setEditing] = useState<'edit' | 'new' | null>(null)
  useQuarterMinute()
  const canDone = openOffer !== null && doneOpen(openOffer)
  const { pending, cues } = planState(plan, ctx)
  const paused = Boolean(aim.pausedAt)
  // Something to learn with no skill named has nothing to start: its card asks for one.
  const unnamed = learning !== undefined && learning.current === null
  const done = !open && today.done !== null
  const detailsSub = learning ? (learning.current ? d.detailsStudy : d.detailsStudyNoSkill) : aim.kind === 'person' ? d.detailsPerson : d.detailsPractice
  const facts = learning
    ? [learning.current?.method && withMethod(learning.current.method), step.minutes > 0 && fill(copy.catalogue.minutes, { n: String(step.minutes) }), last && <span data-testid="aim-last">{last}</span>]
    : [fill(c.sized, { n: String(step.minutes) }), last && <span data-testid="aim-last">{last}</span>]
  return (
    <div class={due && !open && !done && !unnamed && !paused ? 'card pad move-card aim-card is-due' : 'card pad move-card aim-card'} data-testid="aim-card" data-kind={aim.kind}>
      <div class="aim-head">
        <Icon name={kindIcon(aim)} />
        <p class="eyebrow">{aim.name ?? step.subject ?? c.kinds[aim.kind]}</p>
      </div>
      <StepTitle step={step} tag="h2" class="move-title" />
      {step.what && <ClampText class="move-what" text={step.what} testid="aim-what" />}
      <p class="aim-facts">
        <Facts items={facts} />
      </p>
      {learning?.current && (
        <p class="calc-line" data-testid="aim-practice">
          {practiceLine(learning.practice)}
        </p>
      )}
      {learning?.practice && learning.practice.ease.hard + learning.practice.ease.right + learning.practice.ease.easy > 0 && (
        <p class="calc-line faint" data-testid="aim-ease-line">
          {fill(c.easeLine, { hard: String(learning.practice.ease.hard), right: String(learning.practice.ease.right), easy: String(learning.practice.ease.easy) })}
        </p>
      )}

      {paused ? (
        <p class="note" data-testid="aim-paused">
          {c.paused}
        </p>
      ) : unnamed ? (
        <div class="calc" data-testid="aim-no-skill">
          <p class="calc-line">{c.noSkillNote}</p>
          <SkillForm initial={{ name: '', method: aim.method }} submit={c.setSkill} onSubmit={(w) => learning?.onSetSkill(w)} testid="aim-skill-set" full={false} />
        </div>
      ) : open && openOffer ? (
        <>
          <p class="move-state" data-testid="aim-started">
            {fill(c.startedCard, { when: startedWhen(openOffer) })}
          </p>
          {canDone && (
            <div class="actions">
              <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(openOffer).then((ok) => ok && setJustDone(openOffer.id as number))}>
                {copy.move.done}
              </button>
            </div>
          )}
        </>
      ) : done && today.done ? (
        <>
          <p class="move-state ink" data-testid="aim-done-today">
            {fill(c.doneTodayAt, { time: formatTime(today.done.at) })}
          </p>
          {askEase && justDone !== null && <EaseTap key={justDone} offerId={justDone} withNote />}
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
              <button type="button" class="link" data-testid="aim-log" onClick={() => void onLog().then((id) => id !== null && setJustDone(id))}>
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

      {blocked && unblock && !open && !done && !paused && !unnamed && (
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

      <Disclosure label={d.details} sub={detailsSub} testid="aim-details">
        {learning ? (
          <>
            {learning.current && (
              <>
                <div class="actions">
                  <button type="button" class="textbtn" data-testid="aim-skill-edit-open" aria-expanded={editing === 'edit'} onClick={() => setEditing((v) => (v === 'edit' ? null : 'edit'))}>
                    {c.editSkill}
                  </button>
                  <button type="button" class="textbtn" data-testid="aim-skill-new-open" aria-expanded={editing === 'new'} onClick={() => setEditing((v) => (v === 'new' ? null : 'new'))}>
                    {c.newSkill}
                  </button>
                </div>
                {editing === 'edit' && (
                  <SkillForm
                    key={`edit-${learning.current.id}`}
                    initial={{ name: learning.current.name, method: learning.current.method, how: learning.current.how, minutes: learning.current.minutes }}
                    submit={c.save}
                    testid="aim-skill-edit"
                    onSubmit={(w) => {
                      learning.onEditSkill(learning.current?.id as number, w)
                      setEditing(null)
                    }}
                  />
                )}
                {editing === 'new' && (
                  <>
                    <SkillForm
                      key={`new-${learning.current.id}`}
                      initial={{ name: '', method: learning.current.method }}
                      submit={c.setSkill}
                      testid="aim-skill-new"
                      onSubmit={(w) => {
                        learning.onSetSkill(w)
                        setEditing(null)
                      }}
                    />
                    <p class="note faint no-gap">{c.newSkillNote}</p>
                  </>
                )}
              </>
            )}
            {(learning.current || learning.earlier.length > 0) && (
              <div class="calc" data-testid="aim-history">
                <p class="calc-line ink">{c.history}</p>
                {learning.current && (
                  <>
                    <p class="calc-line" data-testid="aim-history-current">
                      {fill(c.historyCurrent, { skill: learning.current.name, since: learning.current.startedAt ? formatDayShort(blockAt(new Date(learning.current.startedAt)).day) : '' })}
                    </p>
                    {learning.proofs[learning.current.id as number]?.length ? <p class="calc-line faint">{fill(c.proofsKept, { list: learning.proofs[learning.current.id as number].join(', ') })}</p> : null}
                  </>
                )}
                {learning.earlier.map(({ skill, sessions }) => (
                  <div key={skill.id} class="history-row">
                    <p class="calc-line" data-testid="aim-history-earlier">
                      {fill(c.historyEarlier, { skill: skill.name, sessions: countWord(sessions, c.sessionsWord) })}
                    </p>
                    {learning.proofs[skill.id as number]?.length ? <p class="calc-line faint">{fill(c.proofsKept, { list: learning.proofs[skill.id as number].join(', ') })}</p> : null}
                    <button type="button" class="textbtn" data-testid="aim-make-current" onClick={() => learning.onMakeCurrent(skill.id as number)}>
                      {c.makeCurrent}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {aim.about && (
              <p class="note faint" data-testid="aim-about">
                {fill(c.aboutSaid, { about: aim.about })}
              </p>
            )}
            <div class="actions">
              <button type="button" class="textbtn" data-testid="aim-pause" onClick={() => learning.onPause(!paused)}>
                {paused ? c.unpause : c.pause}
              </button>
              <button type="button" class="textbtn" data-testid="aim-finish" onClick={learning.onFinish}>
                {c.finish}
              </button>
              {onRemove && (
                <button type="button" class="textbtn faint" onClick={onRemove}>
                  {c.remove}
                </button>
              )}
            </div>
            <p class="note faint no-gap">{c.finishNote}</p>
          </>
        ) : (
          <>
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
          </>
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
 * The same commitment on Now, as one row: its goal or kind, the step, one tap beside, and under
 * both a line of facts with Plan. A fresh session is Start; Resume only finishes one answered Partly
 * today; once one is done today the row says so and asks nothing more, with a quiet Do another.
 * Something to learn with no skill named shows where to name it and nothing to start. Several fit
 * without a scroll; the rest lives on Aims.
 */
export function AimRow({ aim, step, open, openOffer, blocked, unblock, ctx, plan, last, today, due = false, askEase = false, onResume, onUnblock, onPlan, onLog, unnamed = false, index = 0 }: Shared & { unnamed?: boolean; index?: number }) {
  const c = copy.aims
  const [planOpen, setPlanOpen] = useState(false)
  const [justDone, setJustDone] = useState<number | null>(null)
  useQuarterMinute()
  const canDone = openOffer !== null && doneOpen(openOffer)
  const { pending, cues } = planState(plan, ctx)
  const done = !open && today.done !== null
  const minutes = step.minutes > 0 && fill(copy.catalogue.minutes, { n: String(step.minutes) })
  return (
    <RowFrame
      icon={kindIcon(aim)}
      index={index}
      due={due && !open && !done && !unnamed}
      testKind={aim.kind}
      kind={<span class="aim-kind">{aim.name ?? step.subject ?? c.kinds[aim.kind]}</span>}
      title={<StepTitle step={step} class="aim-title" />}
      side={
        unnamed ? null : open ? (
          canDone &&
          openOffer && (
            <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(openOffer).then((ok) => ok && setJustDone(openOffer.id as number))}>
              {copy.move.done}
            </button>
          )
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
            unnamed
              ? [c.noSkillRow]
              : open && openOffer
                ? [<span data-testid="aim-started">{startedWhen(openOffer)}</span>, minutes]
                : done && today.done
                  ? [formatTime(today.done.at), last && <span data-testid="aim-last">{last}</span>]
                  : [minutes, last && <span data-testid="aim-last">{last}</span>, today.partly && <span data-testid="aim-partly">{c.partlyToday}</span>, blocked && unblock && fill(c.blockedShort, { why: c.blockedWhy[blocked], unblock: unblock.name })]
          }
        />
      }
      links={
        !open &&
        !unnamed &&
        (done ? (
          <button type="button" class="link" data-testid="aim-another" onClick={onResume}>
            {c.doAnother}
          </button>
        ) : (
          <>
            {!pending && cues > 0 && <PlanTap open={planOpen} onToggle={() => setPlanOpen((v) => !v)} />}
            {!today.partly && (
              <button type="button" class="link" data-testid="aim-log" onClick={() => void onLog().then((id) => id !== null && setJustDone(id))}>
                {c.didIt}
              </button>
            )}
          </>
        ))
      }
      below={
        done && askEase && justDone !== null ? (
          <EaseTap key={justDone} offerId={justDone} />
        ) : (
          !open &&
          !done &&
          !unnamed &&
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
        )
      }
    />
  )
}
