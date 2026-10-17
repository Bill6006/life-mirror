import { BLOCKS, type Block } from './blocks'
import type { CheckIn } from './db'
import { bandOf, readingOf, type Band } from './score'

// Your words (stage 3, group 4): the lines typed at a check-in, newest first, each beside that
// check-in's reading out of 100 and its band. Only what was typed and what was answered: nothing is
// summarised, scored or inferred from the words.

export interface WordsRow {
  day: string
  block: Block
  note: string
  /** The check-in's reading out of 100, when its readings give one. */
  value: number | null
  band: Band | null
}

/** How many a screen shows before "Show earlier". */
export const WORDS_SHOWN = 60

export function yourWords(checkins: readonly CheckIn[]): WordsRow[] {
  return checkins
    .filter((c) => typeof c.extras?.note === 'string' && c.extras.note.trim() !== '')
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : BLOCKS.indexOf(b.block) - BLOCKS.indexOf(a.block)))
    .map((c) => {
      const r = readingOf(c)
      return { day: c.day, block: c.block, note: (c.extras?.note as string).trim(), value: r ? r.value : null, band: r ? bandOf(r.value) : null }
    })
}
