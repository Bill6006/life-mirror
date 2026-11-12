import type { ComponentChildren } from 'preact'
import { useErrorBoundary } from 'preact/hooks'
import { copy } from './copy'
import { screenFailed } from './screenFaults'

/**
 * Around the open screen (2026-11-12): a screen that throws while it is drawn shows a plain line and a way to try
 * again, never a blank, and the rest of the app keeps working. The fault is kept for the Worker's report by its name
 * alone. A screen opened over the tabs is given a way back as well, since it has no tab bar to leave by.
 */
export function ScreenGuard({ screen, onLeave, children }: { screen: string; onLeave?: () => void; children: ComponentChildren }) {
  const [error, again] = useErrorBoundary((e) => screenFailed(screen, e))
  if (!error) return <>{children}</>
  return (
    <section class="screen" data-testid="screen-fault">
      <p class="note" role="alert">
        {copy.fault.line}
      </p>
      <div class="actions">
        <button type="button" class="pill-quiet" data-testid="screen-fault-again" onClick={again}>
          {copy.fault.again}
        </button>
        {onLeave && (
          <button type="button" class="pill-quiet" data-testid="screen-fault-leave" onClick={onLeave}>
            {copy.fault.leave}
          </button>
        )}
      </div>
    </section>
  )
}
