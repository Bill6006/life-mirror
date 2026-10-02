import { useEffect, useRef, useState } from 'preact/hooks'
import { copy } from './copy'
import { fill } from './format'
import { DWELL_MS, fitAt, loadSeen, movesBelow, placeCue, saveSeen, SEEN_SHARE, visibleShare, type CardBox, type Guarded, type Placement } from './moveCueLogic'

// Final UI polish (2026-09-26): a small cue above the tab bar while a move on Now is still lower
// down and unseen. It moves nothing on the screen and sends nothing: a tap scrolls to the first such
// move. A move is seen once half its card has been on the screen for a moment, or once jumped to, and
// a move seen is never cued again, across a refresh or a relaunch. Only live moves count: a card that
// waits for the next check-in, or one already answered, is not a move to do now.
//
// Where it floats (2026-10-02): on Now's first screen too, with no scroll first. It stays in its own
// place when that covers nothing, and otherwise takes the nearest place that covers none of the
// Brain's words and lets every control keep its taps (placeCue). It never moves mid-scroll: a place
// covered by the scroll hides it until the scroll settles, and then it takes its place again.

/** The live move cards on Now, in page order: the full cards, which alone carry a key. */
function liveCards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('section.screen.now [data-move-key]')]
}

const CONTROLS = 'button, a[href], input, select, textarea, [role="button"], summary, [tabindex]:not([tabindex="-1"])'

/** What lies on Now, in page coordinates: each line of words (the Brain's apart) and each control. Now scrolls as one piece, so a scroll moves them all alike. */
function guarded(): Guarded[] {
  const now = document.querySelector('section.screen.now')
  if (!now) return []
  const brief = now.querySelector('[data-testid="brief"]')
  const vh = window.innerHeight
  const y = window.scrollY
  const out: Guarded[] = []
  const range = document.createRange()
  const walker = document.createTreeWalker(now, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement
    if (!parent || !n.textContent?.trim()) continue
    const p = parent.getBoundingClientRect()
    if (p.width === 0) continue
    range.selectNodeContents(n)
    const kind = brief?.contains(parent) ? 'brain' : 'words'
    for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) out.push({ left: r.left, top: r.top + y, right: r.right, bottom: r.bottom + y, kind })
  }
  for (const el of now.querySelectorAll<HTMLElement>(CONTROLS)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) out.push({ left: r.left, top: r.top + y, right: r.right, bottom: r.bottom + y, kind: 'control' })
  }
  return out.filter((b) => b.bottom - y > -vh && b.top - y < 2 * vh)
}

/** A scroll is settled once nothing has moved for this long. */
const SETTLE_MS = 160
const GUTTER = 16
/** The tap area's height in its own place, as the stylesheet sets it. */
const TAP = 48

export function MoveCue() {
  const [below, setBelow] = useState<string[]>([])
  // Held (drawn but not shown) until a place is found for it that covers nothing it must not.
  const [held, setHeld] = useState(true)
  // Where it floats, and how far its button lifts to put the pill there: h 0 is its own height.
  const [place, setPlace] = useState<{ dx: number; lift: number; h: number }>({ dx: 0, lift: 0, h: 0 })
  const seen = useRef<Set<string>>(loadSeen())
  const since = useRef(new Map<string, number>())
  const cue = useRef<HTMLButtonElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const at = useRef<Placement | null>(null)
  const schedule = useRef<() => void>(() => {})

  useEffect(() => {
    let frame = 0
    let scrolledAt = -Infinity
    // What lies on Now, read again only once something in it changes; a scroll only moves it.
    let page: Guarded[] | null = null
    let read = 0
    // Where Now's blocks stand on the page: a font that finishes loading, or a style that lands, moves them with
    // nothing in the page changed, so each check compares, and a block moved or resized means reading again.
    let layout = ''
    // When Now last moved: a cue that needs a new place waits until Now has held still this long.
    let layoutAt = -Infinity
    // What the last search was for: the same screen at the same scroll needs no second one.
    let searched = ''
    let last: Placement | null = null
    const check = () => {
      frame = 0
      const bar = document.querySelector('nav.tabs .tabs-inner')
      const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight
      const cards: CardBox[] = liveCards().map((el) => {
        const r = el.getBoundingClientRect()
        return { key: el.dataset.moveKey as string, top: r.top, bottom: r.bottom }
      })
      // A duration, so the monotonic clock: the wall clock can be changed or held still.
      const now = performance.now()
      let changed = false
      for (const b of cards) {
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
      const next = movesBelow(cards, barTop, seen.current)
      setBelow((prev) => (prev.join('|') === next.join('|') ? prev : next))
      const c = cue.current
      const p = pill.current
      if (next.length === 0 || !c || !p || !c.offsetParent) {
        setHeld(true)
        return
      }
      const now0 = document.querySelector('section.screen.now')
      const sy = window.scrollY
      const shape = now0 ? [now0, ...now0.children].map((el) => {
        const r = el.getBoundingClientRect()
        return `${Math.round(r.top + sy)}:${Math.round(r.height)}`
      }).join('|') : ''
      if (shape !== layout) {
        layout = shape
        layoutAt = now
        page = null
      }
      if (!page) {
        page = guarded()
        read++
      }
      const y = window.scrollY
      const boxes = page.map((b) => ({ ...b, top: b.top - y, bottom: b.bottom - y }))
      // Its own place, before any move: centred above the tab bar, its foot where the stylesheet anchors it.
      const host = c.offsetParent.getBoundingClientRect()
      const tall = Math.max(TAP, p.offsetHeight)
      const left = host.left + c.offsetLeft - c.offsetWidth / 2
      const foot = host.top + c.offsetTop + c.offsetHeight
      const button = { left, top: foot - tall, right: left + c.offsetWidth, bottom: foot }
      const pl = left + (c.offsetWidth - p.offsetWidth) / 2
      const pt = foot - (tall + p.offsetHeight) / 2
      const own = { left: pl, top: pt, right: pl + p.offsetWidth, bottom: pt + p.offsetHeight }
      const options = { vw: document.documentElement.clientWidth, top: 8, gutter: GUTTER, button, pill: own, boxes }
      // Mid-scroll its pill never moves: its tap area fits itself to what passes under it, and the cue hides only while
      // even its pill would meet what it must not.
      if (now - scrolledAt < SETTLE_MS) {
        const cur = at.current
        const fit = cur ? fitAt(options, cur.dx, cur.dy, false) : null
        if (fit && cur && fit.h !== cur.h) {
          at.current = fit
          setPlace({ dx: fit.dx, lift: fit.dy + (tall - fit.h) / 2, h: fit.h === tall ? 0 : fit.h })
        }
        setHeld(!fit)
        return
      }
      const key = `${read}|${y}|${Math.round(button.left)},${Math.round(button.top)}|${options.vw}`
      if (key !== searched) {
        searched = key
        last = placeCue(options)
      }
      const found = last
      const same = found !== null && at.current !== null && found.dx === at.current.dx && found.dy === at.current.dy && found.h === at.current.h
      if (found && !same) {
        // The button keeps its foot where it is anchored, so a shorter one lifts by half the difference to keep the pill in its place.
        setPlace({ dx: found.dx, lift: found.dy + (tall - found.h) / 2, h: found.h === tall ? 0 : found.h })
      }
      at.current = found
      // While Now is still moving (a screen still drawing, a font arriving), a cue already where it belongs stays,
      // and one that needs a new place waits for Now to hold still, so it is never seen anywhere it should not be.
      setHeld(found === null || (now - layoutAt < SETTLE_MS && !same))
    }
    const run = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    const moved = () => {
      page = null
      run()
    }
    const scrolled = () => {
      scrolledAt = performance.now()
      run()
    }
    schedule.current = run
    const tick = setInterval(run, 200)
    window.addEventListener('scroll', scrolled, { passive: true })
    window.addEventListener('resize', moved)
    // A block that changes size, or a font that arrives, is looked at at once; the check's own comparison catches the rest.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(moved)
    const watch = () => {
      ro?.disconnect()
      const screen = document.querySelector('section.screen.now')
      if (ro && screen) for (const el of [screen, ...screen.children]) ro.observe(el, { box: 'border-box' })
    }
    const mo = new MutationObserver(() => {
      watch()
      moved()
    })
    const main = document.getElementById('main')
    if (main) mo.observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-move-key', 'data-waiting'] })
    watch()
    document.fonts?.addEventListener?.('loadingdone', moved)
    run()
    return () => {
      clearInterval(tick)
      window.removeEventListener('scroll', scrolled)
      window.removeEventListener('resize', moved)
      mo.disconnect()
      ro?.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', moved)
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
    <button
      type="button"
      ref={cue}
      class={shown ? 'move-cue' : 'move-cue is-held'}
      style={{ '--cue-dx': `${place.dx}px`, '--cue-dy': `${place.lift}px`, ...(place.h ? { '--cue-h': `${place.h}px` } : {}) }}
      data-testid="move-cue"
      aria-hidden={shown ? undefined : 'true'}
      tabIndex={shown ? 0 : -1}
      onClick={jump}
    >
      <span class="move-cue-pill" ref={pill}>
        <span class="move-cue-arrow" aria-hidden="true">
          ↓
        </span>
        {below.length === 1 ? copy.now.cueOne : fill(copy.now.cueMany, { n: String(below.length) })}
      </span>
    </button>
  )
}
