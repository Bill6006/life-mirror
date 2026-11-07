import type { RefObject } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { blockAt, type Slot } from './blocks'
import { markChipsShown } from './db'

/**
 * Shown means seen (stage 3, item 5, as the Caffeine item is marked): each chip added from item 5 is marked on screen at
 * this check-in once its row, marked data-chip with its id, is half in view, and only on the check-in's own day. A chip
 * shown and left is known; one never shown enters no comparison and no count of check-ins without a tap (Rule 2).
 * fresh: the chips on screen not yet marked at this check-in.
 */
export function useChipsSeen(ref: RefObject<HTMLElement>, slot: Slot, fresh: readonly string[]): void {
  const today = blockAt(new Date()).day
  const key = fresh.join(',')
  const sig = `${key}|${slot.day}|${slot.block}|${today}`
  const watching = useRef<{ sig: string; root: HTMLElement | null; io: IntersectionObserver | null }>({ sig: '', root: null, io: null })
  // After every render: a screen can draw the chips' container only after the record that names them, so the observer is
  // armed whenever the container or the chips to watch change, never only once (2026-11-07: an evening whose last reads
  // arrived after its record had no chip marked at all).
  useEffect(() => {
    const root = ref.current
    const w = watching.current
    if (w.sig === sig && w.root === root) return
    w.io?.disconnect()
    watching.current = { sig, root, io: null }
    if (!key || slot.day !== today || !root || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting)
        if (!seen.length) return
        for (const e of seen) io.unobserve(e.target)
        void markChipsShown(slot, seen.map((e) => (e.target as HTMLElement).dataset.chip as string))
      },
      { threshold: 0.5 },
    )
    for (const id of fresh) {
      const el = root.querySelector(`[data-chip="${id}"]`)
      if (el) io.observe(el)
    }
    watching.current.io = io
  })
  useEffect(() => () => watching.current.io?.disconnect(), [])
}
