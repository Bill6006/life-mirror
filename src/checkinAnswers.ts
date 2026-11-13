import { chipAnswerWords, natureAnswerWords, sweetAnswerWords } from './associationWords'
import type { EvidenceStandings } from './brainFlow'
import type { ChipKey } from './chips'
import { copy } from './copy'

// The check-in's answers under the one standard (2026-11-12). A marked chip is answered from the sheet's own family
// (brainFlow.ts, evidenceWithStandings): the comparison's numbers and where it stands come from one computation, the
// one Evidence and the day's sheet read, so the three say one thing. Until the family is read no answer shows; where
// the comparisons failed on this phone the answer says so, and never "too few".

/** What the check-in has read of the comparisons: null or undefined until it has. */
type Read = EvidenceStandings | null | undefined

/** A marked evening chip's answer: the morning after, or for time in nature the evening of the day and then the morning after. */
export function chipAnswerFrom(read: Read, key: ChipKey): string | null {
  if (!read) return null
  if (!read.family) return copy.extras.chipFailed
  return key === 'nature' ? natureAnswerWords(read.family.nature, read.family.stood) : chipAnswerWords(read.family.night[key], read.family.stood)
}

/** One of your own chips' answer, where it stands among your own chips: a family of their own, every chip not removed, as on Evidence. */
export function ownChipAnswerFrom(read: Read, id: string): string | null {
  if (!read) return null
  if (!read.own) return copy.extras.chipFailed
  // A chip added a moment ago is answered at the next read.
  const a = read.own.answers.get(id)
  return a ? chipAnswerWords(a, read.own.stood) : null
}

/** The afternoon's something sweet: the evenings after afternoons that carried it. */
export function sweetAnswerFrom(read: Read): string | null {
  if (!read) return null
  if (!read.family) return copy.extras.chipFailed
  return sweetAnswerWords(read.family.sweetAfternoon, read.family.stood)
}
