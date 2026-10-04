import { hasMove } from './catalogue'

// The moves that need the house (agreed for after the clean window, the owner's word, 2026-10-04:
// "open the windows, and any other that needs the house"). Kept apart from the catalogue on
// purpose: the Worker reads the catalogue from the repository as it stands, so a tag written into
// it would reach the monitored prompts the moment it was pushed. Only the phone reads this list, and
// only while HOME_ONLY is open. A move is here when doing it takes your own home: its windows, its
// surfaces, its washing, or a one-time setup of its rooms. One that a trip can also hold (a shower,
// a meal, a book, a game) is not.

export const HOME_ONLY_MOVES: ReadonlySet<string> = new Set([
  // Every window, fresh air through the place.
  'open-windows',
  // The table or the kitchen counter, to bare.
  'one-surface',
  // Washed, dried and put away today.
  'one-load-done',
  // One-time setups of the home itself.
  'shower-speaker',
  'toothbrush-where-you-are',
  'shoes-by-the-door',
  'no-cook-dinners',
])

/** Whether doing a move takes your own home. */
export function needsHome(moveId: string): boolean {
  return HOME_ONLY_MOVES.has(moveId) && hasMove(moveId)
}
