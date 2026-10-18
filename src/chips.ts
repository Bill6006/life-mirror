import { associationFor, type Association } from './associations'
import type { CheckIn } from './db'

// The two evening chips are answered at once from your own record, like for like: how many
// evenings before carried the chip, and what the morning after read against the mornings after
// evenings that started the same. A calculation, shown in its register; "first time recorded"
// until there is one. Association, never cause.

export type ChipKey = 'nothingLanded' | 'hardToSeePoint' | 'coolingOff' | 'bigSocial' | 'napped' | 'outside' | 'sweet'

export type ChipAnswer = Association

/** The chips added from stage 3, item 5: each counted and compared only at the check-ins that showed it. */
export const SHOWN_CHIPS: readonly string[] = ['outside', 'sweet', 'caffeineLast', 'amongPeople']

/**
 * Whether a chip was on screen at a check-in (Rule 2): tapped means shown, and the shown mark says the rest. A chip
 * from before stage 3, item 5, is read as it always was, shown at every check-in that asks it.
 */
export function chipShownAt(key: string, c: CheckIn): boolean {
  if (!SHOWN_CHIPS.includes(key)) return true
  const ex = c.extras
  return Boolean(ex?.chipsShown?.[key] || (key === 'outside' && ex?.outside) || (key === 'sweet' && ex?.sweet) || (key === 'caffeineLast' && ex?.caffeineIntake?.last))
}

export function chipAnswer(all: readonly CheckIn[], key: ChipKey, today: string): ChipAnswer {
  return associationFor(all, today, (c) => Boolean(c.extras?.[key]), (c) => chipShownAt(key, c))
}
