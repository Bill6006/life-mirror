import { addDays, blockIndex, BLOCKS, daysBetween, parseDay, type Block } from './blocks'
import { copy } from './copy'
import type { CaffeineBand, CheckIn } from './db'
import { fill } from './format'
import { indexCheckIns, slotKey } from './learning'
import { readingOf } from './score'

// What the record may say about caffeine (Part 22). Pure functions over check-ins.
//
// Three honest states per check-in window, never collapsed: a band reported; the item shown and
// left untapped (none reported, which is never a confirmed zero); not shown (unknown, which
// enters no comparison at all). Older yes/no records read as some caffeine, amount unknown, and
// enter no band comparison either.
//
// Every comparison is an association, like for like, with its counts: a cell under five shows
// nothing, adjacent cells merge until each holds five, and the strongest standing is Promising,
// reached only from fifteen in each group across six weeks. The reading out of 100 is never
// touched: caffeine is context, not an adjustment.

export type WindowState = { state: 'reported'; band: CaffeineBand; at: string; since: string | null } | { state: 'untapped' } | { state: 'unknown' }

/** One check-in window's caffeine, in its three states. */
export function windowState(c: Pick<CheckIn, 'extras'> | null | undefined): WindowState {
  const ex = c?.extras
  if (ex?.caffeineIntake) return { state: 'reported', ...ex.caffeineIntake }
  if (ex?.caffeineShown) return { state: 'untapped' }
  return { state: 'unknown' }
}

/** The least each band holds, for "at least" totals: a day's total is a range, never a figure. */
export const BAND_FLOOR: Readonly<Record<CaffeineBand, number>> = { 1: 0, 2: 100, 3: 200, 4: 300 }
/** The most each band holds; the top band has no ceiling. */
export const BAND_CEILING: Readonly<Record<CaffeineBand, number | null>> = { 1: 99, 2: 199, 3: 299, 4: null }

/** A group of bands in words: one band's own label, or the range the group spans. */
export function bandsLabel(keys: readonly CaffeineBand[]): string {
  const lo = Math.min(...keys) as CaffeineBand
  const hi = Math.max(...keys) as CaffeineBand
  if (lo === hi) return copy.caffeine.bands[lo]
  if (lo === 1 && hi === 4) return copy.caffeine.anyAmount
  if (lo === 1) return fill(copy.caffeine.under, { mg: String(BAND_FLOOR[hi] + 100) })
  if (hi === 4) return fill(copy.caffeine.orMore, { mg: String(BAND_FLOOR[lo]) })
  return fill(copy.caffeine.between, { lo: String(BAND_FLOOR[lo]), hi: String(BAND_CEILING[hi]) })
}

/** A group of check-in windows in words, for the last window with 100 mg or more. */
export function windowsLabel(keys: readonly Block[]): string {
  if (keys.length === BLOCKS.length) return copy.caffeine.windowsAny
  return keys.map((b, i) => (i === 0 ? copy.caffeine.windows[b] : copy.caffeine.windows[b].toLowerCase())).join(copy.caffeine.or)
}

/** A label inside a sentence. */
export function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/** The band an "at least" total falls in. */
export function bandOfFloor(mg: number): CaffeineBand {
  return mg >= 300 ? 4 : mg >= 200 ? 3 : mg >= 100 ? 2 : 1
}

export interface DayCaffeine {
  day: string
  /** The windows that reported a band, in block order, with the check-in's own time. */
  windows: { block: Block; band: CaffeineBand; at: string; checkedAt: string }[]
  /** The windows where the item was shown and left untapped. */
  untapped: Block[]
  /** What the reported windows add up to at least, and at most (null when a 300+ window has no ceiling). */
  floor: number
  ceiling: number | null
  /** The band of the day's "at least" total; null when nothing was reported. */
  band: CaffeineBand | null
}

/** One day's caffeine as the record holds it. */
export function dayCaffeine(checkins: readonly CheckIn[], day: string): DayCaffeine {
  const own = checkins.filter((c) => c.day === day).sort((a, b) => blockIndex(a.block) - blockIndex(b.block))
  const windows: DayCaffeine['windows'] = []
  const untapped: Block[] = []
  for (const c of own) {
    const s = windowState(c)
    if (s.state === 'reported') windows.push({ block: c.block, band: s.band, at: s.at, checkedAt: c.completedAt ?? s.at })
    else if (s.state === 'untapped') untapped.push(c.block)
  }
  const floor = windows.reduce((t, w) => t + BAND_FLOOR[w.band], 0)
  const ceiling = windows.some((w) => BAND_CEILING[w.band] === null) ? null : windows.reduce((t, w) => t + (BAND_CEILING[w.band] as number), 0)
  return { day, windows, untapped, floor, ceiling, band: windows.length ? bandOfFloor(floor) : null }
}

/** How long caffeine counts as on board after a window of 100 mg or more (engineering judgment near one half-life). */
export const ON_BOARD_HOURS = 6

/**
 * Caffeine on board at a check-in (Part 22a): its own window reported a band, or the check-in
 * before it that day, within six hours, reported 100 mg or more. A marker beside the reading;
 * the number never changes.
 */
export function onBoard(all: readonly CheckIn[], c: CheckIn): boolean {
  if (c.extras?.caffeineIntake) return true
  const prev = all.filter((x) => x.day === c.day && blockIndex(x.block) < blockIndex(c.block)).sort((a, b) => blockIndex(b.block) - blockIndex(a.block))[0]
  const p = prev?.extras?.caffeineIntake
  if (!prev || !p || p.band < 2) return false
  const end = Date.parse(prev.completedAt ?? p.at)
  const at = Date.parse(c.completedAt ?? c.updatedAt)
  return at >= end && at - end <= ON_BOARD_HOURS * 3_600_000
}

export const HABIT_DAYS = 28
/** Reported on this many of the last 28 days, an untapped morning is more likely forgotten than empty. */
export const HABITUAL_DAYS = 20

export interface Habit {
  /** Days of the last 28 with any band reported. */
  reportedDays: number
  /** The most often reported morning band over the last 28 days; ties go to the lower band. */
  usualMorning: CaffeineBand | null
  /** Windows of the last 28 days where the item was shown and left untapped. */
  untapped: number
  habitual: boolean
}

/** The habit line (Part 22b): what was reported, and what was seen and left, over the last 28 days. */
export function caffeineHabit(checkins: readonly CheckIn[], today: string): Habit {
  const from = addDays(today, -(HABIT_DAYS - 1))
  const recent = checkins.filter((c) => c.day >= from && c.day <= today)
  const reportedDays = new Set(recent.filter((c) => c.extras?.caffeineIntake).map((c) => c.day)).size
  const counts = new Map<CaffeineBand, number>()
  for (const c of recent) {
    const b = c.block === 'morning' ? c.extras?.caffeineIntake?.band : undefined
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  let usualMorning: CaffeineBand | null = null
  for (const b of [1, 2, 3, 4] as CaffeineBand[]) if ((counts.get(b) ?? 0) > (usualMorning === null ? 0 : (counts.get(usualMorning) ?? 0))) usualMorning = b
  const untapped = recent.filter((c) => windowState(c).state === 'untapped').length
  return { reportedDays, usualMorning, untapped, habitual: reportedDays >= HABITUAL_DAYS }
}

/** Days before today on which the Caffeine item was on screen or tapped: how much record the new instrument has. */
export function itemDays(checkins: readonly CheckIn[], today: string): number {
  return new Set(checkins.filter((c) => c.day < today && (c.extras?.caffeineIntake || c.extras?.caffeineShown)).map((c) => c.day)).size
}

/** Whole weeks since the item first recorded anything. */
export function itemWeeks(checkins: readonly CheckIn[], today: string): number {
  const first = checkins.filter((c) => c.extras?.caffeineIntake || c.extras?.caffeineShown).reduce<string | null>((f, c) => (f === null || c.day < f ? c.day : f), null)
  return first ? Math.floor(Math.max(0, daysBetween(first, today)) / 7) : 0
}

// ---------- groups: the merge rule and the standing ----------

export const CELL_MIN = 5
export const STRONG_PER_GROUP = 15
export const STRONG_WEEKS = 6
/** Worthwhile differences, engineering judgment, stated: half a step of sleep (a step of sleep hours is about an hour), ten points on the reading out of 100. */
export const SLEEP_WORTHWHILE = 0.5
export const READING_WORTHWHILE = 10

export type Standing = 'little' | 'unclear' | 'promising'

export interface Cell<K> {
  keys: K[]
  n: number
}

/**
 * Adjacent cells merge until each holds five: the smallest cell joins its smaller neighbour,
 * one on its own side of a boundary first, so bands merge under and over 200 mg before across
 * it. Empty cells are not cells. One cell left means nothing to compare.
 */
export function mergeCells<K>(counts: readonly { key: K; n: number }[], side: (k: K) => number = () => 0): Cell<K>[] {
  let cells: Cell<K>[] = counts.filter((c) => c.n > 0).map((c) => ({ keys: [c.key], n: c.n }))
  const sideOf = (cell: Cell<K>): number => {
    const sides = new Set(cell.keys.map(side))
    return sides.size === 1 ? [...sides][0] : Number.NaN
  }
  while (cells.length > 1 && cells.some((c) => c.n < CELL_MIN)) {
    let i = 0
    for (let k = 1; k < cells.length; k++) if (cells[k].n < cells[i].n) i = k
    const neighbours = [i - 1, i + 1].filter((j) => j >= 0 && j < cells.length)
    const same = neighbours.filter((j) => sideOf(cells[j]) === sideOf(cells[i]))
    const pool = same.length ? same : neighbours
    const j = pool.reduce((best, k) => (cells[k].n < cells[best].n ? k : best), pool[0])
    const [a, b] = i < j ? [i, j] : [j, i]
    cells = [...cells.slice(0, a), { keys: [...cells[a].keys, ...cells[b].keys], n: cells[a].n + cells[b].n }, ...cells.slice(b + 1)]
  }
  return cells
}

/** The side of the 200 mg line a band sits on. */
export const bandSide = (b: CaffeineBand): number => (b >= 3 ? 1 : 0)

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

/** Within each stratum present in both groups, b minus a, weighted by the smaller side. */
function matched(a: readonly { stratum: string; value: number }[], b: readonly { stratum: string; value: number }[]): number | null {
  let sum = 0
  let weight = 0
  for (const s of new Set(a.map((p) => p.stratum))) {
    const x = a.filter((p) => p.stratum === s).map((p) => p.value)
    const y = b.filter((p) => p.stratum === s).map((p) => p.value)
    if (!x.length || !y.length) continue
    const w = Math.min(x.length, y.length)
    sum += w * ((mean(y) as number) - (mean(x) as number))
    weight += w
  }
  return weight ? sum / weight : null
}

function standing(groups: readonly { n: number }[], diffs: readonly (number | null)[], worthwhile: number, weeks: number): Standing {
  if (groups.length < 2 || diffs.every((d) => d === null)) return 'little'
  const big = diffs.some((d) => d !== null && Math.abs(d) >= worthwhile)
  return big && groups.every((g) => g.n >= STRONG_PER_GROUP) && weeks >= STRONG_WEEKS ? 'promising' : 'unclear'
}

/** The sleep a day began with, as a stratum: under six hours, six to seven, seven or more. Null when the morning did not say. */
export function sleepStratum(morning: CheckIn | undefined): string | null {
  const p = morning?.answers.sleepHours
  if (p === undefined) return null
  return p <= 2 ? 'short' : p === 3 ? 'mid' : 'long'
}

// ---------- the primary comparisons: no zero arm ----------

export interface SleepGroup<K> extends Cell<K> {
  /** Mean next-morning sleep hours and quality, as positions 1 to 5; null under five. */
  hours: number | null
  quality: number | null
}

export interface SleepComparison<K> {
  groups: SleepGroup<K>[]
  /** Last group minus first, like for like on the sleep the day began with, in steps; null when there is nothing to compare. */
  hoursDiff: number | null
  qualityDiff: number | null
  standing: Standing
  /** Two groups or more and no worthwhile difference: the fixed null wording applies. */
  none: boolean
  /** Two groups or more that share no starting sleep: nothing is compared like for like yet. */
  unmatched: boolean
}

interface SleepPoint<K> {
  key: K
  stratum: string
  hours: number | null
  quality: number | null
}

function sleepComparison<K>(points: readonly SleepPoint<K>[], order: readonly K[], side: (k: K) => number, weeks: number): SleepComparison<K> {
  const cells = mergeCells(
    order.map((key) => ({ key, n: points.filter((p) => p.key === key).length })),
    side,
  )
  const groups: SleepGroup<K>[] = cells.map((cell) => {
    const own = points.filter((p) => cell.keys.includes(p.key))
    const big = cell.n >= CELL_MIN
    return { ...cell, hours: big ? mean(own.flatMap((p) => (p.hours === null ? [] : [p.hours]))) : null, quality: big ? mean(own.flatMap((p) => (p.quality === null ? [] : [p.quality]))) : null }
  })
  let hoursDiff: number | null = null
  let qualityDiff: number | null = null
  if (groups.length >= 2) {
    const first = points.filter((p) => groups[0].keys.includes(p.key))
    const last = points.filter((p) => groups[groups.length - 1].keys.includes(p.key))
    const of = (ps: readonly SleepPoint<K>[], k: 'hours' | 'quality') => ps.flatMap((p) => (p[k] === null ? [] : [{ stratum: p.stratum, value: p[k] as number }]))
    hoursDiff = matched(of(first, 'hours'), of(last, 'hours'))
    qualityDiff = matched(of(first, 'quality'), of(last, 'quality'))
  }
  const st = standing(groups, [hoursDiff, qualityDiff], SLEEP_WORTHWHILE, weeks)
  const none = groups.length >= 2 && [hoursDiff, qualityDiff].every((d) => d === null || Math.abs(d) < SLEEP_WORTHWHILE) && [hoursDiff, qualityDiff].some((d) => d !== null)
  return { groups, hoursDiff, qualityDiff, standing: st, none, unmatched: groups.length >= 2 && hoursDiff === null && qualityDiff === null }
}

/** The next morning's sleep answers, and the stratum of the sleep the day began with; null when either is missing. */
function nextNight(byKey: ReadonlyMap<string, CheckIn>, day: string): { stratum: string; hours: number | null; quality: number | null } | null {
  const stratum = sleepStratum(byKey.get(slotKey(day, 'morning')))
  const next = byKey.get(slotKey(addDays(day, 1), 'morning'))
  const hours = next?.answers.sleepHours ?? null
  const quality = next?.answers.sleepQuality ?? null
  if (stratum === null || (hours === null && quality === null)) return null
  return { stratum, hours, quality }
}

/** Days before today that reported a band, grouped by the day's "at least" total, against the next night's sleep. */
export function byDayBand(checkins: readonly CheckIn[], today: string, weeks: number): SleepComparison<CaffeineBand> {
  const byKey = indexCheckIns(checkins)
  const days = [...new Set(checkins.filter((c) => c.day < today).map((c) => c.day))]
  const points: SleepPoint<CaffeineBand>[] = []
  for (const day of days) {
    const band = dayCaffeine(checkins, day).band
    const night = band ? nextNight(byKey, day) : null
    if (band && night) points.push({ key: band, ...night })
  }
  return sleepComparison(points, [1, 2, 3, 4], bandSide, weeks)
}

/** Days before today grouped by the last window that reported 100 mg or more, against the next night's sleep. Days without one enter nothing. */
export function byLatestWindow(checkins: readonly CheckIn[], today: string, weeks: number): SleepComparison<Block> {
  const byKey = indexCheckIns(checkins)
  const days = [...new Set(checkins.filter((c) => c.day < today).map((c) => c.day))]
  const points: SleepPoint<Block>[] = []
  for (const day of days) {
    const heavy = dayCaffeine(checkins, day).windows.filter((w) => w.band >= 2)
    const night = heavy.length ? nextNight(byKey, day) : null
    if (night) points.push({ key: heavy[heavy.length - 1].block, ...night })
  }
  return sleepComparison(points, BLOCKS, () => 0, weeks)
}

export interface ReadingGroup<K> extends Cell<K> {
  /** The mean reading out of 100; null under five. */
  value: number | null
}

export interface ReadingComparison<K> {
  groups: ReadingGroup<K>[]
  /** Last group minus first, like for like, in points; null when there is nothing to compare. */
  diff: number | null
  standing: Standing
  none: boolean
  /** Two groups or more that share no stratum: nothing is compared like for like yet. */
  unmatched: boolean
}

function readingComparison<K>(points: readonly { key: K; stratum: string; value: number }[], order: readonly K[], side: (k: K) => number, weeks: number): ReadingComparison<K> {
  const cells = mergeCells(
    order.map((key) => ({ key, n: points.filter((p) => p.key === key).length })),
    side,
  )
  const groups: ReadingGroup<K>[] = cells.map((cell) => ({ ...cell, value: cell.n >= CELL_MIN ? mean(points.filter((p) => cell.keys.includes(p.key)).map((p) => p.value)) : null }))
  const diff = groups.length >= 2 ? matched(points.filter((p) => groups[0].keys.includes(p.key)), points.filter((p) => groups[groups.length - 1].keys.includes(p.key))) : null
  const st = standing(groups, [diff], READING_WORTHWHILE, weeks)
  return { groups, diff, standing: st, none: groups.length >= 2 && diff !== null && Math.abs(diff) < READING_WORTHWHILE, unmatched: groups.length >= 2 && diff === null }
}

/** Mornings before today that reported a band, grouped by it, against that afternoon's reading, among mornings that began on the same sleep. */
export function byMorningBand(checkins: readonly CheckIn[], today: string, weeks: number): ReadingComparison<CaffeineBand> {
  const byKey = indexCheckIns(checkins)
  const points: { key: CaffeineBand; stratum: string; value: number }[] = []
  for (const m of checkins) {
    if (m.block !== 'morning' || m.day >= today || !m.extras?.caffeineIntake) continue
    const stratum = sleepStratum(m)
    const a = byKey.get(slotKey(m.day, 'afternoon'))
    const r = a ? readingOf(a) : null
    if (stratum !== null && r) points.push({ key: m.extras.caffeineIntake.band, stratum, value: r.value })
  }
  return readingComparison(points, [1, 2, 3, 4], bandSide, weeks)
}

// ---------- the secondary comparison: labelled for what it is ----------

export interface ReportedComparison extends ReadingComparison<'reported' | 'untapped'> {
  /** Untapped mornings left out because caffeine was reported on most of the last 28 days. */
  droppedMornings: number
  habitual: boolean
}

/**
 * Check-ins where caffeine was reported against check-ins where the item was shown and left
 * untapped ("no caffeine reported", never "no caffeine"), the same check-in's reading, like for
 * like by time of day. Not-shown windows enter nothing. For a habitual reporter, untapped
 * mornings are dropped, and the withdrawal caveat stands beside the result.
 */
export function reportedAgainstUntapped(checkins: readonly CheckIn[], today: string, weeks: number): ReportedComparison {
  const habitual = caffeineHabit(checkins, today).habitual
  const points: { key: 'reported' | 'untapped'; stratum: string; value: number }[] = []
  let droppedMornings = 0
  for (const c of checkins) {
    if (c.day >= today) continue
    const s = windowState(c).state
    const r = readingOf(c)
    if (s === 'unknown' || !r) continue
    if (s === 'untapped' && habitual && c.block === 'morning') {
      droppedMornings++
      continue
    }
    points.push({ key: s, stratum: c.block, value: r.value })
  }
  return { ...readingComparison(points, ['untapped', 'reported'], () => 0, weeks), droppedMornings, habitual }
}

export interface CaffeineEvidence {
  habit: Habit
  byDayBand: SleepComparison<CaffeineBand>
  byLatestWindow: SleepComparison<Block>
  byMorningBand: ReadingComparison<CaffeineBand>
  reported: ReportedComparison
  /** Days before today the item recorded anything: the old yes/no rows stay until this reaches 28. */
  itemDays: number
  weeks: number
}

export function caffeineEvidence(checkins: readonly CheckIn[], today: string): CaffeineEvidence {
  const weeks = itemWeeks(checkins, today)
  return {
    habit: caffeineHabit(checkins, today),
    byDayBand: byDayBand(checkins, today, weeks),
    byLatestWindow: byLatestWindow(checkins, today, weeks),
    byMorningBand: byMorningBand(checkins, today, weeks),
    reported: reportedAgainstUntapped(checkins, today, weeks),
    itemDays: itemDays(checkins, today),
    weeks,
  }
}

// ---------- late caffeine: the meta-analytic cut-offs ----------

/** Gardiner et al. 2023: total sleep stopped shrinking only when about 107 mg came 8.8 hours or more before bed, and about 217 mg 13.2 hours or more. */
export const CUTOFFS: Readonly<Record<2 | 3 | 4, { mg: number; hours: number }>> = { 2: { mg: 107, hours: 8.8 }, 3: { mg: 217, hours: 13.2 }, 4: { mg: 217, hours: 13.2 } }

export interface Late {
  day: string
  block: Block
  band: CaffeineBand
  /** The check-in's own time, HH:MM: the window's end, taken as the latest the caffeine could count from. */
  time: string
  mg: number
  hours: number
}

export function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * The day's latest reported window whose cut-off, counted from its check-in, runs past midnight:
 * any bedtime before midnight then falls inside it. Only a reported band of 100 mg or more can
 * fire it; an untapped or unseen window never does, and a bedtime is never assumed.
 */
export function lateCaffeine(checkins: readonly CheckIn[], day: string): Late | null {
  // parseDay gives noon, so date arithmetic ignores clock changes; the cut-off is measured to local midnight.
  const next = parseDay(addDays(day, 1))
  next.setHours(0, 0, 0, 0)
  const midnight = next.getTime()
  const windows = dayCaffeine(checkins, day).windows
  for (let i = windows.length - 1; i >= 0; i--) {
    const w = windows[i]
    if (w.band < 2) continue
    const cut = CUTOFFS[w.band as 2 | 3 | 4]
    if (Date.parse(w.checkedAt) + cut.hours * 3_600_000 > midnight) return { day, block: w.block, band: w.band, time: hhmm(w.checkedAt), mg: cut.mg, hours: cut.hours }
  }
  return null
}
