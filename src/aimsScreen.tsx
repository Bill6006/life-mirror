import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { AimCard, AimRow, type Cadence, type LearningView } from './aimCard'
import { activeAims, addAim, addLearning, aimRecords, allIntentions, editSkill, finishAim, finishedAims, liveSkills, logSession, makeCurrent, openAimOffers, pauseAim, planAim, removeAim, reopenAim, resumeAim, rungMarks, setAimStep, setCurrentSkill, setRhythm, setSchedule, type AimRecords } from './aimFlow'
import { BECOMING_KEYS, becoming, blockedBy, cueCounts, currentSkillOf, easeRetired, followThrough, keysOf, lastDoneDay, lastLine, lastPracticeDay, planFor, practiceDaysOf, practiceOn, sessionsToday, skillsOfAim, stepChoices, stepFor, studyOfferBelongs, unblockFor, type Tally } from './aims'
import { dueOf, inStudyTime, isFaithPractice, rankOf, rhythmOf, scheduleOf, type Rhythm } from './rhythm'
import { addPathAim, coachAllowed, convertToSocial, monthlyChecks, pathOn, pausePath, peopleRowOf, resumePath } from './pathFlow'
import { carriedFor, PathCard, PathRow, type PathShared } from './pathCard'
import { lightOnlyDay, partnerOnly, pathName, pathToday, type PathToday } from './pathStage'
import { PartnerDates, PartnerPrompts, PartnerSettings } from './partnerScreen'
import { blockAt } from './blocks'
import { families, type PathId } from './catalogue'
import { NavRow } from './controls'
import { copy } from './copy'
import { allWins, db, getDayContext, getSettings, type Aim, type AimKind, type Cue, type Intention, type RungMark, type Skill } from './db'
import { fill, formatDayShort } from './format'
import { whatBringsYouBack } from './associations'
import { hasMove, moveById } from './catalogue'
import { currentRung, groupBySubject, ladderCounts, ladderOf, rungName, sittingOf } from './ladder'
import { useLive } from './live'
import { todaysLine } from './brainFlow'
import { anotherSuggestion, answerReview, askSuggestion, coachStates, editedSuggestion, ensureReviews, skillCoachOpen, takeLikelyNext, useSuggestion, writeOwnSkill, type AimCoach } from './coachFlow'
import { isPhysical } from './coachShared'
import { ScreenHead, SectionLabel } from './ui'

// The Aims tab: the commitments you chose with their protected steps, and the doors to the
// proof ladder, follow-through and who you are becoming. Nothing here grades, ranks or streaks.

function useAims() {
  const { day: today, block } = blockAt(new Date())
  const aims = useLive(activeAims, [])
  const skills = useLive(liveSkills, [])
  const marks = useLive(rungMarks, [])
  const open = useLive(openAimOffers, [])
  const records = useLive(aimRecords, [])
  const intentions = useLive(allIntentions, [])
  const ctx = useLive(() => getDayContext(today), [today])
  // A path reads its whole record, today's answers from any offer, and tier 2's counts (Part 24).
  const offers = useLive(() => db.offers.toArray(), [])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  const contexts = useLive(() => db.days.toArray(), [])
  // The paths' declarations, the online switch, and whether today reads hard enough for light reps alone (Part 27).
  const pathMarks = useLive(() => db.pathMarks.toArray(), [])
  const settings = useLive(getSettings, [])
  const todays = useLive(() => db.checkins.where('day').equals(today).toArray(), [today])
  // The coach's pick for today, when the brain wrote one (Part 32); the row uses it only while it holds, and never on the Partner path while the monthly check shows its help.
  const coach = useLive(() => db.coachPicks.where('day').equals(today).toArray(), [today])
  const checks = useLive(monthlyChecks, [])
  // Parts 40 and 41: each learning commitment's skill coach; null while their gate is closed.
  const skillCoach = useLive(() => coachStates(today), [today])
  if (!aims || !skills || !marks || !open || !records || !intentions || ctx === undefined || !offers || !outcomes || !contexts || !pathMarks || !settings || !todays || !coach || !checks || skillCoach === undefined) return null
  return { aims, skills, marks, open, records, intentions, ctx, today, block, offers, outcomes, contexts, pathMarks, settings, lightOnly: lightOnlyDay(todays, today), coach: coachAllowed([...coach].sort((a, b) => (a.at < b.at ? 1 : -1))[0] ?? null, checks, today), skillCoach }
}

/** A learning commitment's own view: the practice on its current skill, the skills before it newest first with their sessions, the proofs the retired ladder recorded (read only), and the taps only you make. */
function learningView(aim: Aim, current: Skill | null, skills: readonly Skill[], marks: readonly RungMark[], records: AimRecords, studyAims: readonly Aim[], coach: AimCoach | null = null): LearningView {
  const own = skillsOfAim(aim, skills, studyAims)
  const earlier = own
    .filter((sk) => sk.id !== current?.id)
    .sort((a, b) => ((a.endedAt ?? a.createdAt) < (b.endedAt ?? b.createdAt) ? 1 : -1))
    .map((skill) => ({ skill, sessions: practiceOn({ ...skill, startedAt: undefined }, records.offers, records.outcomes).sessions }))
  const proofs: Record<number, string[]> = {}
  for (const sk of own) {
    const reached = [...new Set(marks.filter((m) => m.skillId === sk.id && m.rung > 0).sort((a, b) => (a.at < b.at ? -1 : 1)).map((m) => m.rung))]
    if (reached.length) proofs[sk.id as number] = reached.map((r) => rungName(r, ladderOf(sk)))
  }
  const id = aim.id as number
  return {
    current,
    practice: current ? practiceOn(current, records.offers, records.outcomes) : null,
    earlier,
    proofs,
    onSetSkill: (w) => void setCurrentSkill(id, w),
    onEditSkill: (skillId, w) => void editSkill(skillId, w),
    onMakeCurrent: (skillId) => void makeCurrent(id, skillId),
    onPause: (paused) => void pauseAim(id, paused),
    onFinish: () => void finishAim(id),
    onTakeNext: () => void takeLikelyNext(id),
    ...(coach
      ? {
          coach: {
            state: coach,
            setup: { onUse: (askId) => void useSuggestion(askId), onEdited: (askId, w, r) => void editedSuggestion(askId, w, r), onAnother: (askId) => void anotherSuggestion(askId), onOwn: (askId) => void writeOwnSkill(askId) },
            onAsk: (care) => void askSuggestion(id, undefined, undefined, undefined, care),
            onReview: (askId, a) => void answerReview(askId, a),
            rhythm: rhythmOf(aim.rhythm),
          },
        }
      : {}),
  }
}

/** What a plan says when its reminder shows: the rep's name, except a rep the Partner path holds alone, which the lock screen shows only as a people rep. */
function planLabel(pt: PathToday): string {
  const rep = pt.pick
  if (rep && !partnerOnly(rep.moveId)) return moveById(rep.moveId).name
  return pt.path.id === 'partner' ? copy.path.planLabel : pathName(pt.path)
}

/** The cards of every commitment, with Resume and the unblock offer; shared by Now and the Aims tab. */
/** Every commitment with its protected step: full cards on Aims, or one row each on Now so several fit without a scroll. A paused path has no row on Now. */
export function AimCards({ onRemove, onChangeStep, onChangeRep, onPartnerNotes, compact = false, dueAimId = null }: { onRemove?: (aim: Aim) => void; onChangeStep?: (aim: Aim) => void; onChangeRep?: (aim: Aim) => void; onPartnerNotes?: () => void; compact?: boolean; dueAimId?: number | null }) {
  const data = useAims()
  // Parts 40 and 41: a review due on a current skill is put in place when the screen opens or a session is answered; nothing while their gate is closed.
  const answered = data?.records.outcomes.length ?? 0
  useEffect(() => {
    if (data && skillCoachOpen()) void ensureReviews(data.today)
  }, [data?.today, answered])
  if (!data) return null
  const { skills, marks, open, records, intentions, ctx, today, block, offers, outcomes, contexts, pathMarks, settings, lightOnly, coach, skillCoach } = data
  const easeOff = easeRetired(records.offers, records.outcomes, settings.easeBack ?? null)
  const aims = compact ? data.aims.filter((a) => !a.pausedAt) : data.aims
  if (aims.length === 0) return null
  const studyAims = aims.filter((a) => a.kind === 'certification')
  const socialOn = aims.some((a) => a.kind === 'path' && a.path === 'social')
  // The paths computed once for this block: their cards, and the one People row between them (Part 27).
  const todayFor = (aim: Aim) => pathToday({ aim, offers, outcomes, ctx, day: today, block, marks: pathMarks, online: settings.partnerOnline, lightOnly, faithHidden: settings.hideFaith })
  const views = aims.filter(pathOn).map(todayFor)
  const people = peopleRowOf(views, open, today, block, coach)
  // One plan and one reminder for the People row, whichever path holds it.
  const pathPlan =
    views
      .map((v) => planFor(intentions, v.aim.id as number, today))
      .filter((x): x is Intention => x !== null)
      .sort((a, b) => (a.setAt < b.setAt ? 1 : -1))[0] ?? null
  const planHolder = pathPlan ? (views.find((v) => v.aim.id === pathPlan.aimId)?.aim ?? null) : null
  const pathShared = (aim: Aim, pt: PathToday, paths: readonly PathId[], elsewhere: PathShared['elsewhere']): PathShared => {
    const keys = keysOf(aim, studyAims)
    const openOffer = open.find((o) => keys.includes(o.situationKey)) ?? null
    return {
      aim,
      pt,
      block,
      open: openOffer !== null,
      openOffer,
      ctx,
      plan: pathPlan,
      carried: pt.pick ? null : carriedFor(offers, outcomes, contexts, today, block, ctx),
      paths,
      elsewhere,
      onResume: () => pt.pick && void resumePath(aim, pt.pick, pt.elig.stage, new Date(), paths),
      onChange: () => onChangeRep?.(aim),
      onPlan: (cue: Cue, time: string) => void planAim(planHolder ?? aim, cue, time, new Date(), planLabel(pt)),
    }
  }
  let rowShown = false
  // Part 39: each commitment's state today. On Now the rows go in that order (started, planned, due,
  // partly, open, done today, then a rest day or a met week); inside your preferred study time what is
  // due to learn comes first among equals. That preference never makes anything due.
  const studyTime = inStudyTime(settings, new Date())
  const entries: { rank: number; learning: boolean; pos: number; render: (index: number) => ComponentChildren }[] = []
  aims.forEach((aim, pos) => {
    if (aim.kind === 'path') {
      if (compact) {
        // Now holds one People row, whatever paths are on.
        if (rowShown || !people) return
        rowShown = true
        const started = open.some((o) => views.some((v) => keysOf(v.aim, []).includes(o.situationKey)))
        const rank = started ? 0 : people.view.repDone ? rankOf({ state: 'done' }) : people.pick ? rankOf({ state: 'due' }) : rankOf({ state: 'notDue' })
        entries.push({ rank, learning: false, pos, render: (index) => <PathRow key="people" {...pathShared(people.view.aim, { ...people.view, pick: people.pick }, people.paths, null)} index={index} due={people.view.aim.id === dueAimId} /> })
        return
      }
      const view = views.find((v) => v.aim.id === aim.id)
      const pt = view ?? todayFor(aim)
      const owns = people !== null && people.view.aim.id === aim.id
      const elsewhere = view && people && !owns ? { path: people.view.path.id, shared: people.paths.includes(pt.path.id) } : null
      entries.push({
        rank: 0,
        learning: false,
        pos,
        render: () => (
          <PathCard
            key={aim.id}
            {...pathShared(aim, owns && people ? { ...pt, pick: people.pick } : pt, owns && people ? people.paths : [pt.path.id], elsewhere)}
            today={today}
            counts={cueCounts(intentions, aim.id as number)}
            due={aim.id === dueAimId}
            onPause={(paused) => void pausePath(aim.id as number, paused)}
            onRemove={() => onRemove?.(aim)}
            prompts={pt.path.id === 'partner' ? <PartnerPrompts pt={pt} lightOnly={lightOnly} today={today} /> : undefined}
            dates={pt.path.id === 'partner' ? <PartnerDates pt={pt} today={today} /> : undefined}
            settings={pt.path.id === 'partner' ? <PartnerSettings paused={Boolean(aim.pausedAt)} onNotes={() => onPartnerNotes?.()} /> : undefined}
          />
        ),
      })
      return
    }
    const step = stepFor(aim, skills, marks, studyAims)
    const keys = keysOf(aim, studyAims)
    const openOffer = open.find((o) => keys.includes(o.situationKey) || studyOfferBelongs(o, aim, skills, studyAims)) ?? null
    const blocked = blockedBy(aim, records.offers, records.outcomes, records.nights, skills, studyAims)
    const unblock = blocked ? unblockFor(blocked) : null
    const study = aim.kind === 'certification'
    // One plain fact: when it was last practised, or the step last done. Silence is not a gap in practice (Rule 2).
    const last = study ? lastLine('practised', lastPracticeDay(aim, records.offers, records.outcomes, skills, studyAims), today) : lastLine('done', lastDoneDay(aim, records.offers, records.outcomes, studyAims), today)
    const todaySessions = sessionsToday(aim, records.offers, records.outcomes, today, skills, studyAims)
    const current = study ? currentSkillOf(aim, skills, marks, studyAims) : null
    const plan = planFor(intentions, aim.id as number, today)
    const rhythm = rhythmOf(aim.rhythm)
    const schedule = scheduleOf(aim.schedule)
    const faith = isFaithPractice(aim)
    const due = dueOf({ rhythm, schedule, paused: Boolean(aim.pausedAt), started: openOffer !== null, doneToday: todaySessions.done !== null, partlyToday: todaySessions.partly, planned: plan !== null && plan.offerId === null, faith, practiceDays: practiceDaysOf(aim, records.offers, records.outcomes, skills, studyAims), today })
    const id = aim.id as number
    const cadence: Cadence = { due, rhythm, schedule, faith, ...(study ? { onRhythm: (r: Rhythm | null) => void setRhythm(id, r) } : {}), onSchedule: (days) => void setSchedule(id, days) }
    const shared = {
      aim,
      step,
      open: openOffer !== null,
      openOffer,
      blocked,
      unblock,
      ctx,
      plan,
      last,
      today: todaySessions,
      // The line's pick carries the accent until its session is done today (Workstream 6).
      due: aim.id === dueAimId && todaySessions.done === null,
      // Something to learn asks how each session went, until the tap has gone unused a dozen times running.
      askEase: study && !easeOff,
      cadence,
      onResume: () => void resumeAim(aim, step, 'step'),
      onLog: () => logSession(aim, step),
      onUnblock: () => unblock && void resumeAim(aim, sittingOf(unblock), 'unblock'),
      onPlan: (cue: Cue, time: string) => void planAim(aim, cue, time, new Date(), step.name),
    }
    // Something to learn with no skill named has nothing to start, so it sits with what is not due.
    const rank = study && current === null ? rankOf({ state: 'notDue' }) : rankOf(due)
    entries.push({
      rank,
      learning: study,
      pos,
      render: (index) =>
        compact ? (
          <AimRow key={aim.id} {...shared} unnamed={study && current === null} index={index} reviewOpen={Boolean(skillCoach?.get(aim.id as number)?.review)} />
        ) : (
          <AimCard
            key={aim.id}
            {...shared}
            counts={cueCounts(intentions, aim.id as number)}
            onRemove={onRemove ? () => onRemove(aim) : undefined}
            onChangeStep={onChangeStep && !study && aim.kind !== 'person' ? () => onChangeStep(aim) : undefined}
            onConvert={aim.kind === 'person' && !socialOn ? () => void convertToSocial(aim.id as number) : undefined}
            learning={study ? learningView(aim, current, skills, marks, records, studyAims, skillCoach?.get(aim.id as number) ?? null) : undefined}
          />
        ),
    })
  })
  // Rows are numbered in the order they show; only the compact theme draws the numbers. Aims keeps its own order.
  const ordered = compact ? [...entries].sort((a, b) => a.rank - b.rank || Number(b.learning && studyTime) - Number(a.learning && studyTime) || a.pos - b.pos) : entries
  const items = ordered.map((e, index) => e.render(index))
  if (compact) {
    return (
      <div class="card aims-card">
        <ul class="rows">{items}</ul>
      </div>
    )
  }
  return <>{items}</>
}

export function AimsScreen({
  onAdd,
  onChangeStep,
  onChangeRep,
  onLadder,
  onFollow,
  onBecoming,
  onHer,
  onPartnerNotes,
}: {
  onAdd: () => void
  onChangeStep: (aimId: number) => void
  onChangeRep: (aimId: number) => void
  onLadder: () => void
  onFollow: () => void
  onBecoming: () => void
  onHer: () => void
  onPartnerNotes: () => void
}) {
  const today = blockAt(new Date())
  const aims = useLive(activeAims, [])
  // The one commitment the Brain's line names is the one thing to do here: its Start carries the accent.
  const line = useLive(() => todaysLine(today.day), [today.day])
  const proofs = useLive(() => db.rungMarks.count(), [])
  const finished = useLive(finishedAims, [])
  if (!aims || proofs === undefined || !finished) return <section class="screen" />
  const c = copy.aims
  const dueAimId = line?.action?.kind === 'plan' ? line.action.aimId : null

  return (
    <section class="screen">
      <ScreenHead title={copy.tabs.aims} day={today.day} />

      <SectionLabel index={0}>{c.commitments}</SectionLabel>
      {aims.length === 0 && <p class="note">{c.none}</p>}
      <AimCards onRemove={(aim) => void removeAim(aim.id as number)} onChangeStep={(aim) => onChangeStep(aim.id as number)} onChangeRep={(aim) => onChangeRep(aim.id as number)} onPartnerNotes={onPartnerNotes} dueAimId={dueAimId} />

      <div class="card doors">
        <ul class="rows">
          <NavRow label={c.add} note={c.addDoor} onClick={onAdd} />
          {proofs > 0 && <NavRow label={c.ladder} note={c.ladderDoor} onClick={onLadder} />}
          <NavRow label={c.follow} note={c.followDoor} onClick={onFollow} />
          <NavRow label={c.becoming} note={c.becomingDoor} onClick={onBecoming} />
          <NavRow label={c.her} note={c.herDoor} onClick={onHer} />
        </ul>
      </div>
      {finished.length > 0 && (
        <div class="calc" data-testid="aims-finished">
          <p class="calc-line ink">{c.finished}</p>
          {finished.map((a) => (
            <p key={a.id} class="calc-line" data-testid="aim-finished">
              {fill(c.finishedLine, { name: a.name ?? c.kinds[a.kind], day: formatDayShort(blockAt(new Date(a.finishedAt as string)).day) })}
              {' · '}
              <button type="button" class="textbtn inline" data-testid="aim-reopen" onClick={() => void reopenAim(a.id as number)}>
                {c.reopen}
              </button>
            </p>
          ))}
        </div>
      )}
      <p class="note faint">{c.dataNote}</p>
    </section>
  )
}

function familyName(id: string): string {
  return families.find((f) => f.id === id)?.name ?? id
}

/** The catalogue moves a person or a practice can take as its step, one tap each. */
function StepPicker({ kind, onPick }: { kind: AimKind; onPick: (moveId: string) => void }) {
  const c = copy.aims
  return (
    <>
      <p class="note">{c.pickNote}</p>
      <div class="card">
        <ul class="rows">
          {stepChoices(kind).map((m) => (
            <li key={m.id}>
              <button type="button" class="row" data-testid={`step-choice-${m.id}`} onClick={() => onPick(m.id)}>
                <span class="row-main">
                  {m.name}
                  <span class="sub">
                    {fill(copy.catalogue.minutes, { n: String(m.minutes) })} · {familyName(m.family)}
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
    </>
  )
}

/**
 * Something to learn (Workstream 6): the goal in your words, how you learn or practise it or that
 * you are not sure yet, the one thing to work on now when you know it, and anything that would
 * change the advice. No cadence is asked or assumed; the card keeps a place for the skill.
 */
function LearningForm({ onAdd }: { onAdd: (goal: string, method: string, skill: string, about: string) => void }) {
  const c = copy.aims
  const [goal, setGoal] = useState('')
  const [method, setMethod] = useState('')
  const [unsure, setUnsure] = useState(false)
  const [skill, setSkill] = useState('')
  const [about, setAbout] = useState('')
  const input = (label: string, value: string, set: (v: string) => void, testid: string, max: number, placeholder: string, disabled = false) => (
    <>
      <p class="setting-label">{label}</p>
      <div class="add">
        <input class="input" type="text" maxLength={max} aria-label={label} placeholder={placeholder} value={value} disabled={disabled} data-testid={testid} onInput={(e) => set((e.currentTarget as HTMLInputElement).value)} />
      </div>
    </>
  )
  return (
    <>
      <p class="note">{c.learnNote}</p>
      {input(c.goalLabel, goal, setGoal, 'aim-goal-input', 60, c.goalPlaceholder)}
      {input(c.methodLabel, unsure ? '' : method, setMethod, 'aim-method-input', 60, c.methodPlaceholder, unsure)}
      <span class="when method-unsure" role="group" aria-label={c.methodLabel}>
        <button type="button" class={unsure ? 'when-chip is-on' : 'when-chip'} aria-pressed={unsure} data-testid="aim-method-unsure" onClick={() => setUnsure((v) => !v)}>
          {c.notSure}
        </button>
      </span>
      {input(c.skillLabel, skill, setSkill, 'aim-skill-now-input', 80, c.skillNowPlaceholder)}
      <p class="note faint">{c.skillNowNote}</p>
      {input(c.aboutLabel, about, setAbout, 'aim-about-input', 240, c.aboutPlaceholder)}
      <div class="actions">
        <button type="button" class="pill-ink" data-testid="aim-learn-add" disabled={!goal.trim()} onClick={() => onAdd(goal, unsure ? '' : method, skill, about)}>
          {c.studyAdd}
        </button>
      </div>
    </>
  )
}

/**
 * Two taps deeper than Now: pick a kind; something to learn is named by you with the one thing to
 * work on now (Workstream 6); a practice picks its step from the catalogue; the Social path is added in one tap (Part 24), and the
 * Partner path too, only ever by your own tap (Part 27). A person can no longer be added: one already
 * on the list converts to the Social path from its card.
 */
export function AddAimScreen({ onClose }: { onClose: () => void }) {
  const aims = useLive(activeAims, [])
  const [kind, setKind] = useState<AimKind | null>(null)
  if (!aims) return <section class="screen" />
  const c = copy.aims
  // Study is always open to add, one per subject; a practice and each path once; the Social path not beside a person, which converts instead.
  const socialOpen = !aims.some((a) => a.kind === 'person' || (a.kind === 'path' && a.path === 'social'))
  const partnerOpen = !aims.some((a) => a.kind === 'path' && a.path === 'partner')
  const options: { id: string; label: string; note: string; onPick: () => void }[] = [
    { id: 'certification', label: c.kinds.certification, note: c.kindNotes.certification, onPick: () => setKind('certification') },
    ...(socialOpen ? [{ id: 'path-social', label: copy.path.social, note: copy.path.socialNote, onPick: () => void addPathAim('social').then(onClose) }] : []),
    ...(partnerOpen ? [{ id: 'path-partner', label: copy.path.partnerAdd, note: copy.path.partnerAddNote, onPick: () => void addPathAim('partner').then(onClose) }] : []),
    ...(aims.some((a) => a.kind === 'practice') ? [] : [{ id: 'practice', label: c.kinds.practice, note: c.kindNotes.practice, onPick: () => setKind('practice') }]),
  ]

  return (
    <section class="screen" data-testid="add-aim">
      <header class="screen-head">
        <p class="eyebrow">{kind === 'certification' ? c.studyName : kind ? c.pickStep : c.add}</p>
      </header>
      {kind === null ? (
        <>
          <p class="note">{c.addNote}</p>
          <div class="card">
            <ul class="rows">
              {options.map((o) => (
                <li key={o.id}>
                  <button type="button" class="row" data-testid={`aim-kind-${o.id}`} onClick={o.onPick}>
                    <span class="row-main">
                      {o.label}
                      <span class="sub">{o.note}</span>
                    </span>
                    <span class="chev" aria-hidden="true">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : kind === 'certification' ? (
        <LearningForm
          onAdd={(goal, method, skill, about) =>
            void addLearning(goal, method, skill, about).then((id) => {
              // Parts 40 and 41: with no skill named, Claude is asked for a first suggestion, once their gate is open and it may be asked;
              // a physical goal waits for its one safety question, on the card.
              if (id !== null && !skill.trim() && skillCoachOpen() && !isPhysical([goal, method, about])) void askSuggestion(id)
              onClose()
            })
          }
        />
      ) : (
        <StepPicker kind={kind} onPick={(id) => void addAim(kind, id).then(onClose)} />
      )}
      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.checkin.close}
        </button>
      </div>
    </section>
  )
}

/** Change a person's or a practice's step: the same picker, for one commitment. */
export function PickStepScreen({ aimId, onClose }: { aimId: number; onClose: () => void }) {
  const aim = useLive(() => db.aims.get(aimId).then((a) => a ?? null), [aimId])
  if (aim === undefined) return <section class="screen" />
  if (aim === null || aim.kind === 'certification') {
    onClose()
    return <section class="screen" />
  }
  return (
    <section class="screen" data-testid="pick-step">
      <header class="screen-head">
        <p class="eyebrow">{copy.aims.pickStep}</p>
      </header>
      <StepPicker kind={aim.kind} onPick={(id) => void setAimStep(aimId, id).then(onClose)} />
      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.checkin.close}
        </button>
      </div>
    </section>
  )
}

/**
 * Earlier proofs (Workstream 6, D2): what each skill reached on the retired proof ladder, kept as it
 * was, with the day of each mark. Read only: nothing here adds a skill or moves a rung.
 */
export function LadderScreen({ onClose }: { onClose: () => void }) {
  const skills = useLive(() => db.skills.toArray(), [])
  const marks = useLive(rungMarks, [])
  if (!skills || !marks) return <section class="screen" />
  const l = copy.ladder
  const marked = skills.filter((sk) => marks.some((m) => m.skillId === sk.id))
  return (
    <section class="screen" data-testid="ladder">
      <header class="screen-head">
        <p class="eyebrow">{l.title}</p>
      </header>
      <p class="note">{l.intro}</p>
      {marked.length > 0 && (
        <div class="calc ladder-counts" data-testid="ladder-counts">
          {(['technical', 'language', 'craft'] as const).map((k) =>
            ladderCounts(marked, marks, k).map((n, i) => n > 0 && <p key={`${k}${i}`} class="calc-line">{fill(l.countLine, { n: String(n), rung: rungName(i, k) })}</p>),
          )}
        </div>
      )}
      <div class="card">
        {marked.length === 0 ? (
          <p class="note faint in-card">{l.noneKept}</p>
        ) : (
          <ul class="rows">
            {groupBySubject(marked.map((sk) => ({ ...sk, archivedAt: null }))).flatMap((g) => [
              ...(g.subject
                ? [
                    <li key={`subject-${g.subject}`} class="row is-static" data-testid="skill-subject">
                      <span class="row-main faint">
                        {g.subject}
                        <span class="sub">{l.kinds[g.kind]}</span>
                      </span>
                    </li>,
                  ]
                : []),
              ...g.skills.map((sk) => {
                const own = marks.filter((m) => m.skillId === sk.id).sort((a, b) => (a.at < b.at ? -1 : 1))
                return (
                  <li key={sk.id} class="row is-static" data-testid="skill-row">
                    <span class="row-main">
                      {sk.name}
                      <span class="sub">{rungName(currentRung(marks, sk.id as number), ladderOf(sk))}</span>
                      <span class="sub faint">{own.map((m) => fill(l.markLine, { rung: rungName(m.rung, ladderOf(sk)), day: formatDayShort(blockAt(new Date(m.at)).day) })).join(' · ')}</span>
                    </span>
                  </li>
                )
              }),
            ])}
          </ul>
        )}
      </div>
      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

function tallyLine(t: Tally): string {
  return fill(copy.aims.followLine, { started: String(t.started), finished: String(t.finished) })
}

/** Follow-through as counts only: started and finished, across moves, steps and minimum wins. */
export function FollowScreen({ onClose }: { onClose: () => void }) {
  const offers = useLive(() => db.offers.toArray(), [])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  const wins = useLive(allWins, [])
  if (!offers || !outcomes || !wins) return <section class="screen" />
  const c = copy.aims
  const f = followThrough(offers, outcomes, wins)
  const brings = whatBringsYouBack(offers, outcomes).filter((b) => hasMove(b.moveId)).slice(0, 5)

  return (
    <section class="screen" data-testid="follow">
      <header class="screen-head">
        <p class="eyebrow">{c.follow}</p>
      </header>
      <p class="note">{c.followNote}</p>
      <div class="card pad">
        <p class="move-title" data-testid="follow-all">
          {tallyLine(f.all)}
        </p>
        <div class="calc">
          <p class="calc-line" data-testid="follow-moves">
            <span class="calc-key">{c.followMoves}</span> · {tallyLine(f.moves)}
          </p>
          <p class="calc-line" data-testid="follow-steps">
            <span class="calc-key">{c.followSteps}</span> · {tallyLine(f.steps)}
          </p>
          <p class="calc-line" data-testid="follow-wins">
            <span class="calc-key">{c.followWins}</span> · {tallyLine(f.wins)}
          </p>
        </div>
      </div>
      <h2 class="section">{copy.evidence.brings}</h2>
      <div class="card pad">
        {brings.length === 0 ? (
          <p class="note no-gap">{copy.evidence.bringsNone}</p>
        ) : (
          <div class="calc">
            {brings.map((b) => (
              <p key={b.moveId} class="calc-line">
                {fill(copy.evidence.bringsLine, { move: moveById(b.moveId).name, n: String(b.n) })}
              </p>
            ))}
          </div>
        )}
        <p class="note faint no-gap">{copy.evidence.bringsNote}</p>
      </div>
      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

/** Who you are becoming: your direction sentence, shown back unchanged, and dated counts from what was marked done. */
export function BecomingScreen({ onClose }: { onClose: () => void }) {
  const settings = useLive(getSettings, [])
  const offers = useLive(() => db.offers.toArray(), [])
  const outcomes = useLive(() => db.outcomes.toArray(), [])
  if (!settings || !offers || !outcomes) return <section class="screen" />
  const c = copy.aims
  const counts = becoming(offers, outcomes)

  return (
    <section class="screen" data-testid="becoming">
      <header class="screen-head">
        <p class="eyebrow">{c.becoming}</p>
      </header>
      <p class="note">{c.becomingNote}</p>
      <div class="card pad">
        {settings.direction ? (
          <p class="direction-line" data-testid="direction-line">
            {settings.direction}
          </p>
        ) : (
          <p class="note no-gap">{c.noDirection}</p>
        )}
      </div>
      <div class="card pad">
        {BECOMING_KEYS.map((k) => (
          <div key={k} class="count-row" data-testid={`becoming-${k}`}>
            <span class="row-main">{c.counts[k]}</span>
            <span class="row-side ink">{counts[k].n > 0 && counts[k].last ? fill(c.countLine, { n: String(counts[k].n), date: formatDayShort(counts[k].last as string) }) : c.countNone}</span>
          </div>
        ))}
      </div>
      <div class="actions">
        <button type="button" class="textbtn" onClick={onClose}>
          {copy.summary.done}
        </button>
      </div>
    </section>
  )
}

/**
 * On Now: every commitment's protected step under its own heading, above the move under its own.
 * Never blended (Rule 8); the two headings are what says so. A paused path has no row.
 */
export function AimsOnNow({ onChangeRep, dueAimId = null }: { onChangeRep?: (aimId: number) => void; dueAimId?: number | null }) {
  const data = useAims()
  if (!data || !data.aims.some((a) => !a.pausedAt)) return null
  const c = copy.aims
  return (
    <>
      <SectionLabel index={0} testid="your-aims">
        {c.yourAims}
      </SectionLabel>
      <AimCards compact onChangeRep={onChangeRep ? (aim) => onChangeRep(aim.id as number) : undefined} dueAimId={dueAimId} />
    </>
  )
}
