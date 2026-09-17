import { useEffect, useState } from 'preact/hooks'
import type { BlockReason } from './aims'
import type { Move } from './catalogue'
import { copy } from './copy'
import type { Aim, Offer } from './db'
import { fill } from './format'
import type { Sitting } from './ladder'
import { doneOpen, recordDoneNow } from './offerFlow'

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
  onResume,
  onUnblock,
  onRemove,
  onChangeStep,
  skillCount,
  onAddSkill,
  onName,
}: {
  aim: Aim
  step: Sitting
  open: boolean
  /** The open offer behind a started step, for the Done tap once its minutes have passed and while its block is on. */
  openOffer: Offer | null
  blocked: BlockReason | null
  unblock: Move | null
  onResume: () => void
  onUnblock: () => void
  onRemove?: () => void
  onChangeStep?: () => void
  /** A study commitment: how many skills it climbs. */
  skillCount?: number
  /** A study commitment: a skill typed here goes under its name. */
  onAddSkill?: (name: string) => void
  /** A study commitment made before names existed: the one word it is waiting for. */
  onName?: (name: string) => void
}) {
  const c = copy.aims
  const [skill, setSkill] = useState('')
  const [name, setName] = useState('')
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
  const canDone = openOffer !== null && doneOpen(openOffer)
  return (
    <div class="card pad move-card aim-card" data-testid="aim-card" data-kind={aim.kind}>
      <p class="eyebrow small">{aim.name ?? step.subject ?? c.kinds[aim.kind]}</p>
      <h2 class="move-title" data-testid="aim-step">
        {step.title}
      </h2>
      <p class="move-what">{step.what}</p>
      <p class="move-meta">{fill(c.sized, { n: String(step.minutes) })}</p>
      {skillCount !== undefined && <p class="move-meta">{skillCount ? fill(c.skillsOn, { n: String(skillCount) }) : c.noSkillsYet}</p>}

      {open ? (
        <>
          <p class="move-state" data-testid="aim-started">
            {c.started}
          </p>
          {canDone && openOffer && (
            <div class="actions">
              <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(openOffer)}>
                {copy.move.done}
              </button>
            </div>
          )}
        </>
      ) : (
        <div class="actions">
          <button type="button" class="pill-quiet" data-testid="aim-resume" onClick={onResume}>
            {c.resume}
          </button>
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
        <div class="add">
          <input class="input" type="text" maxLength={40} placeholder={c.namePlaceholder} value={name} data-testid="aim-name-it" onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
          <button type="button" class="pill-quiet" data-testid="aim-name-it-add" disabled={!name.trim()} onClick={() => onName(name)}>
            {c.nameIt}
          </button>
        </div>
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
 * The same commitment on Now, as one row: its subject or kind, the step, its minutes, and one
 * tap. Several fit without a scroll; Change the step and Remove live on Aims.
 */
export function AimRow({ aim, step, open, openOffer, blocked, unblock, onResume, onUnblock }: { aim: Aim; step: Sitting; open: boolean; openOffer: Offer | null; blocked: BlockReason | null; unblock: Move | null; onResume: () => void; onUnblock: () => void }) {
  const c = copy.aims
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])
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
          {blocked && unblock && !open && ` · ${fill(c.blockedShort, { why: c.blockedWhy[blocked], unblock: unblock.name })}`}
        </span>
      </span>
      <span class="row-side aim-row-side">
        {open ? (
          <>
            <span data-testid="aim-started">{c.startedShort}</span>
            {canDone && openOffer && (
              <button type="button" class="textbtn ink" data-testid="aim-done" onClick={() => void recordDoneNow(openOffer)}>
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
    </li>
  )
}
