import { useState } from 'preact/hooks'
import { AimCard, AimRow } from './aimCard'
import { activeAims, addAim, addSkill, aimRecords, allIntentions, liveSkills, moveSkill, nameAim, openAimOffers, planAim, removeAim, removeSkill, resumeAim, rungMarks, setAimStep, setLadder } from './aimFlow'
import { BECOMING_KEYS, becoming, blockedBy, cueCounts, followThrough, keysOf, lastDoneDay, lastLine, lastMovedDay, planFor, stepChoices, stepFor, studyOfferBelongs, unblockFor, type Tally } from './aims'
import { addPathAim, convertToSocial, pausePath, resumePath } from './pathFlow'
import { carriedFor, PathCard, PathRow, type PathShared } from './pathCard'
import { pathName, pathToday } from './pathStage'
import { blockAt } from './blocks'
import { families } from './catalogue'
import { NavRow } from './controls'
import { copy } from './copy'
import { allWins, db, getDayContext, getSettings, type Aim, type AimKind, type Cue, type LadderKind } from './db'
import { fill, formatDayLong, formatDayShort } from './format'
import { whatBringsYouBack } from './associations'
import { hasMove, moveById } from './catalogue'
import { currentRung, groupBySubject, ladderCounts, ladderOf, rungName, sittingOf, skillsOf, TOP_RUNG } from './ladder'
import { useLive } from './live'

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
  if (!aims || !skills || !marks || !open || !records || !intentions || ctx === undefined || !offers || !outcomes || !contexts) return null
  return { aims, skills, marks, open, records, intentions, ctx, today, block, offers, outcomes, contexts }
}

/** The cards of every commitment, with Resume and the unblock offer; shared by Now and the Aims tab. */
/** Every commitment with its protected step: full cards on Aims, or one row each on Now so several fit without a scroll. A paused path has no row on Now. */
export function AimCards({ onRemove, onChangeStep, onChangeRep, compact = false }: { onRemove?: (aim: Aim) => void; onChangeStep?: (aim: Aim) => void; onChangeRep?: (aim: Aim) => void; compact?: boolean }) {
  const data = useAims()
  if (!data) return null
  const { skills, marks, open, records, intentions, ctx, today, block, offers, outcomes, contexts } = data
  const aims = compact ? data.aims.filter((a) => !(a.kind === 'path' && a.pausedAt)) : data.aims
  if (aims.length === 0) return null
  const studyAims = aims.filter((a) => a.kind === 'certification')
  const socialOn = aims.some((a) => a.kind === 'path' && a.path === 'social')
  const items = aims.map((aim) => {
    if (aim.kind === 'path') {
      const pt = pathToday({ aim, offers, outcomes, ctx, day: today, block })
      const keys = keysOf(aim, studyAims)
      const openOffer = open.find((o) => keys.includes(o.situationKey)) ?? null
      const shared: PathShared = {
        aim,
        pt,
        block,
        open: openOffer !== null,
        openOffer,
        ctx,
        plan: planFor(intentions, aim.id as number, today),
        carried: pt.pick ? null : carriedFor(offers, outcomes, contexts, today, block, ctx),
        onResume: () => pt.pick && void resumePath(aim, pt.pick, pt.elig.stage),
        onChange: () => onChangeRep?.(aim),
        onPlan: (cue: Cue, time: string) => void planAim(aim, cue, time, new Date(), pt.pick ? moveById(pt.pick.moveId).name : pathName(pt.path)),
      }
      return compact ? (
        <PathRow key={aim.id} {...shared} />
      ) : (
        <PathCard key={aim.id} {...shared} today={today} counts={cueCounts(intentions, aim.id as number)} onPause={(paused) => void pausePath(aim.id as number, paused)} onRemove={() => onRemove?.(aim)} />
      )
    }
    const step = stepFor(aim, skills, marks, studyAims)
    const keys = keysOf(aim, studyAims)
    const openOffer = open.find((o) => keys.includes(o.situationKey) || studyOfferBelongs(o, aim, skills, studyAims)) ?? null
    const blocked = blockedBy(aim, records.offers, records.outcomes, records.nights, skills, studyAims)
    const unblock = blocked ? unblockFor(blocked) : null
    const study = aim.kind === 'certification'
    // One plain fact: when the ladder last moved, or the step was last done. A study commitment with no skills yet has no ladder to move.
    const last = study
      ? skillsOf(aim, skills, studyAims).length
        ? lastLine('moved', lastMovedDay(aim, skills, marks, studyAims), today)
        : null
      : lastLine('done', lastDoneDay(aim, records.offers, records.outcomes, studyAims), today)
    const shared = {
      aim,
      step,
      open: openOffer !== null,
      openOffer,
      blocked,
      unblock,
      ctx,
      plan: planFor(intentions, aim.id as number, today),
      last,
      onResume: () => void resumeAim(aim, step, 'step'),
      onUnblock: () => unblock && void resumeAim(aim, sittingOf(unblock), 'unblock'),
      onPlan: (cue: Cue, time: string) => void planAim(aim, cue, time, new Date(), step.name),
    }
    return compact ? (
      <AimRow key={aim.id} {...shared} />
    ) : (
      <AimCard
        key={aim.id}
        {...shared}
        counts={cueCounts(intentions, aim.id as number)}
        onRemove={onRemove ? () => onRemove(aim) : undefined}
        onChangeStep={onChangeStep && !study && aim.kind !== 'person' ? () => onChangeStep(aim) : undefined}
        onConvert={aim.kind === 'person' && !socialOn ? () => void convertToSocial(aim.id as number) : undefined}
        skillCount={study ? skillsOf(aim, skills, studyAims).length : undefined}
        onAddSkill={study && aim.name ? (n) => void addSkill(n, aim.name ?? '') : undefined}
        onName={study && !aim.name ? (n, k) => void nameAim(aim.id as number, n, k) : undefined}
        onLadder={study ? (k) => void setLadder(aim.id as number, k) : undefined}
      />
    )
  })
  if (compact) {
    return (
      <div class="card">
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
}: {
  onAdd: () => void
  onChangeStep: (aimId: number) => void
  onChangeRep: (aimId: number) => void
  onLadder: () => void
  onFollow: () => void
  onBecoming: () => void
  onHer: () => void
}) {
  const today = blockAt(new Date())
  const aims = useLive(activeAims, [])
  if (!aims) return <section class="screen" />
  const c = copy.aims

  return (
    <section class="screen">
      <header class="screen-head">
        <h1 class="eyebrow">{copy.tabs.aims}</h1>
        <p class="date">{formatDayLong(today.day)}</p>
      </header>

      <h2 class="section">{c.commitments}</h2>
      {aims.length === 0 && <p class="note">{c.none}</p>}
      <AimCards onRemove={(aim) => void removeAim(aim.id as number)} onChangeStep={(aim) => onChangeStep(aim.id as number)} onChangeRep={(aim) => onChangeRep(aim.id as number)} />

      <div class="card">
        <ul class="rows">
          <NavRow label={c.add} note={c.addNote} onClick={onAdd} />
          <NavRow label={c.ladder} note={c.ladderNote} onClick={onLadder} />
          <NavRow label={c.follow} note={c.followNote} onClick={onFollow} />
          <NavRow label={c.becoming} note={c.becomingNote} onClick={onBecoming} />
          <NavRow label={c.her} note={c.herNote} onClick={onHer} />
        </ul>
      </div>
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

/** Study, named by you: what you are learning, and which six proofs it climbs, chosen once. */
function StudyForm({ onAdd }: { onAdd: (name: string, ladder: LadderKind) => void }) {
  const c = copy.aims
  const [name, setName] = useState('')
  const [ladder, setLadder] = useState<LadderKind>('technical')
  return (
    <>
      <p class="note">{c.studyNote}</p>
      <div class="add">
        <input class="input" type="text" maxLength={40} placeholder={c.studyNamePlaceholder} value={name} data-testid="aim-name-input" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
      </div>
      <p class="setting-label">{c.studyLadder}</p>
      <div class="days" role="group" aria-label={c.studyLadder}>
        {(['technical', 'language', 'craft'] as const).map((k) => (
          <button key={k} type="button" class={ladder === k ? 'day is-on' : 'day'} aria-pressed={ladder === k} data-testid={`aim-ladder-${k}`} onClick={() => setLadder(k)}>
            {copy.ladder.kinds[k]}
          </button>
        ))}
      </div>
      <p class="note faint">{copy.ladder.kindNote}</p>
      <div class="actions">
        <button type="button" class="pill-ink" data-testid="aim-name-add" disabled={!name.trim()} onClick={() => onAdd(name, ladder)}>
          {c.studyAdd}
        </button>
      </div>
    </>
  )
}

/**
 * Two taps deeper than Now: pick a kind; study is named by you and chooses its six proofs; a
 * practice picks its step from the catalogue; the Social path is added in one tap (Part 24). A
 * person can no longer be added: one already on the list converts to the Social path from its card.
 */
export function AddAimScreen({ onClose }: { onClose: () => void }) {
  const aims = useLive(activeAims, [])
  const [kind, setKind] = useState<AimKind | null>(null)
  if (!aims) return <section class="screen" />
  const c = copy.aims
  // Study is always open to add, one per subject; a practice and each path once; the Social path not beside a person, which converts instead.
  const socialOpen = !aims.some((a) => a.kind === 'person' || (a.kind === 'path' && a.path === 'social'))
  const options: { id: string; label: string; note: string; onPick: () => void }[] = [
    { id: 'certification', label: c.kinds.certification, note: c.kindNotes.certification, onPick: () => setKind('certification') },
    ...(socialOpen ? [{ id: 'path-social', label: copy.path.social, note: copy.path.socialNote, onPick: () => void addPathAim('social').then(onClose) }] : []),
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
        <StudyForm onAdd={(name, ladder) => void addAim('certification', null, name, ladder).then(onClose)} />
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

/** The proof ladder: skills typed once on the phone, six proofs each, counts only, moved only by your tap. */
export function LadderScreen({ onClose }: { onClose: () => void }) {
  const skills = useLive(liveSkills, [])
  const marks = useLive(rungMarks, [])
  const aims = useLive(activeAims, [])
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  if (!skills || !marks || !aims) return <section class="screen" />
  const l = copy.ladder
  // A skill goes under one of your study commitments; the first is picked until you tap another.
  const subjects = aims.filter((a) => a.kind === 'certification').map((a) => (a.name ?? '').trim()).filter(Boolean)
  const subject = picked !== null && subjects.includes(picked) ? picked : (subjects[0] ?? '')

  function add() {
    const n = name.trim()
    if (!n) return
    void addSkill(n, subject)
    setName('')
  }

  return (
    <section class="screen" data-testid="ladder">
      <header class="screen-head">
        <p class="eyebrow">{l.title}</p>
      </header>
      <p class="note">{l.intro}</p>

      {skills.length > 0 && (
        <div class="calc ladder-counts" data-testid="ladder-counts">
          {(['technical', 'language', 'craft'] as const).map((k) =>
            ladderCounts(skills, marks, k).map((n, i) => n > 0 && <p key={`${k}${i}`} class="calc-line">{fill(l.countLine, { n: String(n), rung: rungName(i, k) })}</p>),
          )}
        </div>
      )}

      <div class="card">
        {skills.length === 0 ? (
          <p class="note faint in-card">{l.noSkills}</p>
        ) : (
          <ul class="rows">
            {groupBySubject(skills).flatMap((g) => [
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
              ...g.skills.map((s) => {
              const rung = currentRung(marks, s.id as number)
              return (
                <li key={s.id} class="skill-row" data-testid="skill-row">
                  <span class="row-main">
                    {s.name}
                    <span class="sub">{rungName(rung, ladderOf(s))}</span>
                  </span>
                  <div class="skill-actions">
                    <button type="button" class="textbtn" data-testid="rung-up" disabled={rung >= TOP_RUNG} onClick={() => void moveSkill(s.id as number, 1)}>
                      {l.up}
                    </button>
                    <button type="button" class="textbtn" data-testid="rung-back" disabled={rung <= 0} onClick={() => void moveSkill(s.id as number, -1)}>
                      {l.back}
                    </button>
                    <button type="button" class="textbtn faint" onClick={() => void removeSkill(s.id as number)}>
                      {l.remove}
                    </button>
                  </div>
                </li>
              )
              }),
            ])}
          </ul>
        )}
      </div>

      {subjects.length === 0 && <p class="note faint">{l.noSubjects}</p>}
      {subjects.length > 0 && (
        <div class="days" role="group" aria-label={l.subjectPick}>
          {subjects.map((s) => (
            <button key={s} type="button" class={subject === s ? 'day is-on' : 'day'} aria-pressed={subject === s} data-testid="subject-chip" onClick={() => setPicked(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div class="add">
        <input
          class="input"
          type="text"
          maxLength={60}
          placeholder={l.skillPlaceholder}
          value={name}
          data-testid="skill-input"
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button type="button" class="pill-quiet" onClick={add} disabled={!name.trim()}>
          {l.add}
        </button>
      </div>
      {skills.length === 0 && <p class="note faint">{l.emptyStep}</p>}
      <p class="note faint">{l.subjectNote}</p>

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
export function AimsOnNow({ onChangeRep }: { onChangeRep?: (aimId: number) => void }) {
  const data = useAims()
  if (!data || !data.aims.some((a) => !(a.kind === 'path' && a.pausedAt))) return null
  const c = copy.aims
  return (
    <>
      <h2 class="section" data-testid="your-aims">
        {c.yourAims}
      </h2>
      <AimCards compact onChangeRep={onChangeRep ? (aim) => onChangeRep(aim.id as number) : undefined} />
    </>
  )
}
