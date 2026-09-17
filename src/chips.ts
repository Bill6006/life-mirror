import { associationFor, morningAssociation, type Association } from './associations'
import type { CheckIn } from './db'

// The two evening chips are answered at once from your own record, like for like: how many
// evenings before carried the chip, and what the morning after read against the mornings after
// evenings that started the same. A calculation, shown in its register; "first time recorded"
// until there is one. Association, never cause.

export type ChipKey = 'nothingLanded' | 'hardToSeePoint' | 'coolingOff' | 'bigSocial' | 'napped'

export type ChipAnswer = Association

export function chipAnswer(all: readonly CheckIn[], key: ChipKey, today: string): ChipAnswer {
  return associationFor(all, today, (c) => Boolean(c.extras?.[key]))
}

/** The morning's chip, answered the same way: the afternoons after mornings that carried it. */
export function morningChipAnswer(all: readonly CheckIn[], today: string): ChipAnswer {
  return morningAssociation(all, today, (c) => Boolean(c.extras?.heavyCaffeine))
}
