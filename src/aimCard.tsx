import type { BlockReason } from './aims'
import type { Move } from './catalogue'
import { copy } from './copy'
import type { Aim } from './db'
import { fill } from './format'
import type { Sitting } from './ladder'

/**
 * A commitment's protected next step: one line sized to one sitting, held above the move on
 * Now where the state ranking cannot displace it. Resume is one tap. When the last step ended
 * in No or Not now, the offer under it removes the obstacle; it never shrinks the aim.
 */
export function AimCard({
  aim,
  step,
  open,
  blocked,
  unblock,
  onResume,
  onUnblock,
  onRemove,
  onChangeStep,
}: {
  aim: Aim
  step: Sitting
  open: boolean
  blocked: BlockReason | null
  unblock: Move | null
  onResume: () => void
  onUnblock: () => void
  onRemove?: () => void
  onChangeStep?: () => void
}) {
  const c = copy.aims
  return (
    <div class="card pad move-card aim-card" data-testid="aim-card" data-kind={aim.kind}>
      <p class="eyebrow small">{c.kinds[aim.kind]}</p>
      <h2 class="move-title" data-testid="aim-step">
        {step.name}
      </h2>
      <p class="move-what">{step.what}</p>
      <p class="move-meta">{fill(c.sized, { n: String(step.minutes) })}</p>

      {open ? (
        <p class="move-state" data-testid="aim-started">
          {c.started}
        </p>
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
