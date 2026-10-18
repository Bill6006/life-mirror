import type { RefObject } from 'preact'
import { useEffect } from 'preact/hooks'
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
  useEffect(() => {
    const root = ref.current
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
    return () => io.disconnect()
  }, [key, slot.day, slot.block, today])
}
