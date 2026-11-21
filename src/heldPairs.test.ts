import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eveningPoints, likeForLike } from './associations'
import { addDays } from './blocks'
import { comesBefore, EVENING_READINGS, patternsOn, standingLine } from './beforeDays'
import { whenLabel } from './change'
import { standings, WORTH_POINTS, type Compared } from './counted/compare'
import { comparisonFaults, resetComparisonFaults } from './counted/fault'
import type { CheckIn } from './db'
import { chainOf, dayAndMonth, detailsLine, HELD_KEY, heldStanding, holdLine, holdOf, HOLD_DAYS, startHold, type Hold, type KeyValue } from './heldPairs'
import { blockReadings, type Position, type ReadingId } from './readings'
import { readingOf } from './score'

// The forecast follow-ups, Batch 2, item 6: "A steady pattern" has to hold. The rules of the design's items 2 to 4 on
// hand-worked days; the days kept on the phone against a fresh working-out after edits and deletions; a new build; a
// day the app was not opened; the slices; the guard; and the day's answers against comesBefore itself.

const days = (from: string, n: number): string[] => Array.from({ length: n }, (_, i) => addDays(from, i))
const bits = (...runs: [boolean, number][]): boolean[] => runs.flatMap(([on, n]) => Array.from({ length: n }, () => on))
const T = true
const F = false

describe('a pair holds (items 3 and 4)', () => {
  it('is held from 43 days running, today among them, and not one day sooner', () => {
    const d = days('2026-09-01', 60)
    expect(HOLD_DAYS).toBe(43)
    expect(holdOf(bits([F, 18], [T, 42]), d)).toEqual({ kind: 'notYet', k: 42 })
    expect(holdOf(bits([F, 17], [T, 43]), d)).toEqual({ kind: 'held', k: 43, since: '2026-09-18' })
    expect(holdOf(bits([T, 60]), d)).toEqual({ kind: 'held', k: 60, since: '2026-09-01' })
  })

  it('counts only the days running to today: a run broken by one day starts again', () => {
    const d = days('2026-09-01', 60)
    expect(holdOf(bits([T, 39], [F, 1], [T, 20]), d)).toEqual({ kind: 'notYet', k: 20 })
    expect(holdOf(bits([F, 59], [T, 1]), d)).toEqual({ kind: 'notYet', k: 1 })
  })

  it('falls back when today is not a pattern after a run of 43 days or more, and names that run’s length and last day', () => {
    const d = days('2026-08-01', 80)
    expect(holdOf(bits([F, 10], [T, 50], [F, 20]), d)).toEqual({ kind: 'fell', k: 50, until: '2026-09-29' })
    expect(holdOf(bits([F, 10], [T, 43], [F, 27]), d)).toEqual({ kind: 'fell', k: 43, until: '2026-09-22' })
    // A run of 42 that ended never held, so nothing fell back.
    expect(holdOf(bits([F, 10], [T, 42], [F, 28]), d)).toEqual({ kind: 'none' })
  })

  it('names the latest run that held, past any short run after it; and while today is a pattern, the run under way', () => {
    const d = days('2026-07-01', 120)
    expect(holdOf(bits([T, 44], [F, 1], [T, 47], [F, 28]), d)).toEqual({ kind: 'fell', k: 47, until: '2026-09-30' })
    expect(holdOf(bits([T, 50], [F, 2], [T, 5], [F, 63]), d)).toEqual({ kind: 'fell', k: 50, until: '2026-08-19' })
    expect(holdOf(bits([T, 50], [F, 2], [T, 68]), d)).toEqual({ kind: 'held', k: 68, since: '2026-08-22' })
    expect(holdOf(bits([T, 50], [F, 2], [T, 5]), d.slice(0, 57))).toEqual({ kind: 'notYet', k: 5 })
  })

  it('has nothing to say for a pair never at a pattern, or with no days', () => {
    expect(holdOf(bits([F, 30]), days('2026-09-01', 30))).toEqual({ kind: 'none' })
    expect(holdOf([], [])).toEqual({ kind: 'none' })
  })
})

describe('the words (item 4, the approved contract’s, word for word)', () => {
  it('says each of the three sentences, one day running in the singular', () => {
    expect(holdLine({ kind: 'notYet', k: 3 })).toBe('It has read as a steady pattern 3 days running; it is called one from 43.')
    expect(holdLine({ kind: 'notYet', k: 1 })).toBe('It has read as a steady pattern 1 day running; it is called one from 43.')
    expect(holdLine({ kind: 'held', k: 50, since: '2026-11-12' })).toBe(`A steady pattern since ${dayAndMonth('2026-11-12')}, 50 days running.`)
    expect(holdLine({ kind: 'fell', k: 47, until: '2026-11-12' })).toBe(`It was a steady pattern for 47 days, until ${dayAndMonth('2026-11-12')}.`)
    expect(holdLine({ kind: 'none' })).toBeNull()
  })

  it('says a day as the app’s Since line does, the day and the month in the phone’s own order', () => {
    expect(dayAndMonth('2026-11-12')).toMatch(/^(12 November|November 12)$/)
    // The check-in's "Since" line for an evening three weeks back says its day the same way.
    expect(whenLabel({ day: '2026-11-12', block: 'evening' }, { day: '2026-12-03', block: 'morning' })).toBe(`${dayAndMonth('2026-11-12')}, evening`)
  })
})

describe('a row’s standing and Details under the hold', () => {
  const pattern = { standing: 'pattern' as const, family: 16 }
  const lead = { standing: 'lead' as const, family: 16 }
  const held: Hold = { kind: 'held', k: 50, since: '2026-10-01' }
  const notYet: Hold = { kind: 'notYet', k: 3 }
  const fell: Hold = { kind: 'fell', k: 47, until: '2026-11-01' }

  it('says a steady pattern only once it has held; a pattern not yet held reads as a lead, with how many were looked at', () => {
    expect(standingLine({ standing: heldStanding(pattern, held), family: 16 })).toBe('A steady pattern')
    expect(standingLine({ standing: heldStanding(pattern, notYet), family: 16 })).toBe('A lead, not yet a pattern · 16 looked at')
    expect(detailsLine(pattern, held)).toBe(holdLine(held))
    expect(detailsLine(pattern, notYet)).toBe('It has read as a steady pattern 3 days running; it is called one from 43.')
  })

  it('reads a pattern as a lead, with no Details, until its days are known', () => {
    expect(heldStanding(pattern, null)).toBe('lead')
    expect(detailsLine(pattern, null)).toBeNull()
    expect(detailsLine(lead, null)).toBeNull()
  })

  it('leaves every other standing as it is, and says a fall back only where today is not a pattern', () => {
    expect(heldStanding(lead, fell)).toBe('lead')
    expect(heldStanding({ standing: 'noPattern' }, fell)).toBe('noPattern')
    expect(heldStanding({ standing: 'tooFew' }, null)).toBe('tooFew')
    expect(detailsLine(lead, fell)).toBe(holdLine(fell))
    expect(detailsLine(lead, { kind: 'none' })).toBeNull()
    expect(detailsLine(pattern, { kind: 'none' })).toBeNull()
  })

  it('says nothing where today’s standing and the days kept disagree', () => {
    expect(detailsLine(pattern, fell)).toBeNull()
    expect(heldStanding(pattern, fell)).toBe('lead')
    expect(detailsLine(lead, held)).toBeNull()
    expect(detailsLine(lead, notYet)).toBeNull()
    expect(heldStanding(lead, held)).toBe('lead')
  })
})

// ---- Seeded records -------------------------------------------------------------------------------------------------

const MORNING = blockReadings('morning')
const EVENING = blockReadings('evening')

function rand(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (p: number): Position => Math.max(1, Math.min(5, p)) as Position
const ci = (day: string, block: CheckIn['block'], answers: Partial<Record<ReadingId, Position>>): CheckIn => ({ day, block, answers, startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000 })

interface Shape {
  days: number
  /** Steps every ingredient of the morning after a stressed evening moves the worse way. */
  effect: number
  /** The share of evenings with stress at its top phrase, in no rhythm. */
  share: number
  start?: string
  /** Days with no check-in at all, as a phone left closed: [from, to) counted from the start. */
  gap?: readonly [number, number]
  /** The share of check-ins left out at random. */
  skip?: number
}

/** A seeded record, newest first as the app reads it. */
function recordOf(seed: number, s: Shape): CheckIn[] {
  const r = rand(seed)
  const out: CheckIn[] = []
  let stressed = false
  for (let d = 0; d < s.days; d++) {
    const day = addDays(s.start ?? '2026-07-01', d)
    const closed = s.gap !== undefined && d >= s.gap[0] && d < s.gap[1]
    if (!closed && r() >= (s.skip ?? 0)) {
      const m: Partial<Record<ReadingId, Position>> = {}
      for (const id of MORNING) m[id] = (2 + Math.floor(r() * 3)) as Position
      if (stressed) {
        for (const id of ['mood', 'energy', 'focus'] as const) m[id] = clamp((m[id] as number) - s.effect)
        for (const id of ['stress', 'overwhelm', 'irritation'] as const) m[id] = clamp((m[id] as number) + s.effect)
      }
      out.push(ci(day, 'morning', m))
    }
    stressed = false
    if (!closed && r() >= (s.skip ?? 0)) {
      const e: Partial<Record<ReadingId, Position>> = {}
      for (const id of EVENING) e[id] = (2 + Math.floor(r() * 3)) as Position
      stressed = r() < s.share
      e.stress = stressed ? 5 : ((1 + Math.floor(r() * 3)) as Position)
      out.push(ci(day, 'evening', e))
    }
  }
  return out.reverse()
}

const firstDay = (rec: readonly CheckIn[]): string => rec.filter((c) => c.block === 'evening').reduce((m, c) => (c.day < m ? c.day : m), '9999')

/** A storage in memory, as the page's local storage. */
function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}
const keptDays = (kv: KeyValue): Record<string, number> => (JSON.parse(kv.getItem(HELD_KEY) as string) as { days: Record<string, number> }).days

/**
 * A stand-in for `patternsOn`, quick, that reads every evening before the day as the pairs do (its eight answers, its
 * own reading, the next morning's) in the record's order, written apart from the code under test: any change to them
 * changes its sixteen answers. It notes each day it is asked.
 */
function standIn(asked: string[]) {
  return (all: readonly CheckIn[], day: string): boolean[] => {
    asked.push(day)
    const byKey = new Map(all.map((c) => [`${c.day}|${c.block}`, c]))
    let h = 2166136261
    for (const c of all) {
      if (c.block !== 'evening' || c.day >= day) continue
      const ev = byKey.get(`${c.day}|evening`)
      const mo = byKey.get(`${addDays(c.day, 1)}|morning`)
      const s = JSON.stringify([c.day, EVENING_READINGS.map((id) => c.answers[id] ?? '-'), ev ? (readingOf(ev)?.value ?? null) : null, mo ? (readingOf(mo)?.value ?? null) : null])
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
    }
    return Array.from({ length: 16 }, (_, i) => ((h >>> i) & 1) === 1)
  }
}

/** Works the hold out whole, at once. */
function hold(rec: readonly CheckIn[], today: string, storage: KeyValue | null, asked: string[] = [], build = 'b1') {
  const job = startHold(rec, today, { storage, build, on: standIn(asked), first: Infinity })
  expect(job.finished).toBe(true)
  return job
}

const edit = (rec: readonly CheckIn[], day: string, block: CheckIn['block'], over: Partial<CheckIn>): CheckIn[] => rec.map((c) => (c.day === day && c.block === block ? { ...c, ...over } : c))
const drop = (rec: readonly CheckIn[], day: string, block: CheckIn['block']): CheckIn[] => rec.filter((c) => !(c.day === day && c.block === block))
const after = (list: readonly string[], day: string): string[] => list.filter((d) => d > day)

describe('the days kept on this phone, by exactly what they were worked out from', () => {
  const today = '2026-09-15'
  const rec = recordOf(11, { days: 77, effect: 2, share: 0.35 })
  const all = days(addDays(firstDay(rec), 1), 76)

  it('works out every day from the day after the first evening to today, keeps them, and works out nothing again at the next look', () => {
    const kv = memory()
    const asked: string[] = []
    const first = hold(rec, today, kv, asked)
    expect(asked).toEqual(all)
    expect(Object.keys(keptDays(kv)).sort()).toEqual(all)
    const again: string[] = []
    const second = hold(rec, today, kv, again)
    expect(again).toEqual([])
    expect([...(second.holds() ?? [])]).toEqual([...(first.holds() ?? [])])
  })

  it('works out again, after an evening is changed, every day after it and no day before', () => {
    const kv = memory()
    hold(rec, today, kv)
    const changed = edit(rec, '2026-08-20', 'evening', { answers: { ...rec.find((c) => c.day === '2026-08-20' && c.block === 'evening')?.answers, hunger: 1 } })
    const asked: string[] = []
    hold(changed, today, kv, asked)
    expect(asked).toEqual(after(all, '2026-08-20'))
    const fresh = memory()
    hold(changed, today, fresh)
    expect(keptDays(kv)).toEqual(keptDays(fresh))
  })

  it('reaches a past day when the next morning is changed or deleted, or an evening deleted', () => {
    for (const change of [
      (r: CheckIn[]) => edit(r, '2026-08-11', 'morning', { answers: { ...r.find((c) => c.day === '2026-08-11' && c.block === 'morning')?.answers, mood: 1, energy: 1 } }),
      (r: CheckIn[]) => drop(r, '2026-08-11', 'morning'),
      (r: CheckIn[]) => drop(r, '2026-08-10', 'evening'),
    ]) {
      const kv = memory()
      hold(rec, today, kv)
      const changed = change(rec)
      const asked: string[] = []
      hold(changed, today, kv, asked)
      expect(asked).toEqual(after(all, '2026-08-10'))
      const fresh = memory()
      hold(changed, today, fresh)
      expect(keptDays(kv)).toEqual(keptDays(fresh))
    }
  })

  it('reaches a past day when an evening’s own reading changes with what it asked, its answers alike', () => {
    const kv = memory()
    hold(rec, today, kv)
    const changed = edit(rec, '2026-08-25', 'evening', { asked: ['stress', 'focus', 'overwhelm'] })
    const asked: string[] = []
    hold(changed, today, kv, asked)
    expect(asked).toEqual(after(all, '2026-08-25'))
  })

  it('keeps every day when tonight is logged, and works out today alone when this morning is', () => {
    const kv = memory()
    const before = drop(drop(rec, today, 'evening'), today, 'morning')
    hold(before, today, kv)
    const morning = rec.find((c) => c.day === today && c.block === 'morning') as CheckIn
    const evening = rec.find((c) => c.day === today && c.block === 'evening') as CheckIn
    const asked: string[] = []
    hold([morning, ...before], today, kv, asked)
    expect(asked).toEqual([today])
    const tonight: string[] = []
    hold([evening, morning, ...before], today, kv, tonight)
    expect(tonight).toEqual([])
  })

  it('equals a fresh working-out day by day after random edits, deletions and additions', () => {
    const r = rand(5)
    const kv = memory()
    let current = recordOf(23, { days: 70, effect: 1, share: 0.4, skip: 0.1 })
    const end = '2026-09-08'
    hold(current, end, kv)
    for (let n = 0; n < 30; n++) {
      const day = addDays('2026-07-01', Math.floor(r() * 70))
      const block: CheckIn['block'] = r() < 0.5 ? 'evening' : 'morning'
      const at = current.find((c) => c.day === day && c.block === block)
      const pick = r()
      if (at && pick < 0.45) current = edit(current, day, block, { answers: { ...at.answers, [EVENING_READINGS[Math.floor(r() * 8)]]: (1 + Math.floor(r() * 5)) as Position } })
      else if (at && pick < 0.7) current = drop(current, day, block)
      else if (!at) current = [...current, ci(day, block, Object.fromEntries((block === 'evening' ? EVENING : MORNING).map((id) => [id, (1 + Math.floor(r() * 5)) as Position])))].sort((a, b) => (a.day === b.day ? (a.block === 'evening' ? -1 : 1) : a.day < b.day ? 1 : -1))
      else current = edit(current, day, block, { asked: (block === 'evening' ? EVENING : MORNING).filter(() => r() < 0.6) })
      const asked: string[] = []
      const kept = hold(current, end, kv, asked)
      const fresh = memory()
      const whole = hold(current, end, fresh)
      expect(keptDays(kv)).toEqual(keptDays(fresh))
      expect([...(kept.holds() ?? [])]).toEqual([...(whole.holds() ?? [])])
    }
  })

  it('keeps an answer never given apart from any value, as the pairs tell them apart', () => {
    // The pairs count an evening whose answer is there at all, and read its level from it: a missing one and an empty one differ.
    const missing = ci('2026-08-01', 'evening', { mood: 3 })
    const empty = ci('2026-08-01', 'evening', { mood: 3, stress: null as unknown as Position })
    expect(JSON.stringify(chainOf([missing]))).not.toBe(JSON.stringify(chainOf([empty])))
    const morning = ci('2026-08-02', 'morning', Object.fromEntries(MORNING.map((id) => [id, 3])))
    expect(comesBefore([empty, morning], '2026-08-03').find((p) => p.reading === 'stress' && p.level === 'low')?.withN).toBe(1)
    expect(comesBefore([missing, morning], '2026-08-03').find((p) => p.reading === 'stress' && p.level === 'low')?.withN).toBe(0)
  })

  it('keeps nothing across a new build of the app', () => {
    const kv = memory()
    hold(rec, today, kv, [], 'b1')
    const asked: string[] = []
    hold(rec, today, kv, asked, 'b2')
    expect(asked).toEqual(all)
  })

  it('reads nothing kept that is not its own: another version, a broken store, a day out of range', () => {
    for (const raw of ['not json', JSON.stringify({ v: 2, build: 'b1', chain: [], days: {} }), JSON.stringify(null)]) {
      const kv = memory()
      kv.setItem(HELD_KEY, raw)
      const asked: string[] = []
      hold(rec, today, kv, asked)
      expect(asked).toEqual(all)
    }
    const kv = memory()
    hold(rec, today, kv)
    const kept = JSON.parse(kv.getItem(HELD_KEY) as string) as { days: Record<string, number> }
    kept.days['2026-08-01'] = 1 << 16
    kv.setItem(HELD_KEY, JSON.stringify(kept))
    const asked: string[] = []
    hold(rec, today, kv, asked)
    expect(asked).toEqual(['2026-08-01'])
  })

  it('goes on without keeping when the storage refuses, or is missing', () => {
    const refusing: KeyValue = {
      getItem: () => {
        throw new Error('closed')
      },
      setItem: () => {
        throw new Error('full')
      },
    }
    expect(hold(rec, today, refusing).holds()).toEqual(hold(rec, today, null).holds())
  })

  it('counts a day the app was not opened like any other: the run goes on through days with no check-in', () => {
    const closed = recordOf(3, { days: 80, effect: 2, share: 0.35, gap: [50, 56] })
    const asked: string[] = []
    // The stress pair at a pattern on every day from 2026-08-01 to today, whatever the record holds.
    const on = (_all: readonly CheckIn[], day: string): boolean[] => {
      asked.push(day)
      return Array.from({ length: 16 }, (_, i) => i === 8 && day >= '2026-08-01')
    }
    const job = startHold(closed, '2026-09-18', { storage: null, build: 'b1', on, first: Infinity })
    for (const d of days('2026-08-20', 6)) expect(asked).toContain(d)
    expect(job.holds()?.get('stress.high')).toEqual({ kind: 'held', k: 49, since: '2026-08-01' })
    expect(job.holds()?.get('mood.high')).toEqual({ kind: 'none' })
  })
})

describe('worked out without holding the screen', () => {
  const rec = recordOf(7, { days: 60, effect: 2, share: 0.35 })
  const today = '2026-08-29'

  it('works out a first slice at once and the rest a slice at a time, about 40 milliseconds each; no holds until every day is known', () => {
    let now = 0
    const asked: string[] = []
    const inner = standIn(asked)
    // Each day takes 15 milliseconds, so a slice of 40 works out three.
    const on = (all: readonly CheckIn[], day: string): boolean[] => {
      now += 15
      return inner(all, day)
    }
    const job = startHold(rec, today, { storage: null, build: 'b1', on, clock: () => now })
    expect(asked).toHaveLength(3)
    expect(job.finished).toBe(false)
    expect(job.holds()).toBeNull()
    expect(job.step(40)).toBe(false)
    expect(asked).toHaveLength(6)
    let slices = 2
    while (!job.step(40)) slices++
    expect(slices).toBeGreaterThan(10)
    expect([...(job.holds() ?? [])]).toEqual([...(hold(rec, today, null).holds() ?? [])])
  })

  it('is finished at once where every day is kept', () => {
    const kv = memory()
    hold(rec, today, kv)
    let now = 0
    const job = startHold(rec, today, { storage: kv, build: 'b1', on: standIn([]), clock: () => (now += 15) })
    expect(job.finished).toBe(true)
    expect(job.holds()).not.toBeNull()
  })

  it('keeps what a stopped working-out had found, for the next look to go on from', () => {
    const kv = memory()
    let now = 0
    const job = startHold(rec, today, { storage: kv, build: 'b1', on: standIn([]), clock: () => (now += 15), first: 300 })
    expect(job.finished).toBe(false)
    job.save()
    const done = Object.keys(keptDays(kv)).length
    expect(done).toBeGreaterThan(5)
    const asked: string[] = []
    hold(rec, today, kv, asked)
    expect(asked).toHaveLength(days(addDays(firstDay(rec), 1), 59).length - done)
  })
})

describe('under the comparisons’ guard', () => {
  beforeEach(() => resetComparisonFaults())

  it('ends with no holds when the working-out throws, keeps the failure for the Worker’s report, and keeps nothing', () => {
    const kv = memory()
    const on = (): boolean[] => {
      throw new RangeError('no')
    }
    const job = startHold(recordOf(9, { days: 40, effect: 2, share: 0.3 }), '2026-08-09', { storage: kv, build: 'b1', on })
    expect(job.finished).toBe(true)
    expect(job.holds()).toBeNull()
    expect(comparisonFaults()).toEqual({ count: 1, first: '2026-08-09', last: '2026-08-09', name: 'RangeError' })
    expect(kv.getItem(HELD_KEY)).toBeNull()
    resetComparisonFaults()
  })
})

// ---- A day's answers are comesBefore's own -------------------------------------------------------------------------

/**
 * beforeDays.test.ts's record of ninety days to 2026-09-30, made the same way: the stress pair's difference is past
 * chance, and its own interval still reaches above nothing.
 */
function apartRecord(): CheckIn[] {
  const BEST = [3, 12, 20, 29, 37, 46, 54, 65, 78]
  const NAPS = [1, 3, 12, 20, 29, 37, 46, 54, 65, 8, 17, 26, 35, 44, 53, 62, 71, 86]
  const STRESSED = [2, 3, 5, 9, 16, 17, 19, 23, 30, 31, 33, 37]
  const good: Partial<Record<ReadingId, Position>> = { mood: 5, energy: 5, focus: 5, stress: 1, overwhelm: 1, irritation: 1 }
  const at = (block: CheckIn['block'], over: Partial<Record<ReadingId, Position>>) => ({ ...Object.fromEntries(blockReadings(block).map((id) => [id, 3])), ...over }) as Partial<Record<ReadingId, Position>>
  const out: CheckIn[] = []
  for (let back = 90; back >= 1; back--) {
    const day = addDays('2026-09-30', -back)
    const best = BEST.includes(back)
    const morning: Partial<Record<ReadingId, Position>> = best ? good : { ...(NAPS.includes(back + 1) ? { mood: 4, energy: 4 } : {}), ...(STRESSED.includes(back + 1) ? { mood: 2, energy: 2, focus: 2 } : {}) }
    out.push(ci(day, 'morning', at('morning', morning)), ci(day, 'evening', at('evening', best ? good : STRESSED.includes(back) ? { stress: 5 } : {})))
  }
  return out
}

/** The family's own call, before the interval rule: written apart, to show the probes below reach both of its branches. */
function familyPatterns(checkins: readonly CheckIn[], today: string): boolean[] {
  const compared: Compared[] = []
  for (const reading of EVENING_READINGS)
    for (const level of ['high', 'low'] as const) {
      const points = eveningPoints(checkins, today, (c) => (level === 'high' ? (c.answers[reading] as number) >= 4 : (c.answers[reading] as number) <= 2), (c) => c.answers[reading] !== undefined)
      compared.push(likeForLike(points, { id: `before.${reading}.${level}`, worth: WORTH_POINTS }).compared as Compared)
    }
  return standings(compared).map((s) => s.standing === 'pattern')
}

describe('a day’s sixteen answers are comesBefore’s own', () => {
  interface Probe {
    rec: CheckIn[]
    day: string
    opts: { min?: number; resamples?: number }
  }
  const probes: Probe[] = []
  const seen = { pattern: 0, ruled: 0, short: 0, lead: 0 }
  const mismatches: string[] = []

  beforeAll(() => {
    const shapes: [number, Shape][] = [
      [1, { days: 70, effect: 2, share: 0.35 }],
      [2, { days: 70, effect: 1, share: 0.4 }],
      [4, { days: 60, effect: 1, share: 0.3, skip: 0.15 }],
      [6, { days: 80, effect: 0, share: 0.35 }],
      [8, { days: 45, effect: 2, share: 0.25 }],
    ]
    for (const [seed, shape] of shapes) {
      const rec = recordOf(seed, shape)
      for (let d = 24; d < shape.days; d += 6) probes.push({ rec, day: addDays('2026-07-01', d), opts: { resamples: 200 } })
    }
    // A short record whose stressed evenings are fewer than twelve: under a floor of twelve a side, the family's pattern is too few.
    const short = recordOf(8, { days: 45, effect: 2, share: 0.25 })
    for (const d of [30, 36, 44]) probes.push({ rec: short, day: addDays('2026-07-01', d), opts: { min: 12, resamples: 200 } })
    // A pattern by the family's call whose own interval reaches above nothing, which the interval rule makes a lead.
    probes.push({ rec: apartRecord(), day: '2026-09-30', opts: {} })
    // And the app's own numbers, twice.
    probes.push({ rec: recordOf(1, { days: 70, effect: 2, share: 0.35 }), day: '2026-09-08', opts: {} })
    probes.push({ rec: recordOf(2, { days: 70, effect: 1, share: 0.4 }), day: '2026-09-02', opts: {} })
    for (const { rec, day, opts } of probes) {
      const own = comesBefore(rec, day, opts)
      const byId = new Map(own.map((p) => [`${p.reading}.${p.level}`, p]))
      const fast = patternsOn(rec, day, opts)
      const family = familyPatterns(rec, day)
      EVENING_READINGS.flatMap((r) => [`${r}.high`, `${r}.low`]).forEach((id, i) => {
        const p = byId.get(id)
        if (!p) throw new Error(`no pair ${id}`)
        if ((p.standing === 'pattern') !== fast[i]) mismatches.push(`${day} ${id}: comesBefore ${p.standing}, patternsOn ${fast[i]}`)
        if (p.standing === 'pattern') seen.pattern++
        if (p.standing === 'lead') seen.lead++
        if (family[i] && p.standing !== 'pattern' && p.enough) seen.ruled++
        if (family[i] && !p.enough) seen.short++
      })
    }
  }, 240_000)

  it('calls a pair a steady pattern on a day exactly where comesBefore does, on many days of many records', () => {
    expect(probes.length).toBeGreaterThan(30)
    expect(mismatches).toEqual([])
    // Probes that could say no: patterns, leads, a family's pattern the interval rule turned into a lead, and one too few under the floor.
    expect(seen.pattern).toBeGreaterThan(5)
    expect(seen.lead).toBeGreaterThan(5)
    expect(seen.ruled).toBeGreaterThan(0)
    expect(seen.short).toBeGreaterThan(0)
  })

  it('gives today’s answers to the hold as comesBefore gives them, the stress pair among them', () => {
    const rec = recordOf(1, { days: 70, effect: 2, share: 0.35 })
    const job = startHold(rec, '2026-09-08', { storage: null, build: 'b1', first: Infinity, on: (all, day) => (day === '2026-09-08' ? patternsOn(all, day) : Array.from({ length: 16 }, () => false)) })
    const own = comesBefore(rec, '2026-09-08')
    const stress = own.find((p) => p.reading === 'stress' && p.level === 'high')
    expect(stress?.standing).toBe('pattern')
    for (const p of own) expect(job.holds()?.get(`${p.reading}.${p.level}`)?.kind).toBe(p.standing === 'pattern' ? 'notYet' : 'none')
  })
})
