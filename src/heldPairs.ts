import { useEffect, useMemo, useState } from 'preact/hooks'
import { morningAfter } from './associations'
import { addDays, parseDay } from './blocks'
import { EVENING_READINGS, patternsOn, type BeforePair } from './beforeDays'
import { build } from './build'
import { copy } from './copy'
import type { Standing } from './counted/compare'
import { guardComparisons } from './counted/fault'
import type { CheckIn } from './db'
import { fill } from './format'
import { indexCheckIns, slotKey } from './observe'
import { readingOf } from './score'

// The forecast follow-ups, Batch 2, item 6: "A steady pattern" has to hold (designed 2026-11-20; its criteria frozen anew
// at the owner's word that evening; its verdict on unread seeds passed on 2026-11-21 at 43 days, stress/RESULTS-12.md).
// A pair of "What comes before your days" is called a steady pattern only once `comesBefore` has called it one on that
// day and on each of the 42 days before; until then it reads as a lead. It reaches Mirror's sixteen pairs and the one
// "Evenings like this one" shows, and nothing else, at the owner's word: "For now, apply the 43-day hold only to the
// exact standings/screens that were covered by this simulation." Every other standing reads as before.
//
// A day's answers are worked out from the record as it stands now (the evenings before that day, each with its next
// morning), so a day the app was not opened counts like any other, and a check-in changed or deleted reaches every day
// it touched at the next look. They are kept in this phone's local storage by exactly what they were worked out from:
// the app's build, and every evening before each day as the pairs read it. Never synced, never exported, never read as
// truth: a day not kept is worked out again, in slices that leave the screen free.

/** The days a pair must stand at a steady pattern, running, before it is called one: from its simulation. */
export const HOLD_DAYS = 43
/** Where this phone keeps each day's answers. */
export const HELD_KEY = 'lm.heldPairs'
/** About how long one slice of working out holds the screen, in milliseconds. */
export const SLICE_MS = 40

/** A pair's hold on a day (the design's items 3 and 4). */
export type Hold =
  | { kind: 'held'; k: number; since: string }
  | { kind: 'notYet'; k: number }
  | { kind: 'fell'; k: number; until: string }
  | { kind: 'none' }

export interface KeyValue {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The sixteen pairs in `comesBefore`'s own order: each evening reading high, then low. */
export const PAIR_KEYS: readonly string[] = EVENING_READINGS.flatMap((r) => [`${r}.high`, `${r}.low`])
export const pairKey = (p: Pick<BeforePair, 'reading' | 'level'>): string => `${p.reading}.${p.level}`

/** What the sixteen pairs read of one evening: its day, its eight evening answers, its own reading out of 100 and the next morning's. */
export type Link = (string | number | null)[]

/** An answer as kept: one never given apart from any value, as the pairs tell them apart. */
const answered = (v: unknown): string | number | null => (v === undefined ? '-' : (v as number | null))

/** Every evening of the record, in the record's own order, as the pairs read it. */
export function chainOf(checkins: readonly CheckIn[]): Link[] {
  const byKey = indexCheckIns(checkins)
  const own = (day: string): number | null => {
    const c = byKey.get(slotKey(day, 'evening'))
    const r = c ? readingOf(c) : null
    return r ? r.value : null
  }
  return checkins.filter((c) => c.block === 'evening').map((c) => [c.day, ...EVENING_READINGS.map((r) => answered(c.answers[r])), own(c.day), morningAfter(byKey, c.day)])
}

interface Keyed {
  day: string
  key: string
}

/** Whether a day was worked out from the same evenings, in the same order: every evening before it, alike in both. */
function sameInputs(a: readonly Keyed[], b: readonly Keyed[], day: string): boolean {
  let i = 0
  let j = 0
  for (;;) {
    while (i < a.length && a[i].day >= day) i++
    while (j < b.length && b[j].day >= day) j++
    if (i === a.length || j === b.length) return i === a.length && j === b.length
    if (a[i].key !== b[j].key) return false
    i++
    j++
  }
}

const isMask = (m: unknown): m is number => typeof m === 'number' && Number.isInteger(m) && m >= 0 && m < 1 << PAIR_KEYS.length
const maskOf = (on: readonly boolean[]): number => on.reduce((m, b, i) => (b ? m | (1 << i) : m), 0)

interface Kept {
  v: 1
  build: string
  chain: Link[]
  days: Record<string, number>
}

function readKept(kv: KeyValue | null, buildId: string): Kept | null {
  try {
    const raw = kv?.getItem(HELD_KEY) ?? null
    if (!raw) return null
    const k = JSON.parse(raw) as Kept
    return k && k.v === 1 && k.build === buildId && Array.isArray(k.chain) && k.days !== null && typeof k.days === 'object' ? k : null
  } catch {
    return null
  }
}

function pageStorage(): KeyValue | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * A pair's hold from its answers on consecutive days, the last of them today (items 3 and 4). Held: a steady pattern
 * today and on each of the 42 days before, `since` the run's first day. Not yet held: a steady pattern today, for fewer
 * days running. Fallen back: not one today, and the latest run of 43 days or more has ended, `until` its last day.
 */
export function holdOf(bits: readonly boolean[], days: readonly string[]): Hold {
  // The runs of days at a steady pattern, in order: each day's answer joins the run that ended the day before.
  const runs: { start: number; end: number }[] = []
  bits.forEach((on, i) => {
    if (!on) return
    const run = runs[runs.length - 1]
    if (run && run.end === i - 1) run.end = i
    else runs.push({ start: i, end: i })
  })
  const today = runs.find((r) => r.end === bits.length - 1)
  if (today) {
    const k = today.end - today.start + 1
    return k >= HOLD_DAYS ? { kind: 'held', k, since: days[today.start] } : { kind: 'notYet', k }
  }
  const ended = runs.filter((r) => r.end - r.start + 1 >= HOLD_DAYS)
  const latest = ended[ended.length - 1]
  return latest ? { kind: 'fell', k: latest.end - latest.start + 1, until: days[latest.end] } : { kind: 'none' }
}

export interface HoldJob {
  /** True once every day to today is known, or the working-out failed. */
  readonly finished: boolean
  /** Works out days not kept for about `ms` milliseconds; true once finished. */
  step(ms: number): boolean
  /** Each pair's hold, by `pairKey`, once finished; null before then or after a failure. */
  holds(): ReadonlyMap<string, Hold> | null
  /** Keeps every day known so far, with what they were worked out from. */
  save(): void
}

export interface HoldOptions {
  /** Where the days are kept (default: this page's local storage; null keeps nothing). */
  storage?: KeyValue | null
  /** The app's build (default: its commit). */
  build?: string
  clock?: () => number
  /** A day's sixteen answers (default: `patternsOn`). */
  on?: (checkins: readonly CheckIn[], day: string) => boolean[]
  /** How long the first slice, worked out at once, may take (default SLICE_MS). */
  first?: number
}

/**
 * Starts working out each pair's hold on `today` from the record: the days kept that still hold, then every other day
 * from the day after the record's first evening to today, a slice at a time. Under the comparisons' guard, as every
 * read of their new math is: a throw ends the working-out with no holds, and the failure is kept for the Worker's report.
 */
export function startHold(checkins: readonly CheckIn[], today: string, opts: HoldOptions = {}): HoldJob {
  const kv = opts.storage === undefined ? pageStorage() : opts.storage
  const buildId = opts.build ?? build.commit
  const clock = opts.clock ?? (() => performance.now())
  const on = opts.on ?? ((all: readonly CheckIn[], day: string) => patternsOn(all, day))
  const chain = chainOf(checkins)
  const fresh: Keyed[] = chain.map((l) => ({ day: l[0] as string, key: JSON.stringify(l) }))
  const masks = new Map<string, number>()
  // A kept day still holds only where every evening before it reads as it did then, under the same build.
  const kept = readKept(kv, buildId)
  if (kept) {
    const old: Keyed[] = kept.chain.map((l) => ({ day: String(Array.isArray(l) ? l[0] : ''), key: JSON.stringify(l) }))
    for (const [day, m] of Object.entries(kept.days)) if (isMask(m) && sameInputs(old, fresh, day)) masks.set(day, m)
  }
  const firstEvening = fresh.reduce<string | null>((m, l) => (m === null || l.day < m ? l.day : m), null)
  const days: string[] = []
  if (firstEvening !== null) for (let d = addDays(firstEvening, 1); d <= today; d = addDays(d, 1)) days.push(d)
  const todo = days.filter((d) => !masks.has(d))
  let next = 0
  let finished = false
  let failed = false
  let result: Map<string, Hold> | null = null

  const save = (): void => {
    if (!kv || failed) return
    const out: Record<string, number> = {}
    for (const [d, m] of masks) out[d] = m
    try {
      kv.setItem(HELD_KEY, JSON.stringify({ v: 1, build: buildId, chain, days: out } satisfies Kept))
    } catch {
      // A full or closed storage keeps nothing: the days are worked out again at the next look.
    }
  }

  const step = (ms: number): boolean => {
    if (finished) return true
    const t0 = clock()
    const ran = guardComparisons(today, () => {
      while (next < todo.length && clock() - t0 < ms) {
        masks.set(todo[next], maskOf(on(checkins, todo[next])))
        next++
      }
      return true
    })
    if (ran === null) {
      failed = true
      finished = true
    } else if (next >= todo.length) {
      finished = true
      save()
    }
    return finished
  }

  const holds = (): ReadonlyMap<string, Hold> | null => {
    if (!finished || failed) return null
    result ??= new Map(PAIR_KEYS.map((key, i) => [key, holdOf(days.map((d) => (((masks.get(d) as number) >> i) & 1) === 1), days)]))
    return result
  }

  step(opts.first ?? SLICE_MS)
  return {
    get finished() {
      return finished
    },
    step,
    holds,
    save,
  }
}

/** A day as the app's "Since" line says it: "12 November", in the phone's own order. */
export const dayAndMonth = (day: string): string => parseDay(day).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

/** A hold's Details sentence (item 4), in the approved contract's words; null where none applies. */
export function holdLine(h: Hold): string | null {
  const c = copy.beforeDays
  switch (h.kind) {
    case 'notYet':
      return fill(h.k === 1 ? c.notHeldOne : c.notHeld, { k: String(h.k), n: String(HOLD_DAYS) })
    case 'held':
      return fill(c.held, { date: dayAndMonth(h.since), k: String(h.k) })
    case 'fell':
      return fill(c.fell, { k: String(h.k), date: dayAndMonth(h.until) })
    case 'none':
      return null
  }
}

/**
 * A pair's standing as its row says it (item 3): a steady pattern only once held. One at a pattern that has not stood so
 * for 43 days running, or whose days are not yet known (no hold), reads as a lead. Every other standing as it is.
 */
export function heldStanding(p: Pick<BeforePair, 'standing'>, h: Hold | null): Standing {
  return p.standing === 'pattern' && h?.kind !== 'held' ? 'lead' : p.standing
}

/** A row's Details sentence: only where its standing today and its kept days agree (held or not yet held at a pattern, fallen back at none). */
export function detailsLine(p: Pick<BeforePair, 'standing'>, h: Hold | null): string | null {
  if (!h || h.kind === 'none' || (h.kind === 'fell') === (p.standing === 'pattern')) return null
  return holdLine(h)
}

/**
 * Each pair's hold for a screen: the first slice worked out as the screen draws, so a record whose days are all kept
 * shows at once; the rest in slices of about 40 milliseconds, the screen drawn again when they are done. Null until then.
 */
export function useHeldPairs(checkins: readonly CheckIn[] | null | undefined, today: string): ReadonlyMap<string, Hold> | null {
  const job = useMemo(() => (checkins ? startHold(checkins, today) : null), [checkins, today])
  const [, setDone] = useState(0)
  useEffect(() => {
    if (!job || job.finished) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const go = (): void => {
      if (job.step(SLICE_MS)) setDone((n) => n + 1)
      else timer = setTimeout(go, 0)
    }
    timer = setTimeout(go, 0)
    return () => {
      clearTimeout(timer)
      if (!job.finished) job.save()
    }
  }, [job])
  return job ? job.holds() : null
}
