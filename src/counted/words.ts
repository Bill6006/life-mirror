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

/** A standing as it is said inside a sentence: "a lead, not yet a pattern". */
const said = (standing: Standing): string => `${STANDING_WORDS[standing].charAt(0).toLowerCase()}${STANDING_WORDS[standing].slice(1)}`

/** A standing as one short line beside its numbers: its own words, and with a lead how many comparisons were looked at. */
export function standingLine(s: { standing: Standing; family: number }): string {
  return s.standing === 'lead' ? `${STANDING_WORDS.lead} · ${s.family} looked at` : STANDING_WORDS[s.standing]
}

/** A standing inside a sentence, in brackets after its number: "a lead, not yet a pattern; 31 looked at". */
export function standingInline(s: { standing: Standing; family: number }): string {
  return s.standing === 'lead' ? `${said('lead')}; ${s.family} looked at` : said(s.standing)
}

export interface BestWords {
  /** The condition, in the weekly view's own words: "a nap", "Saturday", "she was away". */
  thing: string
  /** How many of the best days the record can speak for carried it, and of the other days. */
  k: number
  n: number
  restK: number
  m: number
  standing: Standing
  direction: Direction
}

/**
 * Best days: how many conditions had enough days to be compared. Said once for a list, so every lead in it is read
 * against that number.
 */
export function bestFamilyWords(family: number): string {
  if (family === 0) return 'nothing has enough days to be compared yet (eight best days and eight others, with five occurrences)'
  return `${family} ${family === 1 ? 'thing has' : 'things have'} enough days to be compared, as one family, and a thing is said here only at a lead`
}

/** Best days: how often one thing was recorded on the best days, against the other days. Its list says how many were compared. */
export function bestWords(w: BestWords): string {
  const counts = `${w.k} of ${w.n} best days, ${w.restK} of ${w.m} others`
  const often = w.direction === 'lower' ? 'less often' : 'more often'
  switch (w.standing) {
    case 'tooFew':
    case 'noPattern':
      return `${w.thing}: ${counts} (${said(w.standing)})`
    case 'lead':
      return `${w.thing}: ${counts}, ${often} on the best days (${said('lead')})`
    case 'pattern':
      return `${w.thing}: ${counts}, ${often} on the best days (${said('pattern')})`
  }
}

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
  // After the standing's own words the sentence runs on, so "Mornings after" is said as "mornings after".
  const after = `${w.after.charAt(0).toLowerCase()}${w.after.slice(1)}`
  // Too few says where it would be read and the counts, and no difference: there is none to stand on yet.
  if (w.standing === 'tooFew' || w.diff === null) return `${STANDING_WORDS.tooFew}: ${after} ${w.thing}, ${counts}.`
  const size = `${Math.abs(Math.round(w.diff * 10) / 10)} ${w.unit}`
  const way = w.direction === 'none' ? 'the same' : `${size} ${w.direction}`
  const good = w.higherIsGood === undefined || w.direction === 'none' ? '' : (w.direction === 'higher') === w.higherIsGood ? ', the good direction' : ', not the good direction'
  const read = `${after} ${w.thing} read ${way}${good}${w.likeForLike ? ', like for like' : ''} (${counts})`
  switch (w.standing) {
    case 'noPattern':
      return `${STANDING_WORDS.noPattern}: ${read}.`
    case 'lead':
      return `${STANDING_WORDS.lead}: ${read}. ${looked(w.family)}.`
    case 'pattern':
      return `${STANDING_WORDS.pattern}: ${read}.`
  }
}
