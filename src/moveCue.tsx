import { useEffect, useRef, useState } from 'preact/hooks'
import { copy } from './copy'
import { fill } from './format'
import { DWELL_MS, loadSeen, movesBelow, overlapsAny, saveSeen, SEEN_SHARE, visibleShare, type CardBox } from './moveCueLogic'

// Final UI polish (2026-09-26): a small cue above the tab bar while a move on Now is still lower
// down and unseen. It moves nothing on the screen and sends nothing: a tap scrolls to the first such
// move. A move is seen once half its card has been on the screen for a moment, or once jumped to, and
// a move seen is never cued again, across a refresh or a relaunch. Only live moves count: a card that
// waits for the next check-in, or one already answered, is not a move to do now.

/** The live move cards on Now, in page order: the full cards, which alone carry a key. */
function liveCards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('section.screen.now [data-move-key]')]
}

/** The Brain card's words and taps, which the cue must never sit on. */
function brainWords(): DOMRect[] {
  return [...document.querySelectorAll('section.screen.now [data-testid="brief"] :is(p, h2, button, a, li)')].map((e) => e.getBoundingClientRect())
}

export function MoveCue() {
  const [below, setBelow] = useState<string[]>([])
  // Held (drawn but not shown) until a check has found the cue clear of the Brain's words.
  const [held, setHeld] = useState(true)
  const seen = useRef<Set<string>>(loadSeen())
  const since = useRef(new Map<string, number>())
  const cue = useRef<HTMLButtonElement>(null)
  const schedule = useRef<() => void>(() => {})

  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      const bar = document.querySelector('nav.tabs .tabs-inner')
      const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight
      const boxes: CardBox[] = liveCards().map((el) => {
        const r = el.getBoundingClientRect()
        return { key: el.dataset.moveKey as string, top: r.top, bottom: r.bottom }
      })
      // A duration, so the monotonic clock: the wall clock can be changed or held still.
      const now = performance.now()
      let changed = false
      for (const b of boxes) {
        if (seen.current.has(b.key)) continue
        if (visibleShare(b.top, b.bottom, barTop) >= SEEN_SHARE) {
          const first = since.current.get(b.key)
          if (first === undefined) since.current.set(b.key, now)
          else if (now - first >= DWELL_MS) {
            seen.current.add(b.key)
            changed = true
          }
        } else since.current.delete(b.key)
      }
      if (changed) saveSeen(seen.current)
      const next = movesBelow(boxes, barTop, seen.current)
      setBelow((prev) => (prev.join('|') === next.join('|') ? prev : next))
      const c = cue.current
      setHeld(next.length === 0 || !c || overlapsAny(c.getBoundingClientRect(), brainWords()))
    }
    const run = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    schedule.current = run
    const tick = setInterval(run, 200)
    window.addEventListener('scroll', run, { passive: true })
    window.addEventListener('resize', run)
    const mo = new MutationObserver(run)
    const main = document.getElementById('main')
    if (main) mo.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-move-key', 'data-waiting'] })
    run()
    return () => {
      clearInterval(tick)
      window.removeEventListener('scroll', run)
      window.removeEventListener('resize', run)
      mo.disconnect()
      if (frame) cancelAnimationFrame(frame)
      document.getElementById('main')?.classList.remove('has-move-cue')
    }
  }, [])

  const shown = below.length > 0 && !held
  // While the cue shows, the end of Now can scroll clear of it.
  useEffect(() => {
    document.getElementById('main')?.classList.toggle('has-move-cue', shown)
  }, [shown])

  if (below.length === 0) return null
  const jump = () => {
    const key = below[0]
    const el = liveCards().find((e) => e.dataset.moveKey === key)
    if (!el) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - 16), behavior: still ? 'auto' : 'smooth' })
    seen.current.add(key)
    saveSeen(seen.current)
    schedule.current()
  }
  return (
    <button type="button" ref={cue} class={shown ? 'move-cue' : 'move-cue is-held'} data-testid="move-cue" aria-hidden={shown ? undefined : 'true'} tabIndex={shown ? 0 : -1} onClick={jump}>
      <span class="move-cue-pill">
        <span class="move-cue-arrow" aria-hidden="true">
          ↓
        </span>
        {below.length === 1 ? copy.now.cueOne : fill(copy.now.cueMany, { n: String(below.length) })}
      </span>
    </button>
  )
}
