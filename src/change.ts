import { daysBetween, parseDay, type Block, type Slot } from './blocks'
import { copy } from './copy'
import { fill } from './format'
import { blockReadings, readingById, type Answers } from './readings'

// The first give-back: what changed since the last completed check-in, in words. This is a
// calculation, and the screen shows it in the calculation register.

export interface ChangeSummary {
  /** "this morning", "yesterday evening", "Tuesday evening"; null when there is no earlier check-in. */
  since: string | null
  lines: string[]
}

export function whenLabel(previous: Slot, today: Slot): string {
  const diff = daysBetween(previous.day, today.day)
  const block = copy.blocks[previous.block].toLowerCase()
  if (diff === 0) return fill(copy.since.sameDay, { block })
  if (diff === 1) return fill(copy.since.yesterday, { block })
  const d = parseDay(previous.day)
  if (diff < 7) return fill(copy.since.weekday, { weekday: d.toLocaleDateString(undefined, { weekday: 'long' }), block })
  return fill(copy.since.date, { date: d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }), block })
}

export function changesInWords(
  current: Answers,
  block: Block,
  previous: (Slot & { answers: Answers }) | null,
  today: Slot,
): ChangeSummary {
  if (!previous) return { since: null, lines: [copy.since.first] }

  const shared = blockReadings(block).filter((id) => current[id] !== undefined && previous.answers[id] !== undefined)
  const changed = shared
    .map((id) => ({ id, delta: (current[id] as number) - (previous.answers[id] as number) }))
    .filter((x) => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  const lines = changed.map(({ id, delta }) => {
    const r = readingById(id)
    const amount = copy.amounts[r.unit][Math.abs(delta) - 1]
    return fill(delta > 0 ? copy.since.up : copy.since.down, { name: r.name, amount })
  })

  const same = shared.filter((id) => current[id] === previous.answers[id]).map((id) => readingById(id).name.toLowerCase())
  if (same.length) lines.push(fill(copy.since.unchanged, { list: same.join(', ') }))
  if (!shared.length) lines.push(copy.since.nothingShared)

  return { since: whenLabel(previous, today), lines }
}
