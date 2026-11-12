import { associationFor, type Association } from './associations'
import { standings, type Stood, WORTH_POINTS } from './counted/compare'
import { CHIP_STRETCH } from './audit'
import { compareSlots } from './blocks'
import type { CheckIn } from './db'
import type { OwnChip } from './settings'

// Your own chips (stage 3, item 5): up to three short labels you typed, each asked as one tap at the evening check-in
// beside the others, compared like them, and stopping after going unused like them. A label is your own words: it lives
// in the settings record, the check-ins keep only its id, and nothing here writes it to the day's sheet, so no model
// reads it until a later Worker deploy files it with your check-in notes.

/** The key a chip's shown mark is kept under on a check-in: apart from the built-in chips' ids. */
export const ownShownKey = (id: string) => `own:${id}`

/** Whether one of your chips was on screen at a check-in (Rule 2): tapped means shown, and the shown mark says the rest. */
export function ownShownAt(id: string, c: CheckIn): boolean {
  return Boolean(c.extras?.chipsShown?.[ownShownKey(id)] || c.extras?.own?.[id])
}

/**
 * Your own chips' answers with where each stands among them (the one standard, 2026-11-12). They are a family of their
 * own: a label is your own words and never reaches the day's sheet, so its comparison never joins the sheet's family,
 * and each chip pays for the others.
 */
export function ownChipStandings(all: readonly CheckIn[], chips: readonly { id: string }[], today: string): { answers: Map<string, Association>; stood: Map<string, Stood> } {
  const answers = new Map(chips.map((ch) => [ch.id, ownChipAnswer(all, ch.id, today, WORTH_POINTS)]))
  const stood = new Map(standings([...answers.values()].flatMap((a) => (a.compared ? [a.compared] : []))).map((s) => [s.id, s]))
  return { answers, stood }
}

export interface OwnChipState {
  id: string
  /** The evenings that showed it, since it began or was brought back. */
  evenings: number
  lastTap: string | null
  retired: boolean
  broughtBack: string | null
}

/** Each of your chips' state: untapped across thirty evenings that showed it, it has stopped appearing until brought back. */
export function ownChipStates(checkins: readonly CheckIn[], chips: readonly OwnChip[], chipsBack: Readonly<Record<string, string>>, today: string): OwnChipState[] {
  const evenings = checkins.filter((c) => c.block === 'evening' && c.day <= today).sort(compareSlots)
  return chips.map((chip) => {
    const broughtBack = chipsBack[ownShownKey(chip.id)] ?? null
    const since = evenings.filter((c) => ownShownAt(chip.id, c) && (!broughtBack || c.day >= broughtBack))
    const taps = since.filter((c) => c.extras?.own?.[chip.id])
    const lastTap = taps.length ? taps[taps.length - 1].day : null
    const untapped = lastTap ? since.filter((c) => c.day > lastTap).length : since.length
    return { id: chip.id, evenings: since.length, lastTap, retired: untapped >= CHIP_STRETCH, broughtBack }
  })
}

export function ownChipRetired(id: string, states: readonly OwnChipState[]): boolean {
  return states.find((s) => s.id === id)?.retired ?? false
}

/** One of your chips answered from your own record, like for like, as the built-in chips are: only the evenings that showed it. */
export function ownChipAnswer(all: readonly CheckIn[], id: string, today: string, worth?: number): Association {
  // Named, with the size worth saying, where its standing is wanted (Evidence, since 2026-11-12): `own.<id>`, in your own chips' family.
  return associationFor(all, today, (c) => Boolean(c.extras?.own?.[id]), (c) => ownShownAt(id, c), worth === undefined ? undefined : { id: `own.${id}`, worth })
}
