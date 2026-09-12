import { useState } from 'preact/hooks'
import { AimCard } from './aimCard'
import { activeAims, addAim, addSkill, aimRecords, liveSkills, moveSkill, openAimOffers, removeAim, removeSkill, resumeAim, rungMarks, setAimStep } from './aimFlow'
import { AIM_KINDS, aimKey, BECOMING_KEYS, becoming, blockedBy, followThrough, stepChoices, stepFor, unblockFor, unblockKey, type Tally } from './aims'
import { blockAt } from './blocks'
import { families } from './catalogue'
import { NavRow } from './controls'
import { copy } from './copy'
import { allWins, db, getSettings, type Aim, type AimKind, type Offer } from './db'
import { fill, formatDayLong, formatDayShort } from './format'
import { whatBringsYouBack } from './associations'
import { hasMove, moveById } from './catalogue'
import { currentRung, ladderCounts, rungName, sittingOf, TOP_RUNG } from './ladder'
import { useLive } from './live'

// The Aims tab: the commitments you chose with their protected steps, and the doors to the
// proof ladder, follow-through and who you are becoming. Nothing here grades, ranks or streaks.

function useAims() {
  const aims = useLive(activeAims, [])
  const skills = useLive(liveSkills, [])
  const marks = useLive(rungMarks, [])
  const open = useLive(openAimOffers, [])
  const records = useLive(aimRecords, [])
  if (!aims || !skills || !marks || !open || !records) return null
  return { aims, skills, marks, open, records }
}

/** The cards of every commitment, with Resume and the unblock offer; shared by Now and the Aims tab. */
export function AimCards({ onRemove, onChangeStep }: { onRemove?: (aim: Aim) => void; onChangeStep?: (aim: Aim) => void }) {
  const data = useAims()
  if (!data || data.aims.length === 0) return null
  const { aims, skills, marks, open, records } = data
  return (
    <>
      {aims.map((aim) => {
        const step = stepFor(aim, skills, marks)
        const isOpen = open.some((o) => o.situationKey === aimKey(aim.kind) || o.situationKey === unblockKey(aim.kind))
        const blocked = blockedBy(aim, records.offers, records.outcomes, records.nights)
        const unblock = blocked ? unblockFor(blocked) : null
        return (
          <AimCard
            key={aim.id}
            aim={aim}
            step={step}
            open={isOpen}
            blocked={blocked}
            unblock={unblock}
            onResume={() => void resumeAim(aim, step, 'step')}
            onUnblock={() => unblock && void resumeAim(aim, sittingOf(unblock), 'unblock')}
            onRemove={onRemove ? () => onRemove(aim) : undefined}
            onChangeStep={onChangeStep && aim.kind !== 'certification' ? () => onChangeStep(aim) : undefined}
          />
        )
      })}
    </>
  )
}

export function AimsScreen({
  onAdd,
  onChangeStep,
  onLadder,
  onFollow,
  onBecoming,
  onHer,
}: {
  onAdd: () => void
  onChangeStep: (aimId: number) => void
  onLadder: () => void
  onFollow: () => void
  onBecoming: () => void
  onHer: () => void
}) {
  const today = blockAt(new Date())
  const aims = useLive(activeAims, [])
  if (!aims) return <section class="screen" />
  const c = copy.aims
  const missing = AIM_KINDS.filter((k) => !aims.some((a) => a.kind === k))

  return (
    <section class="screen">
      <header class="screen-head">
        <h1 class="eyebrow">{copy.tabs.aims}</h1>
        <p class="date">{formatDayLong(today.day)}</p>
      </header>

      <h2 class="section">{c.commitments}</h2>
      {aims.length === 0 && <p class="note">{c.none}</p>}
      <AimCards onRemove={(aim) => void removeAim(aim.id as number)} onChangeStep={(aim) => onChangeStep(aim.id as number)} />

      <div class="card">
        <ul class="rows">
          {missing.length > 0 && <NavRow label={c.add} note={c.addNote} onClick={onAdd} />}
          <NavRow label={c.ladder} note={c.ladderNote} onClick={onLadder} />
          <NavRow label={c.follow} note={c.followNote} onClick={onFollow} />
          <NavRow label={c.becoming} note={c.becomingNote} onClick={onBecoming} />
          <NavRow label={c.her} note={c.herNote} onClick={onHer} />
        </ul>
      </div>
      {missing.length === 0 && <p class="note faint">{c.allAdded}</p>}
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

/** Two taps deeper than Now: pick a kind, and for a person or a practice pick its step from the catalogue. Nothing to type. */
export function AddAimScreen({ onClose }: { onClose: () => void }) {
  const aims = useLive(activeAims, [])
  const [kind, setKind] = useState<AimKind | null>(null)
  if (!aims) return <section class="screen" />
  const c = copy.aims
  const missing = AIM_KINDS.filter((k) => !aims.some((a) => a.kind === k))

  function choose(k: AimKind) {
    if (k === 'certification') return void addAim(k, null).then(onClose)
    setKind(k)
  }

  return (
    <section class="screen" data-testid="add-aim">
      <header class="screen-head">
        <p class="eyebrow">{kind ? c.pickStep : c.add}</p>
      </header>
      {kind === null ? (
        <>
          <p class="note">{c.addNote}</p>
          <div class="card">
            {missing.length === 0 ? (
              <p class="note faint in-card">{c.allAdded}</p>
            ) : (
              <ul class="rows">
                {missing.map((k) => (
                  <li key={k}>
                    <button type="button" class="row" data-testid={`aim-kind-${k}`} onClick={() => choose(k)}>
                      <span class="row-main">
                        {c.kinds[k]}
                        <span class="sub">{c.kindNotes[k]}</span>
                      </span>
                      <span class="chev" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
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
  const [name, setName] = useState('')
  if (!skills || !marks) return <section class="screen" />
  const l = copy.ladder
  const counts = ladderCounts(skills, marks)

  function add() {
    const n = name.trim()
    if (!n) return
    void addSkill(n)
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
          {counts.map((n, i) => n > 0 && <p key={i} class="calc-line">{fill(l.countLine, { n: String(n), rung: l.rungs[i] })}</p>)}
        </div>
      )}

      <div class="card">
        {skills.length === 0 ? (
          <p class="note faint in-card">{l.noSkills}</p>
        ) : (
          <ul class="rows">
            {skills.map((s) => {
              const rung = currentRung(marks, s.id as number)
              return (
                <li key={s.id} class="skill-row" data-testid="skill-row">
                  <span class="row-main">
                    {s.name}
                    <span class="sub">{rungName(rung)}</span>
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
            })}
          </ul>
        )}
      </div>

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
 * On Now: every commitment's protected step above the move, and when tonight's move and a step
 * differ, both shown under their own headings with one line saying so. Never blended (Rule 8).
 */
export function AimsOnNow({ offer, showTonight }: { offer: Offer | null; showTonight: boolean }) {
  const data = useAims()
  if (!data || data.aims.length === 0) return null
  const { aims, skills, marks } = data
  const steps = aims.map((aim) => stepFor(aim, skills, marks))
  const same = offer !== null && steps.some((s) => s.id === offer.moveId)
  const c = copy.aims
  return (
    <>
      <h2 class="section" data-testid="your-aims">
        {c.yourAims}
      </h2>
      <AimCards />
      {showTonight && (
        <>
          <h2 class="section" data-testid="tonight">
            {c.tonight}
          </h2>
          <p class="note faint differ" data-testid="differ">
            {same ? c.same : c.differ}
          </p>
        </>
      )}
    </>
  )
}
