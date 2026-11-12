import type { Direction, Standing } from './compare'

// The words for a standing (the counted foundation, 2026-11-12; in shadow: nothing reads it yet). One place, so the
// sheet, Evidence, the weekly view and the lookups can never say the same standing two ways. Every sentence here says
// what went with what and how often, with its counts, and never why: no sentence for any standing may match the
// checker's causal lists, and a test holds them to that.

/** The four standings, as they are said. */
export const STANDING_WORDS: Readonly<Record<Standing, string>> = {
  tooFew: 'Too few to compare yet',
  noPattern: 'No clear pattern yet',
  lead: 'A lead, not yet a pattern',
  pattern: 'A steady pattern',
}

/** How many comparisons were looked at to say one thing: said with every lead. */
const looked = (family: number): string => `${family} ${family === 1 ? 'comparison was' : 'comparisons were'} looked at`

export interface WhenWords {
  /** The thing, as a noun phrase: "a short night", "something sweet". */
  thing: string
  /** The cell, as it reads after the thing: "on Saturdays", "in the evening", "after a short night". */
  where: string
  /** The rest, the same way: "on other days", "at the other check-ins". */
  elsewhere: string
  k: number
  n: number
  restK: number
  m: number
  standing: Standing
  direction: Direction
  family: number
}

/** "When is it most likely": one cell against the rest, as k of n. */
export function whenWords(w: WhenWords): string {
  const counts = `${w.k} of ${w.n} ${w.where}, against ${w.restK} of ${w.m} ${w.elsewhere}`
  const often = w.direction === 'lower' ? 'less often' : 'more often'
  switch (w.standing) {
    case 'tooFew':
      return `${STANDING_WORDS.tooFew}: ${w.thing}, ${counts}.`
    case 'noPattern':
      return `${STANDING_WORDS.noPattern}: ${w.thing}, ${counts}.`
    case 'lead':
      return `${STANDING_WORDS.lead}: ${w.thing} was recorded ${often} ${w.where} (${counts}). ${looked(w.family)}.`
    case 'pattern':
      return `${STANDING_WORDS.pattern}: ${w.thing} was recorded ${often} ${w.where} (${counts}).`
  }
}

export interface WithWords {
  thing: string
  /** What was read, and where: "Mornings after", "Evenings of". */
  after: string
  /** The scale's unit, plural: "points", "steps". */
  unit: string
  /** Occasions with the thing and without it. */
  n: number
  m: number
  /** With less without, on the scale; null when nothing could be compared. */
  diff: number | null
  /** Whether the occasions were matched on how they started. */
  likeForLike: boolean
  standing: Standing
  direction: Direction
  /** Whether higher is the good direction for what was read; undefined when the scale has none. */
  higherIsGood?: boolean
  family: number
}

/** "With against without": what was read after occasions with the thing, against occasions without it. */
export function withWords(w: WithWords): string {
  const counts = `${w.n} with it, ${w.m} without`
  if (w.standing === 'tooFew' || w.diff === null) return `${STANDING_WORDS.tooFew}: ${w.thing}, ${counts}.`
  const size = `${Math.abs(Math.round(w.diff * 10) / 10)} ${w.unit}`
  const way = w.direction === 'none' ? 'the same' : `${size} ${w.direction}`
  const good = w.higherIsGood === undefined || w.direction === 'none' ? '' : (w.direction === 'higher') === w.higherIsGood ? ', the good direction' : ', not the good direction'
  const read = `${w.after} ${w.thing} read ${way}${good}${w.likeForLike ? ', like for like' : ''} (${counts})`
  switch (w.standing) {
    case 'noPattern':
      return `${STANDING_WORDS.noPattern}: ${read}.`
    case 'lead':
      return `${STANDING_WORDS.lead}: ${read}. ${looked(w.family)}.`
    case 'pattern':
      return `${STANDING_WORDS.pattern}: ${read}.`
  }
}
